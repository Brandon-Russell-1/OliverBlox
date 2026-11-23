import * as THREE from 'three';
import { Actor } from './actor';
import { loadModel } from './assets';
import { makeMarker, makeLabel, setLabel } from './emoji';
import { groundAt, SEA_LEVEL } from './terrain';

/** What an AI friend can set out to do. */
export type BuddyGoal = 'follow' | 'stars' | 'fight' | 'fish' | 'explore';
export const BUDDY_GOALS: BuddyGoal[] = ['follow', 'stars', 'fight', 'fish', 'explore'];

/** The AI friends: who they are and which hero they look like. */
export const BUDDIES = [
  { id: 'nova', name: 'Nova', model: 'Mage', likes: 'stars' as BuddyGoal },
  { id: 'rex', name: 'Rex', model: 'Knight', likes: 'fight' as BuddyGoal },
  { id: 'zip', name: 'Zip', model: 'Ranger', likes: 'explore' as BuddyGoal },
  { id: 'luna', name: 'Luna', model: 'Druid', likes: 'fish' as BuddyGoal },
  { id: 'max', name: 'Max', model: 'Barbarian', likes: 'fight' as BuddyGoal },
  { id: 'pip', name: 'Pip', model: 'Rogue', likes: 'stars' as BuddyGoal },
];

/** What the friends need from the rest of the game. */
export interface BuddyWorld {
  collide(pos: THREE.Vector3, radius: number): void;
  nearestStar(pos: THREE.Vector3): THREE.Vector3 | null;
  /** A friend reached a star: it is collected for the player. */
  takeStar(at: THREE.Vector3, by: string): void;
  nearestEnemy(pos: THREE.Vector3, range: number): THREE.Vector3 | null;
  hitEnemy(at: THREE.Vector3): void;
}

interface Buddy {
  id: string;
  name: string;
  group: THREE.Group;
  actor: Actor | null;
  goal: BuddyGoal;
  /** Somewhere to head for when exploring or fishing. */
  spot: THREE.Vector3;
  spotTime: number;
  swing: number;
  /** After finding a star they take a breather, so they help rather than win the game for him. */
  rest: number;
}

const WALK = 4.4;
const RUN = 8.5;

/**
 * Computer-run friends who share the world: they wander, hunt for stars, fight skeletons and fish.
 * What each one sets out to do is chosen elsewhere (by Claude, or by chance); this makes them do it.
 * They carry a robot badge so it is always clear they are not real children.
 */
export class Buddies {
  private list: Buddy[] = [];
  visible = true;

  constructor(
    scene: THREE.Scene,
    clips: Map<string, THREE.AnimationClip>,
    private readonly world: BuddyWorld,
    start: THREE.Vector3,
  ) {
    BUDDIES.forEach((def, i) => {
      const group = new THREE.Group();
      const a = (i / BUDDIES.length) * Math.PI * 2 + 1;
      group.position.set(start.x + Math.sin(a) * 9, start.y, start.z + Math.cos(a) * 9);
      const badge = makeMarker('🤖');
      const label = makeLabel();
      label.position.copy(badge.position);
      setLabel(label, def.name);
      group.add(badge, label);
      scene.add(group);
      const buddy: Buddy = { id: def.id, name: def.name, group, actor: null, goal: def.likes, spot: group.position.clone(), spotTime: 0, swing: 0, rest: 0 };
      this.list.push(buddy);
      void loadModel(`char/${def.model}.glb`).then((gltf) => {
        buddy.actor = new Actor(gltf.scene, clips, ['Idle_A', 'Walking_A', 'Running_A', 'Melee_1H_Attack_Chop', 'Cheering']);
        buddy.actor.play('Idle_A');
        group.add(buddy.actor.root);
      });
    });
  }

  setGoal(id: string, goal: string): void {
    const buddy = this.list.find((b) => b.id === id);
    if (buddy && BUDDY_GOALS.includes(goal as BuddyGoal)) {
      buddy.goal = goal as BuddyGoal;
      buddy.spotTime = 0;
    }
  }

  goalOf(id: string): BuddyGoal | '' {
    return this.list.find((b) => b.id === id)?.goal ?? '';
  }

