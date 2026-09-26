-- ============================================================
-- 序曲 — 打烊工作清單（倒垃圾、消毒拖鞋…）（2026-09-26）
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run（可重複執行）
-- 依賴：closing_records_schema.sql、closing_lock_worker_invites.sql（is_worker、closing_list）
-- 說明：跟「教室清單」一樣由管理者在設定頁增減；打烊紀錄另存勾了哪些工作。
-- ============================================================

create table if not exists public.closing_tasks (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.closing_tasks enable row level security;

drop policy if exists "closing_tasks read" on public.closing_tasks;
create policy "closing_tasks read" on public.closing_tasks
  for select using (public.can_accounting() or public.is_worker());
drop policy if exists "closing_tasks admin" on public.closing_tasks;
create policy "closing_tasks admin" on public.closing_tasks
  for all using (public.is_admin()) with check (public.is_admin());

-- 預設兩項（只在清單是空的時候放）
insert into public.closing_tasks (name, sort_order)
select v.name, v.sort_order
  from (values ('倒垃圾', 0), ('消毒拖鞋', 1)) as v(name, sort_order)
 where not exists (select 1 from public.closing_tasks);

-- 打烊紀錄：勾了哪些工作
alter table public.closing_records
  add column if not exists tasks_checked text[] not null default '{}';
alter table public.closing_records
  add column if not exists tasks_total int not null default 0;

-- closing_list 多回傳工作欄位（回傳型別變了，需先 drop 再建）
drop function if exists public.closing_list(int);
create function public.closing_list(p_limit int default 60)
returns table (
  id uuid,
  close_date date,
  closed_by uuid,
  closer_name text,
  rooms_checked text[],
  rooms_total int,
  tasks_checked text[],
  tasks_total int,
  petty_expected numeric,
  petty_actual numeric,
  today_change numeric,
  note text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql security definer stable set search_path = public as $$
begin
  if not (public.can_accounting() or public.is_worker()) then
    raise exception '沒有打烊權限';
  end if;
  return query
    select r.id, r.close_date, r.closed_by, t.name::text,
           r.rooms_checked::text[], r.rooms_total,
           r.tasks_checked::text[], r.tasks_total,
           r.petty_expected, r.petty_actual,
           r.today_change, r.note, r.created_at, r.updated_at
      from public.closing_records r
      left join public.teachers t on t.id = r.closed_by
     order by r.close_date desc
     limit greatest(1, least(p_limit, 365));
end;
$$;
revoke all on function public.closing_list(int) from public, anon;
grant execute on function public.closing_list(int) to authenticated;
