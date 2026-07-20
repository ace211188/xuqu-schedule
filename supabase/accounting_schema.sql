-- ============================================================
-- 序曲音樂學院 — 記帳 / 代墊 / 收款 資料表與權限
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run
-- 依賴：schema.sql（teachers 表、is_admin() 函式）需先建立
-- 設計原則：純靜態前端直連 Supabase，安全與金流邏輯全靠 RLS + 觸發器
-- ============================================================

-- 0) 權限：誰能用記帳模組（宇群=管理者、奕寬/美君=負責人）
alter table public.teachers
  add column if not exists can_accounting boolean not null default false;

-- 目前登入者是否能使用記帳（管理者當然可以）
create or replace function public.can_accounting()
returns boolean
language sql
security definer
stable
as $$
  select public.is_admin() or exists (
    select 1 from public.teachers
    where id = auth.uid() and can_accounting
  );
$$;

-- 讓管理者能在「設定」頁開關成員的 can_accounting。
-- （teachers 表原本只有 select 政策，沒有 update → 否則開關會被 RLS 默默擋掉）
drop policy if exists "teachers admin update" on public.teachers;
create policy "teachers admin update" on public.teachers
  for update using (public.is_admin()) with check (public.is_admin());

-- ============================================================
-- 1) 帳戶（銀行帳戶、教室現金、櫃台零用金…都是「帳戶」）
-- ============================================================
create table if not exists public.acc_accounts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  type             text not null default 'bank'
                     check (type in ('bank','cash','petty')),
  owner_teacher_id uuid references public.teachers(id) on delete set null,
  is_main          boolean not null default false,   -- 主帳戶（收費入帳）
  opening_balance  numeric(12,2) not null default 0, -- 期初餘額
  sort_order       int not null default 0,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- ============================================================
-- 2) 收支類別（可自訂新增）
-- ============================================================
create table if not exists public.acc_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  kind       text not null check (kind in ('income','expense')),
  sort_order int not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

-- ============================================================
-- 3) 流水帳分錄（帳戶餘額的唯一真實來源）
--    signed_amount：收入為正、支出為負
--    轉帳＝一組兩筆，共用 transfer_group（轉出負、轉入正）
--    source_type/source_id：代墊或收款自動產生時的來源，供勾稽
-- ============================================================
create table if not exists public.acc_entries (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references public.acc_accounts(id) on delete restrict,
  signed_amount  numeric(12,2) not null,
  category_id    uuid references public.acc_categories(id) on delete set null,
  occurred_on    date not null default current_date,
  note           text,
  source_type    text not null default 'manual'
                   check (source_type in ('manual','reimbursement','transfer','collection')),
  source_id      uuid,
  transfer_group uuid,
  created_by     uuid references public.teachers(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index if not exists acc_entries_account_idx on public.acc_entries(account_id);
create index if not exists acc_entries_source_idx on public.acc_entries(source_type, source_id);
create index if not exists acc_entries_occurred_idx on public.acc_entries(occurred_on);

-- ============================================================
-- 4) 代墊單（先自掏腰包 → 附收據 → 每週確認付款）
-- ============================================================
create table if not exists public.acc_reimbursements (
  id             uuid primary key default gen_random_uuid(),
  requester_id   uuid not null references public.teachers(id) on delete cascade,
  amount         numeric(12,2) not null check (amount > 0),
  category_id    uuid references public.acc_categories(id) on delete set null,
  description    text not null,
  occurred_on    date not null default current_date,  -- 購買/預計購買日期
  needs_approval boolean not null default false,       -- amount > 2000（觸發器自動設）
  status         text not null default 'ready'
                   check (status in ('pending_approval','approved','ready','paid','rejected')),
  receipt_paths  text[] not null default '{}',         -- Storage 內的發票/收據路徑
  reject_reason  text,
  reviewed_by    uuid references public.teachers(id) on delete set null,
  reviewed_at    timestamptz,
  paid_account_id uuid references public.acc_accounts(id) on delete set null, -- 由哪個帳戶付
  paid_at        timestamptz,
  created_at     timestamptz not null default now()
);
create index if not exists acc_reimb_requester_idx on public.acc_reimbursements(requester_id);
create index if not exists acc_reimb_status_idx on public.acc_reimbursements(status);

-- ============================================================
-- 5) 收款單（錢先放教室/零用金 → 每週確認 → 之後繳回主帳戶）
-- ============================================================
create table if not exists public.acc_collections (
  id              uuid primary key default gen_random_uuid(),
  collector_id    uuid not null references public.teachers(id) on delete cascade,
  amount          numeric(12,2) not null check (amount > 0),
  category_id     uuid references public.acc_categories(id) on delete set null,
  description     text not null,
  occurred_on     date not null default current_date,
  held_account_id uuid references public.acc_accounts(id) on delete set null, -- 錢先放哪個帳戶
  status          text not null default 'pending_confirm'
                    check (status in ('pending_confirm','confirmed','rejected')),
  receipt_paths   text[] not null default '{}',
  reject_reason   text,
  confirmed_by    uuid references public.teachers(id) on delete set null,
  confirmed_at    timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists acc_collection_collector_idx on public.acc_collections(collector_id);
create index if not exists acc_collection_status_idx on public.acc_collections(status);

-- ============================================================
-- 6) 帳戶餘額檢視（期初 + 所有分錄合計）
-- ============================================================
create or replace view public.acc_account_balances as
  select
    a.id,
    a.name,
    a.type,
    a.is_main,
    a.owner_teacher_id,
    a.opening_balance
      + coalesce((select sum(e.signed_amount)
                  from public.acc_entries e
                  where e.account_id = a.id), 0) as balance
  from public.acc_accounts a;

