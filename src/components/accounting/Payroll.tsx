"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { Teacher } from "@/lib/useAuth";
import { supabase } from "@/lib/supabase";
import { fmtMoney, todayISO } from "@/lib/accounting";
import {
  COURSE_TYPES,
  PAYROLL_EMAIL,
  computeTax,
  createPayee,
  createPayrollRecord,
  currentRocYm,
  deletePayee,
  deletePayrollRecord,
  fetchPayees,
  fetchPayrollRecords,
  fmtRocYm,
  fromRocYear,
  markPayrollPaid,
  updatePayee,
  type IncomeCategory,
  type Payee,
  type PayeeInput,
  type PayrollRecord,
} from "@/lib/payroll";
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
  inputCls,
} from "./ui";
import PayrollReceipt, { type ReceiptData } from "./PayrollReceipt";

// 'YYYY-MM'（西元）字串
function ymStr(gYear: number, month: number): string {
  return `${gYear}-${String(month).padStart(2, "0")}`;
}

export default function Payroll({ teacher }: { teacher: Teacher }) {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [payees, setPayees] = useState<Payee[]>([]);
  const [records, setRecords] = useState<PayrollRecord[]>([]);

  const refresh = useCallback(async () => {
    const [ps, rs] = await Promise.all([fetchPayees(), fetchPayrollRecords()]);
    setPayees(ps);
    setRecords(rs);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setAuthed((data.user?.email ?? "") === PAYROLL_EMAIL);
    });
    refresh();
  }, [refresh]);

  if (authed === false) {
    return (
      <Empty>發薪功能僅開放宇群本人使用。若你需要存取，請聯絡宇群。</Empty>
    );
  }

  return (
    <div className="space-y-6">
      <IssueSection
        teacher={teacher}
        payees={payees}
        loading={loading}
        onSaved={refresh}
      />
      <RecordsSection
        records={records}
        payees={payees}
        loading={loading}
        onChanged={refresh}
      />
      <PayeesSection payees={payees} loading={loading} onChanged={refresh} />
    </div>
  );
}

// ── 預覽 / 列印 彈窗 ──────────────────────────────────
function ReceiptModal({
  data,
  onClose,
}: {
  data: ReceiptData;
  onClose: () => void;
}) {
  return (
    <>
      <Modal title="簽收單預覽" onClose={onClose} wide>
        <div className="space-y-3">
          <p className="text-xs text-black/50">
            確認欄位無誤後按「列印」，於印表對話框選「另存為 PDF」即可存檔或印出。
          </p>
          <div className="overflow-auto rounded-xl border border-black/10 bg-white p-3">
            <PayrollReceipt data={data} />
          </div>
          <div className="flex justify-end gap-2">
            <GhostBtn onClick={onClose}>關閉</GhostBtn>
            <PrimaryBtn onClick={() => window.print()}>🖨️ 列印 / 存 PDF</PrimaryBtn>
          </div>
        </div>
      </Modal>
      {/* 列印專用副本：掛到 body，避開彈窗捲動容器的裁切；螢幕上隱藏，只在列印時顯示 */}
      {createPortal(
        <div className="payroll-print-root">
          <PayrollReceipt data={data} forPrint />
        </div>,
        document.body
      )}
    </>
  );
}

