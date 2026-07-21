# 記帳 / 代墊 / 收款功能 — 開發交接記錄

> 最後更新：2026-07-21（效能優化＋修正「金額顯示不出來」＋新增總額顯示）
> 分支：`main`（已 commit + push + 自動部署；Supabase schema 已執行）
> 線上：https://ace211188.github.io/xuqu-schedule/
> 完整設計計畫：`C:\Users\USER\.claude\plans\immutable-waddling-wadler.md`
> 最新變更紀錄請見本檔最下方「## 變更紀錄」。

## 目前狀態：✅ 已上線運作中

所有畫面、推播 script、排程 workflow 完成並部署；Supabase schema／權限／帳戶／分類都已設定。

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

## 上線前的手動設定（已完成）
- ✅ Supabase SQL Editor 執行 `supabase/accounting_schema.sql`（含 teachers 管理者 update 政策、初始帳戶/權限）。
- ✅ 宇群/奕寬/美君 `can_accounting=true`；宇群另設 `is_admin=true`（獨立於既有「管理員」帳號）。
- ✅ 分類改為：收入=學費/教材教具/場地租借/其他；支出=固定/行政/行銷/其他（`accounting_categories_extra.sql` 為早期版本，最終以此為準）。
- ⬜ 帳戶「期初餘額」宇群需在「設定」頁填成目前實際金額（未匯入 2026 歷史明細）。

## 變更紀錄

### 2026-07-21（匯入七月歷史明細）
- **匯入七月流水帳**：把 `序曲2026帳務 - 7月.csv`（44 筆；六月結轉 85,636 → 月底 226,522，逐列對帳無誤）匯入 `acc_entries`。
- **決策：全部記到「教室現金」一本**。CSV 是單一流水帳（不分帳戶），宇群選最簡單方式先匯入，之後可再按項目細分到各帳戶。
- **不重複計算的做法**：4 個帳戶的期初原本剛好加總 = CSV 月底 226,522。規則＝`新期初 = 舊期初 − 該帳戶新分錄淨額`，讓 4 個帳戶餘額維持不動。
  - 結果：**教室現金 `opening_balance` 被設成負數 −127,269（刻意，非 bug）**＝ 13,617 − 七月淨額 140,886；其餘 3 個帳戶期初不變。
  - 匯入後總額 226,322（＝ 226,522 − 先前那筆 7/21 垃圾袋 −200，該筆保留）。四個帳戶餘額：美君主帳戶 184,778／宇群帳戶 23,127／教室現金 13,417／櫃台零用金 5,000。
- **新增兩個支出類別**：`鐘點支出`、`教材支出`（CSV 有、軟體原本沒有）。CSV 中種類空白的垃圾袋列歸到「行政支出」。
- **待辦/提醒**：因為全記在教室現金，房租/薪資/學費/宇群增資等在流水帳都顯示為「教室現金」進出，看不出實際走哪個帳戶；日後若要細分需按項目重新分配帳戶。
- 匯入以 service_role 一次性 node 腳本執行（用完即刪）；CSV 檔未納入 git 追蹤。

### 2026-07-21（效能優化 + 修正金額顯示不出來 + 新增總額）

在新電腦（`C:\Users\user\Desktop\宇群AI\排課記帳系統\xuqu-schedule`）clone 後進行。起因：宇群回報記帳模組「超卡頓」，以及「彙總與流水帳都看不到總額」。

#### 🐛 根本原因：金額被動畫吃掉（重要）
`CountMoney` 的數字 count-up 動畫是用 `requestAnimationFrame` 逐幀改寫 `textContent`，
等於**「金額正不正確」取決於動畫有沒有跑完**。rAF 在背景分頁、省電模式、部分手機瀏覽器
會被節流甚至完全不觸發 → 文字永遠停在動畫起點（通常是 0），畫面上等同看不到金額。
實測（假資料預覽頁）重現：流水帳表格內是 `$98,200`，上方餘額卻顯示 `$0`。

**修法：拿掉數字跳動動畫，金額改由 React 直接渲染。** 金額是資料不是裝飾，任何情況下
都必須正確。順帶也省掉每秒 60 次 DOM 寫入。`CountMoney` 元件與呼叫端 API 保留不變
（`duration` 參數標為 deprecated），日後若要加回動畫，必須確保「動畫失效時數字仍正確」。

#### ⚡ 效能（卡頓）
| 問題 | 修法 |
|---|---|
| 背景粒子 16 顆無限動畫、帶永久 `will-change`，且蓋在會隨內容長高的 `<main>` 上 | 改 `position: fixed` 視窗大小圖層 + `contain: strict`；移除永久 `will-change`（動畫中瀏覽器本就會自動提升圖層）；16→8 顆；手機／低階機（`hardwareConcurrency<=4`）不渲染 |
| `useCountUp` 每幀 `setState`，每秒觸發 60 次 React 重繪 | 連同動畫一併移除（見上） |
| `Ledger` 手機列表與桌機表格**兩套 DOM 同時渲染**、只用 CSS 藏一套 | 用 `useIsMobile()` 只渲染需要的那套，DOM 節點減半 |
| 流水帳一次渲染全部分錄；搜尋每個按鍵重算重畫全表 | 每批 80 筆 +「載入更多」；搜尋改 `useDeferredValue`；畫面外的列用 `content-visibility: auto` 跳過排版繪製 |
| 彈窗 `backdrop-blur`（手機掉幀元凶） | 移除（原本只有 1px，視覺上幾乎無感） |
| `useAccountingData` 每次 render 回傳新物件，讓下游所有 `useMemo` 失效 | 用 `useMemo` 記憶化；`LedgerTable` 加 `memo` + `onDelete` 用 `useCallback` 穩定 |
| `acc-hover` 在觸控裝置也掛 hover 轉場 | 包進 `@media (hover: hover)` |

