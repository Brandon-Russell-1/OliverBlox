import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Animation made in code, for models that came without any.
 *
 * The horse is built here from simple shapes, with real joints at the hip, knee, neck and tail, a mane,
 * hooves and a saddle. Each stiff part is one mesh, so a whole horse is only a dozen things to draw.
 */

/** How the horse should look this frame. */
export type Gait = (stride: number, pace: number, inAir: boolean, time: number, graze?: number) => void;

/** Coat, mane and sock colours. */
const COATS: { coat: number; mane: number; sock: number; blaze: boolean }[] = [
  { coat: 0x8f5a30, mane: 0x2e1d12, sock: 0x8f5a30, blaze: true }, // chestnut
  { coat: 0x6b4226, mane: 0x15100c, sock: 0x1c1410, blaze: false }, // bay
  { coat: 0xd8b071, mane: 0xf6ecd4, sock: 0xf2ead8, blaze: false }, // palomino
  { coat: 0xb9b6b0, mane: 0x6e6b66, sock: 0x85817b, blaze: false }, // grey
  { coat: 0x2b2624, mane: 0x0e0c0b, sock: 0xece6da, blaze: true }, // black with white socks
  { coat: 0xf0ebe2, mane: 0xd9d2c4, sock: 0xf0ebe2, blaze: false }, // white
];
export const HORSE_COATS = COATS.length;

const HOOF = 0x1b1512;
const LEATHER = 0x5a3320;
const BLANKET = 0xc8382e;

const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
const colour = new THREE.Color();
const placing = new THREE.Matrix4();
const turning = new THREE.Euler();
const spin = new THREE.Quaternion();
const at = new THREE.Vector3();
const size = new THREE.Vector3();

/** One painted shape, moved into place, ready to be joined with others. */
function shape(geo: THREE.BufferGeometry, hex: number, x: number, y: number, z: number, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(placing.compose(at.set(x, y, z), spin.setFromEuler(turning.set(rx, 0, rz)), size.set(sx, sy, sz)));
  colour.setHex(hex);
  const paint = new Float32Array(g.getAttribute('position').count * 3);
  for (let i = 0; i < paint.length; i += 3) colour.toArray(paint, i);
  g.setAttribute('color', new THREE.BufferAttribute(paint, 3));
  return g;
}

const join = (shapes: THREE.BufferGeometry[]): THREE.BufferGeometry => {
  const g = mergeGeometries(shapes);
  g.computeVertexNormals();
  return g;
};

interface Shapes {
  torso: THREE.BufferGeometry;
  neck: THREE.BufferGeometry;
  thighFront: THREE.BufferGeometry;
  thighHind: THREE.BufferGeometry;
  shin: THREE.BufferGeometry;
  tail: THREE.BufferGeometry;
}
const built = new Map<number, Shapes>();

/** Sizes are in metres for a horse a child can ride: about 1.8 m to the top of its back. */
const HIP = 1.3;
const KNEE = 0.62;

