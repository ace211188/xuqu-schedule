// 序曲排課收集 — Service Worker
const BASE = "/xuqu-schedule";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim())
);

// 收到推播 → 顯示通知（提醒老師填排課）
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "序曲排課提醒 🎵";
  const body = data.body || "記得填這個月的排課哦～";
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: `${BASE}/logo-mark.png`,
      badge: `${BASE}/logo-mark.png`,
      data: { url: `${BASE}/` },
    })
  );
});

// 點通知 → 打開網站
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || `${BASE}/`;
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      for (const c of list) if (c.url.includes(BASE) && "focus" in c) return c.focus();
      return self.clients.openWindow(url);
    })
  );
});
