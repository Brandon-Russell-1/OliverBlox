import { audioContext } from './audio';

/**
 * Background music made on the spot from a handful of notes, so there are no music files
 * to download. A gentle wandering tune by day, slower and lower at night.
 */
const DAY_SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
const NIGHT_SCALE = [0, 3, 5, 7, 10, 12, 15, 17];
const BASE_HZ = 261.63;

let enabled = false;
let night = false;
let nextBeat = 0;
let beat = 0;
let step = 3;
let timer = 0;

function note(semitones: number, at: number, length: number, volume: number, type: OscillatorType): void {
  const ctx = audioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.value = BASE_HZ * 2 ** (semitones / 12);
  // Soft attack and a long fade, so notes ring into each other like a music box.
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(volume, at + 0.04);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

function schedule(): void {
  const ctx = audioContext();
  if (!ctx || !enabled || ctx.state !== 'running') return;
  const scale = night ? NIGHT_SCALE : DAY_SCALE;
  const beatLength = night ? 0.62 : 0.44;
  if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.1;
  // Keep a second of music queued up ahead of the clock.
  while (nextBeat < ctx.currentTime + 1) {
    // The melody takes small steps up and down the scale, with the odd rest.
    if (Math.random() < 0.78) {
      step = Math.min(scale.length - 1, Math.max(0, step + Math.floor(Math.random() * 5) - 2));
      note(scale[step] + (night ? 0 : 12), nextBeat, beatLength * 2.4, 0.035, 'triangle');
    }
    if (beat % 8 === 0) note(scale[beat % 16 === 0 ? 0 : 3] - 12, nextBeat, beatLength * 8, 0.05, 'sine');
    if (beat % 4 === 2) note(scale[(step + 2) % scale.length], nextBeat, beatLength * 3, 0.018, 'sine');
    nextBeat += beatLength;
    beat++;
  }
}

export const music = {
  setEnabled(on: boolean): void {
    enabled = on;
    window.clearInterval(timer);
    if (on) timer = window.setInterval(schedule, 300);
  },
  setNight(on: boolean): void {
    night = on;
  },
};
