import { rigHorse, sit, type Gait } from './horse';
import * as THREE from 'three';
import { Actor } from './actor';
import { loadModel, CHARACTERS } from './assets';
import { emojiTexture, faceFor, makeMarker, makeLabel, setLabel } from './emoji';
import { cleanName } from './profile';
import { Pet } from './animals';
import { HATS, HELD, makeHat } from './hats';
import type { AnimatedModel } from './assets';
import type { EnemySnapshot, Target } from './combat';

/** What each player tells the others about themselves, several times a second. */
export interface PlayerState {
  x: number;
  y: number;
  z: number;
  /** Facing, in radians. */
  f: number;
  /** Animation name. */
  a: string;
  /** Hero name. */
  h: string;
  /** 1 if skeletons may go for this player (not flying, driving, indoors or chatting). */
  g: number;
  /** The name they picked, if any. */
  n: string;
  /** The vehicle they are driving, or ''. */
  v: string;
  /** Their pet's species, or -1. */
  p: number;
  /** 1 while riding in a friend's vehicle, so their hero is not drawn standing on it. */
  r: number;
  /** The hat they are wearing, or ''. */
  k: string;
  /** What they hold: 0-2 a blade, 3 the wand, -1 nothing. */
  w: number;
  /** Whose house they are inside: a player id, or '' when outdoors. */
  i: string;
  /** 1 when they have not touched the controls for a few minutes. */
  q: number;
}

export type NetMessage =
  | ({ t: 's' } & PlayerState)
  | { t: 'b'; x: number; y: number; z: number; k: number }
  | { t: 'B'; list: [number, number, number, number][] }
  | { t: 'hello'; id: string }
  | { t: 'bye' }
  // Shared skeletons: the host sends where they all are, guests report hits, and rewards go to everyone.
  | ({ t: 'en'; c?: number; w?: number } & EnemySnapshot)
  | { t: 'dmg'; id: string; n: number; x: number; z: number }
  | { t: 'hit'; to: string; x: number; z: number }
  | { t: 'won'; boss: boolean; fort: string }
  // An emoji from the fixed list, by position in it.
  | { t: 'e'; i: number }
  // Stars and chests someone picked up, so they vanish for everyone and everyone is rewarded.
  | { t: 'got'; ids: string[] }
  // One thing handed from one player to another.
  | { t: 'give'; to: string; key: string }
  // A race started in a village, and someone finishing it.
  | { t: 'race'; x: number; z: number }
  | { t: 'racewon'; n: string }
  // A game of tag: who is "it" now and how many seconds are left.
  | { t: 'tag'; it: string; s: number }
  // How a player has furnished their house, so friends can visit it.
  | { t: 'home'; owned: string[]; layout: Record<string, [number, number, number]>; wall: number; floor: number };

/** A thin wrapper over the WebSocket to the family's relay. */
export class Net {
  private socket: WebSocket | null = null;
  onMessage: (from: string, msg: NetMessage) => void = () => {};
  onStatus: (connected: boolean) => void = () => {};

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  connect(workerUrl: string, familyCode: string, room: string): void {
    this.close();
    const url = `${workerUrl.replace(/^http/, 'ws')}/room/${encodeURIComponent(room)}?key=${encodeURIComponent(familyCode)}`;
    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onopen = () => this.onStatus(true);
    socket.onclose = () => {
      if (this.socket === socket) {
        this.socket = null;
        this.onStatus(false);
      }
    };
    socket.onmessage = (e) => {
      try {
        const msg = JSON.parse(String(e.data)) as NetMessage & { from?: string };
        this.onMessage(msg.from ?? '', msg);
      } catch {
        // Ignore anything that is not one of our messages.
      }
    };
  }

  send(msg: NetMessage): void {
    if (this.connected) this.socket?.send(JSON.stringify(msg));
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.close();
    this.onStatus(false);
  }
}

interface Peer {
  state: PlayerState;
  pos: THREE.Vector3;
  group: THREE.Group;
  actor: Actor | null;
  hero: string;
  face: string;
  marker: THREE.Sprite;
  label: THREE.Sprite;
  name: string;
  vehicleName: string;
  vehicle: THREE.Object3D | null;
  /** For a friend on horseback: what moves the horse's legs, and how far through its stride it is. */
  gait: Gait | null;
  stride: number;
  petSpecies: number;
  pet: Pet | null;
  /** The hat and held item last put on their model, so it is only redone when it changes. */
  gear: string;
  /** What the marker over their head shows now: their face, or 💤 when away. */
  badge: string;
  /** While an emoji they sent is showing instead of their face. */
  emoteTime: number;
  /** How fast they were last seen moving, to carry them along between updates. */
  vel: THREE.Vector3;
  /** Seconds since they last told us where they are. */
  since: number;
}

