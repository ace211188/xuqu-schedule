// ============================================================
// Edge Function: send-push
// 手動發送通知 + 代收代墊即時通知，皆走這支（持有 VAPID 私鑰）。
// 靜態前端無法直接發推播，改用 supabase.functions.invoke('send-push', …) 呼叫。
//
// 需在 Supabase 後台為本函式設定密鑰（Secrets）：
//   VAPID_PUBLIC        （公鑰，與前端 push.ts 內同一把）
//   VAPID_PRIVATE       （私鑰，只放這裡與 GitHub Actions）
//   VAPID_SUBJECT        例：mailto:overtureacademyofmusic@gmail.com
//   （SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自動注入，不用手設）
//
// 部署：Supabase 後台 → Edge Functions → 新增 send-push → 貼上本檔 → Deploy
//   （或 CLI：supabase functions deploy send-push）
// ============================================================

import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE")!;
const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:overtureacademyofmusic@gmail.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

type Body = {
  mode: "manual" | "accounting" | "test";
  title?: string;
  body?: string;
  teacherIds?: string[]; // manual：指定收件老師（空／未給＝所有已訂閱者）
  targetLabel?: string; // 顯示用文字，純備查
  kind?: string; // 覆寫寫入 log 的 kind（預設依 mode）
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // 服務端（service_role）：讀訂閱、寫 log、刪失效訂閱，略過 RLS
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 驗證呼叫者：用帶進來的 JWT 取得登入者
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "未登入" }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData.user?.id;
  if (!uid) return json({ error: "登入無效" }, 401);

  const { data: me } = await admin
    .from("teachers")
    .select("id,name,is_admin")
    .eq("id", uid)
    .maybeSingle();
  if (!me) return json({ error: "非老師帳號" }, 403);

  let payload: Body;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "無效的請求內容" }, 400);
  }
  const mode = payload.mode ?? "manual";

  // ── 決定：這次要通知哪些老師、通知什麼內容 ──
  let targetTeacherIds: string[] = [];
  let title = payload.title ?? "";
  let notifyBody = payload.body ?? "";
  let targetLabel = payload.targetLabel ?? null;
  let kind = payload.kind ?? mode;

  if (mode === "manual" || mode === "test") {
    // 手動發送 / 測試：限管理員
    if (!me.is_admin) return json({ error: "只有管理員能手動發送通知" }, 403);
    if (mode === "test") {
      title = title || "測試通知 🎵";
      notifyBody = notifyBody || "看得到就表示推播正常運作囉！";
      kind = "test";
    }
    if (!title.trim() || !notifyBody.trim())
      return json({ error: "請填標題與內容" }, 400);

    if (payload.teacherIds && payload.teacherIds.length > 0) {
      targetTeacherIds = payload.teacherIds;
    } else {
      // 未指定＝發給所有「有訂閱裝置」的老師
      const { data: subs } = await admin
        .from("push_subscriptions")
        .select("teacher_id");
      targetTeacherIds = [...new Set((subs ?? []).map((s) => s.teacher_id))];
      targetLabel = targetLabel ?? "所有已訂閱老師";
    }
  } else if (mode === "accounting") {
    // 代收代墊即時：任何登入老師觸發，一律通知所有管理員
    const { data: admins } = await admin
      .from("teachers")
      .select("id")
      .eq("is_admin", true);
    targetTeacherIds = (admins ?? []).map((a) => a.id);
    title = title || "代收代墊待處理 💰";
    notifyBody = notifyBody || `${me.name} 送出一筆代收/代墊，記得處理一下 💛`;
    targetLabel = targetLabel ?? "管理員";
    kind = "accounting";
  } else {
    return json({ error: "未知的 mode" }, 400);
  }

  // ── 撈出這些老師的所有裝置訂閱 ──
  let sent = 0;
  let failed = 0;
  if (targetTeacherIds.length > 0) {
    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint,subscription,teacher_id")
      .in("teacher_id", targetTeacherIds);

    const message = JSON.stringify({ title, body: notifyBody });
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(s.subscription, message);
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) {
          await admin
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", s.endpoint);
        }
        failed++;
      }
    }
  }

  // ── 寫入通知紀錄（歷史查詢用）──
  await admin.from("notification_log").insert({
    kind,
    title,
    body: notifyBody,
    target_ids: targetTeacherIds,
    target_label: targetLabel,
    sent_count: sent,
    failed_count: failed,
    // 手動由管理員觸發記其 id；代收代墊即時也記觸發者
    created_by: uid,
  });

  return json({ ok: true, sent, failed, recipients: targetTeacherIds.length });
});
