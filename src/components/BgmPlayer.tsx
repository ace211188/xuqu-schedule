"use client";

import { useEffect, useRef, useState } from "react";

const BASE = process.env.NODE_ENV === "production" ? "/xuqu-schedule" : "";

export default function BgmPlayer() {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(true); // 想不想聽（true = 有聲）

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = 0.32;
    a.loop = true;
    const off = localStorage.getItem("bgm-off") === "1";
    setOn(!off);
    a.muted = off;

    // 音樂一直保持「播放中」，開關只切靜音 → iOS 不需要重新 play，不會被擋
    const start = () => a.play().catch(() => {});
    const onGesture = () => start();
    const evs = ["pointerdown", "keydown", "touchstart"];
    evs.forEach((e) => document.addEventListener(e, onGesture, { passive: true }));
    start();

    return () => evs.forEach((e) => document.removeEventListener(e, onGesture));
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    const next = !on;
    setOn(next);
    localStorage.setItem("bgm-off", next ? "0" : "1");
    a.muted = !next;
    if (next) a.play().catch(() => {}); // 開的時候確保在播
  }

  return (
    <>
      <audio ref={audioRef} src={`${BASE}/bgm.mp3`} loop preload="auto" />
      <button
        onClick={toggle}
        aria-label="背景音樂開關"
        className="fixed bottom-3 right-3 z-40 flex h-10 w-10 items-center justify-center rounded-full bg-white/85 text-lg shadow-md ring-1 ring-black/10 backdrop-blur transition active:scale-90"
      >
        {on ? "🎵" : "🔇"}
      </button>
    </>
  );
}
