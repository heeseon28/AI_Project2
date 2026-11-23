# 메뉴 분류 CNN 학습 (MODEL_SPEC 3~7절)

`train.py` 하나로 학습·평가·ONNX 변환을 한다. 8GB 맥에서는 한 epoch에 수 시간이 걸려서 **Google Colab GPU(T4)** 에서 돌린다.

## 1. 데이터 묶기 (로컬, 한 번)

```bash
cd ml/data
python prepare_dataset.py aihub-extract --zip <kfood.zip>   # 처음 한 번
python prepare_dataset.py aihub --src raw/aihub
python prepare_dataset.py kentech --photos kentech_photos/instagram_screenshots/food_only_500 --labels kentech_labels.csv  # 라벨링한 만큼
python prepare_dataset.py pack                              # → menu_cls_256.zip
```

`menu_cls_256.zip`을 Google Drive `내 드라이브/AI_Project2/`에 올린다. 원본·인스타 사진이 들어 있으니 **팀 밖으로 공유하지 않는다.**

## 2. Colab에서 학습

런타임 → 런타임 유형 변경 → **T4 GPU**. 셀마다 하나씩:

```python
from google.colab import drive; drive.mount('/content/drive')
D = '/content/drive/MyDrive/AI_Project2'
!git clone -q https://github.com/heeseon28/AI_Project2.git
!unzip -q {D}/menu_cls_256.zip -d /content
!pip install -q onnx onnxruntime
%cd /content/AI_Project2/ml/menu_cnn
```

```python
# 빠른 점검 (1~2분): 에러 없이 끝나는지만 본다
!python train.py train --data /content/menu_cls --run /content/smoke --epochs1 1 --epochs2 1 --epochs3 1 --max-batches 5
```

```python
# 본 학습: 1단계 5 + 2단계 최대 20 + (학식 라벨이 있으면) 3단계 최대 10 epoch. 결과는 Drive에 저장돼 런타임이 끊겨도 남는다
!python train.py train --data /content/menu_cls --run {D}/runs/mnv3
!python train.py test --data /content/menu_cls --ckpt {D}/runs/mnv3/best.pt
!python train.py export --data /content/menu_cls --ckpt {D}/runs/mnv3/best.pt --out {D}/runs/mnv3/menu_cnn.onnx
```

```python
# 비교 모델 (보고서용 표)
!python train.py train --model resnet18 --data /content/menu_cls --run {D}/runs/resnet18
!python train.py test --model resnet18 --data /content/menu_cls --ckpt {D}/runs/resnet18/best.pt
```

## 3. 결과물

| 파일 | 쓰임 |
|---|---|
| `runs/mnv3/train_log.json` | 단계별 val macro-F1 |
| `runs/mnv3/test_report.json` | AI Hub·학식 test top-1/top-3/macro-F1, 혼동 행렬 |
| `runs/mnv3/menu_cnn.onnx` + `menu_cnn.labels.json` | 웹 `web/public/models/`에 복사 (Task 3). export가 PyTorch와 출력 차이 ≤ 1e-4를 확인한다 |

`threshold`(확인 필요 기준 τ)는 학식 val로 정한 뒤 `export --threshold`로 넣는다. 지금 기본값 0.5는 임시값이다.
