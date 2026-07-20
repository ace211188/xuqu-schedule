// 記帳待辦推播（GitHub Actions 定時執行）
// 偵測：管理者有「待核准 / 待付款 / 待確認收款」；負責人有「待補收據 / 被退回」
// MODE: run(正式偵測待辦後推播) | test(推給所有已訂閱者一則測試)
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  VAPID_PUBLIC,
  VAPID_PRIVATE,
  VAPID_SUBJECT = "mailto:overtureacademyofmusic@gmail.com",
} = process.env;
const MODE = process.env.MODE || "run";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error("缺少必要環境變數");
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data: subs = [] } = await sb
  .from("push_subscriptions")
  .select("teacher_id,endpoint,subscription");

// 每位老師可能有多個裝置訂閱
const subsByTeacher = new Map();
for (const s of subs) {
  const arr = subsByTeacher.get(s.teacher_id) ?? [];
  arr.push(s);
  subsByTeacher.set(s.teacher_id, arr);
}

// 依 teacher_id 建立要推播的內容
const payloadByTeacher = new Map();

if (MODE === "test") {
  for (const tid of subsByTeacher.keys())
    payloadByTeacher.set(tid, {
      title: "記帳測試通知 💰",
      body: "看得到就表示推播正常運作囉！",
    });
} else {
  const [{ data: admins = [] }, { data: reimb = [] }, { data: coll = [] }] =
    await Promise.all([
      sb.from("teachers").select("id,name").eq("is_admin", true),
      sb.from("acc_reimbursements").select("requester_id,status,amount"),
      sb.from("acc_collections").select("status"),
    ]);

  // 管理者：待核准 / 待付款 / 待確認收款
  const pendingApproval = reimb.filter((r) => r.status === "pending_approval");
  const readyToPay = reimb.filter((r) => r.status === "ready");
  const pendingConfirm = coll.filter((c) => c.status === "pending_confirm");
  const payTotal = readyToPay.reduce((s, r) => s + Number(r.amount || 0), 0);

  if (pendingApproval.length || readyToPay.length || pendingConfirm.length) {
    const parts = [];
    if (pendingApproval.length) parts.push(`待核准 ${pendingApproval.length} 筆`);
    if (readyToPay.length)
      parts.push(`待付款 ${readyToPay.length} 筆（$${payTotal.toLocaleString()}）`);
    if (pendingConfirm.length) parts.push(`待確認收款 ${pendingConfirm.length} 筆`);
    const body = parts.join("、") + "，記得處理一下 💛";
    for (const a of admins)
      payloadByTeacher.set(a.id, { title: "記帳待辦提醒 💰", body });
  }

  // 負責人：被退回（需補件）/ 已核准待補收據
  const perMember = new Map(); // teacher_id -> {rejected, approved}
  for (const r of reimb) {
    if (r.status !== "rejected" && r.status !== "approved") continue;
    const m = perMember.get(r.requester_id) ?? { rejected: 0, approved: 0 };
    if (r.status === "rejected") m.rejected++;
    else m.approved++;
    perMember.set(r.requester_id, m);
  }
  for (const [tid, m] of perMember) {
    // 管理者已在上面收到彙總，避免重複覆蓋
    if (payloadByTeacher.has(tid)) continue;
    const parts = [];
    if (m.rejected) parts.push(`${m.rejected} 筆代墊被退回需修正`);
    if (m.approved) parts.push(`${m.approved} 筆已核准，記得購買並補收據`);
    if (!parts.length) continue;
    payloadByTeacher.set(tid, {
      title: "記帳提醒 💰",
      body: parts.join("、") + " 🧾",
    });
  }
}

let sent = 0,
  removed = 0,
  failed = 0;
for (const [tid, payload] of payloadByTeacher) {
  const targets = subsByTeacher.get(tid) ?? [];
  for (const s of targets) {
    try {
      await webpush.sendNotification(s.subscription, JSON.stringify(payload));
      sent++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await sb.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
        removed++;
      } else {
        failed++;
        console.log("send error", e.statusCode, e.body);
      }
    }
  }
}
console.log(
  `MODE=${MODE} recipients=${payloadByTeacher.size} sent=${sent} removed=${removed} failed=${failed}`
);
