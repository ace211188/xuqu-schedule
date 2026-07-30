# 待開發：學生資料卡（管理員新分頁「學生資料」）

> 撰寫 2026-07-29（Claude，與使用者逐題確認完）。給換電腦後接手開發用。
> 專案：`xuqu-schedule`（Next.js 靜態匯出 → GitHub Pages、Supabase 後端、RLS+觸發器、pnpm v10）。
> ⚠️ 這是**獨立功能**：跟「記帳」模組、跟「Overture」系統**都不連動、不同步**。

---

## 一、目標
取代目前的**紙本 + 簡陋 Excel**，記錄序曲**所有學生**的狀態／收費／優惠／來源。**馬上要上線用**。三個核心痛點：
1. 學生轉方案（單一樂器 ↔ 雙軌）後，要知道**下次該收多少**。
2. 收費時要能查**這學生上次收了什麼**（以免收錯）。
3. 優惠（口碑介紹）要記清楚，收費時看得到。

## 二、需求決策彙總（皆已與使用者確認）

| 項目 | 決策 |
|---|---|
| 放哪 | 排課後台（`AdminDashboard`）新開分頁「**學生資料**」。**不放進記帳模組、不與其連動** |
| 誰能看 | 宇群(admin)、奕寬、美君 三人 |
| 誰能改 | 同上三人可**新增/修改**；**刪除限管理員(宇群)** |
| 學生↔家庭 | **一生一卡**，但要能**依家庭**檢視（家庭歸群＝家長姓名＋電話，見資料模型 A 方案） |
| 狀態 | 5 種：①完成免費測驗 ②完成試上 ③付定金 ④在學(正式報名) ⑤暫停。**要能一鍵「推進到下一階段」** |
| 收費 | **收費紀錄清單（歷史，B 方案）** ＋ 一個醒目「目前方案」；**下次預設＝上次**，實際收費時再新增一筆紀錄。**系統不算錢**，金額/方案都手填 |
| 訂金 | 記金額（純註記文字），**不進記帳** |
| 優惠 | **純文字備註**（不結構化）。口碑介紹：舊生介紹新生→舊生 −1000、新生 −500（寫在備註即可） |
| 來源 | 新增「來源」欄：FB廣告／路過／舊生介紹…；若＝舊生介紹，**連到那位舊生（介紹人）** |
| 介紹人連結 | **要**（在學生資料內部連到舊生）。使用者說的「不連結」＝不要跨模組(記帳/排課)連，不是這裡 |
| 分類/篩選 | 依**課程種類**分類（沿用：一對一樂器／一對一樂理／雙軌團班／雙軌精緻班／學齡前律動／兒音／音樂遊戲探索），不要更粗 |
| 名單 | Claude **匯入既有真實名單當底**（來源：Overture DB + 簽到表整理的 ~30+ 位） |
| 平台 | 手機要好用 |

## 三、資料模型（Supabase，新增 2 張表）

### 表 `students`
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk default gen_random_uuid() | |
| name | text not null | 姓名 |
| nickname | text | 暱稱 |
| guardian_name | text | 家長姓名 |
| guardian_phone | text | 家長電話（＋姓名＝家庭歸群 key） |
| course_type | text | 課程種類（上列 7 種，前端下拉） |
| instrument | text | 樂器／科目（鋼琴/小提琴/長笛/樂理…） |
| teacher | text | 老師（先存文字；或 FK `teachers.id`，見開放問題） |
| class_slot | text | 班別／時段（例：週六16:00） |
| status | text not null default '完成免費測驗' | 5 種狀態之一 |
| deposit_amount | numeric | 訂金金額（nullable，純註記） |
| deposit_note | text | 訂金備註 |
| current_plan | text | 目前收費方案＋金額（醒目顯示；預設帶最近一筆 fee record） |
| discount_note | text | 優惠備註（自由文字） |
| source | text | 來源（FB廣告/路過/舊生介紹…） |
| referrer_student_id | uuid | 介紹人（FK → students.id，nullable） |
| notes | text | 自由備註 |
| created_at | timestamptz default now() | 建立日期 |
| updated_at | timestamptz default now() | 最近更新日期（觸發器自動更新） |

### 表 `student_fee_records`（收費紀錄／歷史）
| 欄位 | 型別 | 說明 |
|---|---|---|
| id | uuid pk | |
| student_id | uuid not null | FK → students.id (on delete cascade) |
| charged_on | date not null | 收費日期 |
| plan | text | 方案名稱 |
| amount | numeric | 金額 |
| note | text | 備註 |
| created_at | timestamptz default now() | |

- **「下次該收多少」＝ 該生 `student_fee_records` 最新一筆**（前端把最新一筆當預設帶出）。新增收費時可「沿用上次」一鍵帶入再改。
- `students.current_plan` 為手填快速欄，方便列表一眼看到目前方案；收費紀錄才是歷史真實。

