"""학식 메뉴 분류 CNN 학습·평가·ONNX 변환. MODEL_SPEC 3~7절.

    python train.py train  [--model mobilenet|resnet18] [--run runs/mnv3]   # 3단계 학습 (학식 데이터 없으면 2단계까지)
    python train.py test   --ckpt runs/mnv3/best.pt                          # AI Hub·학식 test 평가
    python train.py export --ckpt runs/mnv3/best.pt                          # ONNX 변환 + PyTorch와 출력 비교

데이터는 ../data/prepare_dataset.py 가 만든 menu_cls/{aihub,kentech}/{train,val,test}/<class_id>_<메뉴>/ 를 쓴다.
빠른 점검: --max-batches 5 를 붙이면 epoch마다 몇 배치만 돈다.
8GB 맥에서는 한 epoch에 수 시간이 걸린다 → Colab GPU에서 돌린다 (README.md).
"""
import argparse
import json
import random
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torch import nn
from torch.utils.data import ConcatDataset, DataLoader
from torchvision import datasets, models, transforms

HERE = Path(__file__).parent
DATA = HERE.parent / "data" / "menu_cls"
SIZE = 224
PAD = (124, 116, 104)  # MODEL_SPEC 6.1 여백색 (ImageNet 평균에 가까운 RGB)
MEAN, STD = [0.485, 0.456, 0.406], [0.229, 0.224, 0.225]


