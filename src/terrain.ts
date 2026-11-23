import * as THREE from 'three';
import { fbm, hash2, smoothstep, mulberry32 } from './noise';
import { BUILDINGS, type PropDef, type PropLibrary } from './assets';
import { makeStar } from './models';

/** Chunk edge in metres, and how many terrain cells run along it. */
export const CHUNK = 48;
const CELLS = 16;
const CELL = CHUNK / CELLS;
/** Chunks kept loaded in each direction around the player. */
export const VIEW = 4;
export const SEA_LEVEL = 0;

/** The shape of the land: a pure function of position, so the world is endless and repeatable. */
function baseHeight(x: number, z: number): number {
  const continent = fbm(x / 520 + 3.7, z / 520 - 1.2, 3, 11);
  const hills = fbm(x / 110, z / 110, 4, 23);
  const mountains = fbm(x / 330 + 9, z / 330 + 4, 2, 37);

  let h = (continent - 0.44) * 90;
  const land = smoothstep(-4, 6, h);
  h += (hills - 0.5) * 18 * (0.35 + 0.65 * land);
  const m = smoothstep(0.56, 0.78, mountains) * land;
  h += m * m * 70 * hills;

  // The start area is always a gentle meadow, wherever the noise would have put it.
  const k = 1 - smoothstep(50, 170, Math.hypot(x, z));
  return h * (1 - k) + (4 + (hills - 0.5) * 5) * k;
}

export interface Building {
  /** Index into the building models. */
  def: number;
  x: number;
  z: number;
  rot: number;
  scale: number;
  /** True for a building with a door to walk in by. */
  enter?: boolean;
  /** How far out its circle of solid ground reaches; 0 for something small enough to walk through. */
  solid?: number;
  /** A stretch of wall: solid all along its length rather than in a circle. */
  wall?: number;
}

/** The kinds of small place found between the villages. */
export type SiteType = 'camp' | 'farm' | 'ruin' | 'tower' | 'lumber' | 'mine' | 'shrine' | 'merchant' | 'fishing';

export interface Village {
  /** Stable name for this place, used to remember which forts have been won. */
  id: string;
  /** A friendly village, or a fort held by skeletons. */
  kind: 'village' | 'fort' | 'maze' | 'cave' | 'dungeon' | 'site';
  /** For the small places between villages: what is there. */
  site?: SiteType;
  /** Camp fires. */
  fires?: { x: number; z: number }[];
  x: number;
  z: number;
  h: number;
  buildings: Building[];
  /** For mazes: where each stretch of wall stands. */
  walls: { x: number; z: number; rot: number }[];
}

const B = (name: string): number => {
  const i = BUILDINGS.indexOf(name);
  if (i < 0) throw new Error(`No building called ${name}`);
  return i;
};
/** How big each small thing is drawn. Buildings are drawn at BUILDING_SCALE unless a layout says otherwise. */
const PROP_SCALE: Record<string, number> = {
  cart: 3.6,
  cart_merchant: 3.6,
  horse_A: 3.4,
  catapult_red_full: 4.2,
  cannon_red_full: 4,
  banner_red_full: 8,
  banner_blue_full: 8,
  tent: 9,
  fence_wood_straight: 4,
  fence_wood_straight_gate: 4,
  wall_straight: 5,
  wall_straight_gate: 5,
  haybale: 6,
  trees_A_cut: 6,
  boat: 8,
  boatrack: 7,
  target: 6,
  weaponrack: 6,
  flag_red: 12,
  flag_blue: 12,
  building_grain: 6,
};
/** Buildings with no way in: they are open to the sky, or too small. */
const NO_DOOR = new Set(['building_well_blue', 'building_destroyed', 'building_grain', 'building_scaffolding', 'building_stage_A']);

/** Helps set out a place: positions are given relative to its middle and turned to face its own way. */
class Layout {
  readonly buildings: Building[] = [];
  readonly fires: { x: number; z: number }[] = [];
  private n = 0;
  constructor(
    readonly x: number,
    readonly z: number,
    private readonly turn: number,
    private readonly seed: number,
  ) {}

  /** A number from 0 to 1 that is always the same for this place and this call. */
  roll(): number {
    return hash2(this.seed, this.n++, 201);
  }

  pick<T>(list: T[]): T {
    return list[Math.floor(this.roll() * list.length) % list.length];
  }

  at(dx: number, dz: number): { x: number; z: number } {
    const c = Math.cos(this.turn);
    const s = Math.sin(this.turn);
    return { x: this.x + dx * c + dz * s, z: this.z + dz * c - dx * s };
  }

  /** A building, facing the given way (0 faces +z before the place's own turn). */
  put(name: string, dx: number, dz: number, facing: number, scale = PROP_SCALE[name] ?? BUILDING_SCALE): Building {
    const { x, z } = this.at(dx, dz);
    const big = name.startsWith('building_');
    const b: Building = { def: B(name), x, z, rot: facing + this.turn, scale, enter: big && !NO_DOOR.has(name) };
    if (!big) b.solid = 0;
    if (name === 'building_grain') b.solid = 0;
    this.buildings.push(b);
    return b;
  }

  /** Something small, turned any which way, that can be walked through. */
  prop(name: string, dx: number, dz: number, facing = this.roll() * Math.PI * 2): Building {
    return this.put(name, dx, dz, facing);
  }

  /** A few small things scattered around a spot. */
  clutter(names: string[], dx: number, dz: number, count: number, spread: number): void {
    for (let i = 0; i < count; i++) {
      const a = this.roll() * Math.PI * 2;
      const r = spread * (0.35 + 0.65 * this.roll());
      this.prop(this.pick(names), dx + Math.sin(a) * r, dz + Math.cos(a) * r);
    }
  }

  fire(dx: number, dz: number): void {
    this.fires.push(this.at(dx, dz));
    this.prop('resource_lumber', dx, dz).scale = 4;
  }

  /** A ring of wall with a gate on the +z side. */
  ring(radius: number, wall: string, gate: string): void {
    const scale = PROP_SCALE[wall];
    const count = Math.round((Math.PI * 2 * radius) / (2 * scale));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const b = this.put(i === 0 ? gate : wall, Math.sin(a) * radius, Math.cos(a) * radius, a, scale);
      // The gate is only solid at its two posts.
      b.wall = i === 0 ? 2 : 1;
    }
  }
}

const VILLAGE_INNER = ['home_B', 'tavern', 'market', 'blacksmith', 'windmill', 'church', 'townhall', 'tower_A', 'stables'].map((n) => `building_${n}_blue`);
const VILLAGE_OUTER = ['archeryrange', 'barracks', 'lumbermill', 'workshop', 'watermill', 'shrine', 'watchtower', 'tower_B'].map((n) => `building_${n}_blue`);
const YARD = ['barrel', 'crate_A_big', 'crate_B_small', 'sack', 'haybale', 'bucket_water', 'crate_long_A'];

