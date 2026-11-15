import { useEffect, useState } from "react";
import { marsWorker } from "./marsWorker.ts";

type Pack = "core" | "gale" | "wildcat";
type FileEntry = { path: string; bytes: number };
type Manifest = { version: string } & Record<Pack, FileEntry[]>;
const packs: { id: Pack; name: string; extent: string }[] = [
  { id: "core", name: "Planet map and app", extent: "Global maps, MOLA elevation and discovery records" },
  { id: "gale", name: "Gale Crater", extent: "6.2 km projected terrain patch · 20 m grid" },
  { id: "wildcat", name: "Wildcat Ridge", extent: "384 m square · 1 m grid and aligned HiRISE imagery" },
];

export function OfflinePacks() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [worker, setWorker] = useState<ServiceWorker | null>(null);
  const [state, setState] = useState<Partial<Record<Pack, string>>>({});
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (import.meta.env.DEV || !("serviceWorker" in navigator) || !isSecureContext) return;
    let live = true;
    void Promise.all([
      marsWorker(),
      fetch("./offline-files.json").then(async (response) => {
        if (!response.ok) throw Error("manifest");
        return response.json() as Promise<Manifest>;
      }),
    ]).then(async ([registration, metadata]) => {
      if (!live) return;
      const scope = registration.scope;
      setManifest(metadata); setWorker(registration.active);
      const ready = await Promise.all(packs.map(async ({ id }) => {
        const cache = await caches.open("martian-map-offline:" + scope + ":" + metadata.version + ":" + id);
        return [id, await cache.match(new URL("__offline_ready__", scope)) ? "Ready offline" : ""] as const;
      }));
      if (live) setState(Object.fromEntries(ready));
    }).catch(() => { if (live) setStatus("The offline installer could not start."); });
    return () => { live = false; };
  }, []);
  function download(id: Pack) {
    if (!manifest || !worker || !manifest[id].length) return;
    const channel = new MessageChannel();
    const files = id === "core" ? [...manifest.core, { path: "offline-files.json", bytes: 0 }] : manifest[id];
    setState((s) => ({ ...s, [id]: "Downloading…" }));
    channel.port1.onmessage = ({ data }) => {
      setState((s) => ({ ...s, [id]: data.ready ? "Ready offline" : data.error ?? `${data.progress} / ${files.length} files` }));
      if (data.ready || data.error) channel.port1.close();
    };
    worker.postMessage({ pack: id, version: manifest.version, files }, [channel.port2]);
  }
  return <details><summary>Offline maps</summary>
    {import.meta.env.DEV && <p className="muted small">Offline downloads are available in the production preview: npm run build, then npm run preview.</p>}
    {!import.meta.env.DEV && (!("serviceWorker" in navigator) || !isSecureContext) &&
      <p className="muted small">Offline downloads need HTTPS or localhost and a browser with service worker support.</p>}
    {status && <p className="error">{status}</p>}
    {manifest && packs.map(({ id, name, extent }) => <div className="mission-row" key={id}>
      <div><strong>{name}</strong><p className="muted small">{extent} · {(manifest[id].reduce((n, f) => n + f.bytes, 0) / 1e6).toFixed(1)} MB</p></div>
      <button className="btn btn--small" disabled={!manifest[id].length || state[id] === "Ready offline" || /Downloading|files$/.test(state[id] ?? "")}
        onClick={() => download(id)}>Download</button>
      <span className="small" role="status">{state[id] || (!manifest[id].length ? "Unavailable" : "")}</span>
    </div>)}
    <p className="muted small">Download the planet app first and the regional pack you need. Live NASA tile requests and source websites need internet access.</p>
  </details>;
}
