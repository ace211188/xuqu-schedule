# 序曲排課收集 — 交接文件

> 給下一個對話 / 未來的你。這是**獨立小工具**，跟主 Overture 系統無關。
> 使用者是序曲音樂學院經營者（非工程師），請用繁體中文、白話說明。

## 一句話現況

線上「老師每月排課收集」工具，**已上線給老師實際使用**。老師用手機填每月可排課／在序曲上課的時段，管理員（經營者）彙整。已完成：登入、填表（電腦週表＋手機一次一天）、雲端自動存、管理員儀表板、備註、每兩週推播提醒、PWA、背景音樂、個性化問候、開場動畫。

## 網址 / 原始碼 / 部署

- **線上網站**：https://ace211188.github.io/xuqu-schedule/
- **原始碼**：https://github.com/ace211188/xuqu-schedule （分支 `main`）
- **部署方式**：改完 **push 到 main → GitHub Actions 自動建置並部署**（約 1–2 分鐘後線上更新）。不用手動做任何事。
  - 部署設定：`.github/workflows/deploy.yml`（Next 靜態輸出 out/ → GitHub Pages）

## 帳號 / 密碼

- 用 **`admin`** 登入後，最上方「🔑 老師帳號密碼一覽」可查**所有老師帳密**（只有管理員看得到）。
- 忘記 admin 密碼：問 Claude（存在記憶），或去 Supabase 後台 Authentication 重設。

## 技術棧 / 本機開發

- Next.js 16（App Router）**靜態輸出** + Tailwind v4 + TypeScript + Supabase
- 本機跑起來：
  1. `pnpm install`（本機 D 槽是 exFAT，已設 `.npmrc` 的 `node-linker=hoisted`，別刪）
  2. 需要 `.env.local`（Supabase 網址 + anon key）→ 複製 `.env.local.example` 改值；找不到值問 Claude
  3. `pnpm dev`（script 已設 `next dev --webpack`，exFAT 需要）→ 開 http://localhost:3000
- 建置：`pnpm build` → 產出 `out/`（純靜態）

## 後端 Supabase（獨立專案）

- 專案 ref：`gffemhrthwdnajdpkwsq`
- 資料表：
  - `teachers` — 老師（name、is_admin）
  - `schedule_slots` — 每格排課（teacher_id、month、day、slot、state）
  - `monthly_meta` — 每月備註 + 最後更新時間（confirmed_at）
  - `push_subscriptions` — 推播訂閱
  - `teacher_credentials` — 帳密（明文，**只有管理員 RLS 可讀**，供忘記時查）
- 建表 SQL 都在 `supabase/*.sql`
- 金鑰：**anon key**（公開安全）在 `.env.local` 與部署 workflow；**service_role / DB 密碼**只在本機或 GitHub Secrets，不在原始碼。

## 提醒推播

- **自動**：每月 **1 號、15 號** 早上 10:00 發送（`.github/workflows/reminders.yml` 的 cron）
- **手動發送/測試**：GitHub → 該 repo → **Actions → 「排課提醒推播」→ Run workflow**，`mode` 選：
  - `test` = 測試通知
  - `biweekly` = 正式「請確認/更新排課」提醒
- 發送邏輯：`scripts/send-reminders.mjs`（下個月為目標；有寫備註者訊息會多提醒檢查備註）
- VAPID 私鑰、service_role 存 **GitHub → Settings → Secrets and variables → Actions**

## 主要檔案地圖

- `src/app/page.tsx` — 登入判斷：未登入→Login、admin→AdminDashboard、老師→ScheduleApp
- `src/app/layout.tsx` — 全站外框、PWA/圖示 metadata、背景音樂、加到主畫面提示
- `src/components/Login.tsx` — 登入頁 + 開場動畫（Splash）
- `src/components/ScheduleApp.tsx` — 老師填課（電腦週表 / 手機一次一天、備註、送出、音符動畫、自動訂閱推播）
- `src/components/AdminDashboard.tsx` — 管理端（誰填了、時數統計、唯讀週表、備註、帳密一覽）
- `src/components/BgmPlayer.tsx` — 背景音樂（右下 🎵）
- `src/components/PwaRegister.tsx` — 註冊 service worker、加到主畫面提示
- `src/lib/schedule.ts` — 週表設定（**營業時間、半小時、顏色**）
- `src/lib/greeting.ts` — 個性化問候（分性別/個人/時段、隨機）
- `src/lib/push.ts` — 推播訂閱（含 VAPID 公鑰）
- `src/lib/supabase.ts`、`src/lib/useAuth.ts` — 連線、登入
- `public/` — `logo-*.png`、`icon-*.png`、`apple-touch-icon.png`、`bgm.mp3`、`manifest.webmanifest`、`sw.js`

## 常見想改的地方 → 改哪裡

- 營業時間 / 兩種狀態顏色 → `src/lib/schedule.ts`（`DAYS`、`STATE_STYLE`）
- 問候語內容 → `src/lib/greeting.ts`
- 提醒文字 / 頻率 → `scripts/send-reminders.mjs` / `.github/workflows/reminders.yml`
- 換背景音樂 → 換掉 `public/bgm.mp3`（同檔名）
- 換 logo / App 圖示 → 換 `public/logo-mark.png`，再用 sharp 重產 `icon-192/512`、`apple-touch-icon`（做法問 Claude）
- 加/刪老師 → Supabase Authentication 建帳號 + `teachers`、`teacher_credentials` 各補一列

## 注意事項（踩過的雷）

- **iPhone 圖示更新**：已加到主畫面的 App 圖示會被 iOS 快取，要看到新圖示得**刪掉桌面 App 再重新加一次**。
- **iOS 推播/通知**：只有從**桌面 App 圖示**打開才有效，Safari 分頁不行；且要在 App 內允許通知一次。
- **背景音樂**：用「切靜音」不用「暫停」（iOS 暫停後 play() 會被擋）。
- **預設月份 = 下個月**（上課月）；每月會**自動帶入上個月排課當草稿**，老師要按「更新」才算這個月確認過（管理員看得到最後更新時間）。
- **換電腦**：`git clone` 就有程式；`.env.local` 要重建（anon key）；資料是雲端 Supabase，跨機器共用。
- Windows/exFAT：git 需 `git config --global --add safe.directory <專案路徑>`；push 用系統快取的 GitHub 憑證。

## 還沒做（想加再說）

- 匯出 Excel / PDF（管理端彙整）
- 老師自己改密碼
- 確認「上課月」語意是否要改成當月
