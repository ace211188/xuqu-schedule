// ============================================================
// Edge Function: worker-checkin
// 工讀生簽到（限店裡網路）。前端不可直接寫 worker_attendance，
// 一律經此函式：讀這台裝置的對外 IP → 只有在允許清單內才准簽到。
//
// 模式（body.mode）：
//   status         －回傳目前是否在店裡網路、今天簽到狀態（管理員另回傳允許清單）
//   checkin        －簽到（需在允許網路內）
//   checkout       －簽退（預留；需在允許網路內）
//   allow_network  －管理員：把目前這台裝置的網路加入允許清單
//   remove_network －管理員：移除一筆允許網路
//
// 密鑰：SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 由平台自動注入。
// 部署：supabase functions deploy worker-checkin
// ============================================================

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

// 取用戶端對外 IP：x-forwarded-for 最左邊那個
function clientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const first = xff.split(",")[0].trim();
  return first || null;
}

// 正規化 IP：IPv4 原樣；IPv6 取 /64 網段前綴（手機隱私位址每台不同，但同網段前綴一致）
function normalizeIp(raw: string | null): string | null {
  if (!raw) return null;
  let ip = raw.trim();
  if (ip.startsWith("[")) {
    const end = ip.indexOf("]");
    ip = end > 0 ? ip.slice(1, end) : ip.slice(1);
  }
  if (!ip.includes(":")) return ip; // IPv4

  // IPv6：展開 "::" 後取前 4 組，輸出正規化 /64
  let groups: string[];
  const dbl = ip.indexOf("::");
  if (dbl >= 0) {
    const left = ip.slice(0, dbl).split(":").filter(Boolean);
    const right = ip.slice(dbl + 2).split(":").filter(Boolean);
    const fill = Array(Math.max(0, 8 - left.length - right.length)).fill("0");
    groups = [...left, ...fill, ...right];
  } else {
    groups = ip.split(":");
  }
  const prefix = groups
    .slice(0, 4)
    .map((g) => (parseInt(g || "0", 16) || 0).toString(16));
  return prefix.join(":") + "::/64";
}

function todayShape(row: Record<string, unknown> | null) {
  return {
    checkedIn: !!row,
    checkInAt: row?.check_in_at ?? null,
    checkedOut: !!row?.check_out_at,
    checkOutAt: row?.check_out_at ?? null,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 驗證呼叫者
  const jwt = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!jwt) return json({ error: "未登入" }, 401);
  const { data: userData } = await admin.auth.getUser(jwt);
  const uid = userData.user?.id;
  if (!uid) return json({ error: "登入無效" }, 401);

  const { data: me } = await admin
    .from("teachers")
    .select("id,name,is_admin,is_worker")
    .eq("id", uid)
    .maybeSingle();
  if (!me) return json({ error: "非有效帳號" }, 403);

  let body: { mode?: string; label?: string; networkId?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* 空 body 當作 status */
  }
  const mode = body.mode ?? "status";

  const rawIp = clientIp(req);
  const ip = normalizeIp(rawIp);

  // 目前這個網路是否被允許
  let onSite = false;
  if (ip) {
    const { data: hit } = await admin
      .from("attendance_networks")
      .select("id")
      .eq("ip", ip)
      .maybeSingle();
    onSite = !!hit;
  }

  // 今天的出勤
  async function loadToday() {
    const { data } = await admin
      .from("worker_attendance")
      .select("check_in_at,check_out_at")
      .eq("worker_id", uid)
      .eq("work_date", new Date().toISOString().slice(0, 10))
      .maybeSingle();
    return data ?? null;
  }

  if (mode === "status") {
    const today = await loadToday();
    let networks: unknown[] | undefined;
    if (me.is_admin) {
      const { data } = await admin
        .from("attendance_networks")
        .select("id,ip,label,created_at")
        .order("created_at", { ascending: false });
      networks = data ?? [];
    }
    return json({
      ip,
      onSite,
      isWorker: !!me.is_worker,
      isAdmin: !!me.is_admin,
      today: todayShape(today),
      networks,
    });
  }

  if (mode === "checkin") {
    if (!onSite)
      return json(
        { error: "請先連上店裡的網路（序曲 WiFi）才能簽到", ip, onSite: false },
        403
      );
    // 一人一天一筆；已簽到就保留原本那筆（不覆蓋簽到時間）
    const dateStr = new Date().toISOString().slice(0, 10);
    await admin.from("worker_attendance").upsert(
      { worker_id: uid, work_date: dateStr, check_in_ip: rawIp },
      { onConflict: "worker_id,work_date", ignoreDuplicates: true }
    );
    const today = await loadToday();
    return json({ ok: true, onSite: true, today: todayShape(today) });
  }

  if (mode === "checkout") {
    if (!onSite)
      return json({ error: "請先連上店裡的網路才能簽退", onSite: false }, 403);
    const dateStr = new Date().toISOString().slice(0, 10);
    await admin
      .from("worker_attendance")
      .update({ check_out_at: new Date().toISOString(), check_out_ip: rawIp })
      .eq("worker_id", uid)
      .eq("work_date", dateStr)
      .is("check_out_at", null);
    const today = await loadToday();
    return json({ ok: true, onSite: true, today: todayShape(today) });
  }

  if (mode === "allow_network") {
    if (!me.is_admin) return json({ error: "只有管理員能設定允許網路" }, 403);
    if (!ip) return json({ error: "讀不到目前網路的 IP，請稍後再試" }, 400);
    await admin
      .from("attendance_networks")
      .upsert(
        { ip, label: body.label ?? null, created_by: uid },
        { onConflict: "ip" }
      );
    const { data } = await admin
      .from("attendance_networks")
      .select("id,ip,label,created_at")
      .order("created_at", { ascending: false });
    return json({ ok: true, ip, networks: data ?? [] });
  }

  if (mode === "remove_network") {
    if (!me.is_admin) return json({ error: "只有管理員能設定允許網路" }, 403);
    if (body.networkId)
      await admin.from("attendance_networks").delete().eq("id", body.networkId);
    const { data } = await admin
      .from("attendance_networks")
      .select("id,ip,label,created_at")
      .order("created_at", { ascending: false });
    return json({ ok: true, networks: data ?? [] });
  }

  return json({ error: "未知的 mode" }, 400);
});
