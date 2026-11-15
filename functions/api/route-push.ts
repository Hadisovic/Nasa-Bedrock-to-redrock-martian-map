import { buildPushPayload } from "@block65/webcrypto-web-push";
import type { PushSubscription } from "@block65/webcrypto-web-push";

const headers = { "Cache-Control": "no-store" };
const empty = (status: number) => new Response(null, { status, headers });
const limit = 4096;
const lifetime = 20;
type Env = {
  ROUTE_PUSH_PUBLIC_KEY?: string;
  ROUTE_PUSH_PRIVATE_KEY?: string;
  ROUTE_PUSH_SUBJECT?: string;
};

export function onRequestGet({ env }: { env: Env }) {
  return env.ROUTE_PUSH_PUBLIC_KEY && env.ROUTE_PUSH_PRIVATE_KEY && env.ROUTE_PUSH_SUBJECT
    ? Response.json({ publicKey: env.ROUTE_PUSH_PUBLIC_KEY }, { headers }) : empty(503);
}

async function readPayload(request: Request): Promise<{ subscription?: Partial<PushSubscription>; body?: unknown } | null> {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const bytes = new Uint8Array(limit);
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(new TextDecoder().decode(bytes.subarray(0, size)));
      if (size + value.length > limit) {
        await reader.cancel();
        return null;
      }
      bytes.set(value, size);
      size += value.length;
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}

function allowedEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  let endpoint;
  try { endpoint = new URL(value); } catch { return false; }
  if (endpoint.protocol !== "https:" || endpoint.port || endpoint.username || endpoint.password || endpoint.hash) return false;
  const { hostname, pathname } = endpoint;
  return (hostname === "fcm.googleapis.com" && pathname.startsWith("/fcm/send/")) ||
    (hostname === "updates.push.services.mozilla.com" && pathname.startsWith("/wpush/v2/")) ||
    (hostname.endsWith(".push.apple.com") && pathname.length > 1);
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  if (request.headers.get("Origin") !== new URL(request.url).origin ||
      request.headers.get("Sec-Fetch-Site") !== "same-origin" ||
      !request.headers.get("Content-Type")?.startsWith("application/json")) return empty(403);
  if (!env.ROUTE_PUSH_PUBLIC_KEY || !env.ROUTE_PUSH_PRIVATE_KEY || !env.ROUTE_PUSH_SUBJECT) return empty(503);
  const payload = await readPayload(request);
  const { subscription, body } = payload ?? {};
  const endpoint = subscription?.endpoint;
  const { p256dh, auth } = subscription?.keys ?? {};
  if (!allowedEndpoint(endpoint) ||
      typeof p256dh !== "string" || !/^[A-Za-z0-9_-]{87}$/.test(p256dh) ||
      typeof auth !== "string" || !/^[A-Za-z0-9_-]{22}$/.test(auth) ||
      typeof body !== "string" || !body.length || body.length > 320) return empty(400);

  try {
    const push = await buildPushPayload({
      data: { type: "martian-map-gps", body, expires: Date.now() + lifetime * 1000 },
      options: { ttl: lifetime, urgency: "high", topic: "martian-map-gps" },
    }, { endpoint, expirationTime: null, keys: { p256dh, auth } }, {
      subject: env.ROUTE_PUSH_SUBJECT, publicKey: env.ROUTE_PUSH_PUBLIC_KEY, privateKey: env.ROUTE_PUSH_PRIVATE_KEY,
    });
    const response = await fetch(endpoint, {
      ...push,
      redirect: "error", signal: AbortSignal.timeout(3500),
    });
    if (response.body) await response.body.cancel();
    return empty(response.ok ? 204 : response.status === 404 || response.status === 410 ? 410 : 502);
  } catch {
    return empty(502);
  }
}
