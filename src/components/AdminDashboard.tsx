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
  hhmm,
  isOpen,
  keyOf,
  monthOptions,
  type CellValue,
} from "@/lib/schedule";
import NotificationCenter from "./NotificationCenter";
import { enablePush, pushSupported } from "@/lib/push";

type TeacherStat = {
  id: string;
  name: string;
  available: number;
  busy: number;
  cells: Record<string, CellValue>;
  note: string;
  confirmedAt: string | null; // 所顯示月份的送出時間
  fromMonth: string; // 實際顯示的是哪個月（本月或最近送出月）
  fallback: boolean; // true＝本月未送出，顯示的是其他月份
  submitted: boolean; // 本月已送出
};

// "2026-08" → "8 月"
function moLabel(m: string) {
  return `${Number(m.split("-")[1])} 月`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
}

function adminHi(d = new Date()) {
  const h = d.getHours();
  if (h >= 5 && h < 11) return "早安 ☀️";
  if (h >= 11 && h < 14) return "午安 🍱";
  if (h >= 14 && h < 18) return "下午好 ☕";
  if (h >= 18 && h < 22) return "晚安 🌙";
  return "夜深了 🌌";
}

export default function AdminDashboard({
  teacher,
  onSignOut,
  onSwitchModule,
  onOpenMySchedule,
  onOpenStudents,
}: {
  teacher: Teacher;
  onSignOut: () => void;
  onSwitchModule?: () => void;
  onOpenMySchedule?: () => void;
  onOpenStudents?: () => void;
}) {
  const months = useMemo(() => monthOptions(new Date(), 4), []);
  // 預設這個月：與老師端「我的排課」一致
  const [month, setMonth] = useState(months[0].value);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TeacherStat[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creds, setCreds] = useState<
    { name: string; username: string; password: string }[]
  >([]);
  const [showCreds, setShowCreds] = useState(false);

  // 管理員打開後台就請求通知權限並訂閱（含換金鑰後自動重訂），讓宇群收得到推播
  useEffect(() => {
    if (pushSupported()) enablePush(teacher.id);
  }, [teacher.id]);

  useEffect(() => {
    supabase
      .from("teacher_credentials")
      .select("username,password,teachers(name)")
      .then(({ data }) => {
        const rows = (data ?? []).map((r) => ({
          name: (r.teachers as unknown as { name: string })?.name ?? "",
          username: r.username as string,
          password: r.password as string,
        }));
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setCreds(rows);
      });
  }, []);

  const reqSeq = useRef(0);
  const reload = useCallback(async () => {
    const seq = ++reqSeq.current;
    setLoading(true);
    const [{ data: teachers }, { data: slots }, { data: metas }] =
      await Promise.all([
        supabase
          .from("teachers")
          .select("id,name,is_admin")
          // 收集全部會教課的老師（含宇群）；只排除教室端裝置帳號「管理員」
          .neq("name", "管理員")
          .order("name"),
        supabase
          .from("schedule_slots")
          .select("teacher_id,day,slot,state")
          .eq("month", month),
        supabase
          .from("monthly_meta")
          .select("teacher_id,note,confirmed_at")
          .eq("month", month),
      ]);
    if (seq !== reqSeq.current) return; // 有更新的請求進來，丟棄舊結果

    // 本月：格子與 meta
    const byTeacher = new Map<string, Record<string, CellValue>>();
    for (const r of slots ?? []) {
      const m = byTeacher.get(r.teacher_id) ?? {};
      m[keyOf(r.day, r.slot)] = r.state as CellValue;
      byTeacher.set(r.teacher_id, m);
    }
    const metaByTeacher = new Map<
      string,
      { note: string; confirmed_at: string | null }
    >();
    for (const m of metas ?? [])
      metaByTeacher.set(m.teacher_id, {
        note: m.note ?? "",
        confirmed_at: m.confirmed_at ?? null,
      });

    // 「本月已送出」＝ monthly_meta 有 confirmed_at（按過送出）。未送出者改抓最近
    // 一次送出的月份（老師端每點一格會即時存草稿，故不能只看有沒有格子）。
    const list = (teachers ?? []) as { id: string; name: string }[];
    const needFallback = list
      .map((t) => t.id)
      .filter((id) => !metaByTeacher.get(id)?.confirmed_at);

    const fbMonth = new Map<string, string>(); // teacher → 最近送出月份
    const fbMeta = new Map<
      string,
      { note: string; confirmed_at: string | null }
    >();
    if (needFallback.length) {
      const { data: fbMetas } = await supabase
        .from("monthly_meta")
        .select("teacher_id,month,note,confirmed_at")
        .in("teacher_id", needFallback)
        .neq("month", month)
        .not("confirmed_at", "is", null)
        .order("month", { ascending: false });
      for (const m of fbMetas ?? []) {
        if (!fbMonth.has(m.teacher_id)) {
          fbMonth.set(m.teacher_id, m.month as string);
          fbMeta.set(m.teacher_id, {
            note: m.note ?? "",
            confirmed_at: m.confirmed_at ?? null,
          });
        }
      }
    }

    // 抓 fallback 月份的格子（只取每位老師「最近送出月」那一份）
    const fbCells = new Map<string, Record<string, CellValue>>();
    if (fbMonth.size) {
      const ids = [...fbMonth.keys()];
      const uniqMonths = [...new Set(fbMonth.values())];
      const { data: fbSlots } = await supabase
        .from("schedule_slots")
        .select("teacher_id,month,day,slot,state")
        .in("teacher_id", ids)
        .in("month", uniqMonths);
      for (const r of fbSlots ?? []) {
        if (fbMonth.get(r.teacher_id) !== r.month) continue;
        const m = fbCells.get(r.teacher_id) ?? {};
        m[keyOf(r.day, r.slot)] = r.state as CellValue;
        fbCells.set(r.teacher_id, m);
      }
    }
    if (seq !== reqSeq.current) return;

    const out: TeacherStat[] = list.map((t) => {
      const submitted = !!metaByTeacher.get(t.id)?.confirmed_at;
      const useFallback = !submitted && fbMonth.has(t.id);
      const cells = submitted
        ? byTeacher.get(t.id) ?? {}
        : useFallback
        ? fbCells.get(t.id) ?? {}
        : {};
      let available = 0,
        busy = 0;
      for (const v of Object.values(cells)) {
        if (v === AVAILABLE) available++;
        else if (v === BUSY) busy++;
      }
      const meta = submitted
        ? metaByTeacher.get(t.id)
        : useFallback
        ? fbMeta.get(t.id)
        : undefined;
      return {
        id: t.id,
        name: t.name,
        available,
        busy,
        cells,
        note: meta?.note ?? "",
        confirmedAt: meta?.confirmed_at ?? null,
        fromMonth: useFallback ? fbMonth.get(t.id)! : month,
        fallback: useFallback,
        submitted,
      };
    });
    setStats(out);
    setLoading(false);
  }, [month]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 老師更新後即時反映：切回本分頁 / 視窗重新聚焦時自動重抓
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") reload();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [reload]);

  const filledCount = stats.filter((s) => s.submitted).length;
  const selectedStat = stats.find((s) => s.id === selected) ?? null;

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy">
            {adminHi()} {teacher.name}
          </h1>
          <p className="text-sm text-black/60">排課收集 · 管理後台</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenMySchedule && (
            <button
              onClick={onOpenMySchedule}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              🗓️ 我的排課
            </button>
          )}
          {onSwitchModule && (
            <button
              onClick={onSwitchModule}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              💰 記帳
            </button>
          )}
          {onOpenStudents && (
            <button
              onClick={onOpenStudents}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              🎓 學生資料
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

      {/* 月份 + 總覽 */}
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl border border-black/10 bg-white/70 p-3">
        <span className="text-sm text-black/70">查看月份</span>
        <select
          value={month}
          onChange={(e) => {
            setMonth(e.target.value);
            setSelected(null);
          }}
          className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy"
        >
          {months.map((m) => (
            <option key={m.value} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
        <button
          onClick={reload}
          disabled={loading}
          className="rounded-lg border border-black/15 bg-white px-3 py-1.5 text-sm text-black/60 transition hover:border-navy disabled:opacity-50"
        >
          {loading ? "更新中…" : "🔄 重新整理"}
        </button>
        {!loading && (
          <span className="ml-auto rounded-full bg-navy px-3 py-1 text-xs font-medium text-white">
            {filledCount} / {stats.length} 位老師已填
          </span>
        )}
      </div>

      {/* 通知中心：手動發送 + 過往紀錄（僅管理員） */}
      {teacher.is_admin && <NotificationCenter teacher={teacher} />}

      {/* 帳號密碼一覽（僅管理員；含全部老師密碼） */}
      {teacher.is_admin && (
      <div className="mb-4">
        <button
          onClick={() => setShowCreds((v) => !v)}
          className="flex w-full items-center justify-between rounded-2xl border border-black/10 bg-white/70 px-4 py-2.5 text-sm font-medium text-navy transition hover:bg-white"
        >
          <span>🔑 老師帳號密碼一覽（忘記時查）</span>
          <span className="text-black/40">{showCreds ? "▲ 收合" : "▼ 展開"}</span>
        </button>
        {showCreds && (
          <div className="mt-2 overflow-hidden rounded-2xl border border-black/10 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-black/[0.03] text-xs text-black/50">
                <tr>
                  <th className="px-4 py-2">老師</th>
                  <th className="px-4 py-2">帳號</th>
                  <th className="px-4 py-2">密碼</th>
                </tr>
              </thead>
              <tbody>
                {creds.map((c) => (
                  <tr key={c.username} className="border-t border-black/5">
                    <td className="px-4 py-2 font-medium">{c.name}</td>
                    <td className="px-4 py-2 font-mono text-black/70">{c.username}</td>
                    <td className="px-4 py-2 font-mono text-black/70">{c.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-4 py-2 text-xs text-black/40">
              只有管理員看得到這個表。
            </p>
          </div>
        )}
      </div>
      )}

      {loading ? (
        <div className="py-16 text-center text-sm text-black/45">載入中…</div>
      ) : (
        <>
          {/* 老師清單 */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {stats.map((s) => {
              const active = s.id === selected;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelected(active ? null : s.id)}
                  className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition ${
                    active
                      ? "border-navy ring-2 ring-navy/30"
                      : "border-black/10 hover:border-black/25"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-navy">{s.name}老師</span>
                    {s.submitted ? (
                      <span className="rounded-full bg-[#8CA07C]/15 px-2 py-0.5 text-xs font-medium text-[#5f7a4f]">
                        已送出
                      </span>
                    ) : s.fallback ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        顯示 {moLabel(s.fromMonth)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                        尚未填寫
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex gap-4 text-sm">
                    <span>
                      <span className="text-black/45">可排課 </span>
                      <b style={{ color: STATE_STYLE[AVAILABLE].textColor }}>
                        {(s.available / 2).toFixed(1)}
                      </b>
                      <span className="text-black/45"> 小時</span>
                    </span>
                    <span>
                      <span className="text-black/45">上課 </span>
                      <b style={{ color: STATE_STYLE[BUSY].textColor }}>
                        {(s.busy / 2).toFixed(1)}
                      </b>
                      <span className="text-black/45"> 小時</span>
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-black/45">
                    <span>
                      {s.submitted && s.confirmedAt
                        ? `最後送出 ${fmtTime(s.confirmedAt)}`
                        : s.fallback && s.confirmedAt
                        ? `最近送出 ${fmtTime(s.confirmedAt)}（${moLabel(s.fromMonth)}）`
                        : "尚未確認更新"}
                    </span>
                    {s.note && (
                      <span className="rounded bg-brand/10 px-1.5 py-0.5 text-brand">
                        📝 有備註
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-black/40">
                    {active ? "▲ 收合" : "▼ 點開看週表與備註"}
                  </p>
                </button>
              );
            })}
          </div>

          {/* 選中的老師：唯讀週表 */}
          {selectedStat && (
            <section className="mt-5">
              <h2 className="mb-2 text-sm font-semibold text-navy">
                {selectedStat.name}老師 · {selectedStat.fromMonth} 週表
              </h2>
              {selectedStat.fallback && (
                <div className="mb-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  本月（{month}）尚未送出，以下為最近一次送出的
                  <b> {moLabel(selectedStat.fromMonth)}</b>排課。
                </div>
              )}
              {selectedStat.note && (
                <div className="mb-2 rounded-xl bg-brand/5 px-3 py-2 text-sm text-black/70">
                  <span className="font-medium text-brand">📝 備註：</span>
                  <span className="whitespace-pre-wrap">{selectedStat.note}</span>
                </div>
              )}
              <ReadOnlyGrid cells={selectedStat.cells} />
            </section>
          )}
        </>
      )}
    </main>
  );
}

function ReadOnlyGrid({ cells }: { cells: Record<string, CellValue> }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-black/10 bg-white shadow-sm">
      <table className="w-full border-separate border-spacing-0 text-center text-xs">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 w-14 bg-navy px-1 py-2 text-white">時間</th>
            {DAYS.map((d) => (
              <th key={d.key} className="min-w-[80px] bg-navy px-1 py-2 font-medium text-white">
                {d.label}
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
                  const value = cells[keyOf(d.key, slot)] ?? null;
                  return (
                    <td
                      key={d.key}
                      className={`p-[2px] ${onHour ? "border-t border-black/10" : "border-t border-black/[0.04]"}`}
                    >
                      {open ? (
                        <div
                          className="h-6 rounded-md"
                          style={{ background: value ? STATE_STYLE[value].bg : "#f6f2ea" }}
                        />
                      ) : (
                        <div
                          className="h-6 rounded-md"
                          style={{ background: "repeating-linear-gradient(45deg,#ece7df,#ece7df 4px,#e2dcd1 4px,#e2dcd1 8px)" }}
                        />
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
  );
}
