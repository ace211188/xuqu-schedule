"use client";

import { useEffect, useRef, useState } from "react";
import { fmtMoney } from "@/lib/accounting";

// 金額（支出紅、收入綠、其他預設）
export function Money({
  value,
  className = "",
  colored = false,
}: {
  value: number;
  className?: string;
  colored?: boolean;
}) {
  const color = !colored
    ? ""
    : value < 0
    ? "text-brand"
    : value > 0
    ? "text-[#5f7a4f]"
    : "text-black/50";
  return (
    <span className={`tabular-nums font-medium ${color} ${className}`}>
      {fmtMoney(value)}
    </span>
  );
}

const PILL_STYLE: Record<string, string> = {
  待核准: "bg-amber-100 text-amber-700",
  "已核准・待購買/附收據": "bg-sky-100 text-sky-700",
  待付款: "bg-brand/10 text-brand",
  已付款: "bg-[#8CA07C]/15 text-[#5f7a4f]",
  已退回: "bg-black/10 text-black/50",
  待確認: "bg-amber-100 text-amber-700",
  已確認入帳: "bg-[#8CA07C]/15 text-[#5f7a4f]",
};

export function StatusPill({ label }: { label: string }) {
  const cls = PILL_STYLE[label] ?? "bg-black/10 text-black/60";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-black/10 bg-white/70 p-4 ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-2 text-sm font-semibold text-navy">{children}</h2>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-white/50 px-4 py-8 text-center text-sm text-black/40">
      {children}
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-black/70">
        {label}
        {hint && <span className="ml-1 font-normal text-black/40">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

export const inputCls =
  "w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm outline-none focus:border-navy focus:ring-2 focus:ring-navy/20";

export function PrimaryBtn({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {children}
    </button>
  );
}

export function GhostBtn({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "ok";
}) {
  const border =
    tone === "danger"
      ? "border-brand/40 text-brand hover:border-brand"
      : tone === "ok"
      ? "border-[#8CA07C]/50 text-[#5f7a4f] hover:border-[#8CA07C]"
      : "border-black/15 text-black/60 hover:border-black/40";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full border px-4 py-2 text-sm font-medium transition active:scale-95 disabled:opacity-50 ${border}`}
    >
      {children}
    </button>
  );
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-5 shadow-xl sm:rounded-3xl"
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-navy">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full px-2 text-lg text-black/40 hover:text-black/70"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// 自訂下拉：展開有動畫、比原生 select 好看且滑順
export type Option = { value: string; label: string };
export function Select({
  value,
  onChange,
  options,
  placeholder = "請選擇",
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  options: Option[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false); // 空間不足時往上展開
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    // 依按鈕在畫面上的位置決定往上或往下展開，避免被切掉
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      setUp(window.innerHeight - r.bottom < 240 && r.top > 240);
    }
    setOpen((o) => !o);
  }

  const sel = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={toggle}
        className={`${inputCls} flex items-center justify-between gap-2 text-left`}
      >
        <span className={sel ? "truncate" : "truncate text-black/40"}>
          {sel ? sel.label : placeholder}
        </span>
        <span
          className={`shrink-0 text-black/40 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>
      {open && (
        <div
          className={`acc-menu absolute z-50 max-h-60 w-full overflow-auto rounded-xl border border-black/10 bg-white p-1 shadow-xl ${
            up ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition hover:bg-navy/5 active:scale-[0.99] ${
                o.value === value
                  ? "bg-navy/10 font-medium text-navy"
                  : "text-black/70"
              }`}
            >
              <span className="truncate">{o.label}</span>
              {o.value === value && <span className="text-navy">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
