"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fmtMoney, type Student } from "@/lib/students";
import {
  deleteTeacherCost,
  fetchFixedOverhead,
  fetchMonthlyHours,
  fetchTeacherCosts,
  updateFixedOverhead,
  upsertMonthlyHours,
  upsertTeacherCost,
  type MonthlyHours,
  type ProfitResult,
  type TeacherCost,
} from "@/lib/profit";

// ── 資料 hook：老師成本設定 / 當月時數 / 固定開銷（僅管理員會用）──
export function useProfitData(month: string, enabled: boolean) {
  const [costs, setCosts] = useState<TeacherCost[]>([]);
  const [hours, setHours] = useState<MonthlyHours[]>([]);
  const [overhead, setOverhead] = useState(80000);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const [c, h, o] = await Promise.all([
      fetchTeacherCosts(),
      fetchMonthlyHours(month),
      fetchFixedOverhead(),
    ]);
    setCosts(c);
    setHours(h);
    setOverhead(o);
    setLoading(false);
  }, [month, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { costs, hours, overhead, loading, refresh };
}

// 最近 6 個月選項
function recentMonths(n = 6): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 0; i < n; i++) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function monthLabel(m: string) {
  const [y, mm] = m.split("-");
  return `${y} 年 ${Number(mm)} 月`;
}

