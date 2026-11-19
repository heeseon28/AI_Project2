// 서버(Cloudflare)는 UTC라서 날짜는 항상 한국 시간 기준으로 계산한다.
const KST_OFFSET = 9 * 60 * 60 * 1000;

export function kstDate(d = new Date()): string {
  return new Date(d.getTime() + KST_OFFSET).toISOString().slice(0, 10);
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 이번 주 월요일 (YYYY-MM-DD) */
export function weekStart(date: string): string {
  const dow = new Date(date + "T00:00:00Z").getUTCDay(); // 0=일
  return addDays(date, dow === 0 ? -6 : 1 - dow);
}

/** 오늘 이후 이번 주 남은 날 수 (일요일이면 0) */
export function daysLeftInWeek(date: string): number {
  const dow = new Date(date + "T00:00:00Z").getUTCDay();
  return dow === 0 ? 0 : 7 - dow;
}

/** 지금 시각 기준 기본 끼니 */
export function currentMeal(d = new Date()): "breakfast" | "lunch" | "dinner" {
  const h = new Date(d.getTime() + KST_OFFSET).getUTCHours();
  return h < 10 ? "breakfast" : h < 15 ? "lunch" : "dinner";
}
