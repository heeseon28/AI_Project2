# 세팅·뼈대·AI 연동 계획

PRD.md의 MVP(M1~M9)를 3주 안에 만들기 위한 첫 주 작업 계획. 아직 코드는 없다.

## 0. 기술 선택 (확정)
| 항목 | 선택 | 이유 |
|---|---|---|
| 프레임워크 | Next.js (App Router, TypeScript) | PRD 확정 |
| 배포 | Cloudflare Workers + `@opennextjs/cloudflare` | `npm create cloudflare@latest -- --framework=next`가 어댑터까지 세팅해 준다 |
| DB·인증 | Supabase + `@supabase/ssr` | 쿠키 세션을 서버 컴포넌트에서 바로 쓴다 |
| 스타일 | Tailwind (create-next-app 기본) | 추가 UI 라이브러리 없이 시작 |
| 차트 | Recharts | 레이더·막대 차트 둘 다 지원 |
| 비전 API | `@google/genai` (Gemini Flash) | fetch 기반이라 Workers에서 돈다 |
| 브라우저 추론 | `onnxruntime-web` | LSTM·감정 모델 실행 |
| 테스트 | Vitest (`lib/` 순수 함수만) | 목표치·추천 점수 계산 검증 |

모델 이름은 코드에 박지 않고 `GEMINI_MODEL` 환경변수로 둔다 (세팅 당일 최신 Flash 모델명과 무료 한도 확인).

## 1. PRD 대비 단순화
- **식판 사진은 저장하지 않는다.** 인식 후 바로 버린다. Supabase Storage와 "30일 후 삭제" 작업이 통째로 빠지고, 개인정보 부담도 줄어든다. PRD 9절 해당 줄 수정 필요.
- **`/api/recommend` 라우트는 만들지 않는다.** 추천 점수는 `lib/recommend.ts` 순수 함수로 두고 서버 컴포넌트에서 바로 호출한다.

## 2. 폴더 구조 (Next 앱은 `web/` 아래, 학습 코드는 `ml/`)
```
app/
  layout.tsx                 하단 탭 내비 + "추정치·의료 상담 대체 아님" 푸터 (M9)
  login/page.tsx             매직링크 로그인 (M1)
  auth/callback/route.ts     Supabase 코드 → 세션 교환
  page.tsx                   홈: 오늘 기록 + 추천 카드 (M7)
  log/new/page.tsx           촬영 → 인식 결과 확인·수정 → 저장 (M2, M4)
  dashboard/page.tsx         주간 달성률, 레이더, 부족분 예측 (M5, M6)
  profile/page.tsx           목표 모드·활동량 (인바디는 1차 확장)
  admin/menu/page.tsx        주간 식단표 입력 (M8)
  api/recognize/route.ts     식판 이미지 → Gemini → 칸별 메뉴 JSON
lib/
  supabase/client.ts         브라우저용 클라이언트
  supabase/server.ts         서버 컴포넌트·라우트용 클라이언트
  gemini.ts                  Gemini 호출 + 응답 검증
  nutrition.ts               목표치 계산, 달성률 (Katch-McArdle, 안전장치 하한)
  recommend.ts               부족분 채움 점수
  onnx.ts                    ONNX 세션 로드·캐시 (클라이언트 전용)
proxy.ts                     세션 갱신 (Next 16에서 middleware → proxy), 미로그인 시 /login, /admin은 role 확인
supabase/migrations/0001_init.sql
public/models/               deficit_lstm.onnx, deficit_norm.json, sentiment.onnx, sentiment_vocab.json
ml/                          Python (PyTorch) 학습·변환 코드, 웹 앱과 분리
  deficit_lstm/  synth.py → train.py → export.py
  sentiment/     train.py → export.py
```
1차 확장 때 `api/inbody/route.ts`, `reviews/`, `admin/reviews/`를 추가한다.

## 3. 세팅 순서 (1주차 초반, B 담당 중심)
1. `git init`, GitHub 비공개 저장소 생성, 4명 초대. `.env*`, `.dev.vars`, `ml/data/`는 `.gitignore`
2. `npm create cloudflare@latest -- haksik --framework=next` (TypeScript, Tailwind, ESLint, App Router 선택)
3. **첫날 바로 빈 페이지를 Cloudflare에 배포한다.** 어댑터 문제는 일찍 발견할수록 싸다.
4. 의존성 추가: `@supabase/supabase-js @supabase/ssr @google/genai onnxruntime-web recharts zod`, 개발용 `vitest`
5. Supabase 프로젝트 생성 → `0001_init.sql` 실행 (PRD 7절 테이블 + RLS + `profiles.role`)
6. 환경변수
   - 공개: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - 비밀: `GEMINI_API_KEY`, `GEMINI_MODEL` → 로컬은 `.dev.vars`, 배포는 `wrangler secret put`
