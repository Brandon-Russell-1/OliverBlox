export type QuestType = 'stars' | 'skeletons' | 'blocks' | 'pet';

export interface Quest {
  type: QuestType;
  need: number;
  have: number;
  /** Coins paid when it is handed in. */
  reward: number;
}

export interface QuestSave {
  /** How many quests each villager has had completed for them. */
  level: Record<string, number>;
  active: Record<string, Quest>;
}

export const QUEST_ICONS: Record<QuestType, string> = {
  stars: '⭐',
  skeletons: '💀',
  blocks: '🧱',
  pet: '🐾',
};

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen'];
const word = (n: number): string => NUMBER_WORDS[n] ?? String(n);
const plural = (n: number, one: string, many: string): string => `${word(n)} ${n === 1 ? one : many}`;

/** Which kinds of job each villager hands out, in turn. */
const JOBS: Record<string, QuestType[]> = {
  mage: ['stars', 'blocks'],
  barbarian: ['skeletons'],
  druid: ['pet', 'stars'],
};

/** Quests grow a little each time, so the counting gets harder as he goes. */
function makeQuest(persona: string, level: number): Quest {
  const kinds = JOBS[persona] ?? ['stars'];
  const type = kinds[level % kinds.length];
  const round = Math.floor(level / kinds.length);
  switch (type) {
    case 'stars':
      return { type, need: Math.min(2 + round, 8), have: 0, reward: 5 + round };
    case 'skeletons':
      return { type, need: Math.min(2 + round, 8), have: 0, reward: 6 + round * 2 };
    case 'blocks':
      return { type, need: Math.min(5 + round * 2, 15), have: 0, reward: 5 + round };
    case 'pet':
      return { type, need: 1, have: 0, reward: 6 };
  }
}

function ask(q: Quest): string {
  switch (q.type) {
    case 'stars':
      return `Can you find ${plural(q.need, 'star', 'stars')} for me?`;
    case 'skeletons':
      return `Those silly skeletons! Can you bonk ${plural(q.need, 'skeleton', 'skeletons')}?`;
    case 'blocks':
      return `Can you build something with ${plural(q.need, 'block', 'blocks')}?`;
    case 'pet':
      return 'The animals want a friend. Walk up to one and tap the paw button!';
  }
}

function remind(q: Quest): string {
  const left = q.need - q.have;
  if (q.type === 'pet') return 'Find an animal and tap the paw button to make friends.';
  const thing = { stars: ['star', 'stars'], skeletons: ['skeleton', 'skeletons'], blocks: ['block', 'blocks'] }[q.type];
  const togo = plural(left, thing[0], thing[1]);
  return `You have ${word(q.have)}. ${togo[0].toUpperCase()}${togo.slice(1)} to go!`;
}

/** The jobs villagers give out: one at a time per villager, kept between visits and villages. */
export class Quests {
  private level: Record<string, number>;
  private active: Record<string, Quest>;

  constructor(save?: QuestSave) {
    this.level = { ...save?.level };
    this.active = { ...save?.active };
  }

  /** 'none' for anyone who does not give quests (the shopkeeper, Bolt). */
  state(persona: string): 'none' | 'new' | 'doing' | 'done' {
    if (!JOBS[persona]) return 'none';
    const q = this.active[persona];
    if (!q) return 'new';
    return q.have >= q.need ? 'done' : 'doing';
  }

  /**
   * Walk up and talk: hands out a new quest, reminds about one in progress, or pays out a finished one.
   * Returns what the villager says and any coins earned.
   */
  talk(persona: string): { text: string; reward: number } {
    const q = this.active[persona];
    if (!q) {
      const fresh = makeQuest(persona, this.level[persona] ?? 0);
      this.active[persona] = fresh;
      return { text: ask(fresh), reward: 0 };
    }
    if (q.have < q.need) return { text: remind(q), reward: 0 };
    delete this.active[persona];
    this.level[persona] = (this.level[persona] ?? 0) + 1;
    return { text: `You did it! Here are ${plural(q.reward, 'coin', 'coins')}. Come back for another job!`, reward: q.reward };
  }

  /** Count progress toward every active quest of a kind. Returns true if anything changed. */
  add(type: QuestType, n: number): boolean {
    let changed = false;
    for (const q of Object.values(this.active)) {
      if (q.type !== type || q.have >= q.need) continue;
      q.have = Math.min(q.need, q.have + n);
      changed = true;
    }
    return changed;
  }

  list(): Quest[] {
    return Object.values(this.active);
  }

  save(): QuestSave {
    return { level: this.level, active: this.active };
  }
}
