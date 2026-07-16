"use client";

import { supabase } from "./supabase";

// VAPID 公鑰（可公開；私鑰只放 GitHub Actions 機密，用來發送）
export const VAPID_PUBLIC =
  "BC5MFL2TCuDTOEl2hoFckgCaHr0K1mvqKLYifLYc2YjIw2YDfMk76qI4TURrU_dqcFOWaZoHbZH2AfA2ItdNdrk";

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
