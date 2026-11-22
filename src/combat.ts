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

const KINDS: Kind[] = [
  // Minion: walks straight at you.
  { model: 0, hp: 2, speed: 3.7, scale: 1, reach: 2.3, ranged: false, boss: false },
  // Warrior: tougher, and backs off for a moment when badly hurt.
  { model: 1, hp: 4, speed: 3.7, scale: 1, reach: 2.3, ranged: false, boss: false },
  // Mage: keeps its distance and throws slow, dodgeable orbs.
  { model: 2, hp: 2, speed: 3.4, scale: 1, reach: 13, ranged: true, boss: false },
  // Rogue: circles around, then darts in. Quicker than a walk.
  { model: 3, hp: 2, speed: 5, scale: 1, reach: 2.3, ranged: false, boss: false },
  // The giant skeleton that guards a fort.
  { model: 1, hp: 14, speed: 3.3, scale: 2.3, reach: 4.4, ranged: false, boss: true },
];
const WARRIOR = 1;
const MAGE = 2;
const ROGUE = 3;
const BOSS = 4;

interface Enemy {
  id: string;
  actor: Actor;
  pos: THREE.Vector3;
  kindIndex: number;
  kind: Kind;
  hp: number;
  state: State;
  timer: number;
  heading: number;
  /** Whether the current swing or throw has already happened. */
  swung: boolean;
  /** Countdown to the next change of mind: wander, switch strafe side, dart in. */
  think: number;
  walking: boolean;
  side: number;
  dartTime: number;
  fleeTime: number;
  fled: boolean;
  /** Where the host last said this one is, when another player is running the skeletons. */
  net: { x: number; y: number; z: number; h: number } | null;
}

interface Orb {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
}

const MAX_ENEMIES = 5;
const SIGHT = 30;
const ANIMS = ['Idle_A', 'Walking_A', 'Running_A', 'Melee_1H_Attack_Chop', 'Throw', 'Hit_A', 'Death_A'];
const ONE_SHOT = new Set(['Melee_1H_Attack_Chop', 'Throw', 'Hit_A', 'Death_A']);
const orbGeometry = new THREE.SphereGeometry(0.4, 10, 8);
const orbMaterial = new THREE.MeshBasicMaterial({ color: 0xc86bff });

/** Someone a skeleton can go after: this player, or a friend in the same room. */
export interface Target {
  id: string;
  pos: THREE.Vector3;
  /** False while flying, driving, indoors or chatting: skeletons lose interest. */
  targetable: boolean;
}

/** Everything about the skeletons that the host sends to the other players. */
export interface EnemySnapshot {
  /** One row per skeleton: id, kind, x, y, z, heading, animation, hit points. */
  e: [string, number, number, number, number, number, number, number][];
  /** Orb positions, three numbers each. */
  o: number[];
}

export interface EnemyContext {
  /** Enemies only appear where this says it is not a safe place. */
  isSafe(x: number, z: number): boolean;
  /** A skeleton's blow landed on this target. */
  onHit(targetId: string, from: { x: number; z: number }): void;
  onDefeat(at: THREE.Vector3, boss: boolean): void;
  /** When someone else runs the skeletons: tell them we hit one. */
  sendDamage(id: string, amount: number, x: number, z: number): void;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Cartoon skeletons that wander the wilds and go for whoever is nearest.
 * When friends play together, one player (the host) runs them and everyone else sees the same ones.
 */
export class Enemies {
  /** True when another player is running the skeletons and this one only shows them. */
  remote = false;
  private list: Enemy[] = [];
  private orbs: Orb[] = [];
  private spawnTimer = 4;
  private clearing: { pos: THREE.Vector3; radius: number } | null = null;
  private nextId = 1;
  private readonly prefix = Math.random().toString(36).slice(2, 6);

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

