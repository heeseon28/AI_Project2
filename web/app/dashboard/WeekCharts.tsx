"use client";

import { Bar, BarChart, PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { daysLeftInWeek } from "@/lib/date";
import { achievement, NUTRIENT_KEYS, NUTRIENT_LABEL } from "@/lib/nutrition";
import type { WeekData } from "@/lib/week";

/** PRD M5: 주간 달성률 레이더 + 14일 칼로리 막대 */
export function WeekCharts({ week }: { week: WeekData }) {
  const daysSoFar = 7 - daysLeftInWeek(week.today);
  const soFarTarget = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, week.targets.daily[k] * daysSoFar])) as WeekData["eatenThisWeek"];
  const ach = achievement(week.eatenThisWeek, soFarTarget);
  const radar = NUTRIENT_KEYS.map((k) => ({ name: NUTRIENT_LABEL[k], pct: Math.round(ach[k] * 100) }));
  const bars = week.history.map((d, i) => ({ date: week.historyDates[i].slice(5), kcal: Math.round(d.kcal) }));

  return (
    <section className="space-y-4 rounded-2xl border p-4">
      <h2 className="font-semibold">이번 주 달성률 (오늘까지 목표 대비 %)</h2>
      <div className="h-64">
        <ResponsiveContainer>
          <RadarChart data={radar}>
            <PolarGrid />
            <PolarAngleAxis dataKey="name" />
            <PolarRadiusAxis domain={[0, 150]} tick={false} axisLine={false} />
            <Radar dataKey="pct" fill="#10b981" fillOpacity={0.4} stroke="#10b981" />
          </RadarChart>
        </ResponsiveContainer>
      </div>
      <h2 className="font-semibold">최근 14일 칼로리</h2>
      <div className="h-48">
        <ResponsiveContainer>
          <BarChart data={bars}>
            <XAxis dataKey="date" fontSize={10} />
            <YAxis fontSize={10} width={36} />
            <ReferenceLine y={Math.round(week.targets.daily.kcal)} stroke="#9ca3af" strokeDasharray="4 4" />
            <Bar dataKey="kcal" fill="#10b981" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
