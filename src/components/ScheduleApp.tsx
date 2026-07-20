"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Teacher } from "@/lib/useAuth";
import {
  AVAILABLE,
  BUSY,
  DAYS,
  SLOTS,
  STATE_STYLE,
  STEP,
  hhmm,
  isOpen,
  keyOf,
  monthOptions,
  type CellValue,
} from "@/lib/schedule";
import { greetingFor, progressCheer } from "@/lib/greeting";
import { enablePush, pushSupported } from "@/lib/push";

const ERASER = "eraser";
type Tool = typeof AVAILABLE | typeof BUSY | typeof ERASER;
type SaveState = "idle" | "saving" | "saved" | "error";

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

export default function ScheduleApp({
  teacher,
  onSignOut,
  onSwitchModule,
}: {
  teacher: Teacher;
  onSignOut: () => void;
  onSwitchModule?: () => void;
}) {
  const months = useMemo(() => monthOptions(new Date(), 4), []);
  const [month, setMonth] = useState(months[1]?.value ?? months[0].value); // 預設下個月
  const [tool, setTool] = useState<Tool>(AVAILABLE);
  const [selectedDay, setSelectedDay] = useState<string>(DAYS[0].key);
  const [cells, setCells] = useState<Record<string, CellValue>>({});
  const [loading, setLoading] = useState(true);
  const [save, setSave] = useState<SaveState>("idle");
  const [celebrate, setCelebrate] = useState(false);
  const [notes, setNotes] = useState<
    { id: number; x: number; y: number; ch: string }[]
  >([]);

  function spawnNote(x: number, y: number) {
    const id = Date.now() + Math.random();
    const ch = ["♪", "♫", "♩", "🎵", "🎶"][Math.floor(Math.random() * 5)];
    setNotes((n) => [...n, { id, x, y, ch }]);
    setTimeout(() => setNotes((n) => n.filter((z) => z.id !== id)), 800);
  }
  const [isDraft, setIsDraft] = useState(false);
  const [note, setNote] = useState("");
  const [confirmedAt, setConfirmedAt] = useState<string | null>(null);
  const pushTried = useRef(false);

  // 一打開就請求通知權限並訂閱（已授權則靜默；未決定時直接跳出「允許/拒絕」）
  useEffect(() => {
    if (!pushSupported()) return;
    enablePush(teacher.id);
  }, [teacher.id]);

  const greeting = useMemo(() => greetingFor(teacher.name), [teacher.name]);

  const painting = useRef(false);
  const paintValue = useRef<CellValue>(null);
  const pending = useRef<Map<string, { day: string; slot: number; value: CellValue }>>(
    new Map()
  );

  // 載入這位老師這個月的資料；若這個月還沒填，帶入「最近一個有填的月份」當草稿
  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("schedule_slots")
        .select("day,slot,state")
        .eq("teacher_id", teacher.id)
        .eq("month", month);
      if (!active) return;
      if (data && data.length) {
        const map: Record<string, CellValue> = {};
        for (const r of data) map[keyOf(r.day, r.slot)] = r.state as CellValue;
        setCells(map);
        setIsDraft(false);
        setLoading(false);
        return;
      }
      // 這個月沒資料 → 沿用最近一個有填的月份（草稿，需重新送出才算數）
      const { data: prev } = await supabase
        .from("schedule_slots")
        .select("month,day,slot,state")
        .eq("teacher_id", teacher.id)
        .lt("month", month)
        .order("month", { ascending: false });
      if (!active) return;
      if (prev && prev.length) {
        const latest = prev[0].month;
        const map: Record<string, CellValue> = {};
        for (const r of prev)
          if (r.month === latest) map[keyOf(r.day, r.slot)] = r.state as CellValue;
        setCells(map);
        setIsDraft(true);
      } else {
        setCells({});
        setIsDraft(false);
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [teacher.id, month]);

  // 載入這個月的備註與最後更新時間
  useEffect(() => {
    let active = true;
    supabase
      .from("monthly_meta")
      .select("note,confirmed_at")
      .eq("teacher_id", teacher.id)
      .eq("month", month)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setNote(data?.note ?? "");
        setConfirmedAt(data?.confirmed_at ?? null);
      });
    return () => {
      active = false;
    };
  }, [teacher.id, month]);

  async function saveNote() {
    await supabase.from("monthly_meta").upsert(
      { teacher_id: teacher.id, month, note, updated_at: new Date().toISOString() },
      { onConflict: "teacher_id,month" }
    );
  }

  const flush = useCallback(async () => {
    if (pending.current.size === 0) return;
    const entries = [...pending.current.entries()];
    pending.current.clear();
    setSave("saving");
    try {
      const upserts = entries
        .filter(([, v]) => v.value !== null)
        .map(([, v]) => ({
          teacher_id: teacher.id,
          month,
          day: v.day,
          slot: v.slot,
          state: v.value,
        }));
      const deletes = entries.filter(([, v]) => v.value === null);
      if (upserts.length)
        await supabase
          .from("schedule_slots")
          .upsert(upserts, { onConflict: "teacher_id,month,day,slot" });
      await Promise.all(
        deletes.map(([, v]) =>
          supabase
            .from("schedule_slots")
            .delete()
            .eq("teacher_id", teacher.id)
            .eq("month", month)
            .eq("day", v.day)
            .eq("slot", v.slot)
        )
      );
      setSave("saved");
      setTimeout(() => setSave((s) => (s === "saved" ? "idle" : s)), 1500);
    } catch {
      setSave("error");
    }
  }, [teacher.id, month]);

  const applyCell = useCallback((k: string, day: string, slot: number) => {
    setCells((prev) => {
      if (prev[k] === paintValue.current) return prev;
      const next = { ...prev };
      if (paintValue.current === null) delete next[k];
      else next[k] = paintValue.current;
      return next;
    });
    pending.current.set(k, { day, slot, value: paintValue.current });
  }, []);

  function startPaint(day: string, slot: number, open: boolean) {
    if (!open || loading) return;
    // 第一次填格時，順便（在使用者手勢中）請求開啟每月提醒
    if (
      !pushTried.current &&
      pushSupported() &&
      typeof Notification !== "undefined" &&
      Notification.permission === "default"
    ) {
      pushTried.current = true;
      enablePush(teacher.id);
    }
    const k = keyOf(day, slot);
    const current = cells[k] ?? null;
    if (tool === ERASER) paintValue.current = null;
    else if (current === tool) paintValue.current = null;
    else paintValue.current = tool;
    painting.current = true;
    applyCell(k, day, slot);
  }

  useEffect(() => {
    function onMove(e: PointerEvent) {
      if (!painting.current) return;
      const el = document
        .elementFromPoint(e.clientX, e.clientY)
        ?.closest<HTMLElement>("[data-cell]");
      if (!el || el.dataset.open !== "1") return;
      const day = el.dataset.day!;
      const slot = Number(el.dataset.slot);
      applyCell(el.dataset.cell!, day, slot);
    }
    function onUp() {
      if (!painting.current) return;
      painting.current = false;
      flush();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [applyCell, flush]);

  const summary = useMemo(() => {
    let available = 0,
      busy = 0;
    for (const v of Object.values(cells)) {
      if (v === AVAILABLE) available++;
      else if (v === BUSY) busy++;
    }
    return { available, busy };
  }, [cells]);

  async function submit() {
    await flush();
    // 把目前整月所有格子完整存下（涵蓋沿用上月、但這個月還沒動過的格子）
    const rows = Object.entries(cells)
      .filter(([, v]) => !!v)
      .map(([k, v]) => {
        const i = k.indexOf("-");
        return {
          teacher_id: teacher.id,
          month,
          day: k.slice(0, i),
          slot: Number(k.slice(i + 1)),
          state: v,
        };
      });
    setSave("saving");
    if (rows.length) {
      await supabase
        .from("schedule_slots")
        .upsert(rows, { onConflict: "teacher_id,month,day,slot" });
    }
    // 記錄「已確認/更新」的時間 + 備註（沒改也算一次確認）
    const now = new Date().toISOString();
    await supabase.from("monthly_meta").upsert(
      { teacher_id: teacher.id, month, note, confirmed_at: now, updated_at: now },
      { onConflict: "teacher_id,month" }
    );
    setConfirmedAt(now);
    setSave("saved");
    setIsDraft(false);
    setCelebrate(true);
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6 pb-28">
      {/* 頂欄：問候 + 登出 */}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy">{greeting.hi}</h1>
          <p className="text-sm text-black/60">{greeting.sub}</p>
          <p className="mt-1 text-xs text-black/40">{greeting.line}</p>
        </div>
        <div className="flex gap-2">
          {onSwitchModule && (
            <button
              onClick={onSwitchModule}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              💰 記帳
            </button>
          )}
          <button
            onClick={onSignOut}
            className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
          >
            登出
          </button>
        </div>
      </header>

      {/* 月份 + 說明 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-white/70 p-3">
        <span className="text-sm text-black/70">填寫月份</span>
        <select
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <span className="ml-auto text-xs text-black/45">
          標出你<b style={{ color: STATE_STYLE[AVAILABLE].textColor }}>可以排課</b>
          與已<b style={{ color: STATE_STYLE[BUSY].textColor }}>在序曲上課</b>的時段
        </span>
      </div>

      {/* 備註（特殊日期無法排課等） */}
      <div className="mb-4 rounded-2xl border border-black/10 bg-white/70 p-3">
        <label className="mb-1 flex items-center gap-1 text-sm font-medium text-black/70">
          📝 備註
          <span className="font-normal text-black/40">
            （例如某些日期不能排課，可先寫在這裡）
          </span>
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          rows={2}
          placeholder="例如：8/15 當天整天無法排課；月底兩週有事…"
          className="w-full resize-y rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20"
        />
      </div>

      {/* 工具列 */}
      <section className="mb-4 rounded-2xl border border-black/10 bg-white/70 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <ToolChip active={tool === AVAILABLE} onClick={() => setTool(AVAILABLE)} color={STATE_STYLE[AVAILABLE].bg} label="可排課" />
          <ToolChip active={tool === BUSY} onClick={() => setTool(BUSY)} color={STATE_STYLE[BUSY].bg} label="在序曲上課" />
          <ToolChip active={tool === ERASER} onClick={() => setTool(ERASER)} color="#fff" label="清除" outlined />
          <span className="ml-auto text-xs text-black/45">按住拖曳可連續塗；再塗一次同色可清除</span>
        </div>
      </section>

      {isDraft && (
        <div className="mb-3 rounded-xl bg-brand/10 px-3 py-2 text-xs leading-relaxed text-brand">
          已帶入你<b>上個月</b>的排課做參考～確認或調整後，記得按最下面的
          <b>「完成填寫，送出」</b>，這個月才會更新哦 🙂
        </div>
      )}

      {/* 手機版：一次一天（直向清單，好點好拖） */}
      <div className="sm:hidden">
        {/* 星期：七等分、不用左右滑 */}
        <div className="mb-3 grid grid-cols-7 gap-1">
          {DAYS.map((d) => {
            const has = SLOTS.some((s) => isOpen(d, s) && cells[keyOf(d.key, s)]);
            const active = d.key === selectedDay;
            return (
              <button
                key={d.key}
                onClick={() => setSelectedDay(d.key)}
                className={`relative rounded-lg py-2 text-xs transition active:scale-90 ${
                  active
                    ? "bg-navy text-white shadow-sm"
                    : "border border-black/15 bg-white text-black/70"
                }`}
              >
                {d.label}
                {has && (
                  <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-brand" />
                )}
              </button>
            );
          })}
        </div>
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-sm">
          {loading ? (
            <div className="py-10 text-center text-sm text-black/45">載入中…</div>
          ) : (
            SLOTS.filter((slot) =>
              isOpen(DAYS.find((d) => d.key === selectedDay)!, slot)
            ).map((slot) => {
              const k = keyOf(selectedDay, slot);
              const value = cells[k] ?? null;
              return (
                <div
                  key={slot}
                  className="flex items-center gap-2 border-b border-black/5 px-2 py-1.5"
                >
                  {/* 左側時間：可正常上下捲動（不會塗到格子） */}
                  <span className="w-[92px] shrink-0 pl-1 text-xs text-black/55">
                    {hhmm(slot)}–{hhmm(slot + STEP)}
                  </span>
                  {/* 右側色塊：點一下或按住往下拖來填 */}
                  <span
                    data-cell={k}
                    data-day={selectedDay}
                    data-slot={slot}
                    data-open="1"
                    onPointerDown={(e) => {
                      e.preventDefault();
                      if (tool !== ERASER) spawnNote(e.clientX, e.clientY);
                      startPaint(selectedDay, slot, true);
                    }}
                    className="flex-1 touch-none rounded-lg py-3 text-center text-xs font-medium transition-colors"
                    style={{
                      background: value ? STATE_STYLE[value].bg : "#f6f2ea",
                      color: value ? "#fff" : "rgba(0,0,0,0.35)",
                    }}
                  >
                    <span key={value ?? "e"} className="cell-pop inline-block">
                      {value ? STATE_STYLE[value].label : "－"}
                    </span>
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 電腦版週表 */}
      <div className="relative hidden overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm sm:block">
        {loading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/70 text-sm text-black/50">
            載入中…
          </div>
        )}
        <table className="w-full border-separate border-spacing-0 text-center text-xs select-none">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-14 bg-navy px-1 py-2 text-white">時間</th>
              {DAYS.map((d) => (
                <th key={d.key} className="min-w-[92px] bg-navy px-1 py-2 font-medium text-white">
                  {d.label}
                  <div className="text-[10px] font-normal text-white/55">
                    {hhmm(d.start)}–{hhmm(d.end)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SLOTS.map((slot) => {
              const onHour = slot % 60 === 0;
              return (
                <tr key={slot}>
                  <td
                    className={`sticky left-0 z-10 w-14 px-1 text-[10px] text-black/55 ${onHour ? "font-semibold text-black/75" : ""}`}
                    style={{ background: "#f3ece1" }}
                  >
                    {hhmm(slot)}
                  </td>
                  {DAYS.map((d) => {
                    const open = isOpen(d, slot);
                    const k = keyOf(d.key, slot);
                    const value = cells[k] ?? null;
                    return (
                      <td
                        key={d.key}
                        data-cell={k}
                        data-day={d.key}
                        data-slot={slot}
                        data-open={open ? "1" : "0"}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          if (open && tool !== ERASER) spawnNote(e.clientX, e.clientY);
                          startPaint(d.key, slot, open);
                        }}
                        className={`p-[2px] ${onHour ? "border-t border-black/10" : "border-t border-black/[0.04]"} ${open ? "cursor-pointer touch-none" : "cursor-not-allowed"}`}
                      >
                        {open ? (
                          <div
                            className="flex h-6 items-center justify-center rounded-md transition-colors duration-150"
                            style={{ background: value ? STATE_STYLE[value].bg : "#f6f2ea" }}
                          >
                            {value && <span key={value} className="cell-fill h-full w-full rounded-md" style={{ background: STATE_STYLE[value].bg }} />}
                          </div>
                        ) : (
                          <div className="h-6 rounded-md" style={{ background: "repeating-linear-gradient(45deg,#ece7df,#ece7df 4px,#e2dcd1 4px,#e2dcd1 8px)" }} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 統計 + 進度 + 儲存狀態 */}
      <section className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="rounded-xl px-3 py-1.5 font-medium text-white shadow-sm" style={{ background: STATE_STYLE[AVAILABLE].bg }}>
          可排課 {summary.available} 格（約 {(summary.available / 2).toFixed(1)} 小時）
        </span>
        <span className="rounded-xl px-3 py-1.5 font-medium text-white shadow-sm" style={{ background: STATE_STYLE[BUSY].bg }}>
          在序曲上課 {summary.busy} 格（約 {(summary.busy / 2).toFixed(1)} 小時）
        </span>
        <span className="text-black/55">{progressCheer(summary.available + summary.busy)}</span>
        <span className="ml-auto text-xs text-black/45">
          {save === "saving" && "儲存中…"}
          {save === "saved" && "✓ 已自動儲存"}
          {save === "error" && <span className="text-brand">儲存失敗，請檢查網路</span>}
          {save === "idle" && "會自動儲存"}
        </span>
      </section>

      {/* 送出／更新 */}
      <div className="mt-5 flex flex-col items-center gap-2">
        <button
          onClick={submit}
          className="rounded-full bg-brand px-8 py-3 text-sm font-semibold text-white shadow-md transition hover:brightness-110 active:scale-95"
        >
          {confirmedAt ? "更新排課（確認送出）💛" : "完成填寫，送出 💛"}
        </button>
        <p className="text-xs text-black/45">
          {confirmedAt
            ? `最後更新：${fmtTime(confirmedAt)}　沒有更動也請按一下確認更新`
            : "沒有更動也要按一下，才算完成這個月的確認"}
        </p>
      </div>

      {celebrate && <Celebrate name={teacher.name} onClose={() => setCelebrate(false)} />}

      {/* 填格時飄升的音符 */}
      {notes.map((n) => (
        <span
          key={n.id}
          className="float-note pointer-events-none fixed z-50 select-none text-lg text-brand"
          style={{ left: n.x - 8, top: n.y - 12 }}
        >
          {n.ch}
        </span>
      ))}
    </main>
  );
}

function ToolChip({
  active,
  onClick,
  color,
  label,
  outlined,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  label: string;
  outlined?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition ${active ? "border-navy bg-navy/5 ring-2 ring-navy/30" : "border-black/15 hover:border-black/40"}`}
    >
      <span className="inline-block h-3.5 w-3.5 rounded-full" style={{ background: color, border: outlined ? "1px solid #bbb" : "none" }} />
      {label}
    </button>
  );
}

function Celebrate({ name, onClose }: { name: string; onClose: () => void }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.5,
        color: ["#8CA07C", "#E5A661", "#C1272D", "#3B352F", "#E4B363"][i % 5],
        rot: Math.random() * 360,
      })),
    []
  );
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {pieces.map((p, i) => (
          <span
            key={i}
            className="confetti absolute top-0 h-2.5 w-2.5 rounded-[2px]"
            style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, transform: `rotate(${p.rot}deg)` }}
          />
        ))}
      </div>
      <div className="celebrate-card relative mx-4 w-full max-w-xs rounded-3xl bg-white p-6 text-center shadow-xl">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#8CA07C] text-3xl text-white">
          ✓
        </div>
        <h2 className="text-lg font-bold text-navy">送出成功！</h2>
        <p className="mt-1 text-sm text-black/60">
          謝謝你，{name}老師 💛<br />這個月的排課已經收到囉～
        </p>
        <button
          onClick={onClose}
          className="mt-4 rounded-full bg-navy px-6 py-2 text-sm font-semibold text-white transition hover:bg-navy/90"
        >
          好
        </button>
      </div>
    </div>
  );
}