// ── 區塊 1：開立簽收單 ────────────────────────────────
function IssueSection({
  teacher,
  payees,
  loading,
  onSaved,
}: {
  teacher: Teacher;
  payees: Payee[];
  loading: boolean;
  onSaved: () => void;
}) {
  const init = currentRocYm();
  const [payeeId, setPayeeId] = useState("");
  const [rocYear, setRocYear] = useState(String(init.rocYear));
  const [month, setMonth] = useState(String(init.month));
  const [issueDate, setIssueDate] = useState(todayISO());
  const [gross, setGross] = useState("");
  const [courseTypes, setCourseTypes] = useState<string[]>([]);
  const [preview, setPreview] = useState<ReceiptData | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const payee = payees.find((p) => p.id === payeeId) ?? null;
  const grossNum = Number(gross) || 0;
  const tax = useMemo(
    () =>
      payee
        ? computeTax(grossNum, payee.income_category, payee.union_exempt)
        : null,
    [payee, grossNum]
  );

  function toggleCourse(c: string) {
    setCourseTypes((cur) =>
      cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]
    );
  }

  function buildData(): ReceiptData | null {
    if (!payee) return null;
    const gy = fromRocYear(Number(rocYear));
    return {
      payee,
      payYm: ymStr(gy, Number(month)),
      issueDate,
      courseTypes,
      tax: computeTax(grossNum, payee.income_category, payee.union_exempt),
    };
  }

  function validate(): string | null {
    if (!payee) return "請選擇領款人";
    if (!rocYear || !month) return "請填給付年月";
    if (!issueDate) return "請填填表日期";
    if (!grossNum || grossNum <= 0) return "請填應給付總額";
    return null;
  }

  function openPreview() {
    setErr(null);
    const v = validate();
    if (v) return setErr(v);
    setPreview(buildData());
  }

  async function save() {
    setErr(null);
    setOkMsg(null);
    const v = validate();
    if (v) return setErr(v);
    if (!payee || !tax) return;
    setBusy(true);
    const gy = fromRocYear(Number(rocYear));
    const res = await createPayrollRecord({
      payeeId: payee.id,
      payYm: ymStr(gy, Number(month)),
      issueDate,
      gross: tax.gross,
      tax: tax.taxWithholding,
      nhi: tax.nhiPremium,
      net: tax.netAmount,
      incomeCategory: payee.income_category,
      unionExempt: payee.union_exempt,
      courseTypes,
      createdBy: teacher.id,
    });
    setBusy(false);
    if (res.error) return setErr(res.error);
    setOkMsg(
      `已儲存：${payee.name} ${fmtRocYm(ymStr(gy, Number(month)))} 實發 ${fmtMoney(
        tax.netAmount
      )}`
    );
    setGross("");
    setCourseTypes([]);
    onSaved();
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-navy">① 開立簽收單</h2>
      <Card className="space-y-3">
        {payees.length === 0 && !loading ? (
          <Empty>請先到下方「③ 領款人管理」新增老師，才能開立簽收單。</Empty>
        ) : (
          <>
            <Field label="領款人">
              <Select
                value={payeeId}
                onChange={setPayeeId}
                placeholder="選擇老師"
                options={payees.map((p) => ({
                  value: p.id,
                  label: `${p.name}（${p.income_category}${
                    p.union_exempt ? "・工會免補充保費" : ""
                  }）`,
                }))}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="給付年（民國）">
                <input
                  type="number"
                  inputMode="numeric"
                  className={inputCls}
                  value={rocYear}
                  onChange={(e) => setRocYear(e.target.value)}
                />
              </Field>
              <Field label="給付月">
                <select
                  className={inputCls}
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m} 月
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="填表日期">
                <input
                  type="date"
                  className={inputCls}
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </Field>
              <Field label="應給付總額 (A)">
                <input
                  type="number"
                  inputMode="numeric"
                  className={inputCls}
                  value={gross}
                  onChange={(e) => setGross(e.target.value)}
                  placeholder="0"
                />
              </Field>
            </div>

            <Field label="授課種類" hint="（可複選）">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {COURSE_TYPES.map((c) => (
                  <label
                    key={c}
                    className="flex items-start gap-2 rounded-xl border border-black/10 bg-white/60 px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 accent-brand"
                      checked={courseTypes.includes(c)}
                      onChange={() => toggleCourse(c)}
                    />
                    <span className="text-black/70">{c}</span>
                  </label>
                ))}
              </div>
            </Field>

            {payee && tax && (
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-navy/5 p-3 sm:grid-cols-4">
                <Stat label="應給付 (A)" value={tax.gross} />
                <Stat
                  label={`預扣所得稅 (B)${
                    tax.taxExempt ? "・免扣" : `・${tax.taxRatePct}%`
                  }`}
                  value={-tax.taxWithholding}
                  colored
                />
                <Stat
                  label={`補充保費 (C)${
                    tax.nhiExempt
                      ? tax.unionDeclaration
                        ? "・工會免扣"
                        : "・免扣"
                      : "・2.11%"
                  }`}
                  value={-tax.nhiPremium}
                  colored
                />
                <Stat label="實發 (D)" value={tax.netAmount} strong />
              </div>
            )}

            {err && <p className="text-sm text-brand">{err}</p>}
            {okMsg && <p className="text-sm text-[#5f7a4f]">{okMsg}</p>}

            <div className="flex flex-wrap justify-end gap-2">
              <GhostBtn onClick={openPreview}>預覽 / 列印</GhostBtn>
              <PrimaryBtn onClick={save} disabled={busy}>
                {busy ? "儲存中…" : "儲存紀錄"}
              </PrimaryBtn>
            </div>
          </>
        )}
      </Card>

      {preview && (
        <ReceiptModal data={preview} onClose={() => setPreview(null)} />
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  colored,
  strong,
}: {
  label: string;
  value: number;
  colored?: boolean;
  strong?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-black/50">{label}</div>
      <Money
        value={value}
        colored={colored}
        className={strong ? "text-lg font-bold" : ""}
      />
    </div>
  );
}

