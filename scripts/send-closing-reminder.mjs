// 打烊未填提醒（GitHub Actions 每天 21:30 台北執行）
// 規則：今天不是公休（每週固定公休或當天標記）且還沒有打烊紀錄
//       → 推播給「當天輪值的人」＋「被指派的工讀生」＋宇群
// MODE: run(正式檢查後推播) | test(只推一則測試給宇群)
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

// 台灣的今天
const now = new Date(Date.now() + 8 * 3600_000);
const today = now.toISOString().slice(0, 10);
const weekday = now.getUTCDay(); // 0=週日
const WD = ["日", "一", "二", "三", "四", "五", "六"];
const [, mm, dd] = today.split("-").map(Number);
const dayLabel = `${mm}/${dd}（週${WD[weekday]}）`;

// 宇群（找不到名字就退回全部管理者）
const { data: admins = [] } = await sb.from("teachers").select("id,name").eq("is_admin", true);
const yuqun = admins.filter((a) => a.name === "宇群");
const bossIds = (yuqun.length ? yuqun : admins).map((a) => a.id);

const recipients = new Set();
let payload;

if (MODE === "test") {
  bossIds.forEach((id) => recipients.add(id));
  payload = { title: "打烊提醒測試 🌙", body: "看得到就表示打烊提醒正常運作囉！" };
} else {
  const [{ data: rota }, { data: dayRow }, { data: record }] = await Promise.all([
    sb.from("closing_rota").select("teacher_id,closed").eq("weekday", weekday).maybeSingle(),
    sb.from("closing_days").select("holiday,assigned_worker_id").eq("day", today).maybeSingle(),
    sb.from("closing_records").select("id").eq("close_date", today).maybeSingle(),
  ]);

  if (rota?.closed || dayRow?.holiday) {
    console.log(`${today} 公休，不提醒`);
    process.exit(0);
  }
  if (record) {
    console.log(`${today} 已有打烊紀錄，不提醒`);
    process.exit(0);
  }

  const dutyIds = [rota?.teacher_id, dayRow?.assigned_worker_id].filter(Boolean);
  const { data: people = [] } = dutyIds.length
    ? await sb.from("teachers").select("id,name").in("id", dutyIds)
    : { data: [] };
  const nameOf = (id) => people.find((p) => p.id === id)?.name;
  const rotaName = rota?.teacher_id ? nameOf(rota.teacher_id) : null;
  const workerName = dayRow?.assigned_worker_id ? nameOf(dayRow.assigned_worker_id) : null;
  const who = workerName
    ? `${workerName}（${rotaName ?? "輪值"}指派）`
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
  removed = 0,
  failed = 0;
for (const s of subs) {
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

await sb.from("notification_log").insert({
  kind: MODE === "test" ? "test" : "closing",
  title: payload.title,
  body: payload.body,
  target_ids: [...recipients],
  target_label: "打烊負責人＋宇群",
  sent_count: sent,
  failed_count: failed,
});

console.log(
  `${today} 收件 ${recipients.size} 人、已訂閱裝置 ${subs.length}；sent=${sent} removed=${removed} failed=${failed}`
);
