-- ============================================================
-- 序曲 — 通知紀錄（手動發送 / 代收代墊即時 / 定時 cron 皆寫入這裡）
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run（可重複執行）
-- 依賴：schema.sql（teachers 表、is_admin() 函式）
-- 設計：發送實際動作在 Edge Function `send-push`（持 VAPID 私鑰）；
--       這張表只記「發了什麼、發給誰、成功幾筆」，給後台查歷史。
-- ============================================================

create table if not exists public.notification_log (
  id          uuid primary key default gen_random_uuid(),
  -- 通知種類：manual(手動) / accounting(代收代墊即時) / reminder(排課提醒 cron)
  --           acc_todo(記帳待辦 cron) / monthly(月結 cron) / test(測試)
  kind        text not null default 'manual',
  title       text not null,
  body        text not null,
  -- 這次發送鎖定的收件老師 id（空陣列＝依 Edge Function 當下規則決定，例如「所有已訂閱者」）
  target_ids  uuid[] not null default '{}',
  -- 收件對象的顯示文字（例：「所有老師」「宇群、美君」），純備查
  target_label text,
  sent_count  int not null default 0,   -- 實際成功送達的裝置數
  failed_count int not null default 0,
  -- 觸發者：手動＝按按鈕的管理員；cron / 即時＝null（由 service_role 寫入）
  created_by  uuid references public.teachers(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists notification_log_created_idx
  on public.notification_log(created_at desc);
create index if not exists notification_log_kind_idx
  on public.notification_log(kind);

-- ── RLS ──
-- 讀取：僅管理員（後台通知中心查歷史）
-- 寫入：一律由 Edge Function / cron 以 service_role 寫入（service_role 略過 RLS），
--       因此不開放前端 anon/authenticated 直接 insert。
alter table public.notification_log enable row level security;

drop policy if exists "notif read admin" on public.notification_log;
create policy "notif read admin" on public.notification_log
  for select using (public.is_admin());

-- 註：service_role 金鑰（Edge Function / cron 使用）會略過所有 RLS，
--     所以不需要為它另開 insert policy。前端無法也不應直接寫入本表。
