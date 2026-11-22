/**
 * "Program Bolt": a first taste of coding. Oliver lines up picture commands, presses play,
 * and the robot carries them out one by one, leaving blocks behind. Sequencing, turning and
 * repeating are the ideas; there is nothing to read.
 */
export type Command = 'F' | 'L' | 'R' | 'B';

const ICONS: Record<Command, string> = { F: '⬆️', L: '↩️', R: '↪️', B: '🧱' };
const MAX_STEPS = 14;
const STEP_SECONDS = 0.38;

export interface CoderHooks {
  /** Where the robot starts: a grid cell and a heading in quarter turns (0 = +z). */
  origin(): { x: number; z: number; turns: number };
  /** Move the robot to a cell, facing a heading. */
  move(x: number, z: number, turns: number): void;
  /** Put a block down in a cell. */
  place(x: number, z: number): void;
  /** Called when a run starts and when it ends. */
  running(on: boolean): void;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export class Coder {
  private program: Command[] = [];
  private repeat = 1;
  private queue: Command[] = [];
  private timer = 0;
  private x = 0;
  private z = 0;
  private turns = 0;
  private readonly panel = el('code');
  private readonly strip = el('code-strip');
  private readonly repeatBtn = el('code-repeat');

  constructor(private readonly hooks: CoderHooks) {
    for (const cmd of Object.keys(ICONS) as Command[]) {
      const b = document.createElement('button');
      b.textContent = ICONS[cmd];
      b.addEventListener('click', () => {
        if (this.program.length < MAX_STEPS && !this.isRunning) {
          this.program.push(cmd);
          this.render();
        }
      });
      el('code-palette').appendChild(b);
    }
    el('code-undo').addEventListener('click', () => {
      this.program.pop();
      this.render();
    });
    this.repeatBtn.addEventListener('click', () => {
      this.repeat = (this.repeat % 4) + 1;
      this.render();
    });
    el('code-run').addEventListener('click', () => this.run());
    el('code-close').addEventListener('click', () => this.toggle(false));
    this.render();
  }

  get isRunning(): boolean {
    return this.queue.length > 0;
  }

  toggle(on = this.panel.hidden): void {
    this.panel.hidden = !on;
  }

  private render(): void {
    this.strip.textContent = this.program.map((c) => ICONS[c]).join(' ') || '…';
    this.repeatBtn.textContent = `🔁 ${this.repeat}`;
  }

  private run(): void {
    if (this.isRunning || this.program.length === 0) return;
    const start = this.hooks.origin();
    this.x = start.x;
    this.z = start.z;
    this.turns = start.turns;
    for (let i = 0; i < this.repeat; i++) this.queue.push(...this.program);
    this.timer = 0;
    this.hooks.move(this.x, this.z, this.turns);
    this.hooks.running(true);
  }

  /** Carry out the next command when its turn comes. Call every frame. */
  update(dt: number): void {
    if (!this.isRunning) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = STEP_SECONDS;
    const cmd = this.queue.shift() as Command;
    if (cmd === 'L') this.turns = (this.turns + 1) % 4;
    else if (cmd === 'R') this.turns = (this.turns + 3) % 4;
    else if (cmd === 'F') {
      // Quarter turns anticlockwise from +z: +z, +x, -z, -x.
      this.x += [0, 1, 0, -1][this.turns];
      this.z += [1, 0, -1, 0][this.turns];
    } else this.hooks.place(this.x, this.z);
    this.hooks.move(this.x, this.z, this.turns);
    if (!this.isRunning) this.hooks.running(false);
  }
}