function shapesFor(index: number): Shapes {
  const cached = built.get(index);
  if (cached) return cached;
  const c = COATS[index];
  const ball = new THREE.SphereGeometry(1, 10, 7);
  const tube = (top: number, bottom: number, length: number, sides = 7): THREE.BufferGeometry => new THREE.CylinderGeometry(top, bottom, length, sides);
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cone = new THREE.ConeGeometry(1, 1, 4);

  const torso = join([
    // Barrel, deep chest and round haunches.
    shape(ball, c.coat, 0, 1.46, 0, 0, 0, 0.42, 0.43, 0.95),
    shape(ball, c.coat, 0, 1.48, 0.62, 0, 0, 0.41, 0.47, 0.5),
    shape(ball, c.coat, 0, 1.5, -0.62, 0, 0, 0.43, 0.46, 0.52),
    // Saddle blanket, saddle with a raised front and back, and a girth strap.
    shape(box, BLANKET, 0, 1.86, -0.02, 0, 0, 0.8, 0.07, 0.78),
    shape(box, LEATHER, 0, 1.92, -0.02, 0, 0, 0.5, 0.09, 0.6),
    shape(box, LEATHER, 0, 1.99, 0.27, -0.3, 0, 0.36, 0.14, 0.1),
    shape(box, LEATHER, 0, 1.99, -0.31, 0.3, 0, 0.42, 0.14, 0.1),
    shape(tube(0.445, 0.445, 0.12, 10), LEATHER, 0, 1.47, 0.06, 0, Math.PI / 2, 1.04, 1, 1),
  ]);

  // The neck swings about its base, which sits at the origin of this part. It leans forward 0.75 rad.
  const lean = 0.75;
  const up = (d: number): [number, number] => [Math.cos(lean) * d, Math.sin(lean) * d];
  const [ny, nz] = up(0.5);
  const [hy, hz] = up(1.02);
  const neck = join([
    shape(tube(0.2, 0.34, 1.1), c.coat, 0, ny, nz, lean),
    // Mane along the top of the neck, and a forelock between the ears.
    shape(box, c.mane, 0, ny + 0.12, nz - 0.2, lean, 0, 0.09, 0.95, 0.2),
    shape(box, c.mane, 0, hy + 0.1, hz + 0.1, 1.2, 0, 0.12, 0.26, 0.09),
    // Head: a long wedge pointing forward and down, with a soft muzzle.
    shape(tube(0.2, 0.15, 0.62), c.coat, 0, hy - 0.1, hz + 0.24, 2.0),
    shape(ball, c.blaze ? 0xf2ead8 : c.coat, 0, hy - 0.05, hz + 0.3, 2.0 - Math.PI / 2, 0, 0.06, 0.07, 0.3),
    shape(ball, c.sock === c.coat ? 0x3a2a22 : 0x2a2220, 0, hy - 0.26, hz + 0.5, 0, 0, 0.14, 0.13, 0.15),
    shape(ball, 0x111111, 0.15, hy + 0.0, hz + 0.16, 0, 0, 0.04, 0.05, 0.05),
    shape(ball, 0x111111, -0.15, hy + 0.0, hz + 0.16, 0, 0, 0.04, 0.05, 0.05),
    shape(cone, c.coat, 0.11, hy + 0.2, hz - 0.02, -0.2, -0.2, 0.07, 0.24, 0.05),
    shape(cone, c.coat, -0.11, hy + 0.2, hz - 0.02, -0.2, 0.2, 0.07, 0.24, 0.05),
  ]);

  // Legs hang down from the origin of each part.
  const thighFront = join([shape(tube(0.17, 0.1, KNEE + 0.1), c.coat, 0, -KNEE / 2, 0)]);
  const thighHind = join([shape(tube(0.2, 0.11, KNEE + 0.1), c.coat, 0, -KNEE / 2, 0, 0, 0, 1, 1, 1.25)]);
  const lower = HIP - KNEE;
  const shin = join([
    shape(tube(0.095, 0.075, lower - 0.1), c.sock, 0, -(lower - 0.1) / 2, 0),
    shape(tube(0.1, 0.125, 0.15, 8), HOOF, 0, -lower + 0.075, 0.01),
  ]);
  const tail = join([shape(tube(0.07, 0.15, 0.55, 6), c.mane, 0, -0.27, 0), shape(tube(0.15, 0.04, 0.5, 6), c.mane, 0, -0.79, 0)]);
  const made = { torso, neck, thighFront, thighHind, shin, tail };
  built.set(index, made);
  return made;
}

/**
 * A horse standing at the origin, facing +z, with its hooves on the ground.
 * Returns the model and the function that poses it each frame.
 */