function layVillage(lay: Layout, rx: number, rz: number): void {
  lay.put('building_well_blue', 0, 0, 0, BUILDING_SCALE * 0.6);
  const n = 6 + Math.floor(hash2(rx, rz, 74) * 3);
  const start = Math.floor(lay.roll() * VILLAGE_INNER.length);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + hash2(rx + i * 31, rz, 75) * 0.3;
    const r = 26 + hash2(rx + i * 31, rz, 76) * 7;
    // The first house in a village is the player's own and the next three are for friends.
    // All four are the same cottage, so their doors are always in the same place.
    const name = i < 4 ? 'building_home_A_blue' : VILLAGE_INNER[(start + i) % VILLAGE_INNER.length];
    // Every building faces the middle.
    lay.put(name, Math.sin(a) * r, Math.cos(a) * r, a + Math.PI);
  }
  // Something in the yard beside each one. (After the houses, so a house's place in the list never changes.)
  for (let i = 0; i < n; i++) {
    const b = lay.buildings[1 + i];
    const a = Math.atan2(b.x - lay.x, b.z - lay.z) + 0.25;
    const r = Math.hypot(b.x - lay.x, b.z - lay.z) + 2;
    lay.clutter(YARD, Math.sin(a) * r, Math.cos(a) * r, 2, 2.2);
  }
  // A second ring of bigger buildings behind the houses, with fields and carts between them.
  const m = 4 + Math.floor(lay.roll() * 3);
  const first = Math.floor(lay.roll() * VILLAGE_OUTER.length);
  const offset = lay.roll() * Math.PI * 2;
  for (let i = 0; i < m; i++) {
    const a = offset + (i / m) * Math.PI * 2;
    lay.put(VILLAGE_OUTER[(first + i) % VILLAGE_OUTER.length], Math.sin(a) * 45, Math.cos(a) * 45, a + Math.PI);
    const between = a + Math.PI / m;
    const what = i % 3;
    if (what === 0) {
      lay.put('building_grain', Math.sin(between) * 46, Math.cos(between) * 46, between);
      lay.clutter(['haybale', 'wheelbarrow', 'sack'], Math.sin(between) * 39, Math.cos(between) * 39, 3, 3);
    } else if (what === 1) {
      lay.prop('cart', Math.sin(between) * 42, Math.cos(between) * 42).solid = 2.2;
      lay.prop('horse_A', Math.sin(between) * 42 + 4, Math.cos(between) * 42 + 2);
      lay.prop('trough', Math.sin(between) * 44, Math.cos(between) * 44 - 4);
    } else {
      lay.put('building_stage_A', Math.sin(between) * 44, Math.cos(between) * 44, between + Math.PI, 7);
      lay.prop('target', Math.sin(between) * 40 + 3, Math.cos(between) * 40);
    }
  }
  for (let i = 0; i < 4; i++) lay.prop('flag_blue', Math.sin(i * 1.571 + 0.78) * 9, Math.cos(i * 1.571 + 0.78) * 9, i * 1.571);
}

/** A skeleton stronghold: a castle inside a ring of wall, with towers, tents, fires and war machines. */
function layFort(lay: Layout): void {
  lay.put('building_castle_red', 0, -6, 0, 9);
  lay.ring(38, 'wall_straight', 'wall_straight_gate');
  // Towers inside the wall, and two with war machines guarding the gate.
  for (let i = 0; i < 4; i++) {
    const a = 0.785 + i * 1.571;
    lay.put('building_watchtower_red', Math.sin(a) * 30, Math.cos(a) * 30, a + Math.PI, 9);
  }
  lay.put('building_tower_cannon_red', -9, 30, 0, 9);
  lay.put('building_tower_catapult_red', 9, 30, 0, 9);
  // Tents and barracks round the castle.
  const inner = ['building_tent_red', 'building_barracks_red', 'building_tent_red', 'building_tower_B_red', 'building_tent_red', 'building_archeryrange_red'];
  inner.forEach((name, i) => {
    const a = 1.05 + (i / inner.length) * (Math.PI * 2 - 2.1);
    lay.put(name, Math.sin(a) * 21, Math.cos(a) * 21, a + Math.PI, name.includes('tent') ? 7 : 8);
  });
  lay.fire(-7, 13);
  lay.fire(8, 14);
  lay.fire(0, 22);
  lay.prop('catapult_red_full', -14, 20, 0).solid = 2;
  lay.prop('catapult_red_full', 15, 19, 0).solid = 2;
  lay.prop('cannon_red_full', -4, 33, 0);
  lay.prop('cannon_red_full', 4, 33, 0);
  lay.clutter(['weaponrack', 'target', 'cannonball_pallet', 'crate_A_big', 'barrel'], -10, 8, 5, 5);
  lay.clutter(['weaponrack', 'crate_long_A', 'barrel', 'sack'], 11, 7, 5, 5);
  lay.prop('flag_red', -6, 40, 0);
  lay.prop('flag_red', 6, 40, 0);
  for (let i = 0; i < 6; i++) lay.prop('banner_red_full', Math.sin(i * 1.047 + 0.5) * 33, Math.cos(i * 1.047 + 0.5) * 33, i * 1.047 + 0.5 + Math.PI);
}

// ---------- the small places between villages ----------
const SITE_CELL = 140;
const sites = new Map<string, Village | null>();
export const SITE_ICONS: Record<SiteType, string> = { camp: '⛺', farm: '🌾', ruin: '🏚️', tower: '🗼', lumber: '🪓', mine: '⛏️', shrine: '⛩️', merchant: '🧺', fishing: '🎣' };

function siteIn(cx: number, cz: number): Village | null {
  const key = `${cx},${cz}`;
  const cached = sites.get(key);
  if (cached !== undefined) return cached;
  let site: Village | null = null;
  const x = (cx + 0.3 + 0.4 * hash2(cx, cz, 211)) * SITE_CELL;
  const z = (cz + 0.3 + 0.4 * hash2(cx, cz, 212)) * SITE_CELL;
  const h = baseHeight(x, z);
  const v = nearestVillage(x, z);
  const clear = Math.hypot(x, z) > 150 && x < DUNGEON_SHIFT * REGION * 0.4 && z < DUNGEON_SHIFT * REGION * 0.4 && (!v || Math.hypot(v.x - x, v.z - z) > 120) && airstripDistance(x, z) > 60;
  if (clear && h > 1.3 && h < 26 && hash2(cx, cz, 213) < (h < 2.3 ? 0.3 : 0.66)) {
    const roll = hash2(cx, cz, 214);
    const type: SiteType =
      h < 2.3
        ? 'fishing'
        : h > 17
          ? roll < 0.55
            ? 'mine'
            : 'tower'
          : roll < 0.27
            ? 'camp'
            : roll < 0.48
              ? 'farm'
              : roll < 0.6
                ? 'ruin'
                : roll < 0.72
                  ? 'tower'
                  : roll < 0.82
                    ? 'lumber'
                    : roll < 0.91
                      ? 'shrine'
                      : 'merchant';
    const lay = new Layout(x, z, hash2(cx, cz, 215) * Math.PI * 2, cx * 977 + cz * 13 + 3);
    laySite(lay, type);
    site = { id: `s${key}`, kind: 'site', site: type, x, z, h: Math.max(h, 2), buildings: lay.buildings, walls: [], fires: lay.fires };
  }
  sites.set(key, site);
  return site;
}

