"use client";

import type { Teacher } from "@/lib/useAuth";
import Closing from "./accounting/Closing";

export default function ClosingApp({
  teacher,
  onSignOut,
  onSwitchModule,
  onOpenMySchedule,
  onOpenStudents,
  onOpenAccounting,
}: {
  teacher: Teacher;
  onSignOut: () => void;
  onSwitchModule?: () => void; // 排課後台 / 排課
  onOpenMySchedule?: () => void;
  onOpenStudents?: () => void;
  onOpenAccounting?: () => void;
}) {
  return (
    <main className="relative mx-auto min-h-screen w-full max-w-3xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy">打烊紀錄</h1>
          <p className="text-sm text-black/60">
            {teacher.name}
            {teacher.is_admin ? "（管理者）" : ""}・打烊檢查與零用金盤點
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onSwitchModule && (
            <button
              onClick={onSwitchModule}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              {onOpenMySchedule ? "🛠️ 排課後台" : "🎵 排課"}
            </button>
          )}
          {onOpenMySchedule && (
            <button
              onClick={onOpenMySchedule}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              🗓️ 我的排課
            </button>
          )}
          {onOpenStudents && (
            <button
              onClick={onOpenStudents}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              🎓 學生資料
            </button>
          )}
          {onOpenAccounting && (
            <button
              onClick={onOpenAccounting}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              💰 記帳
            </button>
          )}
          <button
            onClick={onSignOut}
            className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
          >
            登出
          </button>
        </div>
      </header>

      <Closing teacher={teacher} />
    </main>
  );
}