const PEER_ANIMS = ['Idle_A', 'Walking_A', 'Running_A', 'Jump_Idle', 'Crawling', 'Crouching', 'Cheering', 'Melee_1H_Attack_Slice_Horizontal', 'Throw', 'Hit_A'];

/** The other players in the room, drawn as their chosen heroes and smoothed between updates. */
export class Peers {
  private map = new Map<string, Peer>();
  /** Whose house this player is in ('' outdoors), set every frame by the game. */
  room = '';

  constructor(
    private readonly scene: THREE.Scene,
    private readonly clips: Map<string, THREE.AnimationClip>,
    private readonly pets: AnimatedModel[],
    /** The only vehicle models a friend's message may ask us to load. */
    private readonly vehicles: Set<string>,
  ) {}

  get count(): number {
    return this.map.size;
  }

  ids(): string[] {
    return [...this.map.keys()];
  }

  /** The friends' faces in a row, for the room panel. */
  faces(): string {
    return [...this.map.values()].map((p) => `${p.face}${p.state.q === 1 ? '💤' : ''}${p.name ? ` ${p.name}` : ''}`).join(' ');
  }

  /** Where skeletons can find each friend. */
  targets(): Target[] {
    return [...this.map.entries()].map(([id, p]) => ({ id, pos: p.pos, targetable: p.state.g === 1 }));
  }

  positions(): { x: number; z: number; icon: string }[] {
    return [...this.map.values()].map((p) => ({ x: p.state.x, z: p.state.z, icon: p.face }));
  }

  /** A friend's face and name, for the sign on their house. */
  who(id: string): { face: string; name: string } | null {
    const p = this.map.get(id);
    return p ? { face: p.face, name: p.name } : null;
  }

