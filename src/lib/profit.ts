"use client";

import { supabase } from "./supabase";
import {
  cycleMonths,
  SESSIONS_PER_MONTH,
  type ClassCost,
  type Student,
} from "./students";

// ── 每位學生的月營收 / 月個別成本 ─────────────────────
// 月營收 = 每期學費 ÷ 週期月數（雙月2 / 年繳12 / 單堂1）
export function studentMonthlyRevenue(s: Student): number {
  const amt = Number(s.fee_amount ?? 0);
  if (!amt) return 0;
  return amt / cycleMonths(s.fee_cycle);
}
// 個別課月成本 = 個別每堂鐘點 × 每月堂數(4)
export function studentMonthlyInstrumentCost(s: Student): number {
  const rate = Number(s.instrument_rate ?? 0);
  return rate * SESSIONS_PER_MONTH;
}

// ── 毛利計算（班別制）─────────────────────────────────
export type ClassProfit = {
  key: string;
  label: string; // 班別名（或個別學生名）
  slot: string | null;
  studentCount: number;
  revenue: number;
  cost: number;
  gross: number;
};

export type ProfitResult = {
  revenue: number;
  cost: number;
  gross: number;
  margin: number;
  fixedOverhead: number;
  gapToOverhead: number; // ≤0＝已達標
  classes: ClassProfit[];
};

export function computeProfit(params: {
  students: Student[];
  classCosts: ClassCost[];
  fixedOverhead: number;
}): ProfitResult {
  const { students, classCosts, fixedOverhead } = params;
  const costBySlot = new Map(
    classCosts.map((c) => [c.class_slot, Number(c.session_cost)])
  );

  // 分班：同 class_slot 一組；無班別者各自成組（以學生為單位）
  // 毛利只計「在學」學生；其他狀態（試上/付定金/暫停/畢業/流失…）不列入
  type Grp = { key: string; slot: string | null; name: string; list: Student[] };
  const groups = new Map<string, Grp>();
  for (const s of students) {
    if (s.status !== "在學") continue;
    const slot = (s.class_slot ?? "").trim();
    const key = slot ? `班:${slot}` : `個別:${s.id}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, slot: slot || null, name: slot || s.name, list: [] };
      groups.set(key, g);
    }
    g.list.push(s);
  }

  const classes: ClassProfit[] = [];
  for (const g of groups.values()) {
    const revenue = g.list.reduce((a, s) => a + studentMonthlyRevenue(s), 0);
    const instrumentCost = g.list.reduce(
      (a, s) => a + studentMonthlyInstrumentCost(s),
      0
    );
    // 團班/樂理共用成本：班別每堂 × 每月堂數
    const groupCost =
      (g.slot ? costBySlot.get(g.slot) ?? 0 : 0) * SESSIONS_PER_MONTH;
    const cost = instrumentCost + groupCost;
    if (revenue === 0 && cost === 0) continue; // 尚未填資料的班不顯示
    classes.push({
      key: g.key,
      // 班別欄：先列學生名（括號），再接班別代號；無班別者只顯示學生名
      label: g.slot
        ? `（${g.list.map((s) => s.name).join("・")}）${g.slot}`
        : g.list[0]?.name ?? g.name,
      slot: g.slot,
      studentCount: g.list.length,
      revenue,
      cost,
      gross: revenue - cost,
    });
  }
  classes.sort((a, b) => b.gross - a.gross);

  const revenue = classes.reduce((a, c) => a + c.revenue, 0);
  const cost = classes.reduce((a, c) => a + c.cost, 0);
  const gross = revenue - cost;
  const margin = revenue > 0 ? gross / revenue : 0;
  return {
    revenue,
    cost,
    gross,
    margin,
    fixedOverhead,
    gapToOverhead: fixedOverhead - gross,
    classes,
  };
}

// ── 固定開銷設定（biz_settings，單列）──────────────────
type Res = { error: string | null };

export async function fetchFixedOverhead(): Promise<number> {
  const { data } = await supabase
    .from("biz_settings")
    .select("fixed_overhead")
    .eq("id", 1)
    .maybeSingle();
  return Number(data?.fixed_overhead ?? 80000);
}

export async function updateFixedOverhead(value: number): Promise<Res> {
  const { error } = await supabase
    .from("biz_settings")
    .update({ fixed_overhead: value })
    .eq("id", 1);
  return { error: error?.message ?? null };
}
