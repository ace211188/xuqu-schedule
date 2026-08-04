"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  ALL_STATUS,
  COURSE_TYPES,
  STATUS_TONE,
  displayCourseType,
  fmtMoney,
  groupByFamily,
  isDualTrack,
  latestFee,
  type Student,
  type StudentStatus,
} from "@/lib/students";
import {
  computeProfit,
  fetchFixedOverhead,
  type ProfitResult,
} from "@/lib/profit";
import { useStudentsData } from "./useStudentsData";
import StudentCard from "./StudentCard";
import ProfitPanel from "./ProfitPanel";

type FeeRecords = ReturnType<typeof useStudentsData>["feeRecords"];
// 班別 → 人數（判斷雙軌團/精用）
type ClassSize = Map<string, number>;

type View = "list" | "course" | "family" | "teacher" | "enrolled" | "class";
const VIEWS: { key: View; label: string }[] = [
  { key: "list", label: "☰ 一般列表" },
  { key: "course", label: "🎼 依課程" },
  { key: "family", label: "👨‍👩‍👧 依家庭" },
  { key: "teacher", label: "🧑‍🏫 依老師" },
  { key: "enrolled", label: "📅 依入校時間" },
  { key: "class", label: "🏷️ 依班別" },
];

// 老師欄可能是「宇群, 美君」→ 拆成個別老師
function splitTeachers(t: string | null): string[] {
  const raw = (t ?? "").trim();
  if (!raw) return ["（未指定老師）"];
  return raw
    .split(/[,、，\/\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// 入校年月（民國→西元；到月）。回傳 { label, sort }：sort 用 YYYY-MM 便於排序
function enrolledYM(s: Student): { label: string; sort: string } {
  const raw = (s.enrolled_on ?? "").trim();
  if (!raw) return { label: "（未填入校時間）", sort: "0000-00" };
  const m = raw.match(/(\d{2,4})(?:\D+(\d{1,2}))?/);
  if (!m) return { label: raw, sort: "0000-01" };
  let y = Number(m[1]);
  if (y < 1911) y += 1911; // 民國→西元
  if (!m[2]) return { label: `${y} 年（月份未填）`, sort: `${y}-00` };
  const mo = Number(m[2]);
  return {
    label: `${y} 年 ${mo} 月入校`,
    sort: `${y}-${String(mo).padStart(2, "0")}`,
  };
}

export default function StudentsApp({
  teacher,
  onSignOut,
  onSwitchModule,
  onOpenAccounting,
  onOpenMySchedule,
}: {
  teacher: Teacher;
  onSignOut: () => void;
  onSwitchModule?: () => void;
  onOpenAccounting?: () => void;
  onOpenMySchedule?: () => void;
}) {
  const data = useStudentsData();
  const isAdmin = teacher.is_admin;
  const [q, setQ] = useState("");
  const [fCourse, setFCourse] = useState<string>("");
  const [fStatus, setFStatus] = useState<string>("");
  const [fTeacher, setFTeacher] = useState<string>("");
  const [view, setView] = useState<View>("list");
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  // 班別人數表（雙軌團/精判斷用）
  const classSize: ClassSize = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of data.students) {
      const slot = (s.class_slot ?? "").trim();
      if (!slot) continue;
      m.set(slot, (m.get(slot) ?? 0) + 1);
    }
    return m;
  }, [data.students]);
  const sizeOf = useCallback(
    (s: Student) => {
      const slot = (s.class_slot ?? "").trim();
      return slot ? classSize.get(slot) ?? 1 : 1;
    },
    [classSize]
  );

  // 毛利（僅管理員）
  const [overhead, setOverhead] = useState(80000);
  useEffect(() => {
    if (isAdmin) fetchFixedOverhead().then(setOverhead);
  }, [isAdmin]);
  const profit = useMemo<ProfitResult | null>(() => {
    if (!isAdmin) return null;
    return computeProfit({
      students: data.students,
      classCosts: data.classCosts,
      fixedOverhead: overhead,
    });
  }, [isAdmin, data.students, data.classCosts, overhead]);
  const refreshProfit = useCallback(async () => {
    setOverhead(await fetchFixedOverhead());
    await data.refresh();
  }, [data]);

  const teacherOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of data.students)
      for (const t of splitTeachers(s.teacher))
        if (t !== "（未指定老師）") set.add(t);
    return Array.from(set).sort();
  }, [data.students]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return data.students.filter((s) => {
      if (fCourse) {
        // 雙軌(T) 篩選＝所有雙軌學生；其餘照課程種類精確比對
        if (isDualTrack(fCourse)) {
          if (!isDualTrack(s.course_type)) return false;
        } else if (s.course_type !== fCourse) return false;
      }
      if (fStatus && s.status !== fStatus) return false;
      if (fTeacher && !splitTeachers(s.teacher).includes(fTeacher)) return false;
      if (kw) {
        const hay = [
          s.name,
          s.nickname,
          s.father_name,
          s.mother_name,
          s.father_phone,
          s.mother_phone,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [data.students, q, fCourse, fStatus, fTeacher]);

  const editingStudent =
    editing && editing.id
      ? data.students.find((s) => s.id === editing.id) ?? null
      : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-6">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-navy">學生資料</h1>
          <p className="text-sm text-black/60">
            {teacher.name}
            {teacher.is_admin ? "（管理者）" : "（負責人）"}・序曲學生名冊
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {onSwitchModule && (
            <button
              onClick={onSwitchModule}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              {onOpenMySchedule ? "🛠️ 排課後台" : "🎵 排課"}
            </button>
          )}
          {onOpenMySchedule && (
            <button
              onClick={onOpenMySchedule}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              🗓️ 我的排課
            </button>
          )}
          {onOpenAccounting && (
            <button
              onClick={onOpenAccounting}
              className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
            >
              💰 記帳
            </button>
          )}
          <button
            onClick={onSignOut}
            className="rounded-full border border-black/15 px-3 py-1.5 text-xs text-black/60 transition hover:border-black/40"
          >
            登出
          </button>
        </div>
      </header>

      {/* 毛利面板（僅管理員，可收合） */}
      {isAdmin && profit && (
        <ProfitPanel profit={profit} onRefresh={refreshProfit} />
      )}

      {/* 搜尋 + 新增 */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="🔍 搜尋 姓名/暱稱/家長/電話"
          className="min-w-0 flex-1 rounded-full border border-black/15 bg-white px-4 py-2 text-sm outline-none focus:border-navy"
        />
        <button
          onClick={() => setEditing({ id: null })}
          className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 active:scale-95"
        >
          ＋新增學生
        </button>
      </div>

      {/* 檢視切換（可橫向捲動） */}
      <div className="mb-3 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            onClick={() => setView(v.key)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
              view === v.key
                ? "bg-navy text-white"
                : "border border-black/15 text-black/60 hover:border-black/40"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* 篩選列 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-black/10 bg-white/60 p-2">
        <FilterSelect
          value={fCourse}
          onChange={setFCourse}
          allLabel="全部課程"
          options={COURSE_TYPES as unknown as string[]}
        />
        <FilterSelect
          value={fStatus}
          onChange={setFStatus}
          allLabel="全部狀態"
          options={ALL_STATUS as unknown as string[]}
        />
        {teacherOptions.length > 0 && (
          <FilterSelect
            value={fTeacher}
            onChange={setFTeacher}
            allLabel="全部老師"
            options={teacherOptions}
          />
        )}
      </div>

      {data.loading ? (
        <div className="py-16 text-center text-sm text-black/45">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/15 bg-white/50 px-4 py-12 text-center text-sm text-black/40">
          {data.students.length === 0
            ? "還沒有學生。點右上「＋新增學生」開始。"
            : "沒有符合條件的學生。"}
        </div>
      ) : view === "list" ? (
        <FlatView
          students={filtered}
          feeRecords={data.feeRecords}
          sizeOf={sizeOf}
          onOpen={(id) => setEditing({ id })}
        />
      ) : view === "family" ? (
        <FamilyView
          students={filtered}
          feeRecords={data.feeRecords}
          sizeOf={sizeOf}
          onOpen={(id) => setEditing({ id })}
        />
      ) : view === "teacher" ? (
        <TeacherView
          students={filtered}
          feeRecords={data.feeRecords}
          sizeOf={sizeOf}
          onOpen={(id) => setEditing({ id })}
        />
      ) : (
        <GroupedView
          students={filtered}
          feeRecords={data.feeRecords}
          sizeOf={sizeOf}
          onOpen={(id) => setEditing({ id })}
          view={view}
        />
      )}

      <p className="mt-4 text-center text-xs text-black/30">
        共 {filtered.length} 位（總名冊 {data.students.length} 位）
      </p>

      {editing && (
        <StudentCard
          teacher={teacher}
          student={editingStudent}
          feeRecords={data.feeRecords}
          allStudents={data.students}
          classCosts={data.classCosts}
          classSize={classSize}
          onClose={() => setEditing(null)}
          onSaved={data.refresh}
        />
      )}
    </main>
  );
}

// ── 一般列表 ─────────────────────────────────────────
function FlatView({
  students,
  feeRecords,
  sizeOf,
  onOpen,
}: {
  students: Student[];
  feeRecords: FeeRecords;
  sizeOf: (s: Student) => number;
  onOpen: (id: string) => void;
}) {
  const sorted = useMemo(
    () => [...students].sort((a, b) => a.name.localeCompare(b.name, "zh-Hant")),
    [students]
  );
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {sorted.map((s) => (
        <StudentRow
          key={s.id}
          student={s}
          feeRecords={feeRecords}
          sizeOf={sizeOf}
          onOpen={onOpen}
        />
      ))}
    </div>
  );
}

// ── 依老師（多位老師的學生會在每位老師底下各出現一次）──
function TeacherView({
  students,
  feeRecords,
  sizeOf,
  onOpen,
}: {
  students: Student[];
  feeRecords: FeeRecords;
  sizeOf: (s: Student) => number;
  onOpen: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Student[]>();
    for (const s of students) {
      for (const t of splitTeachers(s.teacher)) {
        const arr = map.get(t) ?? [];
        arr.push(s);
        map.set(t, arr);
      }
    }
    return Array.from(map.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "zh-Hant")
    );
  }, [students]);

  return (
    <div className="space-y-5">
      {groups.map(([label, list]) => (
        <Section key={label} label={`${label}老師`} count={list.length}>
          {list.map((s) => (
            <StudentRow
              key={label + s.id}
              student={s}
              feeRecords={feeRecords}
              sizeOf={sizeOf}
              onOpen={onOpen}
            />
          ))}
        </Section>
      ))}
    </div>
  );
}

