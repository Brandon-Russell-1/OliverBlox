import * as THREE from 'three';
import type { AnimatedModel } from './assets';
import { groundAt } from './terrain';

interface Animal {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  idle: THREE.AnimationAction | null;
  walk: THREE.AnimationAction | null;
  heading: number;
  walking: boolean;
  timer: number;
}

const MAX_ANIMALS = 8;
const SPEED = 1.6;

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
    // Land animals only: not in the sea and not up in the snow.
    if (y < 1 || y > 40) return;

    const model = this.models[Math.floor(Math.random() * this.models.length)];
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

      let diff = a.heading - a.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      a.root.rotation.y += diff * Math.min(1, 6 * dt);
      a.mixer.update(dt);
    }
  }
}
