"use client";

import { supabase } from "./supabase";

// VAPID 公鑰（可公開；私鑰放 GitHub Actions 與 Supabase Edge Function 機密，用來發送）
// 2026-08 重置新金鑰（舊私鑰遺失）；換鑰後所有裝置需重新開啟通知訂閱一次。
export const VAPID_PUBLIC =
  "BLqz3M_1JEu1qjwXgRSGN1sjuDJ_7Mb7Sn68yb5FZgiI-wcDfHA-ARwupYr231HxHC1VX0r8XSG0iqE3mgcAh54";

function urlB64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export async function isPushEnabled() {
  if (!pushSupported()) return false;
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return !!sub;
}

export type EnableResult = "ok" | "denied" | "unsupported" | "error";

export async function enablePush(teacherId: string): Promise<EnableResult> {
  if (!pushSupported()) return "unsupported";
  try {
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return "denied";
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC),
      });
    }
    const json = sub.toJSON();
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        { teacher_id: teacherId, endpoint: json.endpoint, subscription: json },
        { onConflict: "endpoint" }
      );
    if (error) return "error";
    return "ok";
  } catch {
    return "error";
  }
}
