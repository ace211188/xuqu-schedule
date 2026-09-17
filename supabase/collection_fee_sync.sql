-- ============================================================
-- 代收綁學生 → 自動同步到學生「收費紀錄」
-- 依賴：accounting_schema.sql（acc_collections）、students_schema.sql（student_fee_records）、
--       feature_updates_2026-09.sql（acc_collections.student_id）
-- 背景：收款單雖已能綁 student_id，但沒有任何機制寫進 student_fee_records，
--       導致學生資料的「最近收費」抓不到美君走收款收的學費。此檔補上同步。
-- 用法：Supabase 專案 → SQL Editor → 貼上整段 → Run
-- ============================================================

-- 1) 收費紀錄加來源欄位，指回收款單（刪收款單時一併移除同步的收費）
alter table public.student_fee_records
  add column if not exists source_collection_id uuid
    references public.acc_collections(id) on delete cascade;

-- 一張收款單最多對應一筆同步收費（避免重複）
create unique index if not exists student_fee_source_collection_uidx
  on public.student_fee_records(source_collection_id)
  where source_collection_id is not null;

-- 2) 同步觸發器：綁了學生且未退回 → 建/更新一筆收費（金額用淨額＝實收−找零）
create or replace function public.acc_collection_fee_sync()
returns trigger language plpgsql security definer as $$
declare
  collector_name text;
  net numeric(12,2);
begin
  -- 先清掉這筆收款既有的同步收費，確保 idempotent（金額/學生/日期改了也會重建）
  delete from public.student_fee_records where source_collection_id = new.id;

  if new.student_id is not null and new.status <> 'rejected' then
    select name into collector_name from public.teachers where id = new.collector_id;
    net := new.amount - coalesce(new.change_given, 0);
    insert into public.student_fee_records
      (student_id, charged_on, plan, amount, collected_by, note, source_collection_id)
    values
      (new.student_id, new.occurred_on, null, net, collector_name,
       new.description, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_acc_collection_fee_sync on public.acc_collections;
create trigger trg_acc_collection_fee_sync
  after insert or update on public.acc_collections
  for each row execute function public.acc_collection_fee_sync();

-- 3) 回填：現有已綁學生、未退回、尚未同步過的收款
insert into public.student_fee_records
  (student_id, charged_on, plan, amount, collected_by, note, source_collection_id)
select c.student_id, c.occurred_on, null,
       c.amount - coalesce(c.change_given, 0),
       t.name, c.description, c.id
from public.acc_collections c
left join public.teachers t on t.id = c.collector_id
where c.student_id is not null
  and c.status <> 'rejected'
  and not exists (
    select 1 from public.student_fee_records f where f.source_collection_id = c.id
  );
