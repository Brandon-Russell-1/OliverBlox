import * as THREE from 'three';
import { groundAt, SEA_LEVEL } from './terrain';

/**
 * Small living things that are only there to be seen: birds wheeling overhead, butterflies over the grass
 * and fish jumping in the sea. All of them are a few flat shapes moved in code.
 */

interface Flyer {
  root: THREE.Group;
  wings: THREE.Mesh[];
  phase: number;
}

const wingShape = new THREE.BufferGeometry();
// One triangle, hinged along its inner edge at x = 0.
wingShape.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0.5, 0, 0, -0.5, 1, 0, -0.15]), 3));
wingShape.computeVertexNormals();

function makeFlyer(colour: number, size: number): Flyer {
  const root = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({ color: colour, side: THREE.DoubleSide });
  const wings = [1, -1].map((side) => {
    const wing = new THREE.Mesh(wingShape, material);
    wing.scale.set(side * size, size, size);
    root.add(wing);
    return wing;
  });
  return { root, wings, phase: Math.random() * 6 };
}

interface Flock {
  centre: THREE.Vector3;
  heading: number;
  birds: Flyer[];
}

interface Butterfly extends Flyer {
  home: THREE.Vector3;
}

const BUTTERFLY_COLOURS = [0xffd23f, 0xff7ab8, 0x7ad7ff, 0xffffff, 0xff9a3c, 0xb48cff];

export class Life {
  private readonly flocks: Flock[] = [];
  private readonly butterflies: Butterfly[] = [];
  private readonly fish: THREE.Mesh;
  private readonly fishFrom = new THREE.Vector3();
  private fishHeading = 0;
  private fishTime = 9;
  private nextFish = 4;
  private time = 0;

  constructor(
    scene: THREE.Scene,
    /** Called where a fish leaves or enters the water. */
    private readonly splash: (x: number, z: number) => void,
  ) {
    for (let f = 0; f < 3; f++) {
      const birds = Array.from({ length: 5 }, () => makeFlyer(f === 1 ? 0xffffff : 0x2f3340, 1.1));
      for (const b of birds) scene.add(b.root);
      this.flocks.push({ centre: new THREE.Vector3(f * 60 - 60, 40, f * 40), heading: f * 2.1, birds });
    }
    for (let i = 0; i < 8; i++) {
      const b = makeFlyer(BUTTERFLY_COLOURS[i % BUTTERFLY_COLOURS.length], 0.28) as Butterfly;
      b.home = new THREE.Vector3(0, -999, 0);
      scene.add(b.root);
      this.butterflies.push(b);
    }
    this.fish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), new THREE.MeshLambertMaterial({ color: 0xff8a3c }));
    this.fish.scale.set(0.45, 0.6, 1.3);
    this.fish.visible = false;
    scene.add(this.fish);
  }

  /** `night` runs from 0 (day) to 1; `outdoors` is false indoors, underground and on the moon. */
  update(dt: number, who: THREE.Vector3, night: number, outdoors: boolean): void {
    this.time += dt;
    const t = this.time;
    const day = outdoors && night < 0.6;

    // Birds: each flock drifts across the sky near him in a loose V, wings beating.
    for (const flock of this.flocks) {
      flock.heading += Math.sin(t * 0.13 + flock.heading) * 0.12 * dt;
      // Steer gently back when they have wandered far away.
      const dx = who.x - flock.centre.x;
      const dz = who.z - flock.centre.z;
      if (Math.hypot(dx, dz) > 110) {
        let diff = Math.atan2(dx, dz) - flock.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        flock.heading += diff * Math.min(1, 0.8 * dt);
      }
      flock.centre.x += Math.sin(flock.heading) * 9 * dt;
      flock.centre.z += Math.cos(flock.heading) * 9 * dt;
      const base = Math.max(groundAt(flock.centre.x, flock.centre.z), SEA_LEVEL) + 26;
      flock.centre.y += (base - flock.centre.y) * Math.min(1, 0.5 * dt);
      flock.birds.forEach((b, i) => {
        b.root.visible = day;
        if (!day) return;
        const row = Math.ceil(i / 2);
        const side = i % 2 ? 1 : -1;
        // Places in the V, turned to match the way the flock is flying.
        const back = -row * 2.6;
        const out = side * row * 2.2;
        b.root.position.set(
          flock.centre.x + Math.sin(flock.heading) * back + Math.cos(flock.heading) * out,
          flock.centre.y + Math.sin(t * 1.3 + b.phase) * 0.6,
          flock.centre.z + Math.cos(flock.heading) * back - Math.sin(flock.heading) * out,
        );
        b.root.rotation.y = flock.heading - Math.PI / 2;
        const beat = Math.sin(t * 7 + b.phase) * 0.7;
        b.wings[0].rotation.z = beat;
        b.wings[1].rotation.z = -beat;
      });
    }

    // Butterflies: each keeps to a patch of grass near him, and moves on when he does.
    for (const b of this.butterflies) {
      const far = Math.hypot(b.home.x - who.x, b.home.z - who.z);
      if (far > 34 || b.home.y < -900) {
        const a = Math.random() * Math.PI * 2;
        const d = 8 + Math.random() * 20;
        const x = who.x + Math.sin(a) * d;
        const z = who.z + Math.cos(a) * d;
        const g = groundAt(x, z);
        // Only over dry, green ground.
        b.home.set(x, g > 1.8 && g < 30 ? g : -999, z);
      }
      b.root.visible = day && b.home.y > -900;
      if (!b.root.visible) continue;
      const px = b.home.x + Math.sin(t * 0.7 + b.phase) * 2.2 + Math.sin(t * 1.9 + b.phase * 2) * 0.8;
      const pz = b.home.z + Math.cos(t * 0.6 + b.phase * 1.3) * 2.2;
      b.root.position.set(px, groundAt(px, pz) + 1.1 + Math.sin(t * 2.3 + b.phase) * 0.5, pz);
      b.root.rotation.y = t * 0.8 + b.phase;
      const beat = Math.abs(Math.sin(t * 14 + b.phase)) * 1.2;
      b.wings[0].rotation.z = beat;
      b.wings[1].rotation.z = -beat;
    }

    // A fish jumps now and then, wherever there is deep water close by.
    this.fishTime += dt;
    if (this.fishTime > 1.1) {
      this.fish.visible = false;
      this.nextFish -= dt;
      if (this.nextFish <= 0 && outdoors) {
        this.nextFish = 3 + Math.random() * 5;
        const a = Math.random() * Math.PI * 2;
        const d = 12 + Math.random() * 30;
        const x = who.x + Math.sin(a) * d;
        const z = who.z + Math.cos(a) * d;
        if (groundAt(x, z) < SEA_LEVEL - 1.2) {
          this.fishFrom.set(x, SEA_LEVEL, z);
          this.fishHeading = Math.random() * Math.PI * 2;
          this.fishTime = 0;
          this.splash(x, z);
        }
      }
    } else {
      const k = this.fishTime / 1.1;
      const x = this.fishFrom.x + Math.sin(this.fishHeading) * k * 3.2;
      const z = this.fishFrom.z + Math.cos(this.fishHeading) * k * 3.2;
      this.fish.visible = true;
      this.fish.position.set(x, SEA_LEVEL + Math.sin(k * Math.PI) * 1.9 - 0.2, z);
      this.fish.rotation.set(-Math.cos(k * Math.PI) * 1.1, this.fishHeading, 0, 'YXZ');
      if (this.fishTime + dt > 1.1) this.splash(x, z);
    }
  }
}
