import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "학식 코치",
  description: "KENTECH 학식 영양 분석·전략 추천",
};

const NAV = [
  { href: "/", label: "홈" },
  { href: "/log/new", label: "기록" },
  { href: "/dashboard", label: "분석" },
  { href: "/profile", label: "내 정보" },
];

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="mx-auto flex min-h-full max-w-md flex-col px-4 pb-20 pt-4">
        <main className="flex-1 space-y-4">{children}</main>
        {/* PRD M9 안전장치 문구 */}
        <footer className="mt-8 text-xs text-gray-500">
          영양 수치는 추정치예요. 이 서비스는 의료·영양 상담을 대신하지 않아요.
        </footer>
        <nav className="fixed inset-x-0 bottom-0 border-t bg-background">
          <ul className="mx-auto flex max-w-md justify-around py-3 text-sm">
            {NAV.map((n) => (
              <li key={n.href}>
                <Link href={n.href}>{n.label}</Link>
              </li>
            ))}
          </ul>
        </nav>
      </body>
    </html>
  );
}
