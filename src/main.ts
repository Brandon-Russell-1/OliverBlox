import * as THREE from 'three';
import './style.css';
import { World, SY, CENTER, GROUND, WATER_Y, AIR, HOTBAR, BLOCK_COLORS, mulberry32 } from './world';
import { type Body, moveBody, bodyFits, bodyTouchesCell } from './physics';
import { Input } from './input';
import { sfx, speak, unlockAudio } from './audio';
import { makeAvatar, makeCar, makeRobot, makeStar, makeClouds } from './models';

const SAVE_KEY = 'oliverblox-save-v1';
const STAR_COUNT = 10;
const REACH = 14;
const WALK_SPEED = 5.2;
const JUMP_SPEED = 8.6;
const CAR_MAX = 11;
const SKY = 0x8fd3ff;

interface Save {
  v: 1;
  edits: [number, number][];
  round: number;
  got: number[];
  player: [number, number, number];
  car: [number, number, number, number];
}

function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const s = raw ? (JSON.parse(raw) as Save) : null;
    return s && s.v === 1 ? s : null;
  } catch {
    return null;
  }
}

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

// ---------- scene ----------

const canvas = $<HTMLCanvasElement>('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(SKY);
scene.fog = new THREE.Fog(SKY, 70, 170);

const camera = new THREE.PerspectiveCamera(65, 1, 0.1, 500);

scene.add(new THREE.HemisphereLight(0xffffff, 0x9a8f78, 1.7));
const sun = new THREE.DirectionalLight(0xfff4d6, 1.9);
sun.position.set(0.5, 1, 0.3);
scene.add(sun);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(700, 700),
  new THREE.MeshLambertMaterial({ color: 0x2f9be6, transparent: true, opacity: 0.72 }),
);
water.rotation.x = -Math.PI / 2;
water.position.set(CENTER, WATER_Y, CENTER);
const seabed = new THREE.Mesh(
  new THREE.PlaneGeometry(700, 700),
  new THREE.MeshLambertMaterial({ color: 0xd9c98a }),
);
seabed.rotation.x = -Math.PI / 2;
seabed.position.set(CENTER, 1.9, CENTER);
const clouds = makeClouds();
scene.add(seabed, water, clouds);

// ---------- world and saved state ----------

const save = loadSave();
const world = new World(scene);
if (save) world.applyEdits(save.edits);
world.rebuild();

const player: Body = {
  pos: new THREE.Vector3(CENTER + 5.5, GROUND, CENTER + 6.5),
  vel: new THREE.Vector3(),
  hw: 0.3,
  h: 1.75,
  onGround: false,
};
const carBody: Body = {
  pos: new THREE.Vector3(CENTER + 0.5, GROUND, CENTER + 14.5),
  vel: new THREE.Vector3(),
  hw: 0.9,
  h: 1.4,
  onGround: false,
};
let carHeading = Math.PI / 2;
let carSpeed = 0;
let driving = false;

if (save) {
  player.pos.fromArray(save.player);
  carBody.pos.set(save.car[0], save.car[1], save.car[2]);
  carHeading = save.car[3];
  // If something was built where we were standing, pop up on top of it.
  for (const b of [player, carBody]) {
    while (!bodyFits(world, b.pos, b.hw, b.h) && b.pos.y < SY) b.pos.y = Math.floor(b.pos.y) + 1;
  }
}

const avatar = makeAvatar();
const car = makeCar();
const robot = makeRobot();
const robotPos = new THREE.Vector3(CENTER + 2.5, GROUND, CENTER + 4.5);
robot.position.copy(robotPos);
scene.add(avatar.group, car.group, robot);
let facing = Math.PI;
let walkPhase = 0;

// ---------- stars ----------

let round = save?.round ?? 0;
const got = new Set<number>(save?.got ?? []);
let stars: { mesh: THREE.Mesh; pos: THREE.Vector3; index: number }[] = [];
const starCountEl = $('star-count');
const starsEl = $('stars');

function spawnStars(): void {
  for (const s of stars) scene.remove(s.mesh);
  stars = [];
  const spots = world.findSpots(mulberry32(1000 + round * 7919), STAR_COUNT);
  spots.forEach((pos, index) => {
    if (got.has(index)) return;
    const mesh = makeStar();
    mesh.position.copy(pos).setY(pos.y + 1.1);
    scene.add(mesh);
    stars.push({ mesh, pos, index });
  });
  starCountEl.textContent = `${got.size}/${STAR_COUNT}`;
}
spawnStars();

