"use client";

import { useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import { useAccountingData } from "./useAccountingData";
import Dashboard from "./Dashboard";
import Reimbursements from "./Reimbursements";
import Collections from "./Collections";
import Ledger from "./Ledger";
import Settings from "./Settings";

export type AccountingTab =
  | "dashboard"
  | "reimb"
  | "collect"
  | "ledger"
  | "settings";

const TABS: { key: AccountingTab; label: string; adminOnly?: boolean }[] = [
  { key: "dashboard", label: "彙總" },
  { key: "reimb", label: "代墊" },
  { key: "collect", label: "收款" },
  { key: "ledger", label: "流水帳" },
  { key: "settings", label: "設定", adminOnly: true },
];

export default function AccountingApp({
  teacher,
  onSignOut,
  onSwitchModule,
}: {
  teacher: Teacher;
  onSignOut: () => void;
  onSwitchModule?: () => void;
}) {
  const [tab, setTab] = useState<AccountingTab>("dashboard");
  const data = useAccountingData(teacher.is_admin);

  // 分頁紅點：代墊/收款各自的待辦數
  const badges = useMemo(() => {
    const { reimbursements, collections } = data;
    const reimb = teacher.is_admin
      ? reimbursements.filter(
          (r) => r.status === "pending_approval" || r.status === "ready"
        ).length
      : reimbursements.filter(
          (r) => r.status === "rejected" || r.status === "approved"
        ).length;
    const collect = teacher.is_admin
      ? collections.filter((c) => c.status === "pending_confirm").length
      : 0;
    return { reimb, collect } as Record<AccountingTab, number>;
  }, [data, teacher.is_admin]);

  const tabs = TABS.filter((t) => !t.adminOnly || teacher.is_admin);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy">記帳 · 代墊 · 收款</h1>
          <p className="text-sm text-black/60">
            {teacher.name}
            {teacher.is_admin ? "（管理者）" : "（負責人）"}
          </p>
        </div>
        <div className="flex gap-2">
          {onSwitchModule && (
            <button
              onClick={onSwitchModule}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              🎵 排課
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

      {/* 分頁列 */}
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-2xl border border-black/10 bg-white/70 p-1">
        {tabs.map((t) => {
          const active = tab === t.key;
          const badge = badges[t.key] ?? 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative flex-1 whitespace-nowrap rounded-xl px-3 py-2 text-sm font-medium transition ${
                active
                  ? "bg-navy text-white shadow-sm"
                  : "text-black/55 hover:text-navy"
              }`}
            >
              {t.label}
              {badge > 0 && (
                <span
                  className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                    active ? "bg-white text-navy" : "bg-brand text-white"
                  }`}
                >
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {data.loading ? (
        <div className="py-16 text-center text-sm text-black/45">載入中…</div>
      ) : (
        <>
          {tab === "dashboard" && (
            <Dashboard teacher={teacher} data={data} onNavigate={setTab} />
          )}
          {tab === "reimb" && <Reimbursements teacher={teacher} data={data} />}
          {tab === "collect" && <Collections teacher={teacher} data={data} />}
          {tab === "ledger" && <Ledger teacher={teacher} data={data} />}
          {tab === "settings" && teacher.is_admin && <Settings data={data} />}
        </>
      )}
    </main>
  );
}
