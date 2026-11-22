"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition, type PointerEvent } from "react";
import { NUTRIENT_KEYS, NUTRIENT_LABEL, NUTRIENT_UNIT, sumItems } from "@/lib/nutrition";
import { cropRegion, moveRegion, regionFromPoints, resizeRegion, type Region } from "@/lib/tray";
import { MEAL_LABEL, type Meal, type Menu } from "@/lib/types";
import { saveMeal } from "./actions";

type Pick = { menuId: number | null; portion: number };
type Drag =
  | { mode: "draw"; ax: number; ay: number }
  | { mode: "move" | "resize"; id: number; ax: number; ay: number; orig: Region };

const MIN_DRAG = 0.02; // 이보다 짧게 끌면 탭으로 보고 영역을 만들지 않는다

export function LogForm({ menus, defaultMeal, loggedIn }: { menus: Menu[]; defaultMeal: Meal; loggedIn: boolean }) {
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [photo, setPhoto] = useState<{ url: string; aspect: number } | null>(null);
  const [regions, setRegions] = useState<Region[]>([]);
  const [draft, setDraft] = useState<Region | null>(null);
  const [dragging, setDragging] = useState(false);
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const [picks, setPicks] = useState<Record<number, Pick>>({});
  const [status, setStatus] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const bitmap = useRef<ImageBitmap | null>(null);
  const drag = useRef<Drag | null>(null);
  const nextId = useRef(1);

  useEffect(
    () => () => {
      bitmap.current?.close();
    },
    [],
  );
  useEffect(() => () => {
    if (photo) URL.revokeObjectURL(photo.url);
  }, [photo]);

  // 끌기가 끝났을 때만 잘라서 미리보기를 만든다 (끄는 동안 매 프레임 자르면 느리다)
  useEffect(() => {
    const image = bitmap.current;
    if (dragging || !image) return;
    setThumbs(Object.fromEntries(regions.map((r) => [r.id, cropRegion(image, r).toDataURL("image/jpeg", 0.8)])));
  }, [regions, dragging]);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const image = await createImageBitmap(file, { imageOrientation: "from-image" });
      bitmap.current?.close();
      bitmap.current = image;
      setPhoto({ url: URL.createObjectURL(file), aspect: image.width / image.height });
      setRegions([]);
      setPicks({});
      setStatus(null);
    } catch {
      setStatus("사진을 열 수 없어요. JPEG나 PNG 사진을 골라 주세요.");
    }
  }

  const point = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return [(e.clientX - rect.left) / rect.width, (e.clientY - rect.top) / rect.height] as const;
  };

  function onDown(e: PointerEvent<HTMLDivElement>) {
    const [x, y] = point(e);
    const target = (e.target as HTMLElement).closest<HTMLElement>("[data-region]");
    const handle = (e.target as HTMLElement).closest("[data-handle]");
    if ((e.target as HTMLElement).closest("button")) return;
    const r = target && regions.find((g) => g.id === Number(target.dataset.region));
    drag.current = r ? { mode: handle ? "resize" : "move", id: r.id, ax: x, ay: y, orig: r } : { mode: "draw", ax: x, ay: y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  }

  function onMove(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const [x, y] = point(e);
    if (d.mode === "draw") setDraft(regionFromPoints(0, d.ax, d.ay, x, y));
    else {
      const next = (d.mode === "move" ? moveRegion : resizeRegion)(d.orig, x - d.ax, y - d.ay);
      setRegions((rs) => rs.map((r) => (r.id === d.id ? next : r)));
    }
  }

  function onUp(e: PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    setDraft(null);
    setDragging(false);
    if (d?.mode !== "draw") return;
    const [x, y] = point(e);
    if (Math.abs(x - d.ax) < MIN_DRAG && Math.abs(y - d.ay) < MIN_DRAG) return;
    addRegion(regionFromPoints(nextId.current++, d.ax, d.ay, x, y));
  }

  function addRegion(r: Region) {
    setRegions((rs) => [...rs, r]);
    setPicks((p) => ({ ...p, [r.id]: { menuId: null, portion: 1 } }));
  }

  function removeRegion(id: number) {
    setRegions((rs) => rs.filter((r) => r.id !== id));
    setPicks((p) => {
      const next = { ...p };
      delete next[id];
      return next;
    });
  }

  const update = (id: number, patch: Partial<Pick>) => setPicks((p) => ({ ...p, [id]: { ...p[id], ...patch } }));
  const byId = new Map(menus.map((m) => [m.id, m]));
  const chosen = regions
    .map((r) => picks[r.id])
    .filter((p): p is Pick & { menuId: number } => p?.menuId != null)
    .map((p) => ({ menu: byId.get(p.menuId)!, portion: p.portion }));
  const total = sumItems(chosen);

  function onSave() {
    startSaving(async () => {
      const err = await saveMeal({ meal, items: chosen.map((c) => ({ menu_id: c.menu.id, portion: c.portion })) });
      if (err) setStatus(err);
    });
  }

  const box = (r: Region) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });

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

      {/* 1. 입력: 사진 + 사용자가 그린 음식 영역 */}
      {photo ? (
        <div
          className="relative touch-none select-none overflow-hidden rounded-xl border"
          style={{ aspectRatio: photo.aspect }}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 로컬 blob 미리보기라 next/image가 필요 없다 */}
          <img src={photo.url} alt="선택한 식판 사진" draggable={false} className="pointer-events-none block h-full w-full" />
          {regions.map((r, i) => (
            <div
              key={r.id}
              data-region={r.id}
              className="absolute cursor-move border-2 border-emerald-500 bg-emerald-500/10"
              style={box(r)}
            >
              <span className="absolute left-0 top-0 bg-emerald-500 px-1 text-[11px] text-white">{i + 1}</span>
              <button
                type="button"
                onClick={() => removeRegion(r.id)}
                aria-label={`영역 ${i + 1} 지우기`}
                className="absolute right-0 top-0 h-6 w-6 bg-white/90 text-sm leading-6 text-gray-700"
              >
                ×
              </button>
              <span
                data-handle
                aria-hidden
                className="absolute -bottom-1.5 -right-1.5 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-emerald-500"
              />
            </div>
          ))}
          {draft && <div className="absolute border-2 border-dashed border-emerald-600" style={box(draft)} />}
        </div>
      ) : (
        <label className="block cursor-pointer rounded-xl border-2 border-dashed text-center text-sm">
          <span className="block aspect-[4/3] w-full content-center">식판 사진 찍기 / 고르기</span>
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </label>
      )}
      {photo && (
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => addRegion({ id: nextId.current++, x: 0.35, y: 0.35, w: 0.3, h: 0.3 })}
            className="rounded-lg border px-3 py-1"
          >
            영역 추가
          </button>
          <label className="cursor-pointer rounded-lg border px-3 py-1">
            다른 사진
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => onPhoto(e.target.files?.[0])} />
          </label>
        </div>
      )}
      <p className="text-xs text-gray-500">
        사진 위를 끌어서 음식 하나마다 네모를 그려 주세요. 네모를 끌면 이동, 오른쪽 아래 점을 끌면 크기 조절, ×는 삭제예요. 사진은 서버로
        보내지 않아요.
      </p>

      {/* 2. AI 결과 영역 */}
      <section className="space-y-2 rounded-2xl border p-4" aria-live="polite">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">인식 결과</h2>
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">AI 모델 연결 전 · 직접 선택</span>
        </div>
        <p className="text-xs text-gray-500">
          학습 중인 CNN이 연결되면 영역마다 메뉴 후보 3개와 모델 예측 확률이 여기에 표시돼요. 지금은 잘린 이미지를 보고 직접 골라 주세요.
        </p>
        {!regions.length && (
          <p className="text-sm text-gray-400">{photo ? "음식 영역을 그리면 잘라서 보여 드려요." : "사진을 고르면 시작할 수 있어요."}</p>
        )}
        <ul className="space-y-2">
          {regions.map((r, i) => {
            const p = picks[r.id] ?? { menuId: null, portion: 1 };
            return (
              <li key={r.id} className="flex items-center gap-2">
                <span className="w-4 text-center text-xs text-gray-500">{i + 1}</span>
                {thumbs[r.id] ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 캔버스 crop 미리보기 (모델 입력과 같은 224×224)
                  <img src={thumbs[r.id]} alt={`영역 ${i + 1}`} className="h-12 w-12 rounded" />
                ) : (
                  <span className="h-12 w-12 rounded bg-gray-100" />
                )}
                <select
                  value={p.menuId ?? ""}
                  onChange={(e) => update(r.id, { menuId: e.target.value ? Number(e.target.value) : null })}
                  className="min-w-0 flex-1 rounded border p-1 text-sm"
                  aria-label={`영역 ${i + 1} 메뉴`}
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
                  value={p.portion}
                  onChange={(e) => update(r.id, { portion: Number(e.target.value) })}
                  className="rounded border p-1 text-sm"
                  aria-label={`영역 ${i + 1} 양`}
                >
                  <option value={0.5}>0.5인분</option>
                  <option value={1}>1인분</option>
                  <option value={1.5}>1.5인분</option>
                </select>
              </li>
            );
          })}
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