// ── 毛利面板（整體）──
export default function ProfitPanel({
  profit,
  month,
  onMonthChange,
  students,
  onRefresh,
}: {
  profit: ProfitResult;
  month: string;
  onMonthChange: (m: string) => void;
  students: Student[];
  onRefresh: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false);
  const months = useMemo(() => recentMonths(6), []);

  const marginPct = (profit.margin * 100).toFixed(1);
  const reached = profit.gapToOverhead <= 0;

  return (
    <div className="mb-4 rounded-2xl border border-navy/15 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-navy">
          📊 當月毛利
        </h2>
        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => onMonthChange(e.target.value)}
            className="rounded-full border border-black/15 bg-white px-3 py-1 text-xs outline-none focus:border-navy"
          >
            {months.map((m) => (
              <option key={m} value={m}>
                {monthLabel(m)}
              </option>
            ))}
          </select>
          <button
            onClick={() => setShowSettings(true)}
            className="rounded-full border border-black/15 px-3 py-1 text-xs text-black/60 transition hover:border-navy hover:text-navy"
          >
            ⚙ 成本設定
          </button>
        </div>
      </div>

      {/* 三大數字 */}
      <div className="grid grid-cols-3 gap-2">
        <Tile label="學費收入" value={fmtMoney(profit.revenue)} tone="income" />
        <Tile label="老師成本" value={fmtMoney(profit.teacherCost)} tone="cost" />
        <Tile
          label={`毛利（${marginPct}%）`}
          value={fmtMoney(profit.gross)}
          tone={profit.gross >= 0 ? "gross" : "cost"}
        />
      </div>

      {/* 距固定開銷目標 */}
      <div
        className={`mt-2 flex items-center justify-between rounded-xl px-3 py-2.5 text-sm ${
          reached
            ? "bg-[#8CA07C]/10 text-[#5f7a4f]"
            : "bg-brand/5 text-brand"
        }`}
      >
        <span>
          固定開銷目標 {fmtMoney(profit.fixedOverhead)}
        </span>
        <span className="font-semibold">
          {reached
            ? `✓ 已達標，超出 ${fmtMoney(-profit.gapToOverhead)}`
            : `還差 ${fmtMoney(profit.gapToOverhead)}`}
        </span>
      </div>

      {profit.unconfiguredTeachers.length > 0 && (
        <p className="mt-2 text-xs text-amber-600">
          ⚠ 有收入但未設定成本的老師：
          {profit.unconfiguredTeachers.join("、")}
          （這些收入的成本以 0 計，請按「成本設定」補上）
        </p>
      )}
      <p className="mt-1.5 text-[11px] text-black/35">
        毛利 = 當月學費收入（依繳費日）− 老師鐘點/拆帳成本。此區只有管理員看得到。
      </p>

      {showSettings && (
        <CostSettingsModal
          month={month}
          students={students}
          onClose={() => setShowSettings(false)}
          onSaved={onRefresh}
        />
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "income" | "cost" | "gross";
}) {
  const color =
    tone === "income"
      ? "text-[#5f7a4f]"
      : tone === "cost"
      ? "text-brand"
      : "text-navy";
  return (
    <div className="rounded-xl bg-black/[0.02] px-2 py-2 text-center">
      <div className="text-[11px] text-black/45">{label}</div>
      <div className={`mt-0.5 text-base font-bold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}

// ── 成本設定 modal ──
function CostSettingsModal({
  month,
  students,
  onClose,
  onSaved,
}: {
  month: string;
  students: Student[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [costs, setCosts] = useState<TeacherCost[]>([]);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [overhead, setOverhead] = useState("80000");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // 學生資料裡出現過的老師名字（供快速新增）
  const teachersInUse = useMemo(() => {
    const set = new Set<string>();
    for (const s of students) {
      const t = (s.teacher ?? "").trim();
      if (t) set.add(t);
    }
    return [...set].sort();
  }, [students]);

  const load = useCallback(async () => {
    const [c, h, o] = await Promise.all([
      fetchTeacherCosts(),
      fetchMonthlyHours(month),
      fetchFixedOverhead(),
    ]);
    setCosts(c);
    setHours(
      Object.fromEntries(h.map((x) => [x.teacher, String(x.hours)]))
    );
    setOverhead(String(o));
    setLoading(false);
  }, [month]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateRow(teacher: string, patch: Partial<TeacherCost>) {
    setCosts((prev) =>
      prev.map((c) => (c.teacher === teacher ? { ...c, ...patch } : c))
    );
  }

  function addTeacher(name: string) {
    if (!name.trim() || costs.some((c) => c.teacher === name.trim())) return;
    setCosts((prev) => [
      ...prev,
      {
        teacher: name.trim(),
        method: "split",
        split_pct: 50,
        hourly_rate: null,
        active: true,
      },
    ]);
  }

  async function saveAll() {
    setErr(null);
    setBusy(true);
    try {
      // 固定開銷
      const oh = Number(overhead);
      if (Number.isFinite(oh) && oh >= 0) await updateFixedOverhead(oh);
      // 各老師成本 + 鐘點時數
      for (const c of costs) {
        const r = await upsertTeacherCost({
          teacher: c.teacher,
          method: c.method,
          split_pct: c.method === "split" ? Number(c.split_pct ?? 0) : null,
          hourly_rate: c.method === "hourly" ? Number(c.hourly_rate ?? 0) : null,
          active: c.active,
        });
        if (r.error) throw new Error(r.error);
        if (c.method === "hourly") {
          const hv = Number(hours[c.teacher] ?? 0);
          await upsertMonthlyHours(c.teacher, month, Number.isFinite(hv) ? hv : 0);
        }
      }
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "儲存失敗");
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(teacher: string) {
    if (!confirm(`移除「${teacher}」的成本設定？`)) return;
    await deleteTeacherCost(teacher);
    setCosts((prev) => prev.filter((c) => c.teacher !== teacher));
  }

  const notAdded = teachersInUse.filter(
    (t) => !costs.some((c) => c.teacher === t)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl sm:rounded-3xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-navy">老師成本設定</h3>
          <button onClick={onClose} className="text-black/40 hover:text-black">
            ✕
          </button>
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-black/40">載入中…</p>
        ) : (
          <div className="space-y-4">
            {/* 固定開銷 */}
            <label className="block">
              <span className="text-xs text-black/50">每月固定開銷目標</span>
              <input
                type="number"
                inputMode="numeric"
                value={overhead}
                onChange={(e) => setOverhead(e.target.value)}
                className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm outline-none focus:border-navy"
              />
            </label>

            {/* 老師成本列表 */}
            <div className="space-y-2">
              <div className="text-xs text-black/50">
                每位老師的成本方式（{monthLabel(month)}）
              </div>
              {costs.length === 0 && (
                <p className="rounded-xl bg-black/[0.02] px-3 py-3 text-center text-xs text-black/40">
                  尚未設定任何老師成本。從下方「快速新增」開始。
                </p>
              )}
              {costs.map((c) => (
                <div
                  key={c.teacher}
                  className="rounded-xl border border-black/10 p-2.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-navy">{c.teacher}</span>
                    <button
                      onClick={() => removeRow(c.teacher)}
                      className="text-xs text-black/35 hover:text-brand"
                    >
                      移除
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {/* 方式切換 */}
                    <div className="flex overflow-hidden rounded-lg border border-black/15 text-xs">
                      {(["split", "hourly"] as const).map((m) => (
                        <button
                          key={m}
                          onClick={() => updateRow(c.teacher, { method: m })}
                          className={`px-2.5 py-1 transition ${
                            c.method === m
                              ? "bg-navy text-white"
                              : "text-black/55"
                          }`}
                        >
                          {m === "split" ? "拆帳%" : "鐘點"}
                        </button>
                      ))}
                    </div>
                    {c.method === "split" ? (
                      <label className="flex items-center gap-1 text-xs text-black/55">
                        抽成
                        <input
                          type="number"
                          inputMode="numeric"
                          value={c.split_pct ?? ""}
                          onChange={(e) =>
                            updateRow(c.teacher, {
                              split_pct: Number(e.target.value),
                            })
                          }
                          className="w-16 rounded-lg border border-black/15 px-2 py-1 text-right outline-none focus:border-navy"
                        />
                        %
                      </label>
                    ) : (
                      <>
                        <label className="flex items-center gap-1 text-xs text-black/55">
                          時薪
                          <input
                            type="number"
                            inputMode="numeric"
                            value={c.hourly_rate ?? ""}
                            onChange={(e) =>
                              updateRow(c.teacher, {
                                hourly_rate: Number(e.target.value),
                              })
                            }
                            className="w-20 rounded-lg border border-black/15 px-2 py-1 text-right outline-none focus:border-navy"
                          />
                        </label>
                        <label className="flex items-center gap-1 text-xs text-black/55">
                          本月時數
                          <input
                            type="number"
                            inputMode="numeric"
                            value={hours[c.teacher] ?? ""}
                            onChange={(e) =>
                              setHours((prev) => ({
                                ...prev,
                                [c.teacher]: e.target.value,
                              }))
                            }
                            className="w-16 rounded-lg border border-black/15 px-2 py-1 text-right outline-none focus:border-navy"
                          />
                        </label>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* 快速新增（從學生資料裡的老師） */}
            {notAdded.length > 0 && (
              <div>
                <div className="mb-1 text-xs text-black/50">快速新增老師</div>
                <div className="flex flex-wrap gap-1.5">
                  {notAdded.map((t) => (
                    <button
                      key={t}
                      onClick={() => addTeacher(t)}
                      className="rounded-full border border-black/15 px-2.5 py-1 text-xs text-black/60 hover:border-navy hover:text-navy"
                    >
                      ＋ {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {err && <p className="text-sm text-brand">{err}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={onClose}
                className="rounded-xl border border-black/15 px-4 py-2 text-sm text-black/60"
              >
                取消
              </button>
              <button
                onClick={saveAll}
                disabled={busy}
                className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? "儲存中…" : "儲存"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
