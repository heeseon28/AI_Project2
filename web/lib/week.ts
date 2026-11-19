import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, currentMeal, kstDate, weekStart } from "@/lib/date";
import { HISTORY_DAYS } from "@/lib/forecast";
import { add, computeTargets, sumItems, ZERO, type Targets } from "@/lib/nutrition";
import type { Meal, Menu, Nutrients, Profile, WeeklyMenuRow } from "@/lib/types";

const MEAL_ORDER: Meal[] = ["breakfast", "lunch", "dinner"];

export type LogWithItems = {
  id: number;
  eaten_at: string;
  meal: Meal;
  meal_items: { portion: number; menu: Menu }[];
};

export type WeekData = {
  today: string;
  targets: Targets;
  history: Nutrients[]; // 최근 14일 일별 합계, 마지막이 오늘
  historyDates: string[];
  eatenThisWeek: Nutrients;
  todayLogs: LogWithItems[];
  candidates: WeeklyMenuRow[]; // 이번 주 아직 안 지난 끼니의 메뉴
};

/** 홈과 대시보드가 같이 쓰는 데이터. 서버 컴포넌트에서 호출한다. */
export async function loadWeekData(supabase: SupabaseClient, profile: Profile): Promise<WeekData> {
  const today = kstDate();
  const from = addDays(today, -(HISTORY_DAYS - 1));
  const monday = weekStart(today);
  const sunday = addDays(monday, 6);

  const [logsRes, menuRes] = await Promise.all([
    supabase
      .from("meal_logs")
      .select("id, eaten_at, meal, meal_items(portion, menu:menus(*))")
      .gte("eaten_at", `${from}T00:00:00+09:00`)
      .order("eaten_at")
      .returns<LogWithItems[]>(),
    supabase
      .from("weekly_menu")
      .select("date, meal, corner, menu:menus(*)")
      .gte("date", today)
      .lte("date", sunday)
      .returns<WeeklyMenuRow[]>(),
  ]);
  if (logsRes.error) throw logsRes.error;
  if (menuRes.error) throw menuRes.error;

  const historyDates = Array.from({ length: HISTORY_DAYS }, (_, i) => addDays(from, i));
  const byDate = new Map(historyDates.map((d) => [d, ZERO]));
  for (const log of logsRes.data) {
    const d = kstDate(new Date(log.eaten_at));
    byDate.set(d, add(byDate.get(d) ?? ZERO, sumItems(log.meal_items)));
  }
  const history = historyDates.map((d) => byDate.get(d)!);
  const eatenThisWeek = historyDates.filter((d) => d >= monday).reduce((a, d) => add(a, byDate.get(d)!), ZERO);

  const nowIdx = MEAL_ORDER.indexOf(currentMeal());
  const candidates = menuRes.data.filter((r) => r.date > today || MEAL_ORDER.indexOf(r.meal) >= nowIdx);

  return {
    today,
    targets: computeTargets(profile),
    history,
    historyDates,
    eatenThisWeek,
    todayLogs: logsRes.data.filter((l) => kstDate(new Date(l.eaten_at)) === today),
    candidates,
  };
}
