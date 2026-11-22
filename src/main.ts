import * as THREE from 'three';
import './style.css';
import { loadAssets, loadModel, CHARACTERS, type Assets } from './assets';
import { Terrain, groundAt, nearestVillage, SEA_LEVEL, VILLAGE_RADIUS, type Village } from './terrain';
import { Blocks, HOTBAR, BLOCK_COLORS } from './blocks';
import { type Body, moveBody, bodyTouchesCell } from './physics';
import { Input } from './input';
import { Animals } from './animals';
import { Actor } from './actor';
import { Enemies, type EnemyContext } from './combat';
import { Chat, PERSONAS, setupParentPanel } from './chat';
import { sfx, speak, unlockAudio } from './audio';
import { makeRobot, makeClouds } from './models';

const SAVE_KEY = 'oliverblox-save-v2';
const HERO_KEY = 'oliverblox-hero';
const WALK_SPEED = 4.2;
const RUN_SPEED = 9;
const CRAWL_SPEED = 1.9;
const SWIM_SPEED = 3.4;
const FLY_SPEED = 16;
const JUMP_SPEED = 9.8;
const CAR_MAX = 18;
const BOAT_MAX = 13;
const VEHICLE_SCALE = 2;
/** Water deeper than this is for swimming, shallower is for wading. */
const SWIM_DEPTH = 1.3;
/** Where the feet float while swimming, so the head stays above water. */
const SWIM_Y = SEA_LEVEL - 1.5;
const STAND_H = 2.1;
const CRAWL_H = 1;
const MAX_HEARTS = 5;
const HORIZON = 0xb5dcff;

/** Hotbar slots before the building blocks. */
const PICKAXE = 0;
const SWORD = 1;
const STAFF = 2;
const FIRST_BLOCK = 3;

const HERO_ANIMS = [
  'Idle_A',
  'Walking_A',
  'Running_A',
  'Jump_Idle',
  'Crawling',
  'Crouching',
  'Cheering',
  'Melee_1H_Attack_Slice_Horizontal',
  'Throw',
  'Hit_A',
];

interface GarageItem {
  name: string;
  kind: 'car' | 'boat';
  icon: string;
}
const GARAGE: GarageItem[] = [
  { name: 'sedan', kind: 'car', icon: '🚗' },
  { name: 'police', kind: 'car', icon: '🚓' },
  { name: 'firetruck', kind: 'car', icon: '🚒' },
  { name: 'taxi', kind: 'car', icon: '🚕' },
  { name: 'tractor', kind: 'car', icon: '🚜' },
  { name: 'race', kind: 'car', icon: '🏎️' },
  { name: 'ambulance', kind: 'car', icon: '🚑' },
  { name: 'truck', kind: 'car', icon: '🛻' },
  { name: 'boat-speed-a', kind: 'boat', icon: '🚤' },
  { name: 'boat-sail-a', kind: 'boat', icon: '⛵' },
  { name: 'boat-row-small', kind: 'boat', icon: '🚣' },
  { name: 'boat-tug-a', kind: 'boat', icon: '🛥️' },
];

/** The people who live in every village: which hero model they use and where they stand. */
const VILLAGERS = [
  { persona: 'mage', model: 'Mage', dx: 7, dz: 5 },
  { persona: 'barbarian', model: 'Barbarian', dx: -8, dz: 4 },
  { persona: 'druid', model: 'Druid', dx: 2, dz: -9 },
];

