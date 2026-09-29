"use client";

import { useEffect, useState } from "react";

const BASE = process.env.NODE_ENV === "production" ? "/xuqu-schedule" : "";

export default function Login({
  onLogin,
}: {
  onLogin: (name: string, password: string) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [intro, setIntro] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 2100);
    return () => clearTimeout(t);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !pw) return;
    setBusy(true);
    setErr(null);
    const msg = await onLogin(name, pw);
    if (msg) {
      setErr("帳號或密碼不對，再試一次看看 🙂");
      setBusy(false);
    }
  }

  return (
    <>
      {intro && <Splash />}

      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="form-reveal w-full max-w-sm" style={{ perspective: 800 }}>
          <div className="mb-6 text-center">
            <div className="relative mx-auto mb-4 h-24 w-24">
              <span className="logo-glow absolute inset-0 rounded-full bg-brand/30 blur-xl" />
              <div className="logo-anim absolute inset-0 flex items-center justify-center rounded-full bg-white shadow-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${BASE}/logo-mark.png`}
                  alt="序曲音樂學院"
                  width={64}
                  height={64}
                  className="h-14 w-14 object-contain"
                />
              </div>
            </div>
            <h1 className="text-xl font-bold text-navy">序曲音樂學院</h1>
            <p className="mt-1 text-sm text-black/55">老師排課收集 · 歡迎回來</p>
          </div>

          <form
            onSubmit={submit}
            className="rounded-2xl border border-black/10 bg-white/80 p-5 shadow-sm"
          >
            <label className="mb-1 block text-sm font-medium text-black/70">
              帳號
            </label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 meijun"
              autoCapitalize="none"
              autoCorrect="off"
              className="mb-4 w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/25"
            />

            <label className="mb-1 block text-sm font-medium text-black/70">
              密碼
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              placeholder="請輸入密碼"
              className="mb-4 w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/25"
            />

            {err && (
              <p className="mb-3 rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">
                {err}
              </p>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-navy py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-navy/90 disabled:opacity-60"
            >
              {busy ? "登入中…" : "登入"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-black/40">
            忘記帳號密碼？請聯絡學院管理員 💛
          </p>
        </div>
      </div>
    </>
  );
}

// 開場：logo 旋轉彈入、光環擴散、音符飄升、院名浮現
function Splash() {
  const notes = ["♪", "♫", "♩", "♬", "♪", "♫"];
  return (
    <div className="splash-overlay fixed inset-0 z-50 flex flex-col items-center justify-center bg-[#fffdf7]">
      <div className="relative flex h-40 w-40 items-center justify-center">
        {/* 擴散光環 */}
        <span
          className="splash-ring absolute h-28 w-28 rounded-full border-2 border-brand/40"
          style={{ animationDelay: "0s" }}
        />
        <span
          className="splash-ring absolute h-28 w-28 rounded-full border-2 border-brand/30"
          style={{ animationDelay: "0.5s" }}
        />
        <span
          className="splash-ring absolute h-28 w-28 rounded-full border-2 border-brand/20"
          style={{ animationDelay: "1s" }}
        />
        {/* 飄升音符 */}
        {notes.map((n, i) => (
          <span
            key={i}
            className="note-rise absolute text-brand/70"
            style={{
              left: `${12 + i * 14}%`,
              bottom: "8%",
              fontSize: `${14 + (i % 3) * 6}px`,
              animationDelay: `${0.3 + i * 0.22}s`,
            }}
          >
            {n}
          </span>
        ))}
        {/* logo */}
        <div className="splash-logo relative flex h-24 w-24 items-center justify-center rounded-3xl bg-white shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`${BASE}/logo-mark.png`}
            alt="序曲音樂學院"
            width={64}
            height={64}
            className="h-16 w-16 object-contain"
          />
        </div>
      </div>
      <p className="splash-title mt-6 text-lg font-bold tracking-wider text-navy">
        序曲音樂學院
      </p>
    </div>
  );
}
