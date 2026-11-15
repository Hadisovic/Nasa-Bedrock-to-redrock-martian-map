import { useEffect, useRef, useState } from "react";
import { usePixelSound } from "../components/usePixelSound.ts";

const steps = [
  { tab: "Map", text: "Drag to explore. Zoom in for detail. Use 2D or 3D to switch views." },
  { tab: "Discover", text: "Tap a flag to read about a mission. Use Layers to see the data behind the map." },
  { tab: "Directions", text: "Place your lander, then add stops on the map or through search. Blue is outbound. Dashes lead home." },
  { tab: "Save", text: "Tap the route for details or save options. Name it, share a link, or export a file." },
  { tab: "Drone", text: "Open Drone View at Wildcat Ridge or Mount Sharp. Use the joystick or arrows to fly, drag to look, and use Up and Down to change altitude." },
  { tab: "Earth Walk", text: "Earth GPS Demo maps a phone or tablet’s outdoor movement onto Mars from the lander. Your Earth coordinates stay in this tab. Tilt moves the camera. On desktop, preview the simulated walk. The terrain and route cues use Mars data." },
];

export function ExplorerHelp() {
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(0);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const current = steps[step];
  const sound = usePixelSound();
  function select(index: number) {
    setStep(index);
    setShown(matchMedia("(prefers-reduced-motion: reduce)").matches ? steps[index].text.length : 0);
  }

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
        <button type="button" disabled={step === 0} onClick={() => select(step - 1)}>Back</button>
        {step + 1 < steps.length ? <button type="button" onClick={() => select(step + 1)}>Next</button>
          : <form method="dialog"><button type="submit">Done</button></form>}
      </div>
    </dialog>
  </>;
}