7. 식약처 DB에서 학식 메뉴 약 100개를 CSV로 정리 → Supabase 대시보드로 `menus`에 임포트

## 4. AI 연동

### 4-1. 메뉴 인식 (Gemini, 서버)
```
[브라우저] 사진 선택
  → canvas로 긴 변 1024px JPEG 축소 (토큰·업로드 크기 절약)
  → POST /api/recognize (FormData: image, meal)
[서버 라우트]
  1. 로그인 확인, 이미지 4MB·image/* 검사
  2. 오늘 해당 끼니의 weekly_menu 조회 → 메뉴 이름 목록
  3. Gemini 호출: 이미지 + "이 목록 중에서만 골라라"
     responseSchema: { items: [{ slot, menu_name(enum=오늘 목록 | "unknown"), confidence }] }
  4. zod로 응답 재검증 → menu_id와 영양값을 붙여 반환
[브라우저] 칸별 드롭다운으로 수정 + 1인분 비율 → meal_logs/meal_items 저장 (RLS)
```
- enum으로 오늘 메뉴만 허용하면 없는 메뉴를 지어내는 일이 구조적으로 막힌다.
- 무료 한도 보호: 사용자당 하루 인식 횟수를 `meal_logs` 개수로 세서 초과 시 429 응답.
- 실패하거나 `unknown`이면 수동 선택 화면으로 넘어간다 (인식 실패해도 기록은 가능).

### 4-2. 부족분 예측 LSTM (직접 학습, 브라우저)
- 입력: 최근 14일 × 5영양소(kcal, 탄, 단, 지, 나트륨)의 일별 합계, 기록 없는 날은 0과 결측 플래그
- 출력: 이번 주 남은 요일의 일별 예상 섭취량 → `목표 × 7 − (지금까지 + 예측)` = 부족분
- `ml/deficit_lstm`: synth.py(식단표 기반 합성 시계열 + 팀원 실제 기록) → train.py → `torch.onnx.export` + 정규화 평균·표준편차 JSON
- 기준선(최근 7일 평균 반복)과 MAE를 비교해서 보고서에 넣는다.
- 웹: 대시보드 클라이언트 컴포넌트가 Supabase에서 14일치를 읽고 `lib/onnx.ts`로 추론한다. 모델이 아직 없을 때는 기준선 값으로 화면을 먼저 만든다 (프론트가 AI 담당을 기다리지 않게).

### 4-3. 리뷰 감정 분석 RNN (1차 확장, 직접 학습, 브라우저)
- **음절 단위 토큰화**로 한다. 형태소 분석기를 브라우저에서 돌릴 필요가 없고, Python과 JS가 같은 `vocab.json`만 공유하면 된다.
- NSMC → Embedding + LSTM → ONNX. 리뷰 작성 시 브라우저에서 추론해 `reviews.sentiment`에 같이 저장한다.
  - shortcut: 클라이언트가 감정 값을 조작할 수 있다. 과제 시연용으로는 충분하고, 실서비스라면 서버에서 추론해야 한다.

### 4-4. 추천 점수 (`lib/recommend.ts`)
```
score(menu) = Σ_영양소 min(메뉴 함량, 남은 부족분) / 목표   (단백질 가중치 ↑)
            − 나트륨이 남은 허용량을 넘으면 감점
```
이번 주 남은 끼니의 `weekly_menu`에서 상위 3개를 추천 카드로 보여 준다. 문구 예: "B코너 제육볶음을 고르면 부족분의 30%를 채울 수 있어요."

## 5. 1주차 분담 (PRD 10절과 같음)
| 담당 | 1주차 결과물 |
|---|---|
| A 프론트 | 레이아웃·내비, `log/new` 촬영·확인 화면 (목업 데이터로) |
| B 백엔드 | 3절 세팅 전체, 로그인, 마이그레이션, 메뉴 데이터 임포트, 첫 배포 |
| C LSTM | 합성 데이터 생성기, 1차 학습, ONNX 내보내기 확인 |
| D 비전 | `/api/recognize` + 프롬프트, 실제 학식 사진 20장으로 정확도 측정 |

화면(A)과 API(B, D) 사이 계약은 `lib/types.ts`의 타입 하나(`RecognizeResponse`, `MealItem`)로 첫날 맞춘다.

## 6. 검증
- `npm run dev`로 로그인 → 촬영 → 저장 → 대시보드 흐름을 한 번에 통과
- `npx vitest`: `nutrition.ts`(BMR 하한, 감량 500kcal 제한), `recommend.ts`(부족분이 0이면 점수 0)
- `npm run preview`(wrangler 로컬)로 Workers 환경에서 `/api/recognize`와 ONNX 로딩 확인 후 배포
- 다른 계정으로 로그인해 남의 `meal_logs`가 안 보이는지 RLS 확인
