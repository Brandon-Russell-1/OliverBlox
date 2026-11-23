let ctx: AudioContext | null = null;

/** Browsers only allow sound after a tap or click, so call this from the Play button. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    loadSamples();
  } catch {
    ctx = null;
  }
}

/** The shared sound system, once a tap has unlocked it. */
export function audioContext(): AudioContext | null {
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', delay = 0, gain = 0.15): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SAMPLES = ['place', 'remove', 'star', 'win', 'swing', 'bonk', 'ouch', 'zap', 'door', 'coin', 'jump', 'chirp', 'splash'];
const buffers = new Map<string, AudioBuffer>();
let samplesRequested = false;

/** Download the recorded sound effects once sound is unlocked. Any that fail fall back to beeps. */
function loadSamples(): void {
  if (samplesRequested || !ctx) return;
  samplesRequested = true;
  const audio = ctx;
  for (const name of SAMPLES) {
    fetch(`${import.meta.env.BASE_URL}assets/sfx/${name}.ogg`)
      .then((res) => res.arrayBuffer())
      .then((data) => audio.decodeAudioData(data))
      .then((buffer) => buffers.set(name, buffer))
      .catch(() => undefined);
  }
}

/** Play a recorded effect. Returns false if it is not available, so the caller can beep instead. */
function sample(name: string, volume = 0.5, rate = 1): boolean {
  const buffer = buffers.get(name);
  if (!ctx || !buffer) return false;
  const source = ctx.createBufferSource();
  const gain = ctx.createGain();
  source.buffer = buffer;
  source.playbackRate.value = rate;
  gain.gain.value = volume;
  source.connect(gain).connect(ctx.destination);
  source.start();
  return true;
}

export const sfx = {
  place: () => sample('place') || tone(420, 0.09, 'triangle', 0, 0.2),
  remove: () => sample('remove') || tone(140, 0.12, 'square', 0, 0.1),
  jump: () => sample('jump', 0.25) || tone(520, 0.1, 'sine', 0, 0.08),
  star: () => sample('star', 0.6) || [660, 880, 1320].forEach((f, i) => tone(f, 0.18, 'triangle', i * 0.07, 0.18)),
  win: () => sample('win', 0.6) || [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', i * 0.13, 0.2)),
  honk: () => {
    tone(311, 0.3, 'sawtooth', 0, 0.09);
    tone(392, 0.3, 'sawtooth', 0, 0.09);
  },
  swing: () => sample('swing', 0.5) || tone(260, 0.12, 'sawtooth', 0, 0.06),
  zap: () => sample('zap', 0.35) || [900, 1300].forEach((f, i) => tone(f, 0.12, 'square', i * 0.05, 0.06)),
  bonk: () => sample('bonk', 0.8) || tone(180, 0.15, 'square', 0, 0.12),
  ouch: () => sample('ouch', 0.5) || [300, 200].forEach((f, i) => tone(f, 0.15, 'sawtooth', i * 0.1, 0.1)),
  chirp: () => sample('chirp', 0.3) || [1200, 1600, 1400].forEach((f, i) => tone(f, 0.07, 'square', i * 0.06, 0.05)),
  door: () => sample('door', 0.6) || [330, 440].forEach((f, i) => tone(f, 0.12, 'sine', i * 0.08, 0.15)),
  coin: () => sample('coin', 0.7) || tone(990, 0.12, 'triangle', 0, 0.15),
  splash: () => sample('splash', 0.7) || tone(220, 0.2, 'sine', 0, 0.15),
};

const VOICE_KEY = 'oliverblox-voice';

/** How a character sounds: 1 is normal for both; pitch runs 0 to 2. */
export interface VoiceStyle {
  pitch: number;
  rate: number;
}

const BOLT_VOICE: VoiceStyle = { pitch: 1.7, rate: 1.05 };

/** English voices on this device, best first. Empty until the browser has loaded them. */
export function listVoices(): SpeechSynthesisVoice[] {
  if (!('speechSynthesis' in window)) return [];
  const score = (v: SpeechSynthesisVoice): number => {
    let n = 0;
    // The natural-sounding voices are labelled differently by each maker.
    if (/natural|neural/i.test(v.name)) n += 6;
    if (/enhanced|premium/i.test(v.name)) n += 5;
    if (/google/i.test(v.name)) n += 3;
    if (/samantha|ava|allison|aria|jenny|libby|sonia|karen|moira/i.test(v.name)) n += 2;
    if (v.lang === 'en-US') n += 1;
    return n;
  };
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.startsWith('en'))
    .sort((x, y) => score(y) - score(x));
}

export function getVoiceName(): string {
  return localStorage.getItem(VOICE_KEY) ?? '';
}

export function setVoiceName(name: string): void {
  localStorage.setItem(VOICE_KEY, name);
}

function chosenVoice(): SpeechSynthesisVoice | null {
  const voices = listVoices();
  return voices.find((v) => v.name === getVoiceName()) ?? voices[0] ?? null;
}

/** Say something out loud. Oliver is an early reader, so the game talks instead of showing text. */
export function speak(text: string, style: VoiceStyle = BOLT_VOICE): void {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const voice = chosenVoice();
    if (voice) {
      u.voice = voice;
      u.lang = voice.lang;
    }
    u.rate = style.rate;
    u.pitch = style.pitch;
    speechSynthesis.speak(u);
  } catch {
    // Speech is a nice-to-have; the game works without it.
  }
}

