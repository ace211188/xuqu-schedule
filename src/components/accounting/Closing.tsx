"use client";

import { useEffect, useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import { fmtMoney, todayISO } from "@/lib/accounting";
import {
  EDIT_WINDOW_HOURS,
  closingEditState,
  fetchClosingList,
  fetchPettySummary,
  fetchRooms,
  fetchRoster,
  saveClosing,
  weekDuty,
  type ClosingRecord,
  type ClosingRoom,
  type PettySummary,
  type RosterEntry,
} from "@/lib/closing";
import { fmtTime } from "@/lib/attendance";
import { Card, Empty, Field, Money, PrimaryBtn, inputCls } from "./ui";

// 打烊：記帳成員與工讀生共用。資料只從打烊專用的表與 RPC 讀，不需要記帳權限。
export default function Closing({ teacher }: { teacher: Teacher }) {
  const [rooms, setRooms] = useState<ClosingRoom[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [list, setList] = useState<ClosingRecord[]>([]);
  const [petty, setPetty] = useState<PettySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pettyActual, setPettyActual] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  // 每分鐘更新一次「現在」，讓 8 小時鎖定在畫面開著時也會準時生效
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const today = useMemo(
    () => list.find((r) => r.close_date === todayISO()) ?? null,
    [list]
  );
  const edit = closingEditState(today, teacher.id, now);
  const readOnly = !edit.canEdit;

  async function load() {
    const [r, ro, l, p] = await Promise.all([
      fetchRooms(),
      fetchRoster(),
      fetchClosingList(),
      fetchPettySummary(),
    ]);
    setRooms(r);
    setRoster(ro);
    setList(l);
    setPetty(p);
    const t = l.find((x) => x.close_date === todayISO());
    if (t) {
      setChecked(new Set(t.rooms_checked));
      setPettyActual(t.petty_actual != null ? String(t.petty_actual) : "");
      setNote(t.note ?? "");
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const duty = useMemo(() => weekDuty(roster), [roster]);

  // 可編輯時看即時數字；唯讀時看當時存下的快照（那才是當時盤點的依據）
  const pettyExpected = readOnly
    ? today?.petty_expected ?? null
    : petty?.petty_expected ?? null;
  const todayChange = readOnly
    ? today?.today_change ?? 0
    : petty?.today_change ?? 0;
  const hasPetty = readOnly ? today?.petty_expected != null : !!petty?.has_petty;

  function toggleRoom(name: string) {
    if (readOnly) return;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  const actualNum = pettyActual.trim() === "" ? null : Number(pettyActual);
  const diff =
    actualNum != null && pettyExpected != null ? actualNum - pettyExpected : null;
  const allRoomsOk = rooms.length > 0 && rooms.every((r) => checked.has(r.name));

  async function save() {
    if (readOnly) return;
    setErr(null);
    setBusy(true);
    const { error } = await saveClosing({
      closedBy: teacher.id,
      roomsChecked: rooms.filter((r) => checked.has(r.name)).map((r) => r.name),
      roomsTotal: rooms.length,
      pettyExpected: petty?.petty_expected ?? null,
      pettyActual: actualNum,
      todayChange: petty?.today_change ?? 0,
      note: note.trim() || null,
    });
    setBusy(false);
    if (error) {
      // 最常見：別人剛好先存了、或已超過 8 小時 → 重新載入後會變成唯讀
      setErr(
        /row-level security|violates/i.test(error)
          ? "今天的打烊已由其他人填寫，或已超過可修改時間，無法再修改。"
          : error
      );
      await load();
      return;
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
    await load();
  }

  if (loading)
    return <div className="py-16 text-center text-sm text-black/45">載入中…</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-black/55">
            打烊前逐項檢查、盤點零用金。負責人：
            <b className="text-navy">
              {today ? today.closer_name ?? "—" : teacher.name}
            </b>
          </p>
          <p className="text-xs text-black/40">{todayISO()}</p>
        </div>
        {today && (
          <span className="rounded-full bg-[#8CA07C]/15 px-3 py-1 text-xs font-medium text-[#5f7a4f]">
            今日已記錄
          </span>
        )}
      </div>

      {/* 編輯權限說明 */}
      <EditBanner edit={edit} closerName={today?.closer_name ?? null} />

      {/* 本週廁所清潔 */}
      <Card className="flex items-center gap-3">
        <span className="text-xl">🧹</span>
        <div>
          <div className="text-xs text-black/45">本週廁所清潔負責人</div>
          <div className="font-semibold text-navy">
            {duty ?? "（尚未設定輪值名單）"}
          </div>
        </div>
      </Card>

      {/* 教室檢查清單 */}
      <Card>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold text-navy">
            教室檢查（電燈冷氣已關）
          </span>
          <span
            className={`text-xs font-medium ${
              allRoomsOk ? "text-[#5f7a4f]" : "text-black/45"
            }`}
          >
            {checked.size}/{rooms.length}
            {allRoomsOk ? " ✓ 全部完成" : ""}
          </span>
        </div>
        {rooms.length === 0 ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            還沒有教室清單，請管理員到「設定 → 教室清單」新增。
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {rooms.map((r) => {
              const on = checked.has(r.name);
              return (
                <button
                  key={r.id}
                  onClick={() => toggleRoom(r.name)}
                  disabled={readOnly}
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition enabled:active:scale-[0.99] disabled:cursor-default ${
                    on
                      ? "border-[#8CA07C]/50 bg-[#8CA07C]/10 text-[#3b352f]"
                      : "border-black/15 bg-white text-black/60"
                  }`}
                >
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-xs ${
                      on
                        ? "border-[#8CA07C] bg-[#8CA07C] text-white"
                        : "border-black/25"
                    }`}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="truncate font-medium">{r.name}</span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* 零用金盤點比對 */}
      <Card className="space-y-3">
        <span className="text-sm font-semibold text-navy">櫃台零用金盤點</span>
        <div className="flex items-center justify-between text-sm">
          <span className="text-black/55">今日找錢</span>
          <Money value={-todayChange} colored />
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-black/55">帳上應有</span>
          <span className="font-medium tabular-nums text-navy">
            {pettyExpected != null ? fmtMoney(pettyExpected) : "—"}
          </span>
        </div>
        <Field label="實際盤點金額" hint="（數完櫃台現金填這裡）">
          <input
            type="number"
            inputMode="numeric"
            className={`${inputCls} disabled:bg-black/[0.03] disabled:text-black/60`}
            value={pettyActual}
            onChange={(e) => setPettyActual(e.target.value)}
            placeholder={readOnly ? "（未填）" : "0"}
            disabled={readOnly}
          />
        </Field>
        {diff != null && (
          <div
            className={`rounded-xl px-3 py-2 text-sm font-medium ${
              diff === 0
                ? "bg-[#8CA07C]/10 text-[#5f7a4f]"
                : "bg-brand/5 text-brand"
            }`}
          >
            {diff === 0
              ? "✓ 完全相符"
              : diff > 0
              ? `多了 ${fmtMoney(diff)}`
              : `短少 ${fmtMoney(Math.abs(diff))}`}
          </div>
        )}
        {!hasPetty && (
          <p className="text-xs text-black/40">
            找不到零用金帳戶，請管理員到「設定」建立一個「零用金」類型的帳戶。
          </p>
        )}
      </Card>

      {/* 備註 */}
      <Card>
        <Field label="備註" hint="（選填）">
          <textarea
            className={`${inputCls} h-20 resize-none disabled:bg-black/[0.03] disabled:text-black/60`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={readOnly ? "（無）" : "今天有什麼要交代的？例：冷氣濾網該清了"}
            disabled={readOnly}
          />
        </Field>
      </Card>

      {err && (
        <p className="rounded-xl bg-brand/5 px-3 py-2 text-sm text-brand">{err}</p>
      )}

      {!readOnly && (
        <div className="flex items-center justify-end gap-3">
          {savedFlash && (
            <span className="text-sm text-[#5f7a4f]">✓ 已儲存打烊紀錄</span>
          )}
          <PrimaryBtn onClick={save} disabled={busy}>
            {busy ? "儲存中…" : today ? "更新打烊紀錄" : "儲存打烊紀錄"}
          </PrimaryBtn>
        </div>
      )}

      {/* 歷史 */}
      <div>
        <button
          onClick={() => setShowHistory((s) => !s)}
          className="text-sm text-black/55 hover:text-navy"
        >
          {showHistory ? "▲ 收起歷史紀錄" : "▼ 查看歷史打烊紀錄"}
        </button>
        {showHistory && (
          <div className="mt-2 space-y-2">
            {list.length === 0 ? (
              <Empty>還沒有歷史紀錄</Empty>
            ) : (
              list.map((h) => {
                const d =
                  h.petty_actual != null && h.petty_expected != null
                    ? h.petty_actual - h.petty_expected
                    : null;
                return (
                  <Card key={h.id} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-navy">{h.close_date}</span>
                      <span className="text-xs text-black/45">
                        {h.closer_name ?? "—"}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-black/50">
                      <span>
                        教室 {h.rooms_checked.length}/{h.rooms_total}
                      </span>
                      <span>找錢 {fmtMoney(h.today_change)}</span>
                      {d != null && (
                        <span className={d === 0 ? "text-[#5f7a4f]" : "text-brand"}>
                          零用金{" "}
                          {d === 0
                            ? "相符"
                            : d > 0
                            ? `多 ${fmtMoney(d)}`
                            : `短少 ${fmtMoney(Math.abs(d))}`}
                        </span>
                      )}
                    </div>
                    {h.note && (
                      <p className="mt-1 text-xs text-black/55">{h.note}</p>
                    )}
                  </Card>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function EditBanner({
  edit,
  closerName,
}: {
  edit: ReturnType<typeof closingEditState>;
  closerName: string | null;
}) {
  if (edit.canEdit) {
    return (
      <p className="rounded-xl bg-navy/5 px-3 py-2 text-xs text-navy/80">
        {edit.deadline
          ? `✏️ 你是今天的編輯者，可以修改到 ${fmtTime(edit.deadline.toISOString())}（存檔後 ${EDIT_WINDOW_HOURS} 小時內）。`
          : `今天還沒有人填寫。存檔後你就是今天的編輯者，${EDIT_WINDOW_HOURS} 小時內可以修改，其他人只能檢視。`}
      </p>
    );
  }
  return (
    <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
      🔒{" "}
      {edit.reason === "others"
        ? `今天由 ${closerName ?? "其他人"} 填寫，你只能檢視。`
        : `已超過 ${EDIT_WINDOW_HOURS} 小時，今天的紀錄已鎖定，僅供檢視。`}
    </p>
  );
}
