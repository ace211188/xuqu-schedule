"use client";

import { useMemo, useState } from "react";
import type { Teacher } from "@/lib/useAuth";
import {
  ALL_STATUS,
  COURSE_TYPES,
  STATUS_TONE,
  fmtMoney,
  groupByFamily,
  latestFee,
  type Student,
  type StudentStatus,
} from "@/lib/students";
import { useStudentsData } from "./useStudentsData";
import StudentCard from "./StudentCard";

export default function StudentsApp({
  teacher,
  onSignOut,
  onSwitchModule,
  onOpenAccounting,
  onOpenMySchedule,
}: {
  teacher: Teacher;
  onSignOut: () => void;
  onSwitchModule?: () => void; // 回排課後台 / 排課
  onOpenAccounting?: () => void; // 去記帳
  onOpenMySchedule?: () => void; // 我的排課
}) {
  const data = useStudentsData();
  const [q, setQ] = useState("");
  const [fCourse, setFCourse] = useState<string>("");
  const [fStatus, setFStatus] = useState<string>("");
  const [fTeacher, setFTeacher] = useState<string>("");
  const [byFamily, setByFamily] = useState(false);
  // 開卡：{ mode:"new" } 或 { mode:"edit", id }
  const [editing, setEditing] = useState<{ id: string | null } | null>(null);

  // 老師篩選選項
  const teacherOptions = useMemo(() => {
    const set = new Set<string>();
    for (const s of data.students) if (s.teacher) set.add(s.teacher);
    return Array.from(set).sort();
  }, [data.students]);

  // 篩選 + 搜尋
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return data.students.filter((s) => {
      if (fCourse && s.course_type !== fCourse) return false;
      if (fStatus && s.status !== fStatus) return false;
      if (fTeacher && s.teacher !== fTeacher) return false;
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
        <button
          onClick={() => setByFamily((v) => !v)}
          className={`ml-auto rounded-full px-3 py-1.5 text-xs font-medium transition ${
            byFamily
              ? "bg-navy text-white"
              : "border border-black/15 text-black/60 hover:border-black/40"
          }`}
        >
          {byFamily ? "👨‍👩‍👧 依家庭檢視" : "☰ 一般列表"}
        </button>
      </div>

      {data.loading ? (
        <div className="py-16 text-center text-sm text-black/45">載入中…</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-black/15 bg-white/50 px-4 py-12 text-center text-sm text-black/40">
          {data.students.length === 0
            ? "還沒有學生。點右上「＋新增學生」開始。"
            : "沒有符合條件的學生。"}
        </div>
      ) : byFamily ? (
        <FamilyView
          students={filtered}
          feeRecords={data.feeRecords}
          onOpen={(id) => setEditing({ id })}
        />
      ) : (
        <CourseView
          students={filtered}
          feeRecords={data.feeRecords}
          onOpen={(id) => setEditing({ id })}
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
          onClose={() => setEditing(null)}
          onSaved={data.refresh}
        />
      )}
    </main>
  );
}

// ── 依課程種類分組 ───────────────────────────────────
function CourseView({
  students,
  feeRecords,
  onOpen,
}: {
  students: Student[];
  feeRecords: ReturnType<typeof useStudentsData>["feeRecords"];
  onOpen: (id: string) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, Student[]>();
    for (const s of students) {
      const k = s.course_type ?? "（未分類）";
      const arr = map.get(k) ?? [];
      arr.push(s);
      map.set(k, arr);
    }
    // 依 COURSE_TYPES 順序排；未分類殿後
    const order = [...(COURSE_TYPES as unknown as string[]), "（未分類）"];
    return Array.from(map.entries()).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
    );
  }, [students]);

  return (
    <div className="space-y-5">
      {groups.map(([course, list]) => (
        <section key={course}>
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-navy">
            {course}
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-xs font-normal text-black/45">
              {list.length}
            </span>
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {list.map((s) => (
              <StudentRow
                key={s.id}
                student={s}
                feeRecords={feeRecords}
                onOpen={onOpen}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── 依家庭分組 ───────────────────────────────────────
function FamilyView({
  students,
  feeRecords,
  onOpen,
}: {
  students: Student[];
  feeRecords: ReturnType<typeof useStudentsData>["feeRecords"];
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
                onOpen={onOpen}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// ── 單張學生卡片（列表項） ───────────────────────────
function StudentRow({
  student: s,
  feeRecords,
  onOpen,
}: {
  student: Student;
  feeRecords: ReturnType<typeof useStudentsData>["feeRecords"];
  onOpen: (id: string) => void;
}) {
  const last = latestFee(feeRecords, s.id);
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

// ── 迷你篩選下拉（用原生 select，緊湊） ────────────────
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
