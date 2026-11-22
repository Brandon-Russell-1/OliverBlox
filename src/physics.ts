import type * as THREE from 'three';
import type { Blocks } from './blocks';
import { groundAt } from './terrain';

/** An upright box. `pos` is the centre of its feet. */
export interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Half width (the box is square when seen from above). */
  hw: number;
  h: number;
  onGround: boolean;
}

const GRAVITY = 26;
const MAX_FALL = 30;

/** Would a block placed in this cell overlap the body? */
export function bodyTouchesCell(b: Body, x: number, y: number, z: number): boolean {
  return (
    b.pos.x + b.hw > x &&
    b.pos.x - b.hw < x + 1 &&
    b.pos.y + b.h > y &&
    b.pos.y < y + 1 &&
    b.pos.z + b.hw > z &&
    b.pos.z - b.hw < z + 1
  );
}

/**
 * Move a body by its velocity over the terrain and around placed blocks.
 * Bodies climb one-block steps on their own so small hands do not need to jump everywhere.
 */
export function moveBody(b: Body, dt: number, blocks: Blocks, gravity: boolean): void {
  const { pos, vel, hw, h } = b;
  const wasOnGround = b.onGround;
  if (gravity) vel.y = Math.max(-MAX_FALL, vel.y - GRAVITY * dt);

  const tryStep = (nx: number, nz: number): boolean => {
    if (!wasOnGround) return false;
    const up = Math.floor(pos.y + 1e-4) + 1;
    for (const y of [up, up + 1]) {
      if (y - pos.y > 1.15) break;
      if (!blocks.collides(nx, y, nz, hw, h)) {
        pos.set(nx, y, nz);
        return true;
      }
    }
    return false;
  };

  const nx = pos.x + vel.x * dt;
  if (nx !== pos.x) {
    if (!blocks.collides(nx, pos.y, pos.z, hw, h)) pos.x = nx;
    else if (!tryStep(nx, pos.z)) vel.x = 0;
  }
  const nz = pos.z + vel.z * dt;
  if (nz !== pos.z) {
    if (!blocks.collides(pos.x, pos.y, nz, hw, h)) pos.z = nz;
    else if (!tryStep(pos.x, nz)) vel.z = 0;
  }

  b.onGround = false;
  const ny = pos.y + vel.y * dt;
  if (!blocks.collides(pos.x, ny, pos.z, hw, h)) {
    pos.y = ny;
  } else {
    if (vel.y < 0) {
      pos.y = Math.floor(ny + 1e-4) + 1;
      b.onGround = true;
    }
    vel.y = 0;
  }

  const ground = groundAt(pos.x, pos.z);
  // Stick to the ground when walking downhill instead of hopping off every slope.
  const hugging = gravity && wasOnGround && vel.y <= 0 && pos.y - ground < 0.6 && !b.onGround;
  if (pos.y <= ground || hugging) {
    pos.y = ground;
    vel.y = Math.min(vel.y, 0);
    b.onGround = true;
  }
}
