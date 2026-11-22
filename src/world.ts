import * as THREE from 'three';

export const SX = 96;
export const SY = 32;
export const SZ = 96;
export const CENTER = 48;
/** Height of the flat town ground: the top surface is at y = GROUND. */
export const GROUND = 6;
export const WATER_Y = 4.45;

export const AIR = 0;
export const GRASS = 1;
export const DIRT = 2;
export const STONE = 3;
export const SAND = 4;
export const WOOD = 5;
export const LEAVES = 6;
export const PLANK = 7;
export const BRICK = 8;
export const ROAD = 9;
export const GLASS = 10;
export const RED = 11;
export const ORANGE = 12;
export const YELLOW = 13;
export const GREEN = 14;
export const BLUE = 15;
export const PURPLE = 16;
export const WHITE = 17;

export const BLOCK_COLORS: Record<number, number> = {
  [GRASS]: 0x5fbf4a,
  [DIRT]: 0x8a5a3a,
  [STONE]: 0x8d9199,
  [SAND]: 0xf0dc9a,
  [WOOD]: 0x7a4f2a,
  [LEAVES]: 0x2f9e44,
  [PLANK]: 0xd9a55f,
  [BRICK]: 0xb5523b,
  [ROAD]: 0x4a4e57,
  [GLASS]: 0xbfe9ff,
  [RED]: 0xe8413c,
  [ORANGE]: 0xff922b,
  [YELLOW]: 0xffd43b,
  [GREEN]: 0x37b24d,
  [BLUE]: 0x2b7fff,
  [PURPLE]: 0x9c5cf0,
  [WHITE]: 0xf4f6fa,
};

/** Blocks Oliver can place, in hotbar order. */
export const HOTBAR = [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, WHITE, BRICK];

export interface RayHit {
  x: number;
  y: number;
  z: number;
  /** The empty cell the ray was in just before the hit: where a new block goes. */
  px: number;
  py: number;
  pz: number;
  t: number;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

export class World {
  readonly data = new Uint8Array(SX * SY * SZ);
  /** Every change made by the player, keyed by cell index. This is what gets saved. */
  readonly edits = new Map<number, number>();
  /** Top of each column as generated, before any player edits. */
  private baseTop = new Uint8Array(SX * SZ);
  private mesh: THREE.InstancedMesh | null = null;
  private capacity = 0;
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly material = new THREE.MeshLambertMaterial({ color: 0xffffff });

