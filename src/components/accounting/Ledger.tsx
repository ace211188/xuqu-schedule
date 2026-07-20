"use client";

import { useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  createEntry,
  createTransfer,
  deleteEntry,
  fmtDate,
  todayISO,
  type Account,
  type Category,
  type Entry,
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
  inputCls,
} from "./ui";

const SOURCE_LABEL: Record<Entry["source_type"], string> = {
  manual: "手動",
  reimbursement: "代墊付款",
  transfer: "轉帳",
  collection: "收款",
};

export default function Ledger({
  teacher,
  data,
}: {
  teacher: Teacher;
  data: AccountingData;
}) {
  const { entries, accounts, categories, refresh } = data;
  const [acctFilter, setAcctFilter] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [modal, setModal] = useState<"entry" | "transfer" | null>(null);

  const acctName = useMemo(
    () => new Map(accounts.map((a) => [a.id, a.name])),
    [accounts]
  );
  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  const filtered = useMemo(
    () =>
      entries.filter(
        (e) =>
          (!acctFilter || e.account_id === acctFilter) &&
          (!catFilter || e.category_id === catFilter)
      ),
    [entries, acctFilter, catFilter]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={`${inputCls} w-auto`}
          value={acctFilter}
          onChange={(e) => setAcctFilter(e.target.value)}
        >
          <option value="">全部帳戶</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          className={`${inputCls} w-auto`}
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
        >
          <option value="">全部類別</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {teacher.is_admin && (
          <div className="ml-auto flex gap-2">
            <GhostBtn onClick={() => setModal("transfer")}>⇄ 內部轉帳</GhostBtn>
            <PrimaryBtn onClick={() => setModal("entry")}>＋ 手動記帳</PrimaryBtn>
          </div>
        )}
      </div>

      {filtered.length === 0 ? (
        <Empty>沒有符合條件的分錄</Empty>
      ) : (
        <Card className="divide-y divide-black/5 p-0">
          {filtered.map((e) => (
            <div
              key={e.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-navy">
                    {e.note || (e.category_id ? catName.get(e.category_id) : "—")}
                  </span>
                  {e.source_type !== "manual" && (
                    <span className="shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-[10px] text-black/45">
                      {SOURCE_LABEL[e.source_type]}
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-black/45">
                  <span>{fmtDate(e.occurred_on)}</span>
                  <span>· {acctName.get(e.account_id) ?? "—"}</span>
                  {e.category_id && <span>· {catName.get(e.category_id)}</span>}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Money value={e.signed_amount} colored />
                {teacher.is_admin && e.source_type === "manual" && (
                  <button
                    onClick={async () => {
                      if (!confirm("刪除這筆分錄？")) return;
                      const { error } = await deleteEntry(e.id);
                      if (error) alert(error);
                      else await refresh();
                    }}
                    className="rounded-full px-1.5 text-black/30 hover:text-brand"
                    title="刪除"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      {modal === "entry" && (
        <EntryModal
          teacher={teacher}
          accounts={accounts.filter((a) => a.active)}
          categories={categories.filter((c) => c.active)}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await refresh();
          }}
        />
      )}
      {modal === "transfer" && (
        <TransferModal
          teacher={teacher}
          accounts={accounts.filter((a) => a.active)}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function EntryModal({
  teacher,
  accounts,
  categories,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  accounts: Account[];
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cats = categories.filter((c) => c.kind === kind);
  const amountNum = Number(amount);

  async function save() {
    setErr(null);
    if (!accountId) return setErr("請選擇帳戶");
    if (!amountNum || amountNum <= 0) return setErr("請填寫正確金額");
    setBusy(true);
    const { error } = await createEntry({
      accountId,
      signedAmount: kind === "expense" ? -amountNum : amountNum,
      categoryId: categoryId || null,
      occurredOn,
      note,
      createdBy: teacher.id,
    });
    setBusy(false);
    if (error) setErr(error);
    else onSaved();
  }

  return (
    <Modal title="手動記帳" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setCategoryId("");
              }}
              className={`flex-1 rounded-xl border py-2 text-sm font-medium transition ${
                kind === k
                  ? k === "expense"
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-[#8CA07C] bg-[#8CA07C]/10 text-[#5f7a4f]"
                  : "border-black/15 text-black/50"
              }`}
            >
              {k === "expense" ? "支出" : "收入"}
            </button>
          ))}
        </div>
        <Field label="帳戶">
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
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="備註">
          <input
            className={inputCls}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="選填"
          />
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

function TransferModal({
  teacher,
  accounts,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  accounts: Account[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fromId, setFromId] = useState(accounts[0]?.id ?? "");
  const [toId, setToId] = useState(accounts[1]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amountNum = Number(amount);

  async function save() {
    setErr(null);
    if (!fromId || !toId) return setErr("請選擇帳戶");
    if (fromId === toId) return setErr("轉出與轉入不能是同一帳戶");
    if (!amountNum || amountNum <= 0) return setErr("請填寫正確金額");
    setBusy(true);
    const { error } = await createTransfer({
      fromAccountId: fromId,
      toAccountId: toId,
      amount: amountNum,
      occurredOn,
      note,
      createdBy: teacher.id,
    });
    setBusy(false);
    if (error) setErr(error);
    else onSaved();
  }

  return (
    <Modal title="內部轉帳" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-black/50">
          帳戶間搬錢（例：美君主帳戶 → 宇群帳戶），不影響總收支。
        </p>
        <Field label="從（轉出）">
          <select
            className={inputCls}
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="到（轉入）">
          <select
            className={inputCls}
            value={toId}
            onChange={(e) => setToId(e.target.value)}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
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
        <Field label="備註">
          <input
            className={inputCls}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="選填"
          />
        </Field>
        {err && <p className="text-sm text-brand">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <GhostBtn onClick={onClose}>取消</GhostBtn>
          <PrimaryBtn onClick={save} disabled={busy}>
            {busy ? "儲存中…" : "轉帳"}
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}
