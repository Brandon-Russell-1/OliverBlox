interface Pointer {
  x: number;
  y: number;
  startX: number;
  startY: number;
  startTime: number;
  moved: boolean;
  button: number;
}

const JOY_RADIUS = 48;
const TAP_SLOP = 10;
const TAP_MS = 500;

/** Keyboard, mouse and touch folded into one set of game controls. */
export class Input {
  /** -1..1, right is positive. */
  moveX = 0;
  /** -1..1, forward is positive. */
  moveZ = 0;
  /** Jump, or fly up in god mode. */
  jump = false;
  /** Shift on a keyboard, or the stick pushed all the way out. */
  run = false;
  /** Held crawl control: fly down in god mode. */
  down = false;

  onAction: () => void = () => {};
  onTap: (x: number, y: number, button: number) => void = () => {};
  onDrag: (dx: number, dy: number) => void = () => {};
  onZoom: (amount: number) => void = () => {};
  onHotkey: (n: number) => void = () => {};
  onCrawl: () => void = () => {};
  onFly: () => void = () => {};

  private keys = new Set<string>();
  private joyX = 0;
  private joyY = 0;
  private jumpButton = false;
  /** Remembers a quick tap that started and ended between two frames. */
  private jumpTapped = false;
  private crawlButton = false;
  private pointers = new Map<number, Pointer>();
  private pinchDist = 0;

  constructor(
    canvas: HTMLCanvasElement,
    joystick: HTMLElement,
    knob: HTMLElement,
    jump: HTMLElement,
    crawl: HTMLElement,
  ) {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Space') this.jumpTapped = true;
      if (e.code === 'KeyE' || e.code === 'Enter') this.onAction();
      if (e.code === 'KeyC') this.onCrawl();
      if (e.code === 'KeyF') this.onFly();
      if (e.code.startsWith('Digit')) this.onHotkey(Number(e.code.slice(5)));
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.jumpButton = false;
      this.crawlButton = false;
    });

    // ---- joystick ----
    const joyMove = (e: PointerEvent): void => {
      const r = joystick.getBoundingClientRect();
      let dx = e.clientX - (r.left + r.width / 2);
      let dy = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx *= JOY_RADIUS / len;
        dy *= JOY_RADIUS / len;
      }
      this.joyX = dx / JOY_RADIUS;
      this.joyY = dy / JOY_RADIUS;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    const joyEnd = (): void => {
      this.joyX = 0;
      this.joyY = 0;
      knob.style.transform = '';
    };
    joystick.addEventListener('pointerdown', (e) => {
      capture(joystick, e.pointerId);
      joyMove(e);
    });
    joystick.addEventListener('pointermove', (e) => {
      if (joystick.hasPointerCapture(e.pointerId)) joyMove(e);
    });
    joystick.addEventListener('pointerup', joyEnd);
    joystick.addEventListener('pointercancel', joyEnd);

    // ---- jump button ----
    jump.addEventListener('pointerdown', (e) => {
      capture(jump, e.pointerId);
      this.jumpButton = true;
      this.jumpTapped = true;
    });
    const jumpEnd = (): void => {
      this.jumpButton = false;
    };
    jump.addEventListener('pointerup', jumpEnd);
    jump.addEventListener('pointercancel', jumpEnd);

    // ---- crawl button (doubles as "fly down") ----
    crawl.addEventListener('pointerdown', (e) => {
      capture(crawl, e.pointerId);
      this.crawlButton = true;
      this.onCrawl();
    });
    const crawlEnd = (): void => {
      this.crawlButton = false;
    };
    crawl.addEventListener('pointerup', crawlEnd);
    crawl.addEventListener('pointercancel', crawlEnd);

    // ---- canvas: drag to look, tap to build, pinch or wheel to zoom ----
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      capture(canvas, e.pointerId);
      this.pointers.set(e.pointerId, {
        x: e.clientX,
        y: e.clientY,
        startX: e.clientX,
        startY: e.clientY,
        startTime: performance.now(),
        moved: false,
        button: e.button,
      });
      this.pinchDist = 0;
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x;
      const dy = e.clientY - p.y;
      p.x = e.clientX;
      p.y = e.clientY;
      if (Math.hypot(p.x - p.startX, p.y - p.startY) > TAP_SLOP) p.moved = true;

      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) this.onZoom((this.pinchDist - dist) * 0.03);
        this.pinchDist = dist;
        a.moved = b.moved = true;
      } else if (p.moved) {
        this.onDrag(dx, dy);
      }
    });
    const end = (e: PointerEvent, cancelled: boolean): void => {
      const p = this.pointers.get(e.pointerId);
      if (!p) return;
      this.pointers.delete(e.pointerId);
      this.pinchDist = 0;
      if (!cancelled && !p.moved && performance.now() - p.startTime < TAP_MS) {
        this.onTap(e.clientX, e.clientY, p.button);
      }
    };
    canvas.addEventListener('pointerup', (e) => end(e, false));
    canvas.addEventListener('pointercancel', (e) => end(e, true));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.onZoom(Math.sign(e.deltaY));
      },
      { passive: false },
    );
  }

  /** Call once per frame before reading moveX / moveZ / jump. */
  update(): void {
    const k = this.keys;
    this.run = k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(this.joyX, this.joyY) > 0.8;
    this.down = this.crawlButton || k.has('KeyC');
    let x = this.joyX;
    let z = -this.joyY;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) z += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) z -= 1;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    this.moveX = x;
    this.moveZ = z;
    this.jump = this.jumpButton || this.jumpTapped || k.has('Space');
    this.jumpTapped = false;
  }
}

function capture(el: HTMLElement, pointerId: number): void {
  try {
    el.setPointerCapture(pointerId);
  } catch {
    // The pointer is already gone; the control still works without capture.
  }
}
