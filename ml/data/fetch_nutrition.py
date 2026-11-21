"""식약처 「전국통합식품영양성분정보(음식) 표준데이터」를 공공데이터포털에서 내려받아 CSV로 저장한다.

출처: https://www.data.go.kr/data/15100070/standard.do (제공: 식품의약품안전처, 무료, 공공데이터포털 이용정책)
포털 화면의 CSV 다운로드 버튼과 같은 요청을 보낸다. 로그인·API 키 불필요.

실행: python fetch_nutrition.py   → raw/food_nutrition.csv (UTF-8)
"""
import csv
import json
import math
import urllib.parse
import urllib.request
from pathlib import Path

PK = "15100070"
BASE = "https://www.data.go.kr/download"
OUT = Path(__file__).parent / "raw" / "food_nutrition.csv"
HEADERS = {"User-Agent": "Mozilla/5.0", "Referer": f"https://www.data.go.kr/data/{PK}/standard.do"}


def get(url: str):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.load(r)


def main():
    meta = get(f"{BASE}/columList.json?pk={PK}&ext=CSV")
    cols = meta["columList"]
    table = meta["tableVO"]
    total, per_page = int(meta["totalCount"]), 10000

    rows = []
    for page in range(1, math.ceil(total / per_page) + 1):
        # 포털 스크립트와 같게 colNmList는 같은 키를 반복해서 보낸다 (jQuery traditional)
        params = [("publicDataPk", PK), ("svcTableNm", table["svcTableNm"]), ("totalCount", total), ("perPage", per_page), ("page", page)]
        params += [("colNmList", c) for c in table["colNmList"]]
        rows += get(f"{BASE}/standard.json?{urllib.parse.urlencode(params)}")
        print(f"page {page}: {len(rows)}/{total}")

    assert len(rows) == total, f"받은 행 {len(rows)} != 전체 {total}"
    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow([c["columNm"] for c in cols])
        for r in rows:
            w.writerow([r.get(c["columCode"], "") for c in cols])
    print(f"저장: {OUT} ({total}행)")


if __name__ == "__main__":
    main()
