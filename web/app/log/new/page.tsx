import { connection } from "next/server";
import { Suspense } from "react";
import { currentMeal } from "@/lib/date";
import { createClient, getSession, supabaseConfigured } from "@/lib/supabase/server";
import type { Menu } from "@/lib/types";
import { LogForm } from "./LogForm";

// 로그인 없이 열린다 (과제: 강사가 배포 URL에서 바로 입력 화면을 볼 수 있어야 함). 저장만 로그인 필요.
export default function NewLogPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">불러오는 중…</p>}>
      <NewLog />
    </Suspense>
  );
}

async function NewLog() {
  await connection(); // 기본 끼니가 지금 시각에 따라 달라서 요청마다 렌더
  let menus: Menu[] = [];
  let loggedIn = false;
  if (supabaseConfigured) {
    const supabase = await createClient();
    const { data } = await supabase.from("menus").select("*").order("name").returns<Menu[]>();
    menus = data ?? [];
    loggedIn = (await getSession()) !== null;
  }
  return (
    <>
      <h1 className="text-xl font-bold">식판 인식</h1>
      <LogForm menus={menus} defaultMeal={currentMeal()} loggedIn={loggedIn} />
    </>
  );
}
