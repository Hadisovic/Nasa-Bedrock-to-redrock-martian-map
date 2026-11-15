const scope = self.registration.scope;
const prefix = "martian-map-offline:" + scope + ":";
const url = (path) => new URL(path, scope).href;
self.addEventListener("install", (event) => { event.waitUntil(self.skipWaiting()); });
self.addEventListener("activate", (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener("notificationclick", (event) => {
  if (event.notification.tag !== "martian-map-gps") return;
  event.notification.close();
  const target = new URL(event.notification.data?.target || "./#/explore", scope);
  const base = new URL(scope);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname) || !target.hash.startsWith("#/explore")) return;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const current = windows.find((client) => client.url === target.href);
    if (current) await current.focus();
    else await self.clients.openWindow(target.href);
  })());
});

self.addEventListener("message", (event) => {
  const { pack, version, files } = event.data ?? {};
  const port = event.ports[0];
  if (!port || !["core", "gale", "wildcat"].includes(pack) || typeof version !== "string" || !Array.isArray(files)) return;
  event.waitUntil((async () => {
    const key = prefix + version + ":" + pack;
    try {
      const cache = await caches.open(key);
      for (let i = 0; i < files.length; i += 4) {
        await Promise.all(files.slice(i, i + 4).map(async ({ path }) => {
          const resource = url(path);
          if (!resource.startsWith(scope)) throw Error("Resource outside this app");
          if (!await cache.match(resource, { ignoreVary: true })) await cache.add(new Request(resource, { cache: "reload" }));
        }));
        port.postMessage({ progress: Math.min(i + 4, files.length) });
      }
      await cache.put(url("__offline_ready__"), new Response("ready"));
      port.postMessage({ ready: true });
    } catch { port.postMessage({ error: "Download incomplete. Check storage and your connection, then retry." }); }
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || !request.url.startsWith(scope) || request.headers.has("Range")) return;
  event.respondWith((async () => {
    const keys = (await caches.keys()).filter((name) => name.startsWith(prefix)).reverse();
    const fromPacks = async (resource) => {
      for (const name of keys) {
        const cache = await caches.open(name);
        // These same-origin files are immutable within a build. A module request may
        // carry an Origin header that a pack download lacked (Vite sends Vary: Origin).
        const hit = await cache.match(resource, { ignoreVary: true });
        if (hit) return hit;
      }
    };
    if (request.mode === "navigate" || request.url === url("offline-files.json")) {
      try {
        const response = await fetch(request, { cache: "no-cache" });
        if (response.ok) return response;
      } catch { /* Use the downloaded build when the server cannot respond. */ }
      return await fromPacks(request.mode === "navigate" ? url("index.html") : request) ?? Response.error();
    }
    return await fromPacks(request) ?? await fetch(request);
  })());
});
