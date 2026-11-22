import { groundAt } from './terrain';

export interface MapIcon {
  x: number;
  z: number;
  icon: string;
  /** Keep the icon on the rim when it is off the map, so it still shows which way to go. */
  pin?: boolean;
}

const SIZE = 320;
/** Terrain is sampled coarsely and scaled up; it only needs to read as land and sea. */
const CELLS = 44;
const SMALL_RANGE = 170;
const BIG_RANGE = 520;

function terrainColor(h: number): [number, number, number] {
  if (h < -3) return [38, 120, 214];
  if (h < 0) return [70, 160, 235];
  if (h < 1.6) return [238, 221, 162];
  if (h < 30) return [120, 196, 84];
  if (h < 46) return [143, 148, 153];
  return [245, 248, 255];
}

/**
 * A map that turns with the camera, so "up" on the map is always "straight ahead" on screen.
 * Small in the corner by default; tap it to make it big.
 */
export class MiniMap {
  big = false;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly land = document.createElement('canvas');
  private readonly landCtx: CanvasRenderingContext2D;
  private timer = 0;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = canvas.height = SIZE;
    this.land.width = this.land.height = CELLS;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.landCtx = this.land.getContext('2d') as CanvasRenderingContext2D;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.big = !this.big;
      canvas.classList.toggle('big', this.big);
      this.timer = 0;
    });
  }

  /** Redraw a few times a second; the map does not need to be smoother than that. */
  update(dt: number, px: number, pz: number, camYaw: number, facing: number, icons: MapIcon[]): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.big ? 0.4 : 0.2;

    const range = this.big ? BIG_RANGE : SMALL_RANGE;
    // Screen-up is the way the camera looks; screen-right is the camera's right.
    const fx = -Math.sin(camYaw);
    const fz = -Math.cos(camYaw);
    const rx = Math.cos(camYaw);
    const rz = -Math.sin(camYaw);

    const image = this.landCtx.createImageData(CELLS, CELLS);
    for (let j = 0; j < CELLS; j++) {
      for (let i = 0; i < CELLS; i++) {
        const u = ((i + 0.5) / CELLS - 0.5) * 2 * range;
        const v = (0.5 - (j + 0.5) / CELLS) * 2 * range;
        const [r, g, b] = terrainColor(groundAt(px + rx * u + fx * v, pz + rz * u + fz * v));
        const o = (j * CELLS + i) * 4;
        image.data[o] = r;
        image.data[o + 1] = g;
        image.data[o + 2] = b;
        image.data[o + 3] = 255;
      }
    }
    this.landCtx.putImageData(image, 0, 0);

    const c = this.ctx;
    const half = SIZE / 2;
    c.save();
    c.clearRect(0, 0, SIZE, SIZE);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.land, 0, 0, SIZE, SIZE);

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.font = `${this.big ? 18 : 34}px sans-serif`;
    const rim = half - 22;
    for (const item of icons) {
      const dx = item.x - px;
      const dz = item.z - pz;
      let sx = ((dx * rx + dz * rz) / range) * half;
      let sy = (-(dx * fx + dz * fz) / range) * half;
      const d = Math.hypot(sx, sy);
      if (d > rim) {
        if (!item.pin) continue;
        sx *= rim / d;
        sy *= rim / d;
      }
      c.fillText(item.icon, half + sx, half + sy);
    }

    // The hero: an arrow in the middle pointing the way he faces.
    const hx = Math.sin(facing);
    const hz = Math.cos(facing);
    c.translate(half, half);
    c.rotate(Math.atan2(hx * rx + hz * rz, hx * fx + hz * fz));
    c.beginPath();
    c.moveTo(0, -16);
    c.lineTo(11, 12);
    c.lineTo(0, 6);
    c.lineTo(-11, 12);
    c.closePath();
    c.fillStyle = '#ff3b30';
    c.strokeStyle = '#fff';
    c.lineWidth = 4;
    c.stroke();
    c.fill();
    c.restore();
  }
}
