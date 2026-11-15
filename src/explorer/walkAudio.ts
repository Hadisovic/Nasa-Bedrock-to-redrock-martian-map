import left from "../assets/mission-control/left.wav?url";
import right from "../assets/mission-control/right.wav?url";
import slope from "../assets/mission-control/slope.wav?url";
import terrain from "../assets/mission-control/terrain.wav?url";
import updated from "../assets/mission-control/updated.wav?url";
import shorter from "../assets/mission-control/shorter.wav?url";
import unavailable from "../assets/mission-control/unavailable.wav?url";
import arrived from "../assets/mission-control/arrived.wav?url";
import temperature from "../assets/mission-control/temperature.wav?url";
import gpsLost from "../assets/mission-control/gps-lost.wav?url";
import recalculating from "../assets/mission-control/recalculating.wav?url";
import stopReached from "../assets/mission-control/stop-reached.wav?url";

const cues = {
  left: ["Turn left ahead.", left], right: ["Turn right ahead.", right],
  slope: ["Steep slope ahead.", slope], terrain: ["Detailed terrain unavailable ahead.", terrain],
  updated: ["Route updated.", updated], shorter: ["Shorter route found.", shorter], unavailable: ["No route found.", unavailable],
  arrived: ["Arrived.", arrived],
  temperature: ["Perseverance recorded a low of −83 and a high of −22 degrees Celsius here on July 19, 2022.", temperature],
  gpsLost: ["GPS signal weak. Waiting for a reliable position.", gpsLost],
  recalculating: ["You are off route. Recalculating.", recalculating],
  stopReached: ["Stop reached. Continue when you are ready.", stopReached],
} as const;
export type CueId = keyof typeof cues;
export type WalkCue = CueId | { text: string; fallback?: CueId };
export const cueText = (cue: WalkCue) => typeof cue === "string" ? cues[cue][0] : cue.text;

export function missionAudio() {
  const audio = new Audio();
  const context = typeof AudioContext === "function" ? new AudioContext() : null;
  const buffers = new Map<string, Promise<AudioBuffer>>();
  let playing: AudioBufferSourceNode | null = null;
  let replanTone: OscillatorNode | null = null;
  const speech = window.speechSynthesis;
  let speaking = false;
  let current = 0;
  void context?.resume().catch(() => {});
  function stop() {
    current++;
    audio.pause();
    playing?.stop();
    playing = null;
    replanTone?.stop();
    replanTone = null;
    if (speaking) speech?.cancel();
    speaking = false;
  }
  function speak(cue: WalkCue) {
    stop();
    if (typeof cue !== "string") {
      const voices = speech?.getVoices().filter((voice) => voice.localService && /^en(?:-|$)/i.test(voice.lang));
      const voice = voices?.find((item) => item.default) ?? voices?.[0];
      if (voice) {
        const line = new SpeechSynthesisUtterance(cue.text);
        line.voice = voice;
        line.lang = voice.lang;
        speaking = true;
        speech.speak(line);
        return;
      }
      if (!cue.fallback) return;
      cue = cue.fallback;
    }
    const id = current;
    const [, clip] = cues[cue];
    // A consistent set of bundled prompts works without a network voice.
    const fallback = () => {
      if (id !== current) return;
      if (!context) {
        audio.src = clip;
        void audio.play().catch(() => {});
        return;
      }
      if (!buffers.has(clip)) buffers.set(clip, fetch(clip).then((response) => {
        if (!response.ok) throw new Error("Cue audio unavailable");
        return response.arrayBuffer();
      }).then((bytes) => context.decodeAudioData(bytes)));
      void buffers.get(clip)?.then((buffer) => {
        if (id !== current) return;
        playing = context.createBufferSource();
        playing.buffer = buffer;
        playing.connect(context.destination);
        let startsAt = context.currentTime;
        if (cue === "recalculating") {
          const tone = context.createOscillator(), gain = context.createGain();
          tone.frequency.setValueAtTime(440, startsAt);
          tone.frequency.setValueAtTime(620, startsAt + .08);
          gain.gain.setValueAtTime(.055, startsAt);
          gain.gain.linearRampToValueAtTime(0, startsAt + .2);
          tone.connect(gain).connect(context.destination);
          tone.onended = () => { tone.disconnect(); gain.disconnect(); if (replanTone === tone) replanTone = null; };
          replanTone = tone;
          tone.start(startsAt);
          startsAt += .2;
          tone.stop(startsAt);
        }
        playing.start(startsAt);
      }).catch(() => buffers.delete(clip));
    };
    fallback();
  }
  return { speak, stop, resume: () => context?.resume(), dispose: () => { stop(); void context?.close().catch(() => {}); } };
}
