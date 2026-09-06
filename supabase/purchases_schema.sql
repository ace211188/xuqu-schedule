-- ============================================================
-- 序曲音樂學院 — 採購清單 資料表與權限
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run
-- 依賴：schema.sql、accounting_schema.sql（teachers / acc_* / 權限函式需先建立）
-- 設計原則：純靜態前端直連 Supabase，狀態流轉全靠 RLS + 觸發器把關
-- ============================================================

-- 0) 採購負責人旗標（預設美君）；換人只要改下面那行 name
alter table public.teachers
  add column if not exists is_purchaser boolean not null default false;

update public.teachers set is_purchaser = true where name = '美君';

-- 目前登入者是否為採購負責人
create or replace function public.is_purchaser()
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.teachers
    where id = auth.uid() and is_purchaser
  );
$$;

-- 讓有記帳權限的人也能讀到彼此的姓名（採購清單要顯示「誰要買的」）
drop policy if exists "read teachers" on public.teachers;
create policy "read teachers" on public.teachers
  for select using (
    id = auth.uid()
    or public.can_schedule_admin()
    or public.can_accounting()
  );

-- 1) 採購清單（一筆＝一個要買的品項）
create table if not exists public.acc_purchases (
  id               uuid primary key default gen_random_uuid(),
  item_name        text not null,                 -- 品名
  quantity         int not null default 1 check (quantity > 0),
  note             text,                          -- 備註 / 連結
  est_amount       numeric(12,2),                 -- 預估金額（需求者填，選填）
  actual_amount    numeric(12,2),                 -- 實際金額（採購時填）
  image_paths      text[] not null default '{}',  -- 圖片 / 收據（acc-receipts bucket）
  category_id      uuid references public.acc_categories(id) on delete set null,
  requester_id     uuid not null references public.teachers(id) on delete cascade,
  status           text not null default 'pending'
                     check (status in ('pending','purchased','arrived','cancelled')),
  reimbursement_id uuid references public.acc_reimbursements(id) on delete set null,
  purchased_by     uuid references public.teachers(id) on delete set null,
  purchased_at     timestamptz,
  arrived_at       timestamptz,
  cancel_reason    text,
  created_by       uuid references public.teachers(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index if not exists acc_purchases_status_idx    on public.acc_purchases(status);
create index if not exists acc_purchases_requester_idx on public.acc_purchases(requester_id);

-- 2) 守門觸發器：只有採購負責人/管理者能改狀態；需求者只能在待採購時編輯；記時間戳
create or replace function public.acc_purchase_guard()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'UPDATE' then
    if new.status is distinct from old.status
       and not (public.is_purchaser() or public.is_admin()) then
      raise exception '只有採購負責人能變更採購狀態';
    end if;
    if not (public.is_purchaser() or public.is_admin())
       and old.status <> 'pending' then
      raise exception '已進入採購流程，僅採購負責人可修改';
    end if;
    if new.status = 'purchased' and old.status is distinct from 'purchased' then
      new.purchased_by := auth.uid();
      new.purchased_at := now();
    end if;
    if new.status = 'arrived' and old.status is distinct from 'arrived' then
      new.arrived_at := now();
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_acc_purchase_guard on public.acc_purchases;
create trigger trg_acc_purchase_guard
  before update on public.acc_purchases
  for each row execute function public.acc_purchase_guard();

-- 3) Row Level Security
alter table public.acc_purchases enable row level security;

drop policy if exists "acc_purchases read" on public.acc_purchases;
create policy "acc_purchases read" on public.acc_purchases
  for select using (public.can_accounting());

-- 新增：一律從「待採購」開始，狀態推進只能靠之後的 UPDATE（守門觸發器把關）
-- → 避免任何人在新增時就把品項偷偷標成已到貨、繞過採購負責人
drop policy if exists "acc_purchases insert own" on public.acc_purchases;
create policy "acc_purchases insert own" on public.acc_purchases
  for insert with check (
    public.can_accounting()
    and requester_id = auth.uid()
    and status = 'pending'
  );

drop policy if exists "acc_purchases update" on public.acc_purchases;
create policy "acc_purchases update" on public.acc_purchases
  for update using (
    public.is_admin() or public.is_purchaser() or requester_id = auth.uid()
  ) with check (
    public.is_admin() or public.is_purchaser() or requester_id = auth.uid()
  );

drop policy if exists "acc_purchases delete" on public.acc_purchases;
create policy "acc_purchases delete" on public.acc_purchases
  for delete using (
    public.is_admin() or public.is_purchaser()
    or (requester_id = auth.uid() and status = 'pending')
  );
