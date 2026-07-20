"use client";

import { useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  APPROVAL_THRESHOLD,
  REIMB_STATUS_LABEL,
  createReimbursement,
  deleteReimbursement,
  fmtDate,
  todayISO,
  updateReimbursement,
  type Account,
  type Category,
  type Reimbursement,
} from "@/lib/accounting";
import type { AccountingData } from "./useAccountingData";
import {
  Card,
  Empty,
  Field,
  GhostBtn,
  Modal,
  Money,
  PrimaryBtn,
  StatusPill,
  inputCls,
} from "./ui";
import { ReceiptInput, ReceiptLinks } from "./Receipts";

// 狀態排序：待辦優先
const STATUS_ORDER: Record<Reimbursement["status"], number> = {
  pending_approval: 0,
  approved: 1,
  ready: 2,
  rejected: 3,
  paid: 4,
};

export default function Reimbursements({
  teacher,
  data,
}: {
  teacher: Teacher;
  data: AccountingData;
}) {
  const { reimbursements, categories, accounts, teacherNames, refresh } = data;
  const [formFor, setFormFor] = useState<Reimbursement | "new" | null>(null);
  const [reject, setReject] = useState<Reimbursement | null>(null);
  const [pay, setPay] = useState<Reimbursement | null>(null);

  const expenseCats = useMemo(
    () => categories.filter((c) => c.kind === "expense" && c.active),
    [categories]
  );
  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );
  const acctName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts]
  );
  const payAccounts = useMemo(
    () => accounts.filter((a) => a.active),
    [accounts]
  );

  const sorted = useMemo(
    () =>
      [...reimbursements].sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          +new Date(b.created_at) - +new Date(a.created_at)
      ),
    [reimbursements]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-black/55">
          先自掏腰包 → 附收據 → 每週確認付款。超過 ${APPROVAL_THRESHOLD} 需事前申請核准。
        </p>
        <PrimaryBtn onClick={() => setFormFor("new")}>＋ 新增代墊</PrimaryBtn>
      </div>

      {sorted.length === 0 ? (
        <Empty>目前沒有代墊紀錄</Empty>
      ) : (
        <div className="space-y-2">
          {sorted.map((r) => (
            <ReimbCard
              key={r.id}
              r={r}
              teacher={teacher}
              catName={catName}
              acctName={acctName}
              requesterName={
                teacher.is_admin
                  ? teacherNames.get(r.requester_id) ?? "—"
                  : teacher.name
              }
              onEdit={() => setFormFor(r)}
              onDelete={async () => {
                if (!confirm("確定刪除這筆代墊？")) return;
                const { error } = await deleteReimbursement(r.id);
                if (error) alert(error);
                else await refresh();
              }}
              onApprove={async () => {
                const { error } = await updateReimbursement(r.id, {
                  status: "approved",
                });
                if (error) alert(error);
                else await refresh();
              }}
              onReject={() => setReject(r)}
              onPay={() => setPay(r)}
              onRevertPay={async () => {
                if (!confirm("取消這筆付款？流水帳會一併還原。")) return;
                const { error } = await updateReimbursement(r.id, {
                  status: "ready",
                  paid_account_id: null,
                });
                if (error) alert(error);
                else await refresh();
              }}
            />
          ))}
        </div>
      )}

      {formFor && (
        <ReimbForm
          teacher={teacher}
          existing={formFor === "new" ? null : formFor}
          categories={expenseCats}
          onClose={() => setFormFor(null)}
          onSaved={async () => {
            setFormFor(null);
            await refresh();
          }}
        />
      )}

      {reject && (
        <RejectModal
          onClose={() => setReject(null)}
          onConfirm={async (reason) => {
            const { error } = await updateReimbursement(reject.id, {
              status: "rejected",
              reject_reason: reason,
            });
            if (error) alert(error);
            else {
              setReject(null);
              await refresh();
            }
          }}
        />
      )}

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
              await refresh();
            }
          }}
        />
      )}
    </div>
  );
}