interface Save {
  v: 2;
  blocks: [number, number, number, number][];
  stars: string[];
  player: [number, number, number];
  car: [number, number, number];
  vehicle?: string;
  /** Stars earned by beating skeletons. */
  bonus?: number;
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
let bonusStars = save?.bonus ?? 0;
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
let now = 0;
let hearts = MAX_HEARTS;

let camYaw = Math.PI;
let camPitch = 0.38;
let camDist = 10;
const camTarget = new THREE.Vector3().copy(player.pos).setY(player.pos.y + 1.8);

// ---------- HUD ----------

const starCountEl = $('star-count');
const starsEl = $('stars');
const heartsEl = $('hearts');
const jumpEl = $('jump');
const crawlEl = $('crawl');
const flyEl = $('fly');
const attackEl = $('attack');
const actionEl = $('action');
const bubble = $('bubble');
const garageEl = $('garage');

const starTotal = (): number => collected.size + bonusStars;
function showStars(pop: boolean): void {
  starCountEl.textContent = String(starTotal());
  if (!pop) return;
  starsEl.classList.remove('pop');
  void starsEl.offsetWidth;
  starsEl.classList.add('pop');
}
function showHearts(): void {
  heartsEl.textContent = '❤️'.repeat(hearts) + '🤍'.repeat(MAX_HEARTS - hearts);
}
showStars(false);
showHearts();

let tool = SWORD;
let onToolChange: () => void = () => {};
const toolButtons: HTMLButtonElement[] = [];
function selectTool(n: number): void {
  if (n < 0 || n >= FIRST_BLOCK + HOTBAR.length) return;
  tool = n;
  toolButtons.forEach((b, i) => b.classList.toggle('selected', i === n));
  attackEl.hidden = driving || (tool !== SWORD && tool !== STAFF);
  onToolChange();
}
['⛏️', '🗡️', '🪄'].concat(HOTBAR.map(() => '')).forEach((icon, i) => {
  const b = document.createElement('button');
  if (icon) b.textContent = icon;
  else b.style.background = `#${BLOCK_COLORS[HOTBAR[i - FIRST_BLOCK]].toString(16).padStart(6, '0')}`;
  b.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    selectTool(i);
  });
  $('hotbar').appendChild(b);
  toolButtons.push(b);
});

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
  if (flying === on) return;
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
attackEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  input.onAttack();
});

// ---------- start, save, grown-ups panel ----------

const chat = new Chat();
chat.context = () => ({ stars: starTotal(), hearts });

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
    vehicle: vehicleName,
    bonus: bonusStars,
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

// The grown-ups panel opens on a long press, so small fingers do not find it by accident.
const openParentPanel = setupParentPanel(() => {
  resetting = true;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});
const gear = $('gear');
let gearTimer = 0;
gear.addEventListener('pointerdown', () => {
  gearTimer = window.setTimeout(openParentPanel, 1500);
});
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) {
  gear.addEventListener(ev, () => window.clearTimeout(gearTimer));
}

// ---------- the game proper, built once the models have loaded ----------

interface Game {
  frame(dt: number): void;
}
let game: Game | null = null;
let bubbleUntil = 0;
let vehicleName = save?.vehicle ?? 'sedan';

