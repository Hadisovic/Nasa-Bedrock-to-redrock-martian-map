import { useEffect, useState } from "react";
import { HomeMotion } from "./HomeMotion.tsx";
import { TeamBadge } from "../explorer/teamBadge.tsx";
import { ExplorerHelp } from "../explorer/ExplorerHelp.tsx";

const homeBadge = import.meta.env.BASE_URL + "images/martian-map-home-badge.png";

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
        <img className="mission-home__art" src="./images/martian-map-hero.png" alt="" fetchPriority="high" />
        <HomeMotion />
        <TeamBadge className="mission-home__desktop-badge" source={homeBadge} />
      </span>
      <span className="mission-home__phone-title" aria-hidden="true">
        <TeamBadge className="mission-home__portrait-badge" source={homeBadge} />
        <small>Bedrock to Redrock</small>
        <img className="mission-home__phone-wordmark" src="./images/martian-map-title.png" alt="" />
      </span>
      <span className="mission-home__prompt">Tap anywhere to begin the mission</span>
    </button>
    <ExplorerHelp home />
  </main>;
}
