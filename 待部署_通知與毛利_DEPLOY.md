# 部署指南：通知中心 + 代收代墊即時 + 學費同步 + 學生毛利

> 撰寫 2026-08-04。本次四項需求的部署步驟。程式已寫好並通過 build，
> 但**資料庫 migration** 與 **Edge Function** 需要你在 Supabase 後台操作
>（此環境只有公開 anon 金鑰，無法由 Claude 代為部署）。

## 一次做完的順序
1. 跑 3 個 SQL migration
2. 部署 Edge Function `send-push` + 設 3 個密鑰
3. `git push`（前端自動部署）
4. 手機測通知

---

## 步驟 1：Supabase SQL Editor 跑 migration
Supabase 專案 → 左側 **SQL Editor** → 各貼一次、Run（可重複執行、不會壞資料）：

- `supabase/notifications_schema.sql` — 通知紀錄表 `notification_log`
- `supabase/profit_schema.sql` — 老師成本設定 `teacher_cost_config`、
  當月時數 `teacher_monthly_hours`、固定開銷 `biz_settings`（預設 80000）

（學費同步不需要新表，沿用既有 `student_fee_records`。）

## 步驟 2：部署 Edge Function `send-push`
手動發送與代收代墊即時通知都靠它（持有 VAPID 私鑰）。

**方式 A｜Supabase 後台（不用裝任何東西，推薦）**
1. Supabase 專案 → **Edge Functions** → **Create a function** → 命名 `send-push`
2. 把 `supabase/functions/send-push/index.ts` 內容整段貼上 → **Deploy**
3. 進 `send-push` → **Secrets**（或 Project Settings → Edge Functions → Secrets）
   新增這 3 個（`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` 平台會自動注入，不用設）：

   | 名稱 | 值 |
   |---|---|
   | `VAPID_PUBLIC` | 與 GitHub Actions 同一把公鑰（`BC5MFL2T…`，見 `src/lib/push.ts`）|
   | `VAPID_PRIVATE` | 與 GitHub Actions 同一把私鑰（就是 GitHub Secrets 裡的 `VAPID_PRIVATE`）|
   | `VAPID_SUBJECT` | `mailto:overtureacademyofmusic@gmail.com` |

**方式 B｜CLI**（本機需登入 Supabase）
```bash
supabase functions deploy send-push
supabase secrets set VAPID_PUBLIC=... VAPID_PRIVATE=... VAPID_SUBJECT=mailto:overtureacademyofmusic@gmail.com
```

> VAPID 這對公私鑰**沿用你 GitHub Actions 裡那對**（不要另外產生），否則已訂閱的手機會對不上。

## 步驟 3：部署前端
```bash
git add -A && git commit -m "通知中心＋代收代墊即時＋學費同步＋學生毛利" && git push
```
GitHub Actions 會自動 build 部署到 GitHub Pages。

## 步驟 4：手機測試
- 後台（管理員）→ **🔔 通知中心** → 對象選「只發給自己（測試）」→ 立即發送 → 手機應跳通知，下方「過往通知紀錄」出現一筆。
- 找一位負責人帳號新增一筆代收/代墊 → 宇群手機應即時跳「代收代墊待處理」。

---

## 各功能對應檔案（維護用）
| 需求 | 檔案 |
|---|---|
| ①手動發送＋過往紀錄 | `notifications_schema.sql`、`functions/send-push/`、`src/lib/notify.ts`、`src/components/NotificationCenter.tsx`（掛在 `AdminDashboard`）、3 支 `scripts/*.mjs` 補寫 log |
| ②代收代墊即時通知 | `Collections.tsx` / `Reimbursements.tsx` 建立後呼叫 `notifyAccountingSubmit()` |
| ③學費同步 | `Ledger.tsx` 的 `EntryModal`：類別＝學費時出現學生 typeahead，存檔同時 `createFeeRecord()`（兩邊各自獨立，刪除不連動） |
| ④分類＋毛利 | `StudentsApp.tsx`（6 種檢視、家庭標籤改學生名）、`ProfitPanel.tsx`、`src/lib/profit.ts`、`profit_schema.sql` |

## 已知前提 / 待補
- **8 月沒收到排課通知**：原設計排課提醒**只發非管理員老師**（`send-reminders.mjs`），宇群(admin)本來就不在收件名單；且過去沒有發送 log 可查。現在起「通知中心」可手動補發、之後所有發送都會留紀錄。若要月排課自動也通知宇群，跟我說我把 admin 加進收件對象。
- **鐘點制老師的毛利**：需要在「⚙ 成本設定」填該老師**當月時數**才算得出成本；拆帳制老師只要填抽成%。每生毛利對鐘點老師是「依收入占比分攤」的近似值。
- **毛利面板僅管理員可見**（RLS + 前端雙重把關）。
