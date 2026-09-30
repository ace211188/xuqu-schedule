-- ============================================================
-- 打烊提醒改用 Supabase pg_cron（準時，取代會誤點的 GitHub Actions）
-- 每天 UTC 13:30 ＝ 台北 21:30，呼叫 closing-reminder Edge Function。
--
-- 背景：GitHub Actions 的 schedule 實測延遲 4～7 小時，把提醒拖到半夜 1～4 點，
--       還會因跨過午夜把「今天」算成隔天。pg_cron 跑在資料庫內、準時不延遲。
-- 依賴：pg_cron、pg_net、supabase_vault；closing-reminder Edge Function 需先部署。
-- 用法：Supabase → SQL Editor → 貼上整段 → Run（可重複執行）
-- ============================================================

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 呼叫 Edge Function 用的 token（與函式內 CRON_TOKEN 常數相同），存 Vault
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'closing_cron_token') then
    perform vault.create_secret(
      'xqclose_c7f19a4e2b6d8035f1a9e4c2d7b0aa51',
      'closing_cron_token',
      '打烊提醒 Edge Function 的呼叫金鑰'
    );
  end if;
end $$;

-- 每天台北 21:30 準時呼叫（cron.schedule 同名會覆蓋）
select cron.schedule(
  'closing-reminder-2130tpe',
  '30 13 * * *',
  $cron$
  select net.http_post(
    url := 'https://gffemhrthwdnajdpkwsq.supabase.co/functions/v1/closing-reminder',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-token', (select decrypted_secret from vault.decrypted_secrets where name = 'closing_cron_token')
    ),
    body := jsonb_build_object('mode', 'run')
  );
  $cron$
);

-- 停用排程：select cron.unschedule('closing-reminder-2130tpe');
