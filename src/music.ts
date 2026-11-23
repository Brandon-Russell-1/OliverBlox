import { audioContext } from './audio';

/**
 * Background music made on the spot from a handful of notes, so there are no music files
 * to download. Each kind of place has its own tune: its own scale, speed, instrument and bass.
 */
export type Mood = 'meadow' | 'night' | 'village' | 'danger' | 'sea' | 'snow' | 'cave' | 'moon' | 'indoors';

interface Tune {
  /** The notes the melody may use, in semitones above the home note. */
  scale: number[];
  /** Seconds per beat. */
  beat: number;
  /** How far above or below middle C the melody sits, in semitones. */
  lift: number;
  lead: OscillatorType;
  /** How often a beat has a melody note, 0 to 1. */
  busy: number;
  /** How long each note rings, in beats. */
  ring: number;
  /** Bass notes (places in the scale), one for every eight beats, played in turn. */
  bass: number[];
  /** A soft thump on some beats: 0 for none, otherwise every this-many beats. */
  drum: number;
  /** A quieter copy of each melody note a moment later, like an echo across a valley. */
  echo: boolean;
}

const TUNES: Record<Mood, Tune> = {
  // A gentle wandering music box.
  meadow: { scale: [0, 2, 4, 7, 9, 12, 14, 16], beat: 0.44, lift: 12, lead: 'triangle', busy: 0.78, ring: 2.4, bass: [0, 3], drum: 0, echo: false },
  // Slower, lower and a little wistful.
  night: { scale: [0, 3, 5, 7, 10, 12, 15, 17], beat: 0.62, lift: 0, lead: 'triangle', busy: 0.7, ring: 2.6, bass: [0, 3], drum: 0, echo: false },
  // A bright, bouncy market tune.
  village: { scale: [0, 2, 4, 5, 7, 9, 11, 12], beat: 0.3, lift: 12, lead: 'square', busy: 0.85, ring: 1.3, bass: [0, 3, 4, 0], drum: 2, echo: false },
  // Low, quick and tense, with a steady thump.
  danger: { scale: [0, 1, 3, 5, 7, 8, 10, 12], beat: 0.26, lift: -5, lead: 'sawtooth', busy: 0.8, ring: 1.1, bass: [0, 0, 5, 4], drum: 1, echo: false },
  // A slow rocking tune, like waves.
  sea: { scale: [0, 2, 4, 6, 7, 9, 11, 14], beat: 0.56, lift: 7, lead: 'sine', busy: 0.65, ring: 3.2, bass: [0, 4], drum: 0, echo: true },
  // High, sparse bells on the mountain tops.
  snow: { scale: [0, 4, 7, 11, 12, 16, 19, 23], beat: 0.7, lift: 19, lead: 'sine', busy: 0.5, ring: 4, bass: [0], drum: 0, echo: true },
  // Deep and hollow, with long gaps.
  cave: { scale: [0, 1, 5, 6, 7, 10, 12, 13], beat: 0.8, lift: -12, lead: 'sine', busy: 0.45, ring: 4.5, bass: [0, 1], drum: 0, echo: true },
  // Floating and strange: a scale with no home.
  moon: { scale: [0, 2, 4, 6, 8, 10, 12, 14], beat: 0.75, lift: 12, lead: 'sine', busy: 0.55, ring: 5, bass: [0, 2], drum: 0, echo: true },
  // Soft and cosy.
  indoors: { scale: [0, 2, 4, 7, 9, 12, 14, 16], beat: 0.52, lift: 5, lead: 'sine', busy: 0.6, ring: 2.8, bass: [0, 4, 3, 4], drum: 0, echo: false },
};

const BASE_HZ = 261.63;

let enabled = false;
let mood: Mood = 'meadow';
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

/** A soft thump: a low note that drops quickly. */
function thump(at: number): void {
  const ctx = audioContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.frequency.setValueAtTime(120, at);
  osc.frequency.exponentialRampToValueAtTime(45, at + 0.12);
  gain.gain.setValueAtTime(0.09, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + 0.2);
}

function schedule(): void {
  const ctx = audioContext();
  if (!ctx || !enabled || ctx.state !== 'running') return;
  if (nextBeat < ctx.currentTime) nextBeat = ctx.currentTime + 0.1;
  // Keep a second of music queued up ahead of the clock.
  while (nextBeat < ctx.currentTime + 1) {
    const tune = TUNES[mood];
    const { scale } = tune;
    // Buzzier instruments are played more quietly, so every tune sits at about the same loudness.
    const loud = tune.lead === 'square' || tune.lead === 'sawtooth' ? 0.014 : 0.035;
    // The melody takes small steps up and down the scale, with the odd rest.
    if (Math.random() < tune.busy) {
      step = Math.min(scale.length - 1, Math.max(0, step + Math.floor(Math.random() * 5) - 2));
      note(scale[step] + tune.lift, nextBeat, tune.beat * tune.ring, loud, tune.lead);
      if (tune.echo) note(scale[step] + tune.lift, nextBeat + tune.beat * 1.5, tune.beat * tune.ring, loud * 0.35, tune.lead);
    }
    if (beat % 8 === 0) note(scale[tune.bass[Math.floor(beat / 8) % tune.bass.length]] - 12 + Math.min(0, tune.lift), nextBeat, tune.beat * 8, 0.05, 'sine');
    if (beat % 4 === 2) note(scale[(step + 2) % scale.length] + Math.min(0, tune.lift), nextBeat, tune.beat * 3, 0.018, 'sine');
    if (tune.drum > 0 && beat % tune.drum === 0) thump(nextBeat);
    nextBeat += tune.beat;
    beat++;
  }
}

export const music = {
  setEnabled(on: boolean): void {
    enabled = on;
    window.clearInterval(timer);
    if (on) timer = window.setInterval(schedule, 300);
  },
  /** Change the tune to suit where he is. It takes over from the next beat. */
  setMood(next: Mood): void {
    mood = next;
  },
  get mood(): Mood {
    return mood;
  },
};
