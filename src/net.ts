import * as THREE from 'three';
import { Actor } from './actor';
import { loadModel, CHARACTERS } from './assets';

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
}

export type NetMessage =
  | ({ t: 's' } & PlayerState)
  | { t: 'b'; x: number; y: number; z: number; k: number }
  | { t: 'B'; list: [number, number, number, number][] }
  | { t: 'hello'; id: string }
  | { t: 'bye' };

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
  group: THREE.Group;
  actor: Actor | null;
  hero: string;
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

  set(id: string, state: PlayerState): void {
    let peer = this.map.get(id);
    if (!peer) {
      const group = new THREE.Group();
      group.position.set(state.x, state.y, state.z);
      this.scene.add(group);
      peer = { state, group, actor: null, hero: '' };
      this.map.set(id, peer);
    }
    peer.state = state;
    // Only names from the known list are ever turned into a download.
    const hero = CHARACTERS.includes(state.h) ? state.h : 'Rogue';
    if (hero !== peer.hero) {
      peer.hero = hero;
      const target = peer;
      void loadModel(`char/${hero}.glb`).then((gltf) => {
        if (target.hero !== hero) return;
        target.actor = new Actor(gltf.scene, this.clips, PEER_ANIMS);
        target.group.clear();
        target.group.add(target.actor.root);
      });
    }
  }

  remove(id: string): void {
    const peer = this.map.get(id);
    if (peer) this.scene.remove(peer.group);
    this.map.delete(id);
  }

  clear(): void {
    for (const id of [...this.map.keys()]) this.remove(id);
  }

  positions(): { x: number; z: number }[] {
    return [...this.map.values()].map((p) => ({ x: p.state.x, z: p.state.z }));
  }

  update(dt: number): void {
    for (const peer of this.map.values()) {
      const { state, group } = peer;
      const p = group.position;
      // Teleports (vehicles from the garage, going indoors) snap; ordinary movement glides.
      if (Math.hypot(state.x - p.x, state.y - p.y, state.z - p.z) > 25) p.set(state.x, state.y, state.z);
      else p.lerp(new THREE.Vector3(state.x, state.y, state.z), Math.min(1, 10 * dt));
      let diff = state.f - group.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      group.rotation.y += diff * Math.min(1, 10 * dt);
      peer.actor?.play(state.a);
      peer.actor?.update(dt);
    }
  }
}
