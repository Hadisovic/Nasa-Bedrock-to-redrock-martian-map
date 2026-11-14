import left from "../assets/mission-control/left.wav?url";
import right from "../assets/mission-control/right.wav?url";
import slope from "../assets/mission-control/slope.wav?url";
import terrain from "../assets/mission-control/terrain.wav?url";
import updated from "../assets/mission-control/updated.wav?url";
import shorter from "../assets/mission-control/shorter.wav?url";
import unavailable from "../assets/mission-control/unavailable.wav?url";
import arrived from "../assets/mission-control/arrived.wav?url";
import dust from "../assets/mission-control/dust.wav?url";
import temperature from "../assets/mission-control/temperature.wav?url";

const cues = {
  left: ["Turn left ahead.", left], right: ["Turn right ahead.", right],
  slope: ["Steep slope ahead.", slope], terrain: ["Detailed terrain unavailable ahead.", terrain],
  updated: ["Route updated.", updated], shorter: ["Shorter route found.", shorter], unavailable: ["No route found.", unavailable],
  arrived: ["Arrived.", arrived], dust: ["Higher mapped surface dust cover ahead.", dust],
  temperature: ["Perseverance recorded a low of −83 and a high of −22 degrees Celsius here on July 19, 2022.", temperature],
} as const;
export type CueId = keyof typeof cues;
export const cueText = (cue: CueId) => cues[cue][0];

export function missionAudio() {
  const audio = new Audio();
  const context = typeof AudioContext === "function" ? new AudioContext() : null;
  const buffers = new Map<string, Promise<AudioBuffer>>();
  let playing: AudioBufferSourceNode | null = null;
  let current = 0;
  void context?.resume().catch(() => {});
  function stop() {
    current++;
    window.speechSynthesis?.cancel();
    audio.pause();
    playing?.stop();
    playing = null;
  }
  function speak(cue: CueId) {
    stop();
    const id = current;
    const [text, clip] = cues[cue];
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
        playing.start();
      }).catch(() => buffers.delete(clip));
    };
    const voice = window.speechSynthesis?.getVoices().find((item) => item.localService && /^en\b/i.test(item.lang));
    if (!voice) { fallback(); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.onerror = fallback;
    window.speechSynthesis.speak(utterance);
  }
  return { speak, resume: () => context?.resume(), dispose: () => { stop(); void context?.close().catch(() => {}); } };
}
