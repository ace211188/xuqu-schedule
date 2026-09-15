"use client";

import { useEffect, useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  COLLECTION_STATUS_LABEL,
  createCollection,
  deleteCollection,
  fmtDate,
  fmtMoney,
  todayISO,
  updateCollection,
  type Account,
  type Category,
  type Collection,
} from "@/lib/accounting";
import { fetchStudents, type Student } from "@/lib/students";
import type { AccountingData } from "./useAccountingData";
import {
  Card,
  Empty,
  Field,
  GhostBtn,
  Modal,
  Money,
  PrimaryBtn,
  Select,
  StatusPill,
  WeekGroups,
  inputCls,
} from "./ui";
import { ReceiptInput, ReceiptLinks } from "./Receipts";
import { RejectModal } from "./Reimbursements";
import { notifyAccountingSubmit } from "@/lib/notify";

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

  // 學生名冊（學費綁學生用；一次載入，卡片顯示與表單挑選共用）
  const [students, setStudents] = useState<Student[]>([]);
  useEffect(() => {
    fetchStudents().then(setStudents);
  }, []);
  const studentName = useMemo(
    () => new Map(students.map((s) => [s.id, s.nickname ? `${s.name}（${s.nickname}）` : s.name])),
    [students]
  );

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
  // 找零要扣的零用金帳戶（type='petty'）；找不到就 null，表單會提示
  const pettyAccount = useMemo(
    () => accounts.find((a) => a.type === "petty" && a.active) ?? null,
    [accounts]
  );

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
        <WeekGroups
          items={sorted}
          getDate={(c) => c.occurred_on}
          getKey={(c) => c.id}
          renderItem={(c) => (
            <CollectionCard
              c={c}
              teacher={teacher}
              catName={catName}
              acctName={acctName}
              studentName={studentName}
              collectorName={
                teacher.is_admin
                  ? teacherNames.get(c.collector_id) ?? "—"
                  : teacher.name
              }
              onEdit={() => setFormFor(c)}
              onDelete={async () => {
                const msg =
                  c.status === "confirmed"
                    ? "這筆已確認入帳，刪除會一併移除流水帳的入帳（與找零）分錄。確定刪除？"
                    : "確定刪除這筆收款？";
                if (!confirm(msg)) return;
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
          )}
        />
      )}

      {formFor && (
        <CollectionForm
          teacher={teacher}
          existing={formFor === "new" ? null : formFor}
          categories={incomeCats}
          accounts={heldAccounts}
          students={students}
          pettyAccount={pettyAccount}
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
          defaultAccountId={confirmFor.held_account_id}
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
  studentName,
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
  studentName: Map<string, string>;
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
            {c.student_id && (
              <span>學生：{studentName.get(c.student_id) ?? "—"}</span>
            )}
            {c.held_account_id && (
              <span>
                {c.status === "confirmed" ? "入" : "放"}「
                {acctName.get(c.held_account_id) ?? "—"}」
              </span>
            )}
            {c.change_given > 0 && (
              <span className="text-brand">
                找零 {fmtMoney(c.change_given)}
                {c.change_account_id
                  ? `（${acctName.get(c.change_account_id) ?? "零用金"}）`
                  : ""}
              </span>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <Money value={c.amount} colored className="text-lg" />
          {c.change_given > 0 && (
            <div className="text-[11px] text-black/45">
              淨 {fmtMoney(c.amount - c.change_given)}
            </div>
          )}
        </div>
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
        {canDelete && (
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
  accounts,
  students,
  pettyAccount,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  existing: Collection | null;
  categories: Category[];
  accounts: Account[];
  students: Student[];
  pettyAccount: Account | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const mainAccountId = useMemo(
    () => accounts.find((a) => a.is_main)?.id ?? accounts[0]?.id ?? "",
    [accounts]
  );
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [categoryId, setCategoryId] = useState<string>(
    existing?.category_id ?? categories[0]?.id ?? ""
  );
  const [description, setDescription] = useState(existing?.description ?? "");
  const [occurredOn, setOccurredOn] = useState(
    existing?.occurred_on ?? todayISO()
  );
  // 建立時就選「錢先放哪個帳戶」（預設主帳戶；管理者確認入帳時仍可調整）
  const [heldAccountId, setHeldAccountId] = useState<string>(
    existing?.held_account_id ?? mainAccountId
  );
  // 學費綁學生（選填）
  const [studentId, setStudentId] = useState<string>(existing?.student_id ?? "");
  const [studentSearch, setStudentSearch] = useState("");
  const [paths, setPaths] = useState<string[]>(existing?.receipt_paths ?? []);
  // 找零：勾選有無找錢 + 找多少
  const [hasChange, setHasChange] = useState(
    existing ? existing.change_given > 0 : false
  );
  const [change, setChange] = useState(
    existing && existing.change_given > 0 ? String(existing.change_given) : ""
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amountNum = Number(amount);
  const changeNum = hasChange ? Number(change) : 0;
  const net = amountNum - changeNum; // 淨額（實收 − 找零）= 真正的學費

  // 類別是「學費」才顯示學生選擇（選填）
  const isTuition = useMemo(() => {
    const c = categories.find((x) => x.id === categoryId);
    return !!c && c.name.includes("學費");
  }, [categories, categoryId]);
  const selectedStudent = students.find((s) => s.id === studentId) ?? null;

  // 打「收款說明」時自動比對學生（尚未手選時才帶入）
  useEffect(() => {
    if (!isTuition || studentId || students.length === 0) return;
    const text = description.trim();
    if (!text) return;
    const hit = students.find((s) => {
      const nm = s.name?.trim();
      const nick = s.nickname?.trim();
      return (nm && text.includes(nm)) || (nick && text.includes(nick));
    });
    if (hit) setStudentId(hit.id);
  }, [description, isTuition, students, studentId]);

  const studentMatches = useMemo(() => {
    const kw = studentSearch.trim();
    const base = kw
      ? students.filter(
          (s) => (s.name ?? "").includes(kw) || (s.nickname ?? "").includes(kw)
        )
      : students;
    return base.slice(0, 8);
  }, [students, studentSearch]);

  async function save() {
    setErr(null);
    if (!description.trim()) return setErr("請填寫收款說明");
    if (!amountNum || amountNum <= 0) return setErr("請填寫正確金額");
    if (hasChange) {
      if (!pettyAccount)
        return setErr("找不到零用金帳戶，請先到「設定」建立一個零用金類型的帳戶");
      if (!changeNum || changeNum <= 0) return setErr("請填寫找零金額");
      if (changeNum >= amountNum)
        return setErr("找零金額不能大於或等於實收金額");
    }
    setBusy(true);
    const changeGiven = hasChange ? changeNum : 0;
    const changeAccountId = hasChange ? pettyAccount?.id ?? null : null;
    // 學生僅在「學費」時才綁定；換類別後不殘留
    const linkedStudentId = isTuition ? studentId || null : null;
    let res;
    if (!existing) {
      res = await createCollection({
        collectorId: teacher.id,
        amount: amountNum,
        categoryId: categoryId || null,
        description: description.trim(),
        occurredOn,
        receiptPaths: paths,
        heldAccountId: heldAccountId || null,
        studentId: linkedStudentId,
        changeGiven,
        changeAccountId,
      });
      // 新收款送出 → 即時通知管理員（宇群）處理（best-effort，不擋流程）
      if (!res.error) {
        void notifyAccountingSubmit({
          who: teacher.name,
          what: `一筆收款「${description.trim()}」${fmtMoney(net)}`,
        });
      }
    } else {
      const patch: Parameters<typeof updateCollection>[1] = {
        amount: amountNum,
        category_id: categoryId || null,
        description: description.trim(),
        occurred_on: occurredOn,
        receipt_paths: paths,
        held_account_id: heldAccountId || null,
        student_id: linkedStudentId,
        change_given: changeGiven,
        change_account_id: changeAccountId,
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
          <Field label="實收金額" hint="（學生實際給的現金）">
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

        {/* 找零：勾選有無找錢，有的話填金額 → 確認入帳時從零用金扣 */}
        <div className="rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-black/70">
            <input
              type="checkbox"
              className="h-4 w-4 accent-navy"
              checked={hasChange}
              onChange={(e) => setHasChange(e.target.checked)}
            />
            有找錢給學生
            {pettyAccount && (
              <span className="font-normal text-black/40">
                （從「{pettyAccount.name}」扣）
              </span>
            )}
          </label>

          {hasChange && (
            <div className="mt-2.5 space-y-2">
              <Field label="找零金額">
                <input
                  type="number"
                  inputMode="numeric"
                  className={inputCls}
                  value={change}
                  onChange={(e) => setChange(e.target.value)}
                  placeholder="0"
                  autoFocus
                />
              </Field>
              {!pettyAccount && (
                <p className="text-xs text-brand">
                  ⚠ 找不到零用金帳戶，請先到「設定」建立一個「零用金」類型的帳戶。
                </p>
              )}
              {amountNum > 0 && changeNum > 0 && (
                <div className="rounded-lg bg-white px-3 py-2 text-xs">
                  <div className="flex justify-between text-black/55">
                    <span>實收</span>
                    <span className="tabular-nums">{fmtMoney(amountNum)}</span>
                  </div>
                  <div className="flex justify-between text-black/55">
                    <span>找零（{pettyAccount?.name ?? "零用金"}）</span>
                    <span className="tabular-nums text-brand">
                      −{fmtMoney(changeNum)}
                    </span>
                  </div>
                  <div className="mt-1 flex justify-between border-t border-black/10 pt-1 font-semibold text-navy">
                    <span>淨額（實際學費）</span>
                    <span
                      className={`tabular-nums ${
                        net < 0 ? "text-brand" : ""
                      }`}
                    >
                      {fmtMoney(net)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        <Field label="錢先放哪個帳戶" hint="（確認入帳時仍可調整）">
          <Select
            value={heldAccountId}
            onChange={setHeldAccountId}
            placeholder="請選擇帳戶"
            options={accounts.map((a) => ({
              value: a.id,
              label: a.name + (a.is_main ? "（主）" : ""),
            }))}
          />
        </Field>
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

        {/* 學費 → 可綁學生（選填）*/}
        {isTuition && (
          <div className="space-y-2 rounded-xl border border-[#8CA07C]/40 bg-[#8CA07C]/5 px-3 py-2.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#5f7a4f]">
                🎓 對應學生
                <span className="ml-1 font-normal text-black/40">（選填）</span>
              </span>
              {selectedStudent && (
                <button
                  type="button"
                  onClick={() => {
                    setStudentId("");
                    setStudentSearch("");
                  }}
                  className="text-xs text-black/45 hover:text-navy"
                >
                  更換
                </button>
              )}
            </div>

            {selectedStudent ? (
              <span className="inline-block rounded-full border border-[#8CA07C]/40 bg-white px-2.5 py-1 text-sm font-medium text-navy">
                {selectedStudent.name}
                {selectedStudent.nickname ? `（${selectedStudent.nickname}）` : ""}
              </span>
            ) : (
              <div className="space-y-1.5">
                <input
                  className={inputCls}
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="🔍 搜尋學生姓名／暱稱（打說明也會自動比對）"
                />
                <div className="flex flex-wrap gap-1.5">
                  {studentMatches.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setStudentId(s.id)}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs text-black/60 transition hover:border-navy hover:text-navy"
                    >
                      {s.name}
                      {s.nickname ? `·${s.nickname}` : ""}
                    </button>
                  ))}
                  {students.length > 0 && studentMatches.length === 0 && (
                    <span className="text-xs text-black/40">查無符合的學生</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

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
  defaultAccountId,
  onClose,
  onConfirm,
}: {
  accounts: Account[];
  amount: number;
  defaultAccountId: string | null;
  onClose: () => void;
  onConfirm: (accountId: string) => void;
}) {
  const [accountId, setAccountId] = useState(
    defaultAccountId || accounts[0]?.id || ""
  );
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
