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

// 時間顯示：HH:MM
export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}
