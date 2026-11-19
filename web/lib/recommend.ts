import type { Nutrients, WeeklyMenuRow } from "@/lib/types";

const WEIGHT = { kcal: 1, carb: 0.5, protein: 2, fat: 0.5 } as const;

export type Recommendation = WeeklyMenuRow & { score: number; proteinFill: number };

/**
 * 부족분 채움 점수: 각 영양소에서 부족분을 실제로 메우는 양만 센다 (넘치는 양은 0점).
 * 나트륨이 하루 상한의 1/3(한 끼 몫)을 넘으면 감점한다.
 */
export function scoreMenu(menu: Nutrients, deficit: Nutrients, daily: Nutrients): number {
  let score = 0;
  for (const k of Object.keys(WEIGHT) as (keyof typeof WEIGHT)[]) {
    score += (WEIGHT[k] * Math.min(menu[k], deficit[k])) / daily[k];
  }
  const sodiumOver = menu.sodium - daily.sodium / 3;
  if (sodiumOver > 0) score -= sodiumOver / daily.sodium;
  return score;
}

export function recommend(candidates: WeeklyMenuRow[], deficit: Nutrients, daily: Nutrients, top = 3): Recommendation[] {
  return candidates
    .map((c) => ({
      ...c,
      score: scoreMenu(c.menu, deficit, daily),
      proteinFill: deficit.protein > 0 ? Math.min(1, c.menu.protein / deficit.protein) : 0,
    }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, top);
}
