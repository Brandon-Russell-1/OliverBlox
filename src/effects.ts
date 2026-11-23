import * as THREE from 'three';

interface Puff {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  ring: boolean;
  rise: number;
  grow: number;
}

/**
 * Small passing touches that make the world react to him: ripples spreading on the water,
 * and puffs of dust kicked up by running feet and wheels. A fixed pool, so they cost almost nothing.
 */
export class Effects {
  private pool: Puff[] = [];
  private next = 0;

  constructor(scene: THREE.Scene, count = 28) {
    const ring = new THREE.RingGeometry(0.78, 1, 20);
    ring.rotateX(-Math.PI / 2);
    const blob = new THREE.IcosahedronGeometry(0.5, 0);
    for (let i = 0; i < count; i++) {
      const isRing = i % 2 === 0;
      const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(isRing ? ring : blob, material);
      mesh.visible = false;
      mesh.renderOrder = 2;
      scene.add(mesh);
      this.pool.push({ mesh, material, age: 0, life: 1, ring: isRing, rise: 0, grow: 1 });
    }
  }

  private take(ring: boolean): Puff {
    for (let i = 0; i < this.pool.length; i++) {
      this.next = (this.next + 1) % this.pool.length;
      if (this.pool[this.next].ring === ring) break;
    }
    return this.pool[this.next];
  }

  /** A ripple on the water's surface. */
  ripple(x: number, y: number, z: number, size = 1): void {
    const p = this.take(true);
    p.mesh.position.set(x, y + 0.04, z);
    p.mesh.scale.setScalar(0.4 * size);
    p.material.color.setHex(0xffffff);
    p.age = 0;
    p.life = 1.5;
    p.rise = 0;
    p.grow = 2.4 * size;
    p.mesh.visible = true;
  }

  /** A puff of dust (or spray, given a pale colour) that drifts up and fades. */
  dust(x: number, y: number, z: number, colour = 0xcbb98f, size = 1): void {
    const p = this.take(false);
    p.mesh.position.set(x + (Math.random() - 0.5) * 0.5, y + 0.15, z + (Math.random() - 0.5) * 0.5);
    p.mesh.scale.setScalar(0.35 * size);
    p.mesh.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    p.material.color.setHex(colour);
    p.age = 0;
    p.life = 0.7;
    p.rise = 0.9;
    p.grow = 1.1 * size;
    p.mesh.visible = true;
  }

  update(dt: number): void {
    for (const p of this.pool) {
      if (!p.mesh.visible) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.mesh.visible = false;
        continue;
      }
      const t = p.age / p.life;
      p.mesh.scale.addScalar(p.grow * dt);
      p.mesh.position.y += p.rise * dt;
      p.material.opacity = (p.ring ? 0.55 : 0.5) * (1 - t);
    }
  }
}
