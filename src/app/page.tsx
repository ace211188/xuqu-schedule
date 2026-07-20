"use client";

import { useState } from "react";
import { useAuth } from "@/lib/useAuth";
import { isSupabaseConfigured } from "@/lib/supabase";
import Login from "@/components/Login";
import ScheduleApp from "@/components/ScheduleApp";
import AdminDashboard from "@/components/AdminDashboard";
import AccountingApp from "@/components/accounting/AccountingApp";

type Module = "schedule" | "accounting";

export default function Page() {
  const { loading, session, teacher, signInWithName, signOut } = useAuth();
  const [module, setModule] = useState<Module>("schedule");

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

  const hasAccounting = teacher.is_admin || teacher.can_accounting;

  if (module === "accounting" && hasAccounting) {
    return (
      <AccountingApp
        teacher={teacher}
        onSignOut={signOut}
        onSwitchModule={() => setModule("schedule")}
      />
    );
  }

  const toAccounting = hasAccounting
    ? () => setModule("accounting")
    : undefined;

  if (teacher.is_admin) {
    return (
      <AdminDashboard
        teacher={teacher}
        onSignOut={signOut}
        onSwitchModule={toAccounting}
      />
    );
  }

  return (
    <ScheduleApp
      teacher={teacher}
      onSignOut={signOut}
      onSwitchModule={toAccounting}
    />
  );
}
