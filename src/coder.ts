/**
 * "Program Bolt": a first taste of coding. The player lines up picture commands, presses play,
 * and the robot carries them out one by one, leaving blocks behind.
 *
 * In puzzle mode there is a goal: a star some squares away, and the program has to get Bolt
 * onto it. Each solved puzzle sets a slightly harder one from where Bolt stopped.
 */
export type Command = 'F' | 'L' | 'R' | 'B';

const ICONS: Record<Command, string> = { F: '⬆️', L: '↩️', R: '↪️', B: '🧱' };
const MAX_STEPS = 14;
const STEP_SECONDS = 0.38;
/** Where each puzzle's star is, as squares forward and squares to the left of Bolt. */
const PUZZLES: [number, number][] = [[2, 0], [3, 0], [2, 1], [2, -2], [0, 3], [3, 3], [-2, 2], [4, -1], [3, -3], [1, 4]];
// Quarter turns anticlockwise from +z: +z, +x, -z, -x.
const DX = [0, 1, 0, -1];
const DZ = [1, 0, -1, 0];

interface Cell {
  x: number;
  z: number;
  turns: number;
}

export interface CoderHooks {
  /** Where the robot starts: a grid cell and a heading in quarter turns (0 = +z). */
  origin(): Cell;
  /** Move the robot to a cell, facing a heading. */
  move(x: number, z: number, turns: number): void;
  /** Put a block down in a cell. */
  place(x: number, z: number): void;
  /** Bolt is busy with a program or waiting at a puzzle, so he should not follow the player. */
  busy(on: boolean): void;
  /** Show the puzzle's star in a cell, or hide it with null. */
  goal(cell: { x: number; z: number } | null): void;
  /** A puzzle was solved. */
  solved(level: number): void;
  /** A run finished without reaching the star. */
  missed(): void;
}

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

export class Coder {
  private program: Command[] = [];
  private repeat = 1;
  private queue: Command[] = [];
  private timer = 0;
  private at: Cell = { x: 0, z: 0, turns: 0 };
  /** In puzzle mode: where Bolt starts each attempt, and the star to reach. */
  private start: Cell | null = null;
  private target: { x: number; z: number } | null = null;
  private level = 0;
  private readonly panel = el('code');
  private readonly strip = el('code-strip');
  private readonly repeatBtn = el('code-repeat');
  private readonly goalBtn = el('code-goal');

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
    this.goalBtn.addEventListener('click', () => {
      if (!this.isRunning) this.setPuzzle(!this.start);
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
    if (!on) this.setPuzzle(false);
  }

  /** Turn puzzle mode on (a star appears, Bolt waits at the start) or off. */
  private setPuzzle(on: boolean): void {
    if (on) {
      this.start = this.hooks.origin();
      this.hooks.move(this.start.x, this.start.z, this.start.turns);
      this.aim();
      this.hooks.busy(true);
    } else {
      this.start = null;
      this.target = null;
      this.hooks.goal(null);
      if (!this.isRunning) this.hooks.busy(false);
    }
    this.program = [];
    this.render();
  }

  /** Place the star for the current level, measured from where Bolt is standing. */
  private aim(): void {
    if (!this.start) return;
    const [forward, left] = PUZZLES[this.level % PUZZLES.length];
    const side = (this.start.turns + 1) % 4;
    this.target = {
      x: this.start.x + DX[this.start.turns] * forward + DX[side] * left,
      z: this.start.z + DZ[this.start.turns] * forward + DZ[side] * left,
    };
    this.hooks.goal(this.target);
  }

  private render(): void {
    this.strip.textContent = this.program.map((c) => ICONS[c]).join(' ') || '…';
    this.repeatBtn.textContent = `🔁 ${this.repeat}`;
    this.goalBtn.textContent = this.start ? `🎯 ${this.level + 1}` : '🎯';
    this.goalBtn.classList.toggle('on', this.start !== null);
  }

  private run(): void {
    if (this.isRunning || this.program.length === 0) return;
    this.at = { ...(this.start ?? this.hooks.origin()) };
    for (let i = 0; i < this.repeat; i++) this.queue.push(...this.program);
    this.timer = 0;
    this.hooks.move(this.at.x, this.at.z, this.at.turns);
    this.hooks.busy(true);
  }

  private finish(): void {
    if (!this.start || !this.target) {
      this.hooks.busy(false);
      return;
    }
    if (this.at.x === this.target.x && this.at.z === this.target.z) {
      // Solved: the next puzzle starts from where Bolt is standing now.
      this.level++;
      this.hooks.solved(this.level);
      this.start = { ...this.at };
      this.program = [];
      this.aim();
    } else {
      // Not there yet: back to the start to try again, keeping the program to fix.
      this.hooks.missed();
      this.hooks.move(this.start.x, this.start.z, this.start.turns);
    }
    this.render();
  }

  /** Carry out the next command when its turn comes. Call every frame. */
  update(dt: number): void {
    if (!this.isRunning) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = STEP_SECONDS;
    const cmd = this.queue.shift() as Command;
    if (cmd === 'L') this.at.turns = (this.at.turns + 1) % 4;
    else if (cmd === 'R') this.at.turns = (this.at.turns + 3) % 4;
    else if (cmd === 'F') {
      this.at.x += DX[this.at.turns];
      this.at.z += DZ[this.at.turns];
    } else this.hooks.place(this.at.x, this.at.z);
    this.hooks.move(this.at.x, this.at.z, this.at.turns);
    if (!this.isRunning) this.finish();
  }
}
