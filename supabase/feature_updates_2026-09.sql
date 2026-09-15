-- ============================================================
-- 序曲 — 2026/09 功能更新 SQL（已於 2026-09-15 經 Supabase 套用）
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run（可重複執行）
-- 依賴：schema.sql、accounting_schema.sql、students_schema.sql
-- 內容：
--   (1) 毛利開放「檢視」給奕寬（讀放寬、寫仍限管理者）
--   (2) 代收款新增 student_id（學費可綁學生）；帳戶改建立時就填(沿用 held_account_id)
--   (3) 學生狀態「流失」改名「養客」
-- 註：本專案的毛利成本表是 biz_settings + class_cost（不是舊 profit_schema.sql
--     裡的 teacher_cost_config/teacher_monthly_hours，那兩張在此專案未建立）。
--     class_cost 與 students 本來就 can_students() 可讀，奕寬已可讀；
--     只有 biz_settings（固定開銷）原限 admin，故只需補它一條讀取政策。
-- ============================================================

-- ------------------------------------------------------------
-- (1) 毛利檢視權限：新增 can_view_profit 旗標 + 函式
--     毛利/成本仍屬敏感，只放寬「讀」，寫入(新增/修改/刪除)維持僅管理者。
-- ------------------------------------------------------------
alter table public.teachers
  add column if not exists can_view_profit boolean not null default false;

create or replace function public.can_view_profit()
returns boolean language sql security definer stable as $$
  select public.is_admin() or exists (
    select 1 from public.teachers
    where id = auth.uid() and can_view_profit
  );
$$;

-- 只有 biz_settings 原本限 admin，補一條「可檢視者可讀」（其餘毛利資料已 can_students 可讀）
drop policy if exists "biz view" on public.biz_settings;
create policy "biz view" on public.biz_settings
  for select using (public.can_view_profit());

-- 開放給奕寬（名字若與資料庫不同請自行修改）
update public.teachers set can_view_profit = true where name = '奕寬';

-- ------------------------------------------------------------
-- (2) 代收款綁學生：acc_collections 新增 student_id
--     帳戶沿用既有 held_account_id（改由收款人建立時就填；管理者確認時仍可調整）
-- ------------------------------------------------------------
alter table public.acc_collections
  add column if not exists student_id uuid references public.students(id) on delete set null;

create index if not exists acc_collection_student_idx
  on public.acc_collections(student_id);

-- ------------------------------------------------------------
-- (3) 學生狀態「流失」改名為「養客」（僅名稱不同）
--     status 欄無 CHECK 限制，直接改字串即可；把既有資料一起更新。
-- ------------------------------------------------------------
update public.students set status = '養客' where status = '流失';