-- 讓檢視套用查詢者自己的 RLS（其他老師照樣看不到）
alter view public.acc_account_balances set (security_invoker = on);

-- ============================================================
-- 觸發器：金流邏輯（不信任前端，全在資料庫強制）
-- ============================================================

-- (A) 代墊單：進出關卡的守門 + 自動設 needs_approval
create or replace function public.acc_reimb_guard()
returns trigger
language plpgsql
security definer
as $$
begin
  if tg_op = 'INSERT' then
    new.needs_approval := (new.amount > 2000);
    -- 超過 2000 一律要走事前申請；未達門檻可直接進入待付款
    if new.needs_approval and new.status not in ('pending_approval','rejected') then
      new.status := 'pending_approval';
    end if;
    if (not new.needs_approval) and new.status = 'pending_approval' then
      new.status := 'ready';
    end if;
    return new;
  end if;

  -- UPDATE
  new.needs_approval := (new.amount > 2000);

  if not public.is_admin() then
    -- 負責人（非管理者）的限制：
    -- 1) 不能自己核准 / 付款 / 退回
    if new.status in ('approved','paid') and old.status is distinct from new.status then
      raise exception '只有管理者能核准或付款';
    end if;
    -- 2) 事前授權核准後，不能再偷改金額（防止核准 2000、事後改 5000）
    if old.status in ('approved','ready','paid') and new.amount is distinct from old.amount then
      raise exception '已核准的代墊金額不可修改';
    end if;
    -- 3) 已付款的單不可再改
    if old.status = 'paid' then
      raise exception '已付款的代墊不可修改';
    end if;
    -- 4) 需事前授權者，未經核准不可直接跳到待付款
    if new.needs_approval and new.status = 'ready'
       and old.status not in ('approved','ready') then
      raise exception '超過 2000 的代墊需先送出申請並經核准';
    end if;
  end if;

  -- 記錄審核/付款時間戳
  if new.status = 'approved' and old.status is distinct from 'approved' then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  if new.status = 'paid' and old.status is distinct from 'paid' then
    new.paid_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_acc_reimb_guard on public.acc_reimbursements;
create trigger trg_acc_reimb_guard
  before insert or update on public.acc_reimbursements
  for each row execute function public.acc_reimb_guard();

-- (B) 代墊單付款 → 自動在流水帳產生一筆支出（付款帳戶扣款）
create or replace function public.acc_reimb_ledger()
returns trigger
language plpgsql
security definer
as $$
begin
  -- 轉為已付款：新增支出分錄
  if new.status = 'paid' and (old.status is distinct from 'paid') then
    if new.paid_account_id is null then
      raise exception '付款前請先選擇付款帳戶';
    end if;
    insert into public.acc_entries
      (account_id, signed_amount, category_id, occurred_on, note,
       source_type, source_id, created_by)
    values
      (new.paid_account_id, -new.amount, new.category_id, current_date,
       '代墊付款：' || new.description,
       'reimbursement', new.id, auth.uid());
  end if;
  -- 從已付款退回：移除對應分錄
  if old.status = 'paid' and (new.status is distinct from 'paid') then
    delete from public.acc_entries
     where source_type = 'reimbursement' and source_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_acc_reimb_ledger on public.acc_reimbursements;
