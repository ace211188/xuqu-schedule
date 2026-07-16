-- ============================================================
-- 序曲排課收集 — Supabase 資料表與權限
-- 用法：Supabase 專案 → 左邊「SQL Editor」→ 貼上整段 → Run
-- ============================================================

-- 1) 老師資料（一列對應一個登入帳號）
create table if not exists public.teachers (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text not null,
  is_admin   boolean not null default false,
  created_at timestamptz not null default now()
);

-- 2) 每一格排課狀態
create table if not exists public.schedule_slots (
  id         bigint generated always as identity primary key,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  month      text not null,                              -- 例如 '2026-08'
  day        text not null,                              -- 'mon'..'sun'
  slot       int  not null,                              -- 一天中的分鐘數，780 = 13:00
  state      text not null check (state in ('available','busy')),
  updated_at timestamptz not null default now(),
  unique (teacher_id, month, day, slot)
);

-- ── 判斷目前登入者是不是管理員（SECURITY DEFINER 避免 RLS 遞迴）──
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.teachers
    where id = auth.uid() and is_admin
  );
$$;

-- ── 開啟 Row Level Security ──
alter table public.teachers       enable row level security;
alter table public.schedule_slots enable row level security;

-- teachers：本人可讀自己；管理員可讀全部
drop policy if exists "read teachers" on public.teachers;
create policy "read teachers" on public.teachers
  for select using (id = auth.uid() or public.is_admin());

-- schedule_slots：本人可讀寫自己；管理員可讀全部
drop policy if exists "read slots" on public.schedule_slots;
create policy "read slots" on public.schedule_slots
  for select using (teacher_id = auth.uid() or public.is_admin());

drop policy if exists "insert own slots" on public.schedule_slots;
create policy "insert own slots" on public.schedule_slots
  for insert with check (teacher_id = auth.uid());

drop policy if exists "update own slots" on public.schedule_slots;
create policy "update own slots" on public.schedule_slots
  for update using (teacher_id = auth.uid());

drop policy if exists "delete own slots" on public.schedule_slots;
create policy "delete own slots" on public.schedule_slots
  for delete using (teacher_id = auth.uid());
