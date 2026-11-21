"use server";

import { headers } from "next/headers";
import { createClient, supabaseConfigured } from "@/lib/supabase/server";

export async function sendMagicLink(_prev: string | null, form: FormData): Promise<string> {
  const email = String(form.get("email") ?? "").trim();
  if (!supabaseConfigured) return "로그인 기능은 아직 준비 중이에요 (DB 연결 전).";
  if (!email.includes("@")) return "이메일을 확인해 주세요.";
  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  });
  return error ? `실패했어요: ${error.message}` : "메일함에서 로그인 링크를 눌러 주세요.";
}
