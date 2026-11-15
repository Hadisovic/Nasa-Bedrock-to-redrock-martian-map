import assert from "node:assert/strict";
import { createECDH, randomBytes } from "node:crypto";
import { test } from "node:test";
import { onRequestGet, onRequestPost } from "../../functions/api/route-push.ts";

const url = "https://mars.example/api/route-push";
const headers = { Origin: new URL(url).origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json" };
const vapid = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const { d: privateKey } = await crypto.subtle.exportKey("jwk", vapid.privateKey);
const publicKey = Buffer.from(await crypto.subtle.exportKey("raw", vapid.publicKey)).toString("base64url");
const env = {
  ROUTE_PUSH_PUBLIC_KEY: publicKey, ROUTE_PUSH_PRIVATE_KEY: privateKey, ROUTE_PUSH_SUBJECT: "https://mars.example",
};
const device = createECDH("prime256v1");
const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/example",
  keys: { p256dh: device.generateKeys().toString("base64url"), auth: randomBytes(16).toString("base64url") },
};
const payload = { subscription, body: "Head north. Open Martian Map to continue live GPS." };
const request = (data: unknown, requestHeaders = headers) =>
  new Request(url, { method: "POST", headers: requestHeaders, body: JSON.stringify(data) });

test("route push publishes only the configured public key and stays disabled without keys", async () => {
  assert.deepEqual(await onRequestGet({ env }).json(), { publicKey });
  assert.equal(onRequestGet({ env: {} }).status, 503);
  assert.equal((await onRequestPost({ env: {}, request: request(payload) })).status, 503);
});

test("route push rejects cross-origin requests, oversized messages and other destinations", async () => {
  const crossOrigin = request(payload, { ...headers, Origin: "https://other.example" });
  assert.equal((await onRequestPost({ env, request: crossOrigin })).status, 403);
  const unrelated = { ...payload, subscription: { ...subscription, endpoint: "https://127.0.0.1/fcm/send/example" } };
  assert.equal((await onRequestPost({ env, request: request(unrelated) })).status, 400);
  assert.equal((await onRequestPost({ env, request: request({ ...payload, body: "x".repeat(4096) }) })).status, 400);
});

test("route push forwards an encrypted, short-lived, authenticated cue and handles expired subscriptions", async (t) => {
  const outgoing = t.mock.method(globalThis, "fetch", async (outbound: URL | string, init: RequestInit) => {
    assert.equal(outbound, subscription.endpoint);
    assert.equal(init.redirect, "error");
    const headers = new Headers(init.headers);
    assert.match(headers.get("Authorization") ?? "", /^vapid /);
    assert.equal(headers.get("Content-Encoding"), "aes128gcm");
    assert.equal(headers.get("TTL"), "20");
    assert.equal(headers.get("Topic"), "martian-map-gps");
    assert.ok(init.body instanceof Uint8Array && !Buffer.from(init.body).includes(payload.body));
    return new Response(null, { status: 201 });
  });
  assert.equal((await onRequestPost({ env, request: request(payload) })).status, 204);
  assert.equal(outgoing.mock.callCount(), 1);
  outgoing.mock.mockImplementation(async () => new Response(null, { status: 410 }));
  assert.equal((await onRequestPost({ env, request: request(payload) })).status, 410);
});
