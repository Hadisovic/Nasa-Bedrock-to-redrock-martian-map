import { StrictMode, Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/inter/400.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "@fontsource/archivo-black/400.css";
import { App } from "./App.tsx";
import { Explorer } from "./explorer/Explorer.tsx";
import { Resources } from "./components/Resources.tsx";
import "./styles/app.css";
import "./styles/home.css";
import "./styles/mission.css";

const Bench = lazy(() => import("./bench/Bench.tsx").then((m) => ({ default: m.Bench })));
const LiveHome = lazy(() => import("./components/LiveHome.tsx").then((m) => ({ default: m.LiveHome })));

type Page = "intro" | "explore" | "map" | "bench";

/** Hash routes: #/ intro, #/explore whole-planet explorer, #/map Wildcat Ridge Marswalk, #/bench routing benchmark. */
function read(): Page {
  const hash = window.location.hash;
  if (hash.startsWith("#/explore")) return "explore";
  if (hash.startsWith("#/map")) return "map";
  if (hash.startsWith("#/bench")) return "bench";
  return "intro";
}

function Root() {
  const [page, setPage] = useState<Page>(read);
  const [explorerVisit, setExplorerVisit] = useState(0);
  useEffect(() => {
    const onHash = () => {
      const next = read();
      setPage(next);
      if (next === "explore") setExplorerVisit((visit) => visit + 1);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  if (page === "explore") return <div className="explorer-page">
    <div className="explorer-entry"><Explorer key={explorerVisit} onHome={() => { window.location.hash = "#/"; }} /></div>
    <Resources />
  </div>;
  if (page === "map") return <App onHome={() => { window.location.hash = "#/"; }} onExplore={() => { window.location.hash = "#/explore"; }} />;
  if (page === "bench") return <Suspense fallback={null}><Bench /></Suspense>;
  return <Suspense fallback={<main className="reference-home" aria-busy="true" />}>
    <LiveHome onEnter={() => { window.location.hash = "#/explore?mode=3d"; }} />
    <Resources />
  </Suspense>;
}

createRoot(document.getElementById("root")!).render(<StrictMode><Root /></StrictMode>);
