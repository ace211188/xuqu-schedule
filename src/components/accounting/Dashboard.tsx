"use client";

import { useMemo } from "react";
import type { Teacher } from "@/lib/useAuth";
import { fmtMoney, type Reimbursement } from "@/lib/accounting";
import type { AccountingData } from "./useAccountingData";
import type { AccountingTab } from "./AccountingApp";
import { Card, Empty, Money, SectionTitle } from "./ui";

export default function Dashboard({
  teacher,
  data,
  onNavigate,
}: {
  teacher: Teacher;
  data: AccountingData;
  onNavigate: (tab: AccountingTab) => void;
}) {
  return teacher.is_admin ? (
    <AdminSummary data={data} onNavigate={onNavigate} />
  ) : (
    <MemberSummary teacher={teacher} data={data} onNavigate={onNavigate} />
  );
}

function StatButton({
  label,
  value,
  tone = "default",
  onClick,
}: {
  label: string;
  value: string;
  tone?: "default" | "warn" | "brand";
  onClick: () => void;
}) {
  const ring =
    tone === "warn"
      ? "border-amber-200 bg-amber-50"
      : tone === "brand"
      ? "border-brand/20 bg-brand/5"
      : "border-black/10 bg-white/70";
  return (
    <button
      onClick={onClick}
      className={`acc-hover flex-1 rounded-2xl border ${ring} p-3 text-left`}
    >
      <div className="text-xs text-black/50">{label}</div>
      <div className="mt-1 text-lg font-bold text-navy">{value}</div>
    </button>
  );
}

function AdminSummary({
  data,
  onNavigate,
}: {
  data: AccountingData;
  onNavigate: (tab: AccountingTab) => void;
}) {
  const { reimbursements, collections, balances, teacherNames, accounts } = data;

  const pendingApproval = reimbursements.filter(
    (r) => r.status === "pending_approval"
  );
  const readyToPay = reimbursements.filter((r) => r.status === "ready");
  const pendingConfirm = collections.filter(
    (c) => c.status === "pending_confirm"
  );

  const payTotal = readyToPay.reduce((s, r) => s + r.amount, 0);

  // 待付款彙總：每人應付合計
  const perPerson = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of readyToPay)
      m.set(r.requester_id, (m.get(r.requester_id) ?? 0) + r.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [readyToPay]);

  // 主帳戶 vs 管理者帳戶淨額提示
  const mainBal = balances.find((b) => b.is_main);
  const adminAcct = accounts.find(
    (a) => a.owner_teacher_id && a.owner_teacher_id !== mainBal?.owner_teacher_id
  );
  const adminBal = adminAcct
    ? balances.find((b) => b.id === adminAcct.id)
    : undefined;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <StatButton
          label="待核准"
          value={`${pendingApproval.length} 筆`}
          tone={pendingApproval.length ? "warn" : "default"}
          onClick={() => onNavigate("reimb")}
        />
        <StatButton
          label="待付款"
          value={fmtMoney(payTotal)}
          tone={readyToPay.length ? "brand" : "default"}
          onClick={() => onNavigate("reimb")}
        />
        <StatButton
          label="待確認收款"
          value={`${pendingConfirm.length} 筆`}
          tone={pendingConfirm.length ? "warn" : "default"}
          onClick={() => onNavigate("collect")}
        />
      </div>

      <section>
        <SectionTitle>本週待付款（每人應付）</SectionTitle>
        {perPerson.length === 0 ? (
          <Empty>沒有待付款項目 🎉</Empty>
        ) : (
          <Card className="divide-y divide-black/5 p-0">
            {perPerson.map(([id, total]) => (
              <button
                key={id}
                onClick={() => onNavigate("reimb")}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-black/[0.02]"
              >
                <span className="font-medium text-navy">
                  {teacherNames.get(id) ?? "—"}
                </span>
                <Money value={total} className="text-brand" />
              </button>
            ))}
            <div className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="text-black/50">合計</span>
              <Money value={payTotal} className="text-brand" />
            </div>
          </Card>
        )}
      </section>

      {pendingConfirm.length > 0 && (
        <section>
          <SectionTitle>待確認收款</SectionTitle>
          <Card className="divide-y divide-black/5 p-0">
            {pendingConfirm.map((c) => (
              <button
                key={c.id}
                onClick={() => onNavigate("collect")}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-black/[0.02]"
              >
                <span className="min-w-0 truncate">
                  <span className="font-medium text-navy">{c.description}</span>
                  <span className="ml-2 text-xs text-black/45">
                    {teacherNames.get(c.collector_id) ?? "—"}
                  </span>
                </span>
                <Money value={c.amount} colored />
              </button>
            ))}
          </Card>
        </section>
      )}

      <section>
        <SectionTitle>各帳戶餘額</SectionTitle>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {balances.map((b) => (
            <Card key={b.id} className="p-3">
              <div className="flex items-center gap-1 text-xs text-black/50">
                {b.name}
                {b.is_main && (
                  <span className="rounded bg-navy/10 px-1 text-[10px] text-navy">
                    主
                  </span>
                )}
              </div>
              <Money value={b.balance} colored className="mt-1 text-base" />
            </Card>
          ))}
        </div>
      </section>

      {adminBal && adminBal.balance < 0 && mainBal && (
        <Card className="bg-amber-50">
          <p className="text-sm text-amber-800">
            「{adminAcct?.name}」目前為{" "}
            <b>{fmtMoney(adminBal.balance)}</b>，主帳戶「{mainBal.name}」宜撥款{" "}
            <b>{fmtMoney(-adminBal.balance)}</b> 補足（到「流水帳 → 內部轉帳」登記）。
          </p>
        </Card>
      )}
    </div>
  );
}