create trigger trg_acc_reimb_ledger
  after update on public.acc_reimbursements
  for each row execute function public.acc_reimb_ledger();

-- 刪除代墊單時清掉勾稽的分錄
create or replace function public.acc_reimb_cleanup()
returns trigger language plpgsql security definer as $$
begin
  delete from public.acc_entries
   where source_type = 'reimbursement' and source_id = old.id;
  return old;
end;
$$;
drop trigger if exists trg_acc_reimb_cleanup on public.acc_reimbursements;
create trigger trg_acc_reimb_cleanup
  after delete on public.acc_reimbursements
  for each row execute function public.acc_reimb_cleanup();

-- (C) 收款單：守門（只有管理者能確認/退回）
create or replace function public.acc_collection_guard()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'UPDATE' and not public.is_admin() then
    if new.status in ('confirmed','rejected')
       and old.status is distinct from new.status then
      raise exception '只有管理者能確認或退回收款';
    end if;
    if old.status = 'confirmed' then
      raise exception '已確認的收款不可修改';
    end if;
  end if;
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    new.confirmed_by := auth.uid();
    new.confirmed_at := now();
  end if;
  if new.status = 'rejected' and old.status is distinct from 'rejected' then
    new.confirmed_by := auth.uid();
    new.confirmed_at := now();
  end if;
  return new;
end;
$$;
drop trigger if exists trg_acc_collection_guard on public.acc_collections;
create trigger trg_acc_collection_guard
  before update on public.acc_collections
  for each row execute function public.acc_collection_guard();

-- (D) 收款確認 → 自動在流水帳產生一筆收入（入所在帳戶）
create or replace function public.acc_collection_ledger()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'confirmed' and (old.status is distinct from 'confirmed') then
    if new.held_account_id is null then
      raise exception '確認前請先選擇錢放在哪個帳戶';
    end if;
    insert into public.acc_entries
      (account_id, signed_amount, category_id, occurred_on, note,
       source_type, source_id, created_by)
    values
      (new.held_account_id, new.amount, new.category_id, current_date,
       '收款：' || new.description,
       'collection', new.id, auth.uid());
  end if;
  if old.status = 'confirmed' and (new.status is distinct from 'confirmed') then
    delete from public.acc_entries
     where source_type = 'collection' and source_id = new.id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_acc_collection_ledger on public.acc_collections;
create trigger trg_acc_collection_ledger
  after update on public.acc_collections
  for each row execute function public.acc_collection_ledger();

create or replace function public.acc_collection_cleanup()
returns trigger language plpgsql security definer as $$
begin
  delete from public.acc_entries
   where source_type = 'collection' and source_id = old.id;
  return old;
end;
$$;
drop trigger if exists trg_acc_collection_cleanup on public.acc_collections;
create trigger trg_acc_collection_cleanup
  after delete on public.acc_collections
  for each row execute function public.acc_collection_cleanup();

-- ============================================================
-- Row Level Security
-- 讀取：一律要 can_accounting()（其他老師完全看不到）
-- 帳戶/類別/手動分錄的寫入：只有管理者
-- 代墊/收款：本人可建立與編輯自己的；審核/付款靠上面的觸發器把關
-- ============================================================
alter table public.acc_accounts       enable row level security;
alter table public.acc_categories     enable row level security;
alter table public.acc_entries        enable row level security;
alter table public.acc_reimbursements enable row level security;
alter table public.acc_collections    enable row level security;

-- 帳戶
drop policy if exists "acc_accounts read" on public.acc_accounts;
create policy "acc_accounts read" on public.acc_accounts
  for select using (public.can_accounting());
drop policy if exists "acc_accounts admin write" on public.acc_accounts;
create policy "acc_accounts admin write" on public.acc_accounts
  for all using (public.is_admin()) with check (public.is_admin());

-- 類別
drop policy if exists "acc_categories read" on public.acc_categories;
create policy "acc_categories read" on public.acc_categories
  for select using (public.can_accounting());
drop policy if exists "acc_categories admin write" on public.acc_categories;
create policy "acc_categories admin write" on public.acc_categories
  for all using (public.is_admin()) with check (public.is_admin());

-- 流水帳分錄：大家可讀；只有管理者能手動增修刪（代墊/收款產生的由觸發器以 definer 權限寫入）
drop policy if exists "acc_entries read" on public.acc_entries;
create policy "acc_entries read" on public.acc_entries
  for select using (public.can_accounting());
drop policy if exists "acc_entries admin write" on public.acc_entries;
create policy "acc_entries admin write" on public.acc_entries
  for all using (public.is_admin()) with check (public.is_admin());

