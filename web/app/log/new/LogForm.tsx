"use client";

import { useState, useTransition } from "react";
import { MEAL_LABEL, type Meal, type Menu, type RecognizeResponse } from "@/lib/types";
import { saveMeal } from "./actions";

type Row = { menuId: number | null; portion: number; confidence?: number };

/** 긴 변 1024px JPEG로 줄인다 (업로드·토큰 절약). 사진은 저장하지 않는다. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((ok, fail) => canvas.toBlob((b) => (b ? ok(b) : fail(new Error("변환 실패"))), "image/jpeg", 0.85));
}

export function LogForm({ menus, defaultMeal }: { menus: Menu[]; defaultMeal: Meal }) {
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setStatus("인식 중…");
    try {
      const form = new FormData();
      form.append("image", await shrink(file), "tray.jpg");
      form.append("meal", meal);
      const res = await fetch("/api/recognize", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      const items = (body as RecognizeResponse).items;
      setRows(items.map((i) => ({ menuId: i.menu?.id ?? null, portion: 1, confidence: i.confidence })));
      setStatus(items.some((i) => !i.menu) ? "못 알아본 칸은 직접 골라 주세요." : null);
    } catch (e) {
      setStatus(`${(e as Error).message} — 아래에서 직접 추가할 수 있어요.`);
      if (!rows.length) setRows([{ menuId: null, portion: 1 }]);
    }
  }

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  function onSave() {
    const items = rows.filter((r) => r.menuId !== null).map((r) => ({ menu_id: r.menuId!, portion: r.portion }));
    startSaving(async () => {
      const err = await saveMeal({ meal, items });
      if (err) setStatus(err);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(Object.keys(MEAL_LABEL) as Meal[]).map((m) => (
          <button
            key={m}
            onClick={() => setMeal(m)}
            className={`rounded-full border px-3 py-1 text-sm ${m === meal ? "bg-black text-white" : ""}`}
          >
            {MEAL_LABEL[m]}
          </button>
        ))}
      </div>

      <label className="block rounded-xl border-2 border-dashed p-6 text-center text-sm">
        식판 사진 찍기 / 고르기
        <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
      </label>
      {status && <p className="text-sm text-gray-600">{status}</p>}

      <ul className="space-y-2">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-2">
            <select
              value={r.menuId ?? ""}
              onChange={(e) => update(i, { menuId: e.target.value ? Number(e.target.value) : null })}
              className="flex-1 rounded border p-1"
              aria-label={`${i + 1}번 칸 메뉴`}
            >
              <option value="">메뉴 선택</option>
              {menus.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <select
              value={r.portion}
              onChange={(e) => update(i, { portion: Number(e.target.value) })}
              className="rounded border p-1"
              aria-label="양"
            >
              <option value={0.5}>0.5인분</option>
              <option value={1}>1인분</option>
              <option value={1.5}>1.5인분</option>
            </select>
            <button onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label="삭제">
              ✕
            </button>
          </li>
        ))}
      </ul>
      <button onClick={() => setRows((rs) => [...rs, { menuId: null, portion: 1 }])} className="text-sm underline">
        + 메뉴 직접 추가
      </button>

      <button
        onClick={onSave}
        disabled={saving || !rows.some((r) => r.menuId !== null)}
        className="w-full rounded-xl bg-black p-3 text-white disabled:opacity-40"
      >
        {saving ? "저장 중…" : "저장"}
      </button>
    </div>
  );
}
