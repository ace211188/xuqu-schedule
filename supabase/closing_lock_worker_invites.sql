-- ============================================================
-- 序曲 — 打烊鎖定 ＋ 工讀生打烊 ＋ 工讀生邀請碼（2026-09-26）
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run（可重複執行）
-- 依賴：schema.sql、accounting_schema.sql、closing_records_schema.sql、
--       worker_attendance_schema.sql（teachers.is_worker）、collection_change_at_creation.sql
-- 內容：
--   (1) is_worker() 函式
--   (2) 打烊：記帳成員＋工讀生都能用；當天第一個存檔者＝編輯者，其他人唯讀；
--       自第一次存檔起 8 小時後鎖定，所有人（含管理者）都不能再改
--   (3) closing_petty_summary()：只回傳零用金「帳上應有」與「今日找錢」兩個數字，
--       讓看不到帳目的工讀生也能盤點（其他帳目一律看不到）
--   (4) closing_list()：打烊紀錄＋填寫者名字（工讀生讀不到 teachers 名單）
--   (5) worker_invites：工讀生邀請碼（一次性、有期限；由 Edge Function 以 service role 讀寫）
-- ============================================================

-- (1) 目前登入者是否為工讀生
create or replace function public.is_worker()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.teachers where id = auth.uid() and is_worker
  );
$$;

-- (2) 打烊權限
drop policy if exists "closing_rooms read" on public.closing_rooms;
create policy "closing_rooms read" on public.closing_rooms
  for select using (public.can_accounting() or public.is_worker());

drop policy if exists "toilet_roster read" on public.toilet_roster;
create policy "toilet_roster read" on public.toilet_roster
  for select using (public.can_accounting() or public.is_worker());

drop policy if exists "closing read" on public.closing_records;
create policy "closing read" on public.closing_records
  for select using (public.can_accounting() or public.is_worker());

drop policy if exists "closing insert" on public.closing_records;
create policy "closing insert" on public.closing_records
  for insert with check (
    (public.can_accounting() or public.is_worker()) and closed_by = auth.uid()
  );

-- 只有編輯者本人、且在第一次存檔後 8 小時內可以修改（管理者也不例外）
drop policy if exists "closing update" on public.closing_records;
create policy "closing update" on public.closing_records
  for update
  using (closed_by = auth.uid() and now() < created_at + interval '8 hours')
  with check (closed_by = auth.uid());

-- 守門：修改時不能動日期、編輯者、建立時間（避免改 created_at 延長鎖定時限）
create or replace function public.closing_records_guard()
returns trigger language plpgsql as $$
begin
  new.close_date := old.close_date;
  new.closed_by  := old.closed_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_closing_records_guard on public.closing_records;
create trigger trg_closing_records_guard
  before update on public.closing_records
  for each row execute function public.closing_records_guard();

-- (3) 零用金盤點數字（p_date 由前端傳本地日期，避免資料庫 UTC 日期差 8 小時）
create or replace function public.closing_petty_summary(p_date date)
returns json language plpgsql security definer stable set search_path = public as $$
declare
  v_id uuid;
  v_opening numeric;
  v_balance numeric;
  v_change numeric;
begin
  if not (public.can_accounting() or public.is_worker()) then
    raise exception '沒有打烊權限';
  end if;

  select id, opening_balance into v_id, v_opening
    from public.acc_accounts
   where type = 'petty' and active
   order by sort_order, created_at
   limit 1;
  if v_id is null then
    return json_build_object('has_petty', false, 'petty_expected', null, 'today_change', 0);
  end if;

  select v_opening + coalesce(sum(signed_amount), 0) into v_balance
    from public.acc_entries where account_id = v_id;

  select coalesce(sum(abs(signed_amount)), 0) into v_change
    from public.acc_entries
   where account_id = v_id
     and source_type = 'collection_change'
     and occurred_on = p_date;

  return json_build_object(
    'has_petty', true,
    'petty_expected', v_balance,
    'today_change', v_change
  );
end;
$$;

-- (4) 打烊紀錄（含填寫者名字）
create or replace function public.closing_list(p_limit int default 60)
returns table (
  id uuid,
  close_date date,
  closed_by uuid,
  closer_name text,
  rooms_checked text[],
  rooms_total int,
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
           r.rooms_checked::text[], r.rooms_total, r.petty_expected, r.petty_actual,
           r.today_change, r.note, r.created_at, r.updated_at
      from public.closing_records r
      left join public.teachers t on t.id = r.closed_by
     order by r.close_date desc
     limit greatest(1, least(p_limit, 365));
end;
$$;

revoke all on function public.closing_petty_summary(date) from public, anon;
revoke all on function public.closing_list(int) from public, anon;
grant execute on function public.closing_petty_summary(date) to authenticated;
grant execute on function public.closing_list(int) to authenticated;

-- (5) 工讀生邀請碼
create table if not exists public.worker_invites (
  code        text primary key,
  note        text,
  created_by  uuid references public.teachers(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references public.teachers(id) on delete set null
);
alter table public.worker_invites enable row level security;
-- 前端不直接讀寫邀請碼；一律經 Edge Function（service role）。管理者可讀以便除錯。
drop policy if exists "worker_invites admin read" on public.worker_invites;
create policy "worker_invites admin read" on public.worker_invites
  for select using (public.is_admin());
