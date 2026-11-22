const NAME_KEY = 'oliverblox-name';

/**
 * Names are letters only and short. That keeps them safe to show to friends and to
 * pass to the AI characters, since nothing but a plain name can get through.
 */
export function cleanName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const letters = raw.replace(/[^A-Za-z]/g, '').slice(0, 12);
  return letters ? letters[0].toUpperCase() + letters.slice(1) : '';
}

/** The name this player picked on the start screen, or '' if they have not picked one. */
export function getPlayerName(): string {
  return cleanName(localStorage.getItem(NAME_KEY));
}

export function setPlayerName(name: string): void {
  localStorage.setItem(NAME_KEY, cleanName(name));
}
