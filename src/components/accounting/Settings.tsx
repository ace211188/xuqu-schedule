"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ACCOUNT_TYPE_LABEL,
  fetchAllTeachers,
  setMainAccount,
  setTeacherAccounting,
  upsertAccount,
  upsertCategory,
  type Account,
  type AccountType,
  type Category,
  type CategoryKind,
} from "@/lib/accounting";
import type { AccountingData } from "./useAccountingData";
import {
  Card,
  Field,
  GhostBtn,
  Modal,
  Money,
  PrimaryBtn,
  SectionTitle,
  inputCls,
} from "./ui";

type TeacherRow = {
  id: string;
  name: string;
  is_admin: boolean;
  can_accounting: boolean;
};

export default function Settings({ data }: { data: AccountingData }) {
  const { accounts, categories, balances, refresh } = data;
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [acctEdit, setAcctEdit] = useState<Account | "new" | null>(null);
  const [catEdit, setCatEdit] = useState<Category | "new" | null>(null);

  const loadTeachers = () => fetchAllTeachers().then(setTeachers);
  useEffect(() => {
    loadTeachers();
  }, []);

  const balById = useMemo(
    () => new Map(balances.map((b) => [b.id, b.balance])),
    [balances]
  );

  return (
    <div className="space-y-5">
      {/* 帳戶 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>帳戶</SectionTitle>
          <GhostBtn onClick={() => setAcctEdit("new")}>＋ 新增帳戶</GhostBtn>
        </div>
        <div className="space-y-2">
          {accounts.map((a) => (
            <Card key={a.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-navy">{a.name}</span>
                  {a.is_main && (
                    <span className="rounded bg-navy/10 px-1.5 text-[11px] text-navy">
                      主帳戶
                    </span>
                  )}
                  {!a.active && (
                    <span className="rounded bg-black/10 px-1.5 text-[11px] text-black/45">
                      已停用
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-black/45">
                  {ACCOUNT_TYPE_LABEL[a.type]} · 餘額{" "}
                  <Money value={balById.get(a.id) ?? a.opening_balance} colored />
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {!a.is_main && (
                  <GhostBtn
                    onClick={async () => {
                      const { error } = await setMainAccount(a.id);
                      if (error) alert(error);
                      else await refresh();
                    }}
                  >
                    設為主帳戶
                  </GhostBtn>
                )}
                <GhostBtn onClick={() => setAcctEdit(a)}>編輯</GhostBtn>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 類別 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>收支類別</SectionTitle>
          <GhostBtn onClick={() => setCatEdit("new")}>＋ 新增類別</GhostBtn>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["income", "expense"] as const).map((kind) => (
            <Card key={kind}>
              <div className="mb-2 text-xs font-medium text-black/50">
                {kind === "income" ? "收入" : "支出"}
              </div>
              <div className="flex flex-wrap gap-2">
                {categories
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCatEdit(c)}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        c.active
                          ? "border-black/15 text-black/70 hover:border-navy"
                          : "border-dashed border-black/15 text-black/35"
                      }`}
                    >
                      {c.name}
                      {!c.active && "（停用）"}
                    </button>
                  ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 成員權限 */}
      <section>
        <SectionTitle>記帳成員權限</SectionTitle>
        <Card className="divide-y divide-black/5 p-0">
          {teachers.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="font-medium text-navy">
                {t.name}
                {t.is_admin && (
                  <span className="ml-2 rounded bg-navy/10 px-1.5 text-[11px] text-navy">
                    管理者
                  </span>
                )}
              </span>
              {t.is_admin ? (
                <span className="text-xs text-black/40">永遠可用</span>
              ) : (
                <button
                  onClick={async () => {
                    const { error } = await setTeacherAccounting(
                      t.id,
                      !t.can_accounting
                    );
                    if (error) alert(error);
                    else await loadTeachers();
                  }}
                  className={`relative h-6 w-11 rounded-full transition ${
                    t.can_accounting ? "bg-[#8CA07C]" : "bg-black/15"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      t.can_accounting ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              )}
            </div>
          ))}
        </Card>
        <p className="mt-1 text-xs text-black/40">
          開啟後該老師登入即可看到「記帳」入口。
        </p>
      </section>

      {acctEdit && (
        <AccountModal
          existing={acctEdit === "new" ? null : acctEdit}
          teachers={teachers}
          onClose={() => setAcctEdit(null)}
          onSaved={async () => {
            setAcctEdit(null);
            await refresh();
          }}
        />
      )}
      {catEdit && (
        <CategoryModal
          existing={catEdit === "new" ? null : catEdit}
          onClose={() => setCatEdit(null)}
          onSaved={async () => {
            setCatEdit(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function AccountModal({
  existing,
  teachers,
  onClose,
  onSaved,
}: {
  existing: Account | null;
  teachers: TeacherRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<AccountType>(existing?.type ?? "bank");
  const [owner, setOwner] = useState(existing?.owner_teacher_id ?? "");
  const [opening, setOpening] = useState(
    existing ? String(existing.opening_balance) : "0"
  );
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!name.trim()) return setErr("請填寫帳戶名稱");
    setBusy(true);
    const payload: Partial<Account> & { name: string } = {
      name: name.trim(),
      type,
      owner_teacher_id: owner || null,
      opening_balance: Number(opening) || 0,
      active,
    };
    if (existing) payload.id = existing.id;
    const { error } = await upsertAccount(payload);
    setBusy(false);
    if (error) setErr(error);
    else onSaved();
  }

  return (
    <Modal title={existing ? "編輯帳戶" : "新增帳戶"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="帳戶名稱">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：美君主帳戶 / 教室現金"
          />
        </Field>
        <Field label="類型">
          <select
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="負責人" hint="（選填）">
          <select
            className={inputCls}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">無</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="期初餘額" hint={existing ? "（改動會影響餘額）" : undefined}>
          <input
            type="number"
            inputMode="numeric"
            className={inputCls}
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-black/70">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          啟用中（停用後不再出現在下拉選單）
        </label>
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

function CategoryModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Category | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(existing?.kind ?? "expense");
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!name.trim()) return setErr("請填寫類別名稱");
    setBusy(true);
    const payload: Partial<Category> & { name: string; kind: CategoryKind } = {
      name: name.trim(),
      kind,
      active,
    };
    if (existing) payload.id = existing.id;
    const { error } = await upsertCategory(payload);
    setBusy(false);
    if (error) setErr(error);
    else onSaved();
  }

  return (
    <Modal title={existing ? "編輯類別" : "新增類別"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="類別名稱">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：教材教具"
          />
        </Field>
        <Field label="收 / 支">
          <select
            className={inputCls}
            value={kind}
            disabled={!!existing}
            onChange={(e) => setKind(e.target.value as CategoryKind)}
          >
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-black/70">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          啟用中
        </label>
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
