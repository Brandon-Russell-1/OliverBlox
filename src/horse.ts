import * as THREE from 'three';

/**
 * Animation made in code, for models that came without any.
 *
 * The horse model is one solid shape with no joints. Here its points are sorted into legs, head and tail by
 * where they are, and each group is swung about its own hinge every frame. Points near a hinge move only
 * part of the way, so the surface bends instead of tearing.
 */

/** How the horse should look this frame. */
export type Gait = (stride: number, pace: number, inAir: boolean, time: number, graze?: number) => void;

interface Part {
  /** The hinge: height and distance along the body, in the model's own units. */
  py: number;
  pz: number;
  /** Which points belong, and how strongly (0 to 1) each one follows the hinge. */
  index: number[];
  weight: number[];
  angle: number;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** Give a horse model moving legs, a nodding head and a swishing tail. Returns the function that poses it. */
export function rigHorse(model: THREE.Object3D): Gait {
  let mesh: THREE.Mesh | null = null;
  model.traverse((o) => {
    if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh;
  });
  if (!mesh) return () => {};
  const target: THREE.Mesh = mesh;
  // Every horse in the game shares one shape, so this one gets a copy of its own to bend.
  target.geometry = target.geometry.clone();
  const position = target.geometry.getAttribute('position') as THREE.BufferAttribute;
  const rest = Float32Array.from(position.array as ArrayLike<number>);
  const part = (py: number, pz: number): Part => ({ py, pz, index: [], weight: [], angle: 0 });
  // Order: front left, front right, hind left, hind right, head, tail.
  const parts = [part(0.27, 0.21), part(0.27, 0.21), part(0.27, -0.21), part(0.27, -0.21), part(0.36, 0.2), part(0.36, -0.25)];
  for (let i = 0; i < position.count; i++) {
    const x = rest[i * 3];
    const y = rest[i * 3 + 1];
    const z = rest[i * 3 + 2];
    let which = -1;
    let weight = 0;
    if (y < 0.27 && Math.abs(x) > 0.04 && Math.abs(z) > 0.15 && Math.abs(z) < 0.27) {
      which = (z > 0 ? 0 : 2) + (x > 0 ? 0 : 1);
      weight = clamp01((0.27 - y) / 0.07);
    } else if (z < -0.255 && Math.abs(x) < 0.04) {
      which = 5;
      weight = clamp01((-0.25 - z) / 0.03);
    } else if (z > 0.1) {
      which = 4;
      weight = clamp01(Math.max((z - 0.25) / 0.06, (y - 0.43) / 0.06));
    }
    if (which >= 0 && weight > 0) {
      parts[which].index.push(i);
      parts[which].weight.push(weight);
    }
  }
  const array = position.array as Float32Array;
  let tuck = 0;
  return (stride, pace, inAir, time, graze = 0) => {
    // In a jump the front legs fold forward and the hind legs trail.
    tuck += ((inAir ? 1 : 0) - tuck) * 0.2;
    const swing = 0.75 * pace * (1 - tuck);
    parts[0].angle = Math.sin(stride) * swing - tuck * 0.9;
    parts[1].angle = Math.sin(stride + 0.7) * swing - tuck * 0.9;
    parts[2].angle = Math.sin(stride + Math.PI) * swing + tuck * 0.7;
    parts[3].angle = Math.sin(stride + Math.PI + 0.7) * swing + tuck * 0.7;
    // The head nods with each stride, and breathes gently when standing.
    parts[4].angle = Math.sin(stride + 1) * 0.1 * pace + Math.sin(time * 1.4) * 0.025 + graze * (0.8 + Math.sin(time * 5) * 0.05);
    parts[5].angle = -0.25 * pace + Math.sin(stride) * 0.2 * pace + Math.sin(time * 2.1) * 0.08;
    for (const p of parts) {
      for (let k = 0; k < p.index.length; k++) {
        const i = p.index[k] * 3;
        const a = p.angle * p.weight[k];
        const cos = Math.cos(a);
        const sin = Math.sin(a);
        const dy = rest[i + 1] - p.py;
        const dz = rest[i + 2] - p.pz;
        array[i + 1] = p.py + dy * cos - dz * sin;
        array[i + 2] = p.pz + dy * sin + dz * cos;
      }
    }
    position.needsUpdate = true;
  };
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
