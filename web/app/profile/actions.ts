"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getSession } from "@/lib/supabase/server";

const optionalNum = (min: number, max: number) =>
  z.preprocess((v) => (v === "" ? null : Number(v)), z.number().min(min).max(max).nullable());

const Input = z.object({
  sex: z.preprocess((v) => (v === "" ? null : v), z.enum(["male", "female"]).nullable()),
  weight_kg: optionalNum(30, 200),
  body_fat_pct: optionalNum(3, 60),
  activity_level: z.coerce.number().min(1.2).max(1.9),
  goal_mode: z.enum(["maintain", "muscle", "fat_loss", "exam"]),
});

export async function saveProfile(form: FormData) {
  const session = await getSession();
  if (!session) redirect("/login");
  const parsed = Input.safeParse(Object.fromEntries(form));
  if (!parsed.success) throw new Error("입력값을 확인해 주세요.");
  const { error } = await session.supabase.from("profiles").update(parsed.data).eq("id", session.user.id);
  if (error) throw error;
  redirect("/profile");
}
