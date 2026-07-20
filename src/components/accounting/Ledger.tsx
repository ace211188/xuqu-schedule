"use client";

import { useEffect, useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  createEntry,
  createTransfer,
  deleteEntry,
  fmtDate,
  fmtMoney,
  todayISO,
  type Account,
  type Category,
  type Entry,
} from "@/lib/accounting";
import type { AccountingData } from "./useAccountingData";
import {
  Empty,
  Field,
  GhostBtn,
  Modal,
  PrimaryBtn,
  Select,
  inputCls,
} from "./ui";
import { CountMoney } from "./anim";

const SOURCE_LABEL: Record<Entry["source_type"], string> = {
  manual: "",
  reimbursement: "代墊",
  transfer: "轉帳",
  collection: "收款",
};

// 一列＝一筆分錄，附「這筆之後的帳戶餘額」
type Row = Entry & { balanceAfter: number };
type MonthGroup = { key: string; label: string; income: number; expense: number; rows: Row[] };

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${y} 年 ${Number(m)} 月`;
}

export default function Ledger({
  teacher,
  data,
}: {
  teacher: Teacher;
  data: AccountingData;
}) {
  const { entries, accounts, categories, balances, refresh } = data;

  const defaultAcct = useMemo(
    () => accounts.find((a) => a.is_main)?.id ?? accounts[0]?.id ?? "",
    [accounts]
  );
  const [acctId, setAcctId] = useState("");
  useEffect(() => {
    if (!acctId && defaultAcct) setAcctId(defaultAcct);
  }, [defaultAcct, acctId]);

  const [q, setQ] = useState("");
  const [modal, setModal] = useState<"entry" | "transfer" | null>(null);
  const [openMonths, setOpenMonths] = useState<Set<string>>(new Set());

  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );
  const currentBalance =
    balances.find((b) => b.id === acctId)?.balance ??
    accounts.find((a) => a.id === acctId)?.opening_balance ??
    0;

  // 該帳戶分錄（日期新→舊），用權威餘額往回推每列餘額
  const rows: Row[] = useMemo(() => {
    const list = entries.filter((e) => e.account_id === acctId);
    let running = currentBalance;
    const out: Row[] = [];
    for (const e of list) {
      out.push({ ...e, balanceAfter: running });
      running -= e.signed_amount;
    }
    return out;
  }, [entries, acctId, currentBalance]);

  // 依月份分組
  const groups: MonthGroup[] = useMemo(() => {
    const map = new Map<string, MonthGroup>();
    for (const r of rows) {
      const key = r.occurred_on.slice(0, 7);
      let g = map.get(key);
      if (!g) {
        g = { key, label: monthLabel(key), income: 0, expense: 0, rows: [] };
        map.set(key, g);
      }
      if (r.signed_amount > 0) g.income += r.signed_amount;
      else g.expense += -r.signed_amount;
      g.rows.push(r);
    }
    return [...map.values()]; // rows 已是新→舊，故月份也是新→舊
  }, [rows]);

  // 預設展開最新（本月）那組
  useEffect(() => {
    if (groups.length && openMonths.size === 0) {
      setOpenMonths(new Set([groups[0].key]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  function toggleMonth(key: string) {
    setOpenMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const searching = q.trim().length > 0;
  const searchRows = useMemo(() => {
    if (!searching) return [];
    const kw = q.trim();
    return rows.filter(
      (r) =>
        (r.note ?? "").includes(kw) ||
        (r.category_id ? catName.get(r.category_id) ?? "" : "").includes(kw)
    );
  }, [rows, q, catName, searching]);

  return (
    <div className="space-y-3">
      {/* 帳戶 + 目前餘額 */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-40"
          value={acctId}
          onChange={setAcctId}
          options={accounts.map((a) => ({
            value: a.id,
            label: a.name + (a.is_main ? "（主）" : ""),
          }))}
        />
        <span className="acc-pop rounded-full bg-navy px-3 py-1.5 text-sm font-semibold text-white">
          餘額 <CountMoney value={currentBalance} />
        </span>
        {teacher.is_admin && (
          <div className="ml-auto flex gap-2">
            <GhostBtn onClick={() => setModal("transfer")}>⇄ 轉帳</GhostBtn>
            <PrimaryBtn onClick={() => setModal("entry")}>＋ 記一筆</PrimaryBtn>
          </div>
        )}
      </div>

      <input
        className={inputCls}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="🔍 搜尋項目（例：房租、學費）"
      />

      {/* 搜尋模式：攤平列出所有符合 */}
      {searching ? (
        searchRows.length === 0 ? (
          <Empty>沒有符合「{q}」的項目</Empty>
        ) : (
          <LedgerTable
            rows={searchRows}
            catName={catName}
            isAdmin={teacher.is_admin}
            onDelete={async (id) => {
              if (!confirm("刪除這筆？")) return;
              const { error } = await deleteEntry(id);
              if (error) alert(error);
              else await refresh();
            }}
          />
        )
      ) : groups.length === 0 ? (
        <Empty>這個帳戶還沒有紀錄</Empty>
      ) : (
        <div className="space-y-2">
          {groups.map((g, i) => {
            const open = openMonths.has(g.key);
            return (
              <div
                key={g.key}
                className="acc-reveal overflow-hidden rounded-2xl border border-black/10 bg-white/70"
                style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}
              >
                <button
                  onClick={() => toggleMonth(g.key)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left transition hover:bg-black/[0.02]"
                >
                  <span
                    className={`acc-caret text-black/40 ${open ? "acc-caret-open" : ""}`}
                  >
                    ▶
                  </span>
                  <span className="font-semibold text-navy">{g.label}</span>
                  {i === 0 && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-medium text-brand">
                      本月
                    </span>
                  )}
                  <span className="ml-auto flex gap-3 text-xs">
                    <span className="text-[#5f7a4f]">
                      收 {fmtMoney(g.income)}
                    </span>
                    <span className="text-brand">支 {fmtMoney(g.expense)}</span>
                  </span>
                </button>
                {open && (
                  <div className="acc-section border-t border-black/5">
                    <LedgerTable
                      rows={g.rows}
                      catName={catName}
                      isAdmin={teacher.is_admin}
                      onDelete={async (id) => {
                        if (!confirm("刪除這筆？")) return;
                        const { error } = await deleteEntry(id);
                        if (error) alert(error);
                        else await refresh();
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs text-black/40">
        標記「代墊 / 收款 / 轉帳」的列由系統自動產生，需到對應分頁調整；手動記的才能在這裡刪除。
      </p>

      {modal === "entry" && (
        <EntryModal
          teacher={teacher}
          accounts={accounts.filter((a) => a.active)}
          categories={categories.filter((c) => c.active)}
          defaultAccountId={acctId}
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
          defaultFromId={acctId}
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

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function LedgerTable({
  rows,
  catName,
  isAdmin,
  onDelete,
}: {
  rows: Row[];
  catName: Map<string, string>;
  isAdmin: boolean;
  onDelete: (id: string) => void;
}) {
  return (
    <>
      {/* 手機：緊湊列表（不用左右捲） */}
      <div className="sm:hidden">
        {rows.map((r) => {
          const tag = SOURCE_LABEL[r.source_type];
          const inc = r.signed_amount > 0;
          return (
            <div
              key={r.id}
              className="flex items-center gap-2 border-t border-black/5 px-3 py-2.5 first:border-t-0"
            >
              <div className="w-9 shrink-0 text-[11px] leading-tight text-black/45">
                {shortDate(r.occurred_on)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-navy">
                  {r.note ||
                    (r.category_id ? catName.get(r.category_id) : "—")}
                  {tag && (
                    <span className="ml-1 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] text-black/45">
                      {tag}
                    </span>
                  )}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div
                  className={`text-sm tabular-nums ${
                    inc ? "text-[#5f7a4f]" : "text-brand"
                  }`}
                >
                  {inc ? "+" : "-"}
                  {fmtMoney(Math.abs(r.signed_amount)).replace("-", "")}
                </div>
                <div className="text-[11px] tabular-nums text-black/40">
                  餘 {fmtMoney(r.balanceAfter)}
                </div>
              </div>
              {isAdmin && r.source_type === "manual" && (
                <button
                  onClick={() => onDelete(r.id)}
                  className="shrink-0 px-1 text-black/25 hover:text-brand"
                  title="刪除"
                >
                  ✕
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* 桌機：完整表格 */}
      <div className="hidden overflow-x-auto sm:block">
      <table className="w-full min-w-[520px] text-sm">
        <thead>
          <tr className="bg-black/[0.03] text-xs text-black/50">
            <th className="px-3 py-2 text-left font-medium">日期</th>
            <th className="px-3 py-2 text-left font-medium">項目</th>
            <th className="px-3 py-2 text-right font-medium">收入</th>
            <th className="px-3 py-2 text-right font-medium">支出</th>
            <th className="px-3 py-2 text-right font-medium">餘額</th>
            {isAdmin && <th className="w-8 px-1 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const income = r.signed_amount > 0 ? r.signed_amount : 0;
            const expense = r.signed_amount < 0 ? -r.signed_amount : 0;
            const tag = SOURCE_LABEL[r.source_type];
            return (
              <tr key={r.id} className="border-t border-black/5">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-black/55">
                  {fmtDate(r.occurred_on)}
                </td>
                <td className="px-3 py-2">
                  <span className="text-navy">
                    {r.note || (r.category_id ? catName.get(r.category_id) : "—")}
                  </span>
                  {tag && (
                    <span className="ml-1.5 rounded-full bg-black/5 px-1.5 py-0.5 text-[10px] text-black/45">
                      {tag}
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-[#5f7a4f]">
                  {income ? fmtMoney(income) : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-brand">
                  {expense ? fmtMoney(expense) : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-black/70">
                  {fmtMoney(r.balanceAfter)}
                </td>
                {isAdmin && (
                  <td className="px-1 py-2 text-center">
                    {r.source_type === "manual" && (
                      <button
                        onClick={() => onDelete(r.id)}
                        className="text-black/25 hover:text-brand"
                        title="刪除"
                      >
                        ✕
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
    </>
  );
}

function EntryModal({
  teacher,
  accounts,
  categories,
  defaultAccountId,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  accounts: Account[];
  categories: Category[];
  defaultAccountId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [accountId, setAccountId] = useState(
    defaultAccountId || accounts[0]?.id || ""
  );
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("");
  // 預設就選好該收/支別的第一個種類（不用再點）
  const [categoryId, setCategoryId] = useState(
    categories.find((c) => c.kind === "expense")?.id ?? ""
  );
  const [occurredOn, setOccurredOn] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cats = categories.filter((c) => c.kind === kind);
  const amountNum = Number(amount);

  async function save(again: boolean) {
    setErr(null);
    if (!accountId) return setErr("請選擇帳戶");
    if (!item.trim()) return setErr("請填寫項目");
    if (!amountNum || amountNum <= 0) return setErr("請填寫正確金額");
    setBusy(true);
    const { error } = await createEntry({
      accountId,
      signedAmount: kind === "expense" ? -amountNum : amountNum,
      categoryId: categoryId || null,
      occurredOn,
      note: item.trim(),
      createdBy: teacher.id,
    });
    setBusy(false);
    if (error) return setErr(error);
    if (again) {
      setItem("");
      setAmount("");
      setCategoryId(categories.find((c) => c.kind === kind)?.id ?? "");
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    } else {
      onSaved();
    }
  }

  return (
    <Modal title="記一筆" onClose={onClose}>
      <div className="space-y-3">
        <div className="flex gap-2">
          {(["expense", "income"] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k);
                setCategoryId(categories.find((c) => c.kind === k)?.id ?? "");
              }}
              className={`flex-1 rounded-xl border py-2 text-sm font-medium transition active:scale-95 ${
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

        <Field label="項目">
          <input
            className={inputCls}
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="例：品言學費 / 房租 / 文具"
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

        {accounts.length > 1 && (
          <Field label="帳戶">
            <Select
              value={accountId}
              onChange={setAccountId}
              options={accounts.map((a) => ({ value: a.id, label: a.name }))}
            />
          </Field>
        )}

        <Field label="種類" hint="（月結報表會用到）">
          <Select
            value={categoryId}
            onChange={setCategoryId}
            placeholder="未分類"
            options={[
              { value: "", label: "未分類" },
              ...cats.map((c) => ({ value: c.id, label: c.name })),
            ]}
          />
        </Field>

        {err && <p className="text-sm text-brand">{err}</p>}
        {savedFlash && (
          <p className="acc-reveal text-sm text-[#5f7a4f]">✓ 已記一筆，繼續～</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <GhostBtn onClick={() => save(true)} disabled={busy}>
            存並再記一筆
          </GhostBtn>
          <PrimaryBtn onClick={() => save(false)} disabled={busy}>
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
  defaultFromId,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  accounts: Account[];
  defaultFromId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [fromId, setFromId] = useState(defaultFromId || accounts[0]?.id || "");
  const [toId, setToId] = useState(
    accounts.find((a) => a.id !== (defaultFromId || accounts[0]?.id))?.id ?? ""
  );
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
          <Select
            value={fromId}
            onChange={setFromId}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
          />
        </Field>
        <Field label="到（轉入）">
          <Select
            value={toId}
            onChange={setToId}
            options={accounts.map((a) => ({ value: a.id, label: a.name }))}
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
