"use client";

import { useEffect, useState } from "react";
import { receiptUrl, uploadReceipt } from "@/lib/accounting";

// 上傳中的收據挑選器（回傳 Storage 路徑陣列給表單）
export function ReceiptInput({
  teacherId,
  paths,
  onChange,
}: {
  teacherId: string;
  paths: string[];
  onChange: (paths: string[]) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true);
    setErr(null);
    try {
      const uploaded: string[] = [];
      for (const f of files) uploaded.push(await uploadReceipt(teacherId, f));
      onChange([...paths, ...uploaded]);
    } catch {
      setErr("上傳失敗，請再試一次");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {paths.map((p) => (
          <Thumb key={p} path={p} onRemove={() => onChange(paths.filter((x) => x !== p))} />
        ))}
        <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-black/25 text-xs text-black/50 hover:border-navy">
          {busy ? "…" : "＋ 收據"}
          <input
            type="file"
            accept="image/*,application/pdf"
            multiple
            capture="environment"
            className="hidden"
            onChange={onPick}
          />
        </label>
      </div>
      {err && <p className="mt-1 text-xs text-brand">{err}</p>}
    </div>
  );
}

function Thumb({ path, onRemove }: { path: string; onRemove: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const isPdf = path.toLowerCase().endsWith(".pdf");
  useEffect(() => {
    if (!isPdf) receiptUrl(path).then(setUrl);
  }, [path, isPdf]);
  return (
    <div className="relative h-16 w-16 overflow-hidden rounded-xl border border-black/10 bg-black/5">
      {isPdf ? (
        <div className="flex h-full items-center justify-center text-[10px] text-black/50">
          PDF
        </div>
      ) : url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="收據" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full items-center justify-center text-[10px] text-black/30">
          …
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-lg bg-black/60 text-xs text-white"
      >
        ✕
      </button>
    </div>
  );
}

// 唯讀顯示：點開看收據
export function ReceiptLinks({ paths }: { paths: string[] }) {
  if (!paths.length)
    return <span className="text-xs text-black/35">未附收據</span>;
  return (
    <div className="flex flex-wrap gap-2">
      {paths.map((p, i) => (
        <ReceiptLink key={p} path={p} index={i + 1} />
      ))}
    </div>
  );
}

function ReceiptLink({ path, index }: { path: string; index: number }) {
  async function open() {
    const url = await receiptUrl(path);
    if (url) window.open(url, "_blank", "noopener");
  }
  return (
    <button
      type="button"
      onClick={open}
      className="rounded-lg border border-black/15 px-2 py-1 text-xs text-navy hover:border-navy"
    >
      🧾 收據{index}
    </button>
  );
}
