import * as THREE from 'three';
import { loadModel } from './assets';

/** The moon is its own small world, far above the clouds, reached only by rocket. */
export const MOON = { x: 0, y: 3000, z: 0, radius: 150 };

/** The rocket's pieces, in the order they are built, with how high each one sits. */
export const ROCKET_PARTS = [
  { model: 'rocket_baseA', icon: '🔥', y: 0, say: 'The engine! It makes the fire.' },
  { model: 'rocket_fuelA', icon: '⛽', y: 1.6, say: 'The fuel tank!' },
  { model: 'rocket_finsA', icon: '🪽', y: 1.6, say: 'Fins, to fly straight!' },
  { model: 'rocket_sidesA', icon: '🪟', y: 2.1, say: 'The cabin, where you sit!' },
  { model: 'rocket_topA', icon: '🔺', y: 3.1, say: 'The nose cone. The rocket is ready!' },
];
const ROCKET_SCALE = 3;

/** A rocket that is put together piece by piece and can stand on its own flame. */
export class Rocket {
  readonly group = new THREE.Group();
  private readonly pieces: THREE.Object3D[] = [];
  private readonly flame: THREE.Mesh;
  private shown = 0;

  constructor(parts: number) {
    this.shown = parts;
    ROCKET_PARTS.forEach((part, i) => {
      void loadModel(`space/${part.model}.glb`).then((gltf) => {
        const piece = gltf.scene.clone(true);
        piece.scale.setScalar(ROCKET_SCALE);
        piece.position.y = part.y * ROCKET_SCALE;
        piece.traverse((o) => {
          o.castShadow = true;
        });
        piece.visible = i < this.shown;
        this.pieces[i] = piece;
        this.group.add(piece);
      });
    });
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(1.5, 7, 10), new THREE.MeshBasicMaterial({ color: 0xffa531, transparent: true, opacity: 0.9 }));
    this.flame.rotation.x = Math.PI;
    this.flame.position.y = -2.6;
    this.flame.visible = false;
    this.group.add(this.flame);
  }

  setParts(n: number): void {
    this.shown = n;
    this.pieces.forEach((piece, i) => {
      piece.visible = i < n;
    });
  }

  /** The flame flickers while the engine burns. */
  burn(on: boolean, time: number): void {
    this.flame.visible = on;
    if (on) this.flame.scale.set(1 + Math.sin(time * 47) * 0.15, 1 + Math.sin(time * 31) * 0.25, 1 + Math.cos(time * 41) * 0.15);
  }
}

// ---- the moon's ground ----

