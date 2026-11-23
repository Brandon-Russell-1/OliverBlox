/** One thing standing in a room: model, x, z, quarter turns, and height off the floor. */
export type Item = [string, number, number, number, number?];

/** What the inside of a kind of building looks like, and what the game says on walking in. */
export interface Theme {
  /** Shown as a short message; kept to a word or two for an early reader. */
  title: string;
  icon: string;
  /** Said out loud on the way in. */
  say: string;
  wall: number;
  floor: number;
  items: Item[];
  /** Where the coins to find are, and how many. */
  loot: [number, number];
  coins: number;
}

// The room runs from -8 to 8 across and -6 to 6 deep, with the door in the middle of the +z wall.
const BACK = -5.6;
const LEFT = -7.4;
const RIGHT = 7.4;

const HOUSE: Theme = {
  title: 'House',
  icon: '🏠',
  say: 'A cosy house. Someone lives here.',
  wall: 0xf1dfc4,
  floor: 0xa9794d,
  items: [
    ['rug_oval_A', 0, -0.5, 0],
    ['bed_double_A', -5.6, -3.8, 0],
    ['cabinet_small_decorated', -2.6, -5.3, 0],
    ['shelf_A_big', 1.4, -5.3, 0],
    ['pictureframe_large_A', 4.2, BACK - 0.25, 0, 2.6],
    ['armchair', 5.8, -3.4, 3],
    ['table_low_decorated', 4.2, -0.6, 0],
    ['lamp_standing', 6.8, -5, 0],
    ['table_medium', -5, 2.6, 0],
    ['chair_A_wood', -5, 4.5, 2],
    ['chair_A_wood', -3, 2.6, 3],
    ['cactus_medium_A', 6.8, 4.6, 0],
    ['book_set', -5, 2.6, 0, 1.25],
  ],
  loot: [5.6, 2.6],
  coins: 2,
};

const TAVERN: Theme = {
  title: 'Tavern',
  icon: '🍲',
  say: 'The tavern. People come here to eat and sing.',
  wall: 0xd9b98a,
  floor: 0x7a5236,
  items: [
    ['bar_straight_A', -5, -3.4, 0],
    ['bar_straight_A', -2.5, -3.4, 0],
    ['bar_straight_A', 0, -3.4, 0],
    ['keg_decorated', -6, BACK, 0],
    ['keg_decorated', -3.5, BACK, 0],
    ['barrel_large', -0.8, BACK + 0.2, 0],
    ['shelves_decorated', 3.6, BACK, 0],
    ['stool', -5, -1.9, 0],
    ['stool', -2.5, -1.9, 0],
    ['stool', 0, -1.9, 0],
    ['table_round_large', 5, 0.4, 0],
    ['stool', 5, 3, 0],
    ['stool', 7, 0.4, 0],
    ['stool', 3, 0.4, 0],
    ['plate_food_A', 5, 0.4, 0, 1.25],
    ['table_long_tablecloth_decorated_A', -5, 2.6, 1],
    ['bench', -5, 4.5, 1],
    ['bench', -5, 0.8, 1],
    ['banner_patternB_yellow', 6.6, BACK - 0.2, 0, 1.6],
    ['torch_mounted', -7.7, 0, 1, 2.4],
    ['candle_triple', 2.6, 4.8, 0],
  ],
  loot: [6.4, -3.6],
  coins: 3,
};

const MARKET: Theme = {
  title: 'Market',
  icon: '🧺',
  say: 'The market store. Boxes and barrels of things to sell.',
  wall: 0xe9d9b0,
  floor: 0x9b7a55,
  items: [
    ['shelves_decorated', -5.5, BACK, 0],
    ['shelves_decorated', -1.5, BACK, 0],
    ['bookcase_double_decoratedA', 4, BACK, 0],
    ['crates_stacked', LEFT + 0.6, -2.4, 0],
    ['box_stacked', LEFT + 0.6, 1, 0],
    ['barrel_small_stack', LEFT + 0.8, 4.2, 0],
    ['table_long_decorated_A', 4.6, 0.6, 0],
    ['barrel_large', RIGHT - 0.8, 4.4, 0],
    ['crates_stacked', RIGHT - 0.8, -2.8, 0],
    ['trunk_large_A', -3.4, 4.6, 0],
    ['rug_rectangle_stripes_A', 0, 0, 0],
  ],
  loot: [4.6, 3],
  coins: 3,
};

const FORGE: Theme = {
  title: 'Blacksmith',
  icon: '⚒️',
  say: 'The blacksmith. Swords and shields are made here.',
  wall: 0x8d8478,
  floor: 0x5d5148,
  items: [
    ['sword_shield', -4.5, BACK - 0.2, 0, 2.2],
    ['sword_shield_gold', 0, BACK - 0.2, 0, 2.2],
    ['sword_shield', 4.5, BACK - 0.2, 0, 2.2],
    ['table_medium_decorated_A', -4.5, -3.2, 0],
    ['table_long_decorated_A', 4.8, -1.4, 0],
    ['barrel_large', LEFT + 0.8, 0.6, 0],
    ['bucket_pickaxes', LEFT + 0.8, 3.4, 0],
    ['crates_stacked', RIGHT - 0.8, 3.8, 0],
    ['trunk_large_A', 0.4, -3.8, 0],
    ['torch_mounted', -7.7, -2.6, 1, 2.4],
    ['torch_mounted', 7.7, -2.6, 3, 2.4],
    ['column', -2.2, 4.6, 0],
  ],
  loot: [-3.2, 0.6],
  coins: 3,
};

