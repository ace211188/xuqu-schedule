"use client";

import { supabase } from "./supabase";

// ── 型別 ─────────────────────────────────────────────
export type AccountType = "bank" | "cash" | "petty";
export type CategoryKind = "income" | "expense";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  owner_teacher_id: string | null;
  is_main: boolean;
  opening_balance: number;
  sort_order: number;
  active: boolean;
};

export type AccountBalance = {
  id: string;
  name: string;
  type: AccountType;
  is_main: boolean;
  owner_teacher_id: string | null;
  balance: number;
};

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  sort_order: number;
  active: boolean;
};

export type EntrySource = "manual" | "reimbursement" | "transfer" | "collection";
export type Entry = {
  id: string;
  account_id: string;
  signed_amount: number;
  category_id: string | null;
  occurred_on: string;
  note: string | null;
  source_type: EntrySource;
  source_id: string | null;
  transfer_group: string | null;
  created_by: string | null;
  created_at: string;
};

export type ReimbStatus =
  | "pending_approval"
  | "approved"
  | "ready"
  | "paid"
  | "rejected";
export type Reimbursement = {
  id: string;
  requester_id: string;
  amount: number;
  category_id: string | null;
  description: string;
  occurred_on: string;
  needs_approval: boolean;
  status: ReimbStatus;
  receipt_paths: string[];
  reject_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  paid_account_id: string | null;
  paid_at: string | null;
  created_at: string;
};

export type CollectionStatus = "pending_confirm" | "confirmed" | "rejected";
export type Collection = {
  id: string;
  collector_id: string;
  amount: number; // 學生實際給的現金（含之後要找的零）
  category_id: string | null;
  description: string;
  occurred_on: string;
  held_account_id: string | null;
  student_id: string | null; // 學費可綁學生（連到學生名冊，選填）
  change_given: number; // 找零金額（0＝沒找零），確認入帳時從零用金扣
  change_account_id: string | null; // 找零從哪個帳戶出（零用金）
  status: CollectionStatus;
  receipt_paths: string[];
  reject_reason: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
};

export type PurchaseStatus = "pending" | "purchased" | "arrived" | "cancelled";
export type Purchase = {
  id: string;
  item_name: string;
  quantity: number;
  note: string | null;
  est_amount: number | null;
  actual_amount: number | null;
  image_paths: string[];
  category_id: string | null;
  requester_id: string;
  status: PurchaseStatus;
  reimbursement_id: string | null;
  purchased_by: string | null;
  purchased_at: string | null;
  arrived_at: string | null;
  cancel_reason: string | null;
  created_by: string | null;
  created_at: string;
};

// 超過此金額的代墊需事前申請核准（與資料庫觸發器一致）
export const APPROVAL_THRESHOLD = 2000;

// ── 代墊/代收清單：依「月＞週」分組（週＝當月 1-7/8-14/15-21/22-28/29+）──
export function weekOfMonth(day: number): number {
  if (day <= 7) return 1;
  if (day <= 14) return 2;
  if (day <= 21) return 3;
  if (day <= 28) return 4;
  return 5;
}

export type WeekGroup<T> = { key: string; label: string; items: T[] };

// 今天所屬的「年-月-週」key（清單預設展開本週用）
export function currentWeekKey(base = new Date()): string {
  const y = base.getFullYear();
  const m = base.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}-w${weekOfMonth(base.getDate())}`;
}

// 依 occurred_on（YYYY-MM-DD）分組；月新→舊、週大→小；組內順序沿用輸入
export function groupByWeek<T>(
  items: T[],
  getDate: (t: T) => string | null | undefined
): WeekGroup<T>[] {
  const map = new Map<string, WeekGroup<T>>();
  for (const it of items) {
    const raw = (getDate(it) ?? "").slice(0, 10);
    const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    let key: string;
    let label: string;
    if (!m) {
      key = "0000-00-w0";
      label = "（無日期）";
    } else {
      const y = Number(m[1]);
      const mo = Number(m[2]);
      const w = weekOfMonth(Number(m[3]));
      const start = (w - 1) * 7 + 1;
      const lastDay = new Date(y, mo, 0).getDate();
      const end = w === 5 ? lastDay : Math.min(w * 7, lastDay);
      key = `${m[1]}-${m[2]}-w${w}`;
      label = `${y} 年 ${mo} 月・第 ${w} 週（${mo}/${start}–${mo}/${end}）`;
    }
    let g = map.get(key);
    if (!g) {
      g = { key, label, items: [] };
      map.set(key, g);
    }
    g.items.push(it);
  }
  return Array.from(map.values()).sort((a, b) => b.key.localeCompare(a.key));
}

// ── 顯示用文字 ───────────────────────────────────────
export const REIMB_STATUS_LABEL: Record<ReimbStatus, string> = {
  pending_approval: "待核准",
  approved: "已核准・待購買/附收據",
  ready: "待付款",
  paid: "已付款",
  rejected: "已退回",
};

export const COLLECTION_STATUS_LABEL: Record<CollectionStatus, string> = {
  pending_confirm: "待確認",
  confirmed: "已確認入帳",
  rejected: "已退回",
};

export const PURCHASE_STATUS_LABEL: Record<PurchaseStatus, string> = {
  pending: "待採購",
  purchased: "已採購",
  arrived: "已到貨",
  cancelled: "已取消",
};

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  bank: "銀行",
  cash: "現金",
  petty: "零用金",
};

// ── 小工具 ───────────────────────────────────────────
export function fmtMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toLocaleString("zh-TW", {
    maximumFractionDigits: 0,
  })}`;
}

