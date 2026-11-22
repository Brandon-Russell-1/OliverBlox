import * as THREE from 'three';

function box(w: number, h: number, d: number, color: number): THREE.Mesh {
  return new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
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
