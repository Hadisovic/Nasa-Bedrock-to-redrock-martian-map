import { useEffect, useRef } from "react";

export function usePixelSound() {
  const audio = useRef<AudioContext | null>(null);
  useEffect(() => () => {
    void audio.current?.close();
    audio.current = null;
  }, []);

  const unlock = () => {
    if (typeof AudioContext === "undefined") return;
    try {
      audio.current ??= new AudioContext();
      if (audio.current.state === "suspended") void audio.current.resume().catch(() => {});
    } catch { /* The tutorial stays usable without audio. */ }
  };

  const click = (index: number) => {
    const context = audio.current;
    if (!context || context.state !== "running") return;
    const tone = context.createOscillator(), volume = context.createGain();
    tone.type = "square";
    tone.frequency.value = 290 + (index % 4) * 35;
    volume.gain.setValueAtTime(.013, context.currentTime);
    volume.gain.exponentialRampToValueAtTime(.0001, context.currentTime + .026);
    tone.connect(volume).connect(context.destination);
    tone.start();
    tone.stop(context.currentTime + .03);
  };
  return { unlock, click };
}