function laySite(lay: Layout, type: SiteType): void {
  if (type === 'camp') {
    // A skeleton camp: tents round a fire behind a rough fence.
    lay.fire(0, 0);
    lay.put('building_tent_red', 0, -9, 0, 6);
    lay.prop('tent', -8, -2, 1.2).solid = 1.8;
    lay.prop('tent', 8, -2, -1.2).solid = 1.8;
    lay.prop('tent', -5, 7, 2.4).solid = 1.8;
    lay.prop('flag_red', 3, 8, 0);
    lay.clutter(['weaponrack', 'crate_A_big', 'barrel', 'target', 'sack'], 6, 5, 4, 3);
    for (let i = 0; i < 9; i++) {
      const a = 0.9 + (i / 9) * (Math.PI * 2 - 1.8);
      lay.put('fence_wood_straight', Math.sin(a) * 15, Math.cos(a) * 15, a + Math.PI / 2);
    }
  } else if (type === 'farm') {
    lay.put('building_home_B_blue', -8, -6, 0.4);
    lay.put(lay.roll() < 0.5 ? 'building_windmill_blue' : 'building_stables_blue', 9, -7, -0.4);
    lay.put('building_grain', -9, 10, 0);
    lay.put('building_grain', 4, 12, 0);
    lay.put('building_grain', 15, 9, 1.57);
    lay.clutter(['haybale', 'haybale', 'sack', 'wheelbarrow', 'bucket_water'], 1, 1, 6, 5);
    lay.prop('trough', 4, -1);
    lay.prop('horse_A', 6, 1);
    lay.prop('cart', -2, 4).solid = 2.2;
    for (let i = 0; i < 5; i++) lay.put('fence_wood_straight', -16, -8 + i * 4.6, 0);
  } else if (type === 'ruin') {
    lay.put('building_destroyed', 0, 0, 0);
    lay.put('building_scaffolding', 9, 3, 0.6, 8).solid = 0;
    lay.put('wall_straight', -10, 4, 0.5, 3).wall = 1;
    lay.put('wall_straight', -6, -10, 1.9, 3).wall = 1;
    lay.clutter(['resource_stone', 'crate_long_A', 'barrel', 'pallet'], 3, 8, 5, 5);
  } else if (type === 'tower') {
    lay.put(lay.pick(['building_watchtower_blue', 'building_tower_B_blue', 'building_tower_A_blue']), 0, 0, 0);
    lay.prop('flag_blue', 6, 5, 0);
    lay.clutter(['barrel', 'crate_A_big', 'sack', 'weaponrack'], -6, 5, 4, 3);
    lay.fire(5, -5);
  } else if (type === 'lumber') {
    lay.put('building_lumbermill_blue', 0, -4, 0);
    lay.prop('trees_A_cut', -12, 6);
    lay.prop('trees_A_cut', 12, 8);
    lay.clutter(['resource_lumber', 'resource_lumber', 'pallet', 'crate_B_small'], 2, 9, 6, 5);
    lay.prop('cart', -6, 7).solid = 2.2;
  } else if (type === 'mine') {
    lay.put('building_mine_blue', 0, -4, 0);
    lay.clutter(['resource_stone', 'resource_stone', 'crate_A_big', 'wheelbarrow', 'barrel'], 1, 10, 7, 6);
    lay.prop('cart', 8, 6).solid = 2.2;
    lay.fire(-8, 6);
  } else if (type === 'shrine') {
    lay.put('building_shrine_blue', 0, 0, 0);
    for (let i = 0; i < 6; i++) lay.prop('banner_blue_full', Math.sin(i * 1.047) * 11, Math.cos(i * 1.047) * 11, i * 1.047 + Math.PI);
  } else if (type === 'merchant') {
    lay.put('building_tent_blue', 0, -5, 0, 7);
    lay.prop('cart_merchant', 7, 3, 0.5).solid = 2.2;
    lay.prop('horse_A', 9, 7, 0.5);
    lay.clutter(['crate_A_big', 'crate_B_small', 'barrel', 'sack', 'crate_long_A'], -5, 4, 7, 4);
    lay.prop('flag_blue', -3, 9, 0);
    lay.fire(2, 9);
  } else {
    // A fishing camp by the sea.
    lay.put('building_tent_blue', 0, -4, 0, 6);
    lay.prop('boat', 6, 4, 0.4);
    lay.prop('boat', -7, 5, 2.1);
    lay.prop('boatrack', -2, 8, 0).solid = 1.5;
    lay.clutter(['barrel', 'crate_B_small', 'bucket_water', 'sack'], 4, -1, 5, 3);
    lay.fire(-5, -1);
  }
}

/** The small places whose ground or buildings could reach a point. */
function sitesTouching(x: number, z: number, reach: number): Village[] {
  const found: Village[] = [];
  const x0 = Math.floor((x - reach) / SITE_CELL);
  const x1 = Math.floor((x + reach) / SITE_CELL);
  const z0 = Math.floor((z - reach) / SITE_CELL);
  const z1 = Math.floor((z + reach) / SITE_CELL);
  for (let cz = z0; cz <= z1; cz++) {
    for (let cx = x0; cx <= x1; cx++) {
      const s = siteIn(cx, cz);
      if (s) found.push(s);
    }
  }
  return found;
}

/** Every small place around a point, for the map and for anything that happens there. */
export function sitesNear(x: number, z: number, reach = 300): Village[] {
  return sitesTouching(x, z, reach);
}

/** The world is divided into big squares; each may hold one village. */
const REGION = 420;
const BUILDING_SCALE = 11;
export const VILLAGE_RADIUS = 46;
const villages = new Map<string, Village | null>();