const BARN: Theme = {
  title: 'Barn',
  icon: '🌾',
  say: 'A work barn, full of sacks, boxes and barrels.',
  wall: 0xc9a777,
  floor: 0x8a6a45,
  items: [
    ['barrel_large', -6.4, BACK + 0.4, 0],
    ['barrel_large', -4.2, BACK + 0.4, 0],
    ['barrel_small_stack', -1.6, BACK + 0.2, 0],
    ['crates_stacked', 2.2, BACK + 0.4, 0],
    ['box_stacked', 5.6, BACK + 0.4, 0],
    ['crates_stacked', LEFT + 0.6, 0, 0],
    ['bench', LEFT + 0.6, 3.6, 0],
    ['trunk_large_A', RIGHT - 1, 0, 1],
    ['barrel_large', RIGHT - 0.8, 4.2, 0],
    ['table_medium_decorated_A', 4.2, 2.4, 0],
    ['stool', 2.4, 2.4, 0],
  ],
  loot: [-3.4, 3.2],
  coins: 2,
};

const CHURCH: Theme = {
  title: 'Church',
  icon: '⛪',
  say: 'A quiet hall with candles and long benches.',
  wall: 0xe8e4f2,
  floor: 0x8c8ea3,
  items: [
    ['rug_rectangle_stripes_A', 0, -1.6, 1],
    ['table_long_tablecloth_decorated_A', 0, -4.4, 1],
    ['candle_triple', -2.6, -4.4, 0],
    ['candle_triple', 2.6, -4.4, 0],
    ['banner_patternB_yellow', -4.6, BACK - 0.2, 0, 1.8],
    ['banner_patternB_yellow', 4.6, BACK - 0.2, 0, 1.8],
    ['bench', -4.4, -1.6, 1],
    ['bench', 4.4, -1.6, 1],
    ['bench', -4.4, 0.6, 1],
    ['bench', 4.4, 0.6, 1],
    ['bench', -4.4, 2.8, 1],
    ['bench', 4.4, 2.8, 1],
    ['column', -7.2, -5, 0],
    ['column', 7.2, -5, 0],
    ['column', -7.2, 5, 0],
    ['column', 7.2, 5, 0],
  ],
  loot: [0, -2.6],
  coins: 2,
};

const HALL: Theme = {
  title: 'Town hall',
  icon: '🏛️',
  say: 'The town hall. The village makes its plans here.',
  wall: 0xcfd9ea,
  floor: 0x6f5a48,
  items: [
    ['rug_rectangle_stripes_A', 0, -0.6, 1],
    ['table_long_decorated_A', 0, -0.6, 1],
    ['chair', -2.4, -2.2, 0],
    ['chair', 0, -2.2, 0],
    ['chair', 2.4, -2.2, 0],
    ['chair', -2.4, 1, 2],
    ['chair', 0, 1, 2],
    ['chair', 2.4, 1, 2],
    ['bookcase_double_decoratedA', -5, BACK, 0],
    ['bookcase_double_decoratedA', 5, BACK, 0],
    ['banner_shield_blue', 0, BACK - 0.2, 0, 1.8],
    ['desk_decorated', LEFT + 0.8, 3, 1],
    ['trunk_large_A', RIGHT - 1, 3.4, 3],
  ],
  loot: [6, -2.4],
  coins: 3,
};

const TOWER: Theme = {
  title: 'Tower',
  icon: '🗼',
  say: 'A lookout tower. Guards keep watch from up here.',
  wall: 0xaeb4c2,
  floor: 0x6d6a72,
  items: [
    ['bookcase_double_decoratedA', -4.6, BACK, 0],
    ['banner_shield_blue', 0.4, BACK - 0.2, 0, 1.8],
    ['bed_decorated', 5.6, -3.6, 0],
    ['desk_decorated', LEFT + 0.8, -0.4, 1],
    ['trunk_large_A', RIGHT - 1, 1.6, 3],
    ['barrel_large', RIGHT - 0.8, 4.4, 0],
    ['sword_shield', -7.75, 3, 1, 2.2],
    ['candle_triple', -3, 4.6, 0],
    ['rug_oval_A', 0, 0, 0],
    ['torch_mounted', 7.7, -1, 3, 2.4],
  ],
  loot: [2.6, -3.8],
  coins: 3,
};

