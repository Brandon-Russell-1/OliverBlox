import * as THREE from 'three';
import { Actor } from './actor';
import { loadModel, CHARACTERS } from './assets';
import { emojiTexture, faceFor, makeMarker, makeLabel, setLabel } from './emoji';
import { cleanName } from './profile';
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
}

export type NetMessage =
  | ({ t: 's' } & PlayerState)
  | { t: 'b'; x: number; y: number; z: number; k: number }
  | { t: 'B'; list: [number, number, number, number][] }
  | { t: 'hello'; id: string }
  | { t: 'bye' }
  // Shared skeletons: the host sends where they all are, guests report hits, and rewards go to everyone.
  | ({ t: 'en' } & EnemySnapshot)
  | { t: 'dmg'; id: string; n: number; x: number; z: number }
  | { t: 'hit'; to: string; x: number; z: number }
  | { t: 'won'; boss: boolean; fort: string }
  // An emoji from the fixed list, by position in it.
  | { t: 'e'; i: number };

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
  /** While an emoji they sent is showing instead of their face. */
  emoteTime: number;
}

const PEER_ANIMS = ['Idle_A', 'Walking_A', 'Running_A', 'Jump_Idle', 'Crawling', 'Crouching', 'Cheering', 'Melee_1H_Attack_Slice_Horizontal', 'Throw', 'Hit_A'];

/** The other players in the room, drawn as their chosen heroes and smoothed between updates. */
export class Peers {
  private map = new Map<string, Peer>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly clips: Map<string, THREE.AnimationClip>,
  ) {}

  get count(): number {
    return this.map.size;
  }

  ids(): string[] {
    return [...this.map.keys()];
  }

  /** The friends' faces in a row, for the room panel. */
  faces(): string {
    return [...this.map.values()].map((p) => (p.name ? `${p.face} ${p.name}` : p.face)).join(' ');
  }

  /** Where skeletons can find each friend. */
  targets(): Target[] {
    return [...this.map.entries()].map(([id, p]) => ({ id, pos: p.pos, targetable: p.state.g === 1 }));
  }

  positions(): { x: number; z: number; icon: string }[] {
    return [...this.map.values()].map((p) => ({ x: p.state.x, z: p.state.z, icon: p.face }));
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
      peer = { state, pos: new THREE.Vector3(), group, actor: null, hero: '', face, marker, label, name: '', emoteTime: 0 };
      this.map.set(id, peer);
    }
    peer.state = state;
    peer.pos.set(state.x, state.y, state.z);
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
    this.map.delete(id);
  }

  clear(): void {
    for (const id of [...this.map.keys()]) this.remove(id);
  }

  update(dt: number): void {
    for (const peer of this.map.values()) {
      const { state, group } = peer;
      const p = group.position;
      // Teleports (vehicles from the garage, going indoors) snap; ordinary movement glides.
      if (p.distanceTo(peer.pos) > 25) p.copy(peer.pos);
      else p.lerp(peer.pos, Math.min(1, 10 * dt));
      let diff = state.f - group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      group.rotation.y += diff * Math.min(1, 10 * dt);
      if (peer.emoteTime > 0) {
        peer.emoteTime -= dt;
        if (peer.emoteTime <= 0) {
          peer.marker.material.map = emojiTexture(peer.face);
          peer.marker.scale.setScalar(0.06);
        }
      }
      peer.actor?.play(state.a);
      peer.actor?.update(dt);
    }
  }
}
