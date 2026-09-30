// ============================================================
// Edge Function: closing-reminder
// 打烊未填提醒。由 Supabase pg_cron 每天台北 21:30（UTC 13:30）準時呼叫，
// 取代原本會嚴重誤點的 GitHub Actions 排程。
//
// 規則：今天不是公休（每週固定公休 closing_rota.closed 或當天標記 closing_days.holiday）
//       且還沒有打烊紀錄（closing_records）→ 推播給「當天輪值者」＋「代班者」＋宇群。
//
// 驗證：pg_cron 會帶 x-cron-token 標頭（值存在 Vault）；與本檔常數比對，擋掉外部亂打。
// 密鑰：VAPID_* 與 SUPABASE_* 由平台注入（與 send-push 同一組專案密鑰）。
// 部署：supabase functions deploy closing-reminder --no-verify-jwt
// ============================================================

import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

// 與 pg_cron 呼叫時帶的 x-cron-token 相同（值另存 Vault，不放進 cron 明文）
const CRON_TOKEN = "xqclose_c7f19a4e2b6d8035f1a9e4c2d7b0aa51";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE")!;
const VAPID_SUBJECT =
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:overtureacademyofmusic@gmail.com";

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const WD = ["日", "一", "二", "三", "四", "五", "六"];

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  // 驗證來源
  if (req.headers.get("x-cron-token") !== CRON_TOKEN)
    return json({ error: "forbidden" }, 403);

  let mode = "run";
  try {
    const b = await req.json();
    if (b?.mode) mode = String(b.mode);
  } catch {
    /* 空 body 當作 run */
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 台灣的今天
  const now = new Date(Date.now() + 8 * 3600_000);
  const today = now.toISOString().slice(0, 10);
  const weekday = now.getUTCDay(); // 0=週日
  const [, mm, dd] = today.split("-").map(Number);
  const dayLabel = `${mm}/${dd}（週${WD[weekday]}）`;

  // 宇群（找不到就退回全部管理者）
  const { data: admins = [] } = await sb
    .from("teachers")
    .select("id,name")
    .eq("is_admin", true);
  const yuqun = (admins ?? []).filter((a) => a.name === "宇群");
  const bossIds = (yuqun.length ? yuqun : admins ?? []).map((a) => a.id);

  const recipients = new Set<string>();
  let payload: { title: string; body: string };

  if (mode === "test") {
    bossIds.forEach((id) => recipients.add(id));
    payload = {
      title: "打烊提醒測試 🌙",
      body: "看得到就表示打烊提醒正常運作囉！",
    };
  } else {
    const [{ data: rota }, { data: dayRow }, { data: record }] =
      await Promise.all([
        sb
          .from("closing_rota")
          .select("teacher_id,closed")
          .eq("weekday", weekday)
          .maybeSingle(),
        sb
          .from("closing_days")
          .select("holiday,assigned_worker_id")
          .eq("day", today)
          .maybeSingle(),
        sb
          .from("closing_records")
          .select("id")
          .eq("close_date", today)
          .maybeSingle(),
      ]);

    if (rota?.closed || dayRow?.holiday)
      return json({ ok: true, skipped: "holiday", today });
    if (record) return json({ ok: true, skipped: "already_recorded", today });

    const dutyIds = [rota?.teacher_id, dayRow?.assigned_worker_id].filter(
      Boolean
    ) as string[];
    const { data: people = [] } = dutyIds.length
      ? await sb.from("teachers").select("id,name").in("id", dutyIds)
      : { data: [] };
    const nameOf = (id: string | null | undefined) =>
      (people ?? []).find((p) => p.id === id)?.name;
    const rotaName = rota?.teacher_id ? nameOf(rota.teacher_id) : null;
    const workerName = dayRow?.assigned_worker_id
      ? nameOf(dayRow.assigned_worker_id)
      : null;
    const who = workerName
      ? `${workerName}（代${rotaName ?? "輪值"}）`
      : rotaName ?? "今天的負責人";

    dutyIds.forEach((id) => recipients.add(id));
    bossIds.forEach((id) => recipients.add(id));
    payload = {
      title: "還沒填打烊紀錄 🌙",
      body: `${dayLabel}打烊負責人：${who}。記得檢查教室、倒垃圾、盤點零用金，並填打烊紀錄 💛`,
    };
  }

  const { data: subs = [] } = await sb
    .from("push_subscriptions")
    .select("teacher_id,endpoint,subscription")
    .in("teacher_id", [...recipients]);

  let sent = 0,
    failed = 0;
  const message = JSON.stringify(payload);
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification(s.subscription, message);
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) {
        await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
      failed++;
    }
  }

  await sb.from("notification_log").insert({
    kind: mode === "test" ? "test" : "closing",
    title: payload.title,
    body: payload.body,
    target_ids: [...recipients],
    target_label: "打烊負責人＋宇群",
    sent_count: sent,
    failed_count: failed,
  });

  return json({ ok: true, today, recipients: recipients.size, sent, failed });
});
