"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import Login from "@/components/Login";
import ScheduleApp from "@/components/ScheduleApp";
import AdminDashboard from "@/components/AdminDashboard";
import AccountingApp from "@/components/accounting/AccountingApp";

// admin=排課後台（管理全部老師）；me=我的排課（自己填）；accounting=記帳
type View = "admin" | "me" | "accounting";

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

  const isAdmin = teacher.is_admin;
  const hasAccounting = isAdmin || teacher.can_accounting;
  // 預設畫面：管理員→排課後台；一般老師→我的排課
  const current: View = view ?? (isAdmin ? "admin" : "me");

  const toAccounting = hasAccounting ? () => setView("accounting") : undefined;

  if (current === "accounting" && hasAccounting) {
    return (
      <AccountingApp
        teacher={teacher}
        onSignOut={signOut}
        onSwitchModule={() => setView(isAdmin ? "admin" : "me")}
      />
    );
  }

  // 排課後台（僅管理員）
  if (isAdmin && current === "admin") {
    return (
      <AdminDashboard
        teacher={teacher}
        onSignOut={signOut}
        onSwitchModule={toAccounting}
        onOpenMySchedule={() => setView("me")}
      />
    );
  }

  // 我的排課（一般老師；管理員也可切來填自己的）
  return (
    <ScheduleApp
      teacher={teacher}
      onSignOut={signOut}
      onSwitchModule={toAccounting}
      onOpenAdmin={isAdmin ? () => setView("admin") : undefined}
    />
  );
}