export function makeHorse(coat = 0): { model: THREE.Group; gait: Gait } {
  const s = shapesFor(((Math.floor(coat) % COATS.length) + COATS.length) % COATS.length);
  const model = new THREE.Group();
  const part = (geo: THREE.BufferGeometry, parent: THREE.Object3D, x: number, y: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  part(s.torso, model, 0, 0, 0);
  const neck = part(s.neck, model, 0, 1.56, 0.78);
  const tail = part(s.tail, model, 0, 1.72, -1.08);
  tail.rotation.x = 0.35;
  // Order: front left, front right, hind left, hind right.
  const legs = [
    [0.21, 0.68],
    [-0.21, 0.68],
    [0.23, -0.7],
    [-0.23, -0.7],
  ].map(([x, z], i) => {
    const thigh = part(i < 2 ? s.thighFront : s.thighHind, model, x, HIP, z);
    const shin = part(s.shin, thigh, 0, -KNEE, 0);
    return { thigh, shin };
  });
  let tuck = 0;
  const gait: Gait = (stride, pace, inAir, time, graze = 0) => {
    // In a jump the front legs fold forward and the hind legs trail.
    tuck += ((inAir ? 1 : 0) - tuck) * 0.2;
    const swing = 0.7 * pace * (1 - tuck);
    legs.forEach(({ thigh, shin }, i) => {
      const front = i < 2;
      const phase = stride + (front ? 0 : Math.PI) + (i % 2 ? 0.7 : 0);
      thigh.rotation.x = Math.sin(phase) * swing + (front ? -0.95 : 0.6) * tuck;
      // The knee folds while the leg swings forward, so the hoof clears the ground.
      const lift = Math.max(0, Math.cos(phase)) * pace * (1 - tuck);
      shin.rotation.x = front ? lift * 1.1 + tuck * 1.5 : lift * 0.8 + 0.12 - tuck * 0.2;
    });
    // The head nods with each stride, breathes gently when standing, and goes down to the grass to graze.
    neck.rotation.x = Math.sin(stride * 2 + 1) * 0.07 * pace + Math.sin(time * 1.4) * 0.02 + graze * (1.25 + Math.sin(time * 5) * 0.04) - 0.1 * pace;
    tail.rotation.x = 0.35 + 0.55 * pace + Math.sin(stride) * 0.15 * pace;
    tail.rotation.z = Math.sin(time * 2.1) * (0.18 - 0.1 * pace);
  };
  gait(0, 0, false, 0);
  return { model, gait };
}

const bend = new THREE.Quaternion();
const turn = new THREE.Euler();
const SIT: [string, number, number][] = [
  ['upperlegl', -1.25, -0.42],
  ['upperlegr', -1.25, 0.42],
  ['lowerlegl', 1.2, 0],
  ['lowerlegr', 1.2, 0],
];

/**
 * Seat a character: bend the legs forward at the hip and back at the knee, spread a little to straddle.
 * Call it after the character's own animation has run for the frame, so the two add together.
 */
export function sit(root: THREE.Object3D): void {
  for (const [name, x, z] of SIT) {
    const bone = root.getObjectByName(name);
    if (!bone) continue;
    bone.quaternion.multiply(bend.setFromEuler(turn.set(x, 0, z)));
  }
}

const pose = (root: THREE.Object3D, name: string, x: number, y: number, z: number): void => {
  const bone = root.getObjectByName(name);
  if (bone) bone.quaternion.multiply(bend.setFromEuler(turn.set(x, y, z)));
};

/** Swimming: the legs flutter and the arms reach in turn, on top of the paddling animation. */
export function swimStroke(root: THREE.Object3D, time: number): void {
  const kick = Math.sin(time * 9) * 0.45;
  pose(root, 'upperlegl', kick, 0, 0);
  pose(root, 'upperlegr', -kick, 0, 0);
  pose(root, 'lowerlegl', Math.max(0, -kick) * 0.8, 0, 0);
  pose(root, 'lowerlegr', Math.max(0, kick) * 0.8, 0, 0);
  const reach = Math.sin(time * 4.5) * 0.5;
  pose(root, 'upperarml', reach, 0, 0);
  pose(root, 'upperarmr', -reach, 0, 0);
}

/** Holding a shield up in front: `amount` runs from 0 (arm down) to 1 (fully raised). */
export function raiseShield(root: THREE.Object3D, amount: number): void {
  pose(root, 'upperarml', -1.25 * amount, 0, -0.5 * amount);
  pose(root, 'lowerarml', -0.7 * amount, 0, 0);
}

/** A round shield made from simple shapes; wood, then iron, then gold as armor improves. */
export function makeShield(level: number): THREE.Object3D {
  const group = new THREE.Group();
  const face = [0x9a6a3c, 0xaab4c2, 0xffc928][Math.min(2, Math.max(0, level - 1))];
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 18), new THREE.MeshLambertMaterial({ color: face }));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.06, 6, 18), new THREE.MeshLambertMaterial({ color: 0x4a4f5a }));
  rim.rotation.x = Math.PI / 2;
  const boss = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), new THREE.MeshLambertMaterial({ color: 0xe8413c }));
  boss.position.y = 0.07;
  group.add(disc, rim, boss);
  group.traverse((o) => {
    o.castShadow = true;
  });
  return group;
}
