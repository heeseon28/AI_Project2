import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { NUTRIENT_KEYS, NUTRIENT_LABEL, NUTRIENT_UNIT, sumItems } from "@/lib/nutrition";
import { getSession } from "@/lib/supabase/server";
import { MEAL_LABEL } from "@/lib/types";
import { loadWeekData } from "@/lib/week";
import { StrategyCard } from "./_components/StrategyCard";

export default function HomePage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">불러오는 중…</p>}>
      <Home />
    </Suspense>
  );
}

async function Home() {
  const session = await getSession();
  if (!session?.profile) redirect("/login");
  const week = await loadWeekData(session.supabase, session.profile);
  const today = sumItems(week.todayLogs.flatMap((l) => l.meal_items));

  return (
    <>
      <h1 className="text-xl font-bold">오늘 먹은 것</h1>
      {week.targets.note && <p className="text-sm text-gray-500">{week.targets.note}</p>}

      <section className="rounded-2xl border p-4 space-y-2">
        {NUTRIENT_KEYS.map((k) => {
          const pct = Math.min(100, (today[k] / week.targets.daily[k]) * 100);
          return (
            <div key={k} className="text-sm">
              <div className="flex justify-between">
                <span>{NUTRIENT_LABEL[k]}</span>
                <span>
                  {Math.round(today[k])} / {Math.round(week.targets.daily[k])}
                  {NUTRIENT_UNIT[k]}
                  {k === "sodium" && " (상한)"}
                </span>
              </div>
              <div className="h-2 rounded bg-gray-200">
                <div className="h-2 rounded bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </section>

      <ul className="space-y-1 text-sm">
        {week.todayLogs.map((l) => (
          <li key={l.id}>
            <b>{MEAL_LABEL[l.meal]}</b> {l.meal_items.map((i) => i.menu.name).join(", ")}
          </li>
        ))}
      </ul>

      <Link href="/log/new" className="block rounded-xl bg-black p-3 text-center text-white">
        식판 찍어서 기록하기
      </Link>

      <StrategyCard week={week} />
    </>
  );
}
