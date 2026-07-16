import type { NextConfig } from "next";

// GitHub Pages 會把網站放在 https://<帳號>.github.io/<repo>/ 底下，
// 所以正式建置時要加上 repo 名稱當基底路徑；本機開發(dev)維持根路徑。
const isProd = process.env.NODE_ENV === "production";
const repo = "xuqu-schedule";

const nextConfig: NextConfig = {
  output: "export", // 匯出成純靜態網頁（放 GitHub Pages）
  images: { unoptimized: true },
  basePath: isProd ? `/${repo}` : "",
  assetPrefix: isProd ? `/${repo}/` : "",
  trailingSlash: true,
};

export default nextConfig;
