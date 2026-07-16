import { createClient } from "@supabase/supabase-js";

// 這兩個值來自「新的 Supabase 專案」→ Settings → API：
//   NEXT_PUBLIC_SUPABASE_URL  = Project URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY = anon public key
// anon key 是「公開金鑰」，放在前端沒問題；真正的保護靠 Supabase 的 RLS 政策。
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export const isSupabaseConfigured = Boolean(url && anonKey);
