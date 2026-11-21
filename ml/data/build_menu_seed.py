"""menu_classes.csv의 메뉴마다 식약처 음식 영양성분 DB에서 1인분 영양을 찾아 Supabase `menus` 시드를 만든다.

입력: menu_classes.csv, raw/food_nutrition.csv (fetch_nutrition.py로 받음)
출력: menus_seed.csv          → Supabase `menus` 테이블에 그대로 CSV 임포트
      menus_seed_sources.csv  → 어느 DB 항목을 썼는지 (검토용)

매칭 규칙
1. db_name이 있으면 그 이름, 없으면 menu_name으로 찾는다.
2. 식품명이 정확히 같은 항목 → 대표식품명이 같은 항목 → "이름_"으로 시작하는 변형 순서로 찾는다.
3. 같은 순위면 산업체급식 > 중고등학교급식 > 초등학교급식 > 외식(재료량) > 외식(분석) > 가정식 > 프랜차이즈 순으로 고른다.
   (대학 학식과 가장 비슷한 것이 산업체급식이다)
4. 1인분 = 100(g/ml)당 값 × 식품중량 / 100. serving_g가 있으면 그 값을 쓴다.
"""
import csv
import re
from pathlib import Path

HERE = Path(__file__).parent
ORIGIN_RANK = ["산업체급식", "중고등학교급식", "초등학교급식", "외식(재료량", "외식(분석", "가정식", "외식(프랜차이즈"]
NUT = {"kcal": "에너지(kcal)", "carb": "탄수화물(g)", "protein": "단백질(g)", "fat": "지방(g)", "sodium": "나트륨(mg)"}


def origin_rank(origin: str) -> int:
    return next((i for i, o in enumerate(ORIGIN_RANK) if origin.startswith(o)), len(ORIGIN_RANK))


def num(s: str) -> float:
    m = re.match(r"[\d.]+", s or "")
    return float(m.group()) if m else 0.0


def find(rows: list[dict], q: str) -> dict | None:
    for match in (
        lambda r: r["식품명"] == q,
        lambda r: r["대표식품명"] == q,
        lambda r: r["식품명"].startswith(q + "_"),
    ):
        hits = [r for r in rows if match(r)]
        if hits:
            return min(hits, key=lambda r: (origin_rank(r["식품기원명"]), r["식품명"]))
    return None


def main():
    rows = list(csv.DictReader(open(HERE / "raw" / "food_nutrition.csv", encoding="utf-8")))
    menus = list(csv.DictReader(open(HERE / "menu_classes.csv", encoding="utf-8")))

    seed, sources, missing = [], [], []
    for m in menus:
        r = find(rows, m["db_name"] or m["menu_name"])
        if r is None:
            missing.append(m["menu_name"])
            continue
        base = num(r["영양성분함량기준량"]) or 100
        serving = float(m["serving_g"]) if m["serving_g"] else num(r["식품중량"]) or 100
        scale = serving / base
        seed.append(
            {"name": m["menu_name"], **{k: round(num(r[c]) * scale, 1) for k, c in NUT.items()}, "price": "", "model_class_id": m["class_id"]}
        )
        sources.append(
            {"name": m["menu_name"], "food_code": r["식품코드"], "matched": r["식품명"], "origin": r["식품기원명"], "serving": serving, "unit": r["영양성분함량기준량"]}
        )

    for path, data in [("menus_seed.csv", seed), ("menus_seed_sources.csv", sources)]:
        with open(HERE / path, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(data[0]))
            w.writeheader()
            w.writerows(data)

    # 값 범위 점검: 1인분이 0kcal이거나 1,500kcal를 넘으면 매칭이나 중량이 틀렸을 가능성이 크다
    odd = [s["name"] for s in seed if not 0 < s["kcal"] <= 1500]
    print(f"매칭 {len(seed)}/{len(menus)}")
    print("못 찾음 (db_name 채우기):", missing)
    print("값 확인 필요:", odd)


if __name__ == "__main__":
    main()
