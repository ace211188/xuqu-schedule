-- ============================================================
-- 找零改在「收款當下」就從零用金扣（不再等確認入帳）
-- 收入（入帳）仍維持確認時才記；找零與確認脫鉤。
-- 依賴：accounting_schema.sql、collection_change.sql
-- 用法：Supabase → SQL Editor → 貼上整段 → Run（可重複執行）
-- ============================================================

-- 1) 分錄來源允許新增 'collection_change'
alter table public.acc_entries drop constraint if exists acc_entries_source_type_check;
alter table public.acc_entries add constraint acc_entries_source_type_check
  check (source_type in ('manual','reimbursement','transfer','collection','collection_change'));

-- 2) 找零分錄：收款一建立就從零用金扣；改金額/退回/刪除都會同步
create or replace function public.acc_collection_change_ledger()
returns trigger language plpgsql security definer as $$
begin
  if tg_op = 'DELETE' then
    delete from public.acc_entries
      where source_type = 'collection_change' and source_id = old.id;
    return old;
  end if;

  delete from public.acc_entries
    where source_type = 'collection_change' and source_id = new.id;

  if coalesce(new.change_given, 0) > 0 and new.status <> 'rejected' then
    if new.change_account_id is null then
      raise exception '有找零但未指定找零帳戶（零用金）';
    end if;
    insert into public.acc_entries
      (account_id, signed_amount, category_id, occurred_on, note,
       source_type, source_id, created_by)
    values
      (new.change_account_id, -new.change_given, null, new.occurred_on,
       '收款找零：' || new.description,
       'collection_change', new.id, coalesce(new.collector_id, auth.uid()));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_acc_collection_change_ledger on public.acc_collections;
create trigger trg_acc_collection_change_ledger
  after insert or update or delete on public.acc_collections
  for each row execute function public.acc_collection_change_ledger();

-- 3) 確認入帳觸發器：只記收入，找零交給上面的新觸發器
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

-- 4) 既有資料搬遷
update public.acc_entries e
   set source_type = 'collection_change'
  from public.acc_collections c
 where e.source_type = 'collection'
   and e.signed_amount < 0
   and e.source_id = c.id;

insert into public.acc_entries
  (account_id, signed_amount, category_id, occurred_on, note,
   source_type, source_id, created_by)
select c.change_account_id, -c.change_given, null, c.occurred_on,
       '收款找零：' || c.description, 'collection_change', c.id, c.collector_id
from public.acc_collections c
where coalesce(c.change_given,0) > 0
  and c.status <> 'rejected'
  and c.change_account_id is not null
  and not exists (
    select 1 from public.acc_entries e
    where e.source_type = 'collection_change' and e.source_id = c.id
  );
