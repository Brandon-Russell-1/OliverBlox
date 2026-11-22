import * as THREE from 'three';
import { groundAt } from './terrain';

export const RED = 1;
export const ORANGE = 2;
export const YELLOW = 3;
export const GREEN = 4;
export const BLUE = 5;
export const PURPLE = 6;
export const WHITE = 7;
export const BRICK = 8;

export const BLOCK_COLORS: Record<number, number> = {
  [RED]: 0xe8413c,
  [ORANGE]: 0xff922b,
  [YELLOW]: 0xffd43b,
  [GREEN]: 0x37b24d,
  [BLUE]: 0x2b7fff,
  [PURPLE]: 0x9c5cf0,
  [WHITE]: 0xf4f6fa,
  [BRICK]: 0xb5523b,
  // More materials, picked from the builder's kit.
  9: 0x8a5a2b,
  10: 0x8d9199,
  11: 0x5fbf4a,
  12: 0xf0dc9a,
  13: 0xff8fc7,
  14: 0x2b2d33,
  15: 0x7fd4ff,
  16: 0xb6f04a,
};

/** Wood, stone, grass, sand, pink, black, sky and lime. */
export const EXTRA_BLOCKS = [9, 10, 11, 12, 13, 14, 15, 16];

/** Blocks Oliver can place, in hotbar order. */
export const HOTBAR = [RED, ORANGE, YELLOW, GREEN, BLUE, PURPLE, WHITE, BRICK];

export interface RayHit {
  /** 'block' hits can be removed; 'ground' hits can only be built on. */
  kind: 'block' | 'ground';
  x: number;
  y: number;
  z: number;
  /** The empty cell just before the hit: where a new block goes. */
  px: number;
  py: number;
  pz: number;
}

const EPS = 1e-4;

/** One-metre building blocks placed by the player anywhere in the endless world. */
export class Blocks {
  readonly map = new Map<string, number>();
  private mesh: THREE.InstancedMesh | null = null;
  private capacity = 0;
  private readonly geometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly material = new THREE.MeshLambertMaterial({ color: 0xffffff });

  constructor(private readonly scene: THREE.Scene) {}

  has(x: number, y: number, z: number): boolean {
    return this.map.has(`${x},${y},${z}`);
  }

  /** Place a block, or remove one with type 0. Returns false if nothing changed. */
  set(x: number, y: number, z: number, type: number): boolean {
    const key = `${x},${y},${z}`;
    if (type === 0) {
      if (!this.map.delete(key)) return false;
    } else {
      if (this.map.get(key) === type) return false;
      this.map.set(key, type);
    }
    this.rebuild();
    return true;
  }

  load(list: [number, number, number, number][]): void {
    this.setMany(list);
  }

  /** Change many cells with one redraw. Type 0 removes. */
  setMany(list: [number, number, number, number][]): void {
    for (const [x, y, z, t] of list) {
      if (t === 0) this.map.delete(`${x},${y},${z}`);
      else this.map.set(`${x},${y},${z}`, t);
    }
    this.rebuild();
  }

  save(): [number, number, number, number][] {
    return [...this.map].map(([key, t]) => {
      const [x, y, z] = key.split(',').map(Number);
      return [x, y, z, t];
    });
  }

  private rebuild(): void {
    const n = this.map.size;
    if (!this.mesh || n > this.capacity) {
      if (this.mesh) {
        this.scene.remove(this.mesh);
        this.mesh.dispose();
      }
      this.capacity = Math.max(256, n * 2);
      this.mesh = new THREE.InstancedMesh(this.geometry, this.material, this.capacity);
      this.mesh.frustumCulled = false;
      this.mesh.castShadow = true;
      this.mesh.receiveShadow = true;
      this.scene.add(this.mesh);
    }
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let i = 0;
    for (const [key, t] of this.map) {
      const [x, y, z] = key.split(',').map(Number);
      m.setPosition(x + 0.5, y + 0.5, z + 0.5);
      this.mesh.setMatrixAt(i, m);
      this.mesh.setColorAt(i, c.setHex(BLOCK_COLORS[t] ?? 0xffffff));
      i++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** Does an upright box with its feet at (x, y, z) overlap any block? */
  collides(x: number, y: number, z: number, hw: number, h: number): boolean {
    if (this.map.size === 0) return false;
    const x0 = Math.floor(x - hw + EPS);
    const x1 = Math.floor(x + hw - EPS);
    const y0 = Math.floor(y + EPS);
    const y1 = Math.floor(y + h - EPS);
    const z0 = Math.floor(z - hw + EPS);
    const z1 = Math.floor(z + hw - EPS);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cz = z0; cz <= z1; cz++) {
        for (let cx = x0; cx <= x1; cx++) {
          if (this.has(cx, cy, cz)) return true;
        }
      }
    }
    return false;
  }

  /** Walk a ray through the block grid and return the first block or patch of ground it meets. */
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
      if (this.has(x, y, z)) return { kind: 'block', x, y, z, px, py, pz };
      if (t > 0 && o.y + d.y * t < groundAt(o.x + d.x * t, o.z + d.z * t)) {
        return { kind: 'ground', x, y, z, px, py, pz };
      }
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
