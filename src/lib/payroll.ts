"use client";

import { supabase } from "./supabase";

// ============================================================
// 老師勞務報酬 / 發薪 — 型別、稅務試算、讀寫 helper
// 資料表：payroll_payee / payroll_records（RLS：只有宇群可讀寫）
// ============================================================

// 發薪功能只開放宇群本人（前端 UI 用；資料庫端另有 is_yuqun() RLS 把關）。
// 要換人只改這裡與 payroll_schema.sql 的 is_yuqun()。
export const PAYROLL_EMAIL = "yuqun@xuqu.tw";

export type IncomeCategory = "執行業務" | "兼職薪資";

export type Payee = {
  id: string;
  name: string;
  id_number: string | null;
  birth_roc: string | null;
  address: string | null;
  phone: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account: string | null;
  income_category: IncomeCategory;
  union_exempt: boolean;
  union_name: string | null;
  note: string | null;
  teacher_id: string | null;
  created_at: string;
  updated_at: string;
};

export type PayrollRecord = {
  id: string;
  payee_id: string;
  pay_ym: string; // 'YYYY-MM'（西元）
  issue_date: string; // 'YYYY-MM-DD'
  gross_amount: number;
  tax_withholding: number;
  nhi_premium: number;
  net_amount: number;
  income_category: IncomeCategory;
  union_exempt: boolean;
  course_types: string[];
  status: "issued" | "paid";
  paid_account_id: string | null;
  paid_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

// ── 稅務門檻與費率（依教室簽收單範本；如遇年度調整只改這裡）──
export const EXEC_TAX_THRESHOLD = 20009; // 執行業務：單次給付 ≥ 此額預扣
export const EXEC_TAX_RATE = 0.1;
export const SALARY_TAX_THRESHOLD = 88501; // 兼職薪資：單次給付 ≥ 此額預扣
export const SALARY_TAX_RATE = 0.05;
export const NHI_THRESHOLD = 20000; // 補充保費：單次給付 ≥ 此額需扣
export const NHI_RATE = 0.0211;

// 授課種類（對照簽收單第一頁「二、授課內容」）
export const COURSE_TYPES = [
  "序曲雙軌課程（明星課程·樂器 × 樂理）",
  "樂器個別課程",
  "樂理個別課程",
  "其他課程／項目（大師班／講座／評鑑／檢定／評審費等）",
] as const;

export type TaxResult = {
  gross: number; // A（四捨五入至元）
  taxWithholding: number; // B
  nhiPremium: number; // C
  netAmount: number; // D = A - B - C
  taxExempt: boolean; // B 是否免扣繳
  taxRatePct: number; // 該所得類別適用稅率（10 或 5）
  nhiExempt: boolean; // C 是否免扣繳
  unionDeclaration: boolean; // 是否勾「工會投保證明免扣補充保費」聲明
};

// 稅務試算：輸入 A（應給付總額）、所得類別、是否具工會免扣證明
export function computeTax(
  grossInput: number,
  category: IncomeCategory,
  unionExempt: boolean
): TaxResult {
  const A = Math.max(0, Math.round(grossInput || 0));
  const ratePct = category === "執行業務" ? 10 : 5;

  // (B) 預扣所得稅
  let B = 0;
  if (category === "執行業務") {
    if (A >= EXEC_TAX_THRESHOLD) B = Math.round(A * EXEC_TAX_RATE);
  } else {
    if (A >= SALARY_TAX_THRESHOLD) B = Math.round(A * SALARY_TAX_RATE);
  }

  // (C) 補充保費：具工會證明且所得類別為執行業務 → 豁免；否則達門檻扣 2.11%
  const unionApplies = unionExempt && category === "執行業務";
  let C = 0;
  if (!unionApplies && A >= NHI_THRESHOLD) C = Math.round(A * NHI_RATE);

  return {
    gross: A,
    taxWithholding: B,
    nhiPremium: C,
    netAmount: A - B - C,
    taxExempt: B === 0,
    taxRatePct: ratePct,
    nhiExempt: C === 0,
    unionDeclaration: unionApplies,
  };
}

// ── 民國年 / 西元 轉換 ──────────────────────────────────
export function toRocYear(gYear: number): number {
  return gYear - 1911;
}
export function fromRocYear(rocYear: number): number {
  return rocYear + 1911;
}
// 'YYYY-MM'（西元）→ 顯示「民國 114 年 8 月」
export function fmtRocYm(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  return `民國 ${toRocYear(y)} 年 ${m} 月`;
}
// 目前的民國年月，給開單預設值
export function currentRocYm(): { rocYear: number; month: number } {
  const d = new Date();
  return { rocYear: toRocYear(d.getFullYear()), month: d.getMonth() + 1 };
}

// ── 讀取 ─────────────────────────────────────────────
export async function fetchPayees(): Promise<Payee[]> {
  const { data } = await supabase
    .from("payroll_payee")
    .select("*")
    .order("created_at");
  return (data ?? []) as Payee[];
}

export async function fetchPayrollRecords(): Promise<PayrollRecord[]> {
  const { data } = await supabase
    .from("payroll_records")
    .select("*")
    .order("pay_ym", { ascending: false })
    .order("created_at", { ascending: false });
  return (data ?? []) as PayrollRecord[];
}

// ── 寫入 helper（回傳 { error }）───────────────────────
type Res = { error: string | null };

export type PayeeInput = {
  name: string;
  id_number: string | null;
  birth_roc: string | null;
  address: string | null;
  phone: string | null;
  bank_name: string | null;
  bank_branch: string | null;
  bank_account: string | null;
  income_category: IncomeCategory;
  union_exempt: boolean;
  union_name: string | null;
  note: string | null;
};

export async function createPayee(input: PayeeInput): Promise<Res> {
  const { error } = await supabase.from("payroll_payee").insert(input);
  return { error: error?.message ?? null };
}

export async function updatePayee(
  id: string,
  patch: Partial<PayeeInput>
): Promise<Res> {
  const { error } = await supabase
    .from("payroll_payee")
    .update(patch)
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deletePayee(id: string): Promise<Res> {
  const { error } = await supabase.from("payroll_payee").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function createPayrollRecord(p: {
  payeeId: string;
  payYm: string;
  issueDate: string;
  gross: number;
  tax: number;
  nhi: number;
  net: number;
  incomeCategory: IncomeCategory;
  unionExempt: boolean;
  courseTypes: string[];
  createdBy: string;
}): Promise<Res> {
  const { error } = await supabase.from("payroll_records").insert({
    payee_id: p.payeeId,
    pay_ym: p.payYm,
    issue_date: p.issueDate,
    gross_amount: p.gross,
    tax_withholding: p.tax,
    nhi_premium: p.nhi,
    net_amount: p.net,
    income_category: p.incomeCategory,
    union_exempt: p.unionExempt,
    course_types: p.courseTypes,
    created_by: p.createdBy,
  });
  return { error: error?.message ?? null };
}

export async function markPayrollPaid(
  id: string,
  paid: boolean
): Promise<Res> {
  const { error } = await supabase
    .from("payroll_records")
    .update({
      status: paid ? "paid" : "issued",
      paid_at: paid ? new Date().toISOString() : null,
    })
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deletePayrollRecord(id: string): Promise<Res> {
  const { error } = await supabase
    .from("payroll_records")
    .delete()
    .eq("id", id);
  return { error: error?.message ?? null };
}
