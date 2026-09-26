-- ============================================================
-- 序曲 — 打烊輪值／指派工讀生／公休（2026-09-26）
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run（可重複執行）
-- 依賴：closing_records_schema.sql、closing_lock_worker_invites.sql（is_worker）
-- 規則：
--   * 每週輪值（closing_rota）：週一公休；二宇群、三美君、四奕寬、五美君、六日宇群（設定頁可改）
--   * 個別日期（closing_days）：宇群可標公休；當天輪值的人或宇群可指派工讀生
--   * 只有當天負責人（輪值的人或被指派的工讀生）能建立當天打烊紀錄；公休日不能建立
--   * 每晚 21:30 若非公休且沒有打烊紀錄 → 推播提醒負責人＋宇群（scripts/send-closing-reminder.mjs）
-- ============================================================

-- 台灣的今天
create or replace function public.taipei_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Taipei')::date;
$$;

-- 每週輪值（weekday：0=週日 … 6=週六，與 JS getDay() 相同）
create table if not exists public.closing_rota (
  weekday    smallint primary key check (weekday between 0 and 6),
  teacher_id uuid references public.teachers(id) on delete set null,
  closed     boolean not null default false, -- 固定公休
  updated_at timestamptz not null default now()
);
alter table public.closing_rota enable row level security;
drop policy if exists "closing_rota read" on public.closing_rota;
create policy "closing_rota read" on public.closing_rota
  for select using (public.can_accounting() or public.is_worker());
drop policy if exists "closing_rota admin" on public.closing_rota;
create policy "closing_rota admin" on public.closing_rota
  for all using (public.is_admin()) with check (public.is_admin());

-- 預設輪值（已存在的星期不覆蓋）
insert into public.closing_rota (weekday, teacher_id, closed)
select v.weekday, (select id from public.teachers where name = v.who limit 1), v.closed
  from (values
    (0, '宇群', false),
    (1, null,   true),
    (2, '宇群', false),
    (3, '美君', false),
    (4, '奕寬', false),
    (5, '美君', false),
    (6, '宇群', false)
  ) as v(weekday, who, closed)
on conflict (weekday) do nothing;

-- 個別日期：公休、指派工讀生（只能經下方 RPC 修改）
create table if not exists public.closing_days (
  day                date primary key,
  holiday            boolean not null default false,
  assigned_worker_id uuid references public.teachers(id) on delete set null,
  updated_by         uuid references public.teachers(id) on delete set null,
  updated_at         timestamptz not null default now()
);
alter table public.closing_days enable row level security;
drop policy if exists "closing_days read" on public.closing_days;
create policy "closing_days read" on public.closing_days
  for select using (public.can_accounting() or public.is_worker());

-- 區間排班（含負責人與工讀生名字；工讀生讀不到 teachers 名單，所以由資料庫帶出）
drop function if exists public.closing_schedule(date, date);
create function public.closing_schedule(p_from date, p_to date)
returns table (
  day           date,
  weekday       int,
  holiday       boolean,
  fixed_holiday boolean,
  rota_id       uuid,
  rota_name     text,
  worker_id     uuid,
  worker_name   text
)
language plpgsql security definer stable set search_path = public as $$
begin
  if not (public.can_accounting() or public.is_worker()) then
    raise exception '沒有打烊權限';
  end if;
  if p_to < p_from or p_to - p_from > 62 then
    raise exception '日期區間不正確';
  end if;
  return query
    select g.d::date,
           extract(dow from g.d)::int,
           (coalesce(r.closed, false) or coalesce(cd.holiday, false)),
           coalesce(r.closed, false),
           r.teacher_id,
           rt.name::text,
           cd.assigned_worker_id,
           wt.name::text
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') as g(d)
      left join public.closing_rota r on r.weekday = extract(dow from g.d)::int
      left join public.teachers rt on rt.id = r.teacher_id
      left join public.closing_days cd on cd.day = g.d::date
      left join public.teachers wt on wt.id = cd.assigned_worker_id
     order by g.d;
end;
$$;

-- 目前登入者能不能建立這天的打烊紀錄
create or replace function public.closing_can_fill(p_day date)
returns boolean language sql security definer stable set search_path = public as $$
  select coalesce(
    case
      when coalesce(r.closed, false) or coalesce(cd.holiday, false) then false
      -- 這天沒設定負責人：有打烊權限的人都能填
      when r.teacher_id is null and cd.assigned_worker_id is null
        then public.can_accounting() or public.is_worker()
      else auth.uid() = r.teacher_id or auth.uid() = cd.assigned_worker_id
    end,
    false)
  from (select 1) as one
  left join public.closing_rota r on r.weekday = extract(dow from p_day)::int
  left join public.closing_days cd on cd.day = p_day;
$$;

-- 打烊紀錄：只有當天負責人能建立（修改仍是「編輯者本人＋8 小時內」）
drop policy if exists "closing insert" on public.closing_records;
create policy "closing insert" on public.closing_records
  for insert with check (
    (public.can_accounting() or public.is_worker())
    and closed_by = auth.uid()
    and public.closing_can_fill(close_date)
  );

-- 宇群：標記／取消公休
create or replace function public.closing_set_holiday(p_day date, p_holiday boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception '只有管理者能設定公休';
  end if;
  if p_day < public.taipei_today() then
    raise exception '不能修改已經過去的日期';
  end if;
  insert into public.closing_days (day, holiday, updated_by)
  values (p_day, p_holiday, auth.uid())
  on conflict (day) do update
    set holiday = excluded.holiday, updated_by = excluded.updated_by, updated_at = now();
end;
$$;

-- 指派代班（p_worker = null 取消）：
--   宇群（管理者）可指派任何有打烊權限的人（記帳成員或工讀生）；當天輪值的人只能指派工讀生
--   （欄位名 assigned_worker_id 沿用，實際可能是工讀生或記帳成員）
create or replace function public.closing_assign_worker(p_day date, p_worker uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rota uuid;
begin
  if p_day < public.taipei_today() then
    raise exception '不能修改已經過去的日期';
  end if;
  select teacher_id into v_rota
    from public.closing_rota where weekday = extract(dow from p_day)::int;
  if not (public.is_admin() or (v_rota is not null and v_rota = auth.uid())) then
    raise exception '只有當天輪值的人或管理者能指派';
  end if;
  if p_worker is not null then
    if public.is_admin() then
      if not exists (select 1 from public.teachers
                      where id = p_worker and (is_worker or can_accounting)) then
        raise exception '只能指派有打烊權限的人（美君、奕寬、工讀生…）';
      end if;
    elsif not exists (select 1 from public.teachers where id = p_worker and is_worker) then
      raise exception '只能指派工讀生';
    end if;
  end if;
  insert into public.closing_days (day, assigned_worker_id, updated_by)
  values (p_day, p_worker, auth.uid())
  on conflict (day) do update
    set assigned_worker_id = excluded.assigned_worker_id,
        updated_by = excluded.updated_by, updated_at = now();
end;
$$;

revoke all on function public.closing_schedule(date, date) from public, anon;
revoke all on function public.closing_can_fill(date) from public, anon;
revoke all on function public.closing_set_holiday(date, boolean) from public, anon;
revoke all on function public.closing_assign_worker(date, uuid) from public, anon;
grant execute on function public.closing_schedule(date, date) to authenticated;
grant execute on function public.closing_can_fill(date) to authenticated;
grant execute on function public.closing_set_holiday(date, boolean) to authenticated;
grant execute on function public.closing_assign_worker(date, uuid) to authenticated;
