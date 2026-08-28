"use client";

import { useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  fmtMoney,
  fmtDate,
  updateReimbursement,
  REIMB_STATUS_LABEL,
  type Account,
  type Reimbursement,
} from "@/lib/accounting";
import type { AccountingData } from "./useAccountingData";
import type { AccountingTab } from "./AccountingApp";
import { Card, Empty, GhostBtn, Modal, Money, SectionTitle, StatusPill } from "./ui";
import { PayModal } from "./Reimbursements";
import { ReceiptLinks } from "./Receipts";
import { CountMoney } from "./anim";

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
  const { reimbursements, collections, balances, teacherNames, accounts, categories, refresh } =
    data;

  // 點某人名字 → 跳出他的待付款明細
  const [personId, setPersonId] = useState<string | null>(null);
  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );
  const payAccounts = useMemo(() => accounts.filter((a) => a.active), [accounts]);

  const pendingApproval = reimbursements.filter(
    (r) => r.status === "pending_approval"
  );
  const readyToPay = reimbursements.filter((r) => r.status === "ready");
  const pendingConfirm = collections.filter(
    (c) => c.status === "pending_confirm"
  );

  const payTotal = readyToPay.reduce((s, r) => s + r.amount, 0);

  const totalBalance = useMemo(
    () => balances.reduce((s, b) => s + b.balance, 0),
    [balances]
  );

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
                onClick={() => setPersonId(id)}
                className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-black/[0.02]"
              >
                <span className="font-medium text-navy underline decoration-dotted decoration-black/25 underline-offset-4">
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
        {/* 總餘額：所有帳戶加總（轉帳互抵，故直接加總即為總資金） */}
        <div className="mb-2 flex items-baseline justify-between rounded-2xl border border-navy/20 bg-navy/[0.04] px-4 py-3">
          <span className="text-sm font-medium text-black/60">總餘額</span>
          <CountMoney
            value={totalBalance}
            className={`text-2xl font-bold ${
              totalBalance < 0 ? "text-brand" : "text-navy"
            }`}
          />
        </div>
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

      {personId && (
        <PersonPayModal
          name={teacherNames.get(personId) ?? "—"}
          items={readyToPay.filter((r) => r.requester_id === personId)}
          payAccounts={payAccounts}
          catName={catName}
          onClose={() => setPersonId(null)}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

// 某人的待付款明細（彈窗；可直接付款、看收據）
function PersonPayModal({
  name,
  items,
  payAccounts,
  catName,
  onClose,
  onChanged,
}: {
  name: string;
  items: Reimbursement[];
  payAccounts: Account[];
  catName: Map<string, string>;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [pay, setPay] = useState<Reimbursement | null>(null);
  const total = items.reduce((s, r) => s + r.amount, 0);
  return (
    <Modal title={`${name}・待付款明細`} onClose={onClose}>
      <div className="space-y-2 pb-2">
        {items.length === 0 ? (
          <Empty>沒有待付款項目 🎉</Empty>
        ) : (
          <>
            {items.map((r) => (
              <Card key={r.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-navy">
                        {r.description}
                      </span>
                      <StatusPill label={REIMB_STATUS_LABEL[r.status]} />
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-black/50">
                      <span>日期：{fmtDate(r.occurred_on)}</span>
                      {r.category_id && (
                        <span>類別：{catName.get(r.category_id) ?? "—"}</span>
                      )}
                    </div>
                  </div>
                  <Money value={r.amount} className="shrink-0 text-lg" />
                </div>
                <div className="mt-2">
                  <ReceiptLinks paths={r.receipt_paths} />
                </div>
                <div className="mt-3">
                  <GhostBtn tone="ok" onClick={() => setPay(r)}>
                    付款
                  </GhostBtn>
                </div>
              </Card>
            ))}
            <div className="flex items-center justify-between px-1 pt-1 text-sm">
              <span className="text-black/50">合計</span>
              <Money value={total} className="text-brand" />
            </div>
          </>
        )}
      </div>

      {pay && (
        <PayModal
          accounts={payAccounts}
          amount={pay.amount}
          onClose={() => setPay(null)}
          onConfirm={async (accountId) => {
            const { error } = await updateReimbursement(pay.id, {
              status: "paid",
              paid_account_id: accountId,
            });
            if (error) alert(error);
            else {
              setPay(null);
              await onChanged();
            }
          }}
        />
      )}
    </Modal>
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
