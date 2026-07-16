"use client";

import { useEffect, useMemo, useState } from "react";
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

type TeacherStat = {
  id: string;
  name: string;
  filled: boolean;
  available: number;
  busy: number;
  cells: Record<string, CellValue>;
  note: string;
  confirmedAt: string | null;
};

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
}: {
  teacher: Teacher;
  onSignOut: () => void;
}) {
  const months = useMemo(() => monthOptions(new Date(), 4), []);
  const [month, setMonth] = useState(months[1]?.value ?? months[0].value);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<TeacherStat[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creds, setCreds] = useState<
    { name: string; username: string; password: string }[]
  >([]);
  const [showCreds, setShowCreds] = useState(false);

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

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const [{ data: teachers }, { data: slots }, { data: metas }] =
        await Promise.all([
          supabase
            .from("teachers")
            .select("id,name,is_admin")
            .eq("is_admin", false)
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
      if (!active) return;

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

      const out: TeacherStat[] = (teachers ?? []).map((t) => {
        const cells = byTeacher.get(t.id) ?? {};
        let available = 0,
          busy = 0;
        for (const v of Object.values(cells)) {
          if (v === AVAILABLE) available++;
          else if (v === BUSY) busy++;
        }
        const meta = metaByTeacher.get(t.id);
        return {
          id: t.id,
          name: t.name,
          filled: available + busy > 0,
          available,
          busy,
          cells,
          note: meta?.note ?? "",
          confirmedAt: meta?.confirmed_at ?? null,
        };
      });
      setStats(out);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [month]);

  const filledCount = stats.filter((s) => s.filled).length;
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
        <button
          onClick={onSignOut}
          className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
        >
          登出
        </button>
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
        {!loading && (
          <span className="ml-auto rounded-full bg-navy px-3 py-1 text-xs font-medium text-white">
            {filledCount} / {stats.length} 位老師已填
          </span>
        )}
      </div>

      {/* 帳號密碼一覽（老師忘記時可查） */}
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
                    {s.filled ? (
                      <span className="rounded-full bg-[#8CA07C]/15 px-2 py-0.5 text-xs font-medium text-[#5f7a4f]">
                        已填
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
                      {s.confirmedAt
                        ? `最後更新 ${fmtTime(s.confirmedAt)}`
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
                {selectedStat.name}老師 · {month} 週表
              </h2>
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
