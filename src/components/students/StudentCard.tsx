"use client";

import { useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  ALL_STATUS,
  COLLECTORS,
  CONTACTS,
  COURSE_TYPES,
  PLAN_OPTIONS,
  REFERRAL_HINT,
  SOURCES,
  STATUS_TONE,
  TEACHERS,
  advanceStatus,
  createFeeRecord,
  createStudent,
  deleteFeeRecord,
  deleteStudent,
  fmtDate,
  fmtMoney,
  latestFee,
  nextStatus,
  todayISO,
  updateStudent,
  type Student,
  type StudentFeeRecord,
  type StudentInput,
  type StudentStatus,
} from "@/lib/students";
import {
  Field,
  GhostBtn,
  Modal,
  PrimaryBtn,
  Select,
  inputCls,
} from "@/components/accounting/ui";

function blankForm(): StudentInput {
  return {
    name: "",
    nickname: null,
    gender: null,
    birthday: null,
    school: null,
    status: "完成免費測驗",
    enrolled_on: null,
    filed_on: null,
    father_name: null,
    father_phone: null,
    mother_name: null,
    mother_phone: null,
    main_contact: null,
    line_name: null,
    address: null,
    source: null,
    referrer_student_id: null,
    referrer_note: null,
    class_slot: null,
    instrument: null,
    teacher: null,
    course_type: null,
    current_plan: null,
    deposit_amount: null,
    deposit_note: null,
    discount_note: null,
    notes: null,
  };
}

function toForm(s: Student): StudentInput {
  const { id: _id, created_at: _c, updated_at: _u, ...rest } = s;
  void _id;
  void _c;
  void _u;
  return rest;
}

