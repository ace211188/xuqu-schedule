// 週表的共用設定（登入後的老師畫面、管理端都會用到）

export const OPEN_MIN = 9 * 60; // 09:00
export const CLOSE_MIN = 21 * 60; // 21:00
export const STEP = 30; // 半小時

export type Day = { key: string; label: string; start: number; end: number };
export const DAYS: Day[] = [
  { key: "mon", label: "週一", start: 13 * 60, end: 21 * 60 },
  { key: "tue", label: "週二", start: 13 * 60, end: 21 * 60 },
  { key: "wed", label: "週三", start: 13 * 60, end: 21 * 60 },
  { key: "thu", label: "週四", start: 13 * 60, end: 21 * 60 },
  { key: "fri", label: "週五", start: 13 * 60, end: 21 * 60 },
  { key: "sat", label: "週六", start: 9 * 60, end: 21 * 60 },
  { key: "sun", label: "週日", start: 9 * 60, end: 18 * 60 },
];

export const SLOTS: number[] = [];
for (let t = OPEN_MIN; t < CLOSE_MIN; t += STEP) SLOTS.push(t);

export function hhmm(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// 兩種狀態（序曲大地色系）
export const AVAILABLE = "available"; // 可排課
export const BUSY = "busy"; // 在序曲上課
export type CellValue = null | typeof AVAILABLE | typeof BUSY;

export const STATE_STYLE: Record<
  typeof AVAILABLE | typeof BUSY,
  { bg: string; textColor: string; label: string }
> = {
  [AVAILABLE]: { bg: "#8CA07C", textColor: "#5f7a4f", label: "可排課" }, // sage 綠
  [BUSY]: { bg: "#E5A661", textColor: "#c67d2e", label: "在序曲上課" }, // 大地橘
};

export function keyOf(dayKey: string, slot: number) {
  return `${dayKey}-${slot}`;
}

export function isOpen(day: Day, slot: number) {
  return slot >= day.start && slot < day.end;
}

// 產生可選月份（本月起連續幾個月），值用 'YYYY-MM'
export function monthOptions(base = new Date(), count = 4) {
  const out: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    out.push({ value, label: `${d.getFullYear()} 年 ${d.getMonth() + 1} 月` });
  }
  return out;
}

export function monthLabel(value: string) {
  const [y, m] = value.split("-");
  return `${y} 年 ${Number(m)} 月`;
}
