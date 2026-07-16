-- 每位老師每月的：備註 + 最後確認/更新時間
create table if not exists public.monthly_meta (
  teacher_id   uuid not null references public.teachers(id) on delete cascade,
  month        text not null,
  note         text not null default '',
  confirmed_at timestamptz,
  updated_at   timestamptz not null default now(),
  primary key (teacher_id, month)
);

alter table public.monthly_meta enable row level security;

drop policy if exists "read meta" on public.monthly_meta;
create policy "read meta" on public.monthly_meta
  for select using (teacher_id = auth.uid() or public.is_admin());

drop policy if exists "insert own meta" on public.monthly_meta;
create policy "insert own meta" on public.monthly_meta
  for insert with check (teacher_id = auth.uid());

drop policy if exists "update own meta" on public.monthly_meta;
create policy "update own meta" on public.monthly_meta
  for update using (teacher_id = auth.uid());
