import { marsWorker } from "./marsWorker.ts";

const preferenceKey = "martian-map.gps-notifications";
const askedKey = preferenceKey + ".asked";
const tag = "martian-map-gps";
let asked = false;

export function notificationsSupported() {
  return isSecureContext && "Notification" in window && "serviceWorker" in navigator;
}

export function noticePreference() {
  try { return localStorage.getItem(preferenceKey) !== "off"; }
  catch { return true; }
}

export function saveNoticePreference(enabled: boolean) {
  try {
    localStorage.setItem(preferenceKey, enabled ? "on" : "off");
    if (enabled) localStorage.removeItem(askedKey);
  } catch { /* The choice still applies to this route. */ }
  if (enabled) asked = false;
}

async function notificationPermission() {
  if (Notification.permission !== "default" || asked) return Notification.permission;
  try { if (localStorage.getItem(askedKey)) return Notification.permission; }
  catch { /* Remember the request for this page. */ }
  asked = true;
  try { localStorage.setItem(askedKey, "yes"); } catch { /* Remember the request for this page. */ }
  return Notification.requestPermission();
}

export function prepareRouteNotices() {
  if (!notificationsSupported()) return null;
  const api = new URL("./api/route-push", location.href);
  const worker = notificationPermission()
    .then((permission) => permission === "granted" ? marsWorker() : null)
    .catch(() => null);
  let subscription: PushSubscription | null = null;
  let closed = false;
  let delivery: AbortController | undefined;

  void worker.then(async (registration) => {
    if (!registration?.pushManager || closed) return;
    const response = await fetch(api, { cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
    const { publicKey } = await response.json();
    if (typeof publicKey !== "string" || closed) return;
    subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
      userVisibleOnly: true, applicationServerKey: publicKey,
    });
  }).catch(() => { /* The service worker can still display a local notification. */ });

  const clear = () => {
    delivery?.abort();
    void worker.then(async (registration) => {
      for (const notice of await registration?.getNotifications({ tag }) ?? []) notice.close();
    }).catch(() => {});
  };
  return {
    clear,
    close() { closed = true; clear(); },
    show(instruction?: string) {
      delivery?.abort();
      const controller = new AbortController();
      delivery = controller;
      const body = instruction ? `${instruction.slice(0, 240)} Open Martian Map to continue live GPS.`
        : "Open Martian Map to resume live GPS and receive directions.";
      void worker.then(async (registration) => {
        if (!registration || closed || controller.signal.aborted || !document.hidden) return;
        if (subscription) {
          try {
            const response = await fetch(api, {
              method: "POST", headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ subscription: subscription.toJSON(), body }),
              signal: AbortSignal.any([controller.signal, AbortSignal.timeout(4000)]),
            });
            if (response.ok) return;
            if (response.status === 410) {
              void subscription.unsubscribe().catch(() => {});
              subscription = null;
            }
          } catch { /* Fall back to a local notification when push delivery fails. */ }
        }
        if (closed || controller.signal.aborted || !document.hidden) return;
        await registration.showNotification("Martian Map · GPS demo", {
          body, tag, silent: true, icon: new URL("images/martian-map-logo.png", registration.scope).href,
        });
      }).catch(() => {});
    },
  };
}
