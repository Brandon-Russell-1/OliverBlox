import * as THREE from 'three';
import { PETS, type AnimatedModel } from './assets';
import { groundAt, SEA_LEVEL } from './terrain';

export interface Animal {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction | null;
  walk: THREE.AnimationAction | null;
  /** Index into the animal models, so a befriended animal can be recreated as a pet. */
  species: number;
  heading: number;
  walking: boolean;
  timer: number;
}

const MAX_ANIMALS = 10;
/** Animals that only live in the cold, high places, and ones that only live by the water. */
const COLD = ['penguin', 'polar'].map((n) => PETS.indexOf(n));
const SHORE = ['crab', 'beaver'].map((n) => PETS.indexOf(n));
const SPEED = 1.6;

function turnToward(root: THREE.Object3D, heading: number, rate: number): void {
  let diff = heading - root.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  root.rotation.y += diff * Math.min(1, rate);
}

/** Friendly animals that wander near the player and fade away when left far behind. */
export class Animals {
  private list: Animal[] = [];
  private spawnTimer = 0;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly models: AnimatedModel[],
  ) {}

  private spawn(player: THREE.Vector3): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 28 + Math.random() * 40;
    const x = player.x + Math.cos(angle) * dist;
    const z = player.z + Math.sin(angle) * dist;
    const y = groundAt(x, z);
    // Land animals only: not in the sea. Each kind keeps to where it belongs.
    if (y < 0.6 || y > 70) return;
    const cold = y > 30;
    const shore = y < 2.2;
    const fits = this.models.map((_, i) => i).filter((i) => (cold ? COLD.includes(i) : shore ? SHORE.includes(i) : !COLD.includes(i) && !SHORE.includes(i)));
    if (fits.length === 0) return;
    const species = fits[Math.floor(Math.random() * fits.length)];
    const model = this.models[species];
    const root = model.scene.clone(true);
    root.position.set(x, y, z);
    const mixer = new THREE.AnimationMixer(root);
    const action = (name: string): THREE.AnimationAction | null => {
      const clip = model.clips.find((c) => c.name === name);
      return clip ? mixer.clipAction(clip) : null;
    };
    const a: Animal = {
      root,
      mixer,
      idle: action('idle'),
      walk: action('walk'),
      species,
      heading: Math.random() * Math.PI * 2,
      walking: false,
      timer: 1 + Math.random() * 3,
    };
    a.idle?.play();
    root.rotation.y = a.heading;
    this.scene.add(root);
    this.list.push(a);
  }

  private setWalking(a: Animal, walking: boolean): void {
    if (a.walking === walking) return;
    a.walking = walking;
    const from = walking ? a.idle : a.walk;
    const to = walking ? a.walk : a.idle;
    from?.fadeOut(0.25);
    to?.reset().fadeIn(0.25).play();
  }

  /** The closest wild animal within reach, if any. */
  nearest(pos: THREE.Vector3, range: number): Animal | null {
    let best: Animal | null = null;
    let bestDist = range;
    for (const a of this.list) {
      const d = Math.hypot(a.root.position.x - pos.x, a.root.position.z - pos.z);
      if (d < bestDist) {
        best = a;
        bestDist = d;
      }
    }
    return best;
  }

  /** Take an animal out of the wild so it can become a pet. Returns its species. */
  adopt(a: Animal): number {
    const i = this.list.indexOf(a);
    if (i >= 0) this.list.splice(i, 1);
    this.scene.remove(a.root);
    return a.species;
  }

  update(dt: number, player: THREE.Vector3): void {
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && this.list.length < MAX_ANIMALS) {
      this.spawnTimer = 1.2;
      this.spawn(player);
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      const p = a.root.position;
      const dist = Math.hypot(p.x - player.x, p.z - player.z);
      if (dist > 120) {
        this.scene.remove(a.root);
        this.list.splice(i, 1);
        continue;
      }

      a.timer -= dt;
      if (dist < 4.5) {
        // Stop and look at the player when they come close.
        this.setWalking(a, false);
        a.heading = Math.atan2(player.x - p.x, player.z - p.z);
        a.timer = 1.5;
      } else if (a.timer <= 0) {
        a.timer = 2 + Math.random() * 4;
        if (!a.walking) a.heading = Math.random() * Math.PI * 2;
        this.setWalking(a, !a.walking);
      }

      if (a.walking) {
        const nx = p.x + Math.sin(a.heading) * SPEED * dt;
        const nz = p.z + Math.cos(a.heading) * SPEED * dt;
        if (groundAt(nx, nz) < 0.8) a.heading += Math.PI;
        else p.set(nx, p.y, nz);
      }
      p.y = groundAt(p.x, p.z);
      turnToward(a.root, a.heading, 6 * dt);
      a.mixer.update(dt);
    }
  }
}

/** A befriended animal that trots after the hero wherever he goes. */
export class Pet {
  private readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current = '';

  constructor(
    private readonly scene: THREE.Scene,
    model: AnimatedModel,
    at: THREE.Vector3,
  ) {
    this.root = model.scene.clone(true);
    // Beside the hero, not on top of them.
    this.root.position.set(at.x + 2.2, at.y, at.z + 1.2);
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const name of ['idle', 'walk', 'run']) {
      const clip = model.clips.find((c) => c.name === name);
      if (clip) this.actions.set(name, this.mixer.clipAction(clip));
    }
    this.play('idle');
    scene.add(this.root);
  }

  private play(name: string): void {
    const next = this.actions.get(name) ?? this.actions.get('walk');
    if (!next || name === this.current) return;
    this.actions.get(this.current)?.fadeOut(0.2);
    next.reset().fadeIn(0.2).play();
    this.current = name;
  }

  update(dt: number, target: THREE.Vector3): void {
    const p = this.root.position;
    let dx = target.x - p.x;
    let dz = target.z - p.z;
    let dist = Math.hypot(dx, dz);
    // Left far behind (a fast car, a long flight): catch up in one hop.
    if (dist > 60) {
      p.set(target.x - (dx / dist) * 5, 0, target.z - (dz / dist) * 5);
      dx = target.x - p.x;
      dz = target.z - p.z;
      dist = 5;
    }

    if (dist < 1.6) {
      // Too close: shuffle out of the way rather than stand inside the hero.
      const away = dist > 0.05 ? Math.atan2(-dx, -dz) : 1;
      p.x += Math.sin(away) * 2.5 * dt;
      p.z += Math.cos(away) * 2.5 * dt;
      this.play('walk');
    } else if (dist > 3.5) {
      const speed = Math.min(20, (dist - 2.5) * 2.2);
      p.x += (dx / dist) * speed * dt;
      p.z += (dz / dist) * speed * dt;
      turnToward(this.root, Math.atan2(dx, dz), 10 * dt);
      this.play(speed > 4.5 ? 'run' : 'walk');
    } else {
      this.play('idle');
    }
    // Paddle at the surface instead of walking along the seabed.
    p.y = Math.max(groundAt(p.x, p.z), SEA_LEVEL - 0.5);
    this.mixer.update(dt);
  }

  get position(): THREE.Vector3 {
    return this.root.position;
  }

  dispose(): void {
    this.scene.remove(this.root);
  }
}
