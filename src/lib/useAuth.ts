"use client";

import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Teacher = {
  id: string;
  name: string;
  is_admin: boolean;
  can_accounting: boolean;
  can_students: boolean;
  can_schedule_admin: boolean;
  is_purchaser: boolean;
  can_view_profit: boolean;
  can_delete_students: boolean;
  is_worker: boolean;
};

const EMAIL_DOMAIN = "xuqu.tw";

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);

  const loadTeacher = useCallback(async (uid: string) => {
    // 用 select("*") 而非列舉欄位：新欄位（如 can_view_profit）SQL 還沒跑時也不會整個查詢報錯、害人登不進來
    const { data } = await supabase
      .from("teachers")
      .select("*")
      .eq("id", uid)
      .single();
    setTeacher(
      data
        ? {
            id: data.id,
            name: data.name,
            is_admin: !!data.is_admin,
            can_accounting: !!data.can_accounting,
            can_students: !!data.can_students,
            can_schedule_admin: !!data.can_schedule_admin,
            is_purchaser: !!data.is_purchaser,
            can_view_profit: !!data.can_view_profit,
            can_delete_students: !!data.can_delete_students,
            is_worker: !!data.is_worker,
          }
        : null
    );
  }, []);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session) await loadTeacher(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, s) => {
      setSession(s);
      if (s) await loadTeacher(s.user.id);
      else setTeacher(null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [loadTeacher]);

  const signInWithName = useCallback(async (name: string, password: string) => {
    const email = `${name.trim().toLowerCase()}@${EMAIL_DOMAIN}`;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  return { loading, session, teacher, signInWithName, signOut };
}
