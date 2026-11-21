# AI_Project2 — 학식 코치

KENTECH 인공지능 기초 기말 프로젝트. 학식 식판 사진을 **팀이 fine-tuning한 CNN**이 칸별로 인식하고, 영양 분석과 다음 끼니 메뉴를 추천하는 웹 서비스.

| 경로 | 내용 |
|---|---|
| [PRD.md](PRD.md) | 서비스 요구사항, 사용 흐름, 인수 기준 |
| [MODEL_SPEC.md](MODEL_SPEC.md) | 데이터셋, 모델, 학습·평가, 입출력, 배포 계획 |
| [PLAN.md](PLAN.md) | Task 1~4 전체 일정과 역할 |
| [web/](web/) | Next.js 앱 (Vercel 배포). 실행 방법은 [web/README.md](web/README.md) |
| [ml/data/](ml/data/) | 데이터 준비: 영양 DB 수집, 메뉴 시드, 학습 데이터셋 분할·crop |
| [ml/deficit_lstm/](ml/deficit_lstm/) | (선택 기능) 부족분 예측 LSTM |
