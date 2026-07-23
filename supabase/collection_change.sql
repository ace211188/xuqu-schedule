-- ============================================================
-- 收款「找零」功能：代收時可勾選有無找錢、找多少，
-- 找零金額在「確認入帳」時自動從零用金帳戶扣除。
--
-- 設計（與宇群確認）：
--   收款金額 = 學生實際給的現金（例：$3,000）
--   change_given = 找零金額（例：$200，從櫃台零用金出）
--   確認入帳後：入帳帳戶 +$3,000、零用金 −$200，淨額 +$2,800 = 學費
--
-- 安全性：本檔只「新增欄位」與「更新觸發器」，不刪除、不修改任何現有資料。
--   反覆執行安全（add column if not exists / create or replace）。
-- 執行方式：Supabase → SQL Editor → 貼上整份 → Run。
-- ============================================================

-- 1) 收款單新增兩個欄位（現有資料自動 change_given=0，即「沒有找零」，行為不變）
alter table public.acc_collections
  add column if not exists change_given numeric(12,2) not null default 0
    check (change_given >= 0);

alter table public.acc_collections
  add column if not exists change_account_id uuid
    references public.acc_accounts(id) on delete set null; -- 找零從哪個帳戶出（零用金）

-- 2) 更新「收款確認 → 產生流水帳」觸發器：
--    除了原本的「收入入所在帳戶」，若有找零再多記一筆「零用金支出」。
--    兩筆都掛同一個 source（collection / 本單 id），退回或刪除時會一起還原。
create or replace function public.acc_collection_ledger()
returns trigger language plpgsql security definer as $$
begin
  if new.status = 'confirmed' and (old.status is distinct from 'confirmed') then
    if new.held_account_id is null then
      raise exception '確認前請先選擇錢放在哪個帳戶';
    end if;

    -- (a) 收入：學生實付現金入所在帳戶
    insert into public.acc_entries
      (account_id, signed_amount, category_id, occurred_on, note,
       source_type, source_id, created_by)
    values
      (new.held_account_id, new.amount, new.category_id, current_date,
       '收款：' || new.description,
       'collection', new.id, auth.uid());

    -- (b) 找零：從零用金帳戶支出（若有）
    if coalesce(new.change_given, 0) > 0 then
      if new.change_account_id is null then
        raise exception '有找零但未指定找零帳戶（零用金）';
      end if;
      insert into public.acc_entries
        (account_id, signed_amount, category_id, occurred_on, note,
         source_type, source_id, created_by)
      values
        (new.change_account_id, -new.change_given, null, current_date,
         '收款找零：' || new.description,
         'collection', new.id, auth.uid());
    end if;
  end if;

  -- 取消確認：把這張收款單產生的所有分錄（收入＋找零）一起刪掉
  if old.status = 'confirmed' and (new.status is distinct from 'confirmed') then
    delete from public.acc_entries
     where source_type = 'collection' and source_id = new.id;
  end if;

  return new;
end;
$$;

-- 觸發器綁定不變（沿用原本的 trg_acc_collection_ledger），此處不需重建。
-- 若要確認觸發器仍在，可執行：
--   select tgname from pg_trigger where tgrelid = 'public.acc_collections'::regclass;
