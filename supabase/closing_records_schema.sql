-- ============================================================
-- 打烊紀錄：教室清單、廁所清潔輪值、每日打烊紀錄
-- 依賴：schema.sql（teachers、is_admin()）、accounting_schema.sql（can_accounting()）
-- 權限：記帳成員（宇群/美君/奕寬）可用；負責人＝填寫者本人（closed_by）
--       日後要開放工讀生，把下方 can_accounting() 改成 (can_accounting() or is_worker) 即可
-- 用法：Supabase → SQL Editor → 貼上整段 → Run
-- ============================================================

create table if not exists public.closing_rooms (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.toilet_roster (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.closing_records (
  id             uuid primary key default gen_random_uuid(),
  close_date     date not null default current_date unique,
  closed_by      uuid references public.teachers(id) on delete set null,
  rooms_checked  text[] not null default '{}',
  rooms_total    int not null default 0,
  petty_expected numeric(12,2),
  petty_actual   numeric(12,2),
  today_change   numeric(12,2) not null default 0,
  note           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists closing_records_date_idx
  on public.closing_records(close_date desc);

alter table public.closing_rooms   enable row level security;
alter table public.toilet_roster   enable row level security;
alter table public.closing_records enable row level security;

drop policy if exists "closing_rooms read" on public.closing_rooms;
create policy "closing_rooms read" on public.closing_rooms
  for select using (public.can_accounting());
drop policy if exists "closing_rooms admin" on public.closing_rooms;
create policy "closing_rooms admin" on public.closing_rooms
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "toilet_roster read" on public.toilet_roster;
create policy "toilet_roster read" on public.toilet_roster
  for select using (public.can_accounting());
drop policy if exists "toilet_roster admin" on public.toilet_roster;
create policy "toilet_roster admin" on public.toilet_roster
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "closing read" on public.closing_records;
create policy "closing read" on public.closing_records
  for select using (public.can_accounting());
drop policy if exists "closing insert" on public.closing_records;
create policy "closing insert" on public.closing_records
  for insert with check (public.can_accounting() and closed_by = auth.uid());
drop policy if exists "closing update" on public.closing_records;
create policy "closing update" on public.closing_records
  for update using (public.can_accounting()) with check (public.can_accounting());
drop policy if exists "closing delete" on public.closing_records;
create policy "closing delete" on public.closing_records
  for delete using (public.is_admin());