function MemberSummary({
  teacher,
  data,
  onNavigate,
}: {
  teacher: Teacher;
  data: AccountingData;
  onNavigate: (tab: AccountingTab) => void;
}) {
  const { reimbursements, collections } = data;

  const mine = reimbursements; // RLS 已限定為本人
  const needFix = mine.filter((r) => r.status === "rejected");
  const needReceipt = mine.filter((r) => r.status === "approved");
  const waitingPay = mine.filter((r) => r.status === "ready");
  const waitApprove = mine.filter((r) => r.status === "pending_approval");
  const owedToMe = waitingPay.reduce((s, r) => s + r.amount, 0);
  const myPendingCollect = collections.filter(
    (c) => c.status === "pending_confirm"
  );

  const actionItems: { r: Reimbursement; hint: string }[] = [
    ...needFix.map((r) => ({ r, hint: "被退回，請修正後重送" })),
    ...needReceipt.map((r) => ({ r, hint: "已核准，請購買並補收據" })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <StatButton
          label="待核准"
          value={`${waitApprove.length} 筆`}
          onClick={() => onNavigate("reimb")}
        />
        <StatButton
          label="待付給我"
          value={fmtMoney(owedToMe)}
          tone={owedToMe ? "brand" : "default"}
          onClick={() => onNavigate("reimb")}
        />
        <StatButton
          label="待確認收款"
          value={`${myPendingCollect.length} 筆`}
          onClick={() => onNavigate("collect")}
        />
      </div>

      <section>
        <SectionTitle>需要我處理</SectionTitle>
        {actionItems.length === 0 ? (
          <Empty>目前沒有待辦，讚 👍</Empty>
        ) : (
          <Card className="divide-y divide-black/5 p-0">
            {actionItems.map(({ r, hint }) => (
              <button
                key={r.id}
                onClick={() => onNavigate("reimb")}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-black/[0.02]"
              >
                <span className="min-w-0">
                  <span className="font-medium text-navy">{r.description}</span>
                  <span className="mt-0.5 block text-xs text-brand">{hint}</span>
                </span>
                <Money value={r.amount} />
              </button>
            ))}
          </Card>
        )}
      </section>
    </div>
  );
}
