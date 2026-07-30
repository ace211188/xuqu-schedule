"use client";

import { supabase } from "./supabase";

// ── 狀態 ─────────────────────────────────────────────
// 招生鏈（依序，可一鍵推進）＋ 側狀態（手動切換，不在推進鏈上）
// 側狀態沿用紙本用語：暫停 / 畢業 / 流失
export type StudentStatus =
  | "完成免費測驗"
  | "完成試上"
  | "付定金"
  | "在學"
  | "暫停"
  | "畢業"
  | "流失";

// 自動推進的順序（免費測驗→試上→付定金→在學）
export const STATUS_CHAIN: StudentStatus[] = [
  "完成免費測驗",
  "完成試上",
  "付定金",
  "在學",
];

// 側狀態（不在自動推進鏈上，手動切換）
export const SIDE_STATUS: StudentStatus[] = ["暫停", "畢業", "流失"];

// 下拉用的全部狀態
export const ALL_STATUS: StudentStatus[] = [...STATUS_CHAIN, ...SIDE_STATUS];

// 狀態顏色（給 StatusPill 之外的自訂色票）
export const STATUS_TONE: Record<StudentStatus, string> = {
  完成免費測驗: "bg-slate-100 text-slate-600",
  完成試上: "bg-sky-100 text-sky-700",
  付定金: "bg-amber-100 text-amber-700",
  在學: "bg-[#8CA07C]/15 text-[#5f7a4f]",
  暫停: "bg-orange-100 text-orange-600",
  畢業: "bg-indigo-100 text-indigo-600",
  流失: "bg-black/10 text-black/45",
};

// 目前狀態的「下一階段」（只在自動推進鏈上有意義；到頂或側狀態回傳 null）
export function nextStatus(s: StudentStatus): StudentStatus | null {
  const i = STATUS_CHAIN.indexOf(s);
  if (i === -1 || i >= STATUS_CHAIN.length - 1) return null;
  return STATUS_CHAIN[i + 1];
}

// ── 課程種類（沿用排課慣例的 7 種，前端下拉） ──────────
export const COURSE_TYPES = [
  "一對一樂器",
  "一對一樂理",
  "雙軌團班",
  "雙軌精緻班",
  "學齡前律動",
  "兒音",
  "音樂遊戲探索",
] as const;
export type CourseType = (typeof COURSE_TYPES)[number];

// ── 來源 ─────────────────────────────────────────────
export const SOURCES = [
  "FB廣告",
  "路過",
  "舊生介紹",
  "親友介紹",
  "Google搜尋",
  "其他",
] as const;

// 口碑介紹金額提示（來源＝舊生介紹時顯示）
export const REFERRAL_HINT = "口碑介紹：舊生 −1000、新生 −500（寫在優惠備註即可）";

// 收款人快速選項（可自由手填其他）
export const COLLECTORS = ["宇群", "美君", "奕寬"] as const;

// 上課老師快速選項
export const TEACHERS = ["宇群", "美君", "奕寬", "蓁芸"] as const;

// 主要聯絡人快速選項
export const CONTACTS = ["媽", "爸", "爸+媽", "本人"] as const;

