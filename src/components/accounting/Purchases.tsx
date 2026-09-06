"use client";

import { useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  APPROVAL_THRESHOLD,
  PURCHASE_STATUS_LABEL,
  REIMB_STATUS_LABEL,
  createPurchase,
  deletePurchase,
  fmtDate,
  fmtMoney,
  markPurchased,
  todayISO,
  updatePurchase,
  type Category,
  type Purchase,
} from "@/lib/accounting";
import type { AccountingData } from "./useAccountingData";
import {
  Card,
  Empty,
  Field,
  GhostBtn,
  Modal,
  Money,
  PrimaryBtn,
  StatusPill,
  inputCls,
} from "./ui";
import { ReceiptInput, ReceiptLinks } from "./Receipts";
import { notifyPurchaseRequest } from "@/lib/notify";

// 狀態排序：待辦優先（待採購 → 已採購 → 已到貨 → 已取消）
const STATUS_ORDER: Record<Purchase["status"], number> = {
  pending: 0,
  purchased: 1,
  arrived: 2,
  cancelled: 3,
};

// 給代墊單用的說明文字
function reimbDesc(p: Pick<Purchase, "item_name" | "quantity">): string {
  return `採購：${p.item_name}${p.quantity > 1 ? ` ×${p.quantity}` : ""}`;
}

export default function Purchases({
  teacher,
  data,
}: {
  teacher: Teacher;
  data: AccountingData;
}) {
  const { purchases, reimbursements, categories, teacherNames, refresh } = data;
  const [formFor, setFormFor] = useState<Purchase | "new" | null>(null);
  const [buy, setBuy] = useState<Purchase | null>(null);
  const [cancelFor, setCancelFor] = useState<Purchase | null>(null);

  // 採購負責人（美君）／管理者：可推進狀態
  const canManage = teacher.is_purchaser || teacher.is_admin;

  const expenseCats = useMemo(
    () => categories.filter((c) => c.kind === "expense" && c.active),
    [categories]
  );
  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );
  // 代墊狀態對照（顯示「已開代墊 · 待付款/已付款」）
  const reimbStatus = useMemo(
    () => new Map(reimbursements.map((r) => [r.id, r.status])),
    [reimbursements]
  );

  const sorted = useMemo(
    () =>
      [...purchases].sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          +new Date(b.created_at) - +new Date(a.created_at)
      ),
    [purchases]
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-black/55">
          填「要買什麼」→ 美君採購（可順便開代墊）→ 到貨完成。
        </p>
        <PrimaryBtn onClick={() => setFormFor("new")}>＋ 新增採購</PrimaryBtn>
      </div>

      {sorted.length === 0 ? (
        <Empty>目前沒有採購項目</Empty>
      ) : (
        <div className="space-y-2">
          {sorted.map((p) => (
            <PurchaseCard
              key={p.id}
              p={p}
              teacher={teacher}
              canManage={canManage}
              catName={catName}
              requesterName={
                teacherNames.get(p.requester_id) ??
                (p.requester_id === teacher.id ? teacher.name : "—")
              }
              reimbStatusLabel={
                p.reimbursement_id
                  ? REIMB_STATUS_LABEL[
                      reimbStatus.get(p.reimbursement_id) ?? "ready"
                    ]
                  : null
              }
              onEdit={() => setFormFor(p)}
              onDelete={async () => {
                if (!confirm(`確定刪除「${p.item_name}」？`)) return;
                const { error } = await deletePurchase(p.id);
                if (error) alert(error);
                else await refresh();
              }}
              onMarkPurchased={() => setBuy(p)}
              onMarkArrived={async () => {
                const { error } = await updatePurchase(p.id, {
                  status: "arrived",
                });
                if (error) alert(error);
                else await refresh();
              }}
              onCancel={() => setCancelFor(p)}
            />
          ))}
        </div>
      )}

      {formFor && (
        <PurchaseForm
          teacher={teacher}
          existing={formFor === "new" ? null : formFor}
          onClose={() => setFormFor(null)}
          onSaved={async () => {
            setFormFor(null);
            await refresh();
          }}
        />
      )}

      {buy && (
        <MarkPurchasedModal
          teacher={teacher}
          purchase={buy}
          categories={expenseCats}
          onClose={() => setBuy(null)}
          onSaved={async () => {
            setBuy(null);
            await refresh();
          }}
        />
      )}

      {cancelFor && (
        <CancelModal
          itemName={cancelFor.item_name}
          onClose={() => setCancelFor(null)}
          onConfirm={async (reason) => {
            const { error } = await updatePurchase(cancelFor.id, {
              status: "cancelled",
              cancel_reason: reason || null,
            });
            if (error) alert(error);
            else {
              setCancelFor(null);
              await refresh();
            }
          }}
        />
      )}
    </div>
  );
}