function StatusPill({ status }: { status: StudentStatus }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_TONE[status]}`}
    >
      {status}
    </span>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-1 border-b border-black/10 pb-1 text-xs font-bold tracking-wide text-navy/70">
      {children}
    </h3>
  );
}

// 唯讀顯示一列
function ViewRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex gap-2 border-b border-black/5 py-1.5 text-sm">
      <span className="w-20 shrink-0 text-black/45">{label}</span>
      <span
        className={`flex-1 break-words ${
          strong ? "font-semibold text-navy" : "text-black/80"
        }`}
      >
        {value == null || value === "" ? (
          <span className="text-black/25">—</span>
        ) : (
          value
        )}
      </span>
    </div>
  );
}

export default function StudentCard({
  teacher,
  student,
  feeRecords,
  allStudents,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  student: Student | null; // null＝新增
  feeRecords: StudentFeeRecord[];
  allStudents: Student[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = student === null;
  // 既有學生預設「唯讀檢視」，按編輯才能改；新增則直接是編輯狀態
  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<StudentInput>(
    student ? toForm(student) : blankForm()
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof StudentInput>(key: K, value: StudentInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const referrerOptions = useMemo(
    () =>
      allStudents
        .filter((s) => s.id !== student?.id)
        .map((s) => ({
          value: s.id,
          label: s.nickname ? `${s.name}（${s.nickname}）` : s.name,
        })),
    [allStudents, student?.id]
  );

  const referrerName = useMemo(() => {
    if (!form.referrer_student_id) return null;
    const r = allStudents.find((s) => s.id === form.referrer_student_id);
    return r?.name ?? null;
  }, [form.referrer_student_id, allStudents]);

  const nxt = nextStatus(form.status);

  async function handleSave() {
    if (!form.name.trim()) {
      setErr("請填姓名");
      return;
    }
    setSaving(true);
    setErr(null);
    const clean: StudentInput = {
      ...form,
      name: form.name.trim(),
      deposit_amount:
        form.deposit_amount === null || Number.isNaN(form.deposit_amount)
          ? null
          : form.deposit_amount,
    };
    const res = isNew
      ? (await createStudent(clean)).error
      : (await updateStudent(student!.id, clean)).error;
    setSaving(false);
    if (res) {
      setErr(res);
      return;
    }
    onSaved();
    if (isNew) onClose();
    else setEditing(false); // 存完回到唯讀檢視
  }

  async function handleAdvance() {
    if (!student || !nxt) return;
    setBusy(true);
    const { error } = await advanceStatus(student.id, form.status);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    set("status", nxt);
    onSaved();
  }

  async function handleDelete() {
    if (!student) return;
    if (
      !window.confirm(
        `確定要刪除「${student.name}」的學生資料卡嗎？收費紀錄也會一併刪除，無法復原。`
      )
    )
      return;
    setBusy(true);
    const { error } = await deleteStudent(student.id);
    setBusy(false);
    if (error) {
      setErr(error);
      return;
    }
    onSaved();
    onClose();
  }

  const title = isNew
    ? "新增學生"
    : `${student!.name}${student!.nickname ? `（${student!.nickname}）` : ""}`;

  return (
    <Modal title={title} onClose={onClose} wide>
      <div className="space-y-4">
        {/* 狀態列＋（唯讀時）編輯鈕 */}
        {!isNew && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-white/70 p-3">
            <span className="text-sm text-black/50">目前狀態</span>
            <StatusPill status={form.status} />
            {nxt && (
              <GhostBtn tone="ok" onClick={handleAdvance} disabled={busy}>
                ✓ 推進到「{nxt}」
              </GhostBtn>
            )}
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="ml-auto rounded-full bg-navy px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 active:scale-95"
              >
                ✏️ 編輯
              </button>
            )}
          </div>
        )}

        {/* 收費紀錄：移到最顯眼處（狀態下方），唯讀/編輯都在 */}
        {!isNew && (
          <FeeSection
            student={student!}
            records={feeRecords}
            teacher={teacher}
            onChanged={onSaved}
          />
        )}

        {editing ? (
          <EditBody
            form={form}
            set={set}
            isNew={isNew}
            referrerOptions={referrerOptions}
          />
        ) : (
          <ViewBody form={form} referrerName={referrerName} />
        )}

        {!isNew && (
          <p className="text-xs text-black/40">
            建立 {fmtDate(student!.created_at)}・最近更新{" "}
            {fmtDate(student!.updated_at)}
          </p>
        )}

        {err && <p className="text-sm text-brand">{err}</p>}

        {/* 動作列 */}
        {editing ? (
          <div className="flex items-center gap-2 pt-1">
            <PrimaryBtn onClick={handleSave} disabled={saving}>
              {saving ? "儲存中…" : isNew ? "新增" : "儲存變更"}
            </PrimaryBtn>
            <GhostBtn onClick={isNew ? onClose : () => setEditing(false)}>
              取消
            </GhostBtn>
            {!isNew && teacher.is_admin && (
              <div className="ml-auto">
                <GhostBtn tone="danger" onClick={handleDelete} disabled={busy}>
                  刪除
                </GhostBtn>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 pt-1">
            <GhostBtn onClick={onClose}>關閉</GhostBtn>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── 唯讀檢視（橫式排版） ─────────────────────────────
function ViewBody({
  form,
  referrerName,
}: {
  form: StudentInput;
  referrerName: string | null;
}) {
  return (
    <div className="space-y-3">
      <SectionHead>三、招生與課程</SectionHead>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <ViewRow label="課程種類" value={form.course_type} strong />
        <ViewRow label="班別／期別" value={form.class_slot} />
        <ViewRow label="科目／樂器" value={form.instrument} />
        <ViewRow label="上課老師" value={form.teacher} />
        <ViewRow label="來源" value={form.source} />
        <ViewRow
          label="介紹人"
          value={
            referrerName
              ? referrerName + (form.referrer_note ? `（${form.referrer_note}）` : "")
              : form.referrer_note
          }
        />
      </div>

      <SectionHead>收費／優惠</SectionHead>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <ViewRow label="目前方案" value={form.current_plan} strong />
        <ViewRow
          label="訂金"
          value={
            form.deposit_amount != null
              ? `${fmtMoney(form.deposit_amount)}${form.deposit_note ? `（${form.deposit_note}）` : ""}`
              : form.deposit_note
          }
        />
        <ViewRow label="優惠備註" value={form.discount_note} />
      </div>

      <SectionHead>一、基本資料</SectionHead>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <ViewRow label="性別" value={form.gender} />
        <ViewRow label="出生年月日" value={form.birthday} />
        <ViewRow label="就讀學校" value={form.school} />
        <ViewRow label="入校日期" value={form.enrolled_on} />
      </div>

      <SectionHead>二、家長與聯絡</SectionHead>
      <div className="grid gap-x-6 sm:grid-cols-2">
        <ViewRow
          label="父親"
          value={[form.father_name, form.father_phone].filter(Boolean).join("　")}
        />
        <ViewRow
          label="母親"
          value={[form.mother_name, form.mother_phone].filter(Boolean).join("　")}
        />
        <ViewRow label="主要聯絡人" value={form.main_contact} />
        <ViewRow label="LINE" value={form.line_name} />
        <ViewRow label="地址" value={form.address} />
      </div>

      {form.notes && (
        <>
          <SectionHead>備註</SectionHead>
          <p className="whitespace-pre-wrap rounded-xl bg-black/[0.02] px-3 py-2 text-sm text-black/70">
            {form.notes}
          </p>
        </>
      )}
    </div>
  );
}

// ── 編輯表單 ─────────────────────────────────────────
function EditBody({
  form,
  set,
  isNew,
  referrerOptions,
}: {
  form: StudentInput;
  set: <K extends keyof StudentInput>(key: K, value: StudentInput[K]) => void;
  isNew: boolean;
  referrerOptions: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-4">
      {/* 三、招生與課程（順序：課程種類→期別→科目→老師） */}
      <SectionHead>三、招生與課程</SectionHead>
      <div className="grid grid-cols-2 gap-3">
        <Field label="課程種類">
          <Select
            value={form.course_type ?? ""}
            onChange={(v) => set("course_type", v || null)}
            placeholder="請選擇"
            options={COURSE_TYPES.map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <Field label="班別／期別" hint="(A1/C2/個別…)">
          <input
            className={inputCls}
            value={form.class_slot ?? ""}
            onChange={(e) => set("class_slot", e.target.value || null)}
            placeholder="A1 / C2 / 個別"
          />
        </Field>
      </div>
      <Field label="科目／樂器" hint="(可多項，逗號分隔)">
        <input
          className={inputCls}
          value={form.instrument ?? ""}
          onChange={(e) => set("instrument", e.target.value || null)}
          placeholder="鋼琴, 樂理"
        />
      </Field>
      <Field label="上課老師" hint="(可多位，對應科目順序)">
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {TEACHERS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => {
                const cur = (form.teacher ?? "").trim();
                set("teacher", cur ? `${cur}, ${t}` : t);
              }}
              className="rounded-full border border-black/15 px-3 py-1 text-xs font-medium text-black/60 transition hover:border-navy hover:text-navy active:scale-95"
            >
              ＋{t}
            </button>
          ))}
          {form.teacher && (
            <button
              type="button"
              onClick={() => set("teacher", null)}
              className="rounded-full border border-black/15 px-2 py-1 text-xs text-black/40 hover:text-brand"
            >
              清除
            </button>
          )}
        </div>
        <input
          className={inputCls}
          value={form.teacher ?? ""}
          onChange={(e) => set("teacher", e.target.value || null)}
          placeholder="宇群, 美君…"
        />
      </Field>

      {/* 目前收費方案（醒目） */}
      <Field label="目前收費方案" hint="(一眼可見的快速欄)">
        <input
          className={`${inputCls} font-semibold text-navy`}
          value={form.current_plan ?? ""}
          onChange={(e) => set("current_plan", e.target.value || null)}
          placeholder="例：雙軌 8堂 $6400"
        />
      </Field>

      {/* 狀態 */}
      <Field label="狀態" hint={isNew ? "" : "(可切換暫停/畢業/流失/復課)"}>
        <Select
          value={form.status}
          onChange={(v) => set("status", v as StudentStatus)}
          options={ALL_STATUS.map((s) => ({ value: s, label: s }))}
        />
      </Field>

      {/* 訂金 */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="訂金金額" hint="(純註記,不進記帳)">
          <input
            className={inputCls}
            inputMode="numeric"
            value={form.deposit_amount ?? ""}
            onChange={(e) =>
              set(
                "deposit_amount",
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          />
        </Field>
        <Field label="訂金備註" hint="(選填)">
          <input
            className={inputCls}
            value={form.deposit_note ?? ""}
            onChange={(e) => set("deposit_note", e.target.value || null)}
          />
        </Field>
      </div>

      {/* 優惠 */}
      <Field label="優惠備註" hint="(自由文字)">
        <textarea
          className={`${inputCls} min-h-[60px]`}
          value={form.discount_note ?? ""}
          onChange={(e) => set("discount_note", e.target.value || null)}
          placeholder="例：舊生介紹 −1000"
        />
      </Field>

      {/* 來源＋介紹人 */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="來源">
          <Select
            value={form.source ?? ""}
            onChange={(v) => {
              set("source", v || null);
              if (v !== "舊生介紹") set("referrer_student_id", null);
            }}
            placeholder="請選擇"
            options={SOURCES.map((s) => ({ value: s, label: s }))}
          />
        </Field>
        {form.source === "舊生介紹" && (
          <Field label="介紹人" hint="(哪位舊生)">
            <Select
              value={form.referrer_student_id ?? ""}
              onChange={(v) => set("referrer_student_id", v || null)}
              placeholder="選擇舊生"
              options={referrerOptions}
            />
          </Field>
        )}
      </div>
      {form.source === "舊生介紹" && (
        <p className="-mt-2 rounded-xl bg-brand/5 px-3 py-2 text-xs text-brand">
          💡 {REFERRAL_HINT}
        </p>
      )}
      <Field label="介紹人補充" hint="(選填,例：妹妹晨希介紹)">
        <input
          className={inputCls}
          value={form.referrer_note ?? ""}
          onChange={(e) => set("referrer_note", e.target.value || null)}
        />
      </Field>

      {/* 一、基本資料 */}
      <SectionHead>一、基本資料</SectionHead>
      <div className="grid grid-cols-2 gap-3">
        <Field label="姓名">
          <input
            className={inputCls}
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="王小明"
          />
        </Field>
        <Field label="暱稱" hint="(選填)">
          <input
            className={inputCls}
            value={form.nickname ?? ""}
            onChange={(e) => set("nickname", e.target.value || null)}
            placeholder="英文名…"
          />
        </Field>
        <Field label="性別">
          <div className="flex gap-1.5">
            {["男", "女"].map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => set("gender", form.gender === g ? null : g)}
                className={`flex-1 rounded-xl px-3 py-2 text-sm font-medium transition ${
                  form.gender === g
                    ? "bg-navy text-white"
                    : "border border-black/15 text-black/60 hover:border-black/40"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </Field>
        <Field label="出生年月日" hint="(可民國)">
          <input
            className={inputCls}
            value={form.birthday ?? ""}
            onChange={(e) => set("birthday", e.target.value || null)}
            placeholder="103/3/31"
          />
        </Field>
        <Field label="就讀學校" hint="(選填)">
          <input
            className={inputCls}
            value={form.school ?? ""}
            onChange={(e) => set("school", e.target.value || null)}
          />
        </Field>
        <Field label="入校日期" hint="(選填)">
          <input
            className={inputCls}
            value={form.enrolled_on ?? ""}
            onChange={(e) => set("enrolled_on", e.target.value || null)}
            placeholder="115/7/22"
          />
        </Field>
      </div>

      {/* 二、家長與聯絡 */}
      <SectionHead>二、家長與聯絡</SectionHead>
      <div className="grid grid-cols-2 gap-3">
        <Field label="父親姓名" hint="(選填)">
          <input
            className={inputCls}
            value={form.father_name ?? ""}
            onChange={(e) => set("father_name", e.target.value || null)}
          />
        </Field>
        <Field label="父親電話" hint="(選填)">
          <input
            className={inputCls}
            inputMode="tel"
            value={form.father_phone ?? ""}
            onChange={(e) => set("father_phone", e.target.value || null)}
          />
        </Field>
        <Field label="母親姓名" hint="(＋電話＝家庭)">
          <input
            className={inputCls}
            value={form.mother_name ?? ""}
            onChange={(e) => set("mother_name", e.target.value || null)}
          />
        </Field>
        <Field label="母親電話" hint="(＋姓名＝家庭)">
          <input
            className={inputCls}
            inputMode="tel"
            value={form.mother_phone ?? ""}
            onChange={(e) => set("mother_phone", e.target.value || null)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="主要聯絡人">
          <div className="flex flex-wrap items-center gap-1.5">
            {CONTACTS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() =>
                  set("main_contact", form.main_contact === c ? null : c)
                }
                className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                  form.main_contact === c
                    ? "bg-navy text-white"
                    : "border border-black/15 text-black/60 hover:border-black/40"
                }`}
              >
                {c}
              </button>
            ))}
            <input
              className={`${inputCls} !w-24`}
              value={form.main_contact ?? ""}
              onChange={(e) => set("main_contact", e.target.value || null)}
              placeholder="其他…"
            />
          </div>
        </Field>
        <Field label="LINE 名稱" hint="(選填)">
          <input
            className={inputCls}
            value={form.line_name ?? ""}
            onChange={(e) => set("line_name", e.target.value || null)}
          />
        </Field>
      </div>
      <Field label="地址" hint="(選填)">
        <input
          className={inputCls}
          value={form.address ?? ""}
          onChange={(e) => set("address", e.target.value || null)}
        />
      </Field>

      {/* 備註 */}
      <Field label="備註" hint="(選填)">
        <textarea
          className={`${inputCls} min-h-[60px]`}
          value={form.notes ?? ""}
          onChange={(e) => set("notes", e.target.value || null)}
        />
      </Field>
    </div>
  );
}

// ── 收費紀錄區：歷史清單＋新增（選項化） ────────────
function FeeSection({
  student,
  records,
  teacher,
  onChanged,
}: {
  student: Student;
  records: StudentFeeRecord[];
  teacher: Teacher;
  onChanged: () => void;
}) {
  const mine = useMemo(
    () =>
      records
        .filter((r) => r.student_id === student.id)
        .sort((a, b) => b.charged_on.localeCompare(a.charged_on)),
    [records, student.id]
  );
  const last = latestFee(records, student.id);

  const [open, setOpen] = useState(false);
  const [chargedOn, setChargedOn] = useState(todayISO());
  const [plan, setPlan] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [collectedBy, setCollectedBy] = useState<string>("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function openForm(reuse: boolean) {
    setChargedOn(todayISO());
    if (reuse && last) {
      setPlan(last.plan ?? "");
      setAmount(last.amount == null ? "" : String(last.amount));
      setCollectedBy(last.collected_by ?? "");
      setNote(last.note ?? "");
    } else {
      setPlan(student.current_plan ?? "");
      setAmount("");
      setCollectedBy("");
      setNote("");
    }
    setErr(null);
    setOpen(true);
  }

  async function save() {
    setSaving(true);
    setErr(null);
    const { error } = await createFeeRecord({
      studentId: student.id,
      chargedOn,
      plan: plan.trim() || null,
      amount: amount === "" ? null : Number(amount),
      collectedBy: collectedBy.trim() || null,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      setErr(error);
      return;
    }
    setOpen(false);
    onChanged();
  }

  async function remove(id: string) {
    if (!window.confirm("刪除這筆收費紀錄？")) return;
    const { error } = await deleteFeeRecord(id);
    if (error) {
      setErr(error);
      return;
    }
    onChanged();
  }

  return (
    <div className="rounded-2xl border-2 border-brand/25 bg-brand/[0.04] p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-brand">
          💰 收費紀錄
          {last?.amount != null && (
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-navy">
              上次 {fmtMoney(last.amount)}
            </span>
          )}
        </h3>
        <div className="flex gap-2">
          {last && (
            <button
              onClick={() => openForm(true)}
              className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110 active:scale-95"
            >
              ＋沿用上次
            </button>
          )}
          <button
            onClick={() => openForm(false)}
            className="rounded-full border border-black/15 bg-white px-3 py-1 text-xs font-medium text-black/60 transition hover:border-black/40 active:scale-95"
          >
            ＋新增
          </button>
        </div>
      </div>

      {/* 新增收費表單（選項化） */}
      {open && (
        <div className="mb-3 space-y-2 rounded-xl border border-black/10 bg-white p-3">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs text-black/50">收費日期</span>
              <input
                type="date"
                className={inputCls}
                value={chargedOn}
                onChange={(e) => setChargedOn(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-black/50">金額</span>
              <input
                className={inputCls}
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="例：6400"
              />
            </label>
          </div>
          {/* 方案：選項式 */}
          <div>
            <span className="mb-1 block text-xs text-black/50">方案</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {PLAN_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPlan(plan === p ? "" : p)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    plan === p
                      ? "bg-navy text-white"
                      : "border border-black/15 text-black/60 hover:border-black/40"
                  }`}
                >
                  {p}
                </button>
              ))}
              <input
                className={`${inputCls} !w-28`}
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="其他…"
              />
            </div>
          </div>
          {/* 收款人：選項式 */}
          <div>
            <span className="mb-1 block text-xs text-black/50">收款人</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {COLLECTORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCollectedBy(collectedBy === c ? "" : c)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    collectedBy === c
                      ? "bg-navy text-white"
                      : "border border-black/15 text-black/60 hover:border-black/40"
                  }`}
                >
                  {c}
                </button>
              ))}
              <input
                className={`${inputCls} !w-24`}
                value={collectedBy}
                onChange={(e) => setCollectedBy(e.target.value)}
                placeholder="其他…"
              />
            </div>
          </div>
          <label className="block">
            <span className="mb-1 block text-xs text-black/50">備註</span>
            <input
              className={inputCls}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          {err && <p className="text-xs text-brand">{err}</p>}
          <div className="flex gap-2 pt-1">
            <button
              onClick={save}
              disabled={saving}
              className="rounded-full bg-brand px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 active:scale-95 disabled:opacity-50"
            >
              {saving ? "儲存中…" : "儲存這筆"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="rounded-full border border-black/15 px-4 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* 歷史清單 */}
      {mine.length === 0 ? (
        <p className="py-3 text-center text-xs text-black/35">尚無收費紀錄</p>
      ) : (
        <ul className="space-y-1.5">
          {mine.map((r, i) => (
            <li
              key={r.id}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
                i === 0
                  ? "border border-[#8CA07C]/40 bg-white"
                  : "bg-white/60"
              }`}
            >
              {i === 0 && (
                <span className="rounded-full bg-[#8CA07C]/20 px-1.5 py-0.5 text-[10px] font-bold text-[#5f7a4f]">
                  目前
                </span>
              )}
              <span className="text-xs text-black/45">
                {fmtDate(r.charged_on)}
              </span>
              <span className="flex-1 truncate">{r.plan ?? "—"}</span>
              <span className="tabular-nums font-medium">
                {fmtMoney(r.amount)}
              </span>
              {r.collected_by && (
                <span className="text-xs text-black/40">{r.collected_by}</span>
              )}
              {teacher.is_admin && (
                <button
                  onClick={() => remove(r.id)}
                  className="text-xs text-black/30 hover:text-brand"
                  title="刪除"
                >
                  ✕
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