function ReimbCard({
  r,
  teacher,
  catName,
  acctName,
  requesterName,
  onEdit,
  onDelete,
  onApprove,
  onReject,
  onPay,
  onRevertPay,
}: {
  r: Reimbursement;
  teacher: Teacher;
  catName: Map<string, string>;
  acctName: Map<string, string>;
  requesterName: string;
  onEdit: () => void;
  onDelete: () => void;
  onApprove: () => void;
  onReject: () => void;
  onPay: () => void;
  onRevertPay: () => void;
}) {
  const mine = r.requester_id === teacher.id;
  const admin = teacher.is_admin;

  // 負責人可編輯：未付款者（金額鎖定由觸發器把關，表單也會 disable）
  const canEdit = mine && r.status !== "paid";
  const canDelete = (mine && r.status !== "paid") || admin;
  const canSubmitReceipt = mine && r.status === "approved";

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-navy">{r.description}</span>
            <StatusPill label={REIMB_STATUS_LABEL[r.status]} />
            {r.needs_approval && (
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-black/45">
                需事前核准
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-black/50">
            {admin && <span>申請人：{requesterName}</span>}
            <span>日期：{fmtDate(r.occurred_on)}</span>
            {r.category_id && <span>類別：{catName.get(r.category_id)}</span>}
            {r.status === "paid" && r.paid_account_id && (
              <span>由「{acctName.get(r.paid_account_id) ?? "—"}」支付</span>
            )}
          </div>
        </div>
        <Money value={r.amount} className="shrink-0 text-lg" />
      </div>

      {r.status === "rejected" && r.reject_reason && (
        <p className="mt-2 rounded-lg bg-brand/5 px-3 py-1.5 text-xs text-brand">
          退回原因：{r.reject_reason}
        </p>
      )}

      <div className="mt-2">
        <ReceiptLinks paths={r.receipt_paths} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {canSubmitReceipt && (
          <GhostBtn tone="ok" onClick={onEdit}>
            附收據 → 送出待付款
          </GhostBtn>
        )}
        {canEdit && !canSubmitReceipt && (
          <GhostBtn onClick={onEdit}>編輯</GhostBtn>
        )}
        {admin && r.status === "pending_approval" && (
          <>
            <GhostBtn tone="ok" onClick={onApprove}>
              核准
            </GhostBtn>
            <GhostBtn tone="danger" onClick={onReject}>
              退回
            </GhostBtn>
          </>
        )}
        {admin && r.status === "approved" && (
          <GhostBtn tone="danger" onClick={onReject}>
            退回
          </GhostBtn>
        )}
        {admin && r.status === "ready" && (
          <>
            <GhostBtn tone="ok" onClick={onPay}>
              付款
            </GhostBtn>
            <GhostBtn tone="danger" onClick={onReject}>
              退回
            </GhostBtn>
          </>
        )}
        {admin && r.status === "paid" && (
          <GhostBtn tone="danger" onClick={onRevertPay}>
            取消付款
          </GhostBtn>
        )}
        {canDelete && r.status !== "paid" && (
          <GhostBtn tone="danger" onClick={onDelete}>
            刪除
          </GhostBtn>
        )}
      </div>
    </Card>
  );
}

// 新增 / 編輯代墊表單
function ReimbForm({
  teacher,
  existing,
  categories,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  existing: Reimbursement | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const submitReceiptMode = existing?.status === "approved";
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [categoryId, setCategoryId] = useState<string>(
    existing?.category_id ?? categories[0]?.id ?? ""
  );
  const [description, setDescription] = useState(existing?.description ?? "");
  const [occurredOn, setOccurredOn] = useState(
    existing?.occurred_on ?? todayISO()
  );
  const [paths, setPaths] = useState<string[]>(existing?.receipt_paths ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 金額鎖定：已核准/待付款的單金額不可改（觸發器也會擋）
  const amountLocked =
    !!existing && ["approved", "ready", "paid"].includes(existing.status);

  const amountNum = Number(amount);
  const overThreshold = amountNum > APPROVAL_THRESHOLD;

  async function save() {
    setErr(null);
    if (!description.trim()) return setErr("請填寫用途說明");
    if (!amountNum || amountNum <= 0) return setErr("請填寫正確金額");
    setBusy(true);
    let res;
    if (!existing) {
      res = await createReimbursement({
        requesterId: teacher.id,
        amount: amountNum,
        categoryId: categoryId || null,
        description: description.trim(),
        occurredOn,
        receiptPaths: paths,
      });
    } else if (submitReceiptMode) {
      // 事前核准後補收據 → 進入待付款
      res = await updateReimbursement(existing.id, {
        receipt_paths: paths,
        status: "ready",
      });
    } else {
      const patch: Parameters<typeof updateReimbursement>[1] = {
        category_id: categoryId || null,
        description: description.trim(),
        occurred_on: occurredOn,
        receipt_paths: paths,
      };
      if (!amountLocked) patch.amount = amountNum;
      // 退回後重新編輯：送回審核流程
      if (existing.status === "rejected") {
        patch.status = amountNum > APPROVAL_THRESHOLD ? "pending_approval" : "ready";
        patch.reject_reason = null;
      }
      res = await updateReimbursement(existing.id, patch);
    }
    setBusy(false);
    if (res.error) setErr(res.error);
    else onSaved();
  }

  const title = !existing
    ? "新增代墊"
    : submitReceiptMode
    ? "附收據並送出付款"
    : "編輯代墊";

  return (
    <Modal title={title} onClose={onClose}>
      <div className="space-y-3">
        {!submitReceiptMode && (
          <>
            <Field label="用途說明">
              <input
                className={inputCls}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="例：買白板筆與教材紙"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="金額"
                hint={amountLocked ? "（已核准，不可改）" : undefined}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  className={inputCls}
                  value={amount}
                  disabled={amountLocked}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="日期">
                <input
                  type="date"
                  className={inputCls}
                  value={occurredOn}
                  onChange={(e) => setOccurredOn(e.target.value)}
                />
              </Field>
            </div>
            <Field label="類別">
              <select
                className={inputCls}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">未分類</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            {!existing && overThreshold && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                超過 ${APPROVAL_THRESHOLD}，送出後需宇群事前核准，核准後再購買、補收據。
              </p>
            )}
          </>
        )}

        <Field label="發票 / 收據">
          <ReceiptInput teacherId={teacher.id} paths={paths} onChange={setPaths} />
        </Field>

        {err && <p className="text-sm text-brand">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <GhostBtn onClick={onClose}>取消</GhostBtn>
          <PrimaryBtn onClick={save} disabled={busy}>
            {busy ? "儲存中…" : "儲存"}
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

// 退回原因
export function RejectModal({
  onClose,
  onConfirm,
}: {
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="退回並說明原因" onClose={onClose}>
      <div className="space-y-3">
        <Field label="退回原因">
          <textarea
            className={`${inputCls} h-24 resize-none`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例：金額與收據不符，請重新確認"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <GhostBtn onClick={onClose}>取消</GhostBtn>
          <PrimaryBtn
            onClick={() => onConfirm(reason.trim())}
            disabled={!reason.trim()}
          >
            確定退回
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

// 選擇付款帳戶
export function PayModal({
  accounts,
  amount,
  onClose,
  onConfirm,
}: {
  accounts: Account[];
  amount: number;
  onClose: () => void;
  onConfirm: (accountId: string) => void;
}) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  return (
    <Modal title="確認付款" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-black/60">
          付款金額 <Money value={amount} className="text-brand" />
        </p>
        <Field label="從哪個帳戶付款">
          <select
            className={inputCls}
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex justify-end gap-2">
          <GhostBtn onClick={onClose}>取消</GhostBtn>
          <PrimaryBtn onClick={() => onConfirm(accountId)} disabled={!accountId}>
            確定付款
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}
