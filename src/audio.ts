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
  door: () => [330, 440].forEach((f, i) => tone(f, 0.12, 'sine', i * 0.08, 0.15)),
};

/** Say something out loud. Oliver is an early reader, so the game talks instead of showing text. */
export function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.9;
    u.pitch = 1.25;
    speechSynthesis.speak(u);
  } catch {
    // Speech is a nice-to-have; the game works without it.
  }
}
