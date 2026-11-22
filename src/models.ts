import * as THREE from 'three';

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
}

/** A limb that swings from its top end. */
function limb(w: number, h: number, d: number, color: number, x: number, y: number): THREE.Group {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, 0);
  const m = box(w, h, d, color);
  m.position.y = -h / 2;
  pivot.add(m);
  return pivot;
}

export interface Avatar {
  group: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
}

/** The player character. Feet at the origin, facing +z, about 1.8 tall. */
export function makeAvatar(): Avatar {
  const group = new THREE.Group();
  const skin = 0xffcc99;
  const shirt = 0xff6b35;
  const pants = 0x2b4c9b;

  const torso = box(0.6, 0.65, 0.32, shirt);
  torso.position.y = 1.03;
  const head = box(0.46, 0.46, 0.46, skin);
  head.position.y = 1.6;
  const hair = box(0.5, 0.14, 0.5, 0x5a3a1c);
  hair.position.y = 1.86;
  group.add(torso, head, hair);

  for (const x of [-0.11, 0.11]) {
    const eye = box(0.08, 0.1, 0.02, 0x1c2a6b);
    eye.position.set(x, 1.64, 0.235);
    group.add(eye);
  }
  const smile = box(0.2, 0.05, 0.02, 0x1c2a6b);
  smile.position.set(0, 1.49, 0.235);
  group.add(smile);

  const legL = limb(0.26, 0.7, 0.28, pants, -0.16, 0.7);
  const legR = limb(0.26, 0.7, 0.28, pants, 0.16, 0.7);
  const armL = limb(0.2, 0.62, 0.22, skin, -0.41, 1.33);
  const armR = limb(0.2, 0.62, 0.22, skin, 0.41, 1.33);
  group.add(legL, legR, armL, armR);
  return { group, legL, legR, armL, armR };
}

export interface Car {
  group: THREE.Group;
  wheels: THREE.Mesh[];
}

/** A chunky little car. Wheels on the ground at the origin, facing +z. */
export function makeCar(): Car {
  const group = new THREE.Group();
  const body = box(1.7, 0.55, 2.7, 0xe8413c);
  body.position.y = 0.68;
  const cabin = box(1.45, 0.55, 1.3, 0xbfe9ff);
  cabin.position.set(0, 1.22, -0.2);
  const roof = box(1.55, 0.1, 1.4, 0xe8413c);
  roof.position.set(0, 1.54, -0.2);
  const bumper = box(1.8, 0.2, 0.15, 0x4a4e57);
  bumper.position.set(0, 0.5, 1.38);
  group.add(body, cabin, roof, bumper);

  for (const x of [-0.55, 0.55]) {
    const light = box(0.32, 0.2, 0.06, 0xffe066);
    light.position.set(x, 0.75, 1.36);
    group.add(light);
  }

  const wheels: THREE.Mesh[] = [];
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x23262d });
  for (const x of [-0.85, 0.85]) {
    for (const z of [-0.85, 0.85]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.position.set(x, 0.38, z);
      const hub = box(0.32, 0.2, 0.2, 0xdfe6f5);
      w.add(hub);
      wheels.push(w);
      group.add(w);
    }
  }
  return { group, wheels };
}

/** Bolt the robot, the friendly guide. Feet at the origin, facing +z. */
export function makeRobot(): THREE.Group {
  const group = new THREE.Group();
  const metal = 0xc9d2e3;
  const body = box(0.8, 0.8, 0.55, metal);
  body.position.y = 0.75;
  const panel = box(0.4, 0.3, 0.02, 0x2b7fff);
  panel.position.set(0, 0.8, 0.285);
  const head = box(0.66, 0.5, 0.5, metal);
  head.position.y = 1.45;
  const stalk = box(0.06, 0.25, 0.06, 0x4a4e57);
  stalk.position.y = 1.82;
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 10, 8),
    new THREE.MeshLambertMaterial({ color: 0xff3b30, emissive: 0x991111 }),
  );
  bulb.position.y = 1.98;
  group.add(body, panel, head, stalk, bulb);

  for (const x of [-0.16, 0.16]) {
    const eye = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.16, 0.02),
      new THREE.MeshLambertMaterial({ color: 0x35e0ff, emissive: 0x1a8fa8 }),
    );
    eye.position.set(x, 1.5, 0.26);
    group.add(eye);
    const foot = box(0.28, 0.35, 0.35, 0x4a4e57);
    foot.position.set(x * 1.4, 0.175, 0);
    group.add(foot);
  }
  for (const x of [-0.5, 0.5]) {
    const arm = box(0.16, 0.55, 0.16, 0x4a4e57);
    arm.position.set(x, 0.8, 0);
    group.add(arm);
  }
  return group;
}

const starGeometry = (() => {
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 0.5 : 0.22;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false });
  geo.translate(0, 0, -0.08);
  return geo;
})();
const starMaterial = new THREE.MeshLambertMaterial({ color: 0xffd43b, emissive: 0x9a6a00 });

export function makeStar(): THREE.Mesh {
  return new THREE.Mesh(starGeometry, starMaterial);
}

export function makeClouds(): THREE.Group {
  const group = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const geo = new THREE.BoxGeometry(1, 1, 1);
  for (let i = 0; i < 9; i++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 3; j++) {
      const puff = new THREE.Mesh(geo, mat);
      puff.scale.set(8 + ((i * 7 + j * 3) % 6), 2.5, 5 + ((i + j * 5) % 4));
      puff.position.set(j * 5 - 5, (j % 2) * 1.2, ((i + j) % 3) * 2);
      cloud.add(puff);
    }
    cloud.position.set(((i * 53) % 260) - 80, 46 + (i % 3) * 5, ((i * 97) % 260) - 80);
    group.add(cloud);
  }
  return group;
}
