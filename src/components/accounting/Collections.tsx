"use client";

import { useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  COLLECTION_STATUS_LABEL,
  createCollection,
  deleteCollection,
  fmtDate,
  todayISO,
  updateCollection,
  type Account,
  type Category,
  type Collection,
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
import { RejectModal } from "./Reimbursements";

const STATUS_ORDER: Record<Collection["status"], number> = {
  pending_confirm: 0,
  rejected: 1,
  confirmed: 2,
};

export default function Collections({
  teacher,
  data,
}: {
  teacher: Teacher;
  data: AccountingData;
}) {
  const { collections, categories, accounts, teacherNames, refresh } = data;
  const [formFor, setFormFor] = useState<Collection | "new" | null>(null);
  const [reject, setReject] = useState<Collection | null>(null);
  const [confirmFor, setConfirmFor] = useState<Collection | null>(null);

  const incomeCats = useMemo(
    () => categories.filter((c) => c.kind === "income" && c.active),
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
  const heldAccounts = useMemo(() => accounts.filter((a) => a.active), [accounts]);

  const sorted = useMemo(
    () =>
      [...collections].sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          +new Date(b.created_at) - +new Date(a.created_at)
      ),
    [collections]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-black/55">
          代收的錢先放某帳戶 → 宇群確認入帳。之後繳回主帳戶用「流水帳」的內部轉帳處理。
        </p>
        <PrimaryBtn onClick={() => setFormFor("new")}>＋ 新增收款</PrimaryBtn>
      </div>

      {sorted.length === 0 ? (
        <Empty>目前沒有收款紀錄</Empty>
      ) : (
        <div className="space-y-2">
          {sorted.map((c) => (
            <CollectionCard
              key={c.id}
              c={c}
              teacher={teacher}
              catName={catName}
              acctName={acctName}
              collectorName={
                teacher.is_admin
                  ? teacherNames.get(c.collector_id) ?? "—"
                  : teacher.name
              }
              onEdit={() => setFormFor(c)}
              onDelete={async () => {
                if (!confirm("確定刪除這筆收款？")) return;
                const { error } = await deleteCollection(c.id);
                if (error) alert(error);
                else await refresh();
              }}
              onConfirm={() => setConfirmFor(c)}
              onReject={() => setReject(c)}
              onRevert={async () => {
                if (!confirm("取消確認？流水帳會一併還原。")) return;
                const { error } = await updateCollection(c.id, {
                  status: "pending_confirm",
                  held_account_id: null,
                });
                if (error) alert(error);
                else await refresh();
              }}
            />
          ))}
        </div>
      )}

      {formFor && (
        <CollectionForm
          teacher={teacher}
          existing={formFor === "new" ? null : formFor}
          categories={incomeCats}
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
            const { error } = await updateCollection(reject.id, {
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

      {confirmFor && (
        <ConfirmModal
          accounts={heldAccounts}
          amount={confirmFor.amount}
          onClose={() => setConfirmFor(null)}
          onConfirm={async (accountId) => {
            const { error } = await updateCollection(confirmFor.id, {
              status: "confirmed",
              held_account_id: accountId,
            });
            if (error) alert(error);
            else {
              setConfirmFor(null);
              await refresh();
            }
          }}
        />
      )}
    </div>
  );
}

function CollectionCard({
  c,
  teacher,
  catName,
  acctName,
  collectorName,
  onEdit,
  onDelete,
  onConfirm,
  onReject,
  onRevert,
}: {
  c: Collection;
  teacher: Teacher;
  catName: Map<string, string>;
  acctName: Map<string, string>;
  collectorName: string;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
  onReject: () => void;
  onRevert: () => void;
}) {
  const mine = c.collector_id === teacher.id;
  const admin = teacher.is_admin;
  const canEdit = mine && c.status !== "confirmed";
  const canDelete = (mine && c.status !== "confirmed") || admin;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-navy">{c.description}</span>
            <StatusPill label={COLLECTION_STATUS_LABEL[c.status]} />
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-black/50">
            {admin && <span>收款人：{collectorName}</span>}
            <span>日期：{fmtDate(c.occurred_on)}</span>
            {c.category_id && <span>類別：{catName.get(c.category_id)}</span>}
            {c.status === "confirmed" && c.held_account_id && (
              <span>入「{acctName.get(c.held_account_id) ?? "—"}」</span>
            )}
          </div>
        </div>
        <Money value={c.amount} colored className="shrink-0 text-lg" />
      </div>

      {c.status === "rejected" && c.reject_reason && (
        <p className="mt-2 rounded-lg bg-brand/5 px-3 py-1.5 text-xs text-brand">
          退回原因：{c.reject_reason}
        </p>
      )}

      <div className="mt-2">
        <ReceiptLinks paths={c.receipt_paths} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {canEdit && <GhostBtn onClick={onEdit}>編輯</GhostBtn>}
        {admin && c.status === "pending_confirm" && (
          <>
            <GhostBtn tone="ok" onClick={onConfirm}>
              確認入帳
            </GhostBtn>
            <GhostBtn tone="danger" onClick={onReject}>
              退回
            </GhostBtn>
          </>
        )}
        {admin && c.status === "confirmed" && (
          <GhostBtn tone="danger" onClick={onRevert}>
            取消確認
          </GhostBtn>
        )}
        {canDelete && c.status !== "confirmed" && (
          <GhostBtn tone="danger" onClick={onDelete}>
            刪除
          </GhostBtn>
        )}
      </div>
    </Card>
  );
}

function CollectionForm({
  teacher,
  existing,
  categories,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  existing: Collection | null;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
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

  const amountNum = Number(amount);

  async function save() {
    setErr(null);
    if (!description.trim()) return setErr("請填寫收款說明");
    if (!amountNum || amountNum <= 0) return setErr("請填寫正確金額");
    setBusy(true);
    let res;
    if (!existing) {
      res = await createCollection({
        collectorId: teacher.id,
        amount: amountNum,
        categoryId: categoryId || null,
        description: description.trim(),
        occurredOn,
        receiptPaths: paths,
      });
    } else {
      const patch: Parameters<typeof updateCollection>[1] = {
        amount: amountNum,
        category_id: categoryId || null,
        description: description.trim(),
        occurred_on: occurredOn,
        receipt_paths: paths,
      };
      if (existing.status === "rejected") {
        patch.status = "pending_confirm";
        patch.reject_reason = null;
      }
      res = await updateCollection(existing.id, patch);
    }
    setBusy(false);
    if (res.error) setErr(res.error);
    else onSaved();
  }

  return (
    <Modal title={existing ? "編輯收款" : "新增收款"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="收款說明">
          <input
            className={inputCls}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例：小明 7 月學費（現金）"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="金額">
            <input
              type="number"
              inputMode="numeric"
              className={inputCls}
              value={amount}
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
        <Field label="收據 / 憑證">
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

function ConfirmModal({
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
    <Modal title="確認入帳" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-black/60">
          入帳金額 <Money value={amount} colored />
        </p>
        <Field label="錢放在哪個帳戶">
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
            確定入帳
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}
