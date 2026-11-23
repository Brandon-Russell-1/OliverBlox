import { groundAt } from './terrain';

export interface MapIcon {
  x: number;
  z: number;
  icon: string;
  /** Keep the icon on the rim when it is off the map, so it still shows which way to go. */
  pin?: boolean;
  /** A name written under the icon on the big map. */
  label?: string;
}

const SIZE = 320;
/** Terrain is sampled coarsely and scaled up; it only needs to read as land and sea. */
const CELLS = 44;
/** How far the small map reaches at each zoom level, in metres. Tapping the map shows three times as far. */
const RANGES = [80, 170, 340];
/** The big map shows the whole neighbourhood: every village, fort and camp for a long way round. */
const BIG_RANGES = [350, 700, 1300];
const BIG_SIZE = 720;
const BIG_CELLS = 110;
const ZOOM_KEY = 'oliverblox-zoom';

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
  private zoom = Math.min(RANGES.length - 1, Math.max(0, Number(localStorage.getItem(ZOOM_KEY) ?? 1) || 0));
  private readonly ctx: CanvasRenderingContext2D;
  private readonly land = document.createElement('canvas');
  private readonly landCtx: CanvasRenderingContext2D;
  private timer = 0;
  private landAge = 99;
  private canvas!: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = canvas.height = SIZE;
    this.land.width = this.land.height = CELLS;
    this.ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    this.landCtx = this.land.getContext('2d') as CanvasRenderingContext2D;
    this.canvas = canvas;
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.toggle();
    });
  }

  /** Switch between the small corner map and the big one that fills the screen. */
  toggle(): void {
    this.big = !this.big;
    this.canvas.classList.toggle('big', this.big);
    // The big map is drawn with more dots, so it stays sharp at its size.
    this.canvas.width = this.canvas.height = this.big ? BIG_SIZE : SIZE;
    this.land.width = this.land.height = this.big ? BIG_CELLS : CELLS;
    this.timer = 0;
    this.landAge = 99;
  }

  /** How far the map reaches right now, in metres. */
  get range(): number {
    return this.big ? BIG_RANGES[this.zoom] : RANGES[this.zoom];
  }

  /** Zoom in (-1) or out (+1), and remember the choice. */
  zoomBy(step: number): void {
    this.zoom = Math.min(RANGES.length - 1, Math.max(0, this.zoom + step));
    localStorage.setItem(ZOOM_KEY, String(this.zoom));
    this.timer = 0;
    this.landAge = 99;
  }

  /** Redraw a few times a second; the map does not need to be smoother than that. */
  update(dt: number, px: number, pz: number, camYaw: number, facing: number, icons: MapIcon[]): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = this.big ? 0.3 : 0.2;
    this.landAge += this.timer;

    const range = this.range;
    const SIZE = this.canvas.width;
    const CELLS = this.land.width;
    // Screen-up is the way the camera looks; screen-right is the camera's right.
    // The small map turns with the camera. The big one stays put, north at the top, like a map on a table.
    const yaw = this.big ? 0 : camYaw;
    const fx = -Math.sin(yaw);
    const fz = -Math.cos(yaw);
    const rx = Math.cos(yaw);
    const rz = -Math.sin(yaw);

    // The big map's land is a lot of work to colour in, so it is only redone now and then.
    const redraw = !this.big || this.landAge > 1.2;
    if (redraw) this.landAge = 0;
    const image = this.landCtx.createImageData(CELLS, CELLS);
    for (let j = 0; redraw && j < CELLS; j++) {
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
    if (redraw) this.landCtx.putImageData(image, 0, 0);

    const c = this.ctx;
    const half = SIZE / 2;
    c.save();
    c.clearRect(0, 0, SIZE, SIZE);
    c.imageSmoothingEnabled = true;
    c.drawImage(this.land, 0, 0, SIZE, SIZE);

    c.textAlign = 'center';
    c.textBaseline = 'middle';
    // Fewer, smaller pictures the further out the big map is zoomed, so they do not pile up.
    const iconFont = `${this.big ? [30, 26, 21][this.zoom] : 34}px sans-serif`;
    c.font = iconFont;
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
      if (this.big && item.label) {
        c.font = 'bold 17px sans-serif';
        c.lineWidth = 4;
        c.strokeStyle = 'rgba(20, 30, 80, 0.85)';
        c.fillStyle = '#fff';
        c.strokeText(item.label, half + sx, half + sy + 26);
        c.fillText(item.label, half + sx, half + sy + 26);
        c.font = iconFont;
      }
    }

    // The hero: an arrow in the middle pointing the way he faces.
    const hx = Math.sin(facing);
    const hz = Math.cos(facing);
    c.translate(half, half);
    c.rotate(Math.atan2(hx * rx + hz * rz, hx * fx + hz * fz));
    if (this.big) c.scale(1.5, 1.5);
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