const MINE: Theme = {
  title: 'Mine',
  icon: '⛏️',
  say: 'A mine. Shiny gold hides in the rock.',
  wall: 0x6b5f57,
  floor: 0x4c443e,
  items: [
    ['rocks_gold', -5.4, -4, 0],
    ['rocks_gold', 5, -4.2, 1],
    ['rocks_gold', 6, 2.6, 2],
    ['rubble_large', -6, 2.8, 0],
    ['bucket_pickaxes', -2.4, -4.6, 0],
    ['crates_stacked', 1.6, BACK + 0.4, 0],
    ['barrel_large', -6.6, -0.6, 0],
    ['torch_mounted', -7.7, 0.8, 1, 2.4],
    ['torch_mounted', 7.7, -0.8, 3, 2.4],
    ['column', -2.4, 4.8, 0],
    ['column', 2.4, 4.8, 0],
  ],
  loot: [2.8, -1.4],
  coins: 4,
};

const BARRACKS: Theme = {
  title: 'Barracks',
  icon: '🛡️',
  say: 'The barracks. The guards sleep here.',
  wall: 0xbfc8d6,
  floor: 0x75604c,
  items: [
    ['bed_A_stacked', -6, -3.6, 0],
    ['bed_A_stacked', -3.2, -3.6, 0],
    ['bed_A_stacked', 3.2, -3.6, 0],
    ['bed_A_stacked', 6, -3.6, 0],
    ['banner_shield_blue', 0, BACK - 0.2, 0, 1.8],
    ['trunk_large_A', LEFT + 1, 1.6, 1],
    ['trunk_large_A', RIGHT - 1, 1.6, 3],
    ['sword_shield', -7.75, 4, 1, 2.2],
    ['table_medium_decorated_A', 4.4, 3.4, 0],
    ['stool', 2.6, 3.4, 0],
    ['barrel_large', -5, 4.6, 0],
  ],
  loot: [0, -3.4],
  coins: 3,
};

// ---- the skeletons' buildings: darker, and with more to find ----
const DARK = { wall: 0x5a4a4f, floor: 0x3c3338 };

const THRONE: Theme = {
  title: 'Castle',
  icon: '🏰',
  say: 'The skeleton castle! Look at all that treasure.',
  ...DARK,
  items: [
    ['rug_rectangle_stripes_A', 0, -1, 1],
    ['chest_large_gold', 0, -4.2, 0],
    ['coin_stack_large', -3.2, -4.2, 0],
    ['coin_stack_large', 3.2, -4.2, 0],
    ['coin_stack_medium', -5.4, -2.6, 0],
    ['banner_patternA_red', -5, BACK - 0.2, 0, 1.6],
    ['banner_patternA_red', 0, BACK - 0.2, 0, 2.6],
    ['banner_patternA_red', 5, BACK - 0.2, 0, 1.6],
    ['column', -5.6, 0.4, 0],
    ['column', 5.6, 0.4, 0],
    ['column', -5.6, 4, 0],
    ['column', 5.6, 4, 0],
    ['torch_mounted', -7.7, -2, 1, 2.4],
    ['torch_mounted', 7.7, -2, 3, 2.4],
    ['sword_shield_gold', 7.75, 2.4, 3, 2.2],
  ],
  loot: [5.2, -2.8],
  coins: 12,
};

const WAR_TENT: Theme = {
  title: 'Skeleton camp',
  icon: '⛺',
  say: 'A skeleton tent. Shh! What did they leave behind?',
  ...DARK,
  items: [
    ['banner_patternA_red', 0, BACK - 0.2, 0, 1.6],
    ['bed_A_stacked', -5.8, -3.6, 0],
    ['bed_A_stacked', 5.8, -3.6, 0],
    ['crates_stacked', LEFT + 0.6, 1, 0],
    ['barrel_small_stack', RIGHT - 0.9, 1.4, 0],
    ['table_medium_decorated_A', -3.4, 3.4, 0],
    ['sword_shield', 7.75, -1.4, 3, 2.2],
    ['torch_mounted', -7.7, -1.4, 1, 2.4],
    ['trunk_large_A', 2.6, -4.4, 0],
    ['rubble_large', 5.6, 4, 0],
  ],
  loot: [-1.6, -3.6],
  coins: 6,
};

const TRADER: Theme = { ...MARKET, title: 'Trader', say: "A trader's tent, packed with things from far away." };

/** Which inside goes with which building model. */
const BY_NAME: [RegExp, Theme][] = [
  [/castle_red/, THRONE],
  [/castle_blue/, { ...HALL, title: 'Castle', icon: '🏰', say: 'The city castle! The king and queen live here.', coins: 8 }],
  [/_red$/, WAR_TENT],
  [/tent_blue/, TRADER],
  [/home_/, HOUSE],
  [/tavern/, TAVERN],
  [/market|docks/, MARKET],
  [/blacksmith|workshop/, FORGE],
  [/church|shrine/, CHURCH],
  [/townhall/, HALL],
  [/tower|watchtower/, TOWER],
  [/mine/, MINE],
  [/barracks|archeryrange/, BARRACKS],
];

export function themeFor(building: string): Theme {
  for (const [pattern, theme] of BY_NAME) if (pattern.test(building)) return theme;
  // Windmills, watermills, stables and lumber mills.
  return BARN;
}
