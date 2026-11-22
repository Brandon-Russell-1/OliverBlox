import * as THREE from 'three';
import { Actor } from './actor';
import { groundAt } from './terrain';

type State = 'idle' | 'chase' | 'attack' | 'hurt' | 'dead';

interface Kind {
  /** Index into the skeleton models: minion, warrior, mage, rogue. */
  model: number;
  hp: number;
  speed: number;
  scale: number;
  /** How close it comes before attacking. */
  reach: number;
  ranged: boolean;
  boss: boolean;
}

const MINION: Kind = { model: 0, hp: 2, speed: 3.7, scale: 1, reach: 2.3, ranged: false, boss: false };
const WARRIOR: Kind = { model: 1, hp: 4, speed: 3.7, scale: 1, reach: 2.3, ranged: false, boss: false };
/** Stands back and throws slow, dodgeable orbs. */
const MAGE: Kind = { model: 2, hp: 2, speed: 3.2, scale: 1, reach: 13, ranged: true, boss: false };
/** Quicker than a walk, so he has to run or fight. */
const ROGUE: Kind = { model: 3, hp: 2, speed: 5, scale: 1, reach: 2.3, ranged: false, boss: false };
/** The giant skeleton that guards a fort. */
const BOSS: Kind = { model: 1, hp: 14, speed: 3.3, scale: 2.3, reach: 4.4, ranged: false, boss: true };

interface Enemy {
  actor: Actor;
  pos: THREE.Vector3;
  kind: Kind;
  hp: number;
  state: State;
  timer: number;
  heading: number;
  /** Whether the current swing or throw has already happened. */
  swung: boolean;
}

interface Orb {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

const MAX_ENEMIES = 4;
const SIGHT = 30;
const ANIMS = ['Idle_A', 'Walking_A', 'Running_A', 'Melee_1H_Attack_Chop', 'Throw', 'Hit_A', 'Death_A'];
const orbGeometry = new THREE.SphereGeometry(0.4, 10, 8);
const orbMaterial = new THREE.MeshBasicMaterial({ color: 0xc86bff });

export interface EnemyContext {
  /** Enemies only appear where this says it is not a safe place. */
  isSafe(x: number, z: number): boolean;
  /** False while flying, driving or indoors: skeletons lose interest. */
  targetable: boolean;
  onHitPlayer(from: THREE.Vector3): void;
  onDefeat(at: THREE.Vector3, boss: boolean): void;
}

/** Cartoon skeletons that wander the wilds, chase the hero and fall apart after a few bonks. */
export class Enemies {
  private list: Enemy[] = [];
  private orbs: Orb[] = [];
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

  get bossAlive(): boolean {
    return this.list.some((e) => e.kind.boss && e.state !== 'dead');
  }

  private add(kind: Kind, x: number, z: number): void {
    const actor = new Actor(this.models[kind.model], this.clips, ANIMS);
    actor.root.position.set(x, groundAt(x, z), z);
    actor.root.scale.setScalar(kind.scale);
    actor.play('Idle_A');
    this.scene.add(actor.root);
    this.list.push({
      actor,
      pos: actor.root.position,
      kind,
      hp: kind.hp,
      state: 'idle',
      timer: 0,
      heading: Math.random() * Math.PI * 2,
      swung: false,
    });
  }

  private spawn(player: THREE.Vector3, ctx: EnemyContext): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 14;
    const x = player.x + Math.cos(angle) * dist;
    const z = player.z + Math.sin(angle) * dist;
    if (groundAt(x, z) < 1 || ctx.isSafe(x, z)) return;
    const roll = Math.random();
    this.add(roll < 0.45 ? MINION : roll < 0.65 ? WARRIOR : roll < 0.85 ? ROGUE : MAGE, x, z);
  }

  /** Put the giant skeleton at a fort. */
  spawnBoss(x: number, z: number): void {
    if (!this.bossAlive) this.add(BOSS, x, z);
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

  /** The closest living skeleton within range. */
  nearest(pos: THREE.Vector3, range: number): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestDist = range;
    for (const e of this.list) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < bestDist) {
        best = e.pos;
        bestDist = d;
      }
    }
    return best;
  }

  /** Damage every skeleton within `radius` of a point. Returns how many were hit. */
  damageAt(point: THREE.Vector3, radius: number, amount: number, ctx: EnemyContext): number {
    let hits = 0;
    for (const e of this.list) {
      if (e.state === 'dead') continue;
      // Big enemies are easier to hit.
      const r = radius + (e.kind.scale - 1) * 1.4;
      if (Math.hypot(e.pos.x - point.x, e.pos.z - point.z) > r || Math.abs(e.pos.y - point.y) > 3.5 * e.kind.scale) continue;
      hits++;
      e.hp -= amount;
      if (!e.kind.boss) {
        // Knocked back, away from the blow.
        const away = Math.atan2(e.pos.x - point.x, e.pos.z - point.z);
        e.pos.x += Math.sin(away) * 0.9;
        e.pos.z += Math.cos(away) * 0.9;
      }
      if (e.hp <= 0) {
        e.state = 'dead';
        e.timer = 2.4;
        e.actor.once('Death_A');
        ctx.onDefeat(e.pos, e.kind.boss);
      } else if (!e.kind.boss || e.state !== 'attack') {
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
        if (e.timer < 1) e.pos.y -= dt * 1.5 * e.kind.scale;
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
          if (e.kind.ranged) {
            const mesh = new THREE.Mesh(orbGeometry, orbMaterial);
            mesh.position.copy(e.pos).setY(e.pos.y + 1.6);
            const aim = new THREE.Vector3(dx, player.y + 1.2 - mesh.position.y, dz).normalize();
            this.scene.add(mesh);
            this.orbs.push({ mesh, vel: aim.multiplyScalar(9), life: 3 });
          } else if (sees && dist < e.kind.reach + 0.8) {
            ctx.onHitPlayer(e.pos);
          }
        }
        if (e.timer <= (e.kind.ranged ? -2 : -0.7)) e.state = 'idle';
      } else if (sees && dist < e.kind.reach) {
        e.state = 'attack';
        e.swung = false;
        e.timer = e.actor.once(e.kind.ranged ? 'Throw' : 'Melee_1H_Attack_Chop');
      } else if (sees) {
        e.state = 'chase';
        e.heading = Math.atan2(dx, dz);
        const nx = e.pos.x + Math.sin(e.heading) * e.kind.speed * dt;
        const nz = e.pos.z + Math.cos(e.heading) * e.kind.speed * dt;
        // Skeletons do not follow into the sea.
        if (groundAt(nx, nz) > -0.6) e.pos.set(nx, e.pos.y, nz);
        if (e.kind.speed > 4.5) e.actor.play('Running_A');
        else e.actor.play('Walking_A', 1.5 / e.kind.scale);
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

    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      const p = o.mesh.position;
      p.addScaledVector(o.vel, dt);
      o.life -= dt;
      const hit =
        ctx.targetable && Math.hypot(p.x - player.x, p.z - player.z) < 1.2 && p.y > player.y && p.y < player.y + 2.6;
      if (hit) ctx.onHitPlayer(p);
      if (hit || o.life <= 0 || p.y < groundAt(p.x, p.z)) {
        this.scene.remove(o.mesh);
        this.orbs.splice(i, 1);
      }
    }
  }
}
