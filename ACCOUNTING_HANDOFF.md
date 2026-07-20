# 記帳 / 代墊 / 收款功能 — 開發交接記錄

> 最後更新：2026-07-20（前端 UI 全部完成、本機 build 通過）
> 分支：`feat/accounting`（尚未 commit、尚未 push、尚未在 Supabase 執行 SQL）
> 完整設計計畫：`C:\Users\USER\.claude\plans\immutable-waddling-wadler.md`

## 目前狀態：✅ 程式全部完成，等「上線前手動設定」

所有畫面、推播 script、排程 workflow 都已完成，`pnpm build` 靜態匯出通過、TypeScript 無錯誤。
接下來只剩下面「上線前的手動設定」（在 Supabase 執行 SQL、開權限、建帳戶）。

### ✅ 本次新增完成的檔案
| 檔案 | 內容 |
|---|---|
| `src/lib/accounting.ts` | 追加：todayISO/startOfWeek、代墊/收款/分錄/轉帳/帳戶/類別/成員的寫入 helper |
| `src/components/accounting/Reimbursements.tsx` | 代墊分頁（申請/收據/核准/退回/付款，含 RejectModal、PayModal） |
| `src/components/accounting/Collections.tsx` | 收款分頁（申報/收據/確認入帳/退回） |
| `src/components/accounting/Ledger.tsx` | 流水帳（分錄時間軸＋帳戶/類別篩選＋手動記帳＋內部轉帳） |
| `src/components/accounting/Dashboard.tsx` | 彙總首頁（管理者：待核准/每人應付/待確認收款/帳戶餘額/淨額提示；負責人：個人待辦） |
| `src/components/accounting/Settings.tsx` | 設定（帳戶＋期初/主帳戶、類別、成員 can_accounting 開關） |
| `src/components/accounting/AccountingApp.tsx` | 外殼：頂欄＋分頁切換＋紅點徽章 |
| `src/app/page.tsx` | 加入記帳模組切換（can_accounting‖is_admin 可進） |
| `src/components/AdminDashboard.tsx`／`ScheduleApp.tsx` | 頂欄各加「💰 記帳」切換鈕 |
| `scripts/send-accounting-notify.mjs` | 待辦推播（管理者待核准/待付款/待確認；負責人待補件/待補收據） |
| `.github/workflows/accounting-notify.yml` | 排程（每週一、四 09:00 台北） |

## （歷史）先前已完成的地基
（以下為 7/19 完成的資料層與共用元件，維持不變）

### ✅ 已完成的檔案
| 檔案 | 內容 | 狀態 |
|---|---|---|
| `supabase/accounting_schema.sql` | 全部資料表、RLS、觸發器、Storage bucket、初始類別 | **完成** |
| `src/lib/useAuth.ts` | Teacher 型別加 `can_accounting`，登入時一起讀 | 完成（已改） |
| `src/lib/accounting.ts` | 型別、金額/日期格式、收據上傳/簽名網址、各種讀取查詢、內部轉帳 | 完成 |
| `src/components/accounting/ui.tsx` | 共用元件：Money / StatusPill / Card / Modal / 按鈕 / 輸入框 | 完成 |
| `src/components/accounting/useAccountingData.ts` | 共用資料 hook（一次載入全部 + refresh） | 完成 |
| `src/components/accounting/Receipts.tsx` | 收據上傳器 `ReceiptInput` + 唯讀顯示 `ReceiptLinks` | 完成 |

### ⬜ 明天要做的檔案（照順序）
1. `src/components/accounting/Reimbursements.tsx` — **代墊分頁（核心）**
   - 負責人：新增申請（>2000 自動走事前申請）、上傳收據、把已核准的標成「待付款」、看自己的單、可刪未付款的。
   - 管理者：核准/退回、逐筆勾選付款（選付款帳戶）、看全部。
   - 狀態文字用 `REIMB_STATUS_LABEL`；金額門檻用 `APPROVAL_THRESHOLD`（2000）。