function villageIn(rx: number, rz: number): Village | null {
  const key = `${rx},${rz}`;
  const cached = villages.get(key);
  if (cached !== undefined) return cached;

  if (rx >= DUNGEON_SHIFT / 2 && rz >= DUNGEON_SHIFT / 2) {
    // Far beyond anywhere a player could walk lie the dungeons: one under every cave.
    const x = (rx + 0.5) * REGION;
    const z = (rz + 0.5) * REGION;
    const dungeon: Village = {
      id: key,
      kind: 'dungeon',
      x,
      z,
      h: Math.max(baseHeight(x, z), 4),
      buildings: [],
      walls: mazeWalls(x, z, rx * 7919 + rz * 104729 + 5, DUNGEON_CELLS, false),
    };
    villages.set(key, dungeon);
    return dungeon;
  }

  let village: Village | null = null;
  const home = rx === 0 && rz === 0;
  const firstFort = rx === -1 && rz === 0;
  const firstMaze = rx === 0 && rz === -1;
  const firstCave = rx === -1 && rz === -1;
  // The first village and the first fort are always a short walk from where the game starts.
  const x = home ? 80 : firstFort ? -150 : firstMaze ? 70 : firstCave ? -70 : (rx + 0.2 + 0.6 * hash2(rx, rz, 72)) * REGION;
  const z = home ? 75 : firstFort ? 40 : firstMaze ? -150 : firstCave ? -150 : (rz + 0.2 + 0.6 * hash2(rx, rz, 73)) * REGION;
  const h = baseHeight(x, z);
  const buildable = h > 3 && h < 22;
  const roll = hash2(rx, rz, 71);
  const kind = home
    ? 'village'
    : firstFort
      ? 'fort'
      : firstMaze
        ? 'maze'
        : firstCave
          ? 'cave'
          : !buildable
            ? null
            : roll < 0.45
              ? 'village'
              : roll < 0.65
                ? 'fort'
                : roll < 0.82
                  ? 'maze'
                  : 'cave';
  if (kind) {
    const lay = new Layout(x, z, 0, rx * 131 + rz * 7 + 1);
    if (kind === 'village') layVillage(lay, rx, rz);
    else if (kind === 'fort') layFort(lay);
    village = {
      id: key,
      kind,
      x,
      z,
      h: Math.max(h, 3),
      buildings: lay.buildings,
      walls: kind === 'maze' ? mazeWalls(x, z, rx * 7919 + rz * 104729 + 17, MAZE_CELLS, true) : [],
      fires: lay.fires,
    };
  }
  villages.set(key, village);
  return village;
}

/** The closest village to a point, looking in the surrounding regions. */
export function nearestVillage(x: number, z: number): Village | null {
  const rx = Math.floor(x / REGION);
  const rz = Math.floor(z / REGION);
  let best: Village | null = null;
  let bestDist = Infinity;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const v = villageIn(rx + dx, rz + dz);
      if (!v) continue;
      const d = Math.hypot(v.x - x, v.z - z);
      if (d < bestDist) {
        best = v;
        bestDist = d;
      }
    }
  }
  return best;
}

/** Every village in the regions around a point, for the map. */
export function villagesNear(x: number, z: number): Village[] {
  const rx = Math.floor(x / REGION);
  const rz = Math.floor(z / REGION);
  const found: Village[] = [];
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const v = villageIn(rx + dx, rz + dz);
      if (v) found.push(v);
    }
  }
  return found;
}

/** Land shape with a level patch pressed into it wherever a village stands. */
/** A long flat strip to take off from and land on, a short walk from the first village. */
export const AIRSTRIP = { x: 175, z: -20, halfLength: 60, halfWidth: 9, h: 4.6 };

/** How far a point is from the runway; 0 on it. */
export function airstripDistance(x: number, z: number): number {
  const dx = Math.max(0, Math.abs(x - AIRSTRIP.x) - AIRSTRIP.halfLength);
  const dz = Math.max(0, Math.abs(z - AIRSTRIP.z) - AIRSTRIP.halfWidth);
  return Math.hypot(dx, dz);
}

function rawHeight(x: number, z: number): number {
  const h = placedHeight(x, z);
  const d = airstripDistance(x, z);
  if (d > 24) return h;
  const k = 1 - smoothstep(2, 24, d);
  return h * (1 - k) + AIRSTRIP.h * k;
}

function siteHeight(x: number, z: number, h: number): number {
  // Each small place sits well inside its own square, so only that square needs looking at.
  const s = siteIn(Math.floor(x / SITE_CELL), Math.floor(z / SITE_CELL));
  if (!s) return h;
  const d = Math.hypot(s.x - x, s.z - z);
  if (d > 34) return h;
  const k = 1 - smoothstep(17, 34, d);
  return h * (1 - k) + s.h * k;
}

function placedHeight(x: number, z: number): number {
  const h = baseHeight(x, z);
  const v = nearestVillage(x, z);
  if (!v) return siteHeight(x, z, h);
  const k = 1 - smoothstep(VILLAGE_RADIUS - 8, VILLAGE_RADIUS + 28, Math.hypot(v.x - x, v.z - z));
  return siteHeight(x, z, h * (1 - k) + v.h * k);
}

/** Mazes are a square of cells this many across, each this many metres wide. */
const MAZE_CELLS = 5;
const MAZE_CELL = 8;

/**
 * Lay out a maze: start with every wall up, then knock walls down along a wandering path
 * that visits every cell, so there is always exactly one way to the middle.
 */
function mazeWalls(cx: number, cz: number, seed: number, n: number, doorway: boolean): { x: number; z: number; rot: number }[] {
  const rng = mulberry32(seed);
  // open[`h,i,j`] is the gap in the wall on the low-z side of cell (i, j); `v` likewise on the low-x side.
  const open = new Set<string>();
  const seen = new Set<string>(['0,0']);
  const stack: [number, number][] = [[0, 0]];
  while (stack.length > 0) {
    const [i, j] = stack[stack.length - 1];
    const next = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([di, dj]) => [i + di, j + dj])
      .filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n && !seen.has(`${a},${b}`));
    if (next.length === 0) {
      stack.pop();
      continue;
    }
    const [a, b] = next[Math.floor(rng() * next.length)];
    open.add(a !== i ? `v,${Math.max(a, i)},${j}` : `h,${i},${Math.max(b, j)}`);
    seen.add(`${a},${b}`);
    stack.push([a, b]);
  }
  // A surface maze has a way in, in the middle of the +z side. A dungeon is sealed: you arrive inside.
  if (doorway) open.add(`h,${Math.floor(n / 2)},${n}`);

  const x0 = cx - (n * MAZE_CELL) / 2;
  const z0 = cz - (n * MAZE_CELL) / 2;
  const walls: { x: number; z: number; rot: number }[] = [];
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i < n; i++) {
      if (!open.has(`h,${i},${j}`)) walls.push({ x: x0 + (i + 0.5) * MAZE_CELL, z: z0 + j * MAZE_CELL, rot: 0 });
      if (!open.has(`v,${j},${i}`)) walls.push({ x: x0 + j * MAZE_CELL, z: z0 + (i + 0.5) * MAZE_CELL, rot: Math.PI / 2 });
    }
  }
  return walls;
}