// ── 通用分組（課程 / 入校時間 / 班別）──
function GroupedView({
  students,
  feeRecords,
  sizeOf,
  onOpen,
  view,
}: {
  students: Student[];
  feeRecords: FeeRecords;
  sizeOf: (s: Student) => number;
  onOpen: (id: string) => void;
  view: "course" | "enrolled" | "class";
}) {
  const groups = useMemo(() => {
    // key＝分組值；每組記 label 與 sort
    const map = new Map<string, { label: string; sort: string; list: Student[] }>();
    for (const s of students) {
      let key: string;
      let label: string;
      let sort: string;
      if (view === "course") {
        key = label = displayCourseType(s, sizeOf(s));
        sort = key;
      } else if (view === "enrolled") {
        const ym = enrolledYM(s);
        key = label = ym.label;
        sort = ym.sort;
      } else {
        key = label = s.class_slot?.trim() || "（未填班別）";
        sort = key;
      }
      const g = map.get(key) ?? { label, sort, list: [] };
      g.list.push(s);
      map.set(key, g);
    }
    const entries = Array.from(map.values());
    if (view === "course") {
      const order = [
        "一對一樂器",
        "一對一樂理",
        "雙軌團班",
        "雙軌精緻班",
        "學齡前律動",
        "音樂遊戲探索",
        "（未分類）",
      ];
      entries.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label));
    } else if (view === "enrolled") {
      entries.sort((a, b) => b.sort.localeCompare(a.sort)); // 新→舊
    } else {
      entries.sort((a, b) => a.sort.localeCompare(b.sort, "zh-Hant"));
    }
    return entries;
  }, [students, view, sizeOf]);

  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <Section key={g.label} label={g.label} count={g.list.length}>
          {g.list.map((s) => (
            <StudentRow
              key={s.id}
              student={s}
              feeRecords={feeRecords}
              sizeOf={sizeOf}
              onOpen={onOpen}
            />
          ))}
        </Section>
      ))}
    </div>
  );
}