#### ✨ 新增：總額顯示（三處，皆已實測驗證）
1. **總餘額（所有帳戶加總）** — 彙總頁「各帳戶餘額」上方大字卡；流水帳標題列新增「總」膠囊，與單一帳戶餘額並列。轉帳在帳戶間互抵，故直接加總即為機構總資金。
2. **記一筆／轉帳即時試算** — 記一筆顯示「目前餘額 → 這筆 → 存檔後餘額」，打字即時更新，存檔後為負會標紅；轉帳顯示兩邊帳戶各自的「轉帳前 → 轉帳後」。
3. **流水帳收支合計** — 帳戶層級「共 N 筆 · 收 · 支」；搜尋結果頂端「符合筆數 · 收 · 支 · 淨額」。

#### 🔧 本機環境
- 已安裝 pnpm，**刻意固定在 v10** 對齊 CI（`pnpm/action-setup@v4` version: 10）。pnpm 11 會對 `pnpm-workspace.yaml` 的 `ignoredBuiltDependencies` 要求互動式確認而中斷安裝。
- `.env.local` 已建立（值取自 `deploy.yml` 內本來就公開的 anon key，該檔在 `.gitignore` 內）。
- `.claude/launch.json` 已在**上層目錄**建立（dev server 指令為 `pnpm -C xuqu-schedule dev`）。

#### ⚠️ 已知狀態 / 待辦
- `pnpm lint` 有 **18 個既有問題**（16 error + 2 warning），本次改動前後數量相同，**非本次造成**。多為 React Compiler 的 `set-state-in-effect` 規則，散落在 8 個檔案。CI 只跑 `build` 不跑 `lint`。
- **負責人（非 admin）身分的彙總頁完全沒有任何餘額區塊** —— 餘額只存在於管理者專屬的 `AdminSummary`。若日後要讓負責人看到金額，需一併處理 Supabase RLS（`acc_account_balances` 檢視的讀取權限）。
- 承 7/20：`_tmp_user.mjs` 從 git 歷史徹底清除（force-push）**仍未執行**。
- 驗證方式：本次用臨時預覽頁 `src/app/preview-tmp/page.tsx` 掛假資料實測 UI（因無法登入 Supabase），**驗證後已刪除**。日後若要再驗證可比照辦理。

### 2026-07-20（上線後多輪 UX 迭代）
- **上線**：合併到 `main` → GitHub Actions 部署到 GitHub Pages（期間遇 GitHub Actions 全球故障，排隊後成功）。
- **角色**：`teachers` 缺 update 政策會讓設定頁開關失效 → 補管理者 update RLS。發現另有獨立「管理員」帳號；將「宇群」帳號設為 `is_admin` 使其同時具管理員＋一般老師(代墊/收款)功能。
- **導覽**：宇群登入**預設進記帳**；記帳/排課後台/我的排課三者可互相切換（`page.tsx` view 狀態 + 各頁頂欄切換鈕）。純排課的「管理員」帳號仍預設進排課後台。
- **流水帳改版**（管理員專屬，避免負責人看到薪資）：依月份分組、本月預設展開；桌機為 日期/項目/收入/支出/餘額 表，**手機改為緊湊列表**（不左右捲）；餘額用權威餘額往回推算。記一筆（含「存並再記一筆」）＋內部轉帳。
- **月結報表**（新分頁「月結」）：選月份 → 總收入/支出/淨額、分類長條圖、期末各帳戶餘額。`scripts/send-monthly-report.mjs` + `.github/workflows/accounting-monthly.yml` 每月 5 號推播上月摘要。
- **動效**：背景漂浮粒子、標題逐字浮現、數字 count-up、卡片浮起、動畫式下拉選單 `Select`、彈窗滑入、長條圖生長、分頁淡入（全部尊重 prefers-reduced-motion）。<br>※ 其中「數字 count-up」與部分粒子設定已於 2026-07-21 因效能與金額顯示錯誤而移除／調整，詳見上方 7/21 紀錄。
- **手機記一筆穩定化**：彈窗改整層可捲動、移除 autoFocus（避免鍵盤頂歪）；分類下拉自動判斷上下展開。
- **記一筆種類**：分類欄位改為**預設顯示且自動選好第一個**（依收/支別）。
- **安全**：一支臨時腳本 `_tmp_user.mjs`（含無效測試假密碼、帳號從未建立）誤入 commit，已從最新版移除；GitGuardian 曾告警。**待辦：從 git 歷史徹底清除（force-push）尚未執行——需宇群明確授權破壞性 git 操作。**
- **可直接操作 Supabase**：service_role 金鑰存於本機 `.env.local`（git 忽略、未上傳），可用一次性 node 腳本做管理操作（用完即刪）。

### 主要檔案（記帳模組，`src/components/accounting/`）
`AccountingApp.tsx`(外殼/分頁/粒子/標題) · `Dashboard.tsx`(彙總) · `Ledger.tsx`(流水帳) · `Monthly.tsx`(月結) · `Reimbursements.tsx`(代墊) · `Collections.tsx`(收款) · `Settings.tsx`(帳戶/類別/成員) · `ui.tsx`(共用元件＋動畫 `Select`) · `anim.tsx`(金額顯示/粒子/標題/Reveal/`useIsMobile`/`useLiteMotion`) · `Receipts.tsx` · `useAccountingData.ts`。資料層 `src/lib/accounting.ts`。
