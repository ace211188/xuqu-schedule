"use client";

import { supabase } from "./supabase";
import type { Student, StudentFeeRecord } from "./students";

// ── 型別 ─────────────────────────────────────────────
export type CostMethod = "split" | "hourly";

export type TeacherCost = {
  teacher: string;
  method: CostMethod;
  split_pct: number | null; // 拆帳％（0–100）
  hourly_rate: number | null; // 每小時成本
  active: boolean;
};

export type MonthlyHours = { teacher: string; month: string; hours: number };

// ── 讀取 ─────────────────────────────────────────────
export async function fetchTeacherCosts(): Promise<TeacherCost[]> {
  const { data } = await supabase
    .from("teacher_cost_config")
    .select("*")
    .order("teacher");
  return (data ?? []) as TeacherCost[];
}

export async function fetchMonthlyHours(month: string): Promise<MonthlyHours[]> {
  const { data } = await supabase
    .from("teacher_monthly_hours")
    .select("*")
    .eq("month", month);
  return (data ?? []) as MonthlyHours[];
}

export async function fetchFixedOverhead(): Promise<number> {
  const { data } = await supabase
    .from("biz_settings")
    .select("fixed_overhead")
    .eq("id", 1)
    .maybeSingle();
  return Number(data?.fixed_overhead ?? 80000);
}

// ── 寫入 ─────────────────────────────────────────────
type Res = { error: string | null };

export async function upsertTeacherCost(c: TeacherCost): Promise<Res> {
  const { error } = await supabase.from("teacher_cost_config").upsert(c);
  return { error: error?.message ?? null };
}

export async function deleteTeacherCost(teacher: string): Promise<Res> {
  const { error } = await supabase
    .from("teacher_cost_config")
    .delete()
    .eq("teacher", teacher);
  return { error: error?.message ?? null };
}

export async function upsertMonthlyHours(
  teacher: string,
  month: string,
  hours: number
): Promise<Res> {
  const { error } = await supabase
    .from("teacher_monthly_hours")
    .upsert({ teacher, month, hours });
  return { error: error?.message ?? null };
}

export async function updateFixedOverhead(value: number): Promise<Res> {
  const { error } = await supabase
    .from("biz_settings")
    .update({ fixed_overhead: value })
    .eq("id", 1);
  return { error: error?.message ?? null };
}

// ── 小工具 ───────────────────────────────────────────
// 學生的 teacher 欄可能是「宇群」或「宇群, 美君」等文字。
// 從已設定成本的老師名單中，找出第一個出現在該生 teacher 文字裡的老師。
export function matchTeacher(
  studentTeacher: string | null,
  configs: TeacherCost[]
): string | null {
  const t = (studentTeacher ?? "").trim();
  if (!t) return null;
  for (const c of configs) {
    if (c.active && c.teacher && t.includes(c.teacher)) return c.teacher;
  }
  return null;
}

