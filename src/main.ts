import * as THREE from 'three';
import './style.css';
import { loadAssets, type Assets } from './assets';
import { Terrain, groundAt, SEA_LEVEL } from './terrain';
import { Blocks, HOTBAR, BLOCK_COLORS } from './blocks';
import { type Body, moveBody, bodyTouchesCell } from './physics';
import { Input } from './input';
import { Animals } from './animals';
import { sfx, speak, unlockAudio } from './audio';
import { makeRobot, makeClouds } from './models';

const SAVE_KEY = 'oliverblox-save-v2';
const WALK_SPEED = 4.2;
const RUN_SPEED = 9;
const CRAWL_SPEED = 1.9;
const SWIM_SPEED = 3.4;
const FLY_SPEED = 16;
const JUMP_SPEED = 9.8;
const CAR_MAX = 18;
const CAR_SCALE = 2;
/** Water deeper than this is for swimming, shallower is for wading. */
const SWIM_DEPTH = 1.3;
/** Where the feet float while swimming, so the head stays above water. */
const SWIM_Y = SEA_LEVEL - 1.5;
const STAND_H = 2.1;
const CRAWL_H = 1;
const HORIZON = 0xb5dcff;

interface Save {
  v: 2;
  blocks: [number, number, number, number][];
  stars: string[];
  player: [number, number, number];
  car: [number, number, number];
}

function loadSave(): Save | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const s = raw ? (JSON.parse(raw) as Save) : null;
    return s && s.v === 2 ? s : null;
  } catch {
    return null;
  }
}

function $<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

// ---------- renderer, sky and light ----------

