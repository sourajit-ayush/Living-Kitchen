/**
 * Kitchen sounds (docs/02 §7), synthesised with the Web Audio API: no audio files to download,
 * and nothing plays unless the user switched sound on (off by default). Each sound is a few
 * oscillators / filtered noise bursts, kept quiet and short.
 */

export type SoundName = "thunk" | "plop" | "sizzle" | "ding" | "boilOver";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = false;
let bubbleTimer: ReturnType<typeof setTimeout> | null = null;
let bubbleLevel = 0;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Turn sound on or off. Turning it on must happen in a user gesture (it resumes the context). */
export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (!on) return setBubbling(0);
  const c = audio();
  void c?.resume();
  // Outside a user gesture (a remembered setting) browsers keep audio suspended until one.
  if (c && c.state !== "running") {
    const resume = () => void c.resume();
    window.addEventListener("pointerdown", resume, { once: true });
    window.addEventListener("keydown", resume, { once: true });
  }
}

function noiseBuffer(c: AudioContext, seconds: number) {
  const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * seconds), c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function envelope(c: AudioContext, peak: number, attack: number, decay: number, at: number) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(master!);
  return g;
}

function tone(type: OscillatorType, from: number, to: number, seconds: number, gain: GainNode) {
  const c = gain.context;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, c.currentTime);
  osc.frequency.exponentialRampToValueAtTime(to, c.currentTime + seconds);
  osc.connect(gain);
  osc.start();
  osc.stop(c.currentTime + seconds + 0.05);
}

function noise(seconds: number, filter: BiquadFilterType, freq: number, gain: GainNode) {
  const c = gain.context as AudioContext;
  const src = c.createBufferSource();
  src.buffer = noiseBuffer(c, seconds);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  src.connect(f).connect(gain);
  src.start();
}

/** Play a one-shot. `size` (0..1) varies pitch, e.g. a big ingredient thunks lower. */
export function playSound(name: SoundName, size = 0.5) {
  if (!enabled) return;
  const c = audio();
  if (!c || c.state !== "running") return;
  const now = c.currentTime;
  switch (name) {
    case "thunk": {
      const base = 170 - size * 70;
      tone("sine", base, base * 0.55, 0.12, envelope(c, 0.5, 0.004, 0.12, now));
      noise(0.04, "lowpass", 900, envelope(c, 0.15, 0.002, 0.04, now));
      break;
    }
    case "plop":
      tone("sine", 260 + size * 120, 720, 0.09, envelope(c, 0.3, 0.005, 0.1, now));
      break;
    case "sizzle":
      noise(1.4, "bandpass", 4200, envelope(c, 0.12, 0.08, 1.2, now));
      break;
    case "ding":
      tone("sine", 1318, 1318, 1.1, envelope(c, 0.18, 0.005, 1.1, now));
      tone("sine", 2637, 2637, 0.7, envelope(c, 0.06, 0.005, 0.7, now));
      break;
    case "boilOver":
      noise(0.9, "lowpass", 600, envelope(c, 0.3, 0.02, 0.85, now));
      tone("sine", 200, 90, 0.5, envelope(c, 0.2, 0.01, 0.5, now));
      break;
  }
}

/** The bubbling loop while the AI thinks: random soft plops, denser as `level` (0..1) rises. */
export function setBubbling(level: number) {
  bubbleLevel = enabled ? level : 0;
  if (bubbleLevel <= 0) {
    if (bubbleTimer) clearTimeout(bubbleTimer);
    bubbleTimer = null;
    return;
  }
  if (bubbleTimer) return;
  const tick = () => {
    if (bubbleLevel <= 0) {
      bubbleTimer = null;
      return;
    }
    const c = audio();
    if (c && c.state === "running") {
      const pitch = 300 + Math.random() * 500;
      tone(
        "sine",
        pitch,
        pitch * 1.8,
        0.05,
        envelope(c, 0.05 + bubbleLevel * 0.06, 0.003, 0.06, c.currentTime),
      );
    }
    bubbleTimer = setTimeout(tick, 380 - bubbleLevel * 260 + Math.random() * 120);
  };
  tick();
}

/** Unlock audio inside a user gesture (starting a timer), so its alarm can ring later. */
export function primeAudio() {
  void audio()?.resume();
}

/**
 * The kitchen-timer alarm: three soft double-dings. It rings even with the ambient kitchen sounds
 * switched off, because the user explicitly asked for this timer.
 */
export function playAlarm() {
  const c = audio();
  if (!c) return;
  void c.resume();
  for (let i = 0; i < 3; i++) {
    const at = c.currentTime + i * 0.55;
    const ding = (freq: number, peak: number, length: number) => {
      const g = envelope(c, peak, 0.005, length, at);
      const osc = c.createOscillator();
      osc.frequency.value = freq;
      osc.connect(g);
      osc.start(at);
      osc.stop(at + length + 0.05);
    };
    ding(1568, 0.35, 0.45);
    ding(2093, 0.12, 0.3);
  }
}
