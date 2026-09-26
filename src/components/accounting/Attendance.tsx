"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchAttendanceReport,
  fmtMinutes,
  fmtTime,
  isOngoing,
  shiftMinutes,
  type AttendanceRow,
  type WorkerAttendance,
} from "@/lib/attendance";
import { Card, Empty, Select } from "./ui";

// 'YYYY-MM'（本地）
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthRange(key: string): { from: string; to: string } {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return { from: `${key}-01`, to: `${key}-${String(last).padStart(2, "0")}` };
}
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${y} 年 ${Number(m)} 月`;
}
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}（${WEEKDAY[new Date(y, m - 1, d).getDay()]}）`;
}

type Summary = {
  days: number;
  minutes: number; // 已簽退班次的總工時
  missing: number; // 忘記簽退（超過 16 小時仍未簽退）
  ongoing: boolean; // 目前上班中
};

function summarize(rows: AttendanceRow[], now: number): Summary {
  let minutes = 0;
  let missing = 0;
  let ongoing = false;
  for (const r of rows) {
    const m = shiftMinutes(r);
    if (m != null) minutes += m;
    else if (isOngoing(r, now)) ongoing = true;
    else missing += 1;
  }
  return { days: rows.length, minutes, missing, ongoing };
}

// 出勤：記帳成員（宇群/美君/奕寬）唯讀查看工讀生每月出勤與工時
export default function Attendance() {
  const [now] = useState(() => Date.now());
  const [month, setMonth] = useState(() => monthKey(new Date()));
  const [workers, setWorkers] = useState<WorkerAttendance[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // 最近 12 個月
  const months = useMemo(() => {
    const out: string[] = [];
    const d = new Date(now);
    for (let i = 0; i < 12; i++) {
      out.push(monthKey(new Date(d.getFullYear(), d.getMonth() - i, 1)));
    }
    return out;
  }, [now]);

  useEffect(() => {
    let active = true;
    const { from, to } = monthRange(month);
    fetchAttendanceReport(from, to).then(({ workers, error }) => {
      if (!active) return;
      setWorkers(workers);
      setErr(error);
    });
    return () => {
      active = false;
    };
  }, [month]);

  const summaries = useMemo(
    () => new Map((workers ?? []).map((w) => [w.workerId, summarize(w.rows, now)])),
    [workers, now]
  );
  const total = useMemo(() => {
    let days = 0;
    let minutes = 0;
    for (const s of summaries.values()) {
      days += s.days;
      minutes += s.minutes;
    }
    return { days, minutes };
  }, [summaries]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-40"
          value={month}
          onChange={(v) => {
            setWorkers(null);
            setOpen(null);
            setMonth(v);
          }}
          options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
        />
        {workers && workers.length > 0 && (
          <span className="text-sm text-black/55">
            合計 {total.days} 天・{fmtMinutes(total.minutes)}
          </span>
        )}
      </div>

      {err ? (
        <p className="rounded-xl bg-brand/5 px-3 py-2 text-sm text-brand">{err}</p>
      ) : workers === null ? (
        <div className="py-12 text-center text-sm text-black/45">載入中…</div>
      ) : workers.length === 0 ? (
        <Empty>還沒有工讀生帳號</Empty>
      ) : (
        <div className="space-y-2">
          {workers.map((w) => {
            const s = summaries.get(w.workerId)!;
            const isOpen = open === w.workerId;
            return (
              <Card key={w.workerId} className="p-0">
                <button
                  onClick={() => setOpen(isOpen ? null : w.workerId)}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left"
                >
                  <span className="font-semibold text-navy">{w.name}</span>
                  {s.ongoing && (
                    <span className="rounded-full bg-[#8CA07C]/15 px-2 py-0.5 text-xs font-medium text-[#5f7a4f]">
                      上班中
                    </span>
                  )}
                  {s.missing > 0 && (
                    <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                      {s.missing} 天未簽退
                    </span>
                  )}
                  <span className="ml-auto text-sm tabular-nums text-black/60">
                    {s.days} 天・<b className="text-navy">{fmtMinutes(s.minutes)}</b>
                  </span>
                  <span className="text-xs text-black/35">{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && (
                  <div className="border-t border-black/5">
                    {w.rows.length === 0 ? (
                      <p className="px-4 py-4 text-center text-sm text-black/40">
                        這個月沒有出勤紀錄
                      </p>
                    ) : (
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-black/[0.03] text-xs text-black/50">
                            <th className="px-4 py-2 text-left font-medium">日期</th>
                            <th className="px-2 py-2 text-right font-medium">簽到</th>
                            <th className="px-2 py-2 text-right font-medium">簽退</th>
                            <th className="px-4 py-2 text-right font-medium">工時</th>
                          </tr>
                        </thead>
                        <tbody>
                          {w.rows.map((r) => {
                            const m = shiftMinutes(r);
                            const ongoing = m == null && isOngoing(r, now);
                            return (
                              <tr key={r.work_date} className="border-t border-black/5">
                                <td className="px-4 py-2 text-navy">{dayLabel(r.work_date)}</td>
                                <td className="px-2 py-2 text-right tabular-nums">
                                  {fmtTime(r.check_in_at)}
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums">
                                  {r.check_out_at ? (
                                    fmtTime(r.check_out_at)
                                  ) : ongoing ? (
                                    <span className="text-[#5f7a4f]">上班中</span>
                                  ) : (
                                    <span className="font-medium text-brand">未簽退</span>
                                  )}
                                </td>
                                <td className="px-4 py-2 text-right tabular-nums">
                                  {m != null ? fmtMinutes(m) : "—"}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-black/40">
        工時＝簽退時間減簽到時間；「未簽退」的那天不計入工時。只有宇群、美君、奕寬看得到這頁。
      </p>
    </div>
  );
}
