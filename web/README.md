# 학식 코치 (web)

Next.js 16 + Tailwind + Supabase, Vercel 배포. 기획은 `../PRD.md`, 모델은 `../MODEL_SPEC.md`, 전체 일정은 `../PLAN.md`.

## 로컬 실행
1. `npm install`
2. `npm run dev` → http://localhost:3000
   - Supabase 없이도 메인과 인식 화면은 열린다 (로그인·저장·분석만 비활성).

## Supabase 연결 (Task 3, 미리 해도 됨)
1. Supabase 프로젝트 생성 → SQL Editor에 `supabase/migrations/0001_init.sql` 실행
2. `.env.example` → `.env.local` 복사 후 값 채우기
3. Authentication > URL Configuration에 `http://localhost:3000/auth/callback`과 배포 주소의 `/auth/callback` 추가
4. 메뉴 데이터: `menus` 테이블에 `../ml/data/menus_seed.csv` 임포트
5. 관리자 지정: `update profiles set role = 'admin' where id = '<내 uuid>';`

## Vercel 배포
1. vercel.com에서 GitHub 계정으로 가입 → Add New → Project → `AI_Project2` 선택
2. **Root Directory: `web`** (Framework: Next.js 자동 인식)
3. Environment Variables에 `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase 연결 후)
4. 이후 `main`에 push하면 자동 배포

## 명령
| 명령 | 용도 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 배포와 같은 빌드 확인 |
| `npm test` | `lib/` 단위 테스트 |
| `npm run lint` | ESLint |

## 구조
- `app/` 메인 `/`, 인식 `/log/new`, 분석 `/dashboard`, 내 정보 `/profile`, 로그인 `/login`, 식단표 관리 `/admin/menu`
- `lib/tray.ts` 식판 사진을 `public/models/tray_layout.json` 칸대로 자르기 (CNN 입력 전처리의 첫 단계)
- `lib/` 목표치 `nutrition.ts`, 예측 `forecast.ts`·`lstm.ts`(선택 기능), 추천 `recommend.ts`, 데이터 `week.ts`
- `public/models/` 모델 파일 (`menu_cnn.onnx`는 Task 2에서 추가)
- onnxruntime-web은 CDN에서 불러온다 (wasm이 커서 번들에 넣지 않음).
