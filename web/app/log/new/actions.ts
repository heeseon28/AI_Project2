"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/supabase/server";

const Input = z.object({
  meal: z.enum(["breakfast", "lunch", "dinner"]),
  items: z
    .array(z.object({ menu_id: z.number().int().positive(), portion: z.number().positive().max(3) }))
    .min(1)
    .max(12),
});

export async function saveMeal(input: z.infer<typeof Input>): Promise<string | void> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return "메뉴를 하나 이상 골라 주세요.";
  const session = await getSession();
  if (!session) redirect("/login");

  const { data: log, error } = await session.supabase
    .from("meal_logs")
    .insert({ meal: parsed.data.meal })
    .select("id")
    .single();
  if (error) return error.message;

  const { error: itemsError } = await session.supabase
    .from("meal_items")
    .insert(parsed.data.items.map((i) => ({ ...i, meal_log_id: log.id })));
  if (itemsError) {
    await session.supabase.from("meal_logs").delete().eq("id", log.id); // 빈 기록이 남지 않게
    return itemsError.message;
  }
  redirect("/");
}
