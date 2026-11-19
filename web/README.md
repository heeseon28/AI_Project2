# 학식 코치 (web)

Next.js 16 + Supabase + Cloudflare Workers(OpenNext). 기획은 `../PRD.md`, 계획은 `../SETUP_PLAN.md`.

## 처음 세팅
1. `npm install`
2. Supabase 프로젝트 생성 → SQL Editor에 `supabase/migrations/0001_init.sql` 실행
3. `.env.example` → `.env.local`, `.dev.vars.example` → `.dev.vars` 복사 후 값 채우기
4. Supabase > Authentication > URL Configuration에 `http://localhost:3000/auth/callback`과 배포 주소의 `/auth/callback` 추가
5. 메뉴 데이터: `menus` 테이블에 CSV 임포트 (또는 `/admin/menu`에서 입력)
6. 관리자 지정: `update profiles set role = 'admin' where id = '<내 uuid>';`

## 명령
| 명령 | 용도 |
|---|---|
| `npm run dev` | 로컬 개발 (http://localhost:3000) |
| `npm test` | `lib/` 단위 테스트 |
| `npm run preview` | Cloudflare Workers 환경으로 로컬 실행 |
| `npm run deploy` | Cloudflare 배포 (먼저 `npx wrangler login`, `npx wrangler secret put GEMINI_API_KEY`) |
| `node --env-file=.dev.vars scripts/eval-recognition.ts` | 메뉴 인식 정확도 측정 (`eval/` 참고) |

## 구조
- `app/` 화면: 홈 `/`, 기록 `/log/new`, 분석 `/dashboard`, 내 정보 `/profile`, 식단표 관리 `/admin/menu`
- `app/api/recognize` 식판 사진 → Gemini → 칸별 메뉴 (오늘 식단표 안에서만 고름)
- `lib/` 순수 로직: 목표치 `nutrition.ts`, 예측 `forecast.ts`·`lstm.ts`, 추천 `recommend.ts`, 데이터 `week.ts`
- `public/models/` LSTM ONNX (만드는 곳: `../ml/deficit_lstm/train.py`). 없으면 최근 평균으로 대신 예측한다.

## 주의
- `next.config.ts`의 `cacheComponents`는 꺼 둔다. 켜면 Cloudflare에서 페이지가 크래시한다.
- onnxruntime-web은 CDN에서 불러온다 (번들에 넣으면 wasm이 Workers 25MB 자산 한도를 넘는다).