2. `src/components/accounting/Collections.tsx` — 收款分頁（代墊的鏡像：收款→管理者確認入帳，選錢放哪個帳戶）。
3. `src/components/accounting/Ledger.tsx` — 流水帳（`entries` 時間軸，可篩帳戶/類別/日期）。
4. `src/components/accounting/Dashboard.tsx` — **本週彙總首頁**：待核准數、待付款清單（自動彙總每人應付）、待確認收款、各帳戶餘額、宇群↔主帳戶淨額、紅點徽章。
5. `src/components/accounting/Settings.tsx` — 管理者設定：帳戶（新增/期初餘額/換主帳戶負責人）、類別、成員 `can_accounting` 開關。
6. `src/components/accounting/AccountingApp.tsx` — 外殼：頂欄 + 分頁切換（彙總/代墊/收款/流水帳/設定），用 `useAccountingData`，把資料與 `refresh` 傳給各分頁。
7. `src/app/page.tsx` — 讓 `can_accounting || is_admin` 的人能進記帳模組。**待決定**：宇群是 admin，目前登入直接進排課後台（AdminDashboard）。要加一個切換入口讓他能進「記帳」；建議在 AdminDashboard 和 AccountingApp 頂欄各放一個切到對方的按鈕，或 page.tsx 用一個 module 狀態切換。奕寬/美君非 admin，登入後要能選「排課」或「記帳」。
8. `scripts/send-accounting-notify.mjs` — 推播（複製 `scripts/send-reminders.mjs` 樣式，用 service role + web-push + `push_subscriptions`）：偵測待核准/待付款 → 推給對應對象。
9. `.github/workflows/accounting-notify.yml` — 排程（仿 `.github/workflows/reminders.yml`，secrets 已有 VAPID_*／SUPABASE_SERVICE_ROLE_KEY）。
10. `public/sw.js`（選配）— 通知點擊網址可留 `/xuqu-schedule/`，或日後帶記帳深連結。

## 關鍵設計決策（都跟宇群逐題確認過）
- **併入現有 `xuqu-schedule`，對其他老師隱形**：靠 `teachers.can_accounting` + `can_accounting()` RLS 函式，其他老師前端看不到、後端也擋。
- **角色**：管理者=宇群（`is_admin`，核准/付款/管設定）；負責人=奕寬、美君（提交自己的代墊/收款、上傳收據）。
- **代墊 >2000 事前授權**：資料庫觸發器 `acc_reimb_guard` 強制；未達門檻直接進「待付款」。
- **每週逐筆勾選付款 + 可退回**；付款/確認時觸發器自動在流水帳產生分錄（不靠前端）。
- **多帳戶追蹤餘額 + 內部轉帳**（美君主帳戶/宇群帳戶/教室現金/櫃台零用金都是「帳戶」）。
- **收支分類可自訂、收據上傳存 Supabase Storage、App 推播+站內紅點、首頁本週彙總頁**。
- 技術限制：純靜態匯出（GitHub Pages），執行期無伺服器 → 前端直連 Supabase，安全全靠 RLS + 觸發器。

## 資料庫重點（給接手者）
- 餘額唯一真實來源＝`acc_entries`（收入正/支出負），檢視 `acc_account_balances`＝期初+合計。
- 代墊付款：把 `acc_reimbursements.status` 改 `paid` 且填 `paid_account_id` → 觸發器自動產生支出分錄；退回 paid 會刪掉分錄。
- 收款確認：`acc_collections.status` 改 `confirmed` 且填 `held_account_id` → 自動產生收入分錄。
- 非管理者無法自己核准/付款/確認（觸發器 raise exception）。

## 明天恢復開發的步驟
1. 進到 `D:\序曲音樂學院\系統建置資料\記帳`，目前在 `feat/accounting` 分支。
2. 繼續做上面「⬜ 明天要做的檔案」清單（從 Reimbursements 開始）。
3. UI 全部完成後：`pnpm install` → `pnpm dev` 本機測試（見計畫檔的驗證章節）。

## 上線前的手動設定（等程式完成後）
- 到 Supabase SQL Editor 執行 `supabase/accounting_schema.sql`。
- 把宇群/奕寬/美君三人的 `teachers.can_accounting` 設為 `true`（宇群本來就 is_admin）。
- 在「設定」頁建立實際帳戶與期初餘額、指定主帳戶負責人。
- GitHub 加排程 workflow（VAPID 等 secrets 已存在）。
