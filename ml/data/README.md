# 데이터 준비

| 파일 | 역할 |
|---|---|
| `menu_classes.csv` | **클래스 목록의 유일한 원본.** class_id, 메뉴명, AI Hub 폴더명, 영양 DB 이름 덮어쓰기, 1인분 g 덮어쓰기 |
| `fetch_nutrition.py` | 식약처 음식 영양성분 DB(공공데이터포털 15100070) → `raw/food_nutrition.csv` |
| `build_menu_seed.py` | 메뉴별 1인분 영양 → `menus_seed.csv` (Supabase `menus` 임포트용), `menus_seed_sources.csv` (근거) |
| `prepare_dataset.py` | AI Hub ZIP에서 67개 클래스만 풀기, AI Hub → `menu_cls/aihub/{train,val,test}`, 학식 사진 → `menu_cls/kentech/{train,val,test}`, Colab용 ZIP 묶기 |
| `label_tool.py` + `label_tool.html` | 학식 사진 라벨링 (로컬 웹페이지). 음식마다 네모 + 클래스 → `kentech_labels.csv` |
| `kentech_labels.csv` | 학식 사진 라벨 `file,group,x,y,w,h,menu` (좌표는 0~1 비율, group이 같은 사진은 같은 분할) |
| `test_prepare_dataset.py` | 가짜 이미지로 `prepare_dataset.py` 자체 점검 |

```bash
pip install -r ../requirements.txt
python fetch_nutrition.py          # 1분
python build_menu_seed.py
python test_prepare_dataset.py     # ok가 나와야 함
python prepare_dataset.py aihub-extract --zip ~/Downloads/한국\ 음식\ 이미지/kfood.zip   # 67개 클래스 67,086장 → raw/aihub (10분)
python prepare_dataset.py aihub --src raw/aihub                  # 80/10/10 분할 (심볼릭 링크)

# 학식 사진 라벨링 → 영역 이미지
python label_tool.py --photos kentech_photos/instagram_screenshots/food_only_500   # http://127.0.0.1:8765
python prepare_dataset.py kentech --photos kentech_photos/instagram_screenshots/food_only_500 --labels kentech_labels.csv

python prepare_dataset.py pack                                   # Colab 업로드용 menu_cls_256.zip (학습은 ../menu_cnn/README.md)
```

메뉴를 추가하려면 `menu_classes.csv`에 한 줄 넣고(class_id는 이어서) 위 스크립트를 다시 돌린다.