// 備註若是網址就渲染成可點連結
function NoteText({ note }: { note: string }) {
  const isUrl = /^https?:\/\//i.test(note.trim());
  if (isUrl) {
    return (
      <a
        href={note.trim()}
        target="_blank"
        rel="noopener noreferrer"
        className="break-all text-navy underline decoration-navy/30 hover:decoration-navy"
      >
        {note.trim()}
      </a>
    );
  }
  return <span className="whitespace-pre-wrap break-words">{note}</span>;
}

function PurchaseCard({
  p,
  teacher,
  canManage,
  catName,
  requesterName,
  reimbStatusLabel,
  onEdit,
  onDelete,
  onMarkPurchased,
  onMarkArrived,
  onCancel,
}: {
  p: Purchase;
  teacher: Teacher;
  canManage: boolean;
  catName: Map<string, string>;
  requesterName: string;
  reimbStatusLabel: string | null;
  onEdit: () => void;
  onDelete: () => void;
  onMarkPurchased: () => void;
  onMarkArrived: () => void;
  onCancel: () => void;
}) {
  const mine = p.requester_id === teacher.id;
  const amount = p.actual_amount ?? p.est_amount;
  const amountIsEstimate = p.actual_amount == null && p.est_amount != null;

  const canEdit = mine && p.status === "pending";
  // 需求者可刪自己「待採購」的；採購負責人／管理者隨時可刪
  const canDelete = canManage || (mine && p.status === "pending");

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-navy">{p.item_name}</span>
            {p.quantity > 1 && (
              <span className="text-sm text-black/50">×{p.quantity}</span>
            )}
            <StatusPill label={PURCHASE_STATUS_LABEL[p.status]} />
            {reimbStatusLabel && (
              <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-black/50">
                代墊：{reimbStatusLabel}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-black/50">
            <span>需求者：{requesterName}</span>
            {p.category_id && <span>類別：{catName.get(p.category_id)}</span>}
            {p.status === "purchased" && p.purchased_at && (
              <span>採購於 {fmtDate(p.purchased_at)}</span>
            )}
            {p.status === "arrived" && p.arrived_at && (
              <span>到貨於 {fmtDate(p.arrived_at)}</span>
            )}
          </div>
        </div>
        {amount != null && (
          <div className="shrink-0 text-right">
            <Money value={amount} className="text-lg" />
            {amountIsEstimate && (
              <div className="text-[11px] text-black/40">預估</div>
            )}
          </div>
        )}
      </div>

      {p.note && (
        <p className="mt-2 text-sm text-black/70">
          <NoteText note={p.note} />
        </p>
      )}

      {p.status === "cancelled" && p.cancel_reason && (
        <p className="mt-2 rounded-lg bg-black/5 px-3 py-1.5 text-xs text-black/50">
          取消原因：{p.cancel_reason}
        </p>
      )}

      {p.image_paths.length > 0 && (
        <div className="mt-2">
          <ReceiptLinks paths={p.image_paths} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {canManage && p.status === "pending" && (
          <GhostBtn tone="ok" onClick={onMarkPurchased}>
            標記已採購
          </GhostBtn>
        )}
        {canManage && p.status === "purchased" && (
          <>
            <GhostBtn tone="ok" onClick={onMarkArrived}>
              標記已到貨
            </GhostBtn>
            <GhostBtn tone="danger" onClick={onCancel}>
              取消
            </GhostBtn>
          </>
        )}
        {canEdit && <GhostBtn onClick={onEdit}>編輯</GhostBtn>}
        {canDelete && (
          <GhostBtn tone="danger" onClick={onDelete}>
            刪除
          </GhostBtn>
        )}
      </div>
    </Card>
  );
}

// 新增 / 編輯採購（需求者填要買什麼；類別與實際金額留到採購時才填）
function PurchaseForm({
  teacher,
  existing,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  existing: Purchase | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [itemName, setItemName] = useState(existing?.item_name ?? "");
  const [quantity, setQuantity] = useState(String(existing?.quantity ?? 1));
  const [note, setNote] = useState(existing?.note ?? "");
  const [estAmount, setEstAmount] = useState(
    existing?.est_amount != null ? String(existing.est_amount) : ""
  );
  const [paths, setPaths] = useState<string[]>(existing?.image_paths ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!itemName.trim()) return setErr("請填寫品名");
    const qty = Math.floor(Number(quantity));
    if (!qty || qty <= 0) return setErr("數量請填正整數");
    const est = estAmount.trim() === "" ? null : Number(estAmount);
    if (est != null && (isNaN(est) || est < 0)) return setErr("預估金額不正確");

    setBusy(true);
    let res;
    if (!existing) {
      res = await createPurchase({
        requesterId: teacher.id,
        itemName: itemName.trim(),
        quantity: qty,
        note: note.trim() || null,
        estAmount: est,
        imagePaths: paths,
      });
      // 新採購需求 → 通知採購負責人（美君）。她自己新增則不需通知自己。
      if (!res.error && !teacher.is_purchaser) {
        void notifyPurchaseRequest({
          who: teacher.name,
          what: `${itemName.trim()}${qty > 1 ? ` ×${qty}` : ""}`,
        });
      }
    } else {
      res = await updatePurchase(existing.id, {
        item_name: itemName.trim(),
        quantity: qty,
        note: note.trim() || null,
        est_amount: est,
        image_paths: paths,
      });
    }
    setBusy(false);
    if (res.error) setErr(res.error);
    else onSaved();
  }

  return (
    <Modal title={existing ? "編輯採購" : "新增採購"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="品名">
          <input
            className={inputCls}
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="例：白板筆（黑）"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="數量">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              className={inputCls}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </Field>
          <Field label="預估金額" hint="（選填）">
            <input
              type="number"
              inputMode="numeric"
              className={inputCls}
              value={estAmount}
              onChange={(e) => setEstAmount(e.target.value)}
              placeholder="0"
            />
          </Field>
        </div>
        <Field label="備註 / 連結" hint="（選填）">
          <textarea
            className={`${inputCls} h-20 resize-none`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="規格、購買連結、或其他說明"
          />
        </Field>
        <Field label="參考圖片" hint="（選填）">
          <ReceiptInput teacherId={teacher.id} paths={paths} onChange={setPaths} />
        </Field>

        {err && <p className="text-sm text-brand">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <GhostBtn onClick={onClose}>取消</GhostBtn>
          <PrimaryBtn onClick={save} disabled={busy}>
            {busy ? "儲存中…" : "儲存"}
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

// 標記已採購：填實際金額 / 選類別 / 決定要不要開代墊
function MarkPurchasedModal({
  teacher,
  purchase,
  categories,
  onClose,
  onSaved,
}: {
  teacher: Teacher;
  purchase: Purchase;
  categories: Category[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [actualAmount, setActualAmount] = useState(
    purchase.est_amount != null ? String(purchase.est_amount) : ""
  );
  const [categoryId, setCategoryId] = useState<string>(
    purchase.category_id ?? categories[0]?.id ?? ""
  );
  const [openReimb, setOpenReimb] = useState(true);
  const [paths, setPaths] = useState<string[]>(purchase.image_paths ?? []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const amountNum = Number(actualAmount);
  // 美君非管理者：開代墊且金額 > 門檻 → 送出後需宇群事前核准
  const overThreshold =
    openReimb && amountNum > APPROVAL_THRESHOLD && !teacher.is_admin;

  async function save() {
    setErr(null);
    if (!amountNum || amountNum <= 0) return setErr("請填寫實際金額");
    setBusy(true);
    const res = await markPurchased({
      purchaseId: purchase.id,
      purchaserId: teacher.id,
      actualAmount: amountNum,
      categoryId: categoryId || null,
      imagePaths: paths,
      openReimbursement: openReimb,
      description: reimbDesc(purchase),
      occurredOn: todayISO(),
    });
    setBusy(false);
    if (res.error) setErr(res.error);
    else onSaved();
  }

  return (
    <Modal title="標記已採購" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-black/60">
          {purchase.item_name}
          {purchase.quantity > 1 && ` ×${purchase.quantity}`}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="實際金額">
            <input
              type="number"
              inputMode="numeric"
              className={inputCls}
              value={actualAmount}
              onChange={(e) => setActualAmount(e.target.value)}
              placeholder="0"
            />
          </Field>
          <Field label="費用類別">
            <select
              className={inputCls}
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              <option value="">未分類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-black/10 bg-white/60 px-3 py-2.5">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-brand"
            checked={openReimb}
            onChange={(e) => setOpenReimb(e.target.checked)}
          />
          <span className="text-sm text-black/70">
            順便開一張我的代墊請款單
            <span className="mt-0.5 block text-xs text-black/45">
              金額 {fmtMoney(amountNum || 0)} 會進「代墊」分頁，由宇群確認付款。
            </span>
          </span>
        </label>

        {overThreshold && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            超過 ${APPROVAL_THRESHOLD}，代墊送出後需宇群事前核准。
          </p>
        )}

        <Field label="收據 / 照片" hint="（選填）">
          <ReceiptInput teacherId={teacher.id} paths={paths} onChange={setPaths} />
        </Field>

        {err && <p className="text-sm text-brand">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <GhostBtn onClick={onClose}>取消</GhostBtn>
          <PrimaryBtn onClick={save} disabled={busy}>
            {busy ? "處理中…" : "確定"}
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

// 取消採購（原因選填）
function CancelModal({
  itemName,
  onClose,
  onConfirm,
}: {
  itemName: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal title="取消採購" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-black/60">
          確定取消「{itemName}」？可填原因（選填）。
        </p>
        <Field label="取消原因" hint="（選填）">
          <textarea
            className={`${inputCls} h-20 resize-none`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="例：改用現有庫存、不需要了"
          />
        </Field>
        <div className="flex justify-end gap-2">
          <GhostBtn onClick={onClose}>返回</GhostBtn>
          <PrimaryBtn onClick={() => onConfirm(reason.trim())}>
            確定取消
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}