function seeded(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Crater {
  x: number;
  z: number;
  r: number;
  depth: number;
}
const CRATERS: Crater[] = [];
{
  const rnd = seeded(7);
  while (CRATERS.length < 26) {
    const a = rnd() * Math.PI * 2;
    const d = 24 + rnd() * (MOON.radius - 30);
    const r = 5 + rnd() * rnd() * 22;
    CRATERS.push({ x: Math.sin(a) * d, z: Math.cos(a) * d, r, depth: 1.2 + r * 0.16 });
  }
}
const smooth = (a: number, b: number, v: number): number => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** How high the moon's ground is, measured from the moon's own middle (not world coordinates). */
function localHeight(x: number, z: number): number {
  let h = Math.sin(x * 0.045) * Math.cos(z * 0.038) * 2.6 + Math.sin(x * 0.11 + 2) * Math.sin(z * 0.13) * 0.8;
  for (const c of CRATERS) {
    const d = Math.hypot(x - c.x, z - c.z) / c.r;
    if (d > 1.5) continue;
    // A bowl with a raised rim.
    h += d < 1 ? -c.depth * (1 - d * d) + c.depth * 0.3 * d * d : c.depth * 0.3 * (1 - smooth(1, 1.5, d));
  }
  // Level ground where the rocket lands.
  return h * smooth(8, 22, Math.hypot(x, z));
}

/** The moon's ground height at a place in the world. */
export function moonHeight(x: number, z: number): number {
  return MOON.y + localHeight(x - MOON.x, z - MOON.z);
}

interface Alien {
  root: THREE.Object3D;
  arms: THREE.Object3D[];
  home: THREE.Vector3;
  phase: number;
  greeted: boolean;
}

const ALIEN_SAYS = ['Bleep bloop! Welcome to the moon!', 'Zorp! Can you jump as high as me?', 'Meep! Have you found the shiny crystals?', 'Wibble! Is that blue ball your home?'];

/** The moon: grey hills and craters, crystals to find, a little base and some friendly aliens. */
export class Moon {
  readonly group = new THREE.Group();
  /** The rocket that brought him, waiting to take him home. */
  readonly rocket = new Rocket(ROCKET_PARTS.length);
  private readonly crystals: THREE.Object3D[] = [];
  private readonly aliens: Alien[] = [];
  private rover: THREE.Object3D | null = null;
  private readonly earth: THREE.Mesh;
  private time = 0;

  constructor(scene: THREE.Scene) {
    const size = MOON.radius * 2 + 80;
    const geometry = new THREE.PlaneGeometry(size, size, 104, 104);
    geometry.rotateX(-Math.PI / 2);
    const position = geometry.getAttribute('position');
    const colours = new Float32Array(position.count * 3);
    const rnd = seeded(3);
    for (let i = 0; i < position.count; i++) {
      const h = localHeight(position.getX(i), position.getZ(i));
      position.setY(i, h);
      // Lighter on the rims, darker in the bowls, with a little speckle.
      const shade = 0.56 + Math.max(-0.2, Math.min(0.2, h * 0.035)) + (rnd() - 0.5) * 0.06;
      colours.set([shade, shade, shade * 1.04], i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    geometry.computeVertexNormals();
    const ground = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    ground.receiveShadow = true;
    this.group.add(ground);

    // Home, hanging in the black sky.
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(46, 28, 20), new THREE.MeshBasicMaterial({ map: earthTexture(), fog: false }));
    this.earth.position.set(-150, 190, -260);
    this.group.add(this.earth);

    this.rocket.group.position.set(0, 0, 0);
    this.group.add(this.rocket.group);

    // A flag by the landing place.
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4, 6), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
    pole.position.set(10, 2, -5);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.2), new THREE.MeshLambertMaterial({ color: 0xff5a4d, side: THREE.DoubleSide }));
    cloth.position.set(10.95, 3.3, -5);
    this.group.add(pole, cloth);

    const place = (name: string, x: number, z: number, scale: number, turn = 0): Promise<THREE.Object3D> =>
      loadModel(`space/${name}.glb`).then((gltf) => {
        const o = gltf.scene.clone(true);
        o.scale.setScalar(scale);
        o.position.set(x, localHeight(x, z), z);
        o.rotation.y = turn;
        o.traverse((m) => {
          m.castShadow = true;
        });
        this.group.add(o);
        return o;
      });

    // Boulders and fallen meteors.
    const spot = seeded(11);
    for (let i = 0; i < 34; i++) {
      const a = spot() * Math.PI * 2;
      const d = 16 + spot() * (MOON.radius - 10);
      void place(['rock_largeA', 'rocks_smallA', 'meteor', 'rock_largeA'][i % 4], Math.sin(a) * d, Math.cos(a) * d, 3 + spot() * 6, spot() * 6);
    }
    // The little moon base.
    void place('hangar_roundGlass', -22, 14, 5, 0.6);
    void place('satelliteDish_large', -30, 4, 6, 1.2);
    void place('rover', 16, -16, 6).then((o) => {
      this.rover = o;
    });
    // Crystals to find, spread all over.
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 + spot() * 0.4;
      const d = 22 + spot() * (MOON.radius - 40);
      void place(i % 2 ? 'rock_crystals' : 'rock_crystalsLargeA', Math.sin(a) * d, Math.cos(a) * d, 4.5, spot() * 6).then((o) => {
        o.traverse((m) => {
          const mesh = m as THREE.Mesh;
          if (!mesh.isMesh) return;
          // Each crystal gets its own glowing copy of the material, so the rest of the rocks stay dull.
          const glow = (mesh.material as THREE.MeshLambertMaterial).clone();
          glow.emissive = new THREE.Color(0x3fd6ff);
          glow.emissiveIntensity = 0.55;
          mesh.material = glow;
        });
        this.crystals.push(o);
      });
    }
    // Friendly aliens, who hop about and wave.
    for (let i = 0; i < 5; i++) {
      const x = [12, -14, -26, 30, 4][i];
      const z = [10, -12, 20, 18, -30][i];
      void place('alien', x, z, 1.5, spot() * 6).then((root) => {
        const arms = ['armLeft', 'armRight'].map((n) => root.getObjectByName(n)).filter((o): o is THREE.Object3D => !!o);
        this.aliens.push({ root, arms, home: new THREE.Vector3(x, 0, z), phase: i * 1.7, greeted: false });
      });
    }

    this.group.position.set(MOON.x, MOON.y, MOON.z);
    this.group.visible = false;
    scene.add(this.group);
  }

  show(on: boolean): void {
    this.group.visible = on;
    if (on) for (const a of this.aliens) a.greeted = false;
  }

  /** Where the waiting rocket stands, in the world. */
  get pad(): THREE.Vector3 {
    return new THREE.Vector3(MOON.x, MOON.y, MOON.z);
  }

  /** Keep him on the moon: there is an edge, but no falling off it. */
  clamp(pos: THREE.Vector3): void {
    const dx = pos.x - MOON.x;
    const dz = pos.z - MOON.z;
    const d = Math.hypot(dx, dz);
    if (d > MOON.radius) {
      pos.x = MOON.x + (dx / d) * MOON.radius;
      pos.z = MOON.z + (dz / d) * MOON.radius;
    }
    // The rocket is solid.
    if (d < 3.4 && d > 0.001) {
      pos.x = MOON.x + (dx / d) * 3.4;
      pos.z = MOON.z + (dz / d) * 3.4;
    }
  }

  /** Put every crystal back. */
  restock(): void {
    for (const c of this.crystals) c.visible = true;
  }

  get crystalsLeft(): number {
    return this.crystals.filter((c) => c.visible).length;
  }

  /** Pick up any crystal he is touching. Returns how many. */
  collect(pos: THREE.Vector3): number {
    let n = 0;
    for (const c of this.crystals) {
      if (!c.visible) continue;
      if (Math.hypot(c.position.x + MOON.x - pos.x, c.position.z + MOON.z - pos.z) < 3) {
        c.visible = false;
        n++;
      }
    }
    return n;
  }

  /** Aliens hop and wave, the rover trundles round, the Earth turns. Returns something an alien says, now and then. */
  update(dt: number, player: THREE.Vector3): string {
    this.time += dt;
    const t = this.time;
    let said = '';
    this.earth.rotation.y = t * 0.03;
    for (const c of this.crystals) c.rotation.y += dt * 0.6;
    if (this.rover) {
      // Round and round the landing place.
      const a = t * 0.12;
      const x = Math.sin(a) * 24;
      const z = Math.cos(a) * 24;
      this.rover.position.set(x, localHeight(x, z), z);
      this.rover.rotation.y = a + Math.PI / 2;
    }
    for (const a of this.aliens) {
      // Slow, floaty hops in a small circle around home.
      const hop = (t * 0.55 + a.phase) % 1;
      const round = t * 0.25 + a.phase;
      const x = a.home.x + Math.sin(round) * 3;
      const z = a.home.z + Math.cos(round) * 3;
      const near = Math.hypot(x + MOON.x - player.x, z + MOON.z - player.z);
      a.root.position.set(x, localHeight(x, z) + 0.6 + Math.sin(hop * Math.PI) * 1.6, z);
      // They turn to look at a visitor, and wave both arms.
      const want = near < 12 ? Math.atan2(player.x - MOON.x - x, player.z - MOON.z - z) : round + Math.PI / 2;
      let diff = want - a.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.root.rotation.y += diff * Math.min(1, 5 * dt);
      a.root.scale.set(1.5, 1.5 * (1 + Math.sin(hop * Math.PI * 2) * 0.08), 1.5);
      const wave = near < 12 ? Math.sin(t * 9) * 0.6 - 1.6 : Math.sin(t * 2 + a.phase) * 0.3;
      a.arms.forEach((arm, i) => {
        arm.rotation.z = (i ? 1 : -1) * wave;
      });
      if (near < 5 && !a.greeted) {
        a.greeted = true;
        said = ALIEN_SAYS[Math.floor(a.phase * 7) % ALIEN_SAYS.length];
      }
    }
    return said;
  }
}

/** The Earth as seen from the moon: blue sea, green land, white cloud. */
function earthTexture(): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = '#2f7fe0';
    g.fillRect(0, 0, 256, 128);
    const rnd = seeded(5);
    const blobs = (colour: string, count: number, size: number): void => {
      g.fillStyle = colour;
      for (let i = 0; i < count; i++) {
        g.beginPath();
        g.ellipse(rnd() * 256, 16 + rnd() * 96, size * (0.5 + rnd()), size * (0.3 + rnd() * 0.6), rnd() * 3, 0, Math.PI * 2);
        g.fill();
      }
    };
    blobs('#3fae5a', 16, 18);
    blobs('#8ccf6a', 8, 8);
    blobs('rgba(255,255,255,0.85)', 22, 9);
    g.fillStyle = '#f4f8ff';
    g.fillRect(0, 0, 256, 7);
    g.fillRect(0, 121, 256, 7);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