export function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// 今天（本地時區）的 YYYY-MM-DD，給日期欄位當預設值
export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;
}

// 本週一 00:00（本地）— 彙總頁判斷「本週」用
export function startOfWeek(base = new Date()): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate());
  const dow = (d.getDay() + 6) % 7; // 週一=0
  d.setDate(d.getDate() - dow);
  return d;
}

// ── 收據上傳 / 讀取（Supabase Storage）────────────────
const BUCKET = "acc-receipts";

export async function uploadReceipt(
  teacherId: string,
  file: File
): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${teacherId}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });
  if (error) throw error;
  return path;
}

// 取得可瀏覽的簽名網址（私有 bucket）
export async function receiptUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

// ── 讀取 ─────────────────────────────────────────────
export async function fetchAccounts(): Promise<Account[]> {
  const { data } = await supabase
    .from("acc_accounts")
    .select("*")
    .order("sort_order")
    .order("created_at");
  return (data ?? []) as Account[];
}

export async function fetchBalances(): Promise<AccountBalance[]> {
  const { data } = await supabase.from("acc_account_balances").select("*");
  return (data ?? []) as AccountBalance[];
}

export async function fetchCategories(): Promise<Category[]> {
  const { data } = await supabase
    .from("acc_categories")
    .select("*")
    .order("kind")
    .order("sort_order");
  return (data ?? []) as Category[];
}

export async function fetchEntries(limit = 2000): Promise<Entry[]> {
  const { data } = await supabase
    .from("acc_entries")
    .select("*")
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Entry[];
}

export async function fetchReimbursements(): Promise<Reimbursement[]> {
  const { data } = await supabase
    .from("acc_reimbursements")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as Reimbursement[];
}

export async function fetchCollections(): Promise<Collection[]> {
  const { data } = await supabase
    .from("acc_collections")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as Collection[];
}

export async function fetchPurchases(): Promise<Purchase[]> {
  const { data } = await supabase
    .from("acc_purchases")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as Purchase[];
}

