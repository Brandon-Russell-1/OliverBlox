import * as THREE from 'three';
import { loadModel } from './assets';

/**
 * The inside of the player's house. The village buildings are solid models, so going through
 * the door moves the hero to this room, kept high above the world out of sight.
 */
export const ROOM = { x: 0, y: 600, z: 0, halfX: 8, halfZ: 6, height: 7 };

/** Where a piece of furniture stands: x, z and quarter turns. */
export type Spot = [number, number, number];

/**
 * Each piece: where it starts, and the models that make it up with their offsets from that spot.
 * The rug and bed come with the house; the rest are bought at the market.
 */
const FURNITURE: Record<string, { at: Spot; parts: [string, number, number, number][] }> = {
  rug: { at: [0, 0, 0], parts: [['rug_rectangle_A', 0, 0, 0]] },
  bed: { at: [-6.2, -3.6, 0], parts: [['bed_single_A', 0, 0, 0]] },
  cabinet: { at: [-3.4, -5, 0], parts: [['cabinet_medium_decorated', 0, 0, 0]] },
  shelf: { at: [1.5, -5.3, 0], parts: [['shelf_B_large_decorated', 0, 0, 0]] },
  table: {
    at: [4.4, 2, 0],
    parts: [
      ['table_medium', 0, 0, 0],
      ['chair_A_wood', 0, 2, 2],
      ['chair_A_wood', 2, 0, 3],
    ],
  },
  couch: { at: [-5, 4.2, 2], parts: [['couch_pillows', 0, 0, 0]] },
  lamp: { at: [6.6, -4.8, 0], parts: [['lamp_standing', 0, 0, 0]] },
};
const INCLUDED = ['rug', 'bed'];
const SCALE = 1.25;
export const WALL_COLOURS = [0xf3e2c0, 0xbfe3ff, 0xc9f5d2, 0xffd6e7, 0xe5d8ff, 0xfff3b0];
export const FLOOR_COLOURS = [0xb98552, 0x8d6748, 0xd9c2a3, 0x7c8a99, 0xa8c686];

export class Home {
  private readonly group = new THREE.Group();
  private readonly pieces = new Map<string, THREE.Group>();
  private readonly walls: THREE.MeshLambertMaterial;
  private readonly floor: THREE.MeshLambertMaterial;
  private selected = '';
  private readonly hinge = new THREE.Group();