// ── 區塊 2：發薪紀錄 ──────────────────────────────────
function RecordsSection({
  records,
  payees,
  loading,
  onChanged,
}: {
  records: PayrollRecord[];
  payees: Payee[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [filterYm, setFilterYm] = useState("");
  const [filterPayee, setFilterPayee] = useState("");
  const [reprint, setReprint] = useState<ReceiptData | null>(null);

  const payeeById = useMemo(
    () => new Map(payees.map((p) => [p.id, p])),
    [payees]
  );
  const ymOptions = useMemo(
    () =>
      Array.from(new Set(records.map((r) => r.pay_ym)))
        .sort()
        .reverse(),
    [records]
  );

  const filtered = records.filter(
    (r) =>
      (!filterYm || r.pay_ym === filterYm) &&
      (!filterPayee || r.payee_id === filterPayee)
  );

  function openReprint(r: PayrollRecord) {
    const payee = payeeById.get(r.payee_id);
    if (!payee) {
      alert("找不到該領款人資料（可能已被刪除），無法重印。");
      return;
    }
    setReprint({
      payee,
      payYm: r.pay_ym,
      issueDate: r.issue_date,
      courseTypes: r.course_types,
      tax: computeTax(
        Number(r.gross_amount),
        r.income_category,
        r.union_exempt
      ),
    });
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold text-navy">② 發薪紀錄</h2>

      <div className="mb-2 flex flex-wrap gap-2">
        <select
          className={`${inputCls} w-auto`}
          value={filterYm}
          onChange={(e) => setFilterYm(e.target.value)}
        >
          <option value="">全部月份</option>
          {ymOptions.map((ym) => (
            <option key={ym} value={ym}>
              {fmtRocYm(ym)}
            </option>
          ))}
        </select>
        <select
          className={`${inputCls} w-auto`}
          value={filterPayee}
          onChange={(e) => setFilterPayee(e.target.value)}
        >
          <option value="">全部老師</option>
          {payees.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-black/40">載入中…</div>
      ) : filtered.length === 0 ? (
        <Empty>目前沒有發薪紀錄</Empty>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Card key={r.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-navy">
                      {payeeById.get(r.payee_id)?.name ?? "（已刪除）"}
                    </span>
                    <span className="text-sm text-black/50">
                      {fmtRocYm(r.pay_ym)}
                    </span>
                    <StatusPill
                      label={r.status === "paid" ? "已付款" : "待付款"}
                    />
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-black/50">
                    <span>應給付 {fmtMoney(Number(r.gross_amount))}</span>
                    <span>稅 {fmtMoney(Number(r.tax_withholding))}</span>
                    <span>補充保費 {fmtMoney(Number(r.nhi_premium))}</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[11px] text-black/45">實發</div>
                  <Money
                    value={Number(r.net_amount)}
                    className="text-lg font-bold"
                  />
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <GhostBtn onClick={() => openReprint(r)}>重印</GhostBtn>
                <GhostBtn
                  tone={r.status === "paid" ? "default" : "ok"}
                  onClick={async () => {
                    const res = await markPayrollPaid(r.id, r.status !== "paid");
                    if (res.error) alert(res.error);
                    else onChanged();
                  }}
                >
                  {r.status === "paid" ? "改回待付款" : "標記已付款"}
                </GhostBtn>
                <GhostBtn
                  tone="danger"
                  onClick={async () => {
                    if (!confirm("確定刪除這筆發薪紀錄？")) return;
                    const res = await deletePayrollRecord(r.id);
                    if (res.error) alert(res.error);
                    else onChanged();
                  }}
                >
                  刪除
                </GhostBtn>
              </div>
            </Card>
          ))}
        </div>
      )}

      {reprint && (
        <ReceiptModal data={reprint} onClose={() => setReprint(null)} />
      )}
    </section>
  );
}