// 目前月份 'YYYY-MM'
export function currentMonth(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── 毛利計算 ─────────────────────────────────────────
export type ProfitResult = {
  month: string;
  revenue: number; // 當月學費收入（依繳費日）
  teacherCost: number; // 老師鐘點/拆帳成本合計
  gross: number; // 毛利 = 收入 − 成本
  margin: number; // 毛利率 = 毛利 / 收入（收入為 0 時為 0）
  fixedOverhead: number; // 固定開銷目標（預設 80000）
  gapToOverhead: number; // 還差多少才蓋過固定開銷（≤0＝已達標）
  perStudent: Map<string, { revenue: number; cost: number; gross: number }>;
  // 有學費收入、但老師未設定成本（成本以 0 計）的老師名單，提示補設定
  unconfiguredTeachers: string[];
};

export function computeProfit(params: {
  month: string;
  students: Student[];
  feeRecords: StudentFeeRecord[];
  costs: TeacherCost[];
  hours: MonthlyHours[];
  fixedOverhead: number;
}): ProfitResult {
  const { month, students, feeRecords, costs, hours, fixedOverhead } = params;

  const studentById = new Map(students.map((s) => [s.id, s]));
  const costByTeacher = new Map(costs.map((c) => [c.teacher, c]));
  const hoursByTeacher = new Map(hours.map((h) => [h.teacher, Number(h.hours)]));

  // 1) 各生「當月」學費收入（依繳費日）
  const revByStudent = new Map<string, number>();
  for (const r of feeRecords) {
    if (!r.charged_on || !r.charged_on.startsWith(month)) continue;
    revByStudent.set(
      r.student_id,
      (revByStudent.get(r.student_id) ?? 0) + Number(r.amount ?? 0)
    );
  }

  // 2) 依老師歸戶：該老師名下學生的當月收入（拆帳、鐘點分攤都要用）
  const revByTeacher = new Map<string, number>();
  const studentsOfTeacher = new Map<string, string[]>();
  const unconfigured = new Set<string>();
  for (const [sid, rev] of revByStudent) {
    if (rev <= 0) continue;
    const st = studentById.get(sid);
    const tName = matchTeacher(st?.teacher ?? null, costs);
    if (!tName) {
      // 有收入但對不到已設定成本的老師 → 記錄原始 teacher 文字提示補設定
      if (st?.teacher?.trim()) unconfigured.add(st.teacher.trim());
      continue;
    }
    revByTeacher.set(tName, (revByTeacher.get(tName) ?? 0) + rev);
    const arr = studentsOfTeacher.get(tName) ?? [];
    arr.push(sid);
    studentsOfTeacher.set(tName, arr);
  }

  // 3) 各老師當月成本
  //    split ：成本 = 該師名下學生當月收入 × split_pct%
  //    hourly：成本 = 當月時數 × hourly_rate（與收入無關），再依學生收入比例分攤到每生
  const costByStudent = new Map<string, number>();
  let totalTeacherCost = 0;

  for (const [tName, cfg] of costByTeacher) {
    if (!cfg.active) continue;
    const teacherRev = revByTeacher.get(tName) ?? 0;
    const sids = studentsOfTeacher.get(tName) ?? [];

    if (cfg.method === "split") {
      const pct = Number(cfg.split_pct ?? 0) / 100;
      for (const sid of sids) {
        const c = (revByStudent.get(sid) ?? 0) * pct;
        costByStudent.set(sid, (costByStudent.get(sid) ?? 0) + c);
        totalTeacherCost += c;
      }
    } else {
      // hourly：整位老師的月成本，再按學生收入占比分攤（近似）
      const teacherCost =
        (hoursByTeacher.get(tName) ?? 0) * Number(cfg.hourly_rate ?? 0);
      totalTeacherCost += teacherCost;
      if (teacherRev > 0) {
        for (const sid of sids) {
          const share = (revByStudent.get(sid) ?? 0) / teacherRev;
          costByStudent.set(
            sid,
            (costByStudent.get(sid) ?? 0) + teacherCost * share
          );
        }
      }
    }
  }

  // 4) 每生毛利
  const perStudent = new Map<
    string,
    { revenue: number; cost: number; gross: number }
  >();
  for (const [sid, rev] of revByStudent) {
    const cost = costByStudent.get(sid) ?? 0;
    perStudent.set(sid, { revenue: rev, cost, gross: rev - cost });
  }

  const revenue = [...revByStudent.values()].reduce((a, b) => a + b, 0);
  const gross = revenue - totalTeacherCost;
  const margin = revenue > 0 ? gross / revenue : 0;

  return {
    month,
    revenue,
    teacherCost: totalTeacherCost,
    gross,
    margin,
    fixedOverhead,
    gapToOverhead: fixedOverhead - gross,
    perStudent,
    unconfiguredTeachers: [...unconfigured],
  };
}
