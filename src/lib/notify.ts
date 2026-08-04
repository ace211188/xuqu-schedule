"use client";

import { supabase } from "./supabase";

// ── 通知紀錄型別（對應 notification_log 表）──
export type NotificationKind =
  | "manual"
  | "accounting"
  | "reminder"
  | "acc_todo"
  | "monthly"
  | "test";

export type NotificationLog = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  target_ids: string[];
  target_label: string | null;
  sent_count: number;
  failed_count: number;
  created_by: string | null;
  created_at: string;
};

export const KIND_LABEL: Record<NotificationKind, string> = {
  manual: "手動發送",
  accounting: "代收代墊即時",
  reminder: "排課提醒",
  acc_todo: "記帳待辦",
  monthly: "月結報表",
  test: "測試",
};

type InvokeRes = {
  ok: boolean;
  sent: number;
  failed: number;
  error: string | null;
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
  return (error as { message?: string })?.message ?? "發送失敗";
}

// ── 手動發送（管理員）：teacherIds 空＝發給所有已訂閱老師 ──
export async function sendManualPush(p: {
  title: string;
  body: string;
  teacherIds?: string[];
  targetLabel?: string;
  mode?: "manual" | "test";
}): Promise<InvokeRes> {
  const { data, error } = await supabase.functions.invoke("send-push", {
    body: {
      mode: p.mode ?? "manual",
      title: p.title,
      body: p.body,
      teacherIds: p.teacherIds ?? [],
      targetLabel: p.targetLabel,
    },
  });
  if (error)
    return { ok: false, sent: 0, failed: 0, error: await readFnError(error) };
  return {
    ok: true,
    sent: data?.sent ?? 0,
    failed: data?.failed ?? 0,
    error: null,
  };
}

// ── 代收代墊即時通知管理員（best-effort，不擋使用者流程）──
// who：送出者名字；what：例「一筆收款 $1,200」
export async function notifyAccountingSubmit(p: {
  who: string;
  what: string;
}): Promise<void> {
  try {
    await supabase.functions.invoke("send-push", {
      body: {
        mode: "accounting",
        title: "代收代墊待處理 💰",
        body: `${p.who} 送出${p.what}，記得確認一下 💛`,
      },
    });
  } catch {
    // 通知失敗不影響記帳本身，靜默略過（每週 cron 仍會補提醒）
  }
}

// ── 過往通知紀錄（僅管理員，RLS 把關）──
export async function fetchNotificationLog(
  limit = 100
): Promise<NotificationLog[]> {
  const { data } = await supabase
    .from("notification_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as NotificationLog[];
}

// ── 手動發送時的收件老師清單（含是否已訂閱裝置）──
export type NotifyTeacher = {
  id: string;
  name: string;
  is_admin: boolean;
  subscribed: boolean;
};

export async function fetchNotifyTeachers(): Promise<NotifyTeacher[]> {
  const [{ data: teachers }, { data: subs }] = await Promise.all([
    supabase.from("teachers").select("id,name,is_admin").order("name"),
    supabase.from("push_subscriptions").select("teacher_id"),
  ]);
  const subbed = new Set((subs ?? []).map((s) => s.teacher_id));
  return (teachers ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    is_admin: t.is_admin,
    subscribed: subbed.has(t.id),
  }));
}
