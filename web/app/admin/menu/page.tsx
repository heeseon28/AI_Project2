import { Suspense } from "react";
import { addDays, kstDate, weekStart } from "@/lib/date";
import { createClient } from "@/lib/supabase/server";
import { MEAL_LABEL, type Meal, type Menu, type WeeklyMenuRow } from "@/lib/types";
import { addMenu, addWeeklyMenu, deleteWeeklyMenu } from "./actions";

// PRD M8: 주간 식단표 입력. 메뉴 100개 같은 대량 입력은 Supabase 대시보드 CSV 임포트가 빠르다.
export default function AdminMenuPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">불러오는 중…</p>}>
      <AdminMenu />
    </Suspense>
  );
}

const input = "rounded border p-1";

async function AdminMenu() {
  const supabase = await createClient();
  const monday = weekStart(kstDate());
  const [{ data: menus }, { data: week }] = await Promise.all([
    supabase.from("menus").select("*").order("name").returns<Menu[]>(),
    supabase
      .from("weekly_menu")
      .select("id, date, meal, corner, menu:menus(*)")
      .gte("date", monday)
      .lte("date", addDays(monday, 13))
      .order("date")
      .returns<(WeeklyMenuRow & { id: number })[]>(),
  ]);

  return (
    <>
      <h1 className="text-xl font-bold">식단표 관리</h1>

      <form action={addWeeklyMenu} className="space-y-2 rounded-2xl border p-4 text-sm">
        <h2 className="font-semibold">식단 추가</h2>
        <div className="flex flex-wrap gap-2">
          <input name="date" type="date" required defaultValue={kstDate()} className={input} />
          <select name="meal" className={input}>
            {(Object.keys(MEAL_LABEL) as Meal[]).map((m) => (
              <option key={m} value={m}>
                {MEAL_LABEL[m]}
              </option>
            ))}
          </select>
          <input name="corner" required placeholder="코너 (A)" className={`${input} w-20`} />
          <select name="menu_id" required className={input}>
            {menus?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <button className="rounded bg-black px-3 py-1 text-white">추가</button>
      </form>

      <form action={addMenu} className="space-y-2 rounded-2xl border p-4 text-sm">
        <h2 className="font-semibold">메뉴 등록 (1인분 기준)</h2>
        <div className="grid grid-cols-3 gap-2">
          <input name="name" required placeholder="메뉴 이름" className={`${input} col-span-3`} />
          {(["kcal", "carb", "protein", "fat", "sodium", "price"] as const).map((k) => (
            <input key={k} name={k} type="number" step="0.1" min="0" required={k !== "price"} placeholder={k} className={input} />
          ))}
        </div>
        <button className="rounded bg-black px-3 py-1 text-white">등록</button>
      </form>

      <ul className="space-y-1 text-sm">
        {week?.map((r) => (
          <li key={r.id} className="flex justify-between">
            <span>
              {r.date.slice(5)} {MEAL_LABEL[r.meal]} {r.corner} · {r.menu.name}
            </span>
            <form action={deleteWeeklyMenu}>
              <input type="hidden" name="id" value={r.id} />
              <button aria-label="삭제">✕</button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}
