# 序曲音樂學院 · 排課 ＋ 記帳系統（xuqu-schedule）

序曲音樂學院的內部營運工具，兩大模組合在同一個 App：

1. **排課收集** — 老師每月用手機填可排課／上課時段，管理員彙整。
2. **記帳 / 代墊 / 收款** — 管理員記帳、看流水帳與月結；老師申報代墊與收款、上傳收據，管理員核准／付款／確認入帳。

> 使用者是序曲音樂學院經營者（非工程師）。詳細說明與踩雷紀錄請看
> [`HANDOFF.md`](HANDOFF.md)（排課）與 [`ACCOUNTING_HANDOFF.md`](ACCOUNTING_HANDOFF.md)（記帳）。

## 線上網址 / 原始碼

- **線上網站**：https://ace211188.github.io/xuqu-schedule/
- **原始碼**：https://github.com/ace211188/xuqu-schedule （分支 `main`）

## 技術棧

- **Next.js 16**（App Router）＋ **靜態輸出**（`output: export`）
- **React 19** ＋ **Tailwind CSS v4** ＋ **TypeScript**
- **Supabase**（Postgres ＋ Auth ＋ Storage），安全全靠 **RLS ＋ 觸發器**
- **PWA**（可加到主畫面）＋ **Web Push** 推播
- 部署：**GitHub Pages**（純靜態，執行期無伺服器，前端直連 Supabase）

## 功能總覽

### 排課收集
- 老師登入後填每月排課（電腦＝週表、手機＝一次一天），雲端自動存
- 管理員儀表板：誰填了、時數統計、唯讀週表、每月備註、老師帳密一覽
- 每月 1 號 / 15 號自動推播提醒；PWA、背景音樂、個性化問候、開場動畫

### 記帳 / 代墊 / 收款（管理員 ＋ 指定成員）
- **多帳戶**（美君主帳戶 / 宇群帳戶 / 教室現金 / 櫃台零用金）餘額追蹤，內部轉帳
- **流水帳**：依月份分組、running balance；桌機表格、手機緊湊列表
- **月結報表**：每月總收入／支出／淨額、分類長條圖、期末各帳戶餘額
- **代墊**：老師先自墊 → 上傳收據 → 管理員逐筆核准／付款（>2000 需事前授權）
- **收款**：老師申報 → 管理員確認入帳並選擇錢放哪個帳戶
- 對其他老師隱形：靠 `teachers.can_accounting` ＋ `can_accounting()` RLS 函式
- 待辦推播（每週一、四）＋ 每月 5 號月結摘要

## 專案結構

```
src/
  app/            page.tsx（登入分流）、layout.tsx（PWA/音樂/metadata）、globals.css
  components/     Login、ScheduleApp（老師排課）、AdminDashboard（排課管理）
    accounting/   AccountingApp（外殼）、Dashboard、Ledger、Monthly、
                  Reimbursements、Collections、Settings、ui、anim、Receipts
  lib/            supabase、useAuth、schedule、greeting、push、accounting
supabase/         *.sql（建表、RLS、觸發器；記帳為 accounting_schema.sql）
scripts/          send-reminders / send-accounting-notify / send-monthly-report（.mjs）
.github/workflows deploy（部署）、reminders、accounting-notify、accounting-monthly
```

## 本機開發

```bash
pnpm install          # D 槽為 exFAT，已設 .npmrc 的 node-linker=hoisted，勿刪
# 建立 .env.local（Supabase 網址 + anon key；service_role 只放本機或 GitHub Secrets）
pnpm dev              # script 已設 next dev --webpack（exFAT 需要）→ http://localhost:3000
pnpm build            # 產出 out/（純靜態）
```

## 部署

改完 **push 到 `main` → GitHub Actions 自動建置並部署到 GitHub Pages**（約 1–2 分鐘，
`.github/workflows/deploy.yml`）。不用手動操作。

## 安全

- **anon key** 為公開安全，放在 `.env.local` 與部署設定；**service_role / DB 密碼**只在本機
  `.env.local`（git 忽略）或 GitHub Secrets，不進原始碼。
- 所有寫入由 Supabase **RLS ＋ 觸發器**把關（核准／付款／確認等金流邏輯不信任前端）。
