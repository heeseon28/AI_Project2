import { notFound } from "next/navigation";
import { Suspense } from "react";
import { getSession } from "@/lib/supabase/server";

// 관리자 지정: Supabase SQL Editor에서 update profiles set role = 'admin' where id = '<uuid>';
// 실제 쓰기 권한은 RLS(is_admin)가 막고, 여기서는 화면만 숨긴다.
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">불러오는 중…</p>}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (session?.profile?.role !== "admin") notFound();
  return children;
}