  constructor(private readonly scene: THREE.Scene) {
    this.generate();
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) this.baseTop[x + SX * z] = this.topY(x, z);
    }
  }

  idx(x: number, y: number, z: number): number {
    return x + SX * (z + SZ * y);
  }

  inBounds(x: number, y: number, z: number): boolean {
    return x >= 0 && x < SX && y >= 0 && y < SY && z >= 0 && z < SZ;
  }

  get(x: number, y: number, z: number): number {
    return this.inBounds(x, y, z) ? this.data[this.idx(x, y, z)] : AIR;
  }

  /** For collisions: the edges and floor of the world count as solid walls. */
  solid(x: number, y: number, z: number): boolean {
    if (x < 0 || x >= SX || z < 0 || z >= SZ || y < 0) return true;
    if (y >= SY) return false;
    return this.data[this.idx(x, y, z)] !== AIR;
  }

  private set(x: number, y: number, z: number, t: number): void {
    if (this.inBounds(x, y, z)) this.data[this.idx(x, y, z)] = t;
  }

  /** A player edit. Returns false if the cell cannot be changed. */
  edit(x: number, y: number, z: number, t: number): boolean {
    // y = 0 is the unbreakable floor of the world.
    if (!this.inBounds(x, y, z) || y === 0) return false;
    const i = this.idx(x, y, z);
    if (this.data[i] === t) return false;
    this.data[i] = t;
    this.edits.set(i, t);
    this.rebuild();
    return true;
  }

  applyEdits(list: [number, number][]): void {
    for (const [i, t] of list) {
      if (i > 0 && i < this.data.length) {
        this.data[i] = t;
        this.edits.set(i, t);
      }
    }
  }

  /** Number of solid blocks in the natural terrain column, so the surface is at this y. */
  terrainHeight(x: number, z: number): number {
    const dx = (x + 0.5 - CENTER) / CENTER;
    const dz = (z + 0.5 - CENTER) / CENTER;
    const d = Math.sqrt(dx * dx + dz * dz);
    const hills =
      1.5 +
      Math.sin(x * 0.21) * Math.cos(z * 0.17) * 2.2 +
      Math.sin(x * 0.07 + 1.3) * Math.sin(z * 0.09 + 0.5) * 2.6;
    let h = GROUND + hills * smoothstep(0.47, 0.68, d);
    const edge = smoothstep(0.84, 0.99, d);
    h = h * (1 - edge) + 2 * edge;
    return Math.max(1, Math.round(h));
  }

  /** y of the first empty cell above the highest block in a column. */
  topY(x: number, z: number): number {
    for (let y = SY - 1; y >= 0; y--) {
      if (this.get(x, y, z) !== AIR) return y + 1;
    }
    return 0;
  }

  // ---------- world generation ----------

  private generate(): void {
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const h = this.terrainHeight(x, z);
        for (let y = 0; y < h; y++) {
          let t = STONE;
          if (h <= 5) t = y >= h - 3 ? SAND : STONE;
          else if (y === h - 1) t = GRASS;
          else if (y >= h - 4) t = DIRT;
          this.set(x, y, z, t);
        }
      }
    }

    // A square loop road around the town to drive on.
    for (let z = 0; z < SZ; z++) {
      for (let x = 0; x < SX; x++) {
        const ring = Math.max(Math.abs(x - CENTER), Math.abs(z - CENTER));
        if (ring >= 13 && ring <= 15) this.set(x, GROUND - 1, z, ROAD);
      }
    }

    this.house(CENTER - 11, CENTER - 10, 7, 6, BRICK, RED);
    this.house(CENTER + 3, CENTER - 10, 7, 6, PLANK, BLUE);
    this.house(CENTER - 11, CENTER + 2, 6, 6, WHITE, PURPLE);

    this.tree(CENTER - 3, CENTER + 9);
    this.tree(CENTER - 2, CENTER - 2);
    this.tree(CENTER + 10, CENTER - 1);

    const rng = mulberry32(42);
    let planted = 0;
    for (let tries = 0; tries < 600 && planted < 45; tries++) {
      const x = 4 + Math.floor(rng() * (SX - 8));
      const z = 4 + Math.floor(rng() * (SZ - 8));
      const ring = Math.max(Math.abs(x - CENTER), Math.abs(z - CENTER));
      if (ring < 19) continue;
      if (this.terrainHeight(x, z) < 6) continue;
      if (this.topY(x, z) !== this.terrainHeight(x, z)) continue;
      // Keep trunks apart so trees do not merge into a wall.
      let crowded = false;
      for (let dz = -2; dz <= 2 && !crowded; dz++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (this.get(x + dx, this.terrainHeight(x, z), z + dz) === WOOD) crowded = true;
        }
      }
      if (crowded) continue;
      this.tree(x, z);
      planted++;
    }
  }

  private house(x0: number, z0: number, w: number, d: number, wall: number, roof: number): void {
    const y0 = GROUND;
    for (let x = 0; x < w; x++) {
      for (let z = 0; z < d; z++) {
        this.set(x0 + x, y0 - 1, z0 + z, PLANK);
        const isWall = x === 0 || x === w - 1 || z === 0 || z === d - 1;
        for (let y = 0; y < 4; y++) this.set(x0 + x, y0 + y, z0 + z, isWall ? wall : AIR);
      }
    }
    const mx = x0 + Math.floor(w / 2);
    const mz = z0 + Math.floor(d / 2);
    // Door on the +z side, windows on the other three.
    this.set(mx, y0, z0 + d - 1, AIR);
    this.set(mx, y0 + 1, z0 + d - 1, AIR);
    for (const y of [y0 + 1, y0 + 2]) {
      this.set(x0, y, mz, GLASS);
      this.set(x0 + w - 1, y, mz, GLASS);
      this.set(mx, y, z0, GLASS);
    }
    for (let i = 0; w + 2 - 2 * i > 0 && d + 2 - 2 * i > 0; i++) {
      for (let x = x0 - 1 + i; x <= x0 + w - i; x++) {
        for (let z = z0 - 1 + i; z <= z0 + d - i; z++) this.set(x, y0 + 4 + i, z, roof);
      }
    }
  }

  private tree(x: number, z: number): void {
    const y0 = this.terrainHeight(x, z);
    for (let dy = 2; dy <= 5; dy++) {
      const r = dy <= 3 ? 2 : dy === 4 ? 1 : 0;
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (r === 2 && Math.abs(dx) === 2 && Math.abs(dz) === 2) continue;
          this.set(x + dx, y0 + dy, z + dz, LEAVES);
        }
      }
    }
    for (let dy = 0; dy < 4; dy++) this.set(x, y0 + dy, z, WOOD);
  }

  /** Open, reachable ground spots for collectibles. Same seed always gives the same spots. */
  findSpots(rng: () => number, count: number): THREE.Vector3[] {
    const spots: THREE.Vector3[] = [];
    for (let tries = 0; tries < 5000 && spots.length < count; tries++) {
      const x = 6 + Math.floor(rng() * (SX - 12));
      const z = 6 + Math.floor(rng() * (SZ - 12));
      const h = this.terrainHeight(x, z);
      if (h < 6) continue;
      if (this.baseTop[x + SX * z] !== h) continue;
      if (spots.some((s) => Math.abs(s.x - x) + Math.abs(s.z - z) < 10)) continue;
      spots.push(new THREE.Vector3(x + 0.5, h, z + 0.5));
    }
    return spots;
  }

  // ---------- rendering ----------

  private exposed(x: number, y: number, z: number, self: number): boolean {
    if (y + 1 >= SY) return true;
    const see = (nx: number, ny: number, nz: number): boolean => {
      if (!this.inBounds(nx, ny, nz)) return false;
      const n = this.data[this.idx(nx, ny, nz)];
      return n === AIR || (n === GLASS && self !== GLASS);
    };
    return (
      see(x, y + 1, z) ||
      see(x + 1, y, z) ||
      see(x - 1, y, z) ||
      see(x, y, z + 1) ||
      see(x, y, z - 1) ||
      see(x, y - 1, z)
    );
  }

  /** Rebuild the single instanced mesh that draws every visible block. */
  rebuild(): void {
    const cells: number[] = [];
    for (let y = 0; y < SY; y++) {
      for (let z = 0; z < SZ; z++) {
        for (let x = 0; x < SX; x++) {
          const t = this.data[this.idx(x, y, z)];
          if (t !== AIR && this.exposed(x, y, z, t)) cells.push(x, y, z, t);
        }
      }
    }
    const n = cells.length / 4;

    if (!this.mesh || n > this.capacity) {
      if (this.mesh) {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
      }
      this.capacity = Math.ceil(n * 1.3) + 512;
      this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
      this.mesh.frustumCulled = false;
      this.scene.add(this.mesh);
    }

    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = cells[i * 4];
      const y = cells[i * 4 + 1];
      const z = cells[i * 4 + 2];
      m.setPosition(x + 0.5, y + 0.5, z + 0.5);
      this.mesh.setMatrixAt(i, m);
      // A little per-block brightness variation so flat areas do not look like plastic.
      const hash = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(z, 83492791)) >>> 0;
      c.setHex(BLOCK_COLORS[cells[i * 4 + 3]]).multiplyScalar(0.9 + (hash % 100) / 700);
      this.mesh.setColorAt(i, c);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  // ---------- picking ----------

  /** Walk a ray through the grid and return the first block it touches. */
  raycast(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): RayHit | null {
    let x = Math.floor(o.x);
    let y = Math.floor(o.y);
    let z = Math.floor(o.z);
    const sx = d.x > 0 ? 1 : -1;
    const sy = d.y > 0 ? 1 : -1;
    const sz = d.z > 0 ? 1 : -1;
    const tdx = d.x !== 0 ? Math.abs(1 / d.x) : Infinity;
    const tdy = d.y !== 0 ? Math.abs(1 / d.y) : Infinity;
    const tdz = d.z !== 0 ? Math.abs(1 / d.z) : Infinity;
    let tmx = d.x > 0 ? (x + 1 - o.x) * tdx : d.x < 0 ? (o.x - x) * tdx : Infinity;
    let tmy = d.y > 0 ? (y + 1 - o.y) * tdy : d.y < 0 ? (o.y - y) * tdy : Infinity;
    let tmz = d.z > 0 ? (z + 1 - o.z) * tdz : d.z < 0 ? (o.z - z) * tdz : Infinity;
    let px = x;
    let py = y;
    let pz = z;
    let t = 0;
    while (t <= maxDist) {
      if (this.get(x, y, z) !== AIR) return { x, y, z, px, py, pz, t };
      px = x;
      py = y;
      pz = z;
      if (tmx < tmy && tmx < tmz) {
        x += sx;
        t = tmx;
        tmx += tdx;
      } else if (tmy < tmz) {
        y += sy;
        t = tmy;
        tmy += tdy;
      } else {
        z += sz;
        t = tmz;
        tmz += tdz;
      }
    }
    return null;
  }
}
