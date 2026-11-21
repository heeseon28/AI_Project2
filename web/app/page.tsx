import Link from "next/link";
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
  if (!session?.profile) return <Intro />;
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

/** 로그인 전 메인: 서비스 목적과 사용 흐름 (과제 Task 1: 서비스 목적을 알리는 메인 페이지) */
function Intro() {
  return (
    <>
      <section className="space-y-2 pt-6">
        <h1 className="text-2xl font-bold">학식 코치</h1>
        <p>
          KENTECH 학식 식판을 찍으면 <b>팀이 직접 학습한 CNN</b>이 칸마다 메뉴를 알아보고, 영양 정보와 이번 주 부족한 영양소를 채울 다음
          끼니 메뉴를 추천해요.
        </p>
      </section>
      <ol className="space-y-2 rounded-2xl border p-4 text-sm">
        <li>
          <b>1. 찍기</b> 식판을 가이드에 맞춰 찍어요.
        </li>
        <li>
          <b>2. 인식</b> CNN이 칸별 메뉴 후보 3개와 확신도를 보여 줘요. 틀리면 고르면 돼요.
        </li>
        <li>
          <b>3. 분석·추천</b> 기록이 쌓이면 주간 달성률과 다음 끼니 추천을 보여 줘요.
        </li>
      </ol>
      <Link href="/log/new" className="block rounded-xl bg-black p-3 text-center text-white">
        식판 찍어 보기
      </Link>
      <p className="text-xs text-gray-500">
        현재 개발 1단계예요. AI 모델은 학습 중이라 인식 화면에서는 아직 직접 선택만 돼요.{" "}
        <Link href="/login" className="underline">
          로그인
        </Link>
        하면 기록 저장과 주간 분석을 쓸 수 있어요.
      </p>
    </>
  );
}