// ── 型別 ─────────────────────────────────────────────
export type Student = {
  id: string;
  name: string;
  nickname: string | null;
  gender: string | null;
  birthday: string | null;
  school: string | null;
  status: StudentStatus;
  enrolled_on: string | null;
  filed_on: string | null;
  father_name: string | null;
  father_phone: string | null;
  mother_name: string | null;
  mother_phone: string | null;
  main_contact: string | null;
  line_name: string | null;
  address: string | null;
  source: string | null;
  referrer_student_id: string | null;
  referrer_note: string | null;
  class_slot: string | null;
  instrument: string | null;
  teacher: string | null;
  course_type: string | null;
  current_plan: string | null;
  deposit_amount: number | null;
  deposit_note: string | null;
  discount_note: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type StudentFeeRecord = {
  id: string;
  student_id: string;
  charged_on: string;
  plan: string | null;
  amount: number | null;
  collected_by: string | null;
  note: string | null;
  created_at: string;
};

// 新增/編輯學生時可寫入的欄位（不含 id / 時間戳）
export type StudentInput = Omit<
  Student,
  "id" | "created_at" | "updated_at"
>;

// ── 小工具 ───────────────────────────────────────────
export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("zh-TW", {
    maximumFractionDigits: 0,
  })}`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 今天（本地時區）YYYY-MM-DD，給日期欄位當預設值
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// 家庭主家長：優先母，其次父（回傳 { name, phone }）
function primaryGuardian(s: Student): { name: string; phone: string } {
  const mName = (s.mother_name ?? "").trim();
  const mPhone = (s.mother_phone ?? "").trim();
  if (mName || mPhone) return { name: mName, phone: mPhone };
  return {
    name: (s.father_name ?? "").trim(),
    phone: (s.father_phone ?? "").trim(),
  };
}

// 家庭歸群 key：主家長姓名＋電話（兩者皆空回傳 null＝不歸群）
// 姓名含職業註記（如「高德勝(保險)」）時，取括號前主體當 key 以求穩定
export function familyKey(s: Student): string | null {
  const g = primaryGuardian(s);
  const name = g.name.replace(/[（(].*$/, "").trim();
  const phone = g.phone;
  if (!name && !phone) return null;
  return `${name}∣${phone}`;
}

// 依家庭把學生分組（回傳 [家庭顯示名, 學生[]]，家庭內依建立時間排序）
export function groupByFamily(students: Student[]): [string, Student[]][] {
  const map = new Map<string, Student[]>();
  const singles: Student[] = [];
  for (const s of students) {
    const k = familyKey(s);
    if (!k) {
      singles.push(s);
      continue;
    }
    const arr = map.get(k) ?? [];
    arr.push(s);
    map.set(k, arr);
  }
  const out: [string, Student[]][] = [];
  for (const [, arr] of map) {
    arr.sort((a, b) => a.created_at.localeCompare(b.created_at));
    const g = primaryGuardian(arr[0]);
    const label = g.name ? `${g.name} 家` : g.phone || "（未填家長）";
    out.push([label, arr]);
  }
  // 單一（未歸群）的學生各自成一組
  for (const s of singles) out.push([s.name, [s]]);
  // 多人家庭排前面
  out.sort((a, b) => b[1].length - a[1].length);
  return out;
}

// ── 讀取 ─────────────────────────────────────────────
export async function fetchStudents(): Promise<Student[]> {
  const { data } = await supabase
    .from("students")
    .select("*")
    .order("course_type", { nullsFirst: false })
    .order("name");
  return (data ?? []) as Student[];
}

export async function fetchFeeRecords(): Promise<StudentFeeRecord[]> {
  const { data } = await supabase
    .from("student_fee_records")
    .select("*")
    .order("charged_on", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as StudentFeeRecord[];
}

// 某生最新一筆收費（給「下次預設＝上次」帶入）
export function latestFee(
  records: StudentFeeRecord[],
  studentId: string
): StudentFeeRecord | null {
  return (
    records
      .filter((r) => r.student_id === studentId)
      .sort((a, b) => b.charged_on.localeCompare(a.charged_on))[0] ?? null
  );
}

// ── 寫入 helper ──────────────────────────────────────
type Res = { error: string | null };

export async function createStudent(input: Partial<StudentInput> & { name: string }): Promise<
  { id: string | null; error: string | null }
> {
  const { data, error } = await supabase
    .from("students")
    .insert(input)
    .select("id")
    .single();
  return { id: data?.id ?? null, error: error?.message ?? null };
}

export async function updateStudent(
  id: string,
  patch: Partial<StudentInput>
): Promise<Res> {
  const { error } = await supabase.from("students").update(patch).eq("id", id);
  return { error: error?.message ?? null };
}

// 一鍵推進到下一階段（已在「在學」或側狀態時前端不會呼叫）
export async function advanceStatus(
  id: string,
  current: StudentStatus
): Promise<Res> {
  const nxt = nextStatus(current);
  if (!nxt) return { error: "已無下一階段" };
  return updateStudent(id, { status: nxt });
}

export async function deleteStudent(id: string): Promise<Res> {
  const { error } = await supabase.from("students").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function createFeeRecord(p: {
  studentId: string;
  chargedOn: string;
  plan: string | null;
  amount: number | null;
  collectedBy: string | null;
  note: string | null;
}): Promise<Res> {
  const { error } = await supabase.from("student_fee_records").insert({
    student_id: p.studentId,
    charged_on: p.chargedOn,
    plan: p.plan,
    amount: p.amount,
    collected_by: p.collectedBy,
    note: p.note,
  });
  return { error: error?.message ?? null };
}

export async function deleteFeeRecord(id: string): Promise<Res> {
  const { error } = await supabase
    .from("student_fee_records")
    .delete()
    .eq("id", id);
  return { error: error?.message ?? null };
}
