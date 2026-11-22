import type * as THREE from 'three';
import type { World } from './world';

/** An upright box that stands on the block grid. `pos` is the centre of its feet. */
export interface Body {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  /** Half width (the box is square when seen from above). */
  hw: number;
  h: number;
  onGround: boolean;
}

const EPS = 1e-4;
const GRAVITY = 24;
const MAX_FALL = 18;

function collides(world: World, x: number, y: number, z: number, hw: number, h: number): boolean {
  const x0 = Math.floor(x - hw + EPS);
  const x1 = Math.floor(x + hw - EPS);
  const y0 = Math.floor(y + EPS);
  const y1 = Math.floor(y + h - EPS);
  const z0 = Math.floor(z - hw + EPS);
  const z1 = Math.floor(z + hw - EPS);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (world.solid(cx, cy, cz)) return true;
      }
    }
  }
  return false;
}

export function bodyFits(world: World, pos: THREE.Vector3, hw: number, h: number): boolean {
  return !collides(world, pos.x, pos.y, pos.z, hw, h);
}

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
 * Move a body by its velocity with gravity and block collisions.
 * Bodies automatically climb one-block steps so small hands do not need to jump everywhere.
 */
export function moveBody(world: World, b: Body, dt: number): void {
  b.vel.y = Math.max(-MAX_FALL, b.vel.y - GRAVITY * dt);
  const { pos, vel, hw, h } = b;

  const tryStep = (nx: number, nz: number): boolean => {
    if (!b.onGround) return false;
    const up = Math.round(pos.y) + 1;
    if (collides(world, nx, up, nz, hw, h)) return false;
    pos.set(nx, up, nz);
    return true;
  };

  const nx = pos.x + vel.x * dt;
  if (nx !== pos.x) {
    if (!collides(world, nx, pos.y, pos.z, hw, h)) pos.x = nx;
    else if (!tryStep(nx, pos.z)) vel.x = 0;
  }

  const nz = pos.z + vel.z * dt;
  if (nz !== pos.z) {
    if (!collides(world, pos.x, pos.y, nz, hw, h)) pos.z = nz;
    else if (!tryStep(pos.x, nz)) vel.z = 0;
  }

  const ny = pos.y + vel.y * dt;
  if (!collides(world, pos.x, ny, pos.z, hw, h)) {
    pos.y = ny;
    b.onGround = false;
  } else {
    if (vel.y < 0) {
      pos.y = Math.floor(ny + EPS) + 1;
      b.onGround = true;
    }
    vel.y = 0;
  }
}
