# 데이터 준비

| 파일 | 역할 |
|---|---|
| `menu_classes.csv` | **클래스 목록의 유일한 원본.** class_id, 메뉴명, AI Hub 폴더명, 영양 DB 이름 덮어쓰기, 1인분 g 덮어쓰기 |
| `fetch_nutrition.py` | 식약처 음식 영양성분 DB(공공데이터포털 15100070) → `raw/food_nutrition.csv` |
| `build_menu_seed.py` | 메뉴별 1인분 영양 → `menus_seed.csv` (Supabase `menus` 임포트용), `menus_seed_sources.csv` (근거) |
| `prepare_dataset.py` | AI Hub 이미지 → `menu_cls/aihub/{train,val,test}`, 식판 사진 → `menu_cls/kentech/{train,val,test}` |
| `kentech_labels.csv` | 학식 사진 라벨 (칸 이름은 `web/public/models/tray_layout.json`과 같게) |
| `test_prepare_dataset.py` | 가짜 이미지로 `prepare_dataset.py` 자체 점검 |

```bash
pip install -r ../requirements.txt
python fetch_nutrition.py          # 1분
python build_menu_seed.py
python test_prepare_dataset.py     # ok가 나와야 함
python prepare_dataset.py aihub --src ~/Downloads/aihub_kfood --per-class 300
python prepare_dataset.py kentech --photos kentech_photos --labels kentech_labels.csv
```

메뉴를 추가하려면 `menu_classes.csv`에 한 줄 넣고(class_id는 이어서) 위 스크립트를 다시 돌린다.