/** Dungeons are bigger mazes, in regions shifted this far from the cave above them. */
export const DUNGEON_SHIFT = 200;
export const DUNGEON_CELLS = 7;
/** How high a dungeon's walls and roof are. */
export const DUNGEON_HEIGHT = 9;
export const DUNGEON_HALF = (DUNGEON_CELLS * MAZE_CELL) / 2;

/** The dungeon under a cave, or the cave above a dungeon. */
export function linkedPlace(place: Village): Village | null {
  const [rx, rz] = place.id.split(',').map(Number);
  if (place.kind === 'cave') return villageIn(rx + DUNGEON_SHIFT, rz + DUNGEON_SHIFT);
  if (place.kind === 'dungeon') return villageIn(rx - DUNGEON_SHIFT, rz - DUNGEON_SHIFT);
  return null;
}

/** One stretch of wall of a given height: a plain stone slab. */
function wallDef(height: number): PropDef {
  const g = new THREE.BoxGeometry(MAZE_CELL + 1.2, height, 1.2).translate(0, height / 2, 0).toNonIndexed();
  return {
    pos: g.attributes.position.array as Float32Array,
    norm: g.attributes.normal.array as Float32Array,
    uv: g.attributes.uv.array as Float32Array,
    count: g.attributes.position.count,
    radius: MAZE_CELL / 2,
    height,
  };
}
/** A torch flame: a small bright block that glows whatever the light. */
const FLAME: PropDef = (() => {
  const g = new THREE.BoxGeometry(0.35, 0.6, 0.35).toNonIndexed();
  return {
    pos: g.attributes.position.array as Float32Array,
    norm: g.attributes.normal.array as Float32Array,
    uv: g.attributes.uv.array as Float32Array,
    count: g.attributes.position.count,
    radius: 0.2,
    height: 0.6,
  };
})();
const FLAME_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xffa040, fog: false });
const WALL = wallDef(5);
const WALL_TALL = wallDef(DUNGEON_HEIGHT + 0.5);
/** A stone-block pattern drawn once, so walls read as built rather than as grey slabs. */
function stoneTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#8f93a3';
  g.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 4; row++) {
    for (let col = -1; col < 3; col++) {
      const x = col * 64 + (row % 2) * 32;
      const shade = 150 + ((row * 37 + col * 61) % 5) * 9;
      g.fillStyle = `rgb(${shade}, ${shade + 3}, ${shade + 16})`;
      g.fillRect(x + 2, row * 32 + 2, 60, 28);
    }
  }
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 2);
  return texture;
}
const WALL_MATERIAL = new THREE.MeshLambertMaterial({ map: stoneTexture() });

const heightCache = new Map<number, number>();

function latticeHeight(gx: number, gz: number): number {
  const key = (gx + 32768) * 65536 + (gz + 32768);
  let h = heightCache.get(key);
  if (h === undefined) {
    if (heightCache.size > 400000) heightCache.clear();
    h = rawHeight(gx * CELL, gz * CELL);
    heightCache.set(key, h);
  }
  return h;
}

/** Ground height at any point, matching the drawn triangles exactly. */
export function groundAt(x: number, z: number): number {
  const gx = Math.floor(x / CELL);
  const gz = Math.floor(z / CELL);
  const fx = x / CELL - gx;
  const fz = z / CELL - gz;
  const h10 = latticeHeight(gx + 1, gz);
  const h01 = latticeHeight(gx, gz + 1);
  if (fx + fz <= 1) {
    const h00 = latticeHeight(gx, gz);
    return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
  }
  const h11 = latticeHeight(gx + 1, gz + 1);
  return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
}

const COL = {
  wet: new THREE.Color(0xc9b67e),
  sand: new THREE.Color(0xeeddA2),
  grassA: new THREE.Color(0x93d45c),
  grassB: new THREE.Color(0x62b24a),
  forest: new THREE.Color(0x4a9a44),
  dirt: new THREE.Color(0x9a7b52),
  rock: new THREE.Color(0x8f9499),
  snow: new THREE.Color(0xf5f8ff),
};

function colorAt(x: number, z: number, h: number, ny: number, out: THREE.Color): void {
  if (h < 0.9) {
    out.lerpColors(COL.wet, COL.sand, smoothstep(-2.5, 0.2, h));
  } else {
    out.lerpColors(COL.grassA, COL.grassB, fbm(x / 150, z / 150, 2, 5));
    out.lerp(COL.forest, smoothstep(0.5, 0.75, fbm(x / 130, z / 130, 2, 7)) * 0.6);
    out.lerp(COL.sand, 1 - smoothstep(0.9, 2.4, h));
    if (h > 30) out.lerp(COL.rock, smoothstep(30, 40, h));
    if (ny < 0.82) out.lerp(h > 30 ? COL.rock : COL.dirt, 1 - smoothstep(0.6, 0.82, ny));
    if (h > 46) out.lerp(COL.snow, smoothstep(46, 54, h));
  }
  out.multiplyScalar(0.94 + hash2(Math.floor(x), Math.floor(z), 3) * 0.12);
}

interface Collider {
  x: number;
  z: number;
  r: number;
  /** Height of its top, so anyone flying above it passes over. */
  top: number;
}

export interface Star {
  id: string;
  group: THREE.Group;
  pos: THREE.Vector3;
}

interface Chunk {
  cx: number;
  cz: number;
  ground: THREE.Mesh;
  props: THREE.Mesh | null;
  buildings: THREE.Mesh | null;
  walls: THREE.Mesh | null;
  flames: THREE.Mesh | null;
  colliders: Collider[];
  star: Star | null;
  chest: Star | null;
}

interface Placement {
  def: PropDef;
  x: number;
  y: number;
  z: number;
  scale: number;
  rot: number;
}

const beamGeometry = new THREE.CylinderGeometry(0.25, 0.25, 40, 8, 1, true);
const beamMaterial = new THREE.MeshBasicMaterial({
  color: 0xffe066,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
  side: THREE.DoubleSide,
});

/** A way into a building. */
export interface Door {
  /** The same for every player, so friends who walk into the same building meet inside. */
  id: string;
  /** Which building model it is, which decides what is inside. */
  name: string;
  place: Village;
  /** Which of the place's buildings this is. */
  index: number;
  x: number;
  z: number;
  rot: number;
}

/** Shared by everything that moves with the weather: the clock, and how hard the wind blows (1 is a breeze). */
export const NATURE = { time: { value: 0 }, wind: { value: 1 } };