async function createGame(assets: Assets): Promise<Game> {
  const terrain = new Terrain(scene, assets.props, collected);
  const animals = new Animals(scene, assets.pets);
  const enemies = new Enemies(scene, assets.enemies, assets.clips);
  // Have the ground under our feet before the first frame.
  terrain.update(player.pos.x, player.pos.z, 25);

  // ---- hero ----
  const avatar = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.position.y = 1.1;
  avatar.add(tilt);
  scene.add(avatar);
  let hero: Actor | null = null;
  let heroIndex = Math.max(0, CHARACTERS.indexOf(localStorage.getItem(HERO_KEY) ?? 'Rogue'));
  let heroToken = 0;

  function equip(): void {
    const item = tool === SWORD ? assets.sword : tool === STAFF ? assets.staff : null;
    hero?.hold(item ? item.clone() : null);
  }
  onToolChange = equip;

  async function setHero(index: number): Promise<void> {
    heroIndex = (index + CHARACTERS.length) % CHARACTERS.length;
    const token = ++heroToken;
    const gltf = await loadModel(`char/${CHARACTERS[heroIndex]}.glb`);
    // A later choice may have been made while this one was downloading.
    if (token !== heroToken) return;
    localStorage.setItem(HERO_KEY, CHARACTERS[heroIndex]);
    hero = new Actor(gltf.scene, assets.clips, HERO_ANIMS);
    hero.root.position.y = -1.1;
    hero.play('Idle_A');
    tilt.clear();
    tilt.add(hero.root);
    equip();
  }
  await setHero(heroIndex);
  $('prev').addEventListener('click', () => void setHero(heroIndex - 1));
  $('next').addEventListener('click', () => void setHero(heroIndex + 1));

  /** Until this time a one-shot animation (swing, cast, flinch) owns the hero's pose. */
  let busyUntil = 0;
  const animate = (name: string, speed = 1): void => {
    if (now >= busyUntil) hero?.play(name, speed);
  };

  // ---- vehicle: one at a time, swapped from the garage ----
  const vehicle = new THREE.Group();
  vehicle.rotation.order = 'YXZ';
  scene.add(vehicle);
  let vehicleKind: 'car' | 'boat' = 'car';
  let wheels: THREE.Object3D[] = [];
  let vehicleToken = 0;

  async function setVehicle(item: GarageItem): Promise<void> {
    const token = ++vehicleToken;
    const gltf = await loadModel(`${item.kind}/${item.name}.glb`);
    if (token !== vehicleToken) return;
    const model = gltf.scene.clone(true);
    model.scale.setScalar(VEHICLE_SCALE);
    vehicle.clear();
    vehicle.add(model);
    wheels = [];
    model.traverse((o) => {
      if (o.name.startsWith('wheel')) wheels.push(o);
    });
    vehicleKind = item.kind;
    vehicleName = item.name;
    carSpeed = 0;
  }
  await setVehicle(GARAGE.find((g) => g.name === vehicleName) ?? GARAGE[0]);

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
  $('bolt-talk').addEventListener('click', () => {
    if (chat.isOpen) chat.close();
    else chat.open(PERSONAS.bolt);
  });

  // ---- villagers of whichever village is nearby ----
  interface Villager {
    actor: Actor;
    persona: string;
  }
  let villagers: Villager[] = [];
  let villageShown: Village | null = null;
  let villageToken = 0;
  let nearVillager: Villager | null = null;

  async function showVillage(v: Village | null): Promise<void> {
    villageShown = v;
    const token = ++villageToken;
    for (const old of villagers) scene.remove(old.actor.root);
    villagers = [];
    if (!v) return;
    const models = await Promise.all(VILLAGERS.map((def) => loadModel(`char/${def.model}.glb`)));
    if (token !== villageToken) return;
    VILLAGERS.forEach((def, i) => {
      const actor = new Actor(models[i].scene, assets.clips, ['Idle_A', 'Waving']);
      const x = v.x + def.dx;
      const z = v.z + def.dz;
      actor.root.position.set(x, groundAt(x, z), z);
      actor.play('Idle_A');
      scene.add(actor.root);
      villagers.push({ actor, persona: def.persona });
    });
  }

  function updateVillagers(dt: number, who: THREE.Vector3): void {
    const v = nearestVillage(who.x, who.z);
    const close = v && Math.hypot(v.x - who.x, v.z - who.z) < 170 ? v : null;
    if (close !== villageShown) void showVillage(close);
    nearVillager = null;
    let best = 5;
    for (const person of villagers) {
      const p = person.actor.root.position;
      const d = Math.hypot(p.x - who.x, p.z - who.z);
      if (d < 9) {
        // Turn and wave when the hero comes over.
        const want = Math.atan2(who.x - p.x, who.z - p.z);
        let diff = want - person.actor.root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        person.actor.root.rotation.y += diff * Math.min(1, 6 * dt);
        person.actor.play('Waving');
      } else {
        person.actor.play('Idle_A');
      }
      if (d < best && !driving) {
        best = d;
        nearVillager = person;
      }
      person.actor.update(dt);
    }
  }

  // ---- getting in and out of the vehicle ----
  const nearVehicle = (): boolean => player.pos.distanceTo(carPos) < 5.5;

  function enterVehicle(): void {
    setFlying(false);
    setCrawling(false);
    driving = true;
    carSpeed = 0;
    avatar.visible = false;
    attackEl.hidden = true;
    garageEl.hidden = true;
  }

  function exitVehicle(): void {
    driving = false;
    carSpeed = 0;
    // Step out on the left side.
    player.pos.set(carPos.x + Math.cos(carHeading) * 3.4, 0, carPos.z - Math.sin(carHeading) * 3.4);
    player.pos.y = Math.max(groundAt(player.pos.x, player.pos.z), SWIM_Y);
    player.vel.set(0, 0, 0);
    avatar.visible = true;
    selectTool(tool);
    sfx.door();
  }

  input.onAction = () => {
    if (!started) return;
    if (driving) exitVehicle();
    else if (nearVillager) chat.open(PERSONAS[nearVillager.persona]);
    else if (nearVehicle()) enterVehicle();
    dirty = true;
  };
  actionEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.onAction();
  });

  // ---- garage: any car or boat, wherever he is ----
  /** A spot for the new vehicle: land ahead for cars, the nearest water for boats. */
  function findSpot(kind: 'car' | 'boat'): THREE.Vector3 | null {
    const fits = (x: number, z: number): boolean =>
      kind === 'car' ? groundAt(x, z) > SEA_LEVEL - 0.4 : groundAt(x, z) < SEA_LEVEL - 1.3;
    const p = player.pos;
    for (let r = kind === 'car' ? 5 : 0; r <= 96; r += 6) {
      for (let i = 0; i < 12; i++) {
        const a = facing + (i / 12) * Math.PI * 2;
        const x = p.x + Math.sin(a) * r;
        const z = p.z + Math.cos(a) * r;
        if (fits(x, z)) return new THREE.Vector3(x, groundAt(x, z), z);
      }
    }
    return null;
  }

  for (const item of GARAGE) {
    const b = document.createElement('button');
    b.textContent = item.icon;
    b.addEventListener('click', () => {
      garageEl.hidden = true;
      if (driving) exitVehicle();
      const spot = findSpot(item.kind);
      if (!spot) {
        speak(item.kind === 'boat' ? 'Boats need water. Let us find the sea!' : 'Cars need dry land!');
        return;
      }
      void setVehicle(item).then(() => {
        carPos.copy(spot);
        carHeading = facing;
        enterVehicle();
        sfx.honk();
        dirty = true;
      });
    });
    garageEl.appendChild(b);
  }
  $('garage-btn').addEventListener('click', () => {
    garageEl.hidden = !garageEl.hidden;
  });

  // ---- fighting ----
  let attackReady = 0;
  let invulnerableUntil = 0;
  let lastHurt = -99;
  let pendingHit: { at: number; kind: 'sword' | 'staff'; target: THREE.Vector3 | null } | null = null;
  const knock = new THREE.Vector3();
  const safeSpot = player.pos.clone();
  let safeCheck = 0;

  interface MagicBolt {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    life: number;
  }
  const bolts: MagicBolt[] = [];
  const boltGeometry = new THREE.SphereGeometry(0.35, 10, 8);
  const boltMaterial = new THREE.MeshBasicMaterial({ color: 0x7df9ff });

  const isSafe = (x: number, z: number): boolean => {
    if (Math.hypot(x, z) < 110) return true;
    const v = nearestVillage(x, z);
    return v !== null && Math.hypot(v.x - x, v.z - z) < VILLAGE_RADIUS + 55;
  };

  const enemyContext: EnemyContext = {
    isSafe,
    targetable: true,
    onHitPlayer(from) {
      if (now < invulnerableUntil) return;
      invulnerableUntil = now + 1.2;
      lastHurt = now;
      hearts--;
      sfx.ouch();
      const away = Math.atan2(player.pos.x - from.x, player.pos.z - from.z);
      knock.set(Math.sin(away) * 10, 0, Math.cos(away) * 10);
      if (hero) busyUntil = now + hero.once('Hit_A', 1.5) * 0.7;
      if (hearts <= 0) {
        // Out of hearts: pop back to the last quiet spot, good as new.
        hearts = MAX_HEARTS;
        player.pos.copy(safeSpot);
        player.vel.set(0, 0, 0);
        knock.set(0, 0, 0);
        enemies.clearNear(player.pos, 80);
        speak('Oops! Let us try again!');
      }
      showHearts();
    },
    onDefeat() {
      bonusStars++;
      showStars(true);
      sfx.star();
      speak(String(starTotal()));
      dirty = true;
    },
  };

  function attack(): void {
    if (!started || driving || swimming || chat.isOpen || !hero || now < attackReady) return;
    if (tool !== SWORD && tool !== STAFF) return;
    // Auto-aim: turn to the closest skeleton so small hands do not have to line it up.
    const target = enemies.nearest(player.pos, tool === SWORD ? 5.5 : 36);
    if (target) facing = Math.atan2(target.x - player.pos.x, target.z - player.pos.z);
    if (tool === SWORD) {
      busyUntil = now + hero.once('Melee_1H_Attack_Slice_Horizontal', 1.4) * 0.85;
      pendingHit = { at: now + 0.22, kind: 'sword', target };
      attackReady = now + 0.55;
      sfx.swing();
    } else {
      busyUntil = now + hero.once('Throw', 1.5) * 0.8;
      pendingHit = { at: now + 0.28, kind: 'staff', target: target ? target.clone() : null };
      attackReady = now + 0.7;
      sfx.zap();
    }
  }
  input.onAttack = attack;

  function updateCombat(dt: number): void {
    if (pendingHit && now >= pendingHit.at) {
      const fx = Math.sin(facing);
      const fz = Math.cos(facing);
      if (pendingHit.kind === 'sword') {
        const point = new THREE.Vector3(player.pos.x + fx * 1.8, player.pos.y, player.pos.z + fz * 1.8);
        if (enemies.damageAt(point, 2.7, 1, enemyContext) > 0) sfx.bonk();
      } else {
        const mesh = new THREE.Mesh(boltGeometry, boltMaterial);
        mesh.position.set(player.pos.x + fx, player.pos.y + 1.6, player.pos.z + fz);
        const aim = pendingHit.target
          ? pendingHit.target.clone().setY(pendingHit.target.y + 1.2).sub(mesh.position).normalize()
          : new THREE.Vector3(fx, 0, fz);
        scene.add(mesh);
        bolts.push({ mesh, vel: aim.multiplyScalar(28), life: 1.6 });
      }
      pendingHit = null;
    }

    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.mesh.position.addScaledVector(b.vel, dt);
      b.life -= dt;
      const p = b.mesh.position;
      const hit = enemies.damageAt(new THREE.Vector3(p.x, p.y - 1, p.z), 1.7, 2, enemyContext) > 0;
      if (hit) sfx.bonk();
      if (hit || b.life <= 0 || p.y < groundAt(p.x, p.z)) {
        scene.remove(b.mesh);
        bolts.splice(i, 1);
      }
    }

    // Hearts grow back after a quiet moment.
    if (hearts < MAX_HEARTS && now - lastHurt > 6) {
      hearts++;
      lastHurt = now - 3;
      showHearts();
    }
    // Remember the last calm, dry place to come back to.
    safeCheck -= dt;
    if (safeCheck <= 0) {
      safeCheck = 2;
      if (player.onGround && !driving && !enemies.nearest(player.pos, 45)) safeSpot.copy(player.pos);
    }

    enemyContext.targetable = !flying && !driving && !chat.isOpen;
    enemies.update(dt, player.pos, enemyContext);
  }

  // ---- building, or swinging if a weapon is in hand ----
  const ray = new THREE.Vector3();
  input.onTap = (px, py, button) => {
    if (!started || driving) return;
    garageEl.hidden = true;
    if ((tool === SWORD || tool === STAFF) && button !== 2) {
      attack();
      return;
    }
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
    if (tool === PICKAXE || button === 2) {
      if (hit.kind === 'block' && blocks.set(hit.x, hit.y, hit.z, 0)) {
        sfx.remove();
        dirty = true;
      }
      return;
    }
    if (bodyTouchesCell(player, hit.px, hit.py, hit.pz)) return;
    if (blocks.set(hit.px, hit.py, hit.pz, HOTBAR[tool - FIRST_BLOCK])) {
      sfx.place();
      dirty = true;
    }
  };

  // ---- per-frame updates ----
  let wasJump = false;
  let tiltNow = 0;
  let liftNow = 0;
  let cheerUntil = 0;

  function updatePlayer(dt: number): void {
    const { pos, vel } = player;
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    // Camera-relative movement: forward is away from the camera.
    const mx = -sin * input.moveZ + cos * input.moveX;
    const mz = -cos * input.moveZ - sin * input.moveX;
    const moving = Math.hypot(mx, mz) > 0.1;
    if (moving && now >= busyUntil) facing = Math.atan2(mx, mz);
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
        vel.x = mx * speed + knock.x;
        vel.z = mz * speed + knock.z;
        if (input.jump && player.onGround && !crawling) {
          vel.y = JUMP_SPEED;
          player.onGround = false;
          sfx.jump();
        }
        moveBody(player, dt, blocks, true);
      }
      terrain.collide(pos, player.hw);
    }
    knock.multiplyScalar(Math.max(0, 1 - 7 * dt));
    if (!before.equals(pos)) dirty = true;
    airTime = player.onGround || swimming ? 0 : airTime + dt;

    // ---- pose and animation ----
    avatar.position.copy(pos);
    let diff = facing - avatar.rotation.y;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    avatar.rotation.y += diff * Math.min(1, 14 * dt);

    let wantTilt = 0;
    let wantLift = 0;
    if (flying) {
      animate('Jump_Idle');
      wantTilt = moving ? 1.05 : 0;
    } else if (swimming) {
      // Paddle along the surface when moving, tread water when still.
      animate(moving ? 'Crawling' : 'Jump_Idle', moving ? 1.3 : 0.6);
      wantLift = moving ? 1.05 : 0;
    } else if (airTime > 0.18) {
      animate('Jump_Idle');
    } else if (crawling) {
      animate(moving ? 'Crawling' : 'Crouching');
    } else if (moving) {
      animate(input.run ? 'Running_A' : 'Walking_A', 1.12);
    } else {
      animate(now < cheerUntil ? 'Cheering' : 'Idle_A');
    }
    tiltNow += (wantTilt - tiltNow) * Math.min(1, 8 * dt);
    liftNow += (wantLift - liftNow) * Math.min(1, 6 * dt);
    tilt.rotation.x = tiltNow;
    tilt.position.y = 1.1 + liftNow;
    hero?.update(dt);
  }

  let carPitch = 0;
  let carRoll = 0;

  function updateVehicle(dt: number, controlled: boolean): void {
    const boat = vehicleKind === 'boat';
    const top = boat ? BOAT_MAX : CAR_MAX;
    if (controlled) {
      if (Math.abs(input.moveZ) > 0.1) carSpeed += input.moveZ * top * dt;
      else carSpeed *= Math.max(0, 1 - (boat ? 1.2 : 2.2) * dt);
      carSpeed = Math.min(top, Math.max(-top * 0.4, carSpeed));
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
      // Cars stay out of deep water, boats stay off the beach, and nothing drives through blocks.
      const blocked = boat
        ? g > SEA_LEVEL - 0.8
        : g < SEA_LEVEL - 0.9 || blocks.collides(nx, g + 0.7, nz, 1.4, 2);
      if (blocked) {
        carSpeed *= -0.25;
      } else {
        carPos.x = nx;
        carPos.z = nz;
        dirty = true;
      }
      if (!boat && terrain.collide(carPos, 1.7)) carSpeed *= 1 - Math.min(1, 3 * dt);
    }

    let wantPitch: number;
    let wantRoll: number;
    if (boat) {
      carPos.y = SEA_LEVEL;
      wantPitch = Math.sin(now * 1.7) * 0.03 - carSpeed * 0.006;
      wantRoll = Math.sin(now * 1.3) * 0.04;
      vehicle.position.copy(carPos).setY(SEA_LEVEL - 0.25 + Math.sin(now * 2) * 0.06);
    } else {
      const g = groundAt(carPos.x, carPos.z);
      carPos.y += (g - carPos.y) * Math.min(1, 14 * dt);
      // Lean with the slope by comparing the ground under the bumpers and the doors.
      const front = groundAt(carPos.x + fx * 2.2, carPos.z + fz * 2.2);
      const back = groundAt(carPos.x - fx * 2.2, carPos.z - fz * 2.2);
      const left = groundAt(carPos.x + fz * 1.3, carPos.z - fx * 1.3);
      const right = groundAt(carPos.x - fz * 1.3, carPos.z + fx * 1.3);
      wantPitch = -Math.atan2(front - back, 4.4);
      wantRoll = Math.atan2(left - right, 2.6);
      // The models' wheels sit a little below their origin.
      vehicle.position.copy(carPos).setY(carPos.y + 0.3 * VEHICLE_SCALE);
    }
    carPitch += (wantPitch - carPitch) * Math.min(1, 8 * dt);
    carRoll += (wantRoll - carRoll) * Math.min(1, 8 * dt);
    vehicle.rotation.set(carPitch, carHeading, carRoll);
    for (const w of wheels) w.rotation.x += (carSpeed * dt) / (0.3 * VEHICLE_SCALE);

    if (controlled) {
      // Keep the camera behind the vehicle so "up" on the stick always means "go".
      let diff = carHeading + Math.PI - camYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      camYaw += diff * Math.min(1, 3 * dt);
    }
  }

  const camOffset = new THREE.Vector3();
  const camWant = new THREE.Vector3();

  function updateCamera(dt: number, who: THREE.Vector3): void {
    camWant.copy(who).setY(who.y + (driving ? 2.6 : crawling ? 1 : started ? 1.9 : 1.3));
    camTarget.lerp(camWant, Math.min(1, 12 * dt));
    // Close up on the hero while choosing one on the start screen.
    const dist = !started ? 6.5 : driving ? camDist + 4 : camDist;
    const pitch = started ? camPitch : 0.12;
    camOffset.set(Math.sin(camYaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(camYaw) * Math.cos(pitch));
    camera.position.copy(camTarget).addScaledVector(camOffset, dist);
    // Never let the camera sink into a hillside or under the sea.
    const floor = Math.max(groundAt(camera.position.x, camera.position.z), SEA_LEVEL) + 0.6;
    if (camera.position.y < floor) camera.position.y = floor;
    camera.lookAt(camTarget);
  }

  function updateBolt(dt: number, who: THREE.Vector3): void {
    // Hover at the player's side as seen by the camera, so Bolt never blocks the view.
    const side = driving ? 3.4 : 2.3;
    boltWant.set(
      who.x + Math.cos(camYaw) * side - Math.sin(camYaw) * 0.8,
      who.y + 1.5 + Math.sin(now * 2.4) * 0.15,
      who.z - Math.sin(camYaw) * side - Math.cos(camYaw) * 0.8,
    );
    if (robot.position.distanceTo(boltWant) > 80) robot.position.copy(boltWant);
    robot.position.lerp(boltWant, Math.min(1, 4 * dt));
    robot.rotation.y = Math.atan2(who.x - robot.position.x, who.z - robot.position.z);

    boltHead.copy(robot.position).setY(robot.position.y + 1.7).project(camera);
    const show = now < bubbleUntil && boltHead.z < 1 && !chat.isOpen;
    bubble.hidden = !show;
    if (show) {
      bubble.textContent = `⭐ ${starTotal()}`;
      bubble.style.left = `${(boltHead.x * 0.5 + 0.5) * window.innerWidth}px`;
      bubble.style.top = `${(-boltHead.y * 0.5 + 0.5) * window.innerHeight}px`;
    }
  }

  let actionShown = '';

  // Test hook: add ?debug to the address to inspect or move things from the console.
  if (new URLSearchParams(location.search).has('debug')) {
    Object.assign(window, {
      ob: {
        player,
        carPos,
        groundAt,
        nearestVillage,
        enemies,
        enemyContext,
        state: () => ({
          flying,
          crawling,
          swimming,
          driving,
          anim: hero?.playing,
          stars: starTotal(),
          blocks: blocks.map.size,
          hearts,
          enemies: enemies.count,
          vehicle: vehicleName,
          hero: CHARACTERS[heroIndex],
          villagers: villagers.length,
          bolts: bolts.length,
        }),
      },
    });
  }

  return {
    frame(dt) {
      if (started) {
        if (driving) {
          updateVehicle(dt, true);
          player.pos.copy(carPos);
        } else {
          updatePlayer(dt);
          updateVehicle(dt, false);
        }
        wasJump = input.jump;
        updateCombat(dt);

        const who = driving ? carPos : player.pos;
        if (terrain.collect(who, driving ? 3.5 : 2.2) > 0) {
          showStars(true);
          sfx.star();
          // Counting out loud as the stars add up.
          speak(String(starTotal()));
          cheerUntil = now + 2.2;
          bubbleUntil = now + 3;
          dirty = true;
        }

        const icon = driving ? '🚶' : nearVillager ? '💬' : nearVehicle() ? (vehicleKind === 'boat' ? '⛵' : '🚗') : '';
        if (icon !== actionShown) {
          actionShown = icon;
          actionEl.hidden = icon === '';
          actionEl.textContent = icon;
          jumpEl.textContent = driving ? '📣' : '⬆️';
          crawlEl.hidden = flyEl.hidden = driving;
        }
      } else {
        // Slow turntable of the hero behind the start screen.
        camYaw += dt * 0.35;
        avatar.position.copy(player.pos);
        hero?.update(dt);
        updateVehicle(dt, false);
      }

      const who = driving ? carPos : player.pos;
      terrain.update(who.x, who.z, 2);
      animals.update(dt, who);
      updateVillagers(dt, who);
      for (const s of terrain.stars) {
        const mesh = s.group.children[0];
        mesh.rotation.y = now * 2;
        mesh.position.y = Math.sin(now * 3 + s.pos.x) * 0.25;
      }
      updateCamera(dt, who);
      updateBolt(dt, who);

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
function loop(time: number): void {
  const dt = Math.min((time - last) / 1000, 0.05);
  last = time;
  now = time / 1000;
  input.update();
  if (game) {
    game.frame(dt);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

loadAssets((fraction) => {
  $('loading-bar').style.width = `${Math.round(fraction * 100)}%`;
})
  .then(createGame)
  .then((g) => {
    game = g;
    selectTool(tool);
    $('loading').hidden = true;
    $('play').hidden = false;
    $('picker').hidden = false;
    if (new URLSearchParams(location.search).has('autostart')) start();
  })
  .catch((err: unknown) => {
    console.error(err);
    $('loading').textContent = '⚠️';
  });
