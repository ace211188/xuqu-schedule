"use client";

import { useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import { fmtMoney, type Entry } from "@/lib/accounting";
import type { AccountingData } from "./useAccountingData";
import { Card, Empty, SectionTitle, Select } from "./ui";
import { CountMoney, Reveal } from "./anim";

function thisMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return `${y} 年 ${Number(m)} 月`;
}

// 該月最後一天的 YYYY-MM-DD（給期末餘額用）
function monthEndISO(key: string) {
  const [y, m] = key.split("-").map(Number);
  const day = new Date(y, m, 0).getDate();
  return `${key}-${String(day).padStart(2, "0")}`;
}

export default function Monthly({
  data,
}: {
  teacher: Teacher;
  data: AccountingData;
}) {
  const { entries, accounts, categories } = data;

  const catName = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories]
  );

  // 有資料的月份（新→舊），並確保含本月
  const months = useMemo(() => {
    const set = new Set<string>(entries.map((e) => e.occurred_on.slice(0, 7)));
    set.add(thisMonthKey());
    return [...set].sort().reverse();
  }, [entries]);

  const [month, setMonth] = useState(thisMonthKey());

  const monthEntries = useMemo(
    () => entries.filter((e) => e.occurred_on.slice(0, 7) === month),
    [entries, month]
  );

  // 內部轉帳（帳戶間搬錢）不是真正的收入/支出，會被記成一出一入兩筆，
  // 計入收支只會兩邊同時灌水。故收支與分類明細一律排除轉帳分錄。
  const flowEntries = useMemo(
    () => monthEntries.filter((e) => e.source_type !== "transfer"),
    [monthEntries]
  );

  const income = flowEntries.reduce(
    (s, e) => s + (e.signed_amount > 0 ? e.signed_amount : 0),
    0
  );
  const expense = flowEntries.reduce(
    (s, e) => s + (e.signed_amount < 0 ? -e.signed_amount : 0),
    0
  );
  const net = income - expense;

  // 分類明細（收入 / 支出 分開）
  const byCat = useMemo(() => {
    const inc = new Map<string, number>();
    const exp = new Map<string, number>();
    for (const e of flowEntries) {
      const key = e.category_id ?? "__none__";
      if (e.signed_amount > 0)
        inc.set(key, (inc.get(key) ?? 0) + e.signed_amount);
      else exp.set(key, (exp.get(key) ?? 0) + -e.signed_amount);
    }
    const toRows = (m: Map<string, number>) =>
      [...m.entries()]
        .map(([id, amt]) => ({
          id,
          name: id === "__none__" ? "未分類" : catName.get(id) ?? "未分類",
          amt,
        }))
        .sort((a, b) => b.amt - a.amt);
    return { inc: toRows(inc), exp: toRows(exp) };
  }, [flowEntries, catName]);

  // 各帳戶「期末餘額」＝期初 + 該月底(含)以前所有分錄
  const end = monthEndISO(month);
  const perAccount = useMemo(() => {
    return accounts
      .filter((a) => a.active)
      .map((a) => {
        const sum = entries
          .filter((e) => e.account_id === a.id && e.occurred_on <= end)
          .reduce((s, e) => s + e.signed_amount, 0);
        return { id: a.id, name: a.name, balance: a.opening_balance + sum };
      });
  }, [accounts, entries, end]);
  const totalEnd = perAccount.reduce((s, a) => s + a.balance, 0);

  return (
    <div className="space-y-4 acc-panel">
      {/* 月份選擇 */}
      <div className="flex items-center gap-2">
        <Select
          className="w-40"
          value={month}
          onChange={setMonth}
          options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
        />
        {month === thisMonthKey() && (
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
            本月（進行中）
          </span>
        )}
      </div>

      {monthEntries.length === 0 ? (
        <Empty>這個月還沒有帳目</Empty>
      ) : (
        <>
          {/* 三大數字 */}
          <div className="grid grid-cols-3 gap-2">
            <Reveal delay={0}>
              <Card className="acc-hover p-3">
                <div className="text-xs text-black/50">總收入</div>
                <CountMoney
                  value={income}
                  className="mt-1 block text-base font-bold text-[#5f7a4f]"
                />
              </Card>
            </Reveal>
            <Reveal delay={60}>
              <Card className="acc-hover p-3">
                <div className="text-xs text-black/50">總支出</div>
                <CountMoney
                  value={expense}
                  className="mt-1 block text-base font-bold text-brand"
                />
              </Card>
            </Reveal>
            <Reveal delay={120}>
              <Card className="acc-hover p-3">
                <div className="text-xs text-black/50">淨額</div>
                <CountMoney
                  value={net}
                  className={`mt-1 block text-base font-bold ${
                    net >= 0 ? "text-navy" : "text-brand"
                  }`}
                />
              </Card>
            </Reveal>
          </div>

          {/* 分類明細（點類別可展開該類別的每一筆，支援日期/金額正倒序）*/}
          <section>
            <SectionTitle>支出分類</SectionTitle>
            <CatBars
              rows={byCat.exp}
              tone="brand"
              entries={flowEntries}
              catName={catName}
            />
          </section>
          <section>
            <SectionTitle>收入分類</SectionTitle>
            <CatBars
              rows={byCat.inc}
              tone="ok"
              entries={flowEntries}
              catName={catName}
            />
          </section>

          {/* 期末餘額 */}
          <section>
            <SectionTitle>{monthLabel(month)}期末各帳戶餘額</SectionTitle>
            <Card className="divide-y divide-black/5 p-0">
              {perAccount.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span className="text-black/60">{a.name}</span>
                  <span className="tabular-nums font-medium text-navy">
                    {fmtMoney(a.balance)}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between bg-black/[0.02] px-4 py-2.5 text-sm">
                <span className="font-medium text-black/60">合計</span>
                <CountMoney
                  value={totalEnd}
                  className="font-bold text-navy"
                />
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}

function shortDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

type SortKey = "date" | "amount";
type SortDir = "asc" | "desc";

function CatBars({
  rows,
  tone,
  entries,
  catName,
}: {
  rows: { id: string; name: string; amt: number }[];
  tone: "brand" | "ok";
  entries: Entry[];
  catName: Map<string, string>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  // 每個類別展開時各自記住排序方式；預設日期新→舊
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const max = Math.max(1, ...rows.map((r) => r.amt));
  const color = tone === "brand" ? "bg-brand/70" : "bg-[#8CA07C]";
  const text = tone === "brand" ? "text-brand" : "text-[#5f7a4f]";
  const wantSign = tone === "brand" ? -1 : 1; // 支出取負、收入取正

  function toggle(id: string) {
    setOpenId((cur) => (cur === id ? null : id));
    setSortKey("date");
    setSortDir("desc");
  }

  if (rows.length === 0)
    return <p className="px-1 text-sm text-black/35">本月無</p>;

  return (
    <div className="space-y-1.5">
      {rows.map((r, i) => {
        const open = openId === r.id;
        // 該類別本月的每一筆（依收/支別過濾；未分類的 id 為 __none__）
        const items = open
          ? entries
              .filter(
                (e) =>
                  (e.category_id ?? "__none__") === r.id &&
                  Math.sign(e.signed_amount) === wantSign
              )
              .sort((a, b) => {
                const d =
                  sortKey === "amount"
                    ? Math.abs(a.signed_amount) - Math.abs(b.signed_amount)
                    : a.occurred_on.localeCompare(b.occurred_on);
                return sortDir === "asc" ? d : -d;
              })
          : [];
        return (
          <div key={r.id}>
            {/* 類別列（點擊展開/收合）*/}
            <button
              onClick={() => toggle(r.id)}
              className="flex w-full items-center gap-2 text-left"
            >
              <span className="flex w-24 shrink-0 items-center gap-1 truncate text-sm text-black/60">
                <span
                  className={`text-[10px] text-black/30 transition-transform ${
                    open ? "rotate-90" : ""
                  }`}
                >
                  ▶
                </span>
                <span className="truncate">{r.name}</span>
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded-full bg-black/[0.04]">
                <div
                  className={`acc-bar h-full rounded-full ${color}`}
                  style={{
                    width: `${(r.amt / max) * 100}%`,
                    animationDelay: `${Math.min(i, 8) * 50}ms`,
                  }}
                />
              </div>
              <span
                className={`w-20 shrink-0 text-right text-sm tabular-nums ${text}`}
              >
                {fmtMoney(r.amt)}
              </span>
            </button>

            {/* 展開：該類別逐筆明細 + 排序切換 */}
            {open && (
              <div className="mt-1.5 rounded-xl border border-black/8 bg-black/[0.015] p-2">
                <div className="mb-1 flex items-center gap-1.5 px-1">
                  <span className="mr-auto text-[11px] text-black/40">
                    {items.length} 筆
                  </span>
                  <SortBtn
                    active={sortKey === "date"}
                    dir={sortDir}
                    onClick={() => {
                      if (sortKey === "date")
                        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else {
                        setSortKey("date");
                        setSortDir("desc");
                      }
                    }}
                  >
                    日期
                  </SortBtn>
                  <SortBtn
                    active={sortKey === "amount"}
                    dir={sortDir}
                    onClick={() => {
                      if (sortKey === "amount")
                        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                      else {
                        setSortKey("amount");
                        setSortDir("desc");
                      }
                    }}
                  >
                    金額
                  </SortBtn>
                </div>
                {items.length === 0 ? (
                  <p className="px-1 py-1 text-xs text-black/35">本月無</p>
                ) : (
                  <div className="divide-y divide-black/5">
                    {items.map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center gap-2 px-1 py-1.5 text-sm"
                      >
                        <span className="w-9 shrink-0 text-[11px] text-black/45">
                          {shortDate(e.occurred_on)}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-black/70">
                          {e.note ||
                            (e.category_id
                              ? catName.get(e.category_id)
                              : "—")}
                        </span>
                        <span
                          className={`shrink-0 tabular-nums ${text}`}
                        >
                          {fmtMoney(Math.abs(e.signed_amount))}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SortBtn({
  active,
  dir,
  onClick,
  children,
}: {
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
        active
          ? "bg-navy text-white"
          : "bg-white text-black/50 hover:text-navy"
      }`}
    >
      {children}
      {active && (dir === "asc" ? " ↑" : " ↓")}
    </button>
  );
}
