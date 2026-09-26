-- ============================================================
-- 序曲 — 工讀生出勤報表（2026-09-26）
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run（可重複執行）
-- 依賴：worker_attendance_schema.sql、accounting_schema.sql（can_accounting）
-- 說明：記帳成員（宇群/美君/奕寬）可唯讀查看工讀生的出勤與工時。
--       不放寬 worker_attendance 本身的 RLS（仍限管理者/本人），
--       改由此 RPC 只回傳需要的欄位（名字、日期、簽到/簽退時間），不含 IP。
--       回傳所有工讀生（該區間沒出勤的也會有一列，日期欄為 null）。
-- ============================================================

create or replace function public.attendance_report(p_from date, p_to date)
returns table (
  worker_id uuid,
  worker_name text,
  work_date date,
  check_in_at timestamptz,
  check_out_at timestamptz
)
language plpgsql security definer stable set search_path = public as $$
begin
  if not public.can_accounting() then
    raise exception '沒有查看出勤的權限';
  end if;
  return query
    select t.id, t.name::text, a.work_date, a.check_in_at, a.check_out_at
      from public.teachers t
      left join public.worker_attendance a
        on a.worker_id = t.id and a.work_date between p_from and p_to
     where t.is_worker
     order by t.name, a.work_date desc;
end;
$$;

revoke all on function public.attendance_report(date, date) from public, anon;
grant execute on function public.attendance_report(date, date) to authenticated;
