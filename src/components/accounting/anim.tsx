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

// 背景漂浮粒子（在 client 端才產生，避免靜態匯出 hydration 不一致）
type Dot = {
  left: number;
  size: number;
  dur: number;
  delay: number;
  op: number;
  brand: boolean;
};
export function Particles({ count = 16 }: { count?: number }) {
  const [dots, setDots] = useState<Dot[]>([]);
  useEffect(() => {
    setDots(
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        size: 4 + Math.random() * 12,
        dur: 11 + Math.random() * 13,
        delay: -Math.random() * 16,
        op: 0.06 + Math.random() * 0.14,
        brand: i % 3 === 0,
      }))
    );
  }, [count]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d, i) => (
        <span
          key={i}
          className="particle"
          style={
            {
              left: `${d.left}%`,
              width: d.size,
              height: d.size,
              background: d.brand ? "var(--brand)" : "var(--navy)",
              "--dur": `${d.dur}s`,
              "--delay": `${d.delay}s`,
              "--dot-op": d.op,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

// 標題逐字浮現
export function AnimatedTitle({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  return (
    <h1 className={className} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className="title-char"
          style={{ animationDelay: `${i * 55}ms` }}
        >
          {ch === " " ? " " : ch}
        </span>
      ))}
    </h1>
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
