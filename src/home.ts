import * as THREE from 'three';
import { loadModel } from './assets';

/**
 * The inside of a house. The village buildings are solid models, so going through a door
 * moves the hero to this one furnished room, kept high above the world out of sight.
 */
export const ROOM = { x: 0, y: 600, z: 0, halfX: 8, halfZ: 6, height: 7 };

/** What each piece is, where it stands, and how it is turned. The rug and bed come with the house. */
const FURNITURE: Record<string, [string, number, number, number][]> = {
  rug: [['rug_rectangle_A', 0, 0, 0]],
  bed: [['bed_single_A', -6.4, -3.8, 0]],
  cabinet: [['cabinet_medium_decorated', -3.6, -5.2, 0]],
  shelf: [['shelf_B_large_decorated', 1.5, -5.6, 0]],
  table: [
    ['table_medium', 4.6, 2.2, 0],
    ['chair_A_wood', 4.6, 4.2, 2],
    ['chair_A_wood', 6.6, 2.2, 3],
  ],
  couch: [['couch_pillows', -5.2, 4.4, 2]],
  lamp: [['lamp_standing', 6.8, -5, 0]],
};
const INCLUDED = ['rug', 'bed'];
const SCALE = 1.25;

export class Home {
  private readonly group = new THREE.Group();
  private readonly placed = new Set<string>();

  constructor(scene: THREE.Scene) {
    const { halfX, halfZ, height } = ROOM;
    // A box seen from the inside makes the walls and ceiling.
    const walls = new THREE.Mesh(
      new THREE.BoxGeometry(halfX * 2, height, halfZ * 2),
      new THREE.MeshLambertMaterial({ color: 0xf3e2c0, side: THREE.BackSide }),
    );
    walls.position.y = height / 2;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(halfX * 2, halfZ * 2),
      new THREE.MeshLambertMaterial({ color: 0xb98552 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0.01;
    floor.receiveShadow = true;
    // The way out, on the +z wall.
    const door = new THREE.Mesh(new THREE.BoxGeometry(2.2, 3.6, 0.2), new THREE.MeshLambertMaterial({ color: 0x7a4f2a }));
    door.position.set(0, 1.8, halfZ - 0.1);
    const light = new THREE.PointLight(0xfff0d0, 60, 30);
    light.position.set(0, height - 1, 0);
    this.group.add(walls, floor, door, light);
    this.group.position.set(ROOM.x, ROOM.y, ROOM.z);
    this.group.visible = false;
    scene.add(this.group);
  }

  /** Show or hide the room, with whatever furniture has been bought. Models download when first needed. */
  show(on: boolean, owned: Set<string>): void {
    this.group.visible = on;
    if (!on) return;
    for (const key of [...INCLUDED, ...owned]) {
      if (this.placed.has(key) || !FURNITURE[key]) continue;
      this.placed.add(key);
      for (const [name, x, z, turn] of FURNITURE[key]) {
        void loadModel(`home/${name}.gltf`).then((gltf) => {
          const item = gltf.scene.clone(true);
          item.position.set(x, 0, z);
          item.rotation.y = (turn * Math.PI) / 2;
          item.scale.setScalar(SCALE);
          this.group.add(item);
        });
      }
    }
  }

  /** Keep a point (the hero or the camera) inside the walls. */
  clamp(p: THREE.Vector3, margin: number, minY: number): void {
    p.x = Math.min(ROOM.x + ROOM.halfX - margin, Math.max(ROOM.x - ROOM.halfX + margin, p.x));
    p.z = Math.min(ROOM.z + ROOM.halfZ - margin, Math.max(ROOM.z - ROOM.halfZ + margin, p.z));
    p.y = Math.min(ROOM.y + ROOM.height - margin, Math.max(ROOM.y + minY, p.y));
  }
}
