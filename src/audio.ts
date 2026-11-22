let ctx: AudioContext | null = null;

/** Browsers only allow sound after a tap or click, so call this from the Play button. */
export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
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

export const sfx = {
  place: () => tone(420, 0.09, 'triangle', 0, 0.2),
  remove: () => tone(140, 0.12, 'square', 0, 0.1),
  jump: () => tone(520, 0.1, 'sine', 0, 0.08),
  star: () => [660, 880, 1320].forEach((f, i) => tone(f, 0.18, 'triangle', i * 0.07, 0.18)),
  win: () => [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', i * 0.13, 0.2)),
  honk: () => {
    tone(311, 0.3, 'sawtooth', 0, 0.09);
    tone(392, 0.3, 'sawtooth', 0, 0.09);
  },
  swing: () => tone(260, 0.12, 'sawtooth', 0, 0.06),
  zap: () => [900, 1300].forEach((f, i) => tone(f, 0.12, 'square', i * 0.05, 0.06)),
  bonk: () => tone(180, 0.15, 'square', 0, 0.12),
  ouch: () => [300, 200].forEach((f, i) => tone(f, 0.15, 'sawtooth', i * 0.1, 0.1)),
  chirp: () => [1200, 1600, 1400].forEach((f, i) => tone(f, 0.07, 'square', i * 0.06, 0.05)),
  door: () => [330, 440].forEach((f, i) => tone(f, 0.12, 'sine', i * 0.08, 0.15)),
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
