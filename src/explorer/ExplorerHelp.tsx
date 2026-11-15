import { useEffect, useRef, useState } from "react";
import { usePixelSound } from "../components/usePixelSound.ts";

const steps = [
  { tab: "Map", text: "Drag to explore. Zoom in for detail. Use 2D or 3D to switch views." },
  { tab: "Discover", text: "Tap a flag to read about a mission. Use Layers to see the data behind the map." },
  { tab: "Directions", text: "Place your lander, then add stops. Blue is shortest, amber favors lower slopes, and green minimizes modeled walking effort on detailed terrain. Dashes lead home. Pick a route before starting." },
  { tab: "Save", text: "Tap the route for details or save options. Name it, share a link, or export a file." },
  { tab: "Drone", text: "Wildcat Ridge and Mount Sharp are interactive samples of detailed terrain, inspired by NASA’s Curiosity flyover. Use the joystick and altitude controls. Turn on geology to see mapped units." },
  { tab: "Earth Walk", text: "On a phone or tablet, allow precise location and use a large open area. Earth GPS moves the simulation using your actual heading and your chosen distance scale. Recorded preview plays the route on desktop. Operational Mars navigation would need local sensors and positioning infrastructure." },
];

export function ExplorerHelp() {
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const ambience = useRef<AudioContext | null>(null);
  const [musicOn, setMusicOn] = useState(false);
  const current = steps[step];
  const sound = usePixelSound();
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
    const context = new AudioContext();
    const volume = context.createGain();
    volume.gain.setValueAtTime(0, context.currentTime);
    volume.gain.linearRampToValueAtTime(0.024, context.currentTime + 1.8);
    volume.connect(context.destination);
    for (const [index, frequency] of [82.41, 123.47, 164.81].entries()) {
      const tone = context.createOscillator();
      tone.frequency.value = frequency;
      tone.detune.value = index * 3;
      tone.connect(volume);
      tone.start(context.currentTime + index * .6);
    }
    const pulse = context.createOscillator(), depth = context.createGain();
    pulse.frequency.value = 0.09;
    depth.gain.value = 0.009;
    pulse.connect(depth).connect(volume.gain);
    pulse.start();
    ambience.current = context;
    void context.resume().then(() => setMusicOn(ambience.current === context), () => {});
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
    <button type="button" className="mission-home__help explorer-help" aria-label="Map tutorial" onClick={() => {
      sound.unlock(); select(0); setOpen(true); dialog.current?.showModal();
    }}>?</button>
    <dialog ref={dialog} className="project-dialog mission-home__dialog explorer-help__dialog" aria-label="Map tutorial" onClose={() => setOpen(false)}>
      <header><h2>Map tutorial</h2><form method="dialog"><button type="submit" aria-label="Close tutorial">×</button></form></header>
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
