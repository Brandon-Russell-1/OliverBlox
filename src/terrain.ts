import * as THREE from 'three';
import { fbm, hash2, smoothstep, mulberry32 } from './noise';
import { BUILDINGS, FORT_FIRST, type PropDef, type PropLibrary } from './assets';
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
}

export interface Village {
  /** Stable name for this place, used to remember which forts have been won. */
  id: string;
  /** A friendly village, or a fort held by skeletons. */
  kind: 'village' | 'fort' | 'maze' | 'cave' | 'dungeon';
  x: number;
  z: number;
  h: number;
  buildings: Building[];
  /** For mazes: where each stretch of wall stands. */
  walls: { x: number; z: number; rot: number }[];
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
    // Villages use the blue buildings and forts the red ones; the first of each set stands in the middle.
    const first = kind === 'fort' ? FORT_FIRST : 0;
    const others = (kind === 'fort' ? BUILDINGS.length : FORT_FIRST) - first - 1;
    const buildings: Building[] = [{ def: first, x, z, rot: 0, scale: BUILDING_SCALE * 0.6 }];
    const n = kind === 'fort' ? 5 : 6 + Math.floor(hash2(rx, rz, 74) * 3);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash2(rx + i * 31, rz, 75) * 0.3;
      const r = 26 + hash2(rx + i * 31, rz, 76) * 7;
      const bx = x + Math.sin(a) * r;
      const bz = z + Math.cos(a) * r;
      const def = first + 1 + Math.floor(hash2(rx + i * 31, rz, 77) * others);
      // Every building faces the middle.
      buildings.push({ def, x: bx, z: bz, rot: Math.atan2(x - bx, z - bz), scale: BUILDING_SCALE });
    }
    village = {
      id: key,
      kind,
      x,
      z,
      h: Math.max(h, 3),
      buildings: kind === 'maze' || kind === 'cave' ? [] : buildings,
      walls: kind === 'maze' ? mazeWalls(x, z, rx * 7919 + rz * 104729 + 17, MAZE_CELLS, true) : [],
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
function rawHeight(x: number, z: number): number {
  const h = baseHeight(x, z);
  const v = nearestVillage(x, z);
  if (!v) return h;
  const k = 1 - smoothstep(VILLAGE_RADIUS - 8, VILLAGE_RADIUS + 28, Math.hypot(v.x - x, v.z - z));
  return h * (1 - k) + v.h * k;
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
const WALL = wallDef(5);
const WALL_TALL = wallDef(DUNGEON_HEIGHT + 0.5);
const WALL_MATERIAL = new THREE.MeshLambertMaterial({ color: 0x9ea1b0 });

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

export class Terrain {
  private chunks = new Map<string, Chunk>();
  private readonly groundMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  readonly stars: Star[] = [];
  readonly chests: Star[] = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly props: PropLibrary,
    /** Ids of stars already picked up, so they do not come back. */
    private readonly collected: Set<string>,
  ) {}

  /** Load chunks near (x, z), nearest first, and drop far ones. Returns true while work remains. */
  update(x: number, z: number, budget: number): boolean {
    const pcx = Math.floor(x / CHUNK);
    const pcz = Math.floor(z / CHUNK);

    const missing: [number, number, number][] = [];
    for (let dz = -VIEW; dz <= VIEW; dz++) {
      for (let dx = -VIEW; dx <= VIEW; dx++) {
        if (!this.chunks.has(`${pcx + dx},${pcz + dz}`)) missing.push([dx * dx + dz * dz, pcx + dx, pcz + dz]);
      }
    }
    missing.sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < Math.min(budget, missing.length); i++) this.build(missing[i][1], missing[i][2]);

    for (const [key, c] of this.chunks) {
      if (Math.abs(c.cx - pcx) > VIEW + 1 || Math.abs(c.cz - pcz) > VIEW + 1) {
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
    // Keep the village green clear of trees and boulders.
    const inVillage = (x: number, z: number): boolean =>
      village !== null && Math.hypot(x - village.x, z - village.z) < VILLAGE_RADIUS;
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
      colliders.push({ x, z, r: size * 0.05 });
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
      if (size > 1) colliders.push({ x, z, r: def.radius * scale * 0.75 });
    }
    for (let i = 0; i < 7; i++) {
      const x = ox + rng() * CHUNK;
      const z = oz + rng() * CHUNK;
      const size = 0.5 + rng() * 0.6;
      const h = groundAt(x, z);
      if (h < 1.6 || h > 32 || rng() > 0.55 || inVillage(x, z)) continue;
      put(pick(this.props.bushes), x, z, h, size);
    }
    for (let i = 0; i < 46; i++) {
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
        colliders.push({ x, z, r: 2.6 });
      }
    }

    // ---- village buildings that stand in this chunk ----
    const built: Placement[] = [];
    for (const b of village?.buildings ?? []) {
      if (b.x < ox || b.x >= ox + CHUNK || b.z < oz || b.z >= oz + CHUNK) continue;
      const def = this.props.buildings[b.def];
      built.push({ def, x: b.x, y: groundAt(b.x, b.z) - 0.15, z: b.z, scale: b.scale, rot: b.rot });
      colliders.push({ x: b.x, z: b.z, r: def.radius * b.scale * 0.8 });
    }

    // ---- maze walls that stand in this chunk ----
    const walled: Placement[] = [];
    for (const w of village?.walls ?? []) {
      if (w.x < ox || w.x >= ox + CHUNK || w.z < oz || w.z >= oz + CHUNK) continue;
      walled.push({ def: village?.kind === 'dungeon' ? WALL_TALL : WALL, x: w.x, y: groundAt(w.x, w.z) - 0.4, z: w.z, scale: 1, rot: w.rot });
      // A row of small circles along the wall stops anyone walking through it.
      for (let t = -4; t <= 4.01; t += 1.6) {
        colliders.push({ x: w.x + Math.cos(w.rot) * t, z: w.z - Math.sin(w.rot) * t, r: 0.85 });
      }
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
    if (hash2(cx, cz, 131) < 0.14 && !this.collected.has(chestId)) {
      const x = ox + 6 + rng() * (CHUNK - 12);
      const z = oz + 6 + rng() * (CHUNK - 12);
      const h = groundAt(x, z);
      if (h > 1.5 && Math.hypot(x, z) > 40 && !inVillage(x, z)) {
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
    let at = 0;
    for (const { def, x, y, z, scale, rot } of placements) {
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      for (let i = 0; i < def.count; i++) {
        const px = def.pos[i * 3];
        const py = def.pos[i * 3 + 1];
        const pz = def.pos[i * 3 + 2];
        const nx = def.norm[i * 3];
        const nz = def.norm[i * 3 + 2];
        const o = (at + i) * 3;
        pos[o] = x + (px * cos + pz * sin) * scale;
        pos[o + 1] = y + py * scale;
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
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private unload(c: Chunk): void {
    this.scene.remove(c.ground);
    c.ground.geometry.dispose();
    for (const mesh of [c.props, c.buildings, c.walls]) {
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
