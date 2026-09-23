"use client";

import { supabase } from "./supabase";
import { todayISO } from "./accounting";

export type ClosingRoom = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

export type RosterEntry = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

export type ClosingRecord = {
  id: string;
  close_date: string;
  closed_by: string | null;
  rooms_checked: string[];
  rooms_total: number;
  petty_expected: number | null;
  petty_actual: number | null;
  today_change: number;
  note: string | null;
  created_at: string;
};

type Res = { error: string | null };

// ── ISO 週次（用於廁所清潔自動輪值）──
export function isoWeek(base = new Date()): number {
  const d = new Date(
    Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())
  );
  const dayNum = (d.getUTCDay() + 6) % 7; // 週一=0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // 移到當週週四
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const ft = (firstThursday.getUTCDay() + 6) % 7;
  return (
    1 +
    Math.round(
      ((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ft) / 7
    )
  );
}

// 本週輪到誰打掃廁所（依名單順序＋週次）
export function weekDuty(roster: RosterEntry[], base = new Date()): string | null {
  if (roster.length === 0) return null;
  const idx = (isoWeek(base) - 1) % roster.length;
  return roster[idx]?.name ?? null;
}

// ── 讀取 ──
export async function fetchRooms(): Promise<ClosingRoom[]> {
  const { data } = await supabase
    .from("closing_rooms")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as ClosingRoom[];
}

export async function fetchRoster(): Promise<RosterEntry[]> {
  const { data } = await supabase
    .from("toilet_roster")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as RosterEntry[];
}

export async function fetchTodayClosing(): Promise<ClosingRecord | null> {
  const { data } = await supabase
    .from("closing_records")
    .select("*")
    .eq("close_date", todayISO())
    .maybeSingle();
  return (data as ClosingRecord) ?? null;
}

export async function fetchClosingHistory(limit = 60): Promise<ClosingRecord[]> {
  const { data } = await supabase
    .from("closing_records")
    .select("*")
    .order("close_date", { ascending: false })
    .limit(limit);
  return (data ?? []) as ClosingRecord[];
}

// ── 寫入：今天的打烊紀錄（一天一筆，close_date 為衝突鍵）──
export async function saveClosing(p: {
  closedBy: string;
  roomsChecked: string[];
  roomsTotal: number;
  pettyExpected: number | null;
  pettyActual: number | null;
  todayChange: number;
  note: string | null;
}): Promise<Res> {
  const { error } = await supabase.from("closing_records").upsert(
    {
      close_date: todayISO(),
      closed_by: p.closedBy,
      rooms_checked: p.roomsChecked,
      rooms_total: p.roomsTotal,
      petty_expected: p.pettyExpected,
      petty_actual: p.pettyActual,
      today_change: p.todayChange,
      note: p.note,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "close_date" }
  );
  return { error: error?.message ?? null };
}

// ── 設定：教室清單 / 廁所輪值（管理員）──
export async function addRoom(name: string, sortOrder: number): Promise<Res> {
  const { error } = await supabase
    .from("closing_rooms")
    .insert({ name, sort_order: sortOrder });
  return { error: error?.message ?? null };
}

export async function removeRoom(id: string): Promise<Res> {
  const { error } = await supabase.from("closing_rooms").delete().eq("id", id);
  return { error: error?.message ?? null };
}

export async function addRosterEntry(
  name: string,
  sortOrder: number
): Promise<Res> {
  const { error } = await supabase
    .from("toilet_roster")
    .insert({ name, sort_order: sortOrder });
  return { error: error?.message ?? null };
}

export async function removeRosterEntry(id: string): Promise<Res> {
  const { error } = await supabase.from("toilet_roster").delete().eq("id", id);
  return { error: error?.message ?? null };
}
