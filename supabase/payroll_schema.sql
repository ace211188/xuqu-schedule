-- ============================================================
-- 序曲音樂學院 — 老師勞務報酬 / 發薪 資料表與權限
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run（可重複執行）
-- 依賴：schema.sql（teachers / is_admin / touch_updated_at）、
--       accounting_schema.sql（acc_accounts）
-- 設計原則：老師機敏個資與發薪紀錄「只有宇群」可讀寫；純靜態前端直連 Supabase，保護全靠 RLS。
-- ============================================================

-- ── 只有宇群本人（登入 email）可存取發薪資料 ──────────────
-- 若日後要放寬成「所有管理員」，把下面兩張表的 policy 從 public.is_yuqun()
-- 換成 public.is_admin() 即可；要改綁定的 email，只改這個函式這一行。
create or replace function public.is_yuqun()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'yuqun@xuqu.tw';
$$;

-- updated_at 觸發器（若毛利/採購 schema 已建過，這裡 create or replace 不會衝突）
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

-- ── 1) 領款人（老師）機敏個資 + 稅務設定（每位老師固定一列）──
create table if not exists public.payroll_payee (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  id_number       text,                 -- 身分證字號
  birth_roc       text,                 -- 出生(民國) 例 '93/8/6'
  address         text,                 -- 戶籍地址
  phone           text,
  bank_name       text,                 -- 例 台新銀行(812)
  bank_branch     text,                 -- 例 敦南分行(0023)
  bank_account    text,
  income_category text not null default '執行業務'
                    check (income_category in ('執行業務','兼職薪資')),
  union_exempt    boolean not null default false,  -- 具工會投保證明免扣補充保費
  union_name      text,
  note            text,                 -- 備用地址等
  teacher_id      uuid references public.teachers(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── 2) 發薪紀錄（每開一張簽收單存一筆）──────────────────
create table if not exists public.payroll_records (
  id               uuid primary key default gen_random_uuid(),
  payee_id         uuid not null references public.payroll_payee(id) on delete restrict,
  pay_ym           text not null,        -- 給付年月 'YYYY-MM'（西元）
  issue_date       date not null,        -- 填表日期
  gross_amount     numeric(12,2) not null,           -- A 應給付總額
  tax_withholding  numeric(12,2) not null default 0, -- B 預扣所得稅
  nhi_premium      numeric(12,2) not null default 0, -- C 補充保費
  net_amount       numeric(12,2) not null,           -- D 實發 = A-B-C
  income_category  text not null,        -- 開單當下快照
  union_exempt     boolean not null default false,
  course_types     text[] not null default '{}',     -- 授課種類勾選
  status           text not null default 'issued'
                     check (status in ('issued','paid')),
  paid_account_id  uuid references public.acc_accounts(id) on delete set null,
  paid_at          timestamptz,
  created_by       uuid references public.teachers(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists payroll_records_ym_idx    on public.payroll_records(pay_ym);
create index if not exists payroll_records_payee_idx on public.payroll_records(payee_id);

-- updated_at 觸發器
drop trigger if exists trg_payee_touch on public.payroll_payee;
create trigger trg_payee_touch before update on public.payroll_payee
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_payroll_rec_touch on public.payroll_records;
create trigger trg_payroll_rec_touch before update on public.payroll_records
  for each row execute function public.touch_updated_at();

-- ── RLS：只有宇群可讀寫 ────────────────────────────────
alter table public.payroll_payee   enable row level security;
alter table public.payroll_records enable row level security;

drop policy if exists "payee yuqun all" on public.payroll_payee;
create policy "payee yuqun all" on public.payroll_payee
  for all using (public.is_yuqun()) with check (public.is_yuqun());

drop policy if exists "records yuqun all" on public.payroll_records;
create policy "records yuqun all" on public.payroll_records
  for all using (public.is_yuqun()) with check (public.is_yuqun());
