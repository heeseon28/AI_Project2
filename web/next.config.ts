import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // cacheComponents는 끈다: 켜면 OpenNext Cloudflare 미리보기에서 모든 페이지 렌더가 런타임 크래시 (2026-11 확인)
  /* config options here */
  turbopack: {
    root: process.cwd(), // 홈 폴더의 package-lock.json을 루트로 오인하지 않게
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

import('@opennextjs/cloudflare').then(m => m.initOpenNextCloudflareForDev());
