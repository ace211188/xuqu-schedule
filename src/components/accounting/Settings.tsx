"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ACCOUNT_TYPE_LABEL,
  fetchAllTeachers,
  setMainAccount,
  setTeacherAccounting,
  upsertAccount,
  upsertCategory,
  type Account,
  type AccountType,
  type Category,
  type CategoryKind,
} from "@/lib/accounting";
import type { AccountingData } from "./useAccountingData";
import {
  fetchLoginAccounts,
  loginMessage,
  newPassword,
  suggestHandle,
  type LoginAccount,
} from "@/lib/accounts";
import {
  allowCurrentNetwork,
  createTeacher,
  createWorker,
  deleteWorker,
  fetchAttendanceStatus,
  listWorkers,
  removeNetwork,
  type AllowedNetwork,
  type WorkerRow,
} from "@/lib/attendance";
import {
  addRoom,
  addRosterEntry,
  addTask,
  fetchRooms,
  fetchRoster,
  fetchRota,
  fetchTasks,
  removeRoom,
  removeRosterEntry,
  removeTask,
  saveRotaDay,
  weekDuty,
  WEEKDAY_LABEL,
  type ClosingRoom,
  type ClosingTask,
  type RosterEntry,
  type RotaRow,
} from "@/lib/closing";
import {
  Card,
  Field,
  GhostBtn,
  Modal,
  Money,
  PrimaryBtn,
  SectionTitle,
  inputCls,
} from "./ui";

type TeacherRow = {
  id: string;
  name: string;
  is_admin: boolean;
  can_accounting: boolean;
};