// ── 內部轉帳：一次寫入兩筆分錄（轉出負、轉入正）────────
export async function createTransfer(params: {
  fromAccountId: string;
  toAccountId: string;
  amount: number;
  occurredOn: string;
  note: string;
  createdBy: string;
}): Promise<{ error: string | null }> {
  const group =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random()}`;
  const base = {
    occurred_on: params.occurredOn,
    note: params.note || "內部轉帳",
    source_type: "transfer" as const,
    transfer_group: group,
    created_by: params.createdBy,
  };
  const { error } = await supabase.from("acc_entries").insert([
    { ...base, account_id: params.fromAccountId, signed_amount: -params.amount },
    { ...base, account_id: params.toAccountId, signed_amount: params.amount },
  ]);
  return { error: error?.message ?? null };
}

// ── 寫入 helper（狀態轉換全由資料庫觸發器把關，前端只送意圖）──
type Res = { error: string | null };

// 代墊：新增申請。金額 > 門檻時，觸發器會自動改成 pending_approval。
export async function createReimbursement(p: {
  requesterId: string;
  amount: number;
  categoryId: string | null;
  description: string;
  occurredOn: string;
  receiptPaths: string[];
}): Promise<Res> {
  const { error } = await supabase.from("acc_reimbursements").insert({
    requester_id: p.requesterId,
    amount: p.amount,
    category_id: p.categoryId,
    description: p.description,
    occurred_on: p.occurredOn,
    receipt_paths: p.receiptPaths,
  });
  return { error: error?.message ?? null };
}

// 代墊：一般欄位更新（描述/金額/類別/日期/收據）
export async function updateReimbursement(
  id: string,
  patch: Partial<
    Pick<
      Reimbursement,
      | "amount"
      | "category_id"
      | "description"
      | "occurred_on"
      | "receipt_paths"
      | "status"
      | "reject_reason"
      | "paid_account_id"
    >
  >
): Promise<Res> {
  const { error } = await supabase
    .from("acc_reimbursements")
    .update(patch)
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteReimbursement(id: string): Promise<Res> {
  const { error } = await supabase
    .from("acc_reimbursements")
    .delete()
    .eq("id", id);
  return { error: error?.message ?? null };
}

// 收款：新增申報
export async function createCollection(p: {
  collectorId: string;
  amount: number;
  categoryId: string | null;
  description: string;
  occurredOn: string;
  receiptPaths: string[];
  heldAccountId?: string | null; // 建立時就選「錢先放哪個帳戶」
  studentId?: string | null; // 學費可綁學生（選填）
  changeGiven?: number;
  changeAccountId?: string | null;
}): Promise<Res> {
  const { error } = await supabase.from("acc_collections").insert({
    collector_id: p.collectorId,
    amount: p.amount,
    category_id: p.categoryId,
    description: p.description,
    occurred_on: p.occurredOn,
    receipt_paths: p.receiptPaths,
    held_account_id: p.heldAccountId ?? null,
    student_id: p.studentId ?? null,
    change_given: p.changeGiven ?? 0,
    change_account_id: p.changeAccountId ?? null,
  });
  return { error: error?.message ?? null };
}

export async function updateCollection(
  id: string,
  patch: Partial<
    Pick<
      Collection,
      | "amount"
      | "category_id"
      | "description"
      | "occurred_on"
      | "receipt_paths"
      | "status"
      | "reject_reason"
      | "held_account_id"
      | "student_id"
      | "change_given"
      | "change_account_id"
    >
  >
): Promise<Res> {
  const { error } = await supabase
    .from("acc_collections")
    .update(patch)
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deleteCollection(id: string): Promise<Res> {
  const { error } = await supabase
    .from("acc_collections")
    .delete()
    .eq("id", id);
  return { error: error?.message ?? null };
}

// ── 採購 ─────────────────────────────────────────────
// 新增採購需求：一律從「待採購」開始（狀態由 RLS 限制）
export async function createPurchase(p: {
  requesterId: string;
  itemName: string;
  quantity: number;
  note: string | null;
  estAmount: number | null;
  imagePaths: string[];
}): Promise<Res> {
  const { error } = await supabase.from("acc_purchases").insert({
    requester_id: p.requesterId,
    created_by: p.requesterId,
    item_name: p.itemName,
    quantity: p.quantity,
    note: p.note,
    est_amount: p.estAmount,
    image_paths: p.imagePaths,
  });
  return { error: error?.message ?? null };
}

// 一般欄位更新（需求者改自己待採購的品項）＋ 狀態流轉（到貨/取消，觸發器把關）
export async function updatePurchase(
  id: string,
  patch: Partial<
    Pick<
      Purchase,
      | "item_name"
      | "quantity"
      | "note"
      | "est_amount"
      | "image_paths"
      | "status"
      | "cancel_reason"
    >
  >
): Promise<Res> {
  const { error } = await supabase
    .from("acc_purchases")
    .update(patch)
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function deletePurchase(id: string): Promise<Res> {
  const { error } = await supabase.from("acc_purchases").delete().eq("id", id);
  return { error: error?.message ?? null };
}

// 標記已採購：填實際金額/類別；可選擇順便開一張採購負責人的代墊單。
// 兩步（先建代墊、再回寫 reimbursement_id）；若第二步失敗會把剛建的代墊刪掉，避免孤兒單。
export async function markPurchased(p: {
  purchaseId: string;
  purchaserId: string; // 採購負責人（美君）＝ auth.uid()
  actualAmount: number;
  categoryId: string | null;
  imagePaths: string[];
  openReimbursement: boolean;
  description: string; // 給代墊用，例「採購：白板筆 ×2」
  occurredOn: string;
}): Promise<Res & { reimbursementId: string | null }> {
  let reimbursementId: string | null = null;

  if (p.openReimbursement) {
    const { data, error } = await supabase
      .from("acc_reimbursements")
      .insert({
        requester_id: p.purchaserId,
        amount: p.actualAmount,
        category_id: p.categoryId,
        description: p.description,
        occurred_on: p.occurredOn,
        receipt_paths: p.imagePaths,
      })
      .select("id")
      .single();
    if (error) return { error: error.message, reimbursementId: null };
    reimbursementId = data.id as string;
  }

  const { error } = await supabase
    .from("acc_purchases")
    .update({
      status: "purchased",
      actual_amount: p.actualAmount,
      category_id: p.categoryId,
      image_paths: p.imagePaths,
      reimbursement_id: reimbursementId,
    })
    .eq("id", p.purchaseId);

  if (error) {
    // 回滾剛建立的代墊，避免留下沒被關聯的孤兒單
    if (reimbursementId) {
      await supabase.from("acc_reimbursements").delete().eq("id", reimbursementId);
    }
    return { error: error.message, reimbursementId: null };
  }
  return { error: null, reimbursementId };
}

// 流水帳：手動新增一筆分錄（僅管理者，RLS 把關）
export async function createEntry(p: {
  accountId: string;
  signedAmount: number;
  categoryId: string | null;
  occurredOn: string;
  note: string;
  createdBy: string;
}): Promise<Res> {
  const { error } = await supabase.from("acc_entries").insert({
    account_id: p.accountId,
    signed_amount: p.signedAmount,
    category_id: p.categoryId,
    occurred_on: p.occurredOn,
    note: p.note || null,
    source_type: "manual",
    created_by: p.createdBy,
  });
  return { error: error?.message ?? null };
}

// 編輯一筆手動分錄（僅管理者；代墊/收款/轉帳產生的分錄不從這裡改）
export async function updateEntry(
  id: string,
  p: {
    accountId: string;
    signedAmount: number;
    categoryId: string | null;
    occurredOn: string;
    note: string;
  }
): Promise<Res> {
  const { error } = await supabase
    .from("acc_entries")
    .update({
      account_id: p.accountId,
      signed_amount: p.signedAmount,
      category_id: p.categoryId,
      occurred_on: p.occurredOn,
      note: p.note || null,
    })
    .eq("id", id);
  return { error: error?.message ?? null };
}

// 刪除一筆手動分錄（代墊/收款產生的分錄不從這裡刪，交由來源單處理）
export async function deleteEntry(id: string): Promise<Res> {
  const { error } = await supabase.from("acc_entries").delete().eq("id", id);
  return { error: error?.message ?? null };
}

// ── 設定：帳戶 / 類別 / 成員權限（僅管理者）──
export async function upsertAccount(
  a: Partial<Account> & { name: string }
): Promise<Res> {
  const { error } = await supabase.from("acc_accounts").upsert(a);
  return { error: error?.message ?? null };
}

// 指定某帳戶為唯一主帳戶（先全部取消再設定目標）
export async function setMainAccount(id: string): Promise<Res> {
  const clear = await supabase
    .from("acc_accounts")
    .update({ is_main: false })
    .neq("id", id);
  if (clear.error) return { error: clear.error.message };
  const { error } = await supabase
    .from("acc_accounts")
    .update({ is_main: true })
    .eq("id", id);
  return { error: error?.message ?? null };
}

export async function upsertCategory(
  c: Partial<Category> & { name: string; kind: CategoryKind }
): Promise<Res> {
  const { error } = await supabase.from("acc_categories").upsert(c);
  return { error: error?.message ?? null };
}

export async function setTeacherAccounting(
  teacherId: string,
  value: boolean
): Promise<Res> {
  const { error } = await supabase
    .from("teachers")
    .update({ can_accounting: value })
    .eq("id", teacherId);
  return { error: error?.message ?? null };
}

// 設定頁要能看到全部老師（含尚未開通記帳者）
export async function fetchAllTeachers(): Promise<
  { id: string; name: string; is_admin: boolean; can_accounting: boolean }[]
> {
  const { data } = await supabase
    .from("teachers")
    .select("id,name,is_admin,can_accounting")
    .eq("is_worker", false) // 工讀生不算記帳成員
    .order("name");
  return (data ?? []) as {
    id: string;
    name: string;
    is_admin: boolean;
    can_accounting: boolean;
  }[];
}