function collectStar(i: number): void {
  const s = stars[i];
  scene.remove(s.mesh);
  stars.splice(i, 1);
  got.add(s.index);
  starCountEl.textContent = `${got.size}/${STAR_COUNT}`;
  starsEl.classList.remove('pop');
  void starsEl.offsetWidth;
  starsEl.classList.add('pop');
  dirty = true;

  if (got.size < STAR_COUNT) {
    sfx.star();
    // Counting out loud as he collects.
    speak(String(got.size));
    return;
  }
  sfx.win();
  speak('Wow! You found all ten stars!');
  window.setTimeout(() => {
    round++;
    got.clear();
    spawnStars();
    dirty = true;
    speak('Here are ten more stars. Can you find them?');
  }, 4500);
}

// ---------- hotbar ----------

/** 0 is the pickaxe; 1.. are HOTBAR blocks. */
let tool = 1;
const hotbarEl = $('hotbar');
const toolButtons: HTMLButtonElement[] = [];

function selectTool(n: number): void {
  if (n < 0 || n > HOTBAR.length) return;
  tool = n;
  toolButtons.forEach((b, i) => b.classList.toggle('selected', i === n));
}

for (let i = 0; i <= HOTBAR.length; i++) {
  const b = document.createElement('button');
  if (i === 0) b.textContent = '⛏️';
  else b.style.background = `#${BLOCK_COLORS[HOTBAR[i - 1]].toString(16).padStart(6, '0')}`;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    selectTool(i);
  });
  hotbarEl.appendChild(b);
  toolButtons.push(b);
}
selectTool(tool);

// ---------- input ----------

const jumpEl = $('jump');
const actionEl = $('action');
const input = new Input(canvas, $('joystick'), $('knob'), jumpEl);
if (window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) {
  document.body.classList.add('touch');
}

let camYaw = 0;
let camPitch = 0.45;
let camDist = 8;
let camDistNow = 8;
const camTarget = new THREE.Vector3().copy(player.pos).setY(player.pos.y + 1.5);
let started = false;
let dirty = false;

input.onDrag = (dx, dy) => {
  camYaw -= dx * 0.006;
  camPitch = Math.min(1.35, Math.max(0.08, camPitch + dy * 0.005));
};
input.onZoom = (amount) => {
  camDist = Math.min(16, Math.max(4, camDist + amount));
};
input.onHotkey = (n) => selectTool(n - 1);

function nearCar(): boolean {
  return player.pos.distanceTo(carBody.pos) < 3.6;
}

function enterCar(): void {
  driving = true;
  carSpeed = 0;
  avatar.group.visible = false;
  sfx.door();
}

function exitCar(): void {
  // Step out to the side; if every side is blocked, climb out onto the roof.
  const side = new THREE.Vector3(Math.cos(carHeading), 0, -Math.sin(carHeading));
  const fwd = new THREE.Vector3(Math.sin(carHeading), 0, Math.cos(carHeading));
  const tries = [side.clone().multiplyScalar(1.6), side.clone().multiplyScalar(-1.6), fwd.clone().multiplyScalar(-2.2)];
  let out = carBody.pos.clone().setY(carBody.pos.y + carBody.h + 0.1);
  for (const t of tries) {
    const p = carBody.pos.clone().add(t);
    if (bodyFits(world, p, player.hw, player.h)) {
      out = p;
      break;
    }
  }
  player.pos.copy(out);
  player.vel.set(0, 0, 0);
  driving = false;
  carSpeed = 0;
  avatar.group.visible = true;
  sfx.door();
}

input.onAction = () => {
  if (!started) return;
  if (driving) exitCar();
  else if (nearCar()) enterCar();
  dirty = true;
};
actionEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input.onAction();
});

const tapRay = new THREE.Vector3();
input.onTap = (px, py, button) => {
  if (!started || driving) return;
  tapRay
    .set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1, 0.5)
    .unproject(camera)
    .sub(camera.position)
    .normalize();
  const hit = world.raycast(camera.position, tapRay, 80);
  if (!hit) return;
  const dx = hit.x + 0.5 - player.pos.x;
  const dy = hit.y + 0.5 - (player.pos.y + 1);
  const dz = hit.z + 0.5 - player.pos.z;
  if (Math.hypot(dx, dy, dz) > REACH) return;

  if (tool === 0 || button === 2) {
    if (world.edit(hit.x, hit.y, hit.z, AIR)) {
      sfx.remove();
      dirty = true;
    }
    return;
  }
  const { px: x, py: y, pz: z } = hit;
  if (bodyTouchesCell(player, x, y, z) || bodyTouchesCell(carBody, x, y, z)) return;
  if (world.edit(x, y, z, HOTBAR[tool - 1])) {
    sfx.place();
    dirty = true;
  }
};

