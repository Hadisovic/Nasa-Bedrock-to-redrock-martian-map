import { useEffect, useRef, useState } from "react";
import { usePixelSound } from "../components/usePixelSound.ts";

const steps = [
  { tab: "Map", text: "Drag to explore. Zoom in for detail. Use 2D or 3D to switch views. In 3D, the compass follows the globe as you turn it. Tap the compass to put north back at the top." },
  { tab: "Discover", text: "Tap a flag to read about a mission. Use Layers to see the data behind the map." },
  { tab: "Directions", text: "Place your lander, then add stops. Blue is shortest, amber favors lower slopes, and green minimizes modeled walking effort on detailed terrain. Dashes lead home. Pick a route before starting." },
  { tab: "Save", text: "Tap the route for details or save options. Name it, share a link, or export a file." },
  { tab: "Drone", text: "Turn your phone sideways for more room. Hold the flight arrows to move, drag to look around, and pinch or use the zoom buttons. Open Geology to see mapped rock units." },
  { tab: "Earth Walk", text: "On a phone or tablet, allow precise location and use a large open area. Earth GPS moves the simulation using your actual heading and your chosen distance scale. Recorded preview plays the route on desktop. Operational Mars navigation would need local sensors and positioning infrastructure." },
];

export function ExplorerHelp({ home = false }: { home?: boolean }) {
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const ambience = useRef<AudioContext | null>(null);
  const [musicOn, setMusicOn] = useState(false);
  const current = steps[step];
  const sound = usePixelSound();
  const title = home ? "How to play" : "Map tutorial";
  function select(index: number) {
    setStep(index);
    setShown(matchMedia("(prefers-reduced-motion: reduce)").matches ? steps[index].text.length : 0);
  }

  function toggleMusic() {
    if (ambience.current) {
      void ambience.current.close().catch(() => {});
      ambience.current = null;
      setMusicOn(false);
      return;
    }
    if (typeof AudioContext !== "function") return;
    const context = createAmbience();
    ambience.current = context;
    void context.resume().then(() => setMusicOn(ambience.current === context), () => {
      if (ambience.current === context) ambience.current = null;
      void context.close().catch(() => {});
    });
  }

  useEffect(() => () => { void ambience.current?.close().catch(() => {}); }, []);

  useEffect(() => {
    if (!open || shown >= current.text.length) return;
    const timer = window.setTimeout(() => {
      if (current.text[shown] !== " " && shown % 2 === 0) sound.click(shown);
      setShown(shown + 1);
    }, 22);
    return () => window.clearTimeout(timer);
  }, [open, shown, current]);

  return <>
    <button type="button" className={home ? "mission-home__help" : "mission-home__help explorer-help"} aria-label={title} title={title} onClick={() => {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) sound.unlock();
      select(0); setOpen(true); dialog.current?.showModal();
    }}>?</button>
    <dialog ref={dialog} className="project-dialog mission-home__dialog explorer-help__dialog" aria-label={title} onClose={() => {
      setOpen(false);
      if (ambience.current) toggleMusic();
    }}>
      <header><h2>{title}</h2><form method="dialog"><button type="submit" aria-label="Close tutorial">×</button></form></header>
      <div className="explorer-help__tabs" role="tablist" aria-label="Tutorial steps">
        {steps.map(({ tab }, index) => <button key={tab} ref={(button) => { buttons.current[index] = button; }}
          type="button" role="tab" id={`tutorial-tab-${index}`} aria-controls="tutorial-step" aria-selected={step === index}
          tabIndex={step === index ? 0 : -1} onClick={() => select(index)} onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = event.key === "Home" ? 0 : event.key === "End" ? steps.length - 1
              : (index + (event.key === "ArrowLeft" ? -1 : 1) + steps.length) % steps.length;
            select(next); buttons.current[next]?.focus();
          }}>{tab}</button>)}
      </div>
      <div id="tutorial-step" role="tabpanel" aria-labelledby={`tutorial-tab-${step}`}>
        <p className="sr-only">{current.text}</p>
        <p aria-hidden="true">{current.text.slice(0, shown)}{shown < current.text.length && <span className="mission-home__cursor">▍</span>}</p>
      </div>
      <div className="mission-home__actions">
        <button type="button" aria-pressed={musicOn} onClick={toggleMusic}>{musicOn ? "Mute ambience" : "Play ambience"}</button>
        <button type="button" disabled={step === 0} onClick={() => select(step - 1)}>Back</button>
        {step + 1 < steps.length ? <button type="button" onClick={() => select(step + 1)}>Next</button>
          : <form method="dialog"><button type="submit">Done</button></form>}
      </div>
    </dialog>
  </>;
}

/** A quiet, original loop of overlapping chords with no percussion or external audio. */
function createAmbience() {
  const context = new AudioContext();
  const duration = 32;
  const buffer = context.createBuffer(2, Math.round(context.sampleRate * duration), context.sampleRate);
  const chords = [[55, 82.41, 130.81, 164.81], [65.41, 98, 146.83, 196],
    [49, 73.42, 110, 146.83], [58.27, 87.31, 130.81, 174.61]];
  for (let channel = 0; channel < 2; channel++) {
    const samples = buffer.getChannelData(channel);
    for (let i = 0; i < samples.length; i++) {
      const t = i / context.sampleRate;
      const index = Math.floor(t / 8);
      const phase = (t % 8) / 8;
      const blend = (1 - Math.cos(Math.PI * phase)) / 2;
      const chord = (notes: number[]) => notes.reduce((sum, hz, note) => {
        const angle = 2 * Math.PI * Math.round(hz * duration) * t / duration + channel * note * .35;
        return sum + (Math.sin(angle) + .12 * Math.sin(angle * 2)) * (.035 / (1 + note * .45));
      }, 0);
      samples[i] = chord(chords[index]) * (1 - blend) + chord(chords[(index + 1) % chords.length]) * blend;
    }
  }
  const source = context.createBufferSource(), gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  gain.gain.setValueAtTime(0, context.currentTime);
  gain.gain.linearRampToValueAtTime(.43, context.currentTime + 2);
  source.connect(gain).connect(context.destination);
  source.start();
  return context;
}
