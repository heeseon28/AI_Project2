import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { recognizeTray } from "@/lib/gemini";
import { getSession } from "@/lib/supabase/server";
import type { Meal, Menu, RecognizeResponse } from "@/lib/types";
import { kstDate } from "@/lib/date";

const MAX_BYTES = 4 * 1024 * 1024;
const MEALS: Meal[] = ["breakfast", "lunch", "dinner"];

type Env = { RECOGNIZE_LIMITER?: { limit(o: { key: string }): Promise<{ success: boolean }> } };

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "로그인이 필요해요" }, { status: 401 });

  const env = getCloudflareContext().env as Env;
  if (env.RECOGNIZE_LIMITER && !(await env.RECOGNIZE_LIMITER.limit({ key: session.user.id })).success) {
    return NextResponse.json({ error: "잠시 후 다시 시도해 주세요" }, { status: 429 });
  }

  const form = await req.formData();
  const image = form.get("image");
  const meal = form.get("meal") as Meal;
  if (!(image instanceof File) || !image.type.startsWith("image/") || image.size > MAX_BYTES || !MEALS.includes(meal)) {
    return NextResponse.json({ error: "4MB 이하 이미지와 끼니를 보내 주세요" }, { status: 400 });
  }

  const { data: rows, error } = await session.supabase
    .from("weekly_menu")
    .select("menu:menus(*)")
    .eq("date", kstDate())
    .eq("meal", meal)
    .returns<{ menu: Menu }[]>();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows.length) return NextResponse.json({ error: "오늘 식단표가 아직 없어요. 직접 골라 주세요" }, { status: 404 });

  const byName = new Map(rows.map((r) => [r.menu.name, r.menu]));
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "GEMINI_API_KEY가 없어요" }, { status: 500 });

  try {
    const data = Buffer.from(await image.arrayBuffer()).toString("base64");
    const result = await recognizeTray({ data, mimeType: image.type }, [...byName.keys()], {
      apiKey,
      model: process.env.GEMINI_MODEL ?? "gemini-flash-latest",
    });
    const body: RecognizeResponse = {
      items: result.items.map((i) => ({ slot: i.slot, menu: byName.get(i.menu_name) ?? null, confidence: i.confidence })),
    };
    return NextResponse.json(body);
  } catch (e) {
    console.error("recognize failed", e);
    return NextResponse.json({ error: "인식에 실패했어요. 직접 골라 주세요" }, { status: 502 });
  }
}
