import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "@/components/PwaRegister";
import BgmPlayer from "@/components/BgmPlayer";

const base = process.env.NODE_ENV === "production" ? "/xuqu-schedule" : "";

export const metadata: Metadata = {
  title: "序曲排課收集",
  description: "序曲音樂學院 — 每月老師排課收集",
  manifest: `${base}/manifest.webmanifest`,
  icons: {
    icon: `${base}/icon-192.png`,
    apple: `${base}/apple-touch-icon.png`,
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "序曲排課",
  },
};

export const viewport: Viewport = {
  themeColor: "#c1272d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        {children}
        <BgmPlayer />
        <PwaRegister />
      </body>
    </html>
  );
}
