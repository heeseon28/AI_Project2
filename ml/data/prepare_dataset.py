"""학습용 이미지 데이터셋(ImageFolder 형식)을 만든다. MODEL_SPEC 2절.

    python prepare_dataset.py aihub-extract --zip <kfood.zip>       # 67개 클래스만 raw/aihub/에 풀기
    python prepare_dataset.py aihub  --src raw/aihub [--per-class 300]
    python prepare_dataset.py kentech --photos <사진 폴더> --labels kentech_labels.csv
    python prepare_dataset.py pack                                   # Colab 업로드용 menu_cls_256.zip

출력
    menu_cls/aihub/{train,val,test}/<class_id>_<메뉴>/...    AI Hub 클래스별 80/10/10 층화 분할 (심볼릭 링크)
    menu_cls/kentech/{train,val,test}/<class_id>_<메뉴>/...  학식 사진을 라벨링 도구로 그린 네모대로 자른 이미지
    menu_cls/labels.json                                     클래스 인덱스 순서의 메뉴 이름 (웹 menu_cnn.labels.json의 원본)

클래스 목록의 원본은 menu_classes.csv 하나뿐이다. class_id가 비어 있는 메뉴(예: 쌀밥)는 모델 클래스가 아니다.

kentech_labels.csv 형식은 label_tool.py 참고 (file,group,x,y,w,h,menu). group이 같은 사진은 같은 분할에 들어간다.
"""
import argparse
import csv
import hashlib
import json
import math
import random
import unicodedata
from collections import defaultdict
from pathlib import Path

from PIL import Image, ImageOps

HERE = Path(__file__).parent
OUT = HERE / "menu_cls"
EXTS = {".jpg", ".jpeg", ".png"}


def load_classes():
    rows = [r for r in csv.DictReader(open(HERE / "menu_classes.csv", encoding="utf-8")) if r["class_id"]]
    rows.sort(key=lambda r: int(r["class_id"]))
    assert [int(r["class_id"]) for r in rows] == list(range(len(rows))), "class_id는 0부터 빈틈없이 이어져야 한다"
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "labels.json").write_text(json.dumps([r["menu_name"] for r in rows], ensure_ascii=False, indent=1), encoding="utf-8")
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
                    try:
                        link.symlink_to(f.resolve())
                    except OSError:  # Windows는 개발자 모드가 아니면 심볼릭 링크 권한이 없다 → 하드링크 (같은 디스크, 용량 그대로)
                        link.hardlink_to(f.resolve())
        print(f"{class_dir(r)}: train {len(splits['train'])} / val {len(splits['val'])} / test {len(splits['test'])}")
    if missing:
        print("AI Hub에서 못 찾은 클래스 (menu_classes.csv의 aihub_class를 실제 폴더명으로 고치기):", missing)
    return missing


def extract_aihub(zip_path: Path, dest: Path) -> int:
    """kfood.zip(분류별 ZIP 27개를 담은 ZIP)에서 menu_classes.csv의 67개 클래스 이미지만 풀어 dest/<클래스>/에 둔다."""
    import zipfile

    def name(info):  # 이 ZIP은 한글 파일명을 cp949로 저장했다 (UTF-8 플래그 없음)
        # orig_filename은 항상 cp437로 읽힌 원본 (최신 Python은 filename을 이미 고쳐 두기도 해서 그걸 다시 바꾸면 깨진다)
        n = info.filename if info.flag_bits & 0x800 else info.orig_filename.encode("cp437").decode("cp949")
        return unicodedata.normalize("NFC", n)

    wanted = {r["aihub_class"] for r in load_classes()}
    n = 0
    with zipfile.ZipFile(zip_path) as outer:
        for info in outer.infolist():
            if not name(info).lower().endswith(".zip"):
                continue
            with zipfile.ZipFile(outer.open(info)) as inner:
                for e in inner.infolist():
                    parts = name(e).split("/")
                    if len(parts) < 2 or parts[-2] not in wanted or Path(parts[-1]).suffix.lower() not in EXTS:
                        continue
                    out = dest / parts[-2] / parts[-1]  # 경로는 클래스명·파일명으로만 만든다 (ZIP 안의 ../ 무시)
                    if out.exists():
                        continue
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(inner.read(e))
                    n += 1
            print(f"{name(info)}: 누적 {n}장", flush=True)
    return n