function noise(seconds: number): AudioBuffer | null {
  if (!ctx) return null;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

let rainGain: GainNode | null = null;

/** The hiss of rain, from silent (0) to a downpour (1). */
export function setRain(level: number): void {
  if (!ctx) return;
  if (!rainGain) {
    if (level <= 0) return;
    const source = ctx.createBufferSource();
    source.buffer = noise(2);
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1500;
    rainGain = ctx.createGain();
    rainGain.gain.value = 0;
    source.connect(filter).connect(rainGain).connect(ctx.destination);
    source.start();
  }
  rainGain.gain.value = level * 0.05;
}

/** A long low rumble. */
export function thunder(): void {
  if (!ctx) return;
  const source = ctx.createBufferSource();
  source.buffer = noise(3);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 170;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.9, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.8);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
}

/** What is under his feet, which decides how a footstep sounds. */
export type Surface = 'grass' | 'sand' | 'stone' | 'wood' | 'water';

const STEPS: Record<Surface, { type: BiquadFilterType; freq: number; q: number; length: number; gain: number }> = {
  grass: { type: 'bandpass', freq: 1100, q: 0.8, length: 0.08, gain: 0.16 },
  sand: { type: 'highpass', freq: 2600, q: 0.5, length: 0.11, gain: 0.07 },
  stone: { type: 'bandpass', freq: 420, q: 2.2, length: 0.05, gain: 0.3 },
  wood: { type: 'bandpass', freq: 260, q: 3, length: 0.07, gain: 0.34 },
  water: { type: 'bandpass', freq: 700, q: 0.9, length: 0.2, gain: 0.14 },
};
let shortNoise: AudioBuffer | null = null;

/** One footstep: a puff of noise shaped to suit the ground, never quite the same twice. */
export function footstep(surface: Surface, loud = 1): void {
  if (!ctx) return;
  shortNoise ??= noise(0.4);
  if (!shortNoise) return;
  const step = STEPS[surface];
  const source = ctx.createBufferSource();
  source.buffer = shortNoise;
  source.playbackRate.value = 0.8 + Math.random() * 0.4;
  const filter = ctx.createBiquadFilter();
  filter.type = step.type;
  filter.frequency.value = step.freq * (0.9 + Math.random() * 0.2);
  filter.Q.value = step.q;
  const gain = ctx.createGain();
  const t0 = ctx.currentTime;
  gain.gain.setValueAtTime(step.gain * loud, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + step.length);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(t0, Math.random() * 0.2, step.length + 0.03);
}

interface Bed {
  gain: GainNode;
  filter: BiquadFilterNode;
}

function bed(type: BiquadFilterType, freq: number): Bed | null {
  if (!ctx) return null;
  const source = ctx.createBufferSource();
  source.buffer = noise(3);
  source.loop = true;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = freq;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start();
  return { gain, filter };
}

/** A short whistle that slides in pitch, somewhere to the left or right. */
function whistle(from: number, to: number, at: number, length: number, volume: number, pan: number): void {
  if (!ctx) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + length);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(volume, t0 + length * 0.3);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
  let out: AudioNode = osc.connect(gain);
  if (typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner();
    panner.pan.value = pan;
    out = out.connect(panner);
  }
  out.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + length + 0.02);
}

let windBed: Bed | null = null;
let seaBed: Bed | null = null;
let birdIn = 3;
let cricketIn = 1;

/** What the place around him sounds like right now. Every value runs from 0 to 1. */
export interface Ambience {
  /** How windy: higher up a mountain, in a plane, or in a storm. */
  wind: number;
  /** How close the sea is. */
  shore: number;
  night: number;
  rain: number;
  /** False indoors and underground, where it is quiet. */
  outdoors: boolean;
}

/** Wind, waves, birdsong by day and crickets by night. Call every frame. */
export function setAmbience(a: Ambience, dt: number): void {
  if (!ctx) return;
  windBed ??= bed('lowpass', 420);
  seaBed ??= bed('lowpass', 900);
  const t = ctx.currentTime;
  if (windBed) {
    const gust = 0.7 + 0.3 * Math.sin(t * 0.37) * Math.sin(t * 0.11 + 2);
    windBed.gain.gain.setTargetAtTime(a.outdoors ? (0.012 + 0.06 * a.wind) * gust : 0, t, 0.4);
    windBed.filter.frequency.setTargetAtTime(330 + 500 * a.wind + 120 * Math.sin(t * 0.23), t, 0.4);
  }
  if (seaBed) {
    // Each wave swells up the beach and draws back.
    const swell = 0.5 + 0.5 * Math.sin(t * 0.8);
    seaBed.gain.gain.setTargetAtTime(a.outdoors ? a.shore * (0.02 + 0.06 * swell) : 0, t, 0.3);
    seaBed.filter.frequency.setTargetAtTime(600 + 700 * swell, t, 0.3);
  }
  if (!a.outdoors) return;
  birdIn -= dt;
  if (birdIn <= 0) {
    birdIn = 2.5 + Math.random() * 6;
    if (a.night < 0.35 && a.rain < 0.2) {
      const pan = Math.random() * 1.6 - 0.8;
      const base = 2300 + Math.random() * 1500;
      const notes = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < notes; i++) {
        const up = Math.random() > 0.4;
        whistle(base * (up ? 1 : 1.25), base * (up ? 1.3 : 0.95), i * 0.13, 0.09, 0.02, pan);
      }
    }
  }
  cricketIn -= dt;
  if (cricketIn <= 0) {
    cricketIn = 0.7 + Math.random() * 0.9;
    if (a.night > 0.6 && a.rain < 0.3) {
      const pan = Math.random() * 1.6 - 0.8;
      for (let i = 0; i < 3; i++) whistle(4300, 4350, i * 0.055, 0.035, 0.008, pan);
    }
  }
}