export class Terrain {
  private chunks = new Map<string, Chunk>();
  private readonly groundMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  /** How many chunks are kept loaded in each direction. Lowered on slow devices. */
  view = VIEW;
  readonly stars: Star[] = [];
  readonly chests: Star[] = [];
  /** The scenery that sways in the wind. */
  private plants = new Set<PropDef>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly props: PropLibrary,
    /** Ids of stars already picked up, so they do not come back. */
    private readonly collected: Set<string>,
  ) {
    for (const def of [...props.trees, ...props.bushes, ...props.grass]) this.plants.add(def);
    // Trees, bushes and grass lean in the wind: the higher up the plant, the further it moves.
    props.material.onBeforeCompile = (shader) => {
      shader.uniforms.natureTime = NATURE.time;
      shader.uniforms.natureWind = NATURE.wind;
      shader.vertexShader = `attribute float sway;\nuniform float natureTime;\nuniform float natureWind;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float gust = sin(natureTime * 1.7 + position.x * 0.31 + position.z * 0.23) + 0.5 * sin(natureTime * 2.9 + position.x * 0.83 - position.z * 0.4);
        transformed.x += sway * gust * natureWind;
        transformed.z += sway * gust * 0.6 * natureWind;`,
      );
    };
    // Where the land meets the sea: wet sand, and a line of foam that laps in and out with the waves.
    this.groundMaterial.onBeforeCompile = (shader) => {
      shader.uniforms.natureTime = NATURE.time;
      shader.vertexShader = `varying float vSeaY;\n${shader.vertexShader}`.replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\n        vSeaY = (modelMatrix * vec4(transformed, 1.0)).y;',
      );
      shader.fragmentShader = `varying float vSeaY;\nuniform float natureTime;\n${shader.fragmentShader}`.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        float seaD = vSeaY - ${SEA_LEVEL.toFixed(1)} - 0.06 * sin(natureTime * 0.8);
        diffuseColor.rgb *= 1.0 - 0.2 * (1.0 - smoothstep(0.0, 0.6, seaD)) * step(-0.4, seaD);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), 0.8 * (1.0 - smoothstep(0.0, 0.1, abs(seaD - 0.04))));`,
      );
    };
  }

  /** Every door near a point that can be walked in by, with the spot to stand on in front of it. */
  doorsNear(x: number, z: number): Door[] {
    const v = nearestVillage(x, z);
    const doors: Door[] = [];
    for (const place of v ? [v, ...sitesTouching(x, z, 70)] : sitesTouching(x, z, 70)) {
      place.buildings.forEach((b, index) => {
        if (!b.enter || Math.hypot(b.x - x, b.z - z) > 90) return;
        const reach = (b.solid ?? this.props.buildings[b.def].radius * b.scale * 0.8) + 1.2;
        doors.push({ id: `${place.id}:${index}`, name: BUILDINGS[b.def], place, index, x: b.x + Math.sin(b.rot) * reach, z: b.z + Math.cos(b.rot) * reach, rot: b.rot });
      });
    }
    return doors;
  }

  /** Load chunks near (x, z), nearest first, and drop far ones. Returns true while work remains. */
  update(x: number, z: number, budget: number): boolean {
    const pcx = Math.floor(x / CHUNK);
    const pcz = Math.floor(z / CHUNK);

    const missing: [number, number, number][] = [];
    const view = this.view;
    for (let dz = -view; dz <= view; dz++) {
      for (let dx = -view; dx <= view; dx++) {
        if (!this.chunks.has(`${pcx + dx},${pcz + dz}`)) missing.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
      }
    }
    missing.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(budget, missing.length); i++) this.build(missing[i][1], missing[i][2]);

    for (const [key, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > view + 1 || Math.abs(c.cz - pcz) > view + 1) {
        this.unload(c);
        this.chunks.delete(key);
      }
    }
    return missing.length > budget;
  }

  private build(cx: number, cz: number): void {
    const ox = cx * CHUNK;
    const oz = cz * CHUNK;
    const gx0 = cx * CELLS;
    const gz0 = cz * CELLS;

    const nearby = nearestVillage(ox + CHUNK / 2, oz + CHUNK / 2);
    const floorOf = nearby?.kind === 'dungeon' ? nearby : null;

    // ---- ground: flat-shaded triangles with one colour each ----
    const tris = CELLS * CELLS * 2;
    const pos = new Float32Array(tris * 9);
    const col = new Float32Array(tris * 9);
    const c = new THREE.Color();
    let p = 0;
    const tri = (ax: number, az: number, bx: number, bz: number, dx: number, dz: number): void => {
      const ah = latticeHeight(gx0 + ax, gz0 + az);
      const bh = latticeHeight(gx0 + bx, gz0 + bz);
      const dh = latticeHeight(gx0 + dx, gz0 + dz);
      // Face normal's y, to colour steep faces as dirt or rock.
      const e1x = (bx - ax) * CELL;
      const e1z = (bz - az) * CELL;
      const e2x = (dx - ax) * CELL;
      const e2z = (dz - az) * CELL;
      const nx = (bh - ah) * e2z - e1z * (dh - ah);
      const ny = e1z * e2x - e1x * e2z;
      const nz = e1x * (dh - ah) - (bh - ah) * e2x;
      const mx = ox + ((ax + bx + dx) / 3) * CELL;
      const mz = oz + ((az + bz + dz) / 3) * CELL;
      colorAt(mx, mz, (ah + bh + dh) / 3, ny / Math.hypot(nx, ny, nz), c);
      if (airstripDistance(mx, mz) === 0) {
        // Tarmac, with a broken white line down the middle.
        const stripe = Math.abs(mz - AIRSTRIP.z) < 2 && Math.floor(mx / 9) % 2 === 0;
        if (stripe) c.setRGB(0.85, 0.85, 0.85);
        else c.setRGB(0.13, 0.14, 0.17);
      }
      if (floorOf && Math.hypot(mx - floorOf.x, mz - floorOf.z) < DUNGEON_HALF + 14) c.setRGB(0.2, 0.2, 0.24).multiplyScalar(0.8 + hash2(Math.floor(mx), Math.floor(mz), 3) * 0.4);
      for (const [vx, vz, vh] of [
        [ax, az, ah],
        [bx, bz, bh],
        [dx, dz, dh],
      ]) {
        pos[p] = ox + vx * CELL;
        pos[p + 1] = vh;
        pos[p + 2] = oz + vz * CELL;
        col[p] = c.r;
        col[p + 1] = c.g;
        col[p + 2] = c.b;
        p += 3;
      }
    };
    for (let z = 0; z < CELLS; z++) {
      for (let x = 0; x < CELLS; x++) {
        tri(x, z, x, z + 1, x + 1, z);
        tri(x + 1, z, x, z + 1, x + 1, z + 1);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, this.groundMaterial);
    ground.receiveShadow = true;
    this.scene.add(ground);

    // ---- scenery ----
    const rng = mulberry32(Math.floor(hash2(cx, cz, 7) * 4294967296));
    const placements: Placement[] = [];
    const colliders: Collider[] = [];
    const pick = (list: PropDef[]): PropDef => list[Math.floor(rng() * list.length)];
    const village = nearestVillage(ox + CHUNK / 2, oz + CHUNK / 2);
    const smallPlaces = sitesTouching(ox + CHUNK / 2, oz + CHUNK / 2, CHUNK / 2 + 26);
    // Keep the village green clear of trees and boulders.
    const inVillage = (x: number, z: number): boolean =>
      airstripDistance(x, z) < 8 ||
      (village !== null && Math.hypot(x - village.x, z - village.z) < VILLAGE_RADIUS + (village.kind === 'village' ? 6 : 0)) ||
      smallPlaces.some((s) => Math.hypot(x - s.x, z - s.z) < 21);
    const put = (def: PropDef, x: number, z: number, y: number, targetHeight: number): number => {
      const scale = targetHeight / def.height;
      placements.push({ def, x, y, z, scale, rot: rng() * Math.PI * 2 });
      return scale;
    };

    for (let i = 0; i < 26; i++) {
      const x = ox + rng() * CHUNK;
      const z = oz + rng() * CHUNK;
      const roll = rng();
      const size = 9 + rng() * 5;
      const h = groundAt(x, z);
      if (h < 1.6 || h > 34 || Math.hypot(x, z) < 12 || inVillage(x, z)) continue;
      const density = smoothstep(0.42, 0.68, fbm(x / 130, z / 130, 2, 7));
      if (roll > density * 0.9 + 0.05) continue;
      put(pick(this.props.trees), x, z, h, size);
      colliders.push({ x, z, r: size * 0.05, top: h + size });
    }
    for (let i = 0; i < 5; i++) {
      const x = ox + rng() * CHUNK;
      const z = oz + rng() * CHUNK;
      const roll = rng();
      const size = 0.5 + rng() * rng() * 3.5;
      const h = groundAt(x, z);
      if (h < -2 || Math.hypot(x, z) < 8 || inVillage(x, z)) continue;
      if (roll > (h > 28 ? 0.9 : 0.4)) continue;
      const def = pick(this.props.rocks);
      const scale = put(def, x, z, h - size * 0.1, size);
      if (size > 1) colliders.push({ x, z, r: def.radius * scale * 0.75, top: h + size });
    }
    for (let i = 0; i < 7; i++) {
      const x = ox + rng() * CHUNK;
      const z = oz + rng() * CHUNK;
      const size = 0.5 + rng() * 0.6;
      const h = groundAt(x, z);
      if (h < 1.6 || h > 32 || rng() > 0.55 || inVillage(x, z)) continue;
      put(pick(this.props.bushes), x, z, h, size);
    }
    for (let i = 0; i < 26; i++) {
      const x = ox + rng() * CHUNK;
      const z = oz + rng() * CHUNK;
      const size = 0.5 + rng() * 0.5;
      const h = groundAt(x, z);
      // No grass on a dungeon floor.
      if (h < 1.8 || h > 30 || (village?.kind === 'dungeon' && inVillage(x, z))) continue;
      put(pick(this.props.grass), x, z, h, size);
    }

    // ---- a cave mouth: a ring of boulders with a gap to walk in by ----
    if (village?.kind === 'cave' && village.x >= ox && village.x < ox + CHUNK && village.z >= oz && village.z < oz + CHUNK) {
      for (let i = 0; i < 7; i++) {
        const a = 0.75 + (i / 6) * (Math.PI * 2 - 1.5);
        const x = village.x + Math.sin(a) * 7.5;
        const z = village.z + Math.cos(a) * 7.5;
        put(pick(this.props.rocks), x, z, groundAt(x, z) - 0.6, 6 + rng() * 3);
        colliders.push({ x, z, r: 2.6, top: groundAt(x, z) + 6 });
      }
    }

    // ---- village buildings that stand in this chunk ----
    const built: Placement[] = [];
    const places = village ? [village, ...smallPlaces] : smallPlaces;
    for (const b of places.flatMap((p) => p.buildings)) {
      if (b.x < ox || b.x >= ox + CHUNK || b.z < oz || b.z >= oz + CHUNK) continue;
      const def = this.props.buildings[b.def];
      const g = groundAt(b.x, b.z);
      // The models' front doors are on their +z side, which this turns to face the middle of the village.
      built.push({ def, x: b.x, y: g - 0.15, z: b.z, scale: b.scale, rot: b.rot });
      const top = g + def.height * b.scale;
      if (b.wall) {
        // A row of circles along the wall; a gate is only solid at its posts.
        for (let t = -0.85; t <= 0.86; t += 0.34) {
          if (b.wall === 2 && Math.abs(t) < 0.6) continue;
          colliders.push({ x: b.x + Math.cos(b.rot) * t * b.scale, z: b.z - Math.sin(b.rot) * t * b.scale, r: 0.34 * b.scale, top });
        }
      } else if (b.solid !== 0) {
        colliders.push({ x: b.x, z: b.z, r: b.solid ?? def.radius * b.scale * 0.8, top });
      }
    }

    // ---- maze walls that stand in this chunk ----
    const walled: Placement[] = [];
    for (const w of village?.walls ?? []) {
      if (w.x < ox || w.x >= ox + CHUNK || w.z < oz || w.z >= oz + CHUNK) continue;
      walled.push({ def: village?.kind === 'dungeon' ? WALL_TALL : WALL, x: w.x, y: groundAt(w.x, w.z) - 0.4, z: w.z, scale: 1, rot: w.rot });
      // A row of small circles along the wall stops anyone walking through it.
      for (let t = -4; t <= 4.01; t += 1.6) {
        colliders.push({ x: w.x + Math.cos(w.rot) * t, z: w.z - Math.sin(w.rot) * t, r: 0.85, top: groundAt(w.x, w.z) + (village?.kind === 'dungeon' ? 12 : 5) });
      }
    }

    // ---- torches on the dungeon walls: the only glow down there besides his own ----
    const flames: Placement[] = [];
    for (const f of places.flatMap((p) => p.fires ?? [])) {
      if (f.x < ox || f.x >= ox + CHUNK || f.z < oz || f.z >= oz + CHUNK) continue;
      flames.push({ def: FLAME, x: f.x, y: groundAt(f.x, f.z) + 0.9, z: f.z, scale: 2.4, rot: 0.6 });
    }
    if (village?.kind === 'dungeon') {
      walled.forEach((w, i) => {
        if (i % 2 !== 0) return;
        const side = i % 4 === 0 ? 0.85 : -0.85;
        flames.push({ def: FLAME, x: w.x + Math.sin(w.rot) * side, y: w.y + 3.6, z: w.z + Math.cos(w.rot) * side, scale: 1, rot: 0 });
      });
    }

    // ---- star ----
    let star: Star | null = null;
    const id = `${cx},${cz}`;
    const nearStart = Math.abs(cx) <= 1 && Math.abs(cz) <= 1;
    if ((nearStart || hash2(cx, cz, 99) < 0.3) && !this.collected.has(id)) {
      const x = ox + 6 + rng() * (CHUNK - 12);
      const z = oz + 6 + rng() * (CHUNK - 12);
      const h = groundAt(x, z);
      if (h > 1.2 && Math.hypot(x, z) > 6 && !inVillage(x, z)) {
        const group = new THREE.Group();
        const beam = new THREE.Mesh(beamGeometry, beamMaterial);
        beam.position.y = 20;
        const mesh = makeStar();
        mesh.scale.setScalar(1.8);
        mesh.name = 'star';
        group.add(mesh, beam);
        group.position.set(x, h + 1.8, z);
        this.scene.add(group);
        star = { id, group, pos: group.position };
        this.stars.push(star);
      }
    }

    // ---- treasure chest, out in the wilds ----
    let chest: Star | null = null;
    const chestId = `c${id}`;
    // Camps and ruins always hide one.
    const hoard = smallPlaces.find((s) => (s.site === 'camp' || s.site === 'ruin') && s.x >= ox && s.x < ox + CHUNK && s.z >= oz && s.z < oz + CHUNK);
    if ((hoard || hash2(cx, cz, 131) < 0.14) && !this.collected.has(chestId)) {
      const x = hoard ? hoard.x + 3 : ox + 6 + rng() * (CHUNK - 12);
      const z = hoard ? hoard.z + 3 : oz + 6 + rng() * (CHUNK - 12);
      const h = groundAt(x, z);
      if (hoard || (h > 1.5 && Math.hypot(x, z) > 40 && !inVillage(x, z))) {
        const group = new THREE.Group();
        const model = this.props.chest.clone(true);
        model.scale.setScalar(1.4);
        group.add(model);
        group.position.set(x, h, z);
        group.rotation.y = rng() * Math.PI * 2;
        this.scene.add(group);
        chest = { id: chestId, group, pos: group.position };
        this.chests.push(chest);
      }
    }

    this.chunks.set(id, {
      cx,
      cz,
      ground,
      props: this.bake(placements, this.props.material),
      buildings: this.bake(built, this.props.buildingMaterial),
      walls: this.bake(walled, WALL_MATERIAL),
      flames: this.bake(flames, FLAME_MATERIAL),
      colliders,
      star,
      chest,
    });
  }

  /** Bake every tree, rock and bush of a chunk into one mesh: one draw call instead of dozens. */
  private bake(placements: Placement[], material: THREE.Material): THREE.Mesh | null {
    if (placements.length === 0) return null;
    const total = placements.reduce((n, pl) => n + pl.def.count, 0);
    const pos = new Float32Array(total * 3);
    const norm = new Float32Array(total * 3);
    const uv = new Float32Array(total * 2);
    const sway = new Float32Array(total);
    let at = 0;
    for (const { def, x, y, z, scale, rot } of placements) {
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      // Rocks and buildings stand firm; plants bend more the taller they are.
      const bend = this.plants.has(def) ? Math.min(0.32, 0.06 + 0.03 * def.height * scale) : 0;
      for (let i = 0; i < def.count; i++) {
        const px = def.pos[i * 3];
        const py = def.pos[i * 3 + 1];
        const pz = def.pos[i * 3 + 2];
        const nx = def.norm[i * 3];
        const nz = def.norm[i * 3 + 2];
        const o = (at + i) * 3;
        pos[o] = x + (px * cos + pz * sin) * scale;
        pos[o + 1] = y + py * scale;
        if (bend > 0) sway[at + i] = bend * Math.pow(Math.max(0, py / def.height), 2);
        pos[o + 2] = z + (pz * cos - px * sin) * scale;
        norm[o] = nx * cos + nz * sin;
        norm[o + 1] = def.norm[i * 3 + 1];
        norm[o + 2] = nz * cos - nx * sin;
      }
      uv.set(def.uv, at * 2);
      at += def.count;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(norm, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('sway', new THREE.BufferAttribute(sway, 1));
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private unload(c: Chunk): void {
    this.scene.remove(c.ground);
    c.ground.geometry.dispose();
    for (const mesh of [c.props, c.buildings, c.walls, c.flames]) {
      if (!mesh) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    if (c.star) this.removeStar(c.star);
    if (c.chest) this.removeChest(c.chest);
  }

  private removeStar(star: Star): void {
    this.scene.remove(star.group);
    const i = this.stars.indexOf(star);
    if (i >= 0) this.stars.splice(i, 1);
  }

  /** Pick up any star within reach. Returns the ids collected. */
  collect(pos: THREE.Vector3, reach: number): string[] {
    const near = this.stars.filter(
      (s) => Math.hypot(s.pos.x - pos.x, s.pos.z - pos.z) < reach && Math.abs(s.pos.y - pos.y) < 5,
    );
    return near.map((s) => s.id).filter((id) => this.take(id));
  }

  private removeChest(chest: Star): void {
    this.scene.remove(chest.group);
    const i = this.chests.indexOf(chest);
    if (i >= 0) this.chests.splice(i, 1);
  }

  /** Open any treasure chest within reach. Returns the ids opened. */
  openChests(pos: THREE.Vector3, reach: number): string[] {
    const near = this.chests.filter(
      (c) => Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z) < reach && Math.abs(c.pos.y - pos.y) < 5,
    );
    return near.map((c) => c.id).filter((id) => this.take(id));
  }

  /**
   * Mark a star or chest as taken and remove it from the world, whoever took it.
   * Chest ids start with "c". Returns false if it was already gone.
   */
  take(id: string): boolean {
    if (this.collected.has(id)) return false;
    this.collected.add(id);
    const isChest = id.startsWith('c');
    const chunk = this.chunks.get(isChest ? id.slice(1) : id);
    if (chunk && isChest && chunk.chest) {
      this.removeChest(chunk.chest);
      chunk.chest = null;
    } else if (chunk && !isChest && chunk.star) {
      this.removeStar(chunk.star);
      chunk.star = null;
    }
    return true;
  }

  /** Push a circle out of tree trunks and big rocks. Returns true if it was touching one. */
  collide(pos: THREE.Vector3, radius: number): boolean {
    const cx = Math.floor(pos.x / CHUNK);
    const cz = Math.floor(pos.z / CHUNK);
    let hit = false;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = this.chunks.get(`${cx + dx},${cz + dz}`);
        if (!chunk) continue;
        for (const c of chunk.colliders) {
          if (pos.y > c.top) continue;
          const ox = pos.x - c.x;
          const oz = pos.z - c.z;
          const min = c.r + radius;
          const d2 = ox * ox + oz * oz;
          if (d2 >= min * min || d2 === 0) continue;
          const d = Math.sqrt(d2);
          pos.x = c.x + (ox / d) * min;
          pos.z = c.z + (oz / d) * min;
          hit = true;
        }
      }
    }
    return hit;
  }
}
