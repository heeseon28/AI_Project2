# AI_Project2 — 학식 코치

KENTECH 인공지능 기초 과제 2. 학식 사진으로 메뉴·영양을 인식하고, 기록을 분석해 다음 끼니 메뉴를 추천하는 웹 서비스.

| 경로 | 내용 |
|---|---|
| [PRD.md](PRD.md) | 기획 (범위, 모델, 데이터, 안전장치, 일정) |
| [SETUP_PLAN.md](SETUP_PLAN.md) | 세팅·뼈대·AI 연동 계획 |
| [web/](web/) | Next.js 앱 (Supabase, Cloudflare Workers). 실행 방법은 [web/README.md](web/README.md) |
| [ml/](ml/) | PyTorch 학습 코드 (`deficit_lstm/train.py` → `web/public/models/`) |