### 家庭歸群（A 方案）
以 `(guardian_name, guardian_phone)` 相同者視為同一家庭。列表提供「**依家庭檢視**」把同家庭的卡片聚在一起（例：曾亭茵→高睿辰+高維劭；曾巧芳→趙梓涵+趙翊丞）。不另建 family 表，用查詢 group 即可。

## 四、權限（RLS）
沿用記帳的模式，**新增旗標 `teachers.can_students boolean default false`**（不要複用 can_accounting，語意分開），設 宇群/奕寬/美君 = true。
- SELECT / INSERT / UPDATE：`is_admin() OR can_students()`（三人）。
- DELETE：**`is_admin()` only**（限宇群）。
- `student_fee_records` 跟隨 `students` 同權限。
- 靜態站無伺服器，安全全靠 RLS + 觸發器（同記帳）。`updated_at` 用 BEFORE UPDATE 觸發器維護。

## 五、頁面與 UI（`src/components/students/`，新分頁掛進 AdminDashboard 頂欄）
- **列表頁**：依「課程種類」分組；搜尋（姓名/暱稱/家長/電話）；篩選（狀態、老師、課程種類）；切換「一般列表 ↔ 依家庭檢視」。手機為緊湊卡片列表（參考記帳 Ledger 的手機做法）。
- **學生卡（新增/檢視/編輯）**：上述所有欄位；
  - **狀態列**：顯示目前狀態 + 「✓ 推進到下一階段」按鈕（依序 免費測驗→試上→付定金→在學；「暫停」為手動切換的側狀態，不在自動推進鏈上）。
  - **收費紀錄區**：歷史清單（日期/方案/金額/備註）＋「新增收費（沿用上次）」；最新一筆醒目標為「目前」。
  - **訂金**：金額 + 備註。
  - **優惠備註**、**來源**（來源＝舊生介紹時，出現「介紹人」選擇器連到另一位 student，並可提示 −1000/−500）。
  - 顯示 建立日期 / 最近更新日期。
- **刪除**：只有 admin 看得到刪除鈕（RLS 也擋）。
- 全部尊重 `prefers-reduced-motion`、手機優先（專案慣例）。

## 六、匯入名單（Claude 於開發時產生 seed）
來源＝Overture DB + 已判讀簽到表整理出的 ~30+ 位真實學生。已知部分屬性（姓名／課程種類／樂器／老師／部分家長）；**多數家長電話待補**（使用者之後填）。已知家庭：曾亭茵→高睿辰+高維劭、曾巧芳→趙梓涵+趙翊丞、陳允婷→李依恩、游雅云→許亦岑。狀態預設「在學」（新生另設）。實際 seed 於開工時用 service_role 一次性腳本寫入（同記帳慣例，用完即刪）。

## 七、技術注意
- 純靜態匯出：前端直連 Supabase，**先在 Supabase SQL Editor 跑 migration，再 push 部署**（新欄位/表不存在會 insert 失敗）。
- pnpm 固定 v10；CI 只跑 build 不跑 lint。
- `.env.local` 有 anon key（git 忽略）；service_role 金鑰在本機 `.env.local`，可跑一次性管理腳本。
- 驗證：因無法本機登入 Supabase，沿用「臨時預覽頁掛假資料」方式（`src/app/preview-tmp/`），驗證後刪除。

## 八、待確認／開放問題（開工前或過程中問使用者）
1. **老師欄**存文字還是連 `teachers`？（Overture 老師與此站 teachers 不完全同步；建議先存文字，之後要統計再正規化。）
2. **狀態推進**：「暫停」之後能不能復課回「在學」？（假設可以，暫停↔在學互切。）
3. **收費紀錄**要不要記「收款人/收款方式」？（目前規格只有 日期/方案/金額/備註，因你說不跟記帳連。）
4. 匯入時**要不要包含已結束/流失的舊生**？（目前只匯在學＋進行中；你 Q9 未明確要結束者。）

## 九、換電腦後開工步驟
1. `cd` 到 `記帳`（xuqu-schedule）repo，`git pull`（拿本規格）。
2. 依序：①寫 `supabase/students_schema.sql`（2 表＋RLS＋can_students 旗標＋updated_at 觸發器）→ 貼 Supabase SQL Editor 執行 ②`src/lib/students.ts`（型別＋讀寫 helper）③`src/components/students/`（列表＋卡片）④掛進 `AdminDashboard` 頂欄分頁 ⑤設三人 `can_students=true` ⑥產生並匯入 seed 名單。
3. `pnpm dev` 本機測 UI（假資料預覽頁）；`pnpm build` 過；commit → push（main，自動部署）。
