// 發送排課提醒（GitHub Actions 定時執行，每兩週一次）
// MODE: biweekly(每兩週提醒全部已訂閱老師確認/更新) | test(測試)
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  VAPID_PUBLIC,
  VAPID_PRIVATE,
  VAPID_SUBJECT = "mailto:overtureacademyofmusic@gmail.com",
} = process.env;
const MODE = process.env.MODE || "biweekly";

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !VAPID_PUBLIC || !VAPID_PRIVATE) {
  console.error("缺少必要環境變數");
  process.exit(1);
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// 收集的目標月份＝下個月
function nextMonth() {
  const d = new Date();
  const n = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}`;
}
const month = nextMonth();
const [y, m] = month.split("-");
const label = `${y} 年 ${Number(m)} 月`;

const { data: subs = [] } = await sb
  .from("push_subscriptions")
  .select("teacher_id,endpoint,subscription");
const { data: teachers = [] } = await sb
  .from("teachers")
  .select("id,name,is_admin")
  .eq("is_admin", false);
const teacherIds = new Set(teachers.map((t) => t.id));

// 各老師這個月的備註
const { data: metas = [] } = await sb
  .from("monthly_meta")
  .select("teacher_id,note")
  .eq("month", month);
const noteByTeacher = new Map((metas ?? []).map((x) => [x.teacher_id, x.note || ""]));

// 收件對象
const targets =
  MODE === "test"
    ? new Set(subs.map((s) => s.teacher_id))
    : new Set([...teacherIds]); // biweekly：全部老師

function buildPayload(teacherId) {
  if (MODE === "test")
    return {
      title: "測試通知 🎵",
      body: "這是一則測試推播，看得到就成功囉！",
    };
  const hasNote = (noteByTeacher.get(teacherId) || "").trim().length > 0;
  let body = `${label}的排課請確認一下～沒有變動也請按「更新」確認 💛`;
  if (hasNote) body += " 你有寫備註，記得看看是否需要更新 📝";
  return { title: "排課提醒 🎵", body };
}

let sent = 0,
  removed = 0,
  failed = 0;
for (const s of subs) {
  if (!targets.has(s.teacher_id)) continue;
  try {
    await webpush.sendNotification(
      s.subscription,
      JSON.stringify(buildPayload(s.teacher_id))
    );
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
console.log(
  `MODE=${MODE} month=${month} recipients=${targets.size} sent=${sent} removed=${removed} failed=${failed}`
);