// ── 依家庭（家庭標籤＝學生名字）──
function FamilyView({
  students,
  feeRecords,
  sizeOf,
  onOpen,
}: {
  students: Student[];
  feeRecords: FeeRecords;
  sizeOf: (s: Student) => number;
  onOpen: (id: string) => void;
}) {
  const groups = useMemo(() => groupByFamily(students), [students]);
  return (
    <div className="space-y-4">
      {groups.map(([label, list]) => (
        <section
          key={label + list[0].id}
          className={
            list.length > 1
              ? "rounded-2xl border border-navy/15 bg-navy/[0.03] p-3"
              : ""
          }
        >
          {list.length > 1 && (
            <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-navy">
              👨‍👩‍👧 {label}
              <span className="rounded-full bg-navy/10 px-2 py-0.5 text-xs font-normal">
                {list.length} 位
              </span>
            </h2>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((s) => (
              <StudentRow
                key={s.id}
                student={s}
                feeRecords={feeRecords}
                sizeOf={sizeOf}
                onOpen={onOpen}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// 分組區塊外框
function Section({
  label,
  count,
  children,
}: {
  label: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-navy">
        {label}
        <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-normal text-black/45">
          {count}
        </span>
      </h2>
      <div className="grid gap-2 sm:grid-cols-2">{children}</div>
    </section>
  );
}

// ── 單張學生列 ───────────────────────────────────────
function StudentRow({
  student: s,
  feeRecords,
  sizeOf,
  onOpen,
}: {
  student: Student;
  feeRecords: FeeRecords;
  sizeOf: (s: Student) => number;
  onOpen: (id: string) => void;
}) {
  const last = latestFee(feeRecords, s.id);
  const course = displayCourseType(s, sizeOf(s));
  return (
    <button
      onClick={() => onOpen(s.id)}
      className="rounded-2xl border border-black/10 bg-white p-3 text-left shadow-sm transition hover:border-navy/30 active:scale-[0.99]"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-navy">
          {s.name}
          {s.nickname && (
            <span className="ml-1 text-xs font-normal text-black/40">
              {s.nickname}
            </span>
          )}
        </span>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[s.status as StudentStatus]}`}
        >
          {s.status}
        </span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-black/50">
        {s.course_type && (
          <span className="rounded bg-navy/5 px-1.5 py-0.5 text-navy/70">
            {course}
          </span>
        )}
        {s.instrument && <span>{s.instrument}</span>}
        {s.teacher && <span>· {s.teacher}老師</span>}
        {s.class_slot && <span>· {s.class_slot}</span>}
      </div>
      {(s.current_plan || last) && (
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          <span className="rounded bg-brand/10 px-1.5 py-0.5 font-medium text-brand">
            目前方案
          </span>
          <span className="truncate text-black/70">
            {s.current_plan ?? last?.plan ?? "—"}
          </span>
          {last?.amount != null && (
            <span className="ml-auto shrink-0 tabular-nums text-black/50">
              上次 {fmtMoney(last.amount)}
            </span>
          )}
        </div>
      )}
      {s.discount_note && (
        <p className="mt-1 truncate text-xs text-[#5f7a4f]">
          🎁 {s.discount_note}
        </p>
      )}
    </button>
  );
}

// ── 迷你篩選下拉 ─────────────────────────────────────
function FilterSelect({
  value,
  onChange,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  allLabel: string;
  options: string[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-black/15 bg-white px-3 py-1.5 text-xs text-black/70 outline-none focus:border-navy"
    >
      <option value="">{allLabel}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}
