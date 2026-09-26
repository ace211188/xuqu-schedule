"use client";

import { useEffect, useState } from "react";
import { registerWithInvite } from "@/lib/attendance";

const BASE = process.env.NODE_ENV === "production" ? "/xuqu-schedule" : "";

const inputClass =
  "w-full rounded-xl border border-black/15 bg-white px-3 py-2.5 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/25";

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
  // 工讀生用邀請碼自己註冊。從邀請連結（…/?invite=ABCD2345）進來時，直接打開註冊並帶入邀請碼
  const [inviteCode] = useState(() =>
    typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("invite") ?? "").toUpperCase()
  );
  const [mode, setMode] = useState<"login" | "register">(() =>
    inviteCode ? "register" : "login"
  );

  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 2100);
    return () => clearTimeout(t);
  }, []);

  if (mode === "register") {
    return (
      <>
        {intro && <Splash />}
        <RegisterForm
          initialCode={inviteCode}
          onBack={() => setMode("login")}
          onLogin={onLogin}
        />
      </>
    );
  }

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
          <button
            type="button"
            onClick={() => setMode("register")}
            className="mx-auto mt-2 block text-xs font-medium text-navy/70 underline decoration-dotted underline-offset-2 hover:text-navy"
          >
            工讀生第一次使用？用邀請碼設定帳號 →
          </button>
        </div>
      </div>
    </>
  );
}

// ── 工讀生：用邀請碼自己設定帳號密碼（成功後自動登入）──
function RegisterForm({
  initialCode,
  onBack,
  onLogin,
}: {
  initialCode: string;
  onBack: () => void;
  onLogin: (name: string, password: string) => Promise<string | null>;
}) {
  const [code, setCode] = useState(initialCode);
  const [displayName, setDisplayName] = useState("");
  const [handle, setHandle] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const c = code.toUpperCase().replace(/[\s-]/g, "");
    const h = handle.trim().toLowerCase();
    if (c.length !== 8) return setErr("邀請碼是 8 碼，請再確認");
    if (!displayName.trim()) return setErr("請填你的名字");
    if (!/^[a-z0-9._-]+$/.test(h))
      return setErr("登入帳號只能用英文或數字（例：amei）");
    if (pw.length < 6) return setErr("密碼至少 6 碼");
    if (pw !== pw2) return setErr("兩次輸入的密碼不一樣");

    setBusy(true);
    const { error } = await registerWithInvite({
      code: c,
      name: displayName.trim(),
      handle: h,
      password: pw,
    });
    if (error) {
      setBusy(false);
      return setErr(error);
    }
    // 註冊成功：拿掉網址上的邀請碼，然後直接登入
    window.history.replaceState(null, "", window.location.pathname);
    const msg = await onLogin(h, pw);
    if (msg) {
      setBusy(false);
      setErr(`帳號已建立！請回登入頁用「${h}」和你設的密碼登入。`);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="form-reveal w-full max-w-sm">
        <div className="mb-5 text-center">
          <h1 className="text-xl font-bold text-navy">工讀生帳號設定</h1>
          <p className="mt-1 text-sm text-black/55">
            輸入管理員給你的邀請碼，自己設定登入帳號和密碼
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-3 rounded-2xl border border-black/10 bg-white/80 p-5 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-black/70">邀請碼</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="8 碼，例如 K7PM3QXA"
              autoCapitalize="characters"
              autoCorrect="off"
              className={`${inputClass} font-mono tracking-widest`}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-black/70">你的名字</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="例：陳小美"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-black/70">
              登入帳號 <span className="font-normal text-black/40">（英文或數字）</span>
            </label>
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="例：amei"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-black/70">
              密碼 <span className="font-normal text-black/40">（至少 6 碼）</span>
            </label>
            <input
              type="password"
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-black/70">再輸入一次密碼</label>
            <input
              type="password"
              value={pw2}
              onChange={(e) => setPw2(e.target.value)}
              autoComplete="new-password"
              className={inputClass}
            />
          </div>

          {err && (
            <p className="rounded-lg bg-brand/10 px-3 py-2 text-sm text-brand">{err}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-navy py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-navy/90 disabled:opacity-60"
          >
            {busy ? "設定中…" : "建立帳號並登入"}
          </button>
        </form>

        <button
          type="button"
          onClick={onBack}
          className="mx-auto mt-4 block text-xs text-black/50 hover:text-navy"
        >
          ← 回登入頁
        </button>
      </div>
    </div>
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