const canvas = $<HTMLCanvasElement>('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(HORIZON, 115, 198);
const camera = new THREE.PerspectiveCamera(62, 1, 0.2, 1500);

const sky = new THREE.Mesh(
  new THREE.SphereGeometry(1000, 24, 12),
  new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(0x2674f0) },
      bottom: { value: new THREE.Color(HORIZON) },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top;
      uniform vec3 bottom;
      varying vec3 vDir;
      void main() {
        float h = clamp(normalize(vDir).y * 2.4, 0.0, 1.0);
        gl_FragColor = vec4(mix(bottom, top, pow(h, 0.6)), 1.0);
        #include <colorspace_fragment>
      }`,
  }),
);
scene.add(sky);

scene.add(new THREE.HemisphereLight(0xdcefff, 0x9c9074, 1.25));
const sun = new THREE.DirectionalLight(0xfff3d6, 2.1);
sun.castShadow = true;
sun.shadow.mapSize.setScalar(isTouch ? 1024 : 2048);
sun.shadow.camera.left = sun.shadow.camera.bottom = -55;
sun.shadow.camera.right = sun.shadow.camera.top = 55;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 320;
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.5;
scene.add(sun, sun.target);
const SUN_OFFSET = new THREE.Vector3(70, 120, 45);

const water = new THREE.Mesh(
  new THREE.PlaneGeometry(3000, 3000),
  new THREE.MeshLambertMaterial({ color: 0x1f9bea, transparent: true, opacity: 0.8, depthWrite: false }),
);
water.rotation.x = -Math.PI / 2;
water.position.y = SEA_LEVEL;
water.renderOrder = 1;
const clouds = makeClouds();
scene.add(water, clouds);

// ---------- state ----------

const save = loadSave();
const collected = new Set<string>(save?.stars ?? []);
const blocks = new Blocks(scene);
if (save) blocks.load(save.blocks);

const player: Body = {
  pos: new THREE.Vector3(0, groundAt(0, 0), 0),
  vel: new THREE.Vector3(),
  hw: 0.4,
  h: STAND_H,
  onGround: true,
};
const carPos = new THREE.Vector3(9, groundAt(9, 7), 7);
let carHeading = Math.PI / 2;
let carSpeed = 0;
if (save) {
  player.pos.fromArray(save.player);
  player.pos.y = Math.max(player.pos.y, groundAt(player.pos.x, player.pos.z));
  carPos.set(save.car[0], 0, save.car[1]);
  carPos.y = groundAt(carPos.x, carPos.z);
  carHeading = save.car[2];
}

let started = false;
let dirty = false;
let resetting = false;
let driving = false;
let flying = false;
let crawling = false;
let swimming = false;
let facing = 0;
let airTime = 0;
let cheerUntil = 0;

let camYaw = Math.PI;
let camPitch = 0.38;
let camDist = 10;
const camTarget = new THREE.Vector3().copy(player.pos).setY(player.pos.y + 1.8);

// ---------- HUD ----------

const starCountEl = $('star-count');
const starsEl = $('stars');
const jumpEl = $('jump');
const crawlEl = $('crawl');
const flyEl = $('fly');
const actionEl = $('action');
const bubble = $('bubble');
starCountEl.textContent = String(collected.size);

/** 0 is the pickaxe; 1.. are HOTBAR blocks. */
let tool = 1;
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
  $('hotbar').appendChild(b);
  toolButtons.push(b);
}
selectTool(tool);

// ---------- input ----------

const input = new Input(canvas, $('joystick'), $('knob'), jumpEl, crawlEl);
input.onDrag = (dx, dy) => {
  camYaw -= dx * 0.006;
  camPitch = Math.min(1.4, Math.max(-0.15, camPitch + dy * 0.005));
};
input.onZoom = (amount) => {
  camDist = Math.min(24, Math.max(5, camDist + amount));
};
input.onHotkey = (n) => selectTool(n - 1);

function setFlying(on: boolean): void {
  flying = on;
  if (on) setCrawling(false);
  player.vel.set(0, 0, 0);
  flyEl.classList.toggle('on', on);
  crawlEl.textContent = on ? '⬇️' : '🐛';
  sfx.door();
}

function setCrawling(on: boolean): void {
  // Only stand back up where there is headroom.
  if (!on && blocks.collides(player.pos.x, player.pos.y, player.pos.z, player.hw, STAND_H)) return;
  crawling = on;
  player.h = on ? CRAWL_H : STAND_H;
  crawlEl.classList.toggle('on', on);
}

input.onFly = () => {
  if (started && !driving) setFlying(!flying);
};
flyEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input.onFly();
});
input.onCrawl = () => {
  if (started && !driving && !flying && !swimming) setCrawling(!crawling);
};

// ---------- start screen ----------

function start(): void {
  if (started || !game) return;
  started = true;
  unlockAudio();
  $('start').hidden = true;
  $('hud').hidden = false;
  speak('Hi! I am Bolt! Let us go exploring!');
  bubbleUntil = performance.now() / 1000 + 5;
}
$('play').addEventListener('click', start);

function saveNow(): void {
  if (!dirty || resetting || !game) return;
  dirty = false;
  const s: Save = {
    v: 2,
    blocks: blocks.save(),
    stars: [...collected],
    player: [player.pos.x, player.pos.y, player.pos.z],
    car: [carPos.x, carPos.z, carHeading],
  };
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked: keep playing, the world just will not persist.
  }
}
window.setInterval(saveNow, 3000);
const saveOnLeave = (): void => {
  dirty = true;
  saveNow();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) saveOnLeave();
});
window.addEventListener('pagehide', saveOnLeave);

// The reset is for grown-ups: it needs a long press and then a confirmation.
const gear = $('gear');
let gearTimer = 0;
gear.addEventListener('pointerdown', () => {
  gearTimer = window.setTimeout(() => {
    if (window.confirm('Start over? This erases the blocks built, the stars found and where you are.')) {
      resetting = true;
      localStorage.removeItem(SAVE_KEY);
      location.reload();
    }
  }, 1500);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
  gear.addEventListener(ev, () => window.clearTimeout(gearTimer));
}

// ---------- the game proper, built once the models have loaded ----------

interface Game {
  frame(dt: number, time: number): void;
}
let game: Game | null = null;
let bubbleUntil = 0;

function createGame(assets: Assets): Game {
  const terrain = new Terrain(scene, assets.props, collected);
  const animals = new Animals(scene, assets.pets);
  // Have the ground under our feet before the first frame.
  terrain.update(player.pos.x, player.pos.z, 25);

  // ---- player character ----
  const avatar = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.position.y = 1.1;
  assets.character.position.y = -1.1;
  tilt.add(assets.character);
  avatar.add(tilt);
  scene.add(avatar);

  const mixer = new THREE.AnimationMixer(assets.character);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const name of [
    'Idle_A',
    'Walking_A',
    'Running_A',
    'Jump_Idle',
    'Crawling',
    'Crouching',
    'Cheering',
  ]) {
    const clip = assets.clips.get(name);
    if (clip) actions.set(name, mixer.clipAction(clip));
  }
  let current = '';
  const play = (name: string, speed = 1): void => {
    const next = actions.get(name);
    if (!next) return;
    next.timeScale = speed;
    if (name === current) return;
    actions.get(current)?.fadeOut(0.18);
    next.reset().fadeIn(0.18).play();
    current = name;
  };
  play('Idle_A');

  // ---- car ----
  const car = new THREE.Group();
  assets.car.scale.setScalar(CAR_SCALE);
  car.add(assets.car);
  car.rotation.order = 'YXZ';
  scene.add(car);
  const wheels: THREE.Object3D[] = [];
  assets.car.traverse((o) => {
    if (o.name.startsWith('wheel')) wheels.push(o);
  });
  // The model's wheels sit a little below its origin.
  const carLift = 0.3 * CAR_SCALE;

  // ---- Bolt, the robot friend who tags along ----
  const robot = makeRobot();
  robot.scale.setScalar(0.6);
  robot.traverse((o) => {
    o.castShadow = true;
  });
  robot.position.copy(player.pos).add(new THREE.Vector3(2, 2, -2));
  scene.add(robot);
  const boltWant = new THREE.Vector3();
  const boltHead = new THREE.Vector3();

  const nearCar = (): boolean => player.pos.distanceTo(carPos) < 5;

  function enterCar(): void {
    setFlying(false);
    setCrawling(false);
    driving = true;
    carSpeed = 0;
    avatar.visible = false;
  }

  function exitCar(): void {
    driving = false;
    carSpeed = 0;
    // Step out on the left side of the car.
    player.pos.set(carPos.x + Math.cos(carHeading) * 3, 0, carPos.z - Math.sin(carHeading) * 3);
    player.pos.y = Math.max(groundAt(player.pos.x, player.pos.z), SWIM_Y);
    player.vel.set(0, 0, 0);
    avatar.visible = true;
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

  // ---- building ----
  const ray = new THREE.Vector3();
  input.onTap = (px, py, button) => {
    if (!started || driving) return;
    ray
      .set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1, 0.5)
      .unproject(camera)
      .sub(camera.position)
      .normalize();
    const hit = blocks.raycast(camera.position, ray, flying ? 90 : 45);
    if (!hit) return;
    const reach = flying ? 60 : 18;
    if (Math.hypot(hit.x + 0.5 - player.pos.x, hit.y + 0.5 - player.pos.y - 1, hit.z + 0.5 - player.pos.z) > reach) {
      return;
    }
    if (tool === 0 || button === 2) {
      if (hit.kind === 'block' && blocks.set(hit.x, hit.y, hit.z, 0)) {
        sfx.remove();
        dirty = true;
      }
      return;
    }
    if (bodyTouchesCell(player, hit.px, hit.py, hit.pz)) return;
    if (blocks.set(hit.px, hit.py, hit.pz, HOTBAR[tool - 1])) {
      sfx.place();
      dirty = true;
    }
  };

  // ---- per-frame updates ----
  let wasJump = false;
  let tiltNow = 0;
  let liftNow = 0;

  function updatePlayer(dt: number, time: number): void {
    const { pos, vel } = player;
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    // Camera-relative movement: forward is away from the camera.
    const mx = -sin * input.moveZ + cos * input.moveX;
    const mz = -cos * input.moveZ - sin * input.moveX;
    const moving = Math.hypot(mx, mz) > 0.1;
    if (moving) facing = Math.atan2(mx, mz);
    const ground = groundAt(pos.x, pos.z);
    const before = pos.clone();

    if (flying) {
      // God mode: no gravity, no walls, straight over mountains and sea.
      const speed = FLY_SPEED * (input.run ? 2 : 1);
      vel.set(mx * speed, ((input.jump ? 1 : 0) - (input.down ? 1 : 0)) * 11, mz * speed);
      pos.addScaledVector(vel, dt);
      pos.y = Math.max(pos.y, groundAt(pos.x, pos.z) + 0.1, SWIM_Y);
      player.onGround = false;
      swimming = false;
    } else {
      swimming = ground < SEA_LEVEL - SWIM_DEPTH && pos.y < SWIM_Y + 0.35;
      if (swimming) {
        if (crawling) setCrawling(false);
        vel.set(mx * SWIM_SPEED, 0, mz * SWIM_SPEED);
        pos.y += (SWIM_Y - pos.y) * Math.min(1, 6 * dt);
        moveBody(player, dt, blocks, false);
      } else {
        let speed = crawling ? CRAWL_SPEED : input.run ? RUN_SPEED : WALK_SPEED;
        if (ground < SEA_LEVEL - 0.4) speed *= 0.6;
        vel.x = mx * speed;
        vel.z = mz * speed;
        if (input.jump && player.onGround && !crawling) {
          vel.y = JUMP_SPEED;
          player.onGround = false;
          sfx.jump();
        }
        moveBody(player, dt, blocks, true);
      }
      terrain.collide(pos, player.hw);
    }
    if (!before.equals(pos)) dirty = true;
    airTime = player.onGround || swimming ? 0 : airTime + dt;

    // ---- pose and animation ----
    avatar.position.copy(pos);
    let diff = facing - avatar.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    avatar.rotation.y += diff * Math.min(1, 12 * dt);

    let wantTilt = 0;
    let wantLift = 0;
    if (flying) {
      play('Jump_Idle');
      wantTilt = moving ? 1.05 : 0;
    } else if (swimming) {
      // Paddle along the surface when moving, tread water when still.
      play(moving ? 'Crawling' : 'Jump_Idle', moving ? 1.3 : 0.6);
      wantLift = moving ? 1.05 : 0;
    } else if (airTime > 0.18) {
      play('Jump_Idle');
    } else if (crawling) {
      play(moving ? 'Crawling' : 'Crouching');
    } else if (moving) {
      const fast = input.run;
      play(fast ? 'Running_A' : 'Walking_A', fast ? 1.15 : 1.1);
    } else {
      play(time < cheerUntil ? 'Cheering' : 'Idle_A');
    }
    tiltNow += (wantTilt - tiltNow) * Math.min(1, 8 * dt);
    liftNow += (wantLift - liftNow) * Math.min(1, 6 * dt);
    tilt.rotation.x = tiltNow;
    tilt.position.y = 1.1 + liftNow;
    mixer.update(dt);
  }

  let carPitch = 0;
  let carRoll = 0;

  function updateCar(dt: number, controlled: boolean): void {
    if (controlled) {
      if (Math.abs(input.moveZ) > 0.1) carSpeed += input.moveZ * 18 * dt;
      else carSpeed *= Math.max(0, 1 - 2.2 * dt);
      carSpeed = Math.min(CAR_MAX, Math.max(-7, carSpeed));
      carHeading -= input.moveX * 2 * dt * Math.min(1, Math.max(-1, carSpeed / 5));
      if (input.jump && !wasJump) sfx.honk();
    } else {
      carSpeed = 0;
    }

    const fx = Math.sin(carHeading);
    const fz = Math.cos(carHeading);
    if (carSpeed !== 0) {
      const nx = carPos.x + fx * carSpeed * dt;
      const nz = carPos.z + fz * carSpeed * dt;
      const g = groundAt(nx, nz);
      // Cars do not drive into deep water or through things built in the way.
      if (g < SEA_LEVEL - 0.9 || blocks.collides(nx, g + 0.7, nz, 1.4, 2)) {
        carSpeed *= -0.25;
      } else {
        carPos.x = nx;
        carPos.z = nz;
        dirty = true;
      }
      if (terrain.collide(carPos, 1.7)) carSpeed *= 1 - Math.min(1, 3 * dt);
    }
    const g = groundAt(carPos.x, carPos.z);
    carPos.y += (g - carPos.y) * Math.min(1, 14 * dt);

    // Lean with the slope by comparing the ground under the bumpers and the doors.
    const front = groundAt(carPos.x + fx * 2.2, carPos.z + fz * 2.2);
    const back = groundAt(carPos.x - fx * 2.2, carPos.z - fz * 2.2);
    const left = groundAt(carPos.x + fz * 1.3, carPos.z - fx * 1.3);
    const right = groundAt(carPos.x - fz * 1.3, carPos.z + fx * 1.3);
    carPitch += (-Math.atan2(front - back, 4.4) - carPitch) * Math.min(1, 8 * dt);
    carRoll += (Math.atan2(left - right, 2.6) - carRoll) * Math.min(1, 8 * dt);

    car.position.copy(carPos).setY(carPos.y + carLift);
    car.rotation.set(carPitch, carHeading, carRoll);
    for (const w of wheels) w.rotation.x += (carSpeed * dt) / (0.3 * CAR_SCALE);

    if (controlled) {
      // Keep the camera behind the car so "up" on the stick always means "go".
      let diff = carHeading + Math.PI - camYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      camYaw += diff * Math.min(1, 3 * dt);
    }
  }

  const camOffset = new THREE.Vector3();
  const camWant = new THREE.Vector3();

  function updateCamera(dt: number, who: THREE.Vector3): void {
    camWant.copy(who).setY(who.y + (driving ? 2.6 : crawling ? 1 : 1.9));
    camTarget.lerp(camWant, Math.min(1, 12 * dt));
    const dist = driving ? camDist + 4 : camDist;
    camOffset.set(
      Math.sin(camYaw) * Math.cos(camPitch),
      Math.sin(camPitch),
      Math.cos(camYaw) * Math.cos(camPitch),
    );
    camera.position.copy(camTarget).addScaledVector(camOffset, dist);
    // Never let the camera sink into a hillside or under the sea.
    const floor = Math.max(groundAt(camera.position.x, camera.position.z), SEA_LEVEL) + 0.6;
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(camTarget);
  }

  function updateBolt(dt: number, time: number, who: THREE.Vector3): void {
    // Hover at the player's side as seen by the camera, so Bolt never blocks the view.
    const side = driving ? 3.4 : 2.3;
    boltWant.set(
      who.x + Math.cos(camYaw) * side - Math.sin(camYaw) * 0.8,
      who.y + 1.5 + Math.sin(time * 2.4) * 0.15,
      who.z - Math.sin(camYaw) * side - Math.cos(camYaw) * 0.8,
    );
    if (robot.position.distanceTo(boltWant) > 80) robot.position.copy(boltWant);
    robot.position.lerp(boltWant, Math.min(1, 4 * dt));
    robot.rotation.y = Math.atan2(who.x - robot.position.x, who.z - robot.position.z);

    boltHead.copy(robot.position).setY(robot.position.y + 1.7).project(camera);
    const show = time < bubbleUntil && boltHead.z < 1;
    bubble.hidden = !show;
    if (show) {
      bubble.textContent = `⭐ ${collected.size}`;
      bubble.style.left = `${(boltHead.x * 0.5 + 0.5) * window.innerWidth}px`;
      bubble.style.top = `${(-boltHead.y * 0.5 + 0.5) * window.innerHeight}px`;
    }
  }

  let actionShown = '';

  // Test hook: add ?debug to the address to inspect or move the player from the console.
  if (new URLSearchParams(location.search).has('debug')) {
    Object.assign(window, {
      ob: {
        player,
        carPos,
        groundAt,
        state: () => ({ flying, crawling, swimming, driving, anim: current, stars: collected.size, blocks: blocks.map.size }),
      },
    });
  }

  return {
    frame(dt, time) {
      if (started) {
        if (driving) {
          updateCar(dt, true);
          player.pos.copy(carPos);
        } else {
          updatePlayer(dt, time);
          updateCar(dt, false);
        }
        wasJump = input.jump;

        const who = driving ? carPos : player.pos;
        const found = terrain.collect(who, driving ? 3.5 : 2.2);
        if (found > 0) {
          starCountEl.textContent = String(collected.size);
          starsEl.classList.remove('pop');
          void starsEl.offsetWidth;
          starsEl.classList.add('pop');
          sfx.star();
          // Counting out loud as the stars add up.
          speak(String(collected.size));
          cheerUntil = time + 2.2;
          bubbleUntil = time + 3;
          dirty = true;
        }

        const icon = driving ? '🚶' : nearCar() ? '🚗' : '';
        if (icon !== actionShown) {
          actionShown = icon;
          actionEl.hidden = icon === '';
          actionEl.textContent = icon;
          jumpEl.textContent = driving ? '📣' : '⬆️';
          crawlEl.hidden = flyEl.hidden = driving;
        }
      } else {
        // Slow orbit behind the start screen.
        camYaw += dt * 0.12;
        avatar.position.copy(player.pos);
        mixer.update(dt);
        updateCar(dt, false);
      }

      const who = driving ? carPos : player.pos;
      terrain.update(who.x, who.z, 2);
      animals.update(dt, who);
      for (const s of terrain.stars) {
        const mesh = s.group.children[0];
        mesh.rotation.y = time * 2;
        mesh.position.y = Math.sin(time * 3 + s.pos.x) * 0.25;
      }
      updateCamera(dt, who);
      updateBolt(dt, time, who);

      // Sky, sea, clouds and the sun's shadow all travel with the player.
      sky.position.copy(camera.position);
      water.position.x = who.x;
      water.position.z = who.z;
      sun.target.position.copy(who);
      sun.position.copy(who).add(SUN_OFFSET);
      for (const c of clouds.children) {
        c.position.x += dt * 1.5;
        if (c.position.x - who.x > 320) c.position.x -= 640;
        if (c.position.x - who.x < -320) c.position.x += 640;
        if (c.position.z - who.z > 320) c.position.z -= 640;
        if (c.position.z - who.z < -320) c.position.z += 640;
      }
    },
  };
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
function loop(now: number): void {
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  input.update();
  if (game) {
    game.frame(dt, now / 1000);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

loadAssets((fraction) => {
  $('loading-bar').style.width = `${Math.round(fraction * 100)}%`;
})
  .then((assets) => {
    game = createGame(assets);
    $('loading').hidden = true;
    $('play').hidden = false;
    if (new URLSearchParams(location.search).has('autostart')) start();
  })
  .catch((err: unknown) => {
    console.error(err);
    $('loading').textContent = '⚠️';
  });
