"use client";

import { useEffect, useState } from "react";
import { daysLeftInWeek } from "@/lib/date";
import { baselineForecast, weeklyDeficit } from "@/lib/forecast";
import { lstmForecast } from "@/lib/lstm";
import { isUndereating } from "@/lib/nutrition";
import { recommend, type Recommendation } from "@/lib/recommend";
import { MEAL_LABEL, type Nutrients } from "@/lib/types";
import type { WeekData } from "@/lib/week";

const DAY = ["일", "월", "화", "수", "목", "금", "토"];

type Result = { deficit: Nutrients; recs: Recommendation[]; source: "LSTM" | "최근 평균" };

/** 부족분 예측 + 메뉴 추천 카드 (PRD M6, M7). 예측은 브라우저에서 돈다. */
export function StrategyCard({ week }: { week: WeekData }) {
  const [result, setResult] = useState<Result | null>(null);
  const daily = week.targets.daily;

  useEffect(() => {
    const daysLeft = daysLeftInWeek(week.today);
    lstmForecast(week.history, daysLeft).then((lstm) => {
      const forecast = lstm ?? baselineForecast(week.history, daysLeft);
      const deficit = weeklyDeficit(daily, week.eatenThisWeek, forecast);
      setResult({ deficit, recs: recommend(week.candidates, deficit, daily), source: lstm ? "LSTM" : "최근 평균" });
    });
  }, [week, daily]);

  const proteinPct = Math.round((week.eatenThisWeek.protein / (daily.protein * 7)) * 100);

  return (
    <section className="rounded-2xl border p-4 space-y-3">
      <h2 className="font-semibold">이번 주 전략</h2>
      {isUndereating(week.history, daily) && (
        <p className="rounded-lg bg-amber-100 p-2 text-sm text-amber-900">
          최근 3일 동안 목표보다 많이 적게 드셨어요. 한 끼 더 챙겨 드세요.
        </p>
      )}
      {!result ? (
        <p className="text-sm text-gray-500">예측 중…</p>
      ) : (
        <>
          <p className="text-sm">
            이번 주 단백질 섭취가 목표의 {proteinPct}%예요.{" "}
            {result.deficit.protein > 0
              ? `지금 패턴이면 일요일까지 약 ${Math.round(result.deficit.protein)}g이 부족할 것으로 예상돼요.`
              : "지금 패턴이면 목표를 채울 수 있어요."}
            <span className="ml-1 text-xs text-gray-400">({result.source} 기준)</span>
          </p>
          <ul className="space-y-1 text-sm">
            {result.recs.map((r) => (
              <li key={`${r.date}-${r.meal}-${r.menu.id}`}>
                {DAY[new Date(r.date + "T00:00:00Z").getUTCDay()]} {MEAL_LABEL[r.meal]} {r.corner}코너{" "}
                <b>{r.menu.name}</b>
                {r.proteinFill > 0 && ` · 단백질 부족분의 ${Math.round(r.proteinFill * 100)}%`}
              </li>
            ))}
            {!result.recs.length && <li className="text-gray-500">추천할 메뉴가 없어요 (식단표가 비었거나 부족분이 없어요).</li>}
          </ul>
        </>
      )}
    </section>
  );
}
