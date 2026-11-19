"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// 권한은 RLS의 is_admin()이 막는다. 관리자가 아니면 insert가 실패한다.
async function run(table: string, op: "insert" | "delete", payload: Record<string, unknown>) {
  const supabase = await createClient();
  const { error } =
    op === "insert" ? await supabase.from(table).insert(payload) : await supabase.from(table).delete().eq("id", payload.id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/menu");
}

const num = z.coerce.number().min(0);

export async function addMenu(form: FormData) {
  const d = z
    .object({
      name: z.string().trim().min(1),
      kcal: num,
      carb: num,
      protein: num,
      fat: num,
      sodium: num,
      price: z.preprocess((v) => (v === "" ? null : Number(v)), z.number().int().min(0).nullable()),
    })
    .parse(Object.fromEntries(form));
  await run("menus", "insert", d);
}

export async function addWeeklyMenu(form: FormData) {
  const d = z
    .object({
      date: z.iso.date(),
      meal: z.enum(["breakfast", "lunch", "dinner"]),
      corner: z.string().trim().min(1).max(10),
      menu_id: z.coerce.number().int().positive(),
    })
    .parse(Object.fromEntries(form));
  await run("weekly_menu", "insert", d);
}

export async function deleteWeeklyMenu(form: FormData) {
  await run("weekly_menu", "delete", { id: z.coerce.number().int().parse(form.get("id")) });
}
