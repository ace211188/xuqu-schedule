"use client";

import { supabase } from "./supabase";

// 今天的出勤狀態
export type TodayAttendance = {
  checkedIn: boolean;
  checkInAt: string | null;
  checkedOut: boolean;
  checkOutAt: string | null;
};

export type AllowedNetwork = {
  id: string;
  ip: string;
  label: string | null;
  created_at: string;
};

export type AttendanceStatus = {
  ip: string | null; // 目前這台裝置的對外 IP（正規化後）
  onSite: boolean; // 是否在允許的店裡網路
  isWorker: boolean;
  isAdmin: boolean;
  today: TodayAttendance;
  networks?: AllowedNetwork[]; // 僅管理員
};

type Mode =
  | "status"
  | "checkin"
  | "checkout"
  | "allow_network"
  | "remove_network"
  | "list_workers"
  | "create_worker"
  | "delete_worker"
  | "create_invite"
  | "list_invites"
  | "revoke_invite"
  | "register_with_invite";

export type WorkerRow = { id: string; name: string };

export type WorkerInvite = {
  code: string;
  note: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  used_by: string | null;
};

// Edge Function 回傳的錯誤（非 2xx）藏在 error.context，盡量把訊息挖出來
async function readFnError(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") {
    try {
      const body = await ctx.json();
      if (body?.error) return String(body.error);
    } catch {
      /* ignore */
    }
  }
  return (error as { message?: string })?.message ?? "操作失敗";
}

async function call(
  mode: Mode,
  extra?: {
    label?: string;
    networkId?: string;
    handle?: string;
    name?: string;
    password?: string;
    workerId?: string;
    code?: string;
    note?: string;
  }
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const { data, error } = await supabase.functions.invoke("worker-checkin", {
    body: { mode, ...extra },
  });
  if (error) return { data: null, error: await readFnError(error) };
  return { data: data as Record<string, unknown>, error: null };
}

export async function fetchAttendanceStatus(): Promise<AttendanceStatus | null> {
  const { data } = await call("status");
  return (data as AttendanceStatus | null) ?? null;
}

export async function checkIn(): Promise<{
  today: TodayAttendance | null;
  error: string | null;
}> {
  const { data, error } = await call("checkin");
  return { today: (data?.today as TodayAttendance) ?? null, error };
}

export async function checkOut(): Promise<{
  today: TodayAttendance | null;
  error: string | null;
}> {
  const { data, error } = await call("checkout");
  return { today: (data?.today as TodayAttendance) ?? null, error };
}

// 管理員：把目前這台裝置的網路加入允許清單
export async function allowCurrentNetwork(
  label?: string
): Promise<{ networks: AllowedNetwork[]; ip: string | null; error: string | null }> {
  const { data, error } = await call("allow_network", { label });
  return {
    networks: (data?.networks as AllowedNetwork[]) ?? [],
    ip: (data?.ip as string) ?? null,
    error,
  };
}

export async function removeNetwork(
  networkId: string
): Promise<{ networks: AllowedNetwork[]; error: string | null }> {
  const { data, error } = await call("remove_network", { networkId });
  return { networks: (data?.networks as AllowedNetwork[]) ?? [], error };
}

// 管理員：工讀生帳號
export async function listWorkers(): Promise<WorkerRow[]> {
  const { data } = await call("list_workers");
  return (data?.workers as WorkerRow[]) ?? [];
}

export async function createWorker(p: {
  handle: string;
  name: string;
  password: string;
}): Promise<{ email: string | null; error: string | null }> {
  const { data, error } = await call("create_worker", p);
  return { email: (data?.email as string) ?? null, error };
}

export async function deleteWorker(
  workerId: string
): Promise<{ error: string | null }> {
  const { error } = await call("delete_worker", { workerId });
  return { error };
}

// 管理員：工讀生邀請碼（一次性、7 天內有效）
export async function createInvite(note?: string): Promise<{
  code: string | null;
  invites: WorkerInvite[];
  error: string | null;
}> {
  const { data, error } = await call("create_invite", { note });
  return {
    code: (data?.code as string) ?? null,
    invites: (data?.invites as WorkerInvite[]) ?? [],
    error,
  };
}

export async function listInvites(): Promise<WorkerInvite[]> {
  const { data } = await call("list_invites");
  return (data?.invites as WorkerInvite[]) ?? [];
}

export async function revokeInvite(
  code: string
): Promise<{ invites: WorkerInvite[]; error: string | null }> {
  const { data, error } = await call("revoke_invite", { code });
  return { invites: (data?.invites as WorkerInvite[]) ?? [], error };
}

// 工讀生（免登入）：用邀請碼自己設定帳號密碼
export async function registerWithInvite(p: {
  code: string;
  name: string;
  handle: string;
  password: string;
}): Promise<{ handle: string | null; error: string | null }> {
  const { data, error } = await call("register_with_invite", p);
  return { handle: (data?.handle as string) ?? null, error };
}

// ── 出勤報表（記帳成員唯讀）──
export type AttendanceRow = {
  work_date: string; // YYYY-MM-DD（台灣日期）
  check_in_at: string;
  check_out_at: string | null;
};
export type WorkerAttendance = {
  workerId: string;
  name: string;
  rows: AttendanceRow[]; // 新→舊
};

// 取區間內每位工讀生的出勤（沒出勤的工讀生也會回傳，rows 為空）
export async function fetchAttendanceReport(
  from: string,
  to: string
): Promise<{ workers: WorkerAttendance[]; error: string | null }> {
  const { data, error } = await supabase.rpc("attendance_report", {
    p_from: from,
    p_to: to,
  });
  if (error) return { workers: [], error: error.message };
  const map = new Map<string, WorkerAttendance>();
  for (const r of (data ?? []) as {
    worker_id: string;
    worker_name: string;
    work_date: string | null;
    check_in_at: string | null;
    check_out_at: string | null;
  }[]) {
    let w = map.get(r.worker_id);
    if (!w) {
      w = { workerId: r.worker_id, name: r.worker_name, rows: [] };
      map.set(r.worker_id, w);
    }
    if (r.work_date && r.check_in_at)
      w.rows.push({
        work_date: r.work_date,
        check_in_at: r.check_in_at,
        check_out_at: r.check_out_at,
      });
  }
  return { workers: [...map.values()], error: null };
}

// 一筆出勤的工時（分鐘）；沒簽退回 null
export function shiftMinutes(r: AttendanceRow): number | null {
  if (!r.check_out_at) return null;
  const m = Math.round(
    (new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 60000
  );
  return Number.isFinite(m) && m >= 0 ? m : null;
}

// 還沒簽退的班是否仍在「上班中」（與後端一致：16 小時內）
export function isOngoing(r: AttendanceRow, now = Date.now()): boolean {
  return !r.check_out_at && now - new Date(r.check_in_at).getTime() < 16 * 3600_000;
}

export function fmtMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} 小時 ${m} 分` : `${m} 分`;
}

// 工時顯示：X 小時 Y 分
export function fmtDuration(
  fromIso: string | null | undefined,
  toIso: string | null | undefined
): string {
  if (!fromIso || !toIso) return "—";
  const mins = Math.round(
    (new Date(toIso).getTime() - new Date(fromIso).getTime()) / 60000
  );
  if (!Number.isFinite(mins) || mins < 0) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h} 小時 ${m} 分` : `${m} 分`;
}

// 時間顯示：HH:MM
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}
