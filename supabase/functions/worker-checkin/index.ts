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
//   create_invite / list_invites / revoke_invite －管理員：工讀生邀請碼
//   register_with_invite －（免登入）工讀生用邀請碼自己設定帳號密碼
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

// 邀請碼：8 碼，去掉易混淆的 0/O/1/I/L
const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const INVITE_DAYS = 7;
function newInviteCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join("");
}
function normalizeCode(raw: string | undefined): string {
  return (raw ?? "").toUpperCase().replace(/[\s-]/g, "");
}

// 工讀生帳號欄位檢查（管理員建立與邀請碼註冊共用）
function validateWorkerInput(
  handleRaw: string | undefined,
  nameRaw: string | undefined,
  password: string | undefined
): { handle: string; name: string; password: string } | { error: string } {
  const handle = (handleRaw ?? "").trim().toLowerCase();
  const name = (nameRaw ?? "").trim();
  const pw = password ?? "";
  if (!/^[a-z0-9._-]+$/.test(handle))
    return { error: "帳號只能用英文/數字（例：amei）" };
  if (!name) return { error: "請填顯示名字" };
  if (pw.length < 6) return { error: "密碼至少 6 碼" };
  return { handle, name, password: pw };
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

  let body: {
    mode?: string;
    label?: string;
    networkId?: string;
    handle?: string;
    name?: string;
    password?: string;
    workerId?: string;
    code?: string;
    note?: string;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* 空 body 當作 status */
  }
  const mode = body.mode ?? "status";

  // ── 免登入：工讀生用邀請碼自己設定帳號密碼 ──
  // （工讀生此時還沒有帳號，所以放在登入檢查之前；安全性靠一次性、有期限的邀請碼）
  if (mode === "register_with_invite") {
    const code = normalizeCode(body.code);
    if (code.length !== 8) return json({ error: "邀請碼是 8 碼，請再確認" }, 400);
    const v = validateWorkerInput(body.handle, body.name, body.password);
    if ("error" in v) return json({ error: v.error }, 400);

    // 先「佔用」邀請碼（同一個碼同時被兩人用時，只有一人會成功）
    const nowIso = new Date().toISOString();
    const { data: claimed } = await admin
      .from("worker_invites")
      .update({ used_at: nowIso })
      .eq("code", code)
      .is("used_at", null)
      .gt("expires_at", nowIso)
      .select("code")
      .maybeSingle();
    if (!claimed) return json({ error: "邀請碼無效、已使用或已過期，請向管理員索取新的" }, 400);
    const release = () =>
      admin.from("worker_invites").update({ used_at: null }).eq("code", code);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: `${v.handle}@xuqu.tw`,
      password: v.password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      await release();
      const taken = /already|registered|exists/i.test(createErr?.message ?? "");
      return json(
        { error: taken ? "這個帳號已經有人用了，請換一個" : createErr?.message ?? "建立帳號失敗" },
        400
      );
    }
    const { error: insErr } = await admin
      .from("teachers")
      .insert({ id: created.user.id, name: v.name, is_worker: true });
    if (insErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      await release();
      return json({ error: `建立失敗：${insErr.message}` }, 400);
    }
    await admin.from("worker_invites").update({ used_by: created.user.id }).eq("code", code);
    return json({ ok: true, handle: v.handle, name: v.name });
  }

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
        { error: "請先連上教室網路後再簽到", ip, onSite: false },
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
      return json({ error: "請先連上教室網路後再簽退", onSite: false }, 403);
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

  // ── 管理員：工讀生帳號管理 ──
  if (mode === "list_workers") {
    if (!me.is_admin) return json({ error: "只有管理員能管理工讀生帳號" }, 403);
    const { data } = await admin
      .from("teachers")
      .select("id,name")
      .eq("is_worker", true)
      .order("name");
    return json({ ok: true, workers: data ?? [] });
  }

  if (mode === "create_worker") {
    if (!me.is_admin) return json({ error: "只有管理員能建立工讀生帳號" }, 403);
    const v = validateWorkerInput(body.handle, body.name, body.password);
    if ("error" in v) return json({ error: v.error }, 400);
    const { handle, name, password } = v;

    const email = `${handle}@xuqu.tw`;
    const { data: created, error: createErr } =
      await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
    if (createErr || !created?.user)
      return json(
        { error: createErr?.message ?? "建立帳號失敗（帳號可能已存在）" },
        400
      );

    const { error: insErr } = await admin.from("teachers").insert({
      id: created.user.id,
      name,
      is_worker: true,
    });
    if (insErr) {
      // 回滾剛建立的 auth 使用者，避免留下沒有 teachers 列的孤兒帳號
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: `建立失敗：${insErr.message}` }, 400);
    }
    return json({ ok: true, handle, email, name });
  }

  if (mode === "delete_worker") {
    if (!me.is_admin) return json({ error: "只有管理員能刪除工讀生帳號" }, 403);
    const wid = body.workerId ?? "";
    if (!wid) return json({ error: "缺少 workerId" }, 400);
    // 安全：只允許刪除工讀生（不是老師/管理員）
    const { data: target } = await admin
      .from("teachers")
      .select("id,is_worker,is_admin")
      .eq("id", wid)
      .maybeSingle();
    if (!target) return json({ error: "找不到帳號" }, 404);
    if (!target.is_worker || target.is_admin)
      return json({ error: "此帳號不是工讀生，無法從這裡刪除" }, 400);
    // 刪 auth 使用者會連帶刪掉 teachers 列與出勤（FK on delete cascade）
    const { error: delErr } = await admin.auth.admin.deleteUser(wid);
    if (delErr) return json({ error: `刪除失敗：${delErr.message}` }, 400);
    return json({ ok: true });
  }

  // ── 管理員：工讀生邀請碼 ──
  async function listInvites() {
    const { data } = await admin
      .from("worker_invites")
      .select("code,note,created_at,expires_at,used_at,used_by")
      .order("created_at", { ascending: false })
      .limit(30);
    return data ?? [];
  }

  if (mode === "create_invite") {
    if (!me.is_admin) return json({ error: "只有管理員能產生邀請碼" }, 403);
    const expires = new Date(Date.now() + INVITE_DAYS * 86400000).toISOString();
    // 碰撞機率極低，保險起見最多重試幾次
    for (let i = 0; i < 5; i++) {
      const code = newInviteCode();
      const { error } = await admin.from("worker_invites").insert({
        code,
        note: (body.note ?? "").trim() || null,
        created_by: uid,
        expires_at: expires,
      });
      if (!error) return json({ ok: true, code, expiresAt: expires, invites: await listInvites() });
    }
    return json({ error: "產生邀請碼失敗，請再試一次" }, 500);
  }

  if (mode === "list_invites") {
    if (!me.is_admin) return json({ error: "只有管理員能查看邀請碼" }, 403);
    return json({ ok: true, invites: await listInvites() });
  }

  if (mode === "revoke_invite") {
    if (!me.is_admin) return json({ error: "只有管理員能作廢邀請碼" }, 403);
    const code = normalizeCode(body.code);
    // 只作廢還沒被用掉的
    await admin.from("worker_invites").delete().eq("code", code).is("used_at", null);
    return json({ ok: true, invites: await listInvites() });
  }

  return json({ error: "未知的 mode" }, 400);
});
