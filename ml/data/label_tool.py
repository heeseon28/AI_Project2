"""학식 사진 라벨링 도구 (로컬 전용). 사진마다 음식 네모를 그리고 67개 클래스 중 하나를 고른다.

    python label_tool.py --photos kentech_photos/instagram_screenshots/food_only_500
    → http://127.0.0.1:8765 를 브라우저로 연다

--photos 폴더에는 menus.csv(사진파일, 게시물_ID, 메뉴설명_게시글원문)가 있어야 한다.
결과는 kentech_labels.csv 에 사진 한 장 저장할 때마다 바로 쓴다.
여러 명이 나눠 할 때: --part 2/4 --labels labels_2.csv 처럼 몫과 파일을 따로 쓰고, prepare_dataset.py kentech --labels 에 파일들을 같이 넘긴다.

kentech_labels.csv 형식: file,group,x,y,w,h,menu
  x,y,w,h 는 사진 크기에 대한 비율(0~1). menu 는 menu_classes.csv 의 menu_name.
  네모가 없는 행(menu 비어 있음)은 "검토했지만 쓸 음식 없음" 표시다.
  group 은 같은 날·같은 끼니 사진을 한 분할에 묶기 위한 키다 (prepare_dataset.py kentech).
"""
import argparse
import csv
import json
import re
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

HERE = Path(__file__).parent
FIELDS = ["file", "group", "x", "y", "w", "h", "menu"]
NFC = lambda s: unicodedata.normalize("NFC", s)


def group_of(caption: str, post_id: str) -> str:
    """캡션의 '11/20 중식' 같은 날짜·끼니로 묶는다. 없으면 게시물 단위."""
    d = re.search(r"(\d{1,2})/(\d{1,2})", caption)
    if not d:
        return f"post_{post_id}"
    meal = re.search(r"조식|중식|석식", caption)
    return f"{int(d[1]):02d}-{int(d[2]):02d}_{meal[0] if meal else '기타'}"


def load_items(photos: Path, classes: list[str]):
    items = []
    for r in csv.DictReader(open(photos / "menus.csv", encoding="utf-8-sig")):
        cap = NFC(r["메뉴설명_게시글원문"])
        items.append({
            "file": r["사진파일"],
            "caption": cap,
            "group": group_of(cap, r["게시물_ID"]),
            "hints": [c for c in classes if c in cap],  # 캡션에 이름이 그대로 나온 클래스를 먼저 보여 준다
        })
    return items


def read_labels(path: Path) -> dict[str, list[dict]]:
    out: dict[str, list[dict]] = {}
    if path.exists():
        for r in csv.DictReader(open(path, encoding="utf-8")):
            out.setdefault(r["file"], [])
            if r["menu"]:
                out[r["file"]].append({k: float(r[k]) for k in "xywh"} | {"menu": r["menu"]})
    return out


def write_labels(path: Path, labels: dict[str, list[dict]], groups: dict[str, str]):
    tmp = path.with_suffix(".tmp")
    with open(tmp, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, FIELDS)
        w.writeheader()
        for file, regions in labels.items():
            if not regions:
                w.writerow({"file": file, "group": groups[file]})
            for g in regions:
                w.writerow({"file": file, "group": groups[file], "menu": g["menu"]} | {k: f"{g[k]:.4f}" for k in "xywh"})
    tmp.replace(path)  # 저장 도중 꺼져도 기존 파일이 깨지지 않게


def validate(regions, classes: set[str]):
    clean = []
    for g in regions:
        x, y, w, h = (float(g[k]) for k in "xywh")
        if not (0 <= x < 1 and 0 <= y < 1 and 0 < w <= 1 - x + 1e-6 and 0 < h <= 1 - y + 1e-6):
            raise ValueError(f"영역 좌표가 사진 밖: {g}")
        if g["menu"] not in classes:
            raise ValueError(f"모르는 클래스: {g['menu']}")
        clean.append({"x": x, "y": y, "w": w, "h": h, "menu": g["menu"]})
    return clean


def serve(photos: Path, labels_path: Path, port: int, part: str | None = None):
    classes = [r["menu_name"] for r in csv.DictReader(open(HERE / "menu_classes.csv", encoding="utf-8")) if r["class_id"]]
    items = load_items(photos, classes)
    groups = {i["file"]: i["group"] for i in items}  # 나눠 하더라도 전체 기준 (다른 몫의 라벨이 파일에 있어도 저장이 깨지지 않게)
    if part:  # "k/n": 사진을 순서대로 n등분한 k번째만 보여 준다
        k, n = map(int, part.split("/"))
        assert 1 <= k <= n, "--part는 1/4처럼 k/n (1 ≤ k ≤ n)"
        items = items[(k - 1) * len(items) // n : k * len(items) // n]
    labels = read_labels(labels_path)
    page = (HERE / "label_tool.html").read_bytes()
    root = photos.resolve()

    class H(BaseHTTPRequestHandler):
        def send(self, code, body: bytes, ctype="application/json; charset=utf-8"):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            u = urlparse(self.path)
            if u.path == "/":
                return self.send(200, page, "text/html; charset=utf-8")
            if u.path == "/api/state":
                return self.send(200, json.dumps({"classes": classes, "items": items, "labels": labels}, ensure_ascii=False).encode())
            if u.path == "/img":
                f = (root / parse_qs(u.query).get("f", [""])[0]).resolve()
                if root not in f.parents or not f.is_file():  # 사진 폴더 밖 파일은 내주지 않는다
                    return self.send(404, b"{}")
                return self.send(200, f.read_bytes(), "image/png" if f.suffix.lower() == ".png" else "image/jpeg")
            self.send(404, b"{}")

        def do_POST(self):
            if self.path != "/api/save":
                return self.send(404, b"{}")
            try:
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                if body["file"] not in groups:
                    raise ValueError("모르는 사진")
                labels[body["file"]] = validate(body["regions"], set(classes))
                write_labels(labels_path, labels, groups)
            except (ValueError, KeyError, TypeError) as e:
                return self.send(400, json.dumps({"error": str(e)}, ensure_ascii=False).encode())
            self.send(200, json.dumps({"done": len(labels)}).encode())

        def log_message(self, *a):
            pass

    print(f"사진 {len(items)}장, 라벨 완료 {len(labels)}장 → http://127.0.0.1:{port}")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--photos", type=Path, required=True)
    ap.add_argument("--labels", type=Path, default=HERE / "kentech_labels.csv")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--part", help="여럿이 나눠 할 때 k/n (예: 2/4 → 4등분한 두 번째 몫만)")
    a = ap.parse_args()
    serve(a.photos, a.labels, a.port, a.part)