  /** The closest friend within reach, to hand something to. */
  nearest(pos: THREE.Vector3, reach: number): { id: string; face: string; name: string } | null {
    let best: { id: string; face: string; name: string } | null = null;
    let bestDist = reach;
    for (const [id, p] of this.map) {
      const d = Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z);
      if (d < bestDist) {
        best = { id, face: p.face, name: p.name };
        bestDist = d;
      }
    }
    return best;
  }

  /** A friend close by who is driving something we could hop into. */
  driverNear(pos: THREE.Vector3, reach: number): string | null {
    for (const [id, p] of this.map) {
      if (p.vehicleName && Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < reach) return id;
    }
    return null;
  }

  /** Where a friend is, if they are still driving. */
  driverPos(id: string): THREE.Vector3 | null {
    const p = this.map.get(id);
    return p && p.vehicleName ? p.group.position : null;
  }

  /** For tests: where each friend is drawn right now. */
  drawnDebug(): number[][] {
    return [...this.map.values()].map((p) => [p.group.position.x, p.group.position.z]);
  }

  /** For tests: whether each friend is being drawn, and what is over their head. */
  visibleDebug(): boolean[] {
    return [...this.map.values()].map((p) => p.group.visible);
  }

  badgesDebug(): string {
    return [...this.map.values()].map((p) => p.badge).join("");
  }

  /** For tests: the hat and held item shown on each friend. */
  gearDebug(): string {
    return [...this.map.values()].map((p) => p.gear).join(";");
  }

  /** For tests: what each friend is driving and which pet they have. */
  vehiclesDebug(): string[] {
    return [...this.map.values()].map((p) => (p.vehicleName || "on foot") + " pet:" + p.petSpecies);
  }

  set(id: string, state: PlayerState): void {
    let peer = this.map.get(id);
    if (!peer) {
      const group = new THREE.Group();
      group.position.set(state.x, state.y, state.z);
      const face = faceFor(id);
      const marker = makeMarker(face);
      const label = makeLabel();
      group.add(marker, label);
      this.scene.add(group);
      peer = { state, pos: new THREE.Vector3(), group, actor: null, hero: '', face, marker, label, name: '', vehicleName: '', vehicle: null, gait: null, stride: 0, petSpecies: -1, pet: null, gear: '', badge: face, emoteTime: 0, vel: new THREE.Vector3(), since: 9 };
      this.map.set(id, peer);
    }
    // Work out their speed from the last two reports, so they keep moving smoothly until the next one.
    const old = peer.state;
    const moved = Math.hypot(state.x - old.x, state.y - old.y, state.z - old.z);
    if (peer.since < 0.6 && moved < 25) peer.vel.set(state.x - old.x, state.y - old.y, state.z - old.z).divideScalar(Math.max(0.1, peer.since));
    else peer.vel.set(0, 0, 0);
    peer.since = 0;
    peer.state = state;
    peer.pos.set(state.x, state.y, state.z);
    // In a car or boat: show that instead of the hero.
    const v = this.vehicles.has(state.v) ? state.v : '';
    if (v !== peer.vehicleName) {
      peer.vehicleName = v;
      peer.vehicle?.removeFromParent();
      peer.vehicle = null;
      peer.gait = null;
      if (v) {
        const target = peer;
        const boat = v.startsWith('boat');
        const horse = v === 'horse';
        void loadModel(horse ? 'village/horse_A.gltf' : `${boat ? 'boat' : 'car'}/${v}.glb`).then((gltf) => {
          if (target.vehicleName !== v) return;
          target.vehicle = gltf.scene.clone(true);
          target.vehicle.scale.setScalar(horse ? 4.8 : 2);
          target.vehicle.position.y = horse ? 0 : boat ? -0.25 : 0.6;
          if (horse) target.gait = rigHorse(target.vehicle);
          target.group.add(target.vehicle);
        });
      }
    }
    const species = Number.isInteger(state.p) && this.pets[state.p] ? state.p : -1;
    if (species !== peer.petSpecies) {
      peer.petSpecies = species;
      peer.pet?.dispose();
      peer.pet = species >= 0 ? new Pet(this.scene, this.pets[species], peer.pos) : null;
    }
    const name = cleanName(state.n);
    if (name !== peer.name) {
      peer.name = name;
      setLabel(peer.label, name);
    }
    // Only names from the known list are ever turned into a download.
    const hero = CHARACTERS.includes(state.h) ? state.h : 'Rogue';
    if (hero !== peer.hero) {
      peer.hero = hero;
      const target = peer;
      void loadModel(`char/${hero}.glb`).then((gltf) => {
        if (target.hero !== hero) return;
        if (target.actor) target.group.remove(target.actor.root);
        target.actor = new Actor(gltf.scene, this.clips, PEER_ANIMS);
        target.group.add(target.actor.root);
        // A fresh model needs its hat and weapon put back on.
        target.gear = '';
      });
    }
  }

  /** Show an emoji over a friend's head for a few seconds. */
  emote(id: string, emoji: string): void {
    const peer = this.map.get(id);
    if (!peer) return;
    peer.marker.material.map = emojiTexture(emoji);
    peer.marker.scale.setScalar(0.1);
    peer.emoteTime = 3.5;
  }

  remove(id: string): void {
    const peer = this.map.get(id);
    if (peer) this.scene.remove(peer.group);
    peer?.pet?.dispose();
    this.map.delete(id);
  }

  clear(): void {
    for (const id of [...this.map.keys()]) this.remove(id);
  }

  update(dt: number): void {
    for (const peer of this.map.values()) {
      const { state, group } = peer;
      const p = group.position;
      peer.since += dt;
      if (peer.since < 0.25) peer.pos.addScaledVector(peer.vel, dt);
      // Teleports (vehicles from the garage, going indoors) snap; ordinary movement glides.
      if (p.distanceTo(peer.pos) > 25) p.copy(peer.pos);
      else p.lerp(peer.pos, Math.min(1, 12 * dt));
      let diff = state.f - group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      group.rotation.y += diff * Math.min(1, 10 * dt);
      if (peer.emoteTime > 0) {
        peer.emoteTime -= dt;
        if (peer.emoteTime <= 0) {
          peer.badge = '';
          peer.marker.scale.setScalar(0.06);
        }
      }
      // Asleep at the controls: a 💤 instead of their face.
      const badge = peer.emoteTime > 0 ? '' : state.q === 1 ? '💤' : peer.face;
      if (badge && badge !== peer.badge) {
        peer.badge = badge;
        peer.marker.material.map = emojiTexture(badge);
      }
      // Only draw friends who are in the same place: outdoors together, or in the same house.
      group.visible = (state.i || '') === this.room;
      // A rider is drawn sitting on the horse; in a car or boat the hero is hidden.
      const mounted = peer.vehicleName === 'horse';
      if (peer.actor) {
        peer.actor.root.visible = (peer.vehicleName === '' || mounted) && state.r !== 1;
        peer.actor.root.position.y = mounted ? 1.3 : 0;
      }
      peer.pet?.update(dt, p);
      // Dress them as they are dressed on their own screen.
      const hat = HATS.includes(state.k) ? state.k : '';
      const held = HELD[state.w] ? state.w : -1;
      const gear = `${hat}|${held}`;
      if (peer.actor && gear !== peer.gear) {
        peer.gear = gear;
        const actor = peer.actor;
        actor.wear(hat ? makeHat(hat) : null);
        actor.hold(null);
        if (held >= 0) {
          void loadModel(HELD[held]).then((gltf) => {
            if (peer.actor === actor && peer.gear === gear) actor.hold(gltf.scene.clone());
          });
        }
      }
      peer.actor?.play(state.a);
      peer.actor?.update(dt);
      if (mounted) {
        const speed = peer.since < 2.5 ? Math.hypot(peer.vel.x, peer.vel.z) : 0;
        peer.stride += speed * dt * 1.5;
        peer.gait?.(peer.stride, Math.min(1, speed / 6), false, peer.stride + performance.now() / 1000);
        if (peer.actor) sit(peer.actor.root);
      }
    }
  }
}
