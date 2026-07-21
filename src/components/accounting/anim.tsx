"use client";

import { useEffect, useState } from "react";
import { fmtMoney } from "@/lib/accounting";

function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

// 共用的 media query 訂閱。
// 用 lazy initializer 讓第一次 render 就是正確值 —— 記帳模組整段在登入後才於
// client 掛載，不參與 hydration，所以直接讀 matchMedia 不會有 mismatch。
function useMediaQuery(query: string, ssrValue: boolean): boolean {
  const [match, setMatch] = useState(() =>
    typeof window === "undefined" ? ssrValue : window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = (e: MediaQueryListEvent) => setMatch(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return match;
}

// 裝置是否「輕量」：手機或低階機 → 關掉純裝飾動效
export function useLiteMotion(): boolean {
  const small = useMediaQuery("(max-width: 639px)", true);
  const [weak] = useState(
    () =>
      typeof window === "undefined" ||
      (navigator.hardwareConcurrency ?? 4) <= 4 ||
      prefersReducedMotion()
  );
  return small || weak;
}

// 是否為手機寬度（用來只渲染一套版面，不要手機/桌機兩套 DOM 都畫）
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 639px)", false);
}

// 金額顯示。
//
// 這裡刻意「不做」數字跳動動畫：先前的實作是用 requestAnimationFrame 逐幀改寫
// textContent，等於讓「金額是否正確」取決於 rAF 有沒有被執行。rAF 在背景分頁、
// 省電模式、部分手機瀏覽器會被節流甚至完全不觸發，文字就永遠停在動畫起點
// （常常是 0），畫面上等同看不到金額。金額是資料不是裝飾，必須由 React 直接
// 渲染，任何情況下都要是對的。順帶也省掉每秒 60 次的 DOM 寫入。
export function CountMoney({
  value,
  className = "",
}: {
  value: number;
  className?: string;
  /** @deprecated 已不做動畫，保留參數避免呼叫端改動 */
  duration?: number;
}) {
  return (
    <span className={`tabular-nums ${className}`}>{fmtMoney(value)}</span>
  );
}

// 背景漂浮粒子。
// 改成 fixed 視窗大小的圖層（原本蓋在整頁高的 <main> 上，捲動時合成成本很高），
// 手機/低階機直接不渲染。
type Dot = {
  left: number;
  size: number;
  dur: number;
  delay: number;
  op: number;
  brand: boolean;
};
export function Particles({ count = 8 }: { count?: number }) {
  const lite = useLiteMotion();
  const [dots, setDots] = useState<Dot[]>([]);

  useEffect(() => {
    if (lite) {
      setDots([]);
      return;
    }
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
  }, [count, lite]);

  if (!dots.length) return null;

  return (
    <div className="particle-layer" aria-hidden>
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

// 標題逐字浮現（只在首次掛載跑一次，跑完就把 span 拆掉還原成純文字節點）
export function AnimatedTitle({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const [animating, setAnimating] = useState(() => !prefersReducedMotion());
  useEffect(() => {
    const ms = text.length * 55 + 520;
    const id = setTimeout(() => setAnimating(false), ms);
    return () => clearTimeout(id);
  }, [text]);

  if (!animating) return <h1 className={className}>{text}</h1>;

  return (
    <h1 className={className} aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span
          key={i}
          aria-hidden
          className="title-char"
          style={{ animationDelay: `${i * 55}ms` }}
        >
          {ch === " " ? " " : ch}
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
