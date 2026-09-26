"use client";

import { supabase } from "./supabase";
import { todayISO } from "./accounting";

export type ClosingRoom = {
  id: string;
  name: string;
  sort_order: number;
  active: boolean;
};

// 打烊工作（倒垃圾、消毒拖鞋…），結構同教室清單
export type ClosingTask = ClosingRoom;

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
  closer_name: string | null; // 填寫者名字（由 closing_list RPC 帶出）
  rooms_checked: string[];
  rooms_total: number;
  tasks_checked: string[];
  tasks_total: number;
  petty_expected: number | null;
  petty_actual: number | null;
  today_change: number;
  note: string | null;
  created_at: string;
  updated_at: string;
};

// 零用金盤點數字（工讀生也拿得到，但只有這兩個數字）
export type PettySummary = {
  has_petty: boolean;
  petty_expected: number | null;
  today_change: number;
};

type Res = { error: string | null };

// ── 編輯權限：當天第一個存檔的人＝編輯者；自第一次存檔起 8 小時內可改（資料庫同樣把關）──
export const EDIT_WINDOW_HOURS = 8;

export function editDeadline(r: ClosingRecord): Date {
  return new Date(new Date(r.created_at).getTime() + EDIT_WINDOW_HOURS * 3600_000);
}

export type EditState =
  | { canEdit: true; deadline: Date | null } // deadline=null：今天還沒人存檔
  | { canEdit: false; reason: "others" | "expired" };

export function closingEditState(
  r: ClosingRecord | null,
  myId: string,
  now = new Date()
): EditState {
  if (!r) return { canEdit: true, deadline: null };
  if (r.closed_by !== myId) return { canEdit: false, reason: "others" };
  const deadline = editDeadline(r);
  if (now >= deadline) return { canEdit: false, reason: "expired" };
  return { canEdit: true, deadline };
}

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

export async function fetchTasks(): Promise<ClosingTask[]> {
  const { data } = await supabase
    .from("closing_tasks")
    .select("*")
    .eq("active", true)
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as ClosingTask[];
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

// 打烊紀錄（新→舊，含填寫者名字）。經 RPC：工讀生讀不到 teachers 名單，由資料庫帶出名字
export async function fetchClosingList(limit = 60): Promise<ClosingRecord[]> {
  const { data } = await supabase.rpc("closing_list", { p_limit: limit });
  return ((data ?? []) as ClosingRecord[]).map((r) => ({
    ...r,
    rooms_checked: r.rooms_checked ?? [],
    tasks_checked: r.tasks_checked ?? [],
    tasks_total: r.tasks_total ?? 0,
    petty_expected: r.petty_expected == null ? null : Number(r.petty_expected),
    petty_actual: r.petty_actual == null ? null : Number(r.petty_actual),
    today_change: Number(r.today_change ?? 0),
  }));
}

// 零用金「帳上應有」與「今日找錢」（p_date 用本地日期）
export async function fetchPettySummary(
  date = todayISO()
): Promise<PettySummary | null> {
  const { data, error } = await supabase.rpc("closing_petty_summary", {
    p_date: date,
  });
  if (error || !data) return null;
  const d = data as PettySummary;
  return {
    has_petty: !!d.has_petty,
    petty_expected: d.petty_expected == null ? null : Number(d.petty_expected),
    today_change: Number(d.today_change ?? 0),
  };
}

// ── 寫入：今天的打烊紀錄（一天一筆，close_date 為衝突鍵）──
export async function saveClosing(p: {
  closedBy: string;
  roomsChecked: string[];
  roomsTotal: number;
  tasksChecked: string[];
  tasksTotal: number;
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
      tasks_checked: p.tasksChecked,
      tasks_total: p.tasksTotal,
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

export async function addTask(name: string, sortOrder: number): Promise<Res> {
  const { error } = await supabase
    .from("closing_tasks")
    .insert({ name, sort_order: sortOrder });
  return { error: error?.message ?? null };
}

export async function removeTask(id: string): Promise<Res> {
  const { error } = await supabase.from("closing_tasks").delete().eq("id", id);
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
