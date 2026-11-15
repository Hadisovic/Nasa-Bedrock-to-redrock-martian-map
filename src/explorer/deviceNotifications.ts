import { marsWorker } from "./marsWorker.ts";

const preferenceKey = "martian-map.gps-notifications";
const requestedKey = "martian-map.gps-notifications-requested";
let requested = false;
let enabled = true;

export function notificationsSupported() {
  return isSecureContext && "Notification" in window && "serviceWorker" in navigator &&
    "ServiceWorkerRegistration" in window &&
    typeof ServiceWorkerRegistration.prototype.showNotification === "function";
}

export function noticePreference() {
  try { enabled = localStorage.getItem(preferenceKey) !== "off"; } catch { /* Keep the choice for this page. */ }
  return enabled;
}

export function saveNoticePreference(value: boolean) {
  enabled = value;
  try {
    localStorage.setItem(preferenceKey, value ? "on" : "off");
    if (value) localStorage.removeItem(requestedKey);
  } catch { /* Storage can be blocked by the browser. */ }
  if (value) requested = false;
}

export function prepareRouteNotices() {
  if (!notificationsSupported() || Notification.permission === "denied") return;
  void marsWorker().catch(() => {});
  if (Notification.permission !== "default" || requested) return;
  try { if (localStorage.getItem(requestedKey)) return; } catch { /* Use the in-memory choice. */ }
  requested = true;
  try { localStorage.setItem(requestedKey, "yes"); } catch { /* Use the in-memory choice. */ }
  try { void Notification.requestPermission().catch(() => {}); } catch { /* This browser rejected the request. */ }
}

export function routeNotice(text: string) {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  const target = location.href;
  void marsWorker().then((worker) => worker.showNotification("Martian Map · GPS demo", {
    body: text, tag: "martian-map-gps", silent: true,
    icon: new URL("images/martian-map-logo.png", worker.scope).href,
    data: { target },
  })).catch(() => {});
}

export function clearRouteNotice() {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  void marsWorker().then(async (worker) => {
    for (const notice of await worker.getNotifications({ tag: "martian-map-gps" })) notice.close();
  }).catch(() => {});
}
