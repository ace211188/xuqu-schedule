"use client";

import { useCallback, useEffect, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  checkIn,
  fetchAttendanceStatus,
  fmtTime,
  type AttendanceStatus,
} from "@/lib/attendance";
import Closing from "./accounting/Closing";

type WorkerTab = "checkin" | "closing";

export default function WorkerApp({
  teacher,
  onSignOut,
}: {
  teacher: Teacher;
  onSignOut: () => void;
}) {
  const [tab, setTab] = useState<WorkerTab>("checkin");

  return (
    <main
      className={`mx-auto flex min-h-screen w-full flex-col px-5 py-8 ${
        tab === "closing" ? "max-w-3xl" : "max-w-md"
      }`}
    >
      <header className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-navy">
            {tab === "closing" ? "打烊紀錄" : "工讀生簽到"}
          </h1>
          <p className="text-sm text-black/55">{teacher.name}</p>
        </div>
        <button
          onClick={onSignOut}
          className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
        >
          登出
        </button>
      </header>

      {/* 簽到 / 打烊 切換 */}
      <div className="mb-6 flex gap-1 rounded-2xl border border-black/10 bg-white/70 p-1">
        {(
          [
            ["checkin", "🖐️ 簽到"],
            ["closing", "🌙 打烊"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 rounded-xl px-3.5 py-2 text-sm font-medium transition active:scale-95 ${
              tab === key ? "bg-navy text-white shadow-sm" : "text-black/55 hover:text-navy"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "closing" ? <Closing teacher={teacher} /> : <CheckInPanel />}
    </main>
  );
}

function CheckInPanel() {
  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setErr(null);
    const s = await fetchAttendanceStatus();
    setStatus(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onSite = status?.onSite ?? false;
  const checkedIn = status?.today.checkedIn ?? false;

  async function doCheckIn() {
    setBusy(true);
    setErr(null);
    const { today, error } = await checkIn();
    setBusy(false);
    if (error) {
      setErr(error);
      // 失敗時把最新網路狀態抓回來（可能是網路不對）
      void refresh();
      return;
    }
    setStatus((s) => (s ? { ...s, onSite: true, today: today ?? s.today } : s));
  }

  return (
    <>
      {loading ? (
        <div className="py-20 text-center text-sm text-black/45">載入中…</div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-6">
          {/* 網路狀態 */}
          <div
            className={`flex w-full items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${
              onSite
                ? "border-[#8CA07C]/40 bg-[#8CA07C]/10 text-[#5f7a4f]"
                : "border-amber-300/50 bg-amber-50 text-amber-700"
            }`}
          >
            <span className="text-lg">{onSite ? "✅" : "📶"}</span>
            <span className="flex-1">
              {onSite
                ? "已連上教室網路，可以簽到"
                : "請先連上教室網路後再簽到"}
            </span>
            <button
              onClick={refresh}
              className="shrink-0 rounded-full border border-current/30 px-2.5 py-1 text-xs opacity-80 hover:opacity-100"
            >
              重新檢查
            </button>
          </div>

          {/* 今天狀態 / 簽到大按鈕 */}
          {checkedIn ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <div className="flex h-28 w-28 items-center justify-center rounded-full bg-[#8CA07C]/15 text-5xl">
                ✓
              </div>
              <p className="text-lg font-semibold text-navy">今天已簽到</p>
              <p className="text-sm text-black/55">
                簽到時間 {fmtTime(status?.today.checkInAt)}
              </p>
            </div>
          ) : (
            <button
              onClick={doCheckIn}
              disabled={!onSite || busy}
              className="flex h-40 w-40 flex-col items-center justify-center rounded-full bg-brand text-white shadow-lg transition active:scale-95 disabled:cursor-not-allowed disabled:bg-black/20 disabled:text-black/40"
            >
              <span className="text-3xl">🖐️</span>
              <span className="mt-1 text-lg font-bold">
                {busy ? "簽到中…" : "簽到"}
              </span>
            </button>
          )}

          {!onSite && !checkedIn && (
            <p className="text-center text-xs text-black/45">
              連上教室網路後按「重新檢查」，簽到按鈕就會亮起來。
            </p>
          )}

          {err && (
            <p className="w-full rounded-xl bg-brand/5 px-3 py-2 text-center text-sm text-brand">
              {err}
            </p>
          )}
        </div>
      )}
    </>
  );
}
