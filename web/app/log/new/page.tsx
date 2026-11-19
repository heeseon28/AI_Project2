import { redirect } from "next/navigation";
import { Suspense } from "react";
import { currentMeal } from "@/lib/date";
import { getSession } from "@/lib/supabase/server";
import type { Menu } from "@/lib/types";
import { LogForm } from "./LogForm";

export default function NewLogPage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">불러오는 중…</p>}>
      <NewLog />
    </Suspense>
  );
}

async function NewLog() {
  const session = await getSession();
  if (!session) redirect("/login");
  const { data: menus, error } = await session.supabase.from("menus").select("*").order("name").returns<Menu[]>();
  if (error) throw error;
  return (
    <>
      <h1 className="text-xl font-bold">식판 기록</h1>
      <LogForm menus={menus} defaultMeal={currentMeal()} />
    </>
  );
}
