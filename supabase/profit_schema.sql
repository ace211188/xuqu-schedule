-- ============================================================
-- 序曲 — 學生資料頁「毛利」所需設定表
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run（可重複執行）
-- 依賴：schema.sql（is_admin()）、students_schema.sql（can_students / students）
-- 權限：毛利與成本屬敏感資訊，一律「僅管理員(宇群)」可讀寫。
--       前端毛利面板也只在 is_admin 時顯示。
-- 毛利定義：毛利 = 當月學費收入(依繳費日) − 老師鐘點/拆帳成本
-- ============================================================

-- 1) 老師成本設定（每位老師一列；混合支援：拆帳% 或 固定鐘點）
--    teacher 欄對應 students.teacher 內出現的老師名字（純文字比對）
create table if not exists public.teacher_cost_config (
  teacher     text primary key,
  method      text not null default 'split'
              check (method in ('split', 'hourly')),
  split_pct   numeric,   -- method='split'：老師抽學費的百分比（0–100）
  hourly_rate numeric,   -- method='hourly'：每小時成本（需搭配當月時數）
  active      boolean not null default true,
  updated_at  timestamptz not null default now()
);

-- 2) 鐘點制老師的「當月上課時數」（拆帳制老師不需填）
--    月＝'YYYY-MM'；毛利計算時 該老師總成本 = hours × hourly_rate
create table if not exists public.teacher_monthly_hours (
  teacher    text not null,
  month      text not null,             -- 'YYYY-MM'
  hours      numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (teacher, month)
);

-- 3) 營運設定（單列）：固定開銷目標（預設 80000）
create table if not exists public.biz_settings (
  id             int primary key default 1 check (id = 1),
  fixed_overhead numeric not null default 80000,
  updated_at     timestamptz not null default now()
);
insert into public.biz_settings (id) values (1) on conflict (id) do nothing;

-- ── updated_at 觸發器 ──
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_cost_touch on public.teacher_cost_config;
create trigger trg_cost_touch before update on public.teacher_cost_config
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_hours_touch on public.teacher_monthly_hours;
create trigger trg_hours_touch before update on public.teacher_monthly_hours
  for each row execute function public.touch_updated_at();
drop trigger if exists trg_biz_touch on public.biz_settings;
create trigger trg_biz_touch before update on public.biz_settings
  for each row execute function public.touch_updated_at();

-- ── RLS：僅管理員可讀寫（毛利/成本敏感）──
alter table public.teacher_cost_config   enable row level security;
alter table public.teacher_monthly_hours enable row level security;
alter table public.biz_settings          enable row level security;

drop policy if exists "cost admin all" on public.teacher_cost_config;
create policy "cost admin all" on public.teacher_cost_config
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "hours admin all" on public.teacher_monthly_hours;
create policy "hours admin all" on public.teacher_monthly_hours
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "biz admin all" on public.biz_settings;
create policy "biz admin all" on public.biz_settings
  for all using (public.is_admin()) with check (public.is_admin());
