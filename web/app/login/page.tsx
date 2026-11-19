"use client";

import { useActionState } from "react";
import { sendMagicLink } from "./actions";

export default function LoginPage() {
  const [message, action, pending] = useActionState(sendMagicLink, null);
  return (
    <form action={action} className="space-y-3 pt-16">
      <h1 className="text-2xl font-bold">학식 코치</h1>
      <p className="text-sm text-gray-500">이메일로 로그인 링크를 보내 드려요.</p>
      <input name="email" type="email" required placeholder="you@kentech.ac.kr" className="w-full rounded-lg border p-2" />
      <button disabled={pending} className="w-full rounded-lg bg-black p-2 text-white disabled:opacity-50">
        {pending ? "보내는 중…" : "로그인 링크 받기"}
      </button>
      {message && <p className="text-sm">{message}</p>}
    </form>
  );
}
