import * as THREE from 'three';

export const HATS = ['party', 'top', 'crown'];

/** A hat made from simple shapes, ready to sit on a character's head bone. */
export function makeHat(kind: string): THREE.Object3D {
  const group = new THREE.Group();
  const part = (geometry: THREE.BufferGeometry, color: number, y: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }));
    mesh.position.y = y;
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  if (kind === 'party') {
    part(new THREE.ConeGeometry(0.34, 0.85, 14), 0xff5fa2, 0.42);
    part(new THREE.SphereGeometry(0.11, 8, 6), 0xffe066, 0.9);
  } else if (kind === 'top') {
    part(new THREE.CylinderGeometry(0.62, 0.62, 0.07, 18), 0x22252e, 0.03);
    part(new THREE.CylinderGeometry(0.4, 0.4, 0.66, 18), 0x22252e, 0.36);
    part(new THREE.CylinderGeometry(0.41, 0.41, 0.12, 18), 0xe8413c, 0.14);
  } else {
    part(new THREE.CylinderGeometry(0.46, 0.42, 0.3, 16, 1, true), 0xffc928, 0.15);
    for (let i = 0; i < 6; i++) {
      const spike = part(new THREE.ConeGeometry(0.11, 0.3, 6), 0xffc928, 0.42);
      spike.position.x = Math.sin((i / 6) * Math.PI * 2) * 0.42;
      spike.position.z = Math.cos((i / 6) * Math.PI * 2) * 0.42;
    }
  }
  // Sits on top of the head bone.
  group.position.y = 1.02;
  return group;
}

/** What a player can hold, by number: three blades, then the wand. */
export const HELD = ['weapon/sword_1handed.gltf', 'weapon/axe_1handed.gltf', 'weapon/sword_2handed.gltf', 'weapon/staff.gltf'];
