import { useEffect, useRef, useState } from "react";
import { usePixelSound } from "../components/usePixelSound.ts";

const steps = [
  { tab: "Map", text: "Explore the whole planet in 2D and 3D. Drag to explore and zoom in for detail." },
  { tab: "Discover", text: "Tap a flag to read about a mission. Use Layers to see the data behind the map." },
  { tab: "Directions", text: "Place your lander, then add stops. Blue is shortest, amber favors gentler terrain, and dashes lead home. One available path is selected automatically. Use Navigation tools to report a blocked cell on detailed terrain and recalculate around it." },
  { tab: "Save", text: "Tap the route for details or save options. Name it, share a link, or export a file." },
  { tab: "Drone", text: "Interactive flight and local route playback cover two terrain packs: Wildcat Ridge and Mount Sharp. Additional areas need aligned NASA or USGS imagery and elevation. Hold arrows to fly, pinch or scroll for altitude, and tap a science flag to read about it." },
  { tab: "Earth Walk", text: "On a phone or tablet, allow precise location and use an open area. Earth GPS maps your real movement and chosen scale onto Mars. On any device, replay the route as an astronaut or rover. Operational Mars navigation would need local sensors and positioning infrastructure." },
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
    volume.gain.linearRampToValueAtTime(0.22, context.currentTime + 1.8);
    volume.connect(context.destination);
    const beat = .72;
    const chords = [[45, 52, 55, 59], [41, 48, 52, 55], [48, 55, 59, 62], [43, 50, 53, 57]];
    const samples = context.createBuffer(1, Math.round(context.sampleRate * beat * 32), context.sampleRate);
    const wave = samples.getChannelData(0);
    for (let frame = 0; frame < wave.length; frame++) {
      const time = frame / context.sampleRate;
      const chord = chords[Math.floor(time / (beat * 8)) % chords.length];
      const bar = time % (beat * 8);
      const pulse = time % (beat / 2);
      const note = chord[Math.floor(bar / (beat / 2)) % chord.length] + 12;
      const sine = (pitch: number, phase: number) => Math.sin(2 * Math.PI * 440 * 2 ** ((pitch - 69) / 12) * phase);
      const swell = Math.sin(Math.PI * bar / (beat * 8)) ** 2;
      const shimmer = (1 - Math.exp(-pulse * 55)) * Math.exp(-pulse * 9);
      const fade = Math.min(1, time / .05, (wave.length / context.sampleRate - time) / .05);
      wave[frame] = fade * (.18 * swell * (sine(chord[0], bar) + .45 * sine(chord[2], bar)) + .13 * shimmer * sine(note, pulse));
    }
    const loop = context.createBufferSource();
    loop.buffer = samples;
    loop.loop = true;
    loop.connect(volume);
    loop.start();
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
    <button type="button" className={home ? "mission-home__help" : "mission-home__help explorer-help"} aria-label={home ? "How to play" : "Map tutorial"} onClick={() => {
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) sound.unlock();
      select(0); setOpen(true); dialog.current?.showModal();
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
