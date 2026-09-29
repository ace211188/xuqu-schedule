"use client";

import { supabase } from "./supabase";

// 管理員一鍵建立帳號（老師／工讀生）用的小工具：帳號＝名字拼音、密碼＝帳號＋4 位數字

export type LoginAccount = {
  id: string;
  name: string;
  is_worker: boolean;
  username: string | null; // 有記在帳密一覽的才有
};

// 全部帳號＋登入帳號（僅管理員讀得到帳密一覽）
export async function fetchLoginAccounts(): Promise<LoginAccount[]> {
  const [{ data: ts }, { data: cs }] = await Promise.all([
    supabase.from("teachers").select("id,name,is_worker").order("name"),
    supabase.from("teacher_credentials").select("teacher_id,username"),
  ]);
  const cred = new Map(
    ((cs ?? []) as { teacher_id: string; username: string }[]).map((c) => [
      c.teacher_id,
      c.username,
    ])
  );
  return ((ts ?? []) as Omit<LoginAccount, "username">[]).map((t) => ({
    ...t,
    username: cred.get(t.id) ?? null,
  }));
}

// 名字轉拼音帳號（例：雅綸 → yalun）。pinyin-pro 較大，只在需要時才載入。
// 若與既有帳號重複，自動加數字（yalun2、yalun3…）。
export async function suggestHandle(
  name: string,
  taken: Set<string>
): Promise<string> {
  const n = name.trim();
  if (!n) return "";
  const { pinyin } = await import("pinyin-pro");
  const base = pinyin(n, { toneType: "none", type: "array", v: true })
    .join("")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  if (!base) return "";
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) if (!taken.has(`${base}${i}`)) return `${base}${i}`;
  return base;
}

// 密碼：沿用既有慣例「帳號＋4 位數字」
export function newPassword(handle: string): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return `${handle}${String(buf[0] % 10000).padStart(4, "0")}`;
}

// 傳給對方的登入資訊（可直接貼到 LINE）
export function loginMessage(p: {
  kind: "teacher" | "worker";
  name: string;
  handle: string;
  password: string;
}): string {
  const url = `${window.location.origin}${window.location.pathname}`;
  const who = p.kind === "teacher" ? `${p.name}老師` : p.name;
  return [
    "序曲音樂學院・帳號開通 🎵",
    `${who}您好，以下是您的登入資訊：`,
    `帳號：${p.handle}`,
    `密碼：${p.password}`,
    `登入網址：${url}`,
  ].join("\n");
}