-- 代墊單：可讀（管理者全部、本人自己）；本人可建立/編輯自己的；管理者可全改
drop policy if exists "acc_reimb read" on public.acc_reimbursements;
create policy "acc_reimb read" on public.acc_reimbursements
  for select using (public.is_admin() or requester_id = auth.uid());
drop policy if exists "acc_reimb insert own" on public.acc_reimbursements;
create policy "acc_reimb insert own" on public.acc_reimbursements
  for insert with check (
    public.can_accounting() and requester_id = auth.uid()
  );
drop policy if exists "acc_reimb update" on public.acc_reimbursements;
create policy "acc_reimb update" on public.acc_reimbursements
  for update using (public.is_admin() or requester_id = auth.uid())
  with check (public.is_admin() or requester_id = auth.uid());
drop policy if exists "acc_reimb delete own" on public.acc_reimbursements;
create policy "acc_reimb delete own" on public.acc_reimbursements
  for delete using (
    public.is_admin() or (requester_id = auth.uid() and status <> 'paid')
  );

-- 收款單：同上邏輯
drop policy if exists "acc_collection read" on public.acc_collections;
create policy "acc_collection read" on public.acc_collections
  for select using (public.is_admin() or collector_id = auth.uid());
drop policy if exists "acc_collection insert own" on public.acc_collections;
create policy "acc_collection insert own" on public.acc_collections
  for insert with check (
    public.can_accounting() and collector_id = auth.uid()
  );
drop policy if exists "acc_collection update" on public.acc_collections;
create policy "acc_collection update" on public.acc_collections
  for update using (public.is_admin() or collector_id = auth.uid())
  with check (public.is_admin() or collector_id = auth.uid());
drop policy if exists "acc_collection delete own" on public.acc_collections;
create policy "acc_collection delete own" on public.acc_collections
  for delete using (
    public.is_admin() or (collector_id = auth.uid() and status <> 'confirmed')
  );

-- ============================================================
-- Storage：發票/收據（私有 bucket）
-- 路徑慣例：{auth.uid}/{檔名}
-- ============================================================
insert into storage.buckets (id, name, public)
  values ('acc-receipts', 'acc-receipts', false)
  on conflict (id) do nothing;

drop policy if exists "acc receipts read" on storage.objects;
create policy "acc receipts read" on storage.objects
  for select using (
    bucket_id = 'acc-receipts' and public.can_accounting()
  );
drop policy if exists "acc receipts upload own" on storage.objects;
create policy "acc receipts upload own" on storage.objects
  for insert with check (
    bucket_id = 'acc-receipts'
    and public.can_accounting()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists "acc receipts delete own" on storage.objects;
create policy "acc receipts delete own" on storage.objects
  for delete using (
    bucket_id = 'acc-receipts'
    and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text)
  );

-- ============================================================
-- 初始資料（可日後在「設定」頁調整）
-- ============================================================
insert into public.acc_categories (name, kind, sort_order) values
  ('學費',   'income', 1),
  ('報名費', 'income', 2),
  ('教材費', 'income', 3),
  ('其他收入','income', 9),
  ('文具',   'expense', 1),
  ('教材教具','expense', 2),
  ('雜支',   'expense', 3),
  ('其他支出','expense', 9)
on conflict do nothing;

-- ============================================================
-- 上線設定：開通三人記帳權限 + 建立初始帳戶
-- （名字若與資料庫不同請自行修改；跑錯不會壞資料，可再調整）
-- ============================================================

-- 1) 開通記帳權限（宇群本來就是管理者，一起設不影響）
update public.teachers
   set can_accounting = true
 where name in ('宇群', '奕寬', '美君');

-- 2) 初始四個帳戶（期初餘額先設 0，之後在「設定」頁調整）
--    owner 用姓名對應到 teachers；只有在「還沒有任何帳戶」時才建，避免重複。
insert into public.acc_accounts (name, type, is_main, owner_teacher_id, sort_order)
select v.name, v.type, v.is_main,
       (select id from public.teachers where name = v.owner limit 1),
       v.sort_order
  from (values
    ('美君主帳戶', 'bank',  true,  '美君', 1),
    ('宇群帳戶',   'bank',  false, '宇群', 2),
    ('教室現金',   'cash',  false, null,   3),
    ('櫃台零用金', 'petty', false, null,   4)
  ) as v(name, type, is_main, owner, sort_order)
 where not exists (select 1 from public.acc_accounts);
