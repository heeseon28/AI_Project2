import { describe, expect, it } from "vitest";
import { daysLeftInWeek, weekStart } from "@/lib/date";
import { baselineForecast, weeklyDeficit } from "@/lib/forecast";
import { computeTargets, isUndereating, ZERO } from "@/lib/nutrition";
import { recommend } from "@/lib/recommend";
import type { Menu } from "@/lib/types";

const base = { sex: "male" as const, weight_kg: 70, body_fat_pct: 20, activity_level: 1.2 };

describe("computeTargets", () => {
  it("Katch-McArdle BMR", () => {
    expect(computeTargets({ ...base, goal_mode: "maintain" }).bmr).toBeCloseTo(370 + 21.6 * 56);
  });
  it("감량해도 BMR 아래로 내려가지 않는다", () => {
    const t = computeTargets({ ...base, goal_mode: "fat_loss" });
    expect(t.daily.kcal).toBeGreaterThanOrEqual(t.bmr!);
  });
  it("감량 폭은 500kcal 이내", () => {
    const t = computeTargets({ ...base, activity_level: 1.9, goal_mode: "fat_loss" });
    expect(t.bmr! * 1.9 - t.daily.kcal).toBeCloseTo(500);
  });
  it("체지방률이 낮으면 감량 대신 유지", () => {
    const lean = computeTargets({ ...base, body_fat_pct: 8, goal_mode: "fat_loss" });
    const keep = computeTargets({ ...base, body_fat_pct: 8, goal_mode: "maintain" });
    expect(lean.daily.kcal).toBe(keep.daily.kcal);
    expect(lean.note).toContain("유지");
  });
  it("체성분 없으면 기본값", () => {
    expect(computeTargets({ ...base, body_fat_pct: null, goal_mode: "maintain" }).bmr).toBeNull();
  });
});

describe("forecast / deficit", () => {
  const day = { kcal: 2000, carb: 250, protein: 50, fat: 60, sodium: 1500 };
  it("기록 없는 날은 평균에서 뺀다", () => {
    expect(baselineForecast([ZERO, day, ZERO, day], 2)).toEqual([day, day]);
  });
  it("부족분은 음수가 되지 않는다", () => {
    const d = weeklyDeficit(day, { ...day, kcal: 99999 }, []);
    expect(d.kcal).toBe(0);
    expect(d.protein).toBe(50 * 6);
  });
  it("3일 연속 70% 미만이면 경고", () => {
    const low = { ...day, kcal: 1000 };
    expect(isUndereating([low, low, low], day)).toBe(true);
    expect(isUndereating([low, ZERO, low], day)).toBe(false);
  });
});

describe("date", () => {
  it("월요일 시작 주", () => {
    expect(weekStart("2026-11-19")).toBe("2026-11-16"); // 목
    expect(weekStart("2026-11-22")).toBe("2026-11-16"); // 일
    expect(daysLeftInWeek("2026-11-19")).toBe(3);
    expect(daysLeftInWeek("2026-11-22")).toBe(0);
  });
});

describe("recommend", () => {
  const daily = { kcal: 2000, carb: 250, protein: 100, fat: 60, sodium: 2000 };
  const m = (id: number, protein: number, sodium = 500): Menu => ({ id, name: `m${id}`, price: null, kcal: 500, carb: 50, protein, fat: 15, sodium });
  const rows = [m(1, 10), m(2, 40), m(3, 40, 3000)].map((menu) => ({ date: "2026-11-19", meal: "dinner" as const, corner: "A", menu }));

  it("단백질 많고 나트륨 적은 메뉴가 1등", () => {
    const r = recommend(rows, { ...daily, protein: 80 }, daily);
    expect(r[0].menu.id).toBe(2);
    expect(r[0].proteinFill).toBeCloseTo(0.5);
  });
  it("부족분이 없으면 추천도 없다", () => {
    expect(recommend(rows, ZERO, daily)).toEqual([]);
  });
});
