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
  amount: number;
  category_id: string | null;
  description: string;
  occurred_on: string;
  held_account_id: string | null;
  status: CollectionStatus;
  receipt_paths: string[];
  reject_reason: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;
  created_at: string;
};

// 超過此金額的代墊需事前申請核准（與資料庫觸發器一致）
export const APPROVAL_THRESHOLD = 2000;

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

export async function fetchEntries(limit = 200): Promise<Entry[]> {
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
}): Promise<Res> {
  const { error } = await supabase.from("acc_collections").insert({
    collector_id: p.collectorId,
    amount: p.amount,
    category_id: p.categoryId,
    description: p.description,
    occurred_on: p.occurredOn,
    receipt_paths: p.receiptPaths,
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
    .order("name");
  return (data ?? []) as {
    id: string;
    name: string;
    is_admin: boolean;
    can_accounting: boolean;
  }[];
}