  private add(kindIndex: number, x: number, z: number, id = `${this.prefix}${this.nextId++}`): Enemy {
    const kind = KINDS[kindIndex];
    const actor = new Actor(this.models[kind.model], this.clips, ANIMS);
    actor.root.position.set(x, groundAt(x, z), z);
    actor.root.scale.setScalar(kind.scale);
    actor.play('Idle_A');
    this.scene.add(actor.root);
    const e: Enemy = {
      id,
      actor,
      pos: actor.root.position,
      kindIndex,
      kind,
      hp: kind.hp,
      state: 'idle',
      timer: 0,
      heading: Math.random() * Math.PI * 2,
      swung: false,
      think: Math.random() * 3,
      walking: false,
      side: Math.random() < 0.5 ? 1 : -1,
      dartTime: 0,
      fleeTime: 0,
      fled: false,
      net: null,
    };
    this.list.push(e);
    return e;
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

  private hurt(e: Enemy, amount: number, x: number, z: number, ctx: EnemyContext): void {
    if (e.state === 'dead') return;
    e.hp -= amount;
    if (!e.kind.boss) {
      // Knocked back, away from the blow.
      const away = Math.atan2(e.pos.x - x, e.pos.z - z);
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

  /** Damage every skeleton within `radius` of a point. Returns how many were hit. */
  damageAt(point: { x: number; y: number; z: number }, radius: number, amount: number, ctx: EnemyContext): number {
    let hits = 0;
    for (const e of this.list) {
      if (e.state === 'dead') continue;
      // Big enemies are easier to hit.
      const r = radius + (e.kind.scale - 1) * 1.4;
      if (Math.hypot(e.pos.x - point.x, e.pos.z - point.z) > r || Math.abs(e.pos.y - point.y) > 3.5 * e.kind.scale) continue;
      hits++;
      if (this.remote) ctx.sendDamage(e.id, amount, point.x, point.z);
      else this.hurt(e, amount, point.x, point.z, ctx);
    }
    return hits;
  }

  /** A friend reports hitting one of the skeletons we run. */
  damageById(id: string, amount: number, x: number, z: number, ctx: EnemyContext): void {
    const e = this.list.find((s) => s.id === id);
    if (e && Number.isFinite(amount) && amount > 0 && amount <= 6) this.hurt(e, amount, x, z, ctx);
  }

  // ---------- sharing with friends ----------

  snapshot(): EnemySnapshot {
    return {
      e: this.list.map((e) => [
        e.id,
        e.kindIndex,
        round(e.pos.x),
        round(e.pos.y),
        round(e.pos.z),
        round(e.heading),
        Math.max(0, ANIMS.indexOf(e.actor.playing)),
        e.hp,
      ]),
      o: this.orbs.flatMap((o) => [round(o.mesh.position.x), round(o.mesh.position.y), round(o.mesh.position.z)]),
    };
  }

  /** Show the skeletons exactly as the host has them. */
  apply(snap: EnemySnapshot): void {
    if (!Array.isArray(snap.e) || !Array.isArray(snap.o)) return;
    const seen = new Set<string>();
    for (const row of snap.e.slice(0, 12)) {
      const [id, kindIndex, x, y, z, h, anim, hp] = row;
      if (typeof id !== 'string' || !KINDS[kindIndex] || ![x, y, z, h].every(Number.isFinite)) continue;
      seen.add(id);
      const e = this.list.find((s) => s.id === id) ?? this.add(kindIndex, x, z, id);
      e.net = { x, y, z, h };
      e.hp = hp;
      const name = ANIMS[anim] ?? 'Idle_A';
      if (e.actor.playing !== name) {
        if (ONE_SHOT.has(name)) e.actor.once(name);
        else e.actor.play(name);
      }
      // Kept sensible in case this player has to take over running them.
      e.state = name === 'Death_A' ? 'dead' : 'idle';
      if (e.state === 'dead' && e.timer <= 0) e.timer = 2;
    }
    for (let i = this.list.length - 1; i >= 0; i--) {
      if (!seen.has(this.list[i].id)) this.remove(i);
    }
    const n = Math.min(12, Math.floor(snap.o.length / 3));
    while (this.orbs.length > n) this.scene.remove((this.orbs.pop() as Orb).mesh);
    while (this.orbs.length < n) {
      const mesh = new THREE.Mesh(orbGeometry, orbMaterial);
      this.scene.add(mesh);
      this.orbs.push({ mesh, vel: new THREE.Vector3(), life: 3 });
    }
    for (let i = 0; i < n; i++) this.orbs[i].mesh.position.set(snap.o[i * 3], snap.o[i * 3 + 1], snap.o[i * 3 + 2]);
  }

  // ---------- behaviour ----------

  private step(e: Enemy, heading: number, speed: number, dt: number): void {
    e.heading = heading;
    const nx = e.pos.x + Math.sin(heading) * speed * dt;
    const nz = e.pos.z + Math.cos(heading) * speed * dt;
    // Skeletons stay out of the sea.
    if (groundAt(nx, nz) > -0.6) e.pos.set(nx, e.pos.y, nz);
    if (speed > 4.5) e.actor.play('Running_A');
    else e.actor.play('Walking_A', Math.max(0.6, speed / 2.6) / e.kind.scale);
  }

  /** Decide what one skeleton does this frame. `t` is the player it has its eye on, if any. */
  private think(e: Enemy, t: Target | null, dist: number, dx: number, dz: number, dt: number, ctx: EnemyContext): void {
    const toward = Math.atan2(dx, dz);
    e.think -= dt;

    if (e.state === 'hurt') {
      if (e.timer <= 0) {
        e.state = 'idle';
        // A warrior down to its last hit point loses its nerve, once.
        if (e.kindIndex === WARRIOR && e.hp === 1 && !e.fled) {
          e.fled = true;
          e.fleeTime = 2.5;
        }
      }
      return;
    }
    if (e.state === 'attack') {
      if (t) e.heading = toward;
      if (!e.swung && e.timer < 0.55) {
        e.swung = true;
        if (e.kind.ranged && t) {
          const mesh = new THREE.Mesh(orbGeometry, orbMaterial);
          mesh.position.copy(e.pos).setY(e.pos.y + 1.6);
          const aim = new THREE.Vector3(dx, t.pos.y + 1.2 - mesh.position.y, dz).normalize();
          this.scene.add(mesh);
          this.orbs.push({ mesh, vel: aim.multiplyScalar(9), life: 3 });
        } else if (t && dist < e.kind.reach + 0.8) {
          ctx.onHit(t.id, e.pos);
        }
      }
      if (e.timer <= (e.kind.ranged ? -2 : -0.7)) e.state = 'idle';
      return;
    }

    if (!t) {
      // Nobody in sight: amble about instead of standing like a statue.
      if (e.think <= 0) {
        e.walking = !e.walking;
        e.think = 2 + Math.random() * 4;
        if (e.walking) e.heading = Math.random() * Math.PI * 2;
      }
      e.state = 'idle';
      if (e.walking && !e.kind.boss) {
        const ahead = { x: e.pos.x + Math.sin(e.heading) * 3, z: e.pos.z + Math.cos(e.heading) * 3 };
        if (ctx.isSafe(ahead.x, ahead.z)) e.heading += Math.PI;
        this.step(e, e.heading, 1.4, dt);
      } else {
        e.actor.play('Idle_A');
      }
      return;
    }

    e.state = 'chase';
    if (e.fleeTime > 0) {
      e.fleeTime -= dt;
      this.step(e, toward + Math.PI, e.kind.speed * 1.2, dt);
      return;
    }
    if (e.kindIndex === MAGE && dist < 7) {
      // Too close for comfort: back away to throwing distance.
      this.step(e, toward + Math.PI, e.kind.speed, dt);
      return;
    }
    if (dist < e.kind.reach) {
      e.state = 'attack';
      e.swung = false;
      e.heading = toward;
      e.timer = e.actor.once(e.kind.ranged ? 'Throw' : 'Melee_1H_Attack_Chop');
      return;
    }
    if (e.kindIndex === ROGUE) {
      // Circle at arm's length, swapping sides, then dart in for a quick strike.
      if (e.think <= 0) {
        e.think = 1.6 + Math.random() * 1.6;
        if (Math.random() < 0.45) e.dartTime = 1.3;
        else e.side = -e.side;
      }
      if (e.dartTime > 0) {
        e.dartTime -= dt;
        this.step(e, toward, e.kind.speed * 1.25, dt);
      } else if (dist < 9) {
        // Mostly sideways, drifting in or out to hold about six metres.
        this.step(e, toward + e.side * (dist < 5 ? 1.9 : 1.25), e.kind.speed * 0.8, dt);
      } else {
        this.step(e, toward, e.kind.speed, dt);
      }
      return;
    }
    this.step(e, toward, e.kind.speed, dt);
  }

  update(dt: number, targets: Target[], ctx: EnemyContext): void {
    if (this.remote) {
      // Someone else is in charge: glide each skeleton to where they say it is.
      for (const e of this.list) {
        if (e.net) {
          e.pos.lerp(new THREE.Vector3(e.net.x, e.net.y, e.net.z), Math.min(1, 10 * dt));
          let diff = e.net.h - e.actor.root.rotation.y;
          diff = Math.atan2(Math.sin(diff), Math.cos(diff));
          e.actor.root.rotation.y += diff * Math.min(1, 10 * dt);
        }
        e.actor.update(dt);
      }
      return;
    }

    if (this.clearing) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        if (this.list[i].pos.distanceTo(this.clearing.pos) < this.clearing.radius) this.remove(i);
      }
      this.clearing = null;
      this.spawnTimer = 6;
    }

    const awake = targets.filter((t) => t.targetable);
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 3.5;
      // Appear near a random player who is out in the wilds.
      const wild = awake.filter((t) => !ctx.isSafe(t.pos.x, t.pos.z));
      if (this.list.length < MAX_ENEMIES && wild.length > 0) {
        const t = wild[Math.floor(Math.random() * wild.length)];
        const angle = Math.random() * Math.PI * 2;
        const dist = 20 + Math.random() * 14;
        const x = t.pos.x + Math.cos(angle) * dist;
        const z = t.pos.z + Math.sin(angle) * dist;
        if (groundAt(x, z) >= 1 && !ctx.isSafe(x, z)) {
          const roll = Math.random();
          this.add(roll < 0.4 ? 0 : roll < 0.6 ? WARRIOR : roll < 0.82 ? ROGUE : MAGE, x, z);
        }
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      e.timer -= dt;
      if (e.state === 'dead') {
        // Sink into the ground once the fall animation has played.
        if (e.timer < 1) e.pos.y -= dt * 1.5 * e.kind.scale;
        if (e.timer <= 0) this.remove(i);
        else e.actor.update(dt);
        continue;
      }

      // Everyone's distance matters for tidying up; only players who can be fought are chased.
      let nearestAny = Infinity;
      for (const t of targets) nearestAny = Math.min(nearestAny, Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z));
      if (nearestAny > 120 || ctx.isSafe(e.pos.x, e.pos.z)) {
        this.remove(i);
        continue;
      }
      let target: Target | null = null;
      let dist = SIGHT;
      for (const t of awake) {
        const d = Math.hypot(t.pos.x - e.pos.x, t.pos.z - e.pos.z);
        // Hills should not hide a player; only someone far overhead (flying) is out of sight.
        if (d < dist && Math.abs(t.pos.y - e.pos.y) < 14) {
          target = t;
          dist = d;
        }
      }
      const dx = target ? target.pos.x - e.pos.x : 0;
      const dz = target ? target.pos.z - e.pos.z : 0;
      this.think(e, target, dist, dx, dz, dt, ctx);

      // Keep a little space between skeletons so they surround rather than pile up.
      for (const other of this.list) {
        if (other === e || other.state === 'dead') continue;
        const ox = e.pos.x - other.pos.x;
        const oz = e.pos.z - other.pos.z;
        const d = Math.hypot(ox, oz);
        const min = 1.5 * Math.max(e.kind.scale, other.kind.scale);
        if (d > 0.01 && d < min) {
          e.pos.x += (ox / d) * (min - d) * 0.5;
          e.pos.z += (oz / d) * (min - d) * 0.5;
        }
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
      const struck = awake.find(
        (t) => Math.hypot(p.x - t.pos.x, p.z - t.pos.z) < 1.2 && p.y > t.pos.y && p.y < t.pos.y + 2.6,
      );
      if (struck) ctx.onHit(struck.id, p);
      if (struck || o.life <= 0 || p.y < groundAt(p.x, p.z)) {
        this.scene.remove(o.mesh);
        this.orbs.splice(i, 1);
      }
    }
  }
}
