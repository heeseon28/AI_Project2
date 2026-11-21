"""prepare_dataset.py 자체 점검. 가짜 이미지로 AI Hub 폴더 구조와 식판 사진을 만들어 돌려 본다.

실행: python test_prepare_dataset.py   (실제 menu_cls/ 는 건드리지 않는다)
"""
import csv
import json
import tempfile
import unicodedata
from pathlib import Path

from PIL import Image

import prepare_dataset as pd


def main():
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        pd.OUT = tmp / "out"
        classes = pd.load_classes()

        # AI Hub 흉내: <대분류>/<클래스>/*.jpg, 앞의 세 클래스만 20장씩
        for r in classes[:3]:
            d = tmp / "aihub" / "대분류" / unicodedata.normalize("NFD", r["aihub_class"])  # macOS 압축 해제 흉내
            d.mkdir(parents=True)
            for i in range(20):
                Image.new("RGB", (64, 64), (i * 10, 0, 0)).save(d / f"{i}.jpg")
        missing = pd.aihub(tmp / "aihub", per_class=None)
        assert len(missing) == len(classes) - 3
        c0 = pd.class_dir(classes[0])
        n = {s: len(list((pd.OUT / "aihub" / s / c0).iterdir())) for s in ("train", "val", "test")}
        assert n == {"train": 16, "val": 2, "test": 2}, n
        assert json.loads((pd.OUT / "labels.json").read_text())[0] == classes[0]["menu_name"]

        # 식판 사진: 칸 5개 중 2개만 라벨, 1개는 모델 클래스가 아닌 쌀밥
        photos = tmp / "photos"
        photos.mkdir()
        Image.new("RGB", (400, 300), "white").save(photos / "a.jpg")
        labels = tmp / "labels.csv"
        with open(labels, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["file", "date", "반찬1", "반찬2", "반찬3", "밥", "국"])
            w.writerow(["a.jpg", "2026-11-24", "배추김치", "", "", "쌀밥", "미역국"])
        counts = pd.kentech(photos, labels)
        assert sum(counts.values()) == 2, counts
        crop = next((pd.OUT / "kentech").rglob("*_국.jpg"))
        s = json.loads(pd.LAYOUT.read_text())["slots"][4]
        assert Image.open(crop).size == (round((s["x"] + s["w"]) * 400) - round(s["x"] * 400), round((s["y"] + s["h"]) * 300) - round(s["y"] * 300))

        # 날짜 분할은 결정적이어야 한다
        assert pd.date_split("2026-11-24") == pd.date_split("2026-11-24")
    print("ok")


if __name__ == "__main__":
    main()
