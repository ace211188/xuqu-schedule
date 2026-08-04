"use client";

import { useState } from "react";
import { fmtMoney } from "@/lib/students";
import { updateFixedOverhead, type ProfitResult } from "@/lib/profit";

// ── 毛利面板（整體 + 各班別，可收合）──
export default function ProfitPanel({
  profit,
  onRefresh,
}: {
  profit: ProfitResult;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [editingOverhead, setEditingOverhead] = useState(false);
  const [overheadDraft, setOverheadDraft] = useState(String(profit.fixedOverhead));
  const [savingOh, setSavingOh] = useState(false);

  const marginPct = (profit.margin * 100).toFixed(1);
  const reached = profit.gapToOverhead <= 0;

  async function saveOverhead() {
    const v = Number(overheadDraft);
    if (!Number.isFinite(v) || v < 0) return;
    setSavingOh(true);
    await updateFixedOverhead(v);
    setSavingOh(false);
    setEditingOverhead(false);
    onRefresh();
  }

  return (
    <div className="mb-4 rounded-2xl border border-navy/15 bg-white shadow-sm">
      {/* 標題列（點擊收合） */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-navy">📊 毛利（每月）</span>
        <span className="ml-1 rounded-full bg-navy/10 px-2 py-0.5 text-xs font-medium text-navy">
          毛利 {fmtMoney(profit.gross)}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
            reached ? "bg-[#8CA07C]/15 text-[#5f7a4f]" : "bg-brand/10 text-brand"
          }`}
        >
          {reached ? "已達標" : `差 ${fmtMoney(profit.gapToOverhead)}`}
        </span>
        <span className="ml-auto text-black/40">{open ? "▲ 收合" : "▼ 展開"}</span>
      </button>

      {open && (
        <div className="space-y-3 border-t border-black/5 px-4 pb-4 pt-3">
          {/* 三大數字 */}
          <div className="grid grid-cols-3 gap-2">
            <Tile label="學費收入" value={fmtMoney(profit.revenue)} tone="income" />
            <Tile label="老師成本" value={fmtMoney(profit.cost)} tone="cost" />
            <Tile
              label={`毛利（${marginPct}%）`}
              value={fmtMoney(profit.gross)}
              tone={profit.gross >= 0 ? "gross" : "cost"}
            />
          </div>

          {/* 距固定開銷目標 */}
          <div
            className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-sm ${
              reached ? "bg-[#8CA07C]/10 text-[#5f7a4f]" : "bg-brand/5 text-brand"
            }`}
          >
            <span className="flex items-center gap-2">
              固定開銷目標
              {editingOverhead ? (
                <>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={overheadDraft}
                    onChange={(e) => setOverheadDraft(e.target.value)}
                    className="w-24 rounded-lg border border-black/15 px-2 py-1 text-right text-black outline-none focus:border-navy"
                  />
                  <button
                    onClick={saveOverhead}
                    disabled={savingOh}
                    className="rounded-lg bg-navy px-2 py-1 text-xs text-white"
                  >
                    存
                  </button>
                </>
              ) : (
                <button
                  onClick={() => {
                    setOverheadDraft(String(profit.fixedOverhead));
                    setEditingOverhead(true);
                  }}
                  className="underline decoration-dotted underline-offset-2"
                  title="點擊修改"
                >
                  {fmtMoney(profit.fixedOverhead)}
                </button>
              )}
            </span>
            <span className="font-semibold">
              {reached
                ? `✓ 已達標，超出 ${fmtMoney(-profit.gapToOverhead)}`
                : `還差 ${fmtMoney(profit.gapToOverhead)}`}
            </span>
          </div>

          {/* 各班別明細 */}
          {profit.classes.length === 0 ? (
            <p className="rounded-xl bg-black/[0.02] px-3 py-3 text-center text-xs text-black/40">
              還沒有可計算的資料。到各學生卡片填「每期學費 / 個別鐘點」，團班再填「班別每堂成本」。
            </p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-black/8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-black/[0.03] text-xs text-black/50">
                    <th className="px-3 py-2 text-left font-medium">班別</th>
                    <th className="px-2 py-2 text-right font-medium">收入</th>
                    <th className="px-2 py-2 text-right font-medium">成本</th>
                    <th className="px-3 py-2 text-right font-medium">毛利</th>
                  </tr>
                </thead>
                <tbody>
                  {profit.classes.map((c) => (
                    <tr key={c.key} className="border-t border-black/5">
                      <td className="px-3 py-2">
                        <span className="text-navy">{c.label}</span>
                        {c.studentCount > 1 && (
                          <span className="ml-1 text-[11px] text-black/40">
                            {c.studentCount} 人
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-[#5f7a4f]">
                        {fmtMoney(c.revenue)}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums text-brand">
                        {fmtMoney(c.cost)}
                      </td>
                      <td
                        className={`px-3 py-2 text-right font-medium tabular-nums ${
                          c.gross < 0 ? "text-brand" : "text-navy"
                        }`}
                      >
                        {fmtMoney(c.gross)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <p className="text-[11px] text-black/35">
            月營收＝每期學費÷週期（雙月÷2、年繳÷12）；成本＝個別每堂鐘點×4＋班別團班每堂×4。僅管理員可見。
          </p>
        </div>
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
