"""학습용 이미지 데이터셋(ImageFolder 형식)을 만든다. MODEL_SPEC 2절.

    python prepare_dataset.py aihub  --src <AI Hub 압축 푼 폴더> [--per-class 300]
    python prepare_dataset.py kentech --photos <식판 사진 폴더> --labels kentech_labels.csv

출력
    menu_cls/aihub/{train,val,test}/<class_id>_<메뉴>/...    AI Hub 클래스별 80/10/10 층화 분할 (심볼릭 링크)
    menu_cls/kentech/{train,val,test}/<class_id>_<메뉴>/...  식판 사진을 tray_layout.json 칸대로 자른 이미지
    menu_cls/labels.json                                     클래스 인덱스 순서의 메뉴 이름 (웹 menu_cnn.labels.json의 원본)

클래스 목록의 원본은 menu_classes.csv 하나뿐이다. class_id가 비어 있는 메뉴(예: 쌀밥)는 모델 클래스가 아니다.

kentech_labels.csv 형식 (칸 이름은 web/public/models/tray_layout.json과 같아야 함, 빈 칸은 비워 둠)
    file,date,반찬1,반찬2,반찬3,밥,국
    IMG_0001.jpg,2026-11-24,배추김치,제육볶음,콩나물무침,잡곡밥,미역국
"""
import argparse
import csv
import hashlib
import json
import random
import unicodedata
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageOps

HERE = Path(__file__).parent
OUT = HERE / "menu_cls"
LAYOUT = HERE.parents[1] / "web" / "public" / "models" / "tray_layout.json"
EXTS = {".jpg", ".jpeg", ".png"}


def load_classes():
    rows = [r for r in csv.DictReader(open(HERE / "menu_classes.csv", encoding="utf-8")) if r["class_id"]]
    rows.sort(key=lambda r: int(r["class_id"]))
    assert [int(r["class_id"]) for r in rows] == list(range(len(rows))), "class_id는 0부터 빈틈없이 이어져야 한다"
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "labels.json").write_text(json.dumps([r["menu_name"] for r in rows], ensure_ascii=False, indent=1))
    return rows


def class_dir(r) -> str:
    return f"{int(r['class_id']):02d}_{r['menu_name']}"


def aihub(src: Path, per_class: int | None, seed: int = 0):
    classes = load_classes()
    by_folder = defaultdict(list)
    for p in src.rglob("*"):
        if p.suffix.lower() in EXTS:
            # macOS는 한글 파일명을 NFD로 저장해서 CSV(NFC)와 그냥 비교하면 안 맞는다
            by_folder[unicodedata.normalize("NFC", p.parent.name)].append(p)

    rng = random.Random(seed)
    missing = []
    for r in classes:
        files = sorted(by_folder.get(r["aihub_class"], []))
        if not files:
            missing.append(r["aihub_class"])
            continue
        rng.shuffle(files)
        if per_class:
            files = files[:per_class]
        n_val = n_test = max(1, len(files) // 10)
        splits = {"test": files[:n_test], "val": files[n_test : n_test + n_val], "train": files[n_test + n_val :]}
        for split, fs in splits.items():
            d = OUT / "aihub" / split / class_dir(r)
            d.mkdir(parents=True, exist_ok=True)
            for f in fs:
                link = d / f.name
                if not link.exists():
                    link.symlink_to(f.resolve())
        print(f"{class_dir(r)}: train {len(splits['train'])} / val {len(splits['val'])} / test {len(splits['test'])}")
    if missing:
        print("AI Hub에서 못 찾은 클래스 (menu_classes.csv의 aihub_class를 실제 폴더명으로 고치기):", missing)
    return missing


def date_split(date: str) -> str:
    # 날짜 해시로 나눈다: 사진이 늘어도 기존 날짜의 분할이 바뀌지 않고, 같은 날 사진은 한 분할에만 들어간다
    h = int(hashlib.md5(date.encode()).hexdigest(), 16) % 10
    return "train" if h < 6 else "val" if h < 8 else "test"


def kentech(photos: Path, labels: Path):
    classes = {r["menu_name"]: r for r in load_classes()}
    slots = json.loads(LAYOUT.read_text())["slots"]
    counts, skipped = defaultdict(int), defaultdict(int)
    for row in csv.DictReader(open(labels, encoding="utf-8")):
        img = ImageOps.exif_transpose(Image.open(photos / row["file"])).convert("RGB")  # 휴대폰 사진 회전 정보 반영
        W, H = img.size
        split = date_split(row["date"])
        for s in slots:
            menu = (row.get(s["name"]) or "").strip()
            if not menu:
                continue
            if menu not in classes:
                skipped[menu] += 1
                continue
            box = (round(s["x"] * W), round(s["y"] * H), round((s["x"] + s["w"]) * W), round((s["y"] + s["h"]) * H))
            d = OUT / "kentech" / split / class_dir(classes[menu])
            d.mkdir(parents=True, exist_ok=True)
            img.crop(box).save(d / f"{Path(row['file']).stem}_{s['name']}.jpg", quality=92)
            counts[split] += 1
    print("칸 이미지:", dict(counts))
    if skipped:
        print("모델 클래스가 아니라 건너뜀:", dict(skipped))
    return counts


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    sub = ap.add_subparsers(dest="cmd", required=True)
    a = sub.add_parser("aihub")
    a.add_argument("--src", type=Path, required=True)
    a.add_argument("--per-class", type=int)
    k = sub.add_parser("kentech")
    k.add_argument("--photos", type=Path, required=True)
    k.add_argument("--labels", type=Path, required=True)
    args = ap.parse_args()
    if args.cmd == "aihub":
        aihub(args.src, args.per_class)
    else:
        kentech(args.photos, args.labels)
