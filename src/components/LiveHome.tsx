import { useEffect, useState } from "react";
import { HomeMotion } from "./HomeMotion.tsx";
import { explorerBadge } from "../explorer/nasaMark.ts";
import { ExplorerHelp } from "../explorer/ExplorerHelp.tsx";

const artwork = import.meta.env.BASE_URL + "images/martian-map-cinematic.jpg";
const wordmark = import.meta.env.BASE_URL + "images/martian-map-title.png";

export function LiveHome({ onEnter }: { onEnter: () => void }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!leaving) return;
    const timeout = window.setTimeout(onEnter, 450);
    return () => window.clearTimeout(timeout);
  }, [leaving, onEnter]);

  return <main className={`mission-home${leaving ? " is-leaving" : ""}`}>
    <header className="mission-home__masthead">
      <img src={explorerBadge} alt="" width="58" height="52" />
      <span>Bedrock to Redrock</span>
      <ExplorerHelp home />
    </header>
    <div className="mission-home__content">
      <section className="mission-home__intro">
        <h1><img src={wordmark} alt="Martian Map" /></h1>
        <p>Explore Mars with NASA imagery and mission records. Chart a route across the surface or fly over detailed terrain.</p>
        <div className="mission-home__launch">
          <button type="button" className="mission-home__enter" disabled={leaving} onClick={() => {
            if (matchMedia("(prefers-reduced-motion: reduce)").matches) onEnter();
            else setLeaving(true);
          }}>Explore Mars <span aria-hidden="true">↗</span></button>
        </div>
      </section>
      <figure className="mission-home__plate">
        <div className="mission-home__viewport">
          <div className="mission-home__scene">
            <img className="mission-home__art" src={artwork} alt="" fetchPriority="high" />
            <HomeMotion />
          </div>
        </div>
        <figcaption>Mars surface illustration</figcaption>
      </figure>
    </div>
  </main>;
}
