"use client";

import { useEffect, useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import { fmtMoney, todayISO } from "@/lib/accounting";
import {
  fetchClosingHistory,
  fetchRooms,
  fetchRoster,
  fetchTodayClosing,
  saveClosing,
  weekDuty,
  type ClosingRecord,
  type ClosingRoom,
  type RosterEntry,
} from "@/lib/closing";
import type { AccountingData } from "./useAccountingData";
import { Card, Empty, Field, GhostBtn, Money, PrimaryBtn, inputCls } from "./ui";

export default function Closing({
  teacher,
  data,
}: {
  teacher: Teacher;
  data: AccountingData;
}) {
  const { accounts, balances, collections, teacherNames } = data;

  const [rooms, setRooms] = useState<ClosingRoom[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [today, setToday] = useState<ClosingRecord | null>(null);
  const [loading, setLoading] = useState(true);

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pettyActual, setPettyActual] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [history, setHistory] = useState<ClosingRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // 帳上零用金餘額（打烊要盤點比對的目標）
  const pettyAccount = useMemo(
    () => accounts.find((a) => a.type === "petty" && a.active) ?? null,
    [accounts]
  );
  const pettyExpected = useMemo(() => {
    if (!pettyAccount) return null;
    return (
      balances.find((b) => b.id === pettyAccount.id)?.balance ??
      pettyAccount.opening_balance
    );
  }, [balances, pettyAccount]);

  // 今日找錢（收款當天找出去的零錢總額）
  const todayChange = useMemo(() => {
    const d = todayISO();
    return collections
      .filter((c) => c.occurred_on === d && c.status !== "rejected")
      .reduce((s, c) => s + (c.change_given || 0), 0);
  }, [collections]);

  const duty = useMemo(() => weekDuty(roster), [roster]);

  async function load() {
    const [r, ro, t] = await Promise.all([
      fetchRooms(),
      fetchRoster(),
      fetchTodayClosing(),
    ]);
    setRooms(r);
    setRoster(ro);
    setToday(t);
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

  function toggleRoom(name: string) {
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
    setBusy(true);
    const { error } = await saveClosing({
      closedBy: teacher.id,
      roomsChecked: rooms.filter((r) => checked.has(r.name)).map((r) => r.name),
      roomsTotal: rooms.length,
      pettyExpected,
      pettyActual: actualNum,
      todayChange,
      note: note.trim() || null,
    });
    setBusy(false);
    if (error) return alert(error);
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
            <b className="text-navy">{teacher.name}</b>
          </p>
          <p className="text-xs text-black/40">{todayISO()}</p>
        </div>
        {today && (
          <span className="rounded-full bg-[#8CA07C]/15 px-3 py-1 text-xs font-medium text-[#5f7a4f]">
            今日已記錄
          </span>
        )}
      </div>

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
                  className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left text-sm transition active:scale-[0.99] ${
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
            className={inputCls}
            value={pettyActual}
            onChange={(e) => setPettyActual(e.target.value)}
            placeholder="0"
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
        {!pettyAccount && (
          <p className="text-xs text-black/40">
            找不到零用金帳戶，請先到「設定」建立一個「零用金」類型的帳戶。
          </p>
        )}
      </Card>

      {/* 備註 */}
      <Card>
        <Field label="備註" hint="（選填）">
          <textarea
            className={`${inputCls} h-20 resize-none`}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="今天有什麼要交代的？例：冷氣濾網該清了"
          />
        </Field>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {savedFlash && (
          <span className="text-sm text-[#5f7a4f]">✓ 已儲存打烊紀錄</span>
        )}
        <PrimaryBtn onClick={save} disabled={busy}>
          {busy ? "儲存中…" : today ? "更新打烊紀錄" : "儲存打烊紀錄"}
        </PrimaryBtn>
      </div>

      {/* 歷史 */}
      <div>
        <button
          onClick={async () => {
            if (!showHistory && history.length === 0)
              setHistory(await fetchClosingHistory());
            setShowHistory((s) => !s);
          }}
          className="text-sm text-black/55 hover:text-navy"
        >
          {showHistory ? "▲ 收起歷史紀錄" : "▼ 查看歷史打烊紀錄"}
        </button>
        {showHistory && (
          <div className="mt-2 space-y-2">
            {history.length === 0 ? (
              <Empty>還沒有歷史紀錄</Empty>
            ) : (
              history.map((h) => {
                const d =
                  h.petty_actual != null && h.petty_expected != null
                    ? h.petty_actual - h.petty_expected
                    : null;
                return (
                  <Card key={h.id} className="text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-navy">{h.close_date}</span>
                      <span className="text-xs text-black/45">
                        {h.closed_by
                          ? teacherNames.get(h.closed_by) ?? "—"
                          : "—"}
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