// ---------- start, save, reset ----------

function start(): void {
  if (started) return;
  started = true;
  unlockAudio();
  $('start').hidden = true;
  $('hud').hidden = false;
}
$('play').addEventListener('click', start);
if (new URLSearchParams(location.search).has('autostart')) start();

let resetting = false;

function saveNow(): void {
  if (!dirty || resetting) return;
  dirty = false;
  const s: Save = {
    v: 1,
    edits: [...world.edits],
    round,
    got: [...got],
    player: [player.pos.x, player.pos.y, player.pos.z],
    car: [carBody.pos.x, carBody.pos.y, carBody.pos.z, carHeading],
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked: keep playing, the world just will not persist.
  }
}
window.setInterval(saveNow, 3000);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    dirty = true;
    saveNow();
  }
});
window.addEventListener('pagehide', () => {
  dirty = true;
  saveNow();
});

// The reset is for grown-ups: it needs a long press and then a confirmation.
const gear = $('gear');
let gearTimer = 0;
gear.addEventListener('pointerdown', () => {
  gearTimer = window.setTimeout(() => {
    if (window.confirm('Start a brand new world? Everything built in this one will be erased.')) {
      resetting = true;
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    }
  }, 1500);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
  gear.addEventListener(ev, () => window.clearTimeout(gearTimer));
}

// ---------- Bolt the robot ----------

const bubble = $('bubble');
let boltNear = false;
let bubbleUntil = 0;
const boltHead = new THREE.Vector3();

function updateBolt(time: number, who: THREE.Vector3): void {
  robot.position.y = robotPos.y + Math.abs(Math.sin(time * 2.2)) * 0.08;
  robot.rotation.y = Math.atan2(who.x - robotPos.x, who.z - robotPos.z);

  const near = who.distanceTo(robotPos) < 4;
  if (near && !boltNear && started) {
    const left = STAR_COUNT - got.size;
    speak(
      left === STAR_COUNT
        ? 'Hi! I am Bolt! Can you find ten stars?'
        : `Hi again! ${left} more ${left === 1 ? 'star' : 'stars'} to find!`,
    );
    bubble.textContent = `⭐ × ${left}`;
    bubbleUntil = time + 5;
  }
  boltNear = near;

  boltHead.copy(robot.position).setY(robot.position.y + 2.5).project(camera);
  const show = time < bubbleUntil && boltHead.z < 1;
  bubble.hidden = !show;
  if (show) {
    bubble.style.left = `${(boltHead.x * 0.5 + 0.5) * window.innerWidth}px`;
    bubble.style.top = `${(-boltHead.y * 0.5 + 0.5) * window.innerHeight}px`;
  }
}

// ---------- per-frame updates ----------

let wasJump = false;

function updatePlayer(dt: number): void {
  const sin = Math.sin(camYaw);
  const cos = Math.cos(camYaw);
  // Camera-relative movement: forward is away from the camera.
  const mx = -sin * input.moveZ + cos * input.moveX;
  const mz = -cos * input.moveZ - sin * input.moveX;
  player.vel.x = mx * WALK_SPEED;
  player.vel.z = mz * WALK_SPEED;
  const moving = Math.hypot(mx, mz) > 0.1;
  if (moving) facing = Math.atan2(mx, mz);

  if (input.jump && player.onGround) {
    player.vel.y = JUMP_SPEED;
    player.onGround = false;
    sfx.jump();
  }
  const before = player.pos.clone();
  moveBody(world, player, dt);
  if (!before.equals(player.pos)) dirty = true;

  avatar.group.position.copy(player.pos);
  // Turn smoothly toward the direction of travel.
  let diff = facing - avatar.group.rotation.y;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  avatar.group.rotation.y += diff * Math.min(1, 14 * dt);

  if (moving) walkPhase += dt * 11;
  const swing = moving ? Math.sin(walkPhase) * 0.8 : 0;
  avatar.legL.rotation.x = swing;
  avatar.legR.rotation.x = -swing;
  // Arms go up for a real jump or fall, not for the tiny drops of walking downhill.
  const airborne = !player.onGround && Math.abs(player.vel.y) > 3;
  avatar.armL.rotation.x = airborne ? -2.6 : -swing;
  avatar.armR.rotation.x = airborne ? -2.6 : swing;
}

function updateCar(dt: number, controlled: boolean): void {
  if (controlled) {
    if (Math.abs(input.moveZ) > 0.1) carSpeed += input.moveZ * 14 * dt;
    else carSpeed *= Math.max(0, 1 - 2.5 * dt);
    carSpeed = Math.min(CAR_MAX, Math.max(-5, carSpeed));
    carHeading -= input.moveX * 2.3 * dt * Math.min(1, Math.max(-1, carSpeed / 4));
    if (input.jump && !wasJump) sfx.honk();
  } else {
    carSpeed = 0;
  }
  carBody.vel.x = Math.sin(carHeading) * carSpeed;
  carBody.vel.z = Math.cos(carHeading) * carSpeed;

  const bx = carBody.pos.x;
  const bz = carBody.pos.z;
  moveBody(world, carBody, dt);
  const moved = Math.hypot(carBody.pos.x - bx, carBody.pos.z - bz);
  // Bumped into something: lose most of the speed instead of grinding against it.
  if (Math.abs(carSpeed) > 1 && moved < Math.abs(carSpeed) * dt * 0.3) carSpeed *= 0.3;
  if (moved > 0) dirty = true;

  car.group.position.copy(carBody.pos);
  car.group.rotation.y = carHeading;
  for (const w of car.wheels) w.rotation.x += (carSpeed * dt) / 0.38;

  if (controlled) {
    // Keep the camera behind the car so "up" on the stick always means "go".
    let diff = carHeading + Math.PI - camYaw;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    camYaw += diff * Math.min(1, 3 * dt);
  }
}

const camOffset = new THREE.Vector3();
const camProbe = new THREE.Vector3();
const camWant = new THREE.Vector3();

function updateCamera(dt: number, who: THREE.Vector3): void {
  camWant.copy(who).setY(who.y + (driving ? 1.9 : 1.5));
  camTarget.lerp(camWant, Math.min(1, 12 * dt));

  const want = driving ? camDist + 2 : camDist;
  camOffset.set(
    Math.sin(camYaw) * Math.cos(camPitch),
    Math.sin(camPitch),
    Math.cos(camYaw) * Math.cos(camPitch),
  );
  // Pull the camera in when a block is between it and the player.
  let clear = want;
  for (let s = 0.6; s <= want; s += 0.25) {
    camProbe.copy(camTarget).addScaledVector(camOffset, s);
    if (world.get(Math.floor(camProbe.x), Math.floor(camProbe.y), Math.floor(camProbe.z)) !== AIR) {
      clear = Math.max(0.7, s - 0.35);
      break;
    }
  }
  camDistNow = clear < camDistNow ? clear : camDistNow + (clear - camDistNow) * Math.min(1, 5 * dt);
  camera.position.copy(camTarget).addScaledVector(camOffset, camDistNow);
  camera.lookAt(camTarget);
}

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

let last = performance.now();
let actionShown = '';

function frame(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  const time = now / 1000;
  input.update();

  if (started) {
    if (driving) {
      updateCar(dt, true);
      player.pos.copy(carBody.pos);
    } else {
      updatePlayer(dt);
      updateCar(dt, false);
    }
    wasJump = input.jump;

    const who = driving ? carBody.pos : player.pos;
    for (let i = stars.length - 1; i >= 0; i--) {
      const s = stars[i];
      if (Math.hypot(s.pos.x - who.x, s.pos.z - who.z) < 1.4 && Math.abs(s.pos.y - who.y) < 2.5) {
        collectStar(i);
      }
    }

    const icon = driving ? '🚶' : nearCar() ? '🚗' : '';
    if (icon !== actionShown) {
      actionShown = icon;
      actionEl.hidden = icon === '';
      actionEl.textContent = icon;
      jumpEl.textContent = driving ? '📣' : '⬆️';
    }
  } else {
    // Slow orbit behind the start screen.
    camYaw += dt * 0.15;
    avatar.group.position.copy(player.pos);
    car.group.position.copy(carBody.pos);
    car.group.rotation.y = carHeading;
  }

  for (const s of stars) {
    s.mesh.rotation.y = time * 2;
    s.mesh.position.y = s.pos.y + 1.1 + Math.sin(time * 3 + s.index) * 0.15;
  }
  for (const c of clouds.children) {
    c.position.x += dt * 1.2;
    if (c.position.x > 190) c.position.x = -90;
  }

  const who = driving ? carBody.pos : player.pos;
  updateCamera(dt, who);
  updateBolt(time, who);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