// ── 區塊 3：領款人管理 ────────────────────────────────
function PayeesSection({
  payees,
  loading,
  onChanged,
}: {
  payees: Payee[];
  loading: boolean;
  onChanged: () => void;
}) {
  const [formFor, setFormFor] = useState<Payee | "new" | null>(null);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-navy">③ 領款人管理</h2>
        <PrimaryBtn onClick={() => setFormFor("new")}>＋ 新增老師</PrimaryBtn>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-black/40">載入中…</div>
      ) : payees.length === 0 ? (
        <Empty>尚未建立任何領款人</Empty>
      ) : (
        <div className="space-y-2">
          {payees.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-navy">{p.name}</span>
                    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-black/55">
                      {p.income_category}
                    </span>
                    {p.union_exempt && (
                      <span className="rounded-full bg-[#8CA07C]/15 px-2 py-0.5 text-[11px] text-[#5f7a4f]">
                        工會免補充保費
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-black/50">
                    {p.id_number && <span>身分證 {p.id_number}</span>}
                    {p.phone && <span>{p.phone}</span>}
                    {(p.bank_name || p.bank_account) && (
                      <span>
                        {p.bank_name} {p.bank_account}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <GhostBtn onClick={() => setFormFor(p)}>編輯</GhostBtn>
                  <GhostBtn
                    tone="danger"
                    onClick={async () => {
                      if (
                        !confirm(
                          `確定刪除「${p.name}」？若已有發薪紀錄將無法刪除。`
                        )
                      )
                        return;
                      const res = await deletePayee(p.id);
                      if (res.error)
                        alert(
                          res.error.includes("violates foreign key")
                            ? "此老師已有發薪紀錄，無法刪除。"
                            : res.error
                        );
                      else onChanged();
                    }}
                  >
                    刪除
                  </GhostBtn>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {formFor && (
        <PayeeForm
          existing={formFor === "new" ? null : formFor}
          onClose={() => setFormFor(null)}
          onSaved={() => {
            setFormFor(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

function PayeeForm({
  existing,
  onClose,
  onSaved,
}: {
  existing: Payee | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [f, setF] = useState<PayeeInput>({
    name: existing?.name ?? "",
    id_number: existing?.id_number ?? "",
    birth_roc: existing?.birth_roc ?? "",
    address: existing?.address ?? "",
    phone: existing?.phone ?? "",
    bank_name: existing?.bank_name ?? "",
    bank_branch: existing?.bank_branch ?? "",
    bank_account: existing?.bank_account ?? "",
    income_category: existing?.income_category ?? "執行業務",
    union_exempt: existing?.union_exempt ?? false,
    union_name: existing?.union_name ?? "",
    note: existing?.note ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function set<K extends keyof PayeeInput>(k: K, v: PayeeInput[K]) {
    setF((cur) => ({ ...cur, [k]: v }));
  }

  async function save() {
    setErr(null);
    if (!f.name.trim()) return setErr("請填姓名");
    // 空字串轉 null，資料庫端保持乾淨
    const clean: PayeeInput = {
      ...f,
      name: f.name.trim(),
      id_number: f.id_number?.trim() || null,
      birth_roc: f.birth_roc?.trim() || null,
      address: f.address?.trim() || null,
      phone: f.phone?.trim() || null,
      bank_name: f.bank_name?.trim() || null,
      bank_branch: f.bank_branch?.trim() || null,
      bank_account: f.bank_account?.trim() || null,
      union_name: f.union_exempt ? f.union_name?.trim() || null : null,
      note: f.note?.trim() || null,
    };
    setBusy(true);
    const res = existing
      ? await updatePayee(existing.id, clean)
      : await createPayee(clean);
    setBusy(false);
    if (res.error) setErr(res.error);
    else onSaved();
  }

  const cats: { value: IncomeCategory; label: string }[] = [
    { value: "執行業務", label: "執行業務所得（9B）" },
    { value: "兼職薪資", label: "兼職薪資所得（50）" },
  ];

  return (
    <Modal title={existing ? "編輯領款人" : "新增領款人"} onClose={onClose} wide>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="姓名">
            <input
              className={inputCls}
              value={f.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>
          <Field label="身分證字號">
            <input
              className={inputCls}
              value={f.id_number ?? ""}
              onChange={(e) => set("id_number", e.target.value)}
            />
          </Field>
          <Field label="出生（民國）" hint="例 90/1/1">
            <input
              className={inputCls}
              value={f.birth_roc ?? ""}
              onChange={(e) => set("birth_roc", e.target.value)}
              placeholder="90/1/1"
            />
          </Field>
          <Field label="聯絡電話">
            <input
              className={inputCls}
              value={f.phone ?? ""}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Field>
        </div>

        <Field label="戶籍地址">
          <input
            className={inputCls}
            value={f.address ?? ""}
            onChange={(e) => set("address", e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="匯款銀行" hint="例 台新銀行(812)">
            <input
              className={inputCls}
              value={f.bank_name ?? ""}
              onChange={(e) => set("bank_name", e.target.value)}
            />
          </Field>
          <Field label="分行" hint="例 敦南分行(0023)">
            <input
              className={inputCls}
              value={f.bank_branch ?? ""}
              onChange={(e) => set("bank_branch", e.target.value)}
            />
          </Field>
          <Field label="帳號">
            <input
              className={inputCls}
              value={f.bank_account ?? ""}
              onChange={(e) => set("bank_account", e.target.value)}
            />
          </Field>
        </div>

        <Field label="所得類別">
          <div className="flex gap-2">
            {cats.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => set("income_category", c.value)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm transition ${
                  f.income_category === c.value
                    ? "border-navy bg-navy/10 font-medium text-navy"
                    : "border-black/15 text-black/60"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </Field>

        <label className="flex items-start gap-2 rounded-xl border border-black/10 bg-white/60 px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-brand"
            checked={f.union_exempt}
            onChange={(e) => set("union_exempt", e.target.checked)}
          />
          <span className="text-sm text-black/70">
            具職業工會投保證明，免扣二代健保補充保費
            <span className="mt-0.5 block text-xs text-black/45">
              僅執行業務所得適用；勾選後請填工會名稱。
            </span>
          </span>
        </label>

        {f.union_exempt && (
          <Field label="工會名稱">
            <input
              className={inputCls}
              value={f.union_name ?? ""}
              onChange={(e) => set("union_name", e.target.value)}
              placeholder="例 ○○市音樂業職業工會（會號 ○○○○○）"
            />
          </Field>
        )}

        <Field label="備註" hint="（選填，例：通訊地址）">
          <textarea
            className={`${inputCls} h-16 resize-none`}
            value={f.note ?? ""}
            onChange={(e) => set("note", e.target.value)}
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
