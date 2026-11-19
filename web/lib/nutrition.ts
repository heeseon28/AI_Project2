import type { GoalMode, Menu, Nutrients, Profile } from "@/lib/types";

export const NUTRIENT_KEYS = ["kcal", "carb", "protein", "fat", "sodium"] as const;
export const NUTRIENT_LABEL: Record<keyof Nutrients, string> = {
  kcal: "칼로리",
  carb: "탄수화물",
  protein: "단백질",
  fat: "지방",
  sodium: "나트륨",
};
export const NUTRIENT_UNIT: Record<keyof Nutrients, string> = {
  kcal: "kcal",
  carb: "g",
  protein: "g",
  fat: "g",
  sodium: "mg",
};

export const ZERO: Nutrients = { kcal: 0, carb: 0, protein: 0, fat: 0, sodium: 0 };
const SODIUM_LIMIT = 2000; // mg/일, 목표가 아니라 상한
const MAX_DEFICIT = 500; // kcal/일, PRD 안전장치
const LOW_BODY_FAT = { male: 10, female: 18 };

export function add(a: Nutrients, b: Nutrients, scale = 1): Nutrients {
  return {
    kcal: a.kcal + b.kcal * scale,
    carb: a.carb + b.carb * scale,
    protein: a.protein + b.protein * scale,
    fat: a.fat + b.fat * scale,
    sodium: a.sodium + b.sodium * scale,
  };
}

export function sumItems(items: { menu: Menu; portion: number }[]): Nutrients {
  return items.reduce((acc, i) => add(acc, i.menu, i.portion), ZERO);
}

export type Targets = { daily: Nutrients; bmr: number | null; note: string | null };

/** 하루 목표치. 체중·체지방률이 없으면 일반 성인 기준값을 쓴다. */
export function computeTargets(p: Pick<Profile, "sex" | "weight_kg" | "body_fat_pct" | "activity_level" | "goal_mode">): Targets {
  if (!p.weight_kg || p.body_fat_pct == null) {
    return {
      daily: { kcal: 2200, carb: 300, protein: 65, fat: 60, sodium: SODIUM_LIMIT },
      bmr: null,
      note: "프로필에 체중과 체지방률을 넣으면 개인 목표치로 바뀌어요.",
    };
  }

  let goal: GoalMode = p.goal_mode;
  let note: string | null = null;
  const lowFat = p.sex ? p.body_fat_pct < LOW_BODY_FAT[p.sex] : false;
  if (goal === "fat_loss" && lowFat) {
    goal = "maintain";
    note = "체지방률이 이미 낮아서 감량 대신 유지를 권장해요.";
  }

  const lbm = p.weight_kg * (1 - p.body_fat_pct / 100);
  const bmr = 370 + 21.6 * lbm; // Katch-McArdle
  const tdee = bmr * p.activity_level;
  let kcal = tdee;
  if (goal === "fat_loss") kcal = Math.max(bmr, tdee - MAX_DEFICIT); // 기초대사량 아래로는 안 내려간다
  if (goal === "muscle") kcal = tdee + 250;

  const proteinPerKg = goal === "muscle" || goal === "fat_loss" ? 1.6 : 1.2;
  const protein = p.weight_kg * proteinPerKg;
  const fat = (kcal * 0.25) / 9;
  const carb = Math.max(0, (kcal - protein * 4 - fat * 9) / 4);
  return { daily: { kcal, carb, protein, fat, sodium: SODIUM_LIMIT }, bmr, note };
}

/** 목표 대비 달성률 (0~). 나트륨은 상한이라 높을수록 나쁘다. */
export function achievement(eaten: Nutrients, target: Nutrients): Nutrients {
  return {
    kcal: eaten.kcal / target.kcal,
    carb: eaten.carb / target.carb,
    protein: eaten.protein / target.protein,
    fat: eaten.fat / target.fat,
    sodium: eaten.sodium / target.sodium,
  };
}

/** 최근 3일 연속 칼로리가 목표의 70% 미만이면 true (PRD 안전장치) */
export function isUndereating(lastDays: Nutrients[], target: Nutrients): boolean {
  const recent = lastDays.slice(-3);
  return recent.length === 3 && recent.every((d) => d.kcal > 0 && d.kcal < target.kcal * 0.7);
}
