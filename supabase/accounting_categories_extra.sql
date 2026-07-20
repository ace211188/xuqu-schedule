-- ============================================================
-- 追加音樂教室常用分類（月結報表分類明細會用到）
-- 用法：Supabase → SQL Editor → 貼上 → Run（可重複執行，不會重複建立）
-- 之後也可在 App「設定」頁自行增減
-- ============================================================

-- 支出面追加：薪水、房租、水電網路電話
insert into public.acc_categories (name, kind, sort_order)
select v.name, 'expense', v.so
  from (values ('薪水', 4), ('房租', 5), ('水電網路電話', 6)) as v(name, so)
 where not exists (
   select 1 from public.acc_categories c
    where c.name = v.name and c.kind = 'expense'
 );

-- 收入面：學費 / 報名費 / 教材費 / 其他收入 已在初始資料建立。
-- 若想把「教材費」改名為「教材/樂譜」，可解除下行註解：
-- update public.acc_categories set name = '教材/樂譜' where name = '教材費' and kind = 'income';
