import { useEffect, useRef, useState } from "react";
import { HomeMotion } from "./HomeMotion.tsx";
import { explorerBadge } from "../explorer/nasaMark.ts";
import { usePixelSound } from "./usePixelSound.ts";

const message = "Pick a landing site, explore real Mars data, and plan your trip out and back.";

export function LiveHome({ onEnter }: { onEnter: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sound = usePixelSound();
  const [open, setOpen] = useState(false);
  const [length, setLength] = useState(0);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!leaving) return;
    const timeout = window.setTimeout(onEnter, 450);
    return () => window.clearTimeout(timeout);
  }, [leaving, onEnter]);

  useEffect(() => {
    if (!open || length >= message.length) return;
    const timer = window.setTimeout(() => {
      setLength(length + 1);
      if (message[length] !== " ") sound.click(length);
    }, 35);
    return () => window.clearTimeout(timer);
  }, [open, length]);

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
    <button type="button" className="mission-home__help" aria-label="How to play" onClick={() => {
      const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (!reduceMotion) sound.unlock();
      setLength(reduceMotion ? message.length : 0);
      setOpen(true);
      dialog.current?.showModal();
    }}>?</button>
    <dialog ref={dialog} className="project-dialog mission-home__dialog" aria-label="How to play" onClose={() => setOpen(false)}>
      <p className="sr-only">{message}</p>
      <p aria-hidden="true">{message.slice(0, length)}<span className="mission-home__cursor">▍</span></p>
      <ul className="home-feature-list">
        <li>Explore the whole planet in 2D and 3D.</li>
        <li>Read mission records and toggle scientific layers.</li>
        <li>Plan a route, compare alternatives, and preview navigation.</li>
        <li>Fly over detailed terrain at Wildcat Ridge and Mount Sharp.</li>
      </ul>
      <div className="mission-home__actions">
        {length < message.length && <button type="button" onClick={() => setLength(message.length)}>Show message</button>}
        <form method="dialog"><button>Close</button></form>
      </div>
    </dialog>
  </main>;
}
