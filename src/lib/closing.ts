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

// ── 打烊輪值 / 指派工讀生 / 公休 ──
export type ScheduleDay = {
  day: string; // YYYY-MM-DD（台灣日期）
  weekday: number; // 0=週日 … 6=週六
  holiday: boolean; // 公休（固定或當天標記）
  fixed_holiday: boolean; // 每週固定公休（例：週一）
  rota_id: string | null; // 輪值的人
  rota_name: string | null;
  worker_id: string | null; // 被指派的工讀生
  worker_name: string | null;
};

export type RotaRow = {
  weekday: number;
  teacher_id: string | null;
  closed: boolean;
};

export const WEEKDAY_LABEL = ["日", "一", "二", "三", "四", "五", "六"];

// 本地日期加 n 天（YYYY-MM-DD）
export function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(
    dt.getDate()
  ).padStart(2, "0")}`;
}

// 當天負責人（顯示用）：有指派代班時「代班的人（代 輪值的人）」
export function dutyLabel(s: ScheduleDay): string {
  if (s.holiday) return "公休";
  if (s.worker_name && s.rota_name) return `${s.worker_name}（代${s.rota_name}）`;
  return s.worker_name ?? s.rota_name ?? "未設定";
}

// 能不能建立這天的打烊紀錄（與資料庫 closing_can_fill 相同規則，資料庫也會把關）
export function canFillDay(s: ScheduleDay | null, myId: string): boolean {
  if (!s) return true;
  if (s.holiday) return false;
  if (!s.rota_id && !s.worker_id) return true;
  return myId === s.rota_id || myId === s.worker_id;
}

export async function fetchSchedule(
  from: string,
  to: string
): Promise<ScheduleDay[]> {
  const { data } = await supabase.rpc("closing_schedule", {
    p_from: from,
    p_to: to,
  });
  return (data ?? []) as ScheduleDay[];
}

export async function setHoliday(day: string, holiday: boolean): Promise<Res> {
  const { error } = await supabase.rpc("closing_set_holiday", {
    p_day: day,
    p_holiday: holiday,
  });
  return { error: error?.message ?? null };
}

export async function assignWorker(
  day: string,
  workerId: string | null
): Promise<Res> {
  const { error } = await supabase.rpc("closing_assign_worker", {
    p_day: day,
    p_worker: workerId,
  });
  return { error: error?.message ?? null };
}

// 可被指派打烊的人：記帳成員（宇群/美君/奕寬）＋工讀生。
// 宇群可指派全部；輪值的人只能指派工讀生（資料庫同樣把關）。
// 記帳成員讀得到 teachers；工讀生本人拿到空陣列也沒關係（工讀生不會指派）。
export type AssignableOption = { id: string; name: string; is_worker: boolean };

export async function fetchAssignableOptions(): Promise<AssignableOption[]> {
  const { data } = await supabase
    .from("teachers")
    .select("id,name,is_worker")
    .or("is_worker.eq.true,can_accounting.eq.true")
    .order("is_worker")
    .order("name");
  return (data ?? []) as AssignableOption[];
}

export async function fetchRota(): Promise<RotaRow[]> {
  const { data } = await supabase
    .from("closing_rota")
    .select("weekday,teacher_id,closed")
    .order("weekday");
  return (data ?? []) as RotaRow[];
}

export async function saveRotaDay(row: RotaRow): Promise<Res> {
  const { error } = await supabase
    .from("closing_rota")
    .upsert({ ...row, updated_at: new Date().toISOString() });
  return { error: error?.message ?? null };
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