class Letterbox:
    """긴 변을 224로 맞추고 비율을 유지해 224×224 가운데에 둔다. 남는 1픽셀은 오른쪽·아래. 웹 lib/tray.ts와 같은 규칙."""

    def __call__(self, img: Image.Image) -> Image.Image:
        w, h = img.size
        s = SIZE / max(w, h)
        nw, nh = max(1, round(w * s)), max(1, round(h * s))
        canvas = Image.new("RGB", (SIZE, SIZE), PAD)
        canvas.paste(img.resize((nw, nh), Image.BILINEAR), ((SIZE - nw) // 2, (SIZE - nh) // 2))
        return canvas


EVAL_TF = transforms.Compose([Letterbox(), transforms.ToTensor(), transforms.Normalize(MEAN, STD)])
TRAIN_TF = transforms.Compose([
    transforms.RandomHorizontalFlip(),
    transforms.ColorJitter(0.3, 0.3, 0.3),
    transforms.RandomRotation(10, fill=PAD),
    Letterbox(), transforms.ToTensor(), transforms.Normalize(MEAN, STD),
])


class ClassId:
    """ImageFolder 인덱스(폴더명 정렬 순서) → class_id. 일부 클래스 폴더가 없어도 맞는다. (worker로 넘기려면 lambda 대신 클래스)"""

    def __init__(self, folders: list[str]):
        self.map = {i: int(c.split("_")[0]) for i, c in enumerate(folders)}

    def __call__(self, t: int) -> int:
        return self.map[t]


def labels() -> list[str]:
    return json.loads((DATA / "labels.json").read_text(encoding="utf-8"))


def folder(domain: str, split: str, tf):
    d = DATA / domain / split
    if not d.exists() or not any(d.iterdir()):
        return None
    ds = datasets.ImageFolder(d, tf)
    names = labels()
    # ImageFolder는 폴더명을 정렬해 인덱스를 붙인다. 없는 클래스가 있어도 class_id와 같게 맞춘다
    ds.target_transform = ClassId(ds.classes)
    assert all(names[int(c.split("_")[0])] == c.split("_", 1)[1] for c in ds.classes), "폴더명과 labels.json이 다름"
    return ds


def build(model_name: str, n: int) -> nn.Module:
    if model_name == "resnet18":
        m = models.resnet18(weights=models.ResNet18_Weights.IMAGENET1K_V1)
        m.fc = nn.Linear(m.fc.in_features, n)
    else:
        m = models.mobilenet_v3_large(weights=models.MobileNet_V3_Large_Weights.IMAGENET1K_V2)
        m.classifier[3] = nn.Linear(1280, n)
    return m


def head_params(m: nn.Module):
    return list((m.fc if hasattr(m, "fc") else m.classifier).parameters())


def device():
    return torch.device("cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu")


@torch.no_grad()
def evaluate(m, loader, n, dev, max_batches=None):
    """top-1, top-3, macro-F1(실제로 나온 클래스만), 혼동 행렬, 평균 loss."""
    m.eval()
    cm = torch.zeros(n, n, dtype=torch.long)
    top3 = total = 0
    loss_sum = 0.0
    for b, (x, y) in enumerate(loader):
        if max_batches and b >= max_batches:
            break
        logits = m(x.to(dev)).float().cpu()
        loss_sum += nn.functional.cross_entropy(logits, y, reduction="sum").item()
        top3 += (logits.topk(3, 1).indices == y[:, None]).any(1).sum().item()
        cm += torch.bincount(y * n + logits.argmax(1), minlength=n * n).view(n, n)
        total += len(y)
    tp = cm.diag().float()
    support = cm.sum(1)
    prec = tp / cm.sum(0).clamp(min=1)
    rec = tp / support.clamp(min=1)
    f1 = 2 * prec * rec / (prec + rec).clamp(min=1e-9)
    present = support > 0
    return {
        "top1": tp.sum().item() / max(total, 1),
        "top3": top3 / max(total, 1),
        "macro_f1": f1[present].mean().item() if present.any() else 0.0,
        "loss": loss_sum / max(total, 1),
        "n": total,
        "classes_evaluated": int(present.sum()),
        "confusion": cm.tolist(),
    }


def run_stage(name, m, opt, sched, train_dl, val_dl, epochs, patience, dev, n, out: Path, max_batches, freeze_backbone=False):
    crit = nn.CrossEntropyLoss(label_smoothing=0.1)
    best, best_loss, bad = -1.0, float("inf"), 0
    scaler = torch.amp.GradScaler(enabled=dev.type == "cuda")
    for ep in range(1, epochs + 1):
        m.train()
        if freeze_backbone:  # 1단계: BatchNorm 통계도 고정 (MODEL_SPEC 4)
            for mod in m.modules():
                if isinstance(mod, nn.BatchNorm2d):
                    mod.eval()
        t0 = time.time()
        for b, (x, y) in enumerate(train_dl):
            if max_batches and b >= max_batches:
                break
            with torch.autocast(dev.type, enabled=dev.type == "cuda"):
                loss = crit(m(x.to(dev)), y.to(dev))
            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.step(opt)
            scaler.update()
        if sched:
            sched.step()
        v = evaluate(m, val_dl, n, dev, max_batches)
        print(f"[{name}] epoch {ep}/{epochs} val top1 {v['top1']:.3f} top3 {v['top3']:.3f} macroF1 {v['macro_f1']:.3f} loss {v['loss']:.3f} ({time.time() - t0:.0f}s)", flush=True)
        if v["macro_f1"] > best or (v["macro_f1"] == best and v["loss"] < best_loss):
            best, best_loss, bad = v["macro_f1"], v["loss"], 0
            torch.save(m.state_dict(), out / f"{name}.pt")
        else:
            bad += 1
            if patience and bad >= patience:
                print(f"[{name}] {patience} epoch 연속 개선 없음 → 종료")
                break
    m.load_state_dict(torch.load(out / f"{name}.pt", map_location=dev))  # 다음 단계는 이 단계 최선 가중치에서 시작
    return best


def loader(ds, train, bs=64):
    g = torch.Generator().manual_seed(42)
    return DataLoader(ds, bs, shuffle=train, num_workers=4, persistent_workers=True, generator=g, drop_last=train and len(ds) > bs)


def train(a):
    random.seed(42), np.random.seed(42), torch.manual_seed(42)
    dev, n = device(), len(labels())
    out = Path(a.run)
    out.mkdir(parents=True, exist_ok=True)
    m = build(a.model, n).to(dev)
    ai_train, ai_val = folder("aihub", "train", TRAIN_TF), folder("aihub", "val", EVAL_TF)
    assert ai_train and ai_val, "먼저 prepare_dataset.py aihub 실행"
    tr, va = loader(ai_train, True), loader(ai_val, False)
    log = {"model": a.model, "device": dev.type, "classes": n}

    # 1단계: 분류기만 (AdamW head 1e-3, 고정 lr, 5 epoch)
    head = head_params(m)
    for p in m.parameters():
        p.requires_grad = False
    for p in head:
        p.requires_grad = True
    opt = torch.optim.AdamW(head, lr=1e-3, weight_decay=1e-4)
    log["stage1_val_macro_f1"] = run_stage("stage1", m, opt, None, tr, va, a.epochs1, 0, dev, n, out, a.max_batches, freeze_backbone=True)

    # 2단계: 전체 (backbone 1e-4, head 3e-4, cosine T_max=20, 최대 20 epoch, patience 3)
    for p in m.parameters():
        p.requires_grad = True
    head_ids = {id(p) for p in head}
    backbone = [p for p in m.parameters() if id(p) not in head_ids]
    opt = torch.optim.AdamW([{"params": backbone, "lr": 1e-4}, {"params": head, "lr": 3e-4}], weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=a.epochs2)
    log["stage2_val_macro_f1"] = run_stage("stage2", m, opt, sched, tr, va, a.epochs2, 3, dev, n, out, a.max_batches)
    best = "stage2"

    # 3단계: 학식 적응 (학식 train + 같은 수의 AI Hub train, 전 층 3e-5, T_max=10, 최대 10 epoch, 학식 val 기준)
    k_train, k_val = folder("kentech", "train", TRAIN_TF), folder("kentech", "val", EVAL_TF)
    if k_train and k_val:
        idx = torch.randperm(len(ai_train), generator=torch.Generator().manual_seed(42))[: len(k_train)].tolist()
        mix = ConcatDataset([k_train, torch.utils.data.Subset(ai_train, idx)])
        opt = torch.optim.AdamW(m.parameters(), lr=3e-5, weight_decay=1e-4)
        sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=a.epochs3)
        log["stage3_val_macro_f1"] = run_stage("stage3", m, opt, sched, loader(mix, True), loader(k_val, False), a.epochs3, 3, dev, n, out, a.max_batches)
        best = "stage3"
    else:
        print("학식 train/val 데이터가 없어 3단계를 건너뜀 (라벨링 후 다시 실행)")
    (out / "best.pt").write_bytes((out / f"{best}.pt").read_bytes())
    log["best"] = best
    (out / "train_log.json").write_text(json.dumps(log, ensure_ascii=False, indent=1), encoding="utf-8")
    print("완료:", log)


def load(ckpt: Path, model_name: str):
    n = len(labels())
    m = build(model_name, n)
    m.load_state_dict(torch.load(ckpt, map_location="cpu"))
    return m.eval(), n


def test(a):
    dev = device()
    m, n = load(Path(a.ckpt), a.model)
    m.to(dev)
    report = {}
    for domain in ("aihub", "kentech"):
        ds = folder(domain, "test", EVAL_TF)
        if ds:
            r = evaluate(m, loader(ds, False), n, dev, a.max_batches)
            print(f"{domain} test: top1 {r['top1']:.3f} top3 {r['top3']:.3f} macroF1 {r['macro_f1']:.3f} (n={r['n']}, 클래스 {r['classes_evaluated']}/{n})")
            report[domain] = r
    Path(a.ckpt).with_name("test_report.json").write_text(json.dumps(report, ensure_ascii=False), encoding="utf-8")


def export(a):
    m, n = load(Path(a.ckpt), a.model)
    path = Path(a.out)
    torch.onnx.export(
        m, torch.randn(1, 3, SIZE, SIZE), str(path),
        input_names=["image"], output_names=["logits"],
        dynamic_axes={"image": {0: "N"}, "logits": {0: "N"}}, opset_version=17, dynamo=False,
    )
    import onnxruntime as ort  # MODEL_SPEC 7.1: 같은 입력에서 최대 오차 ≤ 1e-4, top-1 100% 일치

    x = torch.randn(6, 3, SIZE, SIZE)
    with torch.no_grad():
        ref = m(x).numpy()
    got = ort.InferenceSession(str(path)).run(["logits"], {"image": x.numpy()})[0]
    diff = float(np.abs(ref - got).max())
    same = bool((ref.argmax(1) == got.argmax(1)).all())
    print(f"ONNX {path} ({path.stat().st_size / 1e6:.1f} MB): max |diff| {diff:.2e}, top-1 일치 {same}")
    assert diff <= 1e-4 and same, "PyTorch와 ONNX 출력이 다름 → 배포 보류"
    path.with_suffix(".labels.json").write_text(json.dumps({"model_version": path.stem, "num_classes": n, "labels": labels(), "threshold": a.threshold}, ensure_ascii=False, indent=1), encoding="utf-8")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["train", "test", "export"])
    ap.add_argument("--model", choices=["mobilenet", "resnet18"], default="mobilenet")
    ap.add_argument("--run", default=str(HERE / "runs" / "mnv3"))
    ap.add_argument("--ckpt", default=str(HERE / "runs" / "mnv3" / "best.pt"))
    ap.add_argument("--out", default=str(HERE / "runs" / "mnv3" / "menu_cnn.onnx"))
    ap.add_argument("--threshold", type=float, default=0.5, help="학식 val에서 정한 τ (MODEL_SPEC 5)")
    ap.add_argument("--epochs1", type=int, default=5)
    ap.add_argument("--epochs2", type=int, default=20)
    ap.add_argument("--epochs3", type=int, default=10)
    ap.add_argument("--max-batches", type=int, help="빠른 점검용: epoch마다 이만큼만")
    ap.add_argument("--data", type=Path, default=DATA, help="menu_cls 폴더 (Colab에서는 압축 푼 위치)")
    a = ap.parse_args()
    DATA = a.data
    {"train": train, "test": test, "export": export}[a.cmd](a)
