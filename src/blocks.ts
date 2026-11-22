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

/** Roof slopes come in four directions: 20 rises toward -z, then each next one is a quarter turn on. */
export const SLOPE = 20;
export const GLASS = 24;
/** A door can be walked through. */
export const DOOR = 25;

type Shape = 'cube' | 'wedge' | 'glass' | 'door';
const shapeOf = (type: number): Shape =>
  type >= SLOPE && type < SLOPE + 4 ? 'wedge' : type === GLASS ? 'glass' : type === DOOR ? 'door' : 'cube';

/** A block cut corner to corner: full height along the -z edge, sloping down to nothing at +z. */
function wedgeGeometry(): THREE.BufferGeometry {
  const A = [-0.5, -0.5, -0.5];
  const B = [0.5, -0.5, -0.5];
  const C = [0.5, -0.5, 0.5];
  const D = [-0.5, -0.5, 0.5];
  const E = [-0.5, 0.5, -0.5];
  const F = [0.5, 0.5, -0.5];
  const faces = [A, B, C, A, C, D, A, E, F, A, F, B, E, D, C, E, C, F, A, D, E, B, F, C];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(faces.flat()), 3));
  g.computeVertexNormals();
  return g;
}

const GEOMETRY: Record<Shape, THREE.BufferGeometry> = {
  cube: new THREE.BoxGeometry(1, 1, 1),
  wedge: wedgeGeometry(),
  glass: new THREE.BoxGeometry(1, 1, 0.2),
  door: new THREE.BoxGeometry(0.9, 1, 0.16),
};
const MATERIAL: Record<Shape, THREE.Material> = {
  cube: new THREE.MeshLambertMaterial({ color: 0xffffff }),
  wedge: new THREE.MeshLambertMaterial({ color: 0xb5523b }),
  glass: new THREE.MeshLambertMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.5 }),
  door: new THREE.MeshLambertMaterial({ color: 0x7a4f2a }),
};

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
  /** One batch of instances for each shape of block. */
  private meshes: Partial<Record<Shape, THREE.InstancedMesh>> = {};

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
    const groups: Record<Shape, [number, number, number, number][]> = { cube: [], wedge: [], glass: [], door: [] };
    for (const [key, type] of this.map) {
      const [x, y, z] = key.split(',').map(Number);
      groups[shapeOf(type)].push([x, y, z, type]);
    }
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    for (const shape of Object.keys(groups) as Shape[]) {
      const list = groups[shape];
      let mesh = this.meshes[shape];
      if (!mesh || list.length > mesh.instanceMatrix.count) {
        if (mesh) {
          this.scene.remove(mesh);
          mesh.dispose();
        }
        mesh = new THREE.InstancedMesh(GEOMETRY[shape], MATERIAL[shape], Math.max(64, list.length * 2));
        mesh.frustumCulled = false;
        mesh.castShadow = shape !== 'glass';
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.meshes[shape] = mesh;
      }
      list.forEach(([x, y, z, type], i) => {
        // Slopes are turned to face one of four ways; everything else sits square.
        m.makeRotationY(shape === 'wedge' ? ((type - SLOPE) * Math.PI) / 2 : 0);
        m.setPosition(x + 0.5, y + 0.5, z + 0.5);
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, c.setHex(shape === 'cube' ? (BLOCK_COLORS[type] ?? 0xffffff) : 0xffffff));
      });
      mesh.count = list.length;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
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
          // Doors are there to be walked through.
          const type = this.map.get(`${cx},${cy},${cz}`);
          if (type !== undefined && type !== DOOR) return true;
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
