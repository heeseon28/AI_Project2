"""부족분 예측 LSTM (PRD M6).

최근 14일 일별 영양 섭취(kcal, carb, protein, fat, sodium) → 다음 7일 일별 섭취 예측.
웹(web/lib/lstm.ts)과의 계약: 입력 "history" [1,14,5], 출력 "forecast" [1,7,5], 표준화 값은 deficit_norm.json.

실행:  python train.py                (합성 데이터만)
       python train.py --real logs.csv (팀원 실제 기록 추가: date,user,kcal,carb,protein,fat,sodium)
결과:  ../../web/public/models/deficit_lstm.onnx, deficit_norm.json
"""
import argparse
import json
from pathlib import Path

import numpy as np
import torch
from torch import nn

HIST, HORIZON, F = 14, 7, 5
OUT = Path(__file__).resolve().parents[2] / "web" / "public" / "models"
rng = np.random.default_rng(0)


def synth_person(days: int) -> np.ndarray:
    """한 사람의 일별 섭취 시계열. 아침 거름, 주말 과식, 시험 기간 감소 패턴을 넣는다."""
    meal_kcal = rng.normal(750, 120)
    skip_breakfast = rng.uniform(0, 0.8)
    weekend = rng.uniform(0.9, 1.3)
    protein_ratio = rng.uniform(0.12, 0.2)
    exam_start = rng.integers(0, days)
    out = np.zeros((days, F), dtype=np.float32)
    for d in range(days):
        meals = (rng.random() > skip_breakfast) + (rng.random() > 0.05) + (rng.random() > 0.15)
        kcal = sum(rng.normal(meal_kcal, 120) for _ in range(meals))
        if d % 7 in (5, 6):
            kcal *= weekend
        if exam_start <= d < exam_start + 7:
            kcal *= 0.85
        if rng.random() < 0.1:  # 기록 안 한 날
            continue
        kcal = max(kcal, 0)
        p = protein_ratio + rng.normal(0, 0.02)
        fat = 0.27 + rng.normal(0, 0.03)
        out[d] = [kcal, kcal * (1 - p - fat) / 4, kcal * p / 4, kcal * fat / 9, meals * rng.normal(1300, 250)]
    return out


def windows(series: list[np.ndarray]):
    xs, ys = [], []
    for s in series:
        for t in range(len(s) - HIST - HORIZON + 1):
            xs.append(s[t : t + HIST])
            ys.append(s[t + HIST : t + HIST + HORIZON])
    return np.stack(xs), np.stack(ys)


def load_real(path: str) -> list[np.ndarray]:
    import csv
    from collections import defaultdict

    by_user = defaultdict(dict)
    for r in csv.DictReader(open(path)):
        by_user[r["user"]][r["date"]] = [float(r[k]) for k in ("kcal", "carb", "protein", "fat", "sodium")]
    series = []
    for days in by_user.values():
        dates = sorted(days)
        all_days = np.arange(np.datetime64(dates[0]), np.datetime64(dates[-1]) + 1)
        series.append(np.array([days.get(str(d), [0] * F) for d in all_days], dtype=np.float32))
    return [s for s in series if len(s) >= HIST + HORIZON]


class Model(nn.Module):
    def __init__(self):
        super().__init__()
        self.lstm = nn.LSTM(F, 64, num_layers=2, batch_first=True, dropout=0.1)
        self.head = nn.Linear(64, HORIZON * F)

    def forward(self, history):
        h, _ = self.lstm(history)
        return self.head(h[:, -1]).view(-1, HORIZON, F)


def baseline(x: np.ndarray) -> np.ndarray:
    """웹 lib/forecast.ts의 baselineForecast와 같은 규칙: 기록 있는 최근 7일 평균 반복."""
    out = np.zeros((len(x), HORIZON, F), dtype=np.float32)
    for i, h in enumerate(x):
        logged = h[h[:, 0] > 0][-7:]
        if len(logged):
            out[i] = logged.mean(0)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--real", help="실제 기록 CSV")
    ap.add_argument("--epochs", type=int, default=30)
    args = ap.parse_args()

    series = [synth_person(70) for _ in range(400)]
    if args.real:
        series += load_real(args.real)
    rng.shuffle(series)
    split = int(len(series) * 0.8)  # 사람 단위로 나눠야 미래 정보가 새지 않는다
    xtr, ytr = windows(series[:split])
    xte, yte = windows(series[split:])

    mean, std = xtr.reshape(-1, F).mean(0), xtr.reshape(-1, F).std(0) + 1e-6
    norm = lambda a: torch.tensor((a - mean) / std, dtype=torch.float32)
    model = Model()
    opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    ds = torch.utils.data.TensorDataset(norm(xtr), norm(ytr))
    for epoch in range(args.epochs):
        model.train()
        for xb, yb in torch.utils.data.DataLoader(ds, batch_size=256, shuffle=True):
            opt.zero_grad()
            loss = nn.functional.mse_loss(model(xb), yb)
            loss.backward()
            opt.step()
        if epoch % 5 == 4:
            print(f"epoch {epoch + 1} loss {loss.item():.4f}")

    model.eval()
    with torch.no_grad():
        pred = model(norm(xte)).numpy() * std + mean
    base = baseline(xte)
    for j, name in [(0, "kcal"), (2, "protein")]:
        print(f"MAE {name:8s} LSTM {np.abs(pred[..., j] - yte[..., j]).mean():7.1f}  기준선 {np.abs(base[..., j] - yte[..., j]).mean():7.1f}")

    OUT.mkdir(parents=True, exist_ok=True)
    torch.onnx.export(
        model, torch.zeros(1, HIST, F), OUT / "deficit_lstm.onnx",
        input_names=["history"], output_names=["forecast"], opset_version=17, dynamo=False,
    )
    (OUT / "deficit_norm.json").write_text(json.dumps({"mean": mean.tolist(), "std": std.tolist()}))
    print(f"저장: {OUT}")


if __name__ == "__main__":
    main()
