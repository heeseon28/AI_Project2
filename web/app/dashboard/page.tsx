import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/supabase/server";
import { loadWeekData } from "@/lib/week";
import { StrategyCard } from "../_components/StrategyCard";
import { WeekCharts } from "./WeekCharts";

export default function DashboardPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">불러오는 중…</p>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const session = await getSession();
  if (!session?.profile) redirect("/login");
  const week = await loadWeekData(session.supabase, session.profile);
  return (
    <>
      <h1 className="text-xl font-bold">주간 분석</h1>
      <WeekCharts week={week} />
      <StrategyCard week={week} />
    </>
  );
}
