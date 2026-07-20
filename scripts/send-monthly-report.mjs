// 月結報表推播（GitHub Actions 每月 5 號執行）
// 計算「上個月」的總收入/總支出/淨額 + 月底結存，推播給管理者
// MODE: run(正式) | test(推給所有已訂閱者一則測試)
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

// 上個月的起訖日
const now = new Date();
const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
const ly = last.getFullYear();
const lm = last.getMonth() + 1;
const key = `${ly}-${String(lm).padStart(2, "0")}`;
const start = `${key}-01`;
const endDay = new Date(ly, lm, 0).getDate();
const end = `${key}-${String(endDay).padStart(2, "0")}`;

const money = (n) => `$${Math.round(n).toLocaleString("zh-TW")}`;

const { data: subs = [] } = await sb
  .from("push_subscriptions")
  .select("teacher_id,endpoint,subscription");

// 收件對象：管理者（測試模式＝所有已訂閱者）
let targetIds;
if (MODE === "test") {
  targetIds = new Set(subs.map((s) => s.teacher_id));
} else {
  const { data: admins = [] } = await sb
    .from("teachers")
    .select("id")
    .eq("is_admin", true);
  targetIds = new Set(admins.map((a) => a.id));
}

// 計算上月收支
const { data: monthEntries = [] } = await sb
  .from("acc_entries")
  .select("signed_amount")
  .gte("occurred_on", start)
  .lte("occurred_on", end);
const income = monthEntries.reduce(
  (s, e) => s + (Number(e.signed_amount) > 0 ? Number(e.signed_amount) : 0),
  0
);
const expense = monthEntries.reduce(
  (s, e) => s + (Number(e.signed_amount) < 0 ? -Number(e.signed_amount) : 0),
  0
);
const net = income - expense;

// 月底總結存＝各帳戶期初 + 該月底(含)以前所有分錄
const [{ data: accounts = [] }, { data: tillEnd = [] }] = await Promise.all([
  sb.from("acc_accounts").select("opening_balance"),
  sb.from("acc_entries").select("signed_amount").lte("occurred_on", end),
]);
const opening = accounts.reduce((s, a) => s + Number(a.opening_balance || 0), 0);
const flow = tillEnd.reduce((s, e) => s + Number(e.signed_amount || 0), 0);
const endBalance = opening + flow;

const payload =
  MODE === "test"
    ? { title: "月結測試 📊", body: "看得到就表示月結推播正常！" }
    : {
        title: `${ly} 年 ${lm} 月 月結 📊`,
        body: `收入 ${money(income)}、支出 ${money(expense)}、淨額 ${money(
          net
        )}；月底結存 ${money(endBalance)}。打開 App 看完整月結報表 💛`,
      };

const subsByTeacher = new Map();
for (const s of subs) {
  if (!targetIds.has(s.teacher_id)) continue;
  const arr = subsByTeacher.get(s.teacher_id) ?? [];
  arr.push(s);
  subsByTeacher.set(s.teacher_id, arr);
}

let sent = 0,
  removed = 0,
  failed = 0;
for (const arr of subsByTeacher.values()) {
  for (const s of arr) {
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
  `MODE=${MODE} month=${key} income=${income} expense=${expense} net=${net} endBalance=${endBalance} sent=${sent} removed=${removed} failed=${failed}`
);
