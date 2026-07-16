"use client";

import { useEffect, useState } from "react";

const BASE = process.env.NODE_ENV === "production" ? "/xuqu-schedule" : "";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export default function PwaRegister() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    // 註冊 service worker
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${BASE}/sw.js`, { scope: `${BASE}/` })
        .catch(() => {});
    }

    // Android / 桌面 Chrome：攔截安裝提示，改成自己的按鈕
    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBIP);

    // iOS Safari：沒有 beforeinstallprompt，且非已安裝狀態 → 顯示手動加入提示
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // @ts-expect-error iOS 專用
      window.navigator.standalone === true;
    if (isIos && !standalone) {
      const dismissed = localStorage.getItem("ios-a2hs-dismissed");
      if (!dismissed) setShowIosHint(true);
    }

    return () => window.removeEventListener("beforeinstallprompt", onBIP);
  }, []);

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  if (deferred) {
    return (
      <button
        onClick={install}
        className="fixed bottom-4 left-1/2 z-40 -translate-x-1/2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:brightness-110 active:scale-95"
      >
        📲 加到主畫面，像 App 一樣用
      </button>
    );
  }

  if (showIosHint) {
    return (
      <div className="fixed bottom-4 left-1/2 z-40 w-[92%] max-w-sm -translate-x-1/2 rounded-2xl bg-white px-4 py-4 shadow-xl ring-1 ring-black/10">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-lg">📲</span>
          <p className="font-semibold text-navy">加到手機桌面，用起來更方便</p>
        </div>
        <p className="mb-2 text-sm leading-relaxed text-black/70">
          也才收得到每月排課提醒。三步驟：
        </p>
        <ol className="space-y-1.5 text-sm text-black/75">
          <li className="flex gap-2">
            <b className="text-brand">1.</b>
            <span>
              點手機最下方（或右上）的
              <b className="mx-1 rounded bg-black/5 px-1.5 py-0.5">分享</b>
              圖示（方框加向上箭頭 ⬆️）
            </span>
          </li>
          <li className="flex gap-2">
            <b className="text-brand">2.</b>
            <span>
              往下滑，點
              <b className="mx-1 rounded bg-black/5 px-1.5 py-0.5">加入主畫面</b>
            </span>
          </li>
          <li className="flex gap-2">
            <b className="text-brand">3.</b>
            <span>桌面就會出現序曲圖示，之後直接點它開啟 🎵</span>
          </li>
        </ol>
        <button
          onClick={() => {
            localStorage.setItem("ios-a2hs-dismissed", "1");
            setShowIosHint(false);
          }}
          className="mt-3 w-full rounded-lg bg-black/5 py-2 text-xs text-black/50"
        >
          知道了，先關閉
        </button>
      </div>
    );
  }

  return null;
}
