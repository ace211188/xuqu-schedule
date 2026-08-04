"use client";

import { useEffect, useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  KIND_LABEL,
  fetchNotificationLog,
  fetchNotifyTeachers,
  sendManualPush,
  type NotificationLog,
  type NotifyTeacher,
} from "@/lib/notify";

// 手動發送的範本（選了帶入標題＋內容，仍可改）
const TEMPLATES: { key: string; label: string; title: string; body: string }[] = [
  {
    key: "schedule",
    label: "排課提醒",
    title: "排課提醒 🎵",
    body: "下個月的排課請確認一下～沒有變動也請按「更新」確認 💛",
  },
  {
    key: "acc",
    label: "記帳待辦",
    title: "記帳待辦提醒 💰",
    body: "有待處理的記帳事項，記得看一下 💛",
  },
  {
    key: "custom",
    label: "自訂",
    title: "",
    body: "",
  },
];

type Audience = "subscribed" | "pick" | "self";

function fmtWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
  if (sameDay) return `今天 ${hm}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

export default function NotificationCenter({ teacher }: { teacher: Teacher }) {
  const [open, setOpen] = useState(false);
  const [teachers, setTeachers] = useState<NotifyTeacher[]>([]);
  const [logs, setLogs] = useState<NotificationLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // 表單狀態
  const [tpl, setTpl] = useState("schedule");
  const [audience, setAudience] = useState<Audience>("subscribed");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState(TEMPLATES[0].title);
  const [body, setBody] = useState(TEMPLATES[0].body);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const subscribedCount = useMemo(
    () => teachers.filter((t) => t.subscribed).length,
    [teachers]
  );

  async function loadLogs() {
    setLoadingLogs(true);
    setLogs(await fetchNotificationLog(100));
    setLoadingLogs(false);
  }

  useEffect(() => {
    if (!open) return;
    fetchNotifyTeachers().then(setTeachers);
    void loadLogs();
  }, [open]);

  function applyTemplate(key: string) {
    setTpl(key);
    const t = TEMPLATES.find((x) => x.key === key);
    if (t && key !== "custom") {
      setTitle(t.title);
      setBody(t.body);
    }
  }

  function togglePick(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    setMsg(null);
    if (!title.trim() || !body.trim()) {
      setMsg({ ok: false, text: "請填標題與內容" });
      return;
    }
    let teacherIds: string[] | undefined;
    let targetLabel: string;
    let mode: "manual" | "test" = "manual";
    if (audience === "subscribed") {
      teacherIds = undefined; // 交給後端＝所有已訂閱者
      targetLabel = "所有已訂閱老師";
    } else if (audience === "self") {
      teacherIds = [teacher.id];
      targetLabel = "我自己（測試）";
      mode = "test";
    } else {
      teacherIds = [...picked];
      if (teacherIds.length === 0) {
        setMsg({ ok: false, text: "請至少選一位老師" });
        return;
      }
      targetLabel = teachers
        .filter((t) => picked.has(t.id))
        .map((t) => t.name)
        .join("、");
    }

    setBusy(true);
    const res = await sendManualPush({
      title: title.trim(),
      body: body.trim(),
      teacherIds,
      targetLabel,
      mode,
    });
    setBusy(false);
    if (!res.ok) {
      setMsg({ ok: false, text: res.error ?? "發送失敗" });
      return;
    }
    setMsg({
      ok: true,
      text:
        res.sent > 0
          ? `已送出 ${res.sent} 個裝置${res.failed ? `（${res.failed} 個失敗）` : ""} ✓`
          : "沒有可送達的裝置（對象尚未在手機開啟通知）",
    });
    void loadLogs();
  }

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-2xl border border-black/10 bg-white/70 px-4 py-2.5 text-sm font-medium text-navy transition hover:bg-white"
      >
        <span>🔔 通知中心（手動發送・過往紀錄）</span>
        <span className="text-black/40">{open ? "▲ 收合" : "▼ 展開"}</span>
      </button>

      {open && (
        <div className="mt-2 space-y-4 rounded-2xl border border-black/10 bg-white p-4">
          {/* ── 手動發送 ── */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-navy">手動發送</h3>

            {/* 範本 */}
            <div className="flex flex-wrap gap-2">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => applyTemplate(t.key)}
                  className={`rounded-full border px-3 py-1 text-xs transition ${
                    tpl === t.key
                      ? "border-navy bg-navy text-white"
                      : "border-black/15 text-black/55 hover:border-black/35"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* 對象 */}
            <div className="space-y-1.5">
              <div className="text-xs text-black/50">發送對象</div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ["subscribed", `所有已訂閱老師（${subscribedCount}）`],
                    ["pick", "指定老師"],
                    ["self", "只發給自己（測試）"],
                  ] as [Audience, string][]
                ).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setAudience(val)}
                    className={`rounded-full border px-3 py-1 text-xs transition ${
                      audience === val
                        ? "border-brand bg-brand/10 text-brand"
                        : "border-black/15 text-black/55 hover:border-black/35"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {audience === "pick" && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {teachers.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => togglePick(t.id)}
                      className={`rounded-full border px-2.5 py-1 text-xs transition ${
                        picked.has(t.id)
                          ? "border-navy bg-navy/10 text-navy"
                          : "border-black/15 text-black/50"
                      }`}
                      title={t.subscribed ? "已開啟通知" : "尚未在手機開啟通知"}
                    >
                      {t.name}
                      {t.is_admin ? "（管理員）" : ""}
                      {t.subscribed ? " 🔔" : " ✕"}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 標題 / 內容 */}
            <div className="space-y-2">
              <input
                className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm outline-none focus:border-navy"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="通知標題"
              />
              <textarea
                className="w-full resize-none rounded-xl border border-black/15 px-3 py-2 text-sm outline-none focus:border-navy"
                rows={3}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="通知內容"
              />
            </div>

            {msg && (
              <p className={`text-sm ${msg.ok ? "text-[#5f7a4f]" : "text-brand"}`}>
                {msg.text}
              </p>
            )}

            <button
              onClick={send}
              disabled={busy}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition active:scale-95 disabled:opacity-60"
            >
              {busy ? "發送中…" : "📤 立即發送"}
            </button>
            <p className="text-xs text-black/40">
              提醒：老師需先在手機（iPhone 須先加到主畫面）開啟通知並訂閱裝置，才收得到。
            </p>
          </div>

          {/* ── 過往通知紀錄 ── */}
          <div className="space-y-2 border-t border-black/10 pt-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-navy">過往通知紀錄</h3>
              <button
                onClick={loadLogs}
                className="text-xs text-black/45 hover:text-navy"
              >
                ↻ 重新整理
              </button>
            </div>
            {loadingLogs ? (
              <p className="py-4 text-center text-xs text-black/40">載入中…</p>
            ) : logs.length === 0 ? (
              <p className="py-4 text-center text-xs text-black/40">
                還沒有發送紀錄（此功能上線後的發送才會記錄）
              </p>
            ) : (
              <div className="space-y-1.5">
                {logs.map((l) => (
                  <div
                    key={l.id}
                    className="rounded-xl border border-black/8 bg-black/[0.015] px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-navy/10 px-2 py-0.5 font-medium text-navy">
                        {KIND_LABEL[l.kind] ?? l.kind}
                      </span>
                      <span className="text-black/40">{fmtWhen(l.created_at)}</span>
                      <span className="ml-auto text-black/45">
                        送達 {l.sent_count}
                        {l.failed_count ? `・失敗 ${l.failed_count}` : ""}
                      </span>
                    </div>
                    <div className="mt-1 text-sm font-medium text-navy">
                      {l.title}
                    </div>
                    <div className="text-xs text-black/55">{l.body}</div>
                    {l.target_label && (
                      <div className="mt-0.5 text-[11px] text-black/40">
                        對象：{l.target_label}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
