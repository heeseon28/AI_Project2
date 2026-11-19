import { add, NUTRIENT_KEYS, ZERO } from "@/lib/nutrition";
import type { Nutrients } from "@/lib/types";

export const HISTORY_DAYS = 14;

/** 기준선: 기록이 있는 최근 7일의 평균을 남은 날에 반복한다. LSTM과 비교하는 대상이기도 하다. */
export function baselineForecast(history: Nutrients[], daysLeft: number): Nutrients[] {
  const logged = history.filter((d) => d.kcal > 0).slice(-7);
  const avg = logged.length ? logged.reduce((a, d) => add(a, d), ZERO) : ZERO;
  const mean = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, logged.length ? avg[k] / logged.length : 0])) as Nutrients;
  return Array.from({ length: daysLeft }, () => mean);
}

/**
 * 이번 주 부족분 = 주간 목표 − (이번 주 먹은 양 + 남은 날 예측). 0 미만은 0.
 * shortcut: 오늘 남은 끼니는 예측에 넣지 않는다. 저녁 추천 정확도가 아쉬우면 끼니 단위 예측으로 바꾼다.
 */
export function weeklyDeficit(daily: Nutrients, eatenThisWeek: Nutrients, forecast: Nutrients[]): Nutrients {
  const expected = forecast.reduce((a, d) => add(a, d), eatenThisWeek);
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, Math.max(0, daily[k] * 7 - expected[k])])) as Nutrients;
}
