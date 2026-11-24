# 메뉴 분류 CNN 학습 (MODEL_SPEC 3~7절)

`train.py` 하나로 학습·평가·ONNX 변환을 한다. **NVIDIA GPU가 있는 PC**에서 돌린다 (RTX 4060 Ti 8GB에서 1·2단계 약 30분). GPU PC가 없으면 Google Colab T4. 8GB 맥은 swap 때문에 한 epoch에 수 시간이 걸려 쓰지 않는다.

## 0. 로컬 GPU PC (Windows 기준, 처음 한 번)

```bash
cd ml
py -3.13 -m venv .venv
.venv/Scripts/python -m pip install torch torchvision --index-url https://download.pytorch.org/whl/cu128   # CUDA 빌드
.venv/Scripts/python -m pip install onnx onnxruntime numpy pillow
.venv/Scripts/python -c "import torch; print(torch.cuda.is_available())"                                 # True여야 함
```

- Windows 콘솔은 기본이 cp949라 한글 로그가 깨진다 → 명령 앞에 `PYTHONIOENCODING=utf-8` (PowerShell은 `$env:PYTHONIOENCODING='utf-8'`).
- 데이터는 1절대로 만든 뒤 학습용 256px 복사본을 푼다: `menu_cls_256.zip` → `ml/data/raw/menu_cls_256/` (gitignore 안). 원본 크기로 학습하면 이미지 읽기가 병목이다.
- Windows는 개발자 모드가 아니면 심볼릭 링크를 못 만든다 → `prepare_dataset.py aihub`가 자동으로 하드링크를 쓴다.

```bash
cd ml/menu_cnn
P=../.venv/Scripts/python; D=../data/raw/menu_cls_256/menu_cls
$P train.py train --data $D --run runs/mnv3 --workers 8          # CPU 16코어 기준. 기본 4, Colab은 2
$P train.py test --data $D --ckpt runs/mnv3/best.pt
$P train.py export --data $D --ckpt runs/mnv3/best.pt --out runs/mnv3/menu_cnn.onnx
$P train.py train --model resnet18 --data $D --run runs/resnet18 --workers 8   # 비교 모델
```

학식 라벨이 늘면 1·2단계를 다시 할 필요 없이 3단계만 돌린다 (학식 영역 수만큼만 돌아서 몇 분):

```bash
(cd ../data && $P prepare_dataset.py kentech --photos kentech_photos/instagram_screenshots/food_only_500 --labels labels_1.csv labels_2.csv labels_3.csv labels_4.csv)
rm -rf $D/kentech && cp -r ../data/menu_cls/kentech $D/          # 잘린 학식 영역을 학습 데이터 폴더로
$P train.py train --data $D --run runs/mnv3 --resume runs/mnv3/stage2.pt --workers 8
```

## 1. 데이터 묶기 (로컬, 한 번)

```bash
cd ml/data
python prepare_dataset.py aihub-extract --zip <kfood.zip>   # 처음 한 번
python prepare_dataset.py aihub --src raw/aihub
python prepare_dataset.py kentech --photos kentech_photos/instagram_screenshots/food_only_500 --labels kentech_labels.csv  # 라벨링한 만큼
python prepare_dataset.py pack                              # → menu_cls_256.zip
```

`menu_cls_256.zip`을 Google Drive `내 드라이브/AI_Project2/`에 올린다. 원본·인스타 사진이 들어 있으니 **팀 밖으로 공유하지 않는다.**

## 2. (GPU PC가 없을 때) Colab에서 학습

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
!python train.py train --data /content/menu_cls --run {D}/runs/mnv3 --workers 2
!python train.py test --data /content/menu_cls --ckpt {D}/runs/mnv3/best.pt
!python train.py export --data /content/menu_cls --ckpt {D}/runs/mnv3/best.pt --out {D}/runs/mnv3/menu_cnn.onnx
```

```python
# 비교 모델 (보고서용 표)
!python train.py train --model resnet18 --data /content/menu_cls --run {D}/runs/resnet18 --workers 2
!python train.py test --model resnet18 --data /content/menu_cls --ckpt {D}/runs/resnet18/best.pt
```

## 3. 결과물

| 파일 | 쓰임 |
|---|---|
| `runs/mnv3/train_log.json` | 단계별 val macro-F1 |
| `runs/mnv3/test_report.json` | AI Hub·학식 test top-1/top-3/macro-F1, 혼동 행렬 |
| `runs/mnv3/menu_cnn.onnx` + `menu_cnn.labels.json` | 웹 `web/public/models/`에 복사 (Task 3). export가 PyTorch와 출력 차이 ≤ 1e-4를 확인한다 |

`threshold`(확인 필요 기준 τ)는 학식 val로 정한 뒤 `export --threshold`로 넣는다. 지금 기본값 0.5는 임시값이다.

`runs/`는 Git에 올라가지 않는다. 숫자 결과는 `PLAN.md` "Task 2 결과"에 옮겨 적는다.

## 4. 지금까지 결과 (2026-11-24, 1·2단계 = AI Hub만)

| 모델 | AI Hub test top-1 | top-3 | macro-F1 | 파라미터 | CPU 6영역 |
|---|---|---|---|---|---|
| MobileNetV3-Large | 85.8% | 95.1% | 0.858 | 4.29M | 47ms |
| ResNet-18 | 85.4% | 94.5% | 0.853 | 11.21M | 93ms |

ONNX(`menu_cnn.onnx` 16.3MB)는 PyTorch와 최대 오차 1.05e-5, top-1 일치. 자세한 표와 자주 틀리는 메뉴는 `PLAN.md` Task 2 결과.

데이터 로더 처리량 (RTX 4060 Ti PC, CPU 16코어, 256px): workers 4 → 1,473장/s, 8 → 2,172장/s, 12 → 2,758장/s. 위 결과는 workers 4로 학습했고 GPU 사용률이 45~70%였다.