  constructor(scene: THREE.Scene) {
    const { halfX, halfZ, height } = ROOM;
    this.walls = new THREE.MeshLambertMaterial({ color: WALL_COLOURS[0], side: THREE.BackSide });
    this.floor = new THREE.MeshLambertMaterial({ color: FLOOR_COLOURS[0] });
    // A box seen from the inside makes the walls and ceiling.
    const box = new THREE.Mesh(new THREE.BoxGeometry(halfX * 2, height, halfZ * 2), this.walls);
    box.position.y = height / 2;
    const boards = new THREE.Mesh(new THREE.PlaneGeometry(halfX * 2, halfZ * 2), this.floor);
    boards.rotation.x = -Math.PI / 2;
    boards.position.y = 0.01;
    boards.receiveShadow = true;
    // The way out, on the +z wall.
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.6, 0.2), new THREE.MeshLambertMaterial({ color: 0x7a4f2a }));
    // Hinged on one edge, so it can swing.
    door.position.set(1.1, 1.8, 0);
    this.hinge.position.set(-1.1, 0, halfZ - 0.1);
    this.hinge.add(door);
    const doorway = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 3.6), new THREE.MeshBasicMaterial({ color: 0x9fd4ff }));
    doorway.position.set(0, 1.8, halfZ - 0.02);
    doorway.rotation.y = Math.PI;
    const light = new THREE.PointLight(0xfff0d0, 60, 30);
    light.position.set(0, height - 1, 0);
    this.group.add(box, boards, this.hinge, doorway, light);
    this.group.position.set(ROOM.x, ROOM.y, ROOM.z);
    this.group.visible = false;
    scene.add(this.group);
  }

  /**
   * Show or hide the room with whatever furniture is owned, each piece where it was last left.
   * Models download the first time they are needed.
   */
  show(on: boolean, owned: Set<string>, layout: Record<string, Spot>): void {
    this.group.visible = on;
    this.select('');
    if (!on) return;
    for (const key of [...INCLUDED, ...owned]) {
      const def = FURNITURE[key];
      if (this.pieces.has(key) || !def) continue;
      const piece = new THREE.Group();
      const [x, z, turns] = layout[key] ?? def.at;
      piece.position.set(x, 0, z);
      piece.rotation.y = (turns * Math.PI) / 2;
      piece.userData.turns = turns;
      this.pieces.set(key, piece);
      this.group.add(piece);
      for (const [name, dx, dz, turn] of def.parts) {
        void loadModel(`home/${name}.gltf`).then((gltf) => {
          const item = gltf.scene.clone(true);
          item.position.set(dx, 0, dz);
          item.rotation.y = (turn * Math.PI) / 2;
          item.scale.setScalar(SCALE);
          piece.add(item);
        });
      }
    }
  }

  setColours(wall: number, floor: number): void {
    this.walls.color.setHex(WALL_COLOURS[wall % WALL_COLOURS.length]);
    this.floor.color.setHex(FLOOR_COLOURS[floor % FLOOR_COLOURS.length]);
  }

  /** Where every piece stands now, to be saved. */
  layout(): Record<string, Spot> {
    const out: Record<string, Spot> = {};
    for (const [key, piece] of this.pieces) {
      out[key] = [+piece.position.x.toFixed(2), +piece.position.z.toFixed(2), piece.userData.turns as number];
    }
    return out;
  }

  /** Where a line from the camera meets the floor, in the room's own coordinates. */
  floorPoint(origin: THREE.Vector3, dir: THREE.Vector3): { x: number; z: number } | null {
    if (dir.y >= -0.01) return null;
    const t = (ROOM.y - origin.y) / dir.y;
    return { x: origin.x + dir.x * t - ROOM.x, z: origin.z + dir.z * t - ROOM.z };
  }

  /**
   * A tap on the floor while arranging. Tapping a piece picks it up; tapping it again turns it;
   * tapping anywhere else puts the picked-up piece there. Returns what happened, for the sound.
   */
  tap(x: number, z: number): 'pick' | 'turn' | 'move' | null {
    let hit = '';
    let best = 2.2;
    for (const [key, piece] of this.pieces) {
      // The rug lies under everything, so it only counts when nothing else is near.
      const d = Math.hypot(piece.position.x - x, piece.position.z - z) + (key === 'rug' ? 1.4 : 0);
      if (d < best) {
        best = d;
        hit = key;
      }
    }
    const held = this.pieces.get(this.selected);
    if (held && hit === this.selected) {
      held.userData.turns = ((held.userData.turns as number) + 1) % 4;
      held.rotation.y = ((held.userData.turns as number) * Math.PI) / 2;
      return 'turn';
    }
    if (held) {
      held.position.x = Math.min(ROOM.halfX - 1, Math.max(-ROOM.halfX + 1, x));
      held.position.z = Math.min(ROOM.halfZ - 1, Math.max(-ROOM.halfZ + 1, z));
      this.select('');
      return 'move';
    }
    if (hit) {
      this.select(hit);
      return 'pick';
    }
    return null;
  }

  /** Lift the chosen piece a little so it is clear which one is picked up. */
  private select(key: string): void {
    const old = this.pieces.get(this.selected);
    if (old) old.position.y = 0;
    this.selected = key;
    const piece = this.pieces.get(key);
    if (piece) piece.position.y = 0.5;
  }

  /** Swing the door: 0 shut, 1 wide open. */
  swing(open: number): void {
    this.hinge.rotation.y = open * 1.7;
  }

  /** Keep a point (the hero or the camera) inside the walls. */
  clamp(p: THREE.Vector3, margin: number, minY: number): void {
    p.x = Math.min(ROOM.x + ROOM.halfX - margin, Math.max(ROOM.x - ROOM.halfX + margin, p.x));
    p.z = Math.min(ROOM.z + ROOM.halfZ - margin, Math.max(ROOM.z - ROOM.halfZ + margin, p.z));
    p.y = Math.min(ROOM.y + ROOM.height - margin, Math.max(ROOM.y + minY, p.y));
  }
}
