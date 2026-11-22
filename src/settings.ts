/** Choices a grown-up makes in the settings panel. Kept on the device. */
export interface ParentSettings {
  music: boolean;
  /** Off means no skeletons anywhere. */
  fighting: boolean;
  /** Minutes of play allowed per day; 0 for no limit. */
  limit: number;
}

const SETTINGS_KEY = 'oliverblox-parent';
const TIME_KEY = 'oliverblox-time';

export function loadSettings(): ParentSettings {
  try {
    const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<ParentSettings>;
    return { music: s.music ?? true, fighting: s.fighting ?? true, limit: Math.max(0, Number(s.limit) || 0) };
  } catch {
    return { music: true, fighting: true, limit: 0 };
  }
}

export function saveSettings(s: ParentSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

const today = (): string => new Date().toDateString();
let seconds = 0;
let day = today();
try {
  const t = JSON.parse(localStorage.getItem(TIME_KEY) ?? '{}') as { day?: string; seconds?: number };
  if (t.day === day) seconds = Number(t.seconds) || 0;
} catch {
  // Start counting from zero.
}
let unsaved = 0;

/** Count time spent playing. The total starts again each day. */
export function addPlayTime(dt: number): void {
  if (today() !== day) {
    day = today();
    seconds = 0;
  }
  seconds += dt;
  unsaved += dt;
  if (unsaved > 10) {
    unsaved = 0;
    try {
      localStorage.setItem(TIME_KEY, JSON.stringify({ day, seconds: Math.round(seconds) }));
    } catch {
      // Not being able to save the clock should never stop the game.
    }
  }
}

export function minutesToday(): number {
  return Math.floor(seconds / 60);
}
