"use client";

import { useEffect, useState, useCallback } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type Teacher = { id: string; name: string; is_admin: boolean };

const EMAIL_DOMAIN = "xuqu.tw";

export function useAuth() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [teacher, setTeacher] = useState<Teacher | null>(null);

  const loadTeacher = useCallback(async (uid: string) => {
    const { data } = await supabase
      .from("teachers")
      .select("id,name,is_admin")
      .eq("id", uid)
      .single();
    setTeacher(data ?? null);
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
