-- ============================================================
-- 序曲 — 學生資料「刪除」權限開放（2026-09-15 已套用）
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run（可重複執行）
-- 依賴：schema.sql（is_admin）、students_schema.sql（students 表/RLS）
-- 說明：原本只有管理者(宇群)能刪學生；新增 can_delete_students 旗標，
--       另外開放給奕寬。student_fee_records 由 FK ON DELETE CASCADE 連帶刪除；
--       acc_collections.student_id / students.referrer_student_id 皆 SET NULL。
-- ============================================================

alter table public.teachers
  add column if not exists can_delete_students boolean not null default false;

create or replace function public.can_delete_students()
returns boolean language sql security definer stable as $$
  select public.is_admin() or exists (
    select 1 from public.teachers
    where id = auth.uid() and can_delete_students
  );
$$;

drop policy if exists "students delete admin" on public.students;
drop policy if exists "students delete" on public.students;
create policy "students delete" on public.students
  for delete using (public.can_delete_students());

-- 開放給奕寬（名字若與資料庫不同請自行修改）
update public.teachers set can_delete_students = true where name = '奕寬';