  /** The friend closest to a point, if one is within reach. */
  nearest(pos: THREE.Vector3, reach: number): { id: string; name: string } | null {
    let best: Buddy | null = null;
    let bestDist = reach;
    for (const b of this.list) {
      const d = Math.hypot(b.group.position.x - pos.x, b.group.position.z - pos.z);
      if (d < bestDist) {
        best = b;
        bestDist = d;
      }
    }
    return best && this.visible ? { id: best.id, name: best.name } : null;
  }

  positions(): { x: number; z: number }[] {
    return this.visible ? this.list.map((b) => ({ x: b.group.position.x, z: b.group.position.z })) : [];
  }

  update(dt: number, player: THREE.Vector3, time: number): void {
    for (const b of this.list) {
      const p = b.group.position;
      b.group.visible = this.visible;
      if (!this.visible) continue;
      const toPlayer = Math.hypot(player.x - p.x, player.z - p.z);
      // Left far behind (a plane ride, a trip home): turn up nearby rather than trek for miles.
      if (toPlayer > 130) {
        const a = Math.random() * Math.PI * 2;
        p.set(player.x + Math.sin(a) * 30, 0, player.z + Math.cos(a) * 30);
      }

      // Where to go, and how close is close enough.
      let target: THREE.Vector3 | null = null;
      let stopAt = 1.5;
      let fighting = false;
      // Whatever they are doing, a skeleton right next to them gets dealt with.
      const foe = this.world.nearestEnemy(p, b.goal === 'fight' ? 45 : 6);
      if (foe) {
        target = foe;
        stopAt = 2.2;
        fighting = true;
      } else if (b.goal === 'stars' && time > b.rest) {
        target = this.world.nearestStar(p);
        if (target && Math.hypot(target.x - p.x, target.z - p.z) < 2) {
          this.world.takeStar(target, b.name);
          b.actor?.once('Cheering');
          b.swing = time + 1.5;
          b.rest = time + 30;
          target = null;
        }
      } else if (b.goal === 'explore' || b.goal === 'fish') {
        if (time > b.spotTime || Math.hypot(b.spot.x - p.x, b.spot.z - p.z) < 2) {
          b.spotTime = time + 12;
          if (b.goal === 'fish') {
            // Look around for the nearest bit of shore.
            let best = Infinity;
            for (let i = 0; i < 16; i++) {
              for (const r of [10, 22, 36, 55]) {
                const x = p.x + Math.sin((i / 16) * Math.PI * 2) * r;
                const z = p.z + Math.cos((i / 16) * Math.PI * 2) * r;
                const h = groundAt(x, z);
                if (h > -0.4 && h < 0.8 && r < best) {
                  best = r;
                  b.spot.set(x, 0, z);
                }
              }
            }
          } else {
            const a = Math.random() * Math.PI * 2;
            b.spot.set(player.x + Math.sin(a) * 35, 0, player.z + Math.cos(a) * 35);
          }
        }
        target = b.spot;
      }
      // With nothing else to do (or told to follow), stay near the player.
      if (!target) {
        target = player;
        stopAt = b.goal === 'follow' ? 4 : 9;
      }

      const dx = target.x - p.x;
      const dz = target.z - p.z;
      const dist = Math.hypot(dx, dz);
      const busy = time < b.swing;
      if (dist > stopAt && !busy) {
        const speed = dist > 14 || fighting ? RUN : WALK;
        const nx = p.x + (dx / dist) * speed * dt;
        const nz = p.z + (dz / dist) * speed * dt;
        // They keep to dry land.
        if (groundAt(nx, nz) > SEA_LEVEL - 0.7) p.set(nx, p.y, nz);
        this.world.collide(p, 0.45);
        b.actor?.play(speed > 6 ? 'Running_A' : 'Walking_A', 1.1);
      } else if (fighting && !busy) {
        // Slower than the hero, so he still does most of the fighting.
        b.swing = time + 1.8;
        b.actor?.once('Melee_1H_Attack_Chop', 1.3);
        this.world.hitEnemy(target);
      } else if (!busy) {
        b.actor?.play('Idle_A');
      }
      p.y = groundAt(p.x, p.z);
      if (dist > 0.3) {
        let turn = Math.atan2(dx, dz) - b.group.rotation.y;
        turn = Math.atan2(Math.sin(turn), Math.cos(turn));
        b.group.rotation.y += turn * Math.min(1, 9 * dt);
      }
      b.actor?.update(dt);
    }
  }
}
