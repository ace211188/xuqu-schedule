"use client";

import { useEffect, useRef, useState } from "react";
import { fmtMoney } from "@/lib/accounting";

// 數字跳動：value 變動時，從舊值平滑補間到新值
export function useCountUp(value: number, duration = 650): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // easeOutCubic
      const e = 1 - Math.pow(1 - t, 3);
      const cur = from + (to - from) * e;
      setDisplay(cur);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
        setDisplay(to);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = to;
    };
  }, [value, duration]);

  return display;
}

// 會跳動的金額
export function CountMoney({
  value,
  className = "",
}: {
  value: number;
  className?: string;
}) {
  const n = useCountUp(value);
  return (
    <span className={`tabular-nums ${className}`}>{fmtMoney(Math.round(n))}</span>
  );
}

// 交錯浮現：把子項各自延遲一點點出現
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <div className={`acc-reveal ${className}`} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}
