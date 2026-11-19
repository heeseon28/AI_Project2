import { redirect } from "next/navigation";
import { Suspense } from "react";
import { computeTargets, NUTRIENT_KEYS, NUTRIENT_LABEL, NUTRIENT_UNIT } from "@/lib/nutrition";
import { getSession } from "@/lib/supabase/server";
import { saveProfile } from "./actions";

const GOALS = [
  ["maintain", "균형 유지"],
  ["muscle", "근육 증가"],
  ["fat_loss", "체지방 관리"],
  ["exam", "시험 기간 컨디션"],
] as const;

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">불러오는 중…</p>}>
      <Profile />
    </Suspense>
  );
}

async function Profile() {
  const session = await getSession();
  if (!session?.profile) redirect("/login");
  const p = session.profile;
  const t = computeTargets(p);

  return (
    <>
      <h1 className="text-xl font-bold">내 정보·목표</h1>
      <form action={saveProfile} className="space-y-3 text-sm">
        <label className="block">
          성별
          <select name="sex" defaultValue={p.sex ?? ""} className="mt-1 w-full rounded border p-2">
            <option value="">선택 안 함</option>
            <option value="male">남</option>
            <option value="female">여</option>
          </select>
        </label>
        <label className="block">
          체중 (kg)
          <input name="weight_kg" type="number" step="0.1" min="30" max="200" defaultValue={p.weight_kg ?? ""} className="mt-1 w-full rounded border p-2" />
        </label>
        <label className="block">
          체지방률 (%) — 인바디 결과지 자동 입력은 1차 확장
          <input name="body_fat_pct" type="number" step="0.1" min="3" max="60" defaultValue={p.body_fat_pct ?? ""} className="mt-1 w-full rounded border p-2" />
        </label>
        <label className="block">
          활동량
          <select name="activity_level" defaultValue={String(p.activity_level)} className="mt-1 w-full rounded border p-2">
            <option value="1.2">거의 안 움직임</option>
            <option value="1.375">주 1~3회 운동</option>
            <option value="1.55">주 3~5회 운동</option>
            <option value="1.725">거의 매일 운동</option>
          </select>
        </label>
        <label className="block">
          목표
          <select name="goal_mode" defaultValue={p.goal_mode} className="mt-1 w-full rounded border p-2">
            {GOALS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-gray-500">체성분은 건강 정보예요. 본인만 볼 수 있고 다른 학생과 비교하지 않아요.</p>
        <button className="w-full rounded-xl bg-black p-3 text-white">저장</button>
      </form>

      <section className="rounded-2xl border p-4 text-sm">
        <h2 className="mb-2 font-semibold">하루 목표 (추정)</h2>
        {t.note && <p className="mb-2 text-gray-500">{t.note}</p>}
        {t.bmr && <p>기초대사량 {Math.round(t.bmr)}kcal (Katch-McArdle)</p>}
        {NUTRIENT_KEYS.map((k) => (
          <p key={k}>
            {NUTRIENT_LABEL[k]} {Math.round(t.daily[k])}
            {NUTRIENT_UNIT[k]}
          </p>
        ))}
      </section>
    </>
  );
}
