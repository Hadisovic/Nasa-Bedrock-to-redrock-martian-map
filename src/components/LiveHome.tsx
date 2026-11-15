import { useEffect, useState } from "react";
import { HomeMotion } from "./HomeMotion.tsx";
import { explorerBadge } from "../explorer/nasaMark.ts";
import { ExplorerHelp } from "../explorer/ExplorerHelp.tsx";

export function LiveHome({ onEnter }: { onEnter: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!leaving) return;
    const timeout = window.setTimeout(onEnter, 450);
    return () => window.clearTimeout(timeout);
  }, [leaving, onEnter]);

  return <main className="mission-home">
    <button type="button" className={`mission-home__enter${leaving ? " is-leaving" : ""}`}
      aria-label="Explore Mars" onClick={() => {
        if (matchMedia("(prefers-reduced-motion: reduce)").matches) onEnter();
        else setLeaving(true);
      }}>
      <span className="mission-home__scene">
        <img className="mission-home__art" src="./images/martian-map-cinematic.jpg" alt="" fetchPriority="high" />
        <HomeMotion />
      </span>
      <span className="mission-home__phone-title" aria-hidden="true">
        <img src={explorerBadge} alt="" />
        <small>Bedrock to Redrock</small>
        <img className="mission-home__phone-wordmark" src="./images/martian-map-title.png" alt="" />
      </span>
      <span className="mission-home__prompt">Tap anywhere to begin the mission</span>
    </button>
    <ExplorerHelp home />
  </main>;
}