export default function Settings({ data }: { data: AccountingData }) {
  const { accounts, categories, balances, refresh } = data;
  const [teachers, setTeachers] = useState<TeacherRow[]>([]);
  const [acctEdit, setAcctEdit] = useState<Account | "new" | null>(null);
  const [catEdit, setCatEdit] = useState<Category | "new" | null>(null);

  const loadTeachers = () => fetchAllTeachers().then(setTeachers);
  useEffect(() => {
    loadTeachers();
  }, []);

  const balById = useMemo(
    () => new Map(balances.map((b) => [b.id, b.balance])),
    [balances]
  );

  return (
    <div className="space-y-5">
      {/* 帳戶 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>帳戶</SectionTitle>
          <GhostBtn onClick={() => setAcctEdit("new")}>＋ 新增帳戶</GhostBtn>
        </div>
        <div className="space-y-2">
          {accounts.map((a) => (
            <Card key={a.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-navy">{a.name}</span>
                  {a.is_main && (
                    <span className="rounded bg-navy/10 px-1.5 text-[11px] text-navy">
                      主帳戶
                    </span>
                  )}
                  {!a.active && (
                    <span className="rounded bg-black/10 px-1.5 text-[11px] text-black/45">
                      已停用
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-black/45">
                  {ACCOUNT_TYPE_LABEL[a.type]} · 餘額{" "}
                  <Money value={balById.get(a.id) ?? a.opening_balance} colored />
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                {!a.is_main && (
                  <GhostBtn
                    onClick={async () => {
                      const { error } = await setMainAccount(a.id);
                      if (error) alert(error);
                      else await refresh();
                    }}
                  >
                    設為主帳戶
                  </GhostBtn>
                )}
                <GhostBtn onClick={() => setAcctEdit(a)}>編輯</GhostBtn>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 類別 */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <SectionTitle>收支類別</SectionTitle>
          <GhostBtn onClick={() => setCatEdit("new")}>＋ 新增類別</GhostBtn>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(["income", "expense"] as const).map((kind) => (
            <Card key={kind}>
              <div className="mb-2 text-xs font-medium text-black/50">
                {kind === "income" ? "收入" : "支出"}
              </div>
              <div className="flex flex-wrap gap-2">
                {categories
                  .filter((c) => c.kind === kind)
                  .map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setCatEdit(c)}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        c.active
                          ? "border-black/15 text-black/70 hover:border-navy"
                          : "border-dashed border-black/15 text-black/35"
                      }`}
                    >
                      {c.name}
                      {!c.active && "（停用）"}
                    </button>
                  ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* 成員權限 */}
      <section>
        <SectionTitle>記帳成員權限</SectionTitle>
        <Card className="divide-y divide-black/5 p-0">
          {teachers.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="font-medium text-navy">
                {t.name}
                {t.is_admin && (
                  <span className="ml-2 rounded bg-navy/10 px-1.5 text-[11px] text-navy">
                    管理者
                  </span>
                )}
              </span>
              {t.is_admin ? (
                <span className="text-xs text-black/40">永遠可用</span>
              ) : (
                <button
                  onClick={async () => {
                    const { error } = await setTeacherAccounting(
                      t.id,
                      !t.can_accounting
                    );
                    if (error) alert(error);
                    else await loadTeachers();
                  }}
                  className={`relative h-6 w-11 rounded-full transition ${
                    t.can_accounting ? "bg-[#8CA07C]" : "bg-black/15"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                      t.can_accounting ? "left-[22px]" : "left-0.5"
                    }`}
                  />
                </button>
              )}
            </div>
          ))}
        </Card>
        <p className="mt-1 text-xs text-black/40">
          開啟後該老師登入即可看到「記帳」入口。
        </p>
      </section>

      {/* 老師帳號（一鍵產生帳密） */}
      <TeacherAccounts onCreated={loadTeachers} />

      {/* 工讀生帳號 */}
      <WorkerAccounts />

      {/* 工讀生簽到網路 */}
      <AttendanceNetworks />

      {/* 打烊：教室清單 + 廁所清潔輪值 */}
      <ClosingConfig />

      {acctEdit && (
        <AccountModal
          existing={acctEdit === "new" ? null : acctEdit}
          teachers={teachers}
          onClose={() => setAcctEdit(null)}
          onSaved={async () => {
            setAcctEdit(null);
            await refresh();
          }}
        />
      )}
      {catEdit && (
        <CategoryModal
          existing={catEdit === "new" ? null : catEdit}
          onClose={() => setCatEdit(null)}
          onSaved={async () => {
            setCatEdit(null);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

// ── 老師帳號：一鍵產生帳密（一般老師權限，登入後可填排課）──
function TeacherAccounts({ onCreated }: { onCreated: () => void }) {
  const [accounts, setAccounts] = useState<LoginAccount[]>([]);
  const [adding, setAdding] = useState(false);

  const load = () => fetchLoginAccounts().then(setAccounts);
  useEffect(() => {
    fetchLoginAccounts().then(setAccounts);
  }, []);

  // 教室端裝置帳號「管理員」與工讀生不列在老師清單
  const teachers = accounts.filter((a) => !a.is_worker && a.name !== "管理員");

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionTitle>老師帳號</SectionTitle>
        <GhostBtn onClick={() => setAdding(true)}>＋ 新增老師</GhostBtn>
      </div>
      <Card className="p-0">
        <div className="divide-y divide-black/5">
          {teachers.map((t) => (
            <div key={t.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <span className="font-medium text-navy">{t.name}</span>
              <span className="font-mono text-xs text-black/50">{t.username ?? "—"}</span>
            </div>
          ))}
        </div>
      </Card>
      <p className="mt-1 text-xs text-black/40">
        新老師登入後可以填「我的排課」；要開記帳權限請到上面「記帳成員權限」。密碼可在排課後台「🔑 老師帳號密碼一覽」查。
      </p>

      {adding && (
        <NewLoginModal
          kind="teacher"
          taken={new Set(accounts.map((a) => a.username).filter((u): u is string => !!u))}
          onClose={() => setAdding(false)}
          onDone={async () => {
            setAdding(false);
            await load();
            onCreated();
          }}
        />
      )}
    </section>
  );
}

// ── 工讀生帳號 ──────────────────────────────────────
function WorkerAccounts() {
  const [workers, setWorkers] = useState<WorkerRow[]>([]);
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  const load = () => listWorkers().then(setWorkers);
  useEffect(() => {
    load();
  }, []);

  async function openAdd() {
    const accs = await fetchLoginAccounts();
    setTaken(new Set(accs.map((a) => a.username).filter((u): u is string => !!u)));
    setAdding(true);
  }

  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <SectionTitle>工讀生帳號</SectionTitle>
        <GhostBtn onClick={openAdd}>＋ 新增工讀生</GhostBtn>
      </div>
      <Card className="p-0">
        {workers.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-black/40">
            還沒有工讀生帳號
          </p>
        ) : (
          <div className="divide-y divide-black/5">
            {workers.map((w) => (
              <div
                key={w.id}
                className="flex items-center justify-between px-4 py-3 text-sm"
              >
                <span className="font-medium text-navy">{w.name}</span>
                <button
                  onClick={async () => {
                    if (
                      !confirm(
                        `刪除工讀生「${w.name}」？帳號與出勤紀錄都會一併移除，無法復原。`
                      )
                    )
                      return;
                    const { error } = await deleteWorker(w.id);
                    if (error) return alert(error);
                    await load();
                  }}
                  className="text-xs text-brand hover:underline"
                >
                  刪除
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
      <p className="mt-1 text-xs text-black/40">
        工讀生登入後可以「簽到」與「打烊」；簽到需連上教室網路。
      </p>

      {adding && (
        <NewLoginModal
          kind="worker"
          taken={taken}
          onClose={() => setAdding(false)}
          onDone={async () => {
            setAdding(false);
            await load();
          }}
        />
      )}
    </section>
  );
}

// ── 一鍵建立帳號（老師／工讀生）：打名字 → 自動帳號（拼音）＋自動密碼 → 建立 → 複製給對方 ──
function NewLoginModal({
  kind,
  taken,
  onClose,
  onDone,
}: {
  kind: "teacher" | "worker";
  taken: Set<string>;
  onClose: () => void;
  onDone: () => void;
}) {
  const label = kind === "teacher" ? "老師" : "工讀生";
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [handleEdited, setHandleEdited] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  // 打名字時自動帶出拼音帳號與密碼（手動改過帳號後就不再覆蓋）
  useEffect(() => {
    if (handleEdited) return;
    let active = true;
    suggestHandle(name, taken).then((h) => {
      if (!active) return;
      setHandle(h);
      setPassword(h ? newPassword(h) : "");
    });
    return () => {
      active = false;
    };
  }, [name, handleEdited, taken]);

  const message = loginMessage({ kind, name: name.trim(), handle, password });

  async function create() {
    setErr(null);
    const h = handle.trim().toLowerCase();
    if (!name.trim()) return setErr("請填名字");
    if (!/^[a-z0-9._-]+$/.test(h)) return setErr("帳號只能用英文/數字（例：yalun）");
    if (taken.has(h)) return setErr(`帳號「${h}」已經有人用了，請換一個`);
    if (password.length < 6) return setErr("密碼至少 6 碼");
    setBusy(true);
    const fn = kind === "teacher" ? createTeacher : createWorker;
    const { error } = await fn({ handle: h, name: name.trim(), password });
    setBusy(false);
    if (error) return setErr(error);
    setDone(true);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("複製下面這段傳給對方：", message);
    }
  }

  return (
    <Modal title={`新增${label}帳號`} onClose={done ? onDone : onClose}>
      {done ? (
        <div className="space-y-3">
          <p className="rounded-xl bg-[#8CA07C]/10 px-3 py-3 text-sm text-[#5f7a4f]">
            ✓ {name.trim()} 的帳號已建立！把下面的登入資訊傳給對方：
          </p>
          <pre className="whitespace-pre-wrap rounded-xl border border-black/10 bg-black/[0.02] px-3 py-2 text-sm text-black/75">
            {message}
          </pre>
          <p className="text-xs text-black/45">
            之後忘記密碼，可到排課後台「🔑 老師帳號密碼一覽」查。
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <GhostBtn onClick={copy}>{copied ? "✓ 已複製" : "複製訊息"}</GhostBtn>
            <PrimaryBtn onClick={onDone}>完成</PrimaryBtn>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label={`${label}名字`} hint="（中文，例：雅綸）">
            <input
              className={inputCls}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={kind === "teacher" ? "例：雅綸" : "例：陳小美"}
              autoFocus
            />
          </Field>
          <Field label="登入帳號" hint="（自動用拼音產生，可修改）">
            <input
              className={`${inputCls} font-mono`}
              value={handle}
              onChange={(e) => {
                setHandleEdited(true);
                setHandle(e.target.value);
              }}
              placeholder="打名字後自動產生"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </Field>
          <Field label="密碼" hint="（自動產生：帳號＋4 位數字）">
            <div className="flex gap-2">
              <input
                className={`${inputCls} font-mono`}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <GhostBtn
                onClick={() => handle.trim() && setPassword(newPassword(handle.trim().toLowerCase()))}
                disabled={!handle.trim()}
              >
                🔄 換一組
              </GhostBtn>
            </div>
          </Field>
          {err && <p className="text-sm text-brand">{err}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <GhostBtn onClick={onClose}>取消</GhostBtn>
            <PrimaryBtn onClick={create} disabled={busy || !name.trim() || !handle.trim()}>
              {busy ? "建立中…" : "建立帳號"}
            </PrimaryBtn>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── 工讀生簽到：允許的店裡網路 ──────────────────────
function AttendanceNetworks() {
  const [networks, setNetworks] = useState<AllowedNetwork[]>([]);
  const [ip, setIp] = useState<string | null>(null);
  const [onSite, setOnSite] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    const s = await fetchAttendanceStatus();
    setNetworks(s?.networks ?? []);
    setIp(s?.ip ?? null);
    setOnSite(s?.onSite ?? false);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  async function addCurrent() {
    setBusy(true);
    setMsg(null);
    const { networks: n, error } = await allowCurrentNetwork();
    setBusy(false);
    if (error) return setMsg(error);
    setNetworks(n);
    setOnSite(true);
    setMsg("已把目前網路設為允許 ✓");
  }

  async function remove(id: string) {
    if (!confirm("移除這個允許網路？之後這條網路將無法簽到。")) return;
    const { networks: n, error } = await removeNetwork(id);
    if (error) return alert(error);
    setNetworks(n);
    await load();
  }

  return (
    <section>
      <SectionTitle>工讀生簽到 · 店裡網路</SectionTitle>
      <Card className="space-y-3">
        <p className="text-xs text-black/50">
          工讀生只有連上下面清單中的網路才能簽到。
          <b className="text-black/70">請在店裡（連店裡 WiFi）時</b>
          按下方按鈕，把目前這條網路加入允許。IP 若變動，再按一次即可。
        </p>

        <div className="flex items-center justify-between gap-2 rounded-xl bg-black/[0.03] px-3 py-2 text-sm">
          <span className="min-w-0 text-black/60">
            目前網路：
            <span className="break-all font-mono text-black/80">
              {loading ? "偵測中…" : ip ?? "讀不到"}
            </span>
            {!loading && (
              <span className={onSite ? "ml-2 text-[#5f7a4f]" : "ml-2 text-amber-600"}>
                {onSite ? "（已允許）" : "（尚未允許）"}
              </span>
            )}
          </span>
        </div>

        <PrimaryBtn onClick={addCurrent} disabled={busy || loading}>
          {busy ? "設定中…" : "把目前網路設為允許"}
        </PrimaryBtn>
        {msg && <p className="text-sm text-[#5f7a4f]">{msg}</p>}

        {networks.length > 0 && (
          <div className="divide-y divide-black/5 rounded-xl border border-black/10">
            {networks.map((n) => (
              <div
                key={n.id}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
              >
                <span className="min-w-0 break-all font-mono text-black/70">
                  {n.ip}
                  {n.label ? (
                    <span className="ml-2 font-sans text-black/45">{n.label}</span>
                  ) : null}
                </span>
                <button
                  onClick={() => remove(n.id)}
                  className="shrink-0 text-xs text-brand hover:underline"
                >
                  移除
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </section>
  );
}

// ── 打烊：教室清單 + 廁所清潔輪值 ──────────────────────
function ClosingConfig() {
  const [rooms, setRooms] = useState<ClosingRoom[]>([]);
  const [tasks, setTasks] = useState<ClosingTask[]>([]);
  const [roster, setRoster] = useState<RosterEntry[]>([]);
  const [roomName, setRoomName] = useState("");
  const [taskName, setTaskName] = useState("");
  const [personName, setPersonName] = useState("");

  const load = async () => {
    setRooms(await fetchRooms());
    setTasks(await fetchTasks());
    setRoster(await fetchRoster());
  };

  async function onAddTask() {
    const n = taskName.trim();
    if (!n) return;
    const { error } = await addTask(n, tasks.length);
    if (error) return alert(error);
    setTaskName("");
    await load();
  }
  useEffect(() => {
    load();
  }, []);

  async function onAddRoom() {
    const n = roomName.trim();
    if (!n) return;
    const { error } = await addRoom(n, rooms.length);
    if (error) return alert(error);
    setRoomName("");
    await load();
  }
  async function onAddPerson() {
    const n = personName.trim();
    if (!n) return;
    const { error } = await addRosterEntry(n, roster.length);
    if (error) return alert(error);
    setPersonName("");
    await load();
  }

  return (
    <section>
      <SectionTitle>打烊設定</SectionTitle>
      <ClosingRotaEditor />
      <div className="grid gap-3 sm:grid-cols-2">
        {/* 教室清單 */}
        <Card>
          <div className="mb-2 text-xs font-medium text-black/50">
            教室清單（打烊逐間檢查）
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            {rooms.length === 0 && (
              <span className="text-xs text-black/35">還沒有教室</span>
            )}
            {rooms.map((r) => (
              <span
                key={r.id}
                className="flex items-center gap-1 rounded-full border border-black/15 px-2.5 py-1 text-sm text-black/70"
              >
                {r.name}
                <button
                  onClick={async () => {
                    if (!confirm(`移除教室「${r.name}」？`)) return;
                    await removeRoom(r.id);
                    await load();
                  }}
                  className="text-black/30 hover:text-brand"
                  aria-label="移除"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddRoom()}
              placeholder="例：A 教室"
            />
            <GhostBtn onClick={onAddRoom}>新增</GhostBtn>
          </div>
        </Card>

        {/* 打烊工作 */}
        <Card>
          <div className="mb-2 text-xs font-medium text-black/50">
            打烊工作（每天打烊逐項勾選）
          </div>
          <div className="mb-2 flex flex-wrap gap-2">
            {tasks.length === 0 && (
              <span className="text-xs text-black/35">還沒有打烊工作</span>
            )}
            {tasks.map((t) => (
              <span
                key={t.id}
                className="flex items-center gap-1 rounded-full border border-black/15 px-2.5 py-1 text-sm text-black/70"
              >
                {t.name}
                <button
                  onClick={async () => {
                    if (!confirm(`移除打烊工作「${t.name}」？`)) return;
                    await removeTask(t.id);
                    await load();
                  }}
                  className="text-black/30 hover:text-brand"
                  aria-label="移除"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddTask()}
              placeholder="例：倒垃圾"
            />
            <GhostBtn onClick={onAddTask}>新增</GhostBtn>
          </div>
        </Card>

        {/* 廁所清潔輪值 */}
        <Card>
          <div className="mb-2 text-xs font-medium text-black/50">
            廁所清潔輪值（依順序每週自動輪）
          </div>
          <div className="mb-2 space-y-1">
            {roster.length === 0 && (
              <span className="text-xs text-black/35">還沒有輪值名單</span>
            )}
            {roster.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-lg bg-black/[0.03] px-3 py-1.5 text-sm"
              >
                <span className="text-black/70">
                  <span className="mr-1.5 text-black/35">{i + 1}.</span>
                  {p.name}
                </span>
                <button
                  onClick={async () => {
                    if (!confirm(`移除「${p.name}」？`)) return;
                    await removeRosterEntry(p.id);
                    await load();
                  }}
                  className="text-black/30 hover:text-brand"
                  aria-label="移除"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          {roster.length > 0 && (
            <p className="mb-2 text-xs text-[#5f7a4f]">
              本週輪到：{weekDuty(roster) ?? "—"}
            </p>
          )}
          <div className="flex gap-2">
            <input
              className={inputCls}
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddPerson()}
              placeholder="名字"
            />
            <GhostBtn onClick={onAddPerson}>新增</GhostBtn>
          </div>
        </Card>
      </div>
      <p className="mt-1 text-xs text-black/40">
        排序即輪值順序（新增會排在最後）。系統依當週週次自動輪到下一位。
      </p>
    </section>
  );
}

// ── 打烊輪值（每週）：每個星期幾由誰打烊，或固定公休 ──
const ROTA_ORDER = [1, 2, 3, 4, 5, 6, 0]; // 週一 → 週日
const CLOSED = "__closed__";

function ClosingRotaEditor() {
  const [rota, setRota] = useState<RotaRow[]>([]);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState<number | null>(null);

  useEffect(() => {
    fetchRota().then(setRota);
    fetchAllTeachers().then((ts) =>
      setMembers(ts.filter((t) => t.can_accounting || t.is_admin).map((t) => ({ id: t.id, name: t.name })))
    );
  }, []);

  async function change(weekday: number, value: string) {
    const row: RotaRow = {
      weekday,
      teacher_id: value && value !== CLOSED ? value : null,
      closed: value === CLOSED,
    };
    setSaving(weekday);
    const { error } = await saveRotaDay(row);
    setSaving(null);
    if (error) return alert(error);
    setRota((prev) => [...prev.filter((r) => r.weekday !== weekday), row]);
  }

  return (
    <Card className="mb-3">
      <div className="mb-2 text-xs font-medium text-black/50">
        打烊輪值（每週固定；輪值的人可以在打烊頁指派工讀生代班）
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {ROTA_ORDER.map((wd) => {
          const r = rota.find((x) => x.weekday === wd);
          const value = r?.closed ? CLOSED : r?.teacher_id ?? "";
          return (
            <label key={wd} className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 text-black/60">週{WEEKDAY_LABEL[wd]}</span>
              <select
                className={inputCls}
                value={value}
                disabled={saving === wd}
                onChange={(e) => change(wd, e.target.value)}
              >
                <option value="">（未設定：誰都能打烊）</option>
                <option value={CLOSED}>固定公休</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-black/40">
        個別日期的公休（例如連假）請到打烊頁的「近期排班」設定。每天 21:30 若還沒填打烊紀錄，會推播提醒當天負責人與宇群。
      </p>
    </Card>
  );
}

function AccountModal({
  existing,
  teachers,
  onClose,
  onSaved,
}: {
  existing: Account | null;
  teachers: TeacherRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<AccountType>(existing?.type ?? "bank");
  const [owner, setOwner] = useState(existing?.owner_teacher_id ?? "");
  const [opening, setOpening] = useState(
    existing ? String(existing.opening_balance) : "0"
  );
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!name.trim()) return setErr("請填寫帳戶名稱");
    setBusy(true);
    const payload: Partial<Account> & { name: string } = {
      name: name.trim(),
      type,
      owner_teacher_id: owner || null,
      opening_balance: Number(opening) || 0,
      active,
    };
    if (existing) payload.id = existing.id;
    const { error } = await upsertAccount(payload);
    setBusy(false);
    if (error) setErr(error);
    else onSaved();
  }

  return (
    <Modal title={existing ? "編輯帳戶" : "新增帳戶"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="帳戶名稱">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：美君主帳戶 / 教室現金"
          />
        </Field>
        <Field label="類型">
          <select
            className={inputCls}
            value={type}
            onChange={(e) => setType(e.target.value as AccountType)}
          >
            {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
              <option key={t} value={t}>
                {ACCOUNT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="負責人" hint="（選填）">
          <select
            className={inputCls}
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
          >
            <option value="">無</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="期初餘額" hint={existing ? "（改動會影響餘額）" : undefined}>
          <input
            type="number"
            inputMode="numeric"
            className={inputCls}
            value={opening}
            onChange={(e) => setOpening(e.target.value)}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm text-black/70">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          啟用中（停用後不再出現在下拉選單）
        </label>
        {err && <p className="text-sm text-brand">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <GhostBtn onClick={onClose}>取消</GhostBtn>
          <PrimaryBtn onClick={save} disabled={busy}>
            {busy ? "儲存中…" : "儲存"}
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}

function CategoryModal({
  existing,
  onClose,
  onSaved,
}: {
  existing: Category | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<CategoryKind>(existing?.kind ?? "expense");
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setErr(null);
    if (!name.trim()) return setErr("請填寫類別名稱");
    setBusy(true);
    const payload: Partial<Category> & { name: string; kind: CategoryKind } = {
      name: name.trim(),
      kind,
      active,
    };
    if (existing) payload.id = existing.id;
    const { error } = await upsertCategory(payload);
    setBusy(false);
    if (error) setErr(error);
    else onSaved();
  }

  return (
    <Modal title={existing ? "編輯類別" : "新增類別"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="類別名稱">
          <input
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例：教材教具"
          />
        </Field>
        <Field label="收 / 支">
          <select
            className={inputCls}
            value={kind}
            disabled={!!existing}
            onChange={(e) => setKind(e.target.value as CategoryKind)}
          >
            <option value="expense">支出</option>
            <option value="income">收入</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm text-black/70">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          啟用中
        </label>
        {err && <p className="text-sm text-brand">{err}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <GhostBtn onClick={onClose}>取消</GhostBtn>
          <PrimaryBtn onClick={save} disabled={busy}>
            {busy ? "儲存中…" : "儲存"}
          </PrimaryBtn>
        </div>
      </div>
    </Modal>
  );
}
