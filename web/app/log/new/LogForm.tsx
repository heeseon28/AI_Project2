"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { NUTRIENT_KEYS, NUTRIENT_LABEL, NUTRIENT_UNIT, sumItems } from "@/lib/nutrition";
import { cropSlots, type TrayLayout } from "@/lib/tray";
import { MEAL_LABEL, type Meal, type Menu } from "@/lib/types";
import { saveMeal } from "./actions";

type Row = { slot: string; thumb: string; menuId: number | null; portion: number };

export function LogForm({ menus, defaultMeal, loggedIn }: { menus: Menu[]; defaultMeal: Meal; loggedIn: boolean }) {
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [layout, setLayout] = useState<TrayLayout | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const photoUrl = useRef<string | null>(null);

  useEffect(() => {
    fetch("/models/tray_layout.json")
      .then((r) => r.json())
      .then(setLayout)
      .catch(() => setStatus("식판 칸 정보를 불러오지 못했어요."));
    return () => {
      if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    };
  }, []);

  async function onPhoto(file: File | undefined) {
    if (!file || !layout) return;
    if (photoUrl.current) URL.revokeObjectURL(photoUrl.current);
    photoUrl.current = URL.createObjectURL(file);
    setPhoto(photoUrl.current);
    const bitmap = await createImageBitmap(file);
    const crops = cropSlots(bitmap, layout);
    setRows(crops.map((c, i) => ({ slot: layout.slots[i].name, thumb: c.toDataURL("image/jpeg", 0.8), menuId: null, portion: 1 })));
    setStatus(null);
  }

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const byId = new Map(menus.map((m) => [m.id, m]));
  const chosen = rows.filter((r) => r.menuId !== null).map((r) => ({ menu: byId.get(r.menuId!)!, portion: r.portion }));
  const total = sumItems(chosen);

  function onSave() {
    startSaving(async () => {
      const err = await saveMeal({ meal, items: chosen.map((c) => ({ menu_id: c.menu.id, portion: c.portion })) });
      if (err) setStatus(err);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2" role="group" aria-label="끼니">
        {(Object.keys(MEAL_LABEL) as Meal[]).map((m) => (
          <button
            key={m}
            onClick={() => setMeal(m)}
            aria-pressed={m === meal}
            className={`rounded-full border px-3 py-1 text-sm ${m === meal ? "bg-black text-white" : ""}`}
          >
            {MEAL_LABEL[m]}
          </button>
        ))}
      </div>

      {/* 1. 입력: 사진 + 칸 가이드 */}
      <label className="relative block overflow-hidden rounded-xl border-2 border-dashed text-center text-sm">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element -- 로컬 blob 미리보기라 next/image가 필요 없다
          <img src={photo} alt="선택한 식판 사진" className="block aspect-[4/3] w-full object-fill" />
        ) : (
          <span className="block aspect-[4/3] w-full content-center">식판 사진 찍기 / 고르기</span>
        )}
        {layout?.slots.map((s) => (
          <span
            key={s.name}
            className="absolute border-2 border-emerald-500/80 text-[10px] text-emerald-700"
            style={{ left: `${s.x * 100}%`, top: `${s.y * 100}%`, width: `${s.w * 100}%`, height: `${s.h * 100}%` }}
          >
            {s.name}
          </span>
        ))}
        <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </label>
      <p className="text-xs text-gray-500">초록 칸에 식판 칸이 맞도록 위에서 찍어 주세요. 사진은 서버로 보내지 않아요.</p>

      {/* 2. AI 결과 영역 */}
      <section className="space-y-2 rounded-2xl border p-4" aria-live="polite">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">인식 결과</h2>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">AI 모델 연결 전 · 직접 선택</span>
        </div>
        <p className="text-xs text-gray-500">
          학습 중인 CNN이 연결되면 칸마다 메뉴 후보 3개와 확신도가 여기에 표시돼요. 지금은 칸을 보고 직접 골라 주세요.
        </p>
        {!rows.length && <p className="text-sm text-gray-400">사진을 고르면 칸별로 잘라서 보여 드려요.</p>}
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={r.slot} className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- 캔버스 crop 미리보기 */}
              <img src={r.thumb} alt={`${r.slot} 칸`} className="h-12 w-12 rounded object-cover" />
              <select
                value={r.menuId ?? ""}
                onChange={(e) => update(i, { menuId: e.target.value ? Number(e.target.value) : null })}
                className="min-w-0 flex-1 rounded border p-1 text-sm"
                aria-label={`${r.slot} 칸 메뉴`}
                disabled={!menus.length}
              >
                <option value="">{menus.length ? "메뉴 선택" : "메뉴 데이터 준비 중"}</option>
                {menus.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select
                value={r.portion}
                onChange={(e) => update(i, { portion: Number(e.target.value) })}
                className="rounded border p-1 text-sm"
                aria-label={`${r.slot} 칸 양`}
              >
                <option value={0.5}>0.5인분</option>
                <option value={1}>1인분</option>
                <option value={1.5}>1.5인분</option>
              </select>
            </li>
          ))}
        </ul>
        {chosen.length > 0 && (
          <p className="text-sm">
            {NUTRIENT_KEYS.map((k) => `${NUTRIENT_LABEL[k]} ${Math.round(total[k])}${NUTRIENT_UNIT[k]}`).join(" · ")}
            <span className="ml-1 text-xs text-gray-400">(추정치)</span>
          </p>
        )}
      </section>

      {status && <p className="text-sm text-gray-600">{status}</p>}

      {loggedIn ? (
        <button onClick={onSave} disabled={saving || !chosen.length} className="w-full rounded-xl bg-black p-3 text-white disabled:opacity-40">
          {saving ? "저장 중…" : "기록 저장"}
        </button>
      ) : (
        <Link href="/login" className="block rounded-xl border p-3 text-center text-sm">
          로그인하면 기록을 저장하고 주간 분석을 볼 수 있어요
        </Link>
      )}
    </div>
  );
}