def pack(zip_path: Path, max_side: int = 256) -> int:
    """menu_cls/를 Colab에 올릴 ZIP으로 묶는다. 링크 대신 실제 파일, 긴 변 max_side로 줄여 용량을 줄인다 (학습은 224 사용)."""
    import io
    import zipfile

    n = 0
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_STORED) as z:  # JPEG는 이미 압축돼 있어 다시 압축하지 않는다
        z.write(OUT / "labels.json", "menu_cls/labels.json")
        for f in sorted(OUT.glob("*/*/*/*")):
            if f.suffix.lower() not in EXTS:
                continue
            img = ImageOps.exif_transpose(Image.open(f)).convert("RGB")
            img.thumbnail((max_side, max_side), Image.BILINEAR)
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=90)
            z.writestr(f"menu_cls/{f.relative_to(OUT).with_suffix('.jpg').as_posix()}", buf.getvalue())
            n += 1
            if n % 5000 == 0:
                print(f"{n}장", flush=True)
    return n


def date_split(date: str) -> str:
    # 날짜(그룹) 해시로 나눈다: 사진이 늘어도 기존 날짜의 분할이 바뀌지 않고, 같은 날 사진은 한 분할에만 들어간다
    h = int(hashlib.md5(date.encode()).hexdigest(), 16) % 10
    return "train" if h < 6 else "val" if h < 8 else "test"


def kentech(photos: Path, labels: Path):
    """label_tool.py가 만든 kentech_labels.csv의 네모대로 잘라 클래스 폴더에 넣는다. 크기 조정은 학습 변환이 한다."""
    classes = {r["menu_name"]: r for r in load_classes()}
    counts, skipped = defaultdict(int), defaultdict(int)
    img, img_file, n_in_file = None, None, 0
    for row in csv.DictReader(open(labels, encoding="utf-8")):
        if not row["menu"]:  # 검토했지만 쓸 음식이 없는 사진
            continue
        if row["menu"] not in classes:
            skipped[row["menu"]] += 1
            continue
        if row["file"] != img_file:
            img = ImageOps.exif_transpose(Image.open(photos / row["file"])).convert("RGB")  # 휴대폰 사진 회전 정보 반영
            img_file, n_in_file = row["file"], 0
        W, H = img.size
        x, y, w, h = (float(row[k]) for k in "xywh")
        # 왼쪽·위는 내림, 오른쪽·아래는 올림 (웹 lib/tray.ts cropRegion과 같은 규칙)
        box = (math.floor(x * W), math.floor(y * H), min(W, math.ceil((x + w) * W)), min(H, math.ceil((y + h) * H)))
        split = date_split(row["group"])
        d = OUT / "kentech" / split / class_dir(classes[row["menu"]])
        d.mkdir(parents=True, exist_ok=True)
        n_in_file += 1
        img.crop(box).save(d / f"{Path(row['file']).stem}_{n_in_file}.jpg", quality=92)
        counts[split] += 1
    print("영역 이미지:", dict(counts))
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
    x = sub.add_parser("aihub-extract")
    x.add_argument("--zip", type=Path, required=True)
    x.add_argument("--dest", type=Path, default=HERE / "raw" / "aihub")
    pk = sub.add_parser("pack")
    pk.add_argument("--zip", type=Path, default=HERE / "menu_cls_256.zip")
    args = ap.parse_args()
    if args.cmd == "aihub":
        aihub(args.src, args.per_class)
    elif args.cmd == "pack":
        print("묶은 이미지:", pack(args.zip))
    elif args.cmd == "aihub-extract":
        print("풀어낸 이미지:", extract_aihub(args.zip, args.dest))
    else:
        kentech(args.photos, args.labels)
