import * as THREE from 'three';
import { Actor } from './actor';
import { groundAt } from './terrain';

type State = 'idle' | 'chase' | 'attack' | 'hurt' | 'dead';

interface Enemy {
  actor: Actor;
  pos: THREE.Vector3;
  hp: number;
  state: State;
  timer: number;
  heading: number;
  /** Whether the current swing has already landed (or missed). */
  swung: boolean;
}

const MAX_ENEMIES = 4;
/** Slower than the hero's walk, so walking away always works. */
const CHASE_SPEED = 3.7;
const SIGHT = 30;
const ANIMS = ['Idle_A', 'Walking_A', 'Melee_1H_Attack_Chop', 'Hit_A', 'Death_A'];

export interface EnemyContext {
  /** Enemies only appear where this says it is not a safe place. */
  isSafe(x: number, z: number): boolean;
  /** False while flying or driving: skeletons lose interest. */
  targetable: boolean;
  onHitPlayer(from: THREE.Vector3): void;
  onDefeat(at: THREE.Vector3): void;
}

/** Cartoon skeletons that wander the wilds, chase the hero and fall apart after a few bonks. */
export class Enemies {
  private list: Enemy[] = [];
  private spawnTimer = 4;
  private clearing: { pos: THREE.Vector3; radius: number } | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly models: THREE.Object3D[],
    private readonly clips: Map<string, THREE.AnimationClip>,
  ) {}

  get count(): number {
    return this.list.length;
  }

  private spawn(player: THREE.Vector3, ctx: EnemyContext): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 14;
    const x = player.x + Math.cos(angle) * dist;
    const z = player.z + Math.sin(angle) * dist;
    const y = groundAt(x, z);
    if (y < 1 || ctx.isSafe(x, z)) return;
    const tough = Math.random() < 0.3;
    const actor = new Actor(this.models[tough ? 1 : 0], this.clips, ANIMS);
    actor.root.position.set(x, y, z);
    actor.play('Idle_A');
    this.scene.add(actor.root);
    this.list.push({
      actor,
      pos: actor.root.position,
      hp: tough ? 4 : 2,
      state: 'idle',
      timer: 0,
      heading: Math.random() * Math.PI * 2,
      swung: false,
    });
  }

  private remove(i: number): void {
    this.scene.remove(this.list[i].actor.root);
    this.list.splice(i, 1);
  }

  /** Take every skeleton near a point out of the world, with no reward. */
  clearNear(pos: THREE.Vector3, radius: number): void {
    // Done at the start of the next update: this is called from inside the update loop.
    this.clearing = { pos: pos.clone(), radius };
  }

  /** The closest living skeleton within range, optionally only those ahead of `facing`. */
  nearest(pos: THREE.Vector3, range: number, facing?: number): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDist = range;
    for (const e of this.list) {
      if (e.state === 'dead') continue;
      const dx = e.pos.x - pos.x;
      const dz = e.pos.z - pos.z;
      const d = Math.hypot(dx, dz);
      if (d >= bestDist) continue;
      if (facing !== undefined && d > 0.5 && (dx * Math.sin(facing) + dz * Math.cos(facing)) / d < 0.3) continue;
      best = e.pos;
      bestDist = d;
    }
    return best;
  }

  /** Damage every skeleton within `radius` of a point. Returns how many were hit. */
  damageAt(point: THREE.Vector3, radius: number, amount: number, ctx: EnemyContext): number {
    let hits = 0;
    for (const e of this.list) {
      if (e.state === 'dead') continue;
      if (Math.hypot(e.pos.x - point.x, e.pos.z - point.z) > radius || Math.abs(e.pos.y - point.y) > 3.5) continue;
      hits++;
      e.hp -= amount;
      // Knocked back, away from the blow.
      const away = Math.atan2(e.pos.x - point.x, e.pos.z - point.z);
      e.pos.x += Math.sin(away) * 0.9;
      e.pos.z += Math.cos(away) * 0.9;
      if (e.hp <= 0) {
        e.state = 'dead';
        e.timer = 2.4;
        e.actor.once('Death_A');
        ctx.onDefeat(e.pos);
      } else {
        e.state = 'hurt';
        e.timer = e.actor.once('Hit_A', 1.4);
      }
    }
    return hits;
  }

  update(dt: number, player: THREE.Vector3, ctx: EnemyContext): void {
    if (this.clearing) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        if (this.list[i].pos.distanceTo(this.clearing.pos) < this.clearing.radius) this.remove(i);
      }
      this.clearing = null;
      this.spawnTimer = 6;
    }
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 3.5;
      if (this.list.length < MAX_ENEMIES && ctx.targetable && !ctx.isSafe(player.x, player.z)) {
        this.spawn(player, ctx);
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const dx = player.x - e.pos.x;
      const dz = player.z - e.pos.z;
      const dist = Math.hypot(dx, dz);
      e.timer -= dt;

      if (e.state === 'dead') {
        // Sink into the ground once the fall animation has played.
        if (e.timer < 1) e.pos.y -= dt * 1.5;
        if (e.timer <= 0) {
          this.remove(i);
          continue;
        }
        e.actor.update(dt);
        continue;
      }
      if (dist > 120 || ctx.isSafe(e.pos.x, e.pos.z)) {
        this.remove(i);
        continue;
      }

      const sees = ctx.targetable && dist < SIGHT && Math.abs(player.y - e.pos.y) < 6;
      if (e.state === 'hurt') {
        if (e.timer <= 0) e.state = 'idle';
      } else if (e.state === 'attack') {
        e.heading = Math.atan2(dx, dz);
        if (!e.swung && e.timer < 0.55) {
          e.swung = true;
          if (sees && dist < 3) ctx.onHitPlayer(e.pos);
        }
        if (e.timer <= -0.7) e.state = 'idle';
      } else if (sees && dist < 2.3) {
        e.state = 'attack';
        e.swung = false;
        e.timer = e.actor.once('Melee_1H_Attack_Chop');
      } else if (sees) {
        e.state = 'chase';
        e.heading = Math.atan2(dx, dz);
        const nx = e.pos.x + Math.sin(e.heading) * CHASE_SPEED * dt;
        const nz = e.pos.z + Math.cos(e.heading) * CHASE_SPEED * dt;
        // Skeletons do not follow into the sea.
        if (groundAt(nx, nz) > -0.6) e.pos.set(nx, e.pos.y, nz);
        e.actor.play('Walking_A', 1.5);
      } else {
        e.state = 'idle';
        e.actor.play('Idle_A');
      }

      e.pos.y = groundAt(e.pos.x, e.pos.z);
      let diff = e.heading - e.actor.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      e.actor.root.rotation.y += diff * Math.min(1, 8 * dt);
      e.actor.update(dt);
    }
  }
}
