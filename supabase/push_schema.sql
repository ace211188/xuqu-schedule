-- 推播訂閱（每位老師可在多個裝置訂閱）
create table if not exists public.push_subscriptions (
  id         bigint generated always as identity primary key,
  teacher_id uuid not null references public.teachers(id) on delete cascade,
  endpoint   text not null unique,
  subscription jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

drop policy if exists "insert own sub" on public.push_subscriptions;
create policy "insert own sub" on public.push_subscriptions
  for insert with check (teacher_id = auth.uid());

drop policy if exists "read own sub" on public.push_subscriptions;
create policy "read own sub" on public.push_subscriptions
  for select using (teacher_id = auth.uid() or public.is_admin());

drop policy if exists "update own sub" on public.push_subscriptions;
create policy "update own sub" on public.push_subscriptions
  for update using (teacher_id = auth.uid());

drop policy if exists "delete own sub" on public.push_subscriptions;
create policy "delete own sub" on public.push_subscriptions
  for delete using (teacher_id = auth.uid());
