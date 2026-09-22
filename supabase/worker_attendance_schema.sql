-- ============================================================
-- 工讀生簽到：帳號旗標 + 允許網路 + 出勤紀錄
-- 依賴：schema.sql（teachers、is_admin()）
-- 安全：簽到寫入一律走 Edge Function `worker-checkin`（service role）＋ IP 比對，
--       前端不可直接寫 worker_attendance（RLS 沒開放 insert）
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run
-- ============================================================

-- 1) 工讀生旗標
alter table public.teachers
  add column if not exists is_worker boolean not null default false;

-- 2) 允許簽到的網路（店裡對外 IP allowlist；IPv4 存完整、IPv6 存 /64 prefix）
create table if not exists public.attendance_networks (
  id         uuid primary key default gen_random_uuid(),
  ip         text not null unique,
  label      text,
  created_by uuid references public.teachers(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 3) 工讀生出勤（先用簽到，預留簽退欄位）
create table if not exists public.worker_attendance (
  id            uuid primary key default gen_random_uuid(),
  worker_id     uuid not null references public.teachers(id) on delete cascade,
  work_date     date not null default current_date,
  check_in_at   timestamptz not null default now(),
  check_in_ip   text,
  check_out_at  timestamptz,
  check_out_ip  text,
  created_at    timestamptz not null default now()
);
create index if not exists worker_attendance_worker_idx
  on public.worker_attendance(worker_id, work_date);
-- 一人一天一筆（避免重複簽到）
create unique index if not exists worker_attendance_day_uidx
  on public.worker_attendance(worker_id, work_date);

-- 4) RLS
alter table public.attendance_networks enable row level security;
alter table public.worker_attendance   enable row level security;

-- 允許網路：只有管理員能看／管理（Edge Function 用 service role 讀，繞過 RLS）
drop policy if exists "att_net admin" on public.attendance_networks;
create policy "att_net admin" on public.attendance_networks
  for all using (public.is_admin()) with check (public.is_admin());

-- 出勤：本人可看自己的、管理員看全部；寫入一律由 Edge Function(service role) 處理
drop policy if exists "att read" on public.worker_attendance;
create policy "att read" on public.worker_attendance
  for select using (public.is_admin() or worker_id = auth.uid());
