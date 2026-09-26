"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import Login from "@/components/Login";
import ScheduleApp from "@/components/ScheduleApp";
import AdminDashboard from "@/components/AdminDashboard";
import AccountingApp from "@/components/accounting/AccountingApp";
import StudentsApp from "@/components/students/StudentsApp";
import WorkerApp from "@/components/WorkerApp";
import ClosingApp from "@/components/ClosingApp";

// admin=排課後台（管理全部老師）；me=我的排課（自己填）；accounting=記帳；students=學生資料；closing=打烊
type View = "admin" | "me" | "accounting" | "students" | "closing";

export default function Page() {
  const { loading, session, teacher, signInWithName, signOut } = useAuth();
  const [view, setView] = useState<View | null>(null);

  if (!isSupabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center text-sm text-black/60">
        尚未設定 Supabase 連線（.env.local）。
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-black/50">
        <span className="animate-pulse">載入中…🎵</span>
      </div>
    );
  }

  if (!session || !teacher) {
    return <Login onLogin={signInWithName} />;
  }

  // 純工讀生（只有 is_worker、沒有其他模組權限）：只看簽到頁
  const pureWorker =
    teacher.is_worker &&
    !teacher.is_admin &&
    !teacher.can_accounting &&
    !teacher.can_students &&
    !teacher.can_schedule_admin;
  if (pureWorker) {
    return <WorkerApp teacher={teacher} onSignOut={signOut} />;
  }

  const isAdmin = teacher.is_admin;
  const hasAccounting = isAdmin || teacher.can_accounting;
  const hasStudents = isAdmin || teacher.can_students;
  const hasScheduleAdmin = isAdmin || teacher.can_schedule_admin;
  // 預設畫面：宇群(管理員＋記帳)→直接進記帳；純排課管理員→排課後台；一般老師→我的排課
  const defaultView: View = isAdmin
    ? teacher.can_accounting
      ? "accounting"
      : "admin"
    : "me";
  const current: View = view ?? defaultView;

  const toAccounting = hasAccounting ? () => setView("accounting") : undefined;
  const toStudents = hasStudents ? () => setView("students") : undefined;
  // 打烊：記帳成員（宇群/美君/奕寬）＋工讀生（純工讀生在 WorkerApp 裡有打烊分頁）
  const hasClosing = hasAccounting || teacher.is_worker;
  const toClosing = hasClosing ? () => setView("closing") : undefined;

  // 打烊紀錄（獨立模組，與排課/學生/記帳同一排）
  if (current === "closing" && hasClosing) {
    return (
      <ClosingApp
        teacher={teacher}
        onSignOut={signOut}
        onSwitchModule={() => setView(isAdmin ? "admin" : "me")}
        onOpenMySchedule={isAdmin ? () => setView("me") : undefined}
        onOpenStudents={toStudents}
        onOpenAccounting={toAccounting}
      />
    );
  }

  // 學生資料（宇群/奕寬/美君）
  if (current === "students" && hasStudents) {
    return (
      <StudentsApp
        teacher={teacher}
        onSignOut={signOut}
        onSwitchModule={() => setView(isAdmin ? "admin" : "me")}
        onOpenAccounting={toAccounting}
        onOpenMySchedule={isAdmin ? () => setView("me") : undefined}
        onOpenClosing={toClosing}
      />
    );
  }

  if (current === "accounting" && hasAccounting) {
    return (
      <AccountingApp
        teacher={teacher}
        onSignOut={signOut}
        onSwitchModule={() => setView(isAdmin ? "admin" : "me")}
        onOpenMySchedule={isAdmin ? () => setView("me") : undefined}
        onOpenStudents={toStudents}
        onOpenClosing={toClosing}
      />
    );
  }

  // 排課後台（管理員或有排課後台權限者：宇群、美君、奕寬…）
  if (hasScheduleAdmin && current === "admin") {
    return (
      <AdminDashboard
        teacher={teacher}
        onSignOut={signOut}
        onSwitchModule={toAccounting}
        onOpenMySchedule={() => setView("me")}
        onOpenStudents={toStudents}
        onOpenClosing={toClosing}
      />
    );
  }

  // 我的排課（一般老師；管理員也可切來填自己的）
  return (
    <ScheduleApp
      teacher={teacher}
      onSignOut={signOut}
      onSwitchModule={toAccounting}
      onOpenAdmin={hasScheduleAdmin ? () => setView("admin") : undefined}
      onOpenStudents={toStudents}
      onOpenClosing={toClosing}
    />
  );
}
