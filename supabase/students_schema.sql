-- ============================================================
-- 序曲音樂學院 — 學生資料卡 資料表與權限
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run
-- 依賴：schema.sql（teachers 表、is_admin() 函式）需先建立
-- 設計原則：純靜態前端直連 Supabase，安全全靠 RLS + 觸發器
-- ⚠️ 獨立功能：與「記帳」模組、Overture 系統皆不連動、不同步
-- 欄位對齊「序曲音樂學院｜學生個人資料卡」紙本
-- ============================================================

-- 0) 權限：誰能用學生資料（宇群=管理者、奕寬/美君=負責人）
alter table public.teachers
  add column if not exists can_students boolean not null default false;

create or replace function public.can_students()
returns boolean
language sql
security definer
stable
as $$
  select public.is_admin() or exists (
    select 1 from public.teachers
    where id = auth.uid() and can_students
  );
$$;

-- ============================================================
-- 1) 學生（一生一卡）— 對齊紙本欄位
--    家庭歸群 key = 母（fallback 父）姓名＋電話，不另建 family 表
--    狀態（前端下拉，不加 CHECK 保留彈性）：
--      招生鏈：完成免費測驗 → 完成試上 → 付定金 → 在學（可一鍵推進）
--      側狀態：暫停 / 畢業 / 流失（手動切換）
-- ============================================================
create table if not exists public.students (
  id                  uuid primary key default gen_random_uuid(),
  -- 一、基本資料
  name                text not null,                        -- 學生姓名
  nickname            text,                                 -- 暱稱（英文名 Joey/ori… 也放這）
  gender              text,                                 -- 性別（男/女）
  birthday            text,                                 -- 出生年月日（保留原填法，可民國）
  school              text,                                 -- 就讀學校
  status              text not null default '在學',          -- 狀態（見上）
  needs_followup      boolean not null default false,       -- 待追蹤旗標（獨立於狀態，任何狀態皆可）
  enrolled_on         text,                                 -- 入校日期（保留原填法）
  filed_on            text,                                 -- 建檔日期（保留原填法）
  -- 二、家長與聯絡
  father_name         text,                                 -- 父親姓名（可附註職業）
  father_phone        text,                                 -- 父親電話
  mother_name         text,                                 -- 母親姓名（可附註職業）
  mother_phone        text,                                 -- 母親電話
  main_contact        text,                                 -- 主要聯絡人（M/F/本人/爸+媽…）
  line_name           text,                                 -- LINE 名稱
  address             text,                                 -- 地址（部分卡片有）
  -- 三、招生與課程
  source              text,                                 -- 獲客來源（FB/Google/舊生介紹…）
  referrer_student_id uuid references public.students(id) on delete set null, -- 介紹人（連到另一位 student）
  referrer_note       text,                                 -- 介紹人補充（例：妹妹晨希介紹／股東推薦）
  class_slot          text,                                 -- 班別（A1/B2/C2/D4/個別…）
  instrument          text,                                 -- 樂器／科目（可多項：鋼琴, 樂理）
  teacher             text,                                 -- 上課老師（可多位，對應樂器順序）
  course_type         text,                                 -- 課程種類（7 類，選填分類用）
  -- 四、收費（快速欄；歷史在 student_fee_records）
  current_plan        text,                                 -- 目前收費方案＋金額（醒目顯示）
  deposit_amount      numeric,                              -- 訂金金額（純註記，不進記帳）
  deposit_note        text,                                 -- 訂金備註
  discount_note       text,                                 -- 優惠備註（自由文字）
  -- 五、備註
  notes               text,                                 -- 備註／學習紀錄
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists students_family_idx
  on public.students(mother_name, mother_phone);
create index if not exists students_status_idx on public.students(status);
create index if not exists students_teacher_idx on public.students(teacher);
create index if not exists students_referrer_idx on public.students(referrer_student_id);

-- ============================================================
-- 2) 收費紀錄／歷史（B 方案）
--    「下次該收多少」＝ 該生最新一筆；系統不算錢，金額/方案手填
--    collected_by：收款人（宇群/美君/奕寬…，純文字，不與記帳連動）
-- ============================================================
create table if not exists public.student_fee_records (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.students(id) on delete cascade,
  charged_on   date not null default current_date,
  plan         text,
  amount       numeric,
  collected_by text,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists student_fee_student_idx
  on public.student_fee_records(student_id);
create index if not exists student_fee_charged_idx
  on public.student_fee_records(charged_on);

-- ============================================================
-- 觸發器：updated_at 自動維護（BEFORE UPDATE）
-- ============================================================
create or replace function public.students_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_students_touch on public.students;
create trigger trg_students_touch
  before update on public.students
  for each row execute function public.students_touch_updated_at();

-- ============================================================
-- Row Level Security
-- 讀取 / 新增 / 修改：is_admin() OR can_students()（三人）
-- 刪除：is_admin() only（限宇群）
-- 收費紀錄跟隨 students 同權限
-- ============================================================
alter table public.students            enable row level security;
alter table public.student_fee_records enable row level security;

drop policy if exists "students read" on public.students;
create policy "students read" on public.students
  for select using (public.can_students());
drop policy if exists "students insert" on public.students;
create policy "students insert" on public.students
  for insert with check (public.can_students());
drop policy if exists "students update" on public.students;
create policy "students update" on public.students
  for update using (public.can_students()) with check (public.can_students());
drop policy if exists "students delete admin" on public.students;
create policy "students delete admin" on public.students
  for delete using (public.is_admin());

drop policy if exists "student_fee read" on public.student_fee_records;
create policy "student_fee read" on public.student_fee_records
  for select using (public.can_students());
drop policy if exists "student_fee insert" on public.student_fee_records;
create policy "student_fee insert" on public.student_fee_records
  for insert with check (public.can_students());
drop policy if exists "student_fee update" on public.student_fee_records;
create policy "student_fee update" on public.student_fee_records
  for update using (public.can_students()) with check (public.can_students());
drop policy if exists "student_fee delete admin" on public.student_fee_records;
create policy "student_fee delete admin" on public.student_fee_records
  for delete using (public.is_admin());

-- ============================================================
-- 上線設定：開通三人學生資料權限
-- ============================================================
update public.teachers
   set can_students = true
 where name in ('宇群', '奕寬', '美君');
