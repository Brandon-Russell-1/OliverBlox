import * as THREE from 'three';
import './style.css';
import { loadAssets, loadModel, CHARACTERS, PETS, type Assets } from './assets';
import { Terrain, groundAt, nearestVillage, villagesNear, linkedPlace, AIRSTRIP, SEA_LEVEL, VILLAGE_RADIUS, DUNGEON_HALF, DUNGEON_HEIGHT, type Village } from './terrain';
import { MiniMap, type MapIcon } from './map';
import { Home, ROOM, type Spot } from './home';
import { Coder } from './coder';
import { Net, Peers } from './net';
import { Blocks, HOTBAR, BLOCK_COLORS, EXTRA_BLOCKS } from './blocks';
import { type Body, moveBody, bodyTouchesCell } from './physics';
import { Input } from './input';
import { Animals, Pet, type Animal } from './animals';
import { Quests, QUEST_ICONS, LETTERS, type QuestSave } from './quests';
import { Actor } from './actor';
import { Enemies, type EnemyContext, type Target } from './combat';
import { emojiTexture, textTexture, faceFor, makeMarker, makeLabel, setLabel, EMOTES } from './emoji';
import { getPlayerName, setPlayerName } from './profile';
import { music } from './music';
import { loadSettings, saveSettings, addPlayTime, minutesToday } from './settings';
import { makeStar } from './models';
import { makeHat } from './hats';
import { Chat, PERSONAS, setupParentPanel, getAiSettings } from './chat';
import { sfx, speak, unlockAudio, setRain, thunder } from './audio';
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
  kind: 'car' | 'boat' | 'plane';
  icon: string;
  /** Coins to unlock it; 0 for the ones he starts with. */
  price: number;
}
const GARAGE: GarageItem[] = [
  { name: 'sedan', kind: 'car', icon: '🚗', price: 0 },
  { name: 'taxi', kind: 'car', icon: '🚕', price: 6 },
  { name: 'police', kind: 'car', icon: '🚓', price: 8 },
  { name: 'tractor', kind: 'car', icon: '🚜', price: 8 },
  { name: 'ambulance', kind: 'car', icon: '🚑', price: 10 },
  { name: 'truck', kind: 'car', icon: '🛻', price: 10 },
  { name: 'firetruck', kind: 'car', icon: '🚒', price: 12 },
  { name: 'race', kind: 'car', icon: '🏎️', price: 20 },
  { name: 'plane', kind: 'plane', icon: '✈️', price: 0 },
  { name: 'boat-row-small', kind: 'boat', icon: '🚣', price: 0 },
  { name: 'boat-tug-a', kind: 'boat', icon: '🛥️', price: 10 },
  { name: 'boat-sail-a', kind: 'boat', icon: '⛵', price: 12 },
  { name: 'boat-speed-a', kind: 'boat', icon: '🚤', price: 15 },
];

/** The people who live in every village: which hero model they use and where they stand. */
const VILLAGERS = [
  { persona: 'mage', model: 'Mage', dx: 7, dz: 5 },
  { persona: 'barbarian', model: 'Barbarian', dx: -8, dz: 4 },
  { persona: 'druid', model: 'Druid', dx: 2, dz: -9 },
  { persona: 'shop', model: 'Engineer', dx: -3, dz: 9 },
  // Townsfolk who stroll around the green and like a chat. They give no jobs.
  { persona: 'guard', model: 'Knight', dx: 13, dz: -7, wander: true },
  { persona: 'ranger', model: 'Ranger', dx: -12, dz: -8, wander: true },
  { persona: 'tinker', model: 'Rogue', dx: 9, dz: 12, wander: true },
];

/** What floats over a villager's head: a job to give, one under way, or a reward waiting. */
const MARKS = { none: '', new: '❗', doing: '⏳', done: '🎁' };


interface Save {
  v: 2;
  blocks: [number, number, number, number][];
  stars: string[];
  player: [number, number, number];
  car: [number, number, number];
  vehicle?: string;
  /** Stars earned by beating skeletons. */
  bonus?: number;
  coins?: number;
  /** 0 sword, 1 axe, 2 great sword. */
  sword?: number;
  extraHearts?: number;
  boots?: boolean;
  /** Species of the pet, or -1 for none. */
  pet?: number;
  quests?: QuestSave;
  /** Forts whose giant skeleton has been beaten. */
  forts?: string[];
  /** Vehicles unlocked in the garage. */
  vehicles?: string[];
  /** Furniture bought for the house. */
  furniture?: string[];
  hats?: string[];
  /** The hat being worn, or ''. */
  hat?: string;
  fish?: number;
  /** Things picked up along the way, by kind. */
  bag?: Record<string, number>;
  /** How far through the guided adventure he is. */
  guide?: number;
  shopSeen?: boolean;
  raced?: boolean;
  kills?: number;
  /** The goal he is on once the guided ones are finished. */
  goal?: { kind: string; need: number; start: number } | null;
  /** Version of the guide's list of goals; a change restarts it, skipping what is already done. */
  gv?: number;
  homeSeen?: boolean;
  /** Where he has put each piece of furniture, and the colours he picked. */
  layout?: Record<string, Spot>;
  wall?: number;
  floor?: number;
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

const hemi = new THREE.HemisphereLight(0xdcefff, 0x9c9074, 1.25);
scene.add(hemi);
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

// ---------- day and night ----------
/** Seconds for a whole day. About two thirds of it is daylight. */
const DAY_LENGTH = 480;
const SKY = {
  dayTop: new THREE.Color(0x2674f0),
  dayBottom: new THREE.Color(HORIZON),
  nightTop: new THREE.Color(0x050a26),
  nightBottom: new THREE.Color(0x1b2a5c),
  dusk: new THREE.Color(0xffa25e),
  sun: new THREE.Color(0xfff3d6),
  moon: new THREE.Color(0x9fb4ff),
};
const skyUniforms = sky.material.uniforms;
// ---------- graphics quality ----------
// On a slow device the game steps down by itself: first no shadows, then a softer picture,
// then a shorter view. A grown-up can also fix it at best or fastest.
const QUALITY_KEY = 'oliverblox-quality';
const QUALITY_AUTO_KEY = 'oliverblox-quality-auto';
let qualityMode = localStorage.getItem(QUALITY_KEY) ?? 'auto';
let quality = 0;
let fogNear = 115;
let fogFar = 198;
let viewChunks = 4;
function applyQuality(level: number): void {
  quality = Math.min(3, Math.max(0, level));
  sun.castShadow = quality < 1;
  renderer.setPixelRatio(quality < 2 ? Math.min(window.devicePixelRatio, isTouch ? 1.5 : 2) : 1);
  viewChunks = quality < 3 ? 4 : 3;
  fogNear = quality < 3 ? 115 : 85;
  fogFar = quality < 3 ? 198 : 150;
}
applyQuality(qualityMode === 'fast' ? 3 : qualityMode === 'best' ? 0 : Number(localStorage.getItem(QUALITY_AUTO_KEY) ?? 0) || 0);
let speedTime = 0;
let speedFrames = 0;
let settleTime = 10;
/** Count real frames; if four seconds average under 27 a second, drop one quality level. */
function watchSpeed(elapsed: number): void {
  // A gap of seconds is the tab being put away, not a slow frame.
  if (qualityMode !== 'auto' || quality >= 3 || document.hidden || elapsed > 3) return;
  // Loading makes the first seconds slow on any device, so they do not count.
  if (settleTime > 0) {
    settleTime -= elapsed;
    return;
  }
  speedTime += elapsed;
  speedFrames++;
  if (speedTime < 4) return;
  const fps = speedFrames / speedTime;
  speedTime = speedFrames = 0;
  if (fps < 27) {
    applyQuality(quality + 1);
    localStorage.setItem(QUALITY_AUTO_KEY, String(quality));
    settleTime = 3;
  }
}

// ---------- weather ----------
/** Seconds the world has been running. Rain comes and goes with it, and friends share the same clock. */
let worldTime = 120;
/** 0 dry, 1 pouring. */
let rain = 0;
let lightning = 0;
let thunderIn = 8;
const DROPS = 700;
const rainPositions = new Float32Array(DROPS * 6);
for (let i = 0; i < DROPS; i++) {
  const x = (Math.random() - 0.5) * 70;
  const y = Math.random() * 34 - 6;
  const z = (Math.random() - 0.5) * 70;
  rainPositions.set([x, y, z, x, y - 0.9, z], i * 6);
}
const rainGeometry = new THREE.BufferGeometry();
rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
const rainMaterial = new THREE.LineBasicMaterial({ color: 0xcfe2ff, transparent: true, opacity: 0, fog: false });
const rainMesh = new THREE.LineSegments(rainGeometry, rainMaterial);
rainMesh.frustumCulled = false;
rainMesh.visible = false;
scene.add(rainMesh);
const STORM = new THREE.Color(0x7d8794);

/** Rain showers that roll in and out, with thunder and lightning in the heavy ones. Call after updateDay. */
function updateWeather(dt: number, sheltered: boolean): void {
  worldTime += dt;
  const wet = Math.sin(worldTime / 71) + Math.sin(worldTime / 29) > 1.2;
  rain += ((wet ? 1 : 0) - rain) * Math.min(1, dt * 0.35);
  const falling = sheltered ? 0 : rain;
  rainMesh.visible = falling > 0.03;
  setRain(falling);
  if (rainMesh.visible) {
    rainMaterial.opacity = 0.5 * falling;
    for (let i = 0; i < DROPS; i++) {
      let y = rainPositions[i * 6 + 1] - 40 * dt;
      if (y < -6) y += 34;
      rainPositions[i * 6 + 1] = y;
      rainPositions[i * 6 + 4] = y - 0.9;
    }
    rainGeometry.attributes.position.needsUpdate = true;
    rainMesh.position.copy(camera.position);
    // Grey the sky and draw the fog in.
    skyUniforms.top.value.lerp(STORM, falling * 0.75);
    skyUniforms.bottom.value.lerp(STORM, falling * 0.6);
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(skyUniforms.bottom.value);
    fog.far = fogFar * (1 - 0.35 * falling);
    sun.intensity *= 1 - 0.55 * falling;
    hemi.intensity *= 1 - 0.25 * falling;
  }
  if (falling > 0.7) {
    thunderIn -= dt;
    if (thunderIn <= 0) {
      thunderIn = 7 + Math.random() * 14;
      lightning = 1;
      // Light first, then the rumble, the way a real storm does it.
      window.setTimeout(thunder, 500 + Math.random() * 900);
    }
  }
  if (lightning > 0) {
    lightning = Math.max(0, lightning - dt * 3.5);
    hemi.intensity += lightning * 3;
  }
}

/** True while the hero is down in a dungeon: no sky, no sun, only his torch. */
let underground = false;
/** Starts in the morning. */
let dayClock = 40;
/** 0 in full daylight, 1 in the middle of the night. */
let night = 0;
function updateDay(dt: number): void {
  dayClock = (dayClock + dt) % DAY_LENGTH;
  const angle = (dayClock / DAY_LENGTH) * Math.PI * 2;
  // The sun's height, shifted so the day lasts longer than the night.
  const height = Math.sin(angle) + 0.35;
  night = 1 - THREE.MathUtils.smoothstep(height, -0.2, 0.15);
  const dusk = Math.max(0, 1 - Math.abs(height) / 0.3);
  skyUniforms.top.value.lerpColors(SKY.dayTop, SKY.nightTop, night);
  skyUniforms.bottom.value.lerpColors(SKY.dayBottom, SKY.nightBottom, night).lerp(SKY.dusk, dusk * 0.45);
  (scene.fog as THREE.Fog).color.copy(skyUniforms.bottom.value);
  // Never pitch dark: the moon takes over, softer and bluer, so a small child can still see.
  sun.color.lerpColors(SKY.sun, SKY.moon, night);
  sun.intensity = 2.1 - 1.5 * night;
  hemi.intensity = 1.25 - 0.6 * night;
  SUN_OFFSET.set(Math.cos(angle) * 100 * (height >= 0 ? 1 : -1), 45 + Math.abs(height) * 90, 45);
  const fog = scene.fog as THREE.Fog;
  if (underground) {
    night = 1;
    skyUniforms.top.value.setHex(0x030305);
    skyUniforms.bottom.value.setHex(0x030305);
    fog.color.setHex(0x030305);
    fog.near = 10;
    fog.far = 48;
    sun.intensity = 0.12;
    hemi.intensity = 0.4;
  } else {
    fog.near = fogNear;
    fog.far = fogFar;
  }
  music.setNight(night > 0.5);
}

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
let coins = save?.coins ?? 0;
let swordLevel = save?.sword ?? 0;
let extraHearts = save?.extraHearts ?? 0;
let boots = save?.boots ?? false;
let petSpecies = save?.pet ?? -1;
let maxHearts = 5 + extraHearts;
const quests = new Quests(save?.quests);
const clearedForts = new Set<string>(save?.forts ?? []);
const ownedVehicles = new Set<string>(save?.vehicles ?? GARAGE.filter((g) => g.price === 0).map((g) => g.name));
const furniture = new Set<string>(save?.furniture ?? []);
const hatsOwned = new Set<string>(save?.hats ?? []);
let hat = save?.hat ?? '';
let fishCount = save?.fish ?? 0;
/** What can be carried and sold, and what the market pays for one. */
const ITEMS = [
  { key: 'fish', icon: '🐟', price: 2 },
  { key: 'bone', icon: '🦴', price: 1 },
  { key: 'gem', icon: '💎', price: 6 },
];
const bag: Record<string, number> = { fish: 0, bone: 0, gem: 0, ...save?.bag };
let guideStep = save?.gv === 2 ? (save.guide ?? 0) : 0;
let homeSeen = save?.homeSeen ?? false;
let kills = save?.kills ?? 0;
let bonus: { kind: string; need: number; start: number } | null = save?.goal ?? null;
let layout: Record<string, Spot> = save?.layout ?? {};
let wallColour = save?.wall ?? 0;
let floorColour = save?.floor ?? 0;
let shopSeen = save?.shopSeen ?? false;
let raced = save?.raced ?? false;
/** While he is indoors, the spot outside the door to come back to. */
let inside: THREE.Vector3 | null = null;
/** When indoors in a friend's house, that friend's id. */
let visiting: string | null = null;
interface HomeData {
  owned: string[];
  layout: Record<string, Spot>;
  wall: number;
  floor: number;
}
/** How each friend has done up their house, as they last told us. */
const homes = new Map<string, HomeData>();
/** Away from the controls this long and a 💤 shows over the hero for friends. */
const AWAY_MS = 180000;
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
let hearts = maxHearts;

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

/** Chests share the "collected" list with stars but are not stars. */
let chestsOpened = [...collected].filter((id) => id.startsWith('c')).length;
const starTotal = (): number => collected.size - chestsOpened + bonusStars;
function showStars(pop: boolean): void {
  starCountEl.textContent = String(starTotal());
  if (!pop) return;
  starsEl.classList.remove('pop');
  void starsEl.offsetWidth;
  starsEl.classList.add('pop');
}
function showHearts(): void {
  heartsEl.textContent = '❤️'.repeat(hearts) + '🤍'.repeat(maxHearts - hearts);
}
const coinCountEl = $('coin-count');
const questsEl = $('quests');
function showCoins(): void {
  coinCountEl.textContent = String(coins);
}
/** One chip per job in progress: a picture of what to do and how far along he is. */
function showQuests(): void {
  questsEl.replaceChildren(
    ...quests.list().map((q) => {
      const chip = document.createElement('div');
      chip.className = q.have >= q.need ? 'quest done' : 'quest';
      // A letter job shows the letter to look for; the others show a count.
      chip.textContent = q.type === 'letter' ? `${QUEST_ICONS.letter} ${LETTERS[q.k ?? 0]}` : `${QUEST_ICONS[q.type]} ${q.have}/${q.need}`;
      // A colour job shows its colour, so no reading is needed.
      if (q.k && q.type === 'colour') chip.style.borderLeft = `22px solid #${BLOCK_COLORS[q.k].toString(16).padStart(6, '0')}`;
      return chip;
    }),
  );
}
showStars(false);
showHearts();
showCoins();
showQuests();

let tool = SWORD;
let onToolChange: () => void = () => {};
/** Called when the player taps a hotbar slot themselves. */
let onPickTool: () => void = () => {};
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
    onPickTool();
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
  if (started && !driving && !inside && !underground) setFlying(!flying);
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
chat.context = (personaId) => ({
  name: getPlayerName(),
  stars: starTotal(),
  coins,
  hearts,
  maxHearts,
  hero: localStorage.getItem(HERO_KEY) ?? 'Rogue',
  pet: PETS[petSpecies] ?? null,
  sword: swordLevel,
  boots,
  // The job this character gave him, and where it stands.
  questState: quests.state(personaId),
  quest: quests.get(personaId) ?? null,
  // Every job on the go, so Bolt can help with any of them.
  quests: quests.list(),
});

const parent = loadSettings();
const breakEl = $('break');
const setMusic = $<HTMLInputElement>('set-music');
const setFighting = $<HTMLInputElement>('set-fighting');
const setLimit = $<HTMLInputElement>('set-limit');
const setQuality = $<HTMLSelectElement>('set-quality');
setQuality.addEventListener('change', () => {
  qualityMode = setQuality.value;
  localStorage.setItem(QUALITY_KEY, qualityMode);
  localStorage.removeItem(QUALITY_AUTO_KEY);
  applyQuality(qualityMode === 'fast' ? 3 : 0);
  settleTime = 5;
});
function applySettings(): void {
  parent.music = setMusic.checked;
  parent.fighting = setFighting.checked;
  parent.limit = Math.max(0, Math.floor(Number(setLimit.value) || 0));
  saveSettings(parent);
  music.setEnabled(parent.music && started);
  breakEl.hidden = parent.limit === 0 || minutesToday() < parent.limit;
}
for (const input of [setMusic, setFighting, setLimit]) input.addEventListener('change', applySettings);

// Each player picks their own name on the start screen; it is kept on this device.
const nameInput = $<HTMLInputElement>('player-name');
nameInput.value = getPlayerName();
nameInput.addEventListener('change', () => {
  setPlayerName(nameInput.value);
  nameInput.value = getPlayerName();
});

function start(): void {
  if (started || !game) return;
  setPlayerName(nameInput.value);
  started = true;
  unlockAudio();
  music.setEnabled(parent.music);
  $('start').hidden = true;
  $('hud').hidden = false;
  speak(`Hi${getPlayerName() ? ` ${getPlayerName()}` : ''}! I am Bolt! Let us go exploring!`);
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
    player: (inside ?? player.pos).toArray() as [number, number, number],
    car: [carPos.x, carPos.z, carHeading],
    vehicle: vehicleName,
    bonus: bonusStars,
    coins,
    sword: swordLevel,
    extraHearts,
    boots,
    pet: petSpecies,
    quests: quests.save(),
    forts: [...clearedForts],
    vehicles: [...ownedVehicles],
    furniture: [...furniture],
    hats: [...hatsOwned],
    hat,
    fish: fishCount,
    bag,
    guide: guideStep,
    shopSeen,
    raced,
    gv: 2,
    homeSeen,
    kills,
    goal: bonus,
    layout,
    wall: wallColour,
    floor: floorColour,
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

// ---------- backups: to the family's own Worker, or to a file ----------
const cloudStatus = $('cloud-status');
const saveSlot = (): string => (getPlayerName() || 'player').toLowerCase();
async function cloudBackup(quiet = false): Promise<void> {
  const ai = getAiSettings();
  const data = localStorage.getItem(SAVE_KEY);
  if (!ai.url || !data) {
    if (!quiet) cloudStatus.textContent = ai.url ? 'Nothing to back up yet.' : 'Set up the AI helper address first.';
    return;
  }
  try {
    const res = await fetch(`${ai.url}/save/${saveSlot()}`, { method: 'PUT', headers: { 'x-family-code': ai.code }, body: data });
    if (!quiet) cloudStatus.textContent = res.ok ? `Backed up as "${saveSlot()}".` : `Backup failed (${res.status}).`;
  } catch {
    if (!quiet) cloudStatus.textContent = 'Could not reach the helper.';
  }
}
/** Replace this device's save with another one, after checking it really is a save. */
function restoreSave(text: string): void {
  try {
    if ((JSON.parse(text) as Save).v !== 2) throw new Error('not a save');
  } catch {
    cloudStatus.textContent = 'That is not an OliverBlox save.';
    return;
  }
  if (!window.confirm('Replace the game on this device with that save?')) return;
  resetting = true;
  localStorage.setItem(SAVE_KEY, text);
  location.reload();
}
$('cloud-save').addEventListener('click', () => {
  saveOnLeave();
  void cloudBackup();
});
$('cloud-load').addEventListener('click', () => {
  const ai = getAiSettings();
  if (!ai.url) {
    cloudStatus.textContent = 'Set up the AI helper address first.';
    return;
  }
  fetch(`${ai.url}/save/${saveSlot()}`, { headers: { 'x-family-code': ai.code } })
    .then((res) => (res.ok ? res.text() : Promise.reject(res.status)))
    .then(restoreSave)
    .catch((status) => {
      cloudStatus.textContent = status === 404 ? `No backup found for "${saveSlot()}".` : 'Could not fetch the backup.';
    });
});
$('file-save').addEventListener('click', () => {
  saveOnLeave();
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([localStorage.getItem(SAVE_KEY) ?? ''], { type: 'application/json' }));
  link.download = `oliverblox-${saveSlot()}.json`;
  link.click();
});
$<HTMLInputElement>('file-load').addEventListener('change', (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) void file.text().then(restoreSave);
});
// With the helper set up, a backup is taken every few minutes without anyone asking.
window.setInterval(() => void cloudBackup(true), 180000);

// The grown-ups panel opens on a long press, so small fingers do not find it by accident.
const openParentPanel = setupParentPanel(() => {
  resetting = true;
  localStorage.removeItem(SAVE_KEY);
  location.reload();
});
const gear = $('gear');
const gearHint = $('gear-hint');
let gearTimer = 0;
let hintTimer = 0;
gear.addEventListener('contextmenu', (e) => e.preventDefault());
gear.addEventListener('pointerdown', (e) => {
  try {
    gear.setPointerCapture(e.pointerId);
  } catch {
    // Capture is a nicety; the hold still works without it.
  }
  gear.classList.add('holding');
  gearTimer = window.setTimeout(() => {
    gear.classList.remove('holding');
    gearHint.hidden = true;
    setMusic.checked = parent.music;
    setFighting.checked = parent.fighting;
    setLimit.value = String(parent.limit);
    setQuality.value = qualityMode;
    $('played').textContent = `Played today: ${minutesToday()} minutes`;
    openParentPanel();
  }, 1500);
});
const gearRelease = (): void => {
  // Let go too early: explain the hold instead of doing nothing.
  if (gear.classList.contains('holding')) {
    gearHint.hidden = false;
    window.clearTimeout(hintTimer);
    hintTimer = window.setTimeout(() => {
      gearHint.hidden = true;
    }, 3000);
  }
  gear.classList.remove('holding');
  window.clearTimeout(gearTimer);
};
gear.addEventListener('pointerup', gearRelease);
gear.addEventListener('pointercancel', gearRelease);

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
  // ---- emoji messages: the only thing players can say to each other ----
  const selfBubble = makeMarker(EMOTES[0]);
  selfBubble.scale.setScalar(0.1);
  selfBubble.visible = false;
  avatar.add(selfBubble);
  let emoteUntil = 0;
  const emotesEl = $('emotes');
  EMOTES.forEach((emoji, i) => {
    const b = document.createElement('button');
    b.textContent = emoji;
    b.addEventListener('click', () => {
      selfBubble.material.map = emojiTexture(emoji);
      selfBubble.visible = true;
      emoteUntil = now + 3.5;
      net.send({ t: 'e', i });
      sfx.chirp();
    });
    emotesEl.appendChild(b);
  });
  $('emote-btn').addEventListener('click', () => {
    emotesEl.hidden = !emotesEl.hidden;
  });

  let hero: Actor | null = null;
  let heroIndex = Math.max(0, CHARACTERS.indexOf(localStorage.getItem(HERO_KEY) ?? 'Rogue'));
  let heroToken = 0;

  const SWORDS = ['sword_1handed', 'axe_1handed', 'sword_2handed'];
  const swordModels: THREE.Object3D[] = [assets.sword];
  function equip(): void {
    const item = tool === SWORD ? (swordModels[swordLevel] ?? assets.sword) : tool === STAFF ? assets.staff : null;
    hero?.hold(item ? item.clone() : null);
  }
  /** Better blades from the shop are downloaded the first time they are needed. */
  async function loadSword(level: number): Promise<void> {
    if (!swordModels[level]) swordModels[level] = (await loadModel(`weapon/${SWORDS[level]}.gltf`)).scene;
    equip();
  }
  if (swordLevel > 0) void loadSword(swordLevel);

  // ---- hats ----
  function wearHat(): void {
    hero?.wear(hat ? makeHat(hat) : null);
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
    wearHat();
  }
  await setHero(heroIndex);
  $('prev').addEventListener('click', () => void setHero(heroIndex - 1));
  $('next').addEventListener('click', () => void setHero(heroIndex + 1));

  // ---- going from one place to another: a quick fade instead of a jump ----
  const fadeEl = $('fade');
  let travelling = false;
  /** Walking into a doorway only works once until he has stepped clear of every doorway again. */
  let zonesArmed = true;
  let inAnyZone = false;
  function travel(move: () => void): void {
    if (travelling) return;
    travelling = true;
    zonesArmed = false;
    player.vel.set(0, 0, 0);
    fadeEl.classList.add('on');
    sfx.door();
    window.setTimeout(() => {
      move();
      window.setTimeout(() => {
        fadeEl.classList.remove('on');
        travelling = false;
      }, 180);
    }, 380);
  }
  /** A doorway on the ground: stepping into it sets off `enter`. */
  function atZone(x: number, z: number, radius: number, enter: () => void): void {
    const d = Math.hypot(x - player.pos.x, z - player.pos.z);
    if (d < radius + 0.8) inAnyZone = true;
    if (d < radius && zonesArmed && !travelling && !driving && !riding) travel(enter);
  }

  // ---- house interiors ----
  const home = new Home(scene);
  const mapEl = $('map');
  /** Standing by the door of a village house (the well does not count). */
  const nearDoor = (): boolean => {
    // His house is the first one in each village; the others are neighbours' and stay shut.
    const b = villageShown?.buildings[1];
    // Doors open by walking into them now, so there is no button.
    void b;
    return false;
  };
  /** A point in front of his house's door, `ahead` metres out from the wall. */
  const doorSpotOf = (index: number, ahead: number): THREE.Vector3 | null => {
    const b = villageShown?.buildings[index];
    if (!b) return null;
    const d = b.scale * 0.4 + ahead;
    const x = b.x + Math.sin(b.rot) * d;
    const z = b.z + Math.cos(b.rot) * d;
    return new THREE.Vector3(x, groundAt(x, z), z);
  };
  const doorSpot = (ahead: number): THREE.Vector3 | null => doorSpotOf(1, ahead);
  /** Friends in the room each get the next house along: the second building, the third, and so on. */
  const friendHouses = (): string[] => peers.ids().sort().slice(0, 3);
  const friendSigns = [0, 1, 2].map(() => {
    const sign = makeMarker('🏠');
    sign.scale.setScalar(0.08);
    const name = makeLabel();
    sign.visible = false;
    scene.add(sign, name);
    return { sign, name };
  });
  const homeMessage = (): { t: 'home'; owned: string[]; layout: Record<string, Spot>; wall: number; floor: number } => ({
    t: 'home',
    owned: [...furniture],
    layout,
    wall: wallColour,
    floor: floorColour,
  });
  // His front door: it swings open as he comes near.
  const frontDoor = new THREE.Group();
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(2, 3.4, 0.16), new THREE.MeshLambertMaterial({ color: 0x7a4f2a }));
  leaf.position.set(1, 1.7, 0);
  leaf.castShadow = true;
  const hinge = new THREE.Group();
  hinge.position.x = -1;
  hinge.add(leaf);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.5, 3.8, 0.1), new THREE.MeshLambertMaterial({ color: 0x1c1a17 }));
  frame.position.set(0, 1.8, -0.12);
  frontDoor.add(hinge, frame);
  frontDoor.visible = false;
  scene.add(frontDoor);
  let doorOpen = 0;
  function updateDoors(dt: number): void {
    inAnyZone = false;
    const at = doorSpot(0.25);
    frontDoor.visible = at !== null && inside === null;
    let near = false;
    if (inside) {
      // Indoors: the way out is the door in the far wall.
      const dz = ROOM.z + ROOM.halfZ - player.pos.z;
      near = dz < 4.5 && Math.abs(player.pos.x - ROOM.x) < 3;
      atZone(ROOM.x, ROOM.z + ROOM.halfZ - 0.4, 1.5, goOutside);
    } else if (at) {
      const b = villageShown?.buildings[1];
      frontDoor.position.copy(at);
      frontDoor.rotation.y = b ? b.rot : 0;
      near = at.distanceTo(player.pos) < 6.5 && !driving;
      // Walking into the doorway takes him in.
      const step = doorSpot(1);
      if (step) atZone(step.x, step.z, 1.5, goInside);
    }
    // Friends' houses: a sign with their face and name, and a doorway into their room.
    const friends = friendHouses();
    friendSigns.forEach(({ sign, name }, i) => {
      const id = friends[i];
      const house = villageShown?.buildings[2 + i];
      const who = id ? peers.who(id) : null;
      sign.visible = name.visible = !!house && !!who && inside === null;
      if (!house || !who || !id || inside) return;
      sign.material.map = emojiTexture(who.face);
      sign.position.set(house.x, groundAt(house.x, house.z) + house.scale * 1.15, house.z);
      name.position.copy(sign.position);
      const title = `${who.name || 'Friend'} house`;
      if (name.userData.title !== title) {
        name.userData.title = title;
        setLabel(name, title);
      }
      const door = doorSpotOf(2 + i, 1);
      if (door) atZone(door.x, door.z, 1.5, () => goInside(id));
    });
    if (!inside && at) {
    }
    doorOpen += ((near ? 1 : 0) - doorOpen) * Math.min(1, 6 * dt);
    hinge.rotation.y = -doorOpen * 1.7;
    home.swing(doorOpen);
  }
  const homeTools = $('home-tools');
  $('wall-btn').addEventListener('click', () => {
    wallColour++;
    home.setColours(wallColour, floorColour);
    sfx.place();
    dirty = true;
  });
  $('floor-btn').addEventListener('click', () => {
    floorColour++;
    home.setColours(wallColour, floorColour);
    sfx.place();
    dirty = true;
  });
  function goInside(owner: string | null = null): void {
    setFlying(false);
    setCrawling(false);
    // Coming back out, he will be standing a few steps in front of the door.
    inside = doorSpotOf(owner ? 2 + friendHouses().indexOf(owner) : 1, 6) ?? player.pos.clone();
    visiting = owner;
    home.clear();
    // A few steps into the room, clear of the doorway, so turning round and walking back works.
    player.pos.set(ROOM.x, ROOM.y, ROOM.z + ROOM.halfZ - 5.2);
    player.vel.set(0, 0, 0);
    facing = Math.PI;
    camYaw = 0;
    camTarget.copy(player.pos);
    if (owner) {
      // A friend's house: shown as they left it, to look at but not rearrange.
      const theirs = homes.get(owner) ?? { owned: [], layout: {}, wall: 0, floor: 0 };
      home.setColours(theirs.wall, theirs.floor);
      home.show(true, new Set(theirs.owned), theirs.layout);
      homeTools.hidden = true;
    } else {
      home.setColours(wallColour, floorColour);
      home.show(true, furniture, layout);
      homeTools.hidden = false;
      if (!homeSeen) speak('Welcome home! Tap a thing to pick it up, then tap where you want it. Tap it twice to turn it. Walk to the door to go out.');
      homeSeen = true;
    }
    mapEl.hidden = true;
    attackEl.hidden = true;
    sfx.door();
  }
  function goOutside(): void {
    if (!inside) return;
    player.pos.copy(inside);
    player.pos.y = groundAt(player.pos.x, player.pos.z);
    // Facing away from the house, as if he had just walked out.
    const out = villageShown?.buildings[1];
    if (out) facing = out.rot;
    camTarget.copy(player.pos);
    inside = null;
    if (!visiting) {
      // Remember where everything was left, and let friends know.
      layout = home.layout();
      net.send(homeMessage());
    }
    home.show(false, furniture, layout);
    visiting = null;
    homeTools.hidden = true;
    dirty = true;
    mapEl.hidden = false;
    selectTool(tool);
    sfx.door();
  }

  // ---- playing together: other players in the same room, and shared building ----
  const net = new Net();
  // The plane has no model file, so friends in one are drawn as their hero.
  const peers = new Peers(scene, assets.clips, assets.pets, new Set(GARAGE.filter((g) => g.kind !== 'plane').map((g) => g.name)));
  const greeted = new Set<string>();
  let netTimer = 0;
  net.onMessage = (from, msg) => {
    if (msg.t === 's') {
      peers.set(from, msg);
      // First sight of someone: show them everything built here so far.
      if (!greeted.has(from)) {
        greeted.add(from);
        net.send({ t: 'B', list: blocks.save() });
        net.send(homeMessage());
      }
    } else if (msg.t === 'bye') {
      peers.remove(from);
      greeted.delete(from);
    } else if (msg.t === 'b') {
      if ([msg.x, msg.y, msg.z, msg.k].every(Number.isInteger) && blocks.set(msg.x, msg.y, msg.z, msg.k)) {
        // Blocks a friend places count toward building jobs too.
        if (msg.k > 0 && quests.add('blocks', 1, msg.k)) showQuests();
      }
      dirty = true;
    } else if (msg.t === 'B' && Array.isArray(msg.list)) {
      blocks.load(msg.list.slice(0, 5000).filter((b) => Array.isArray(b) && b.length === 4 && b.every(Number.isInteger)));
      dirty = true;
    } else if (msg.t === 'got') {
      // A friend picked something up: it goes for us too, and we share the prize.
      if (Array.isArray(msg.ids)) gotPickups(msg.ids.slice(0, 20).filter((id) => typeof id === 'string' && id.length < 24), false);
    } else if (msg.t === 'home') {
      // A friend's house, checked so only sensible values are kept.
      const spots: Record<string, Spot> = {};
      for (const [key, spot] of Object.entries(msg.layout ?? {}).slice(0, 12)) {
        if (Array.isArray(spot) && spot.length === 3 && spot.every(Number.isFinite)) spots[key.slice(0, 12)] = spot;
      }
      homes.set(from, {
        owned: (Array.isArray(msg.owned) ? msg.owned : []).filter((k) => typeof k === 'string').slice(0, 12),
        layout: spots,
        wall: Number.isInteger(msg.wall) ? Math.abs(msg.wall) : 0,
        floor: Number.isInteger(msg.floor) ? Math.abs(msg.floor) : 0,
      });
    } else if (msg.t === 'race') {
      if (villageShown && Math.hypot(villageShown.x - msg.x, villageShown.z - msg.z) < 5 && !race) {
        startRace(true);
        toast('🏁 Race!');
      }
    } else if (msg.t === 'racewon') {
      const who = peers.who(from);
      toast(`🏁 ${who?.name || who?.face || 'A friend'} finished!`);
      sfx.chirp();
    } else if (msg.t === 'give') {
      // A friend handed us something.
      if (msg.to !== selfId) return;
      const item = ITEMS.find((i) => i.key === msg.key);
      if (msg.key === 'coin') coins++;
      else if (item) bag[item.key]++;
      else return;
      showCoins();
      showBag();
      sfx.coin();
      speak(`${peers.nearest(player.pos, 1e9)?.name || 'Your friend'} gave you a ${msg.key}!`);
      dirty = true;
    } else if (msg.t === 'hello') {
      selfId = String(msg.id);
    } else if (msg.t === 'en') {
      if (enemies.remote) {
        enemies.apply(msg);
        if (typeof msg.c === 'number' && Number.isFinite(msg.c) && Math.abs(msg.c - dayClock) > 3) dayClock = msg.c % DAY_LENGTH;
        // The same weather for everyone.
        if (typeof msg.w === 'number' && Number.isFinite(msg.w) && Math.abs(msg.w - worldTime) > 3) worldTime = msg.w;
      }
    } else if (msg.t === 'dmg') {
      if (!enemies.remote) enemies.damageById(msg.id, msg.n, msg.x, msg.z, enemyContext);
    } else if (msg.t === 'hit') {
      if (msg.to === selfId && Number.isFinite(msg.x) && Number.isFinite(msg.z)) hurt(msg);
    } else if (msg.t === 'won') {
      reward(msg.boss === true, typeof msg.fort === 'string' ? msg.fort.slice(0, 20) : '');
    } else if (msg.t === 'e') {
      if (EMOTES[msg.i]) {
        peers.emote(from, EMOTES[msg.i]);
        sfx.chirp();
      }
    }
  };
  const roomInput = $<HTMLInputElement>('room-code');
  const roomStatus = $('room-status');
  const roomJoin = $('room-join');
  const friendsBtn = $('friends-btn');
  net.onStatus = (on) => {
    roomStatus.textContent = on ? '✅' : '';
    roomJoin.textContent = on ? '⏹️' : '▶️';
    friendsBtn.classList.toggle('on', on);
    if (!on) {
      peers.clear();
      greeted.clear();
      selfId = 'me';
      enemies.remote = false;
    }
  };
  friendsBtn.addEventListener('click', () => {
    $('friends').hidden = !$('friends').hidden;
  });
  roomJoin.addEventListener('click', () => {
    if (net.connected) {
      net.close();
      return;
    }
    const room = roomInput.value.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ai = getAiSettings();
    roomInput.value = room;
    // Playing together goes through the family's own helper, so that has to be set up first.
    if (!ai.url) roomStatus.textContent = '⚙️';
    else if (room.length < 2) roomStatus.textContent = '❓';
    else {
      roomStatus.textContent = '⏳';
      net.connect(ai.url, ai.code, room);
    }
  });

  // ---- program Bolt ----
  let coding = false;
  let puzzleLevel = 0;
  // The star Bolt has to reach in a puzzle.
  const goalStar = makeStar();
  goalStar.scale.setScalar(1.6);
  goalStar.visible = false;
  scene.add(goalStar);
  const codePos = new THREE.Vector3();
  let codeTurns = 0;
  const coder = new Coder({
    origin: () => ({
      x: Math.floor(player.pos.x + Math.sin(facing) * 2),
      z: Math.floor(player.pos.z + Math.cos(facing) * 2),
      turns: ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4,
    }),
    move: (x, z, turns) => {
      codePos.set(x + 0.5, groundAt(x + 0.5, z + 0.5), z + 0.5);
      codeTurns = turns;
    },
    place: (x, z) => {
      // On the ground, or on top of whatever is already stacked in that square.
      let y = Math.ceil(groundAt(x + 0.5, z + 0.5) - 0.3);
      while (blocks.has(x, y, z)) y++;
      const k = tool >= FIRST_BLOCK ? currentBlock() : HOTBAR[0];
      if (!blocks.set(x, y, z, k)) return;
      net.send({ t: 'b', x, y, z, k });
      if (quests.add('blocks', 1, k)) showQuests();
      sfx.place();
      dirty = true;
    },
    busy: (on) => {
      coding = on;
      if (on) sfx.chirp();
    },
    goal: (cell) => {
      goalStar.visible = cell !== null;
      if (cell) goalStar.position.set(cell.x + 0.5, groundAt(cell.x + 0.5, cell.z + 0.5) + 1.2, cell.z + 0.5);
    },
    solved: (level) => {
      puzzleLevel = level;
      coins += 3;
      showCoins();
      sfx.win();
      speak('You did it! Bolt reached the star. Here is a harder one!');
      cheerUntil = now + 2.5;
      dirty = true;
    },
    missed: () => {
      sfx.remove();
      speak('Not quite. Try again!');
    },
  });
  $('code-btn').addEventListener('click', () => {
    if (!inside) coder.toggle();
  });

  /** Stars and chests picked up, by us or by a friend in the room. Everyone shares the prize. */
  function gotPickups(ids: string[], mine: boolean): void {
    let stars = 0;
    let chests = 0;
    for (const id of ids) {
      // Our own are already marked as taken; a friend's are taken here.
      if (!mine && !terrain.take(id)) continue;
      if (id.startsWith('c')) chests++;
      else stars++;
    }
    if (chests > 0) {
      chestsOpened += chests;
      coins += chests * 8;
      bag.gem += chests;
      showBag();
      showCoins();
      sfx.win();
      speak('Treasure! Eight coins!');
    }
    if (stars > 0) {
      if (quests.add('stars', stars)) showQuests();
      sfx.star();
      // Counting out loud as the stars add up.
      if (chests === 0) speak(String(starTotal()));
      bubbleUntil = now + 3;
    }
    if (stars + chests === 0) return;
    showStars(true);
    if (mine) cheerUntil = now + 2.2;
    dirty = true;
  }

  /** Until this time a one-shot animation (swing, cast, flinch) owns the hero's pose. */
  let busyUntil = 0;
  const animate = (name: string, speed = 1): void => {
    if (now >= busyUntil) hero?.play(name, speed);
  };

  // ---- vehicle: one at a time, swapped from the garage ----
  const vehicle = new THREE.Group();
  vehicle.rotation.order = 'YXZ';
  scene.add(vehicle);
  let vehicleKind: 'car' | 'boat' | 'plane' = 'car';
  let propeller: THREE.Object3D | null = null;
  let wheels: THREE.Object3D[] = [];
  let vehicleToken = 0;

  async function setVehicle(item: GarageItem): Promise<void> {
    const token = ++vehicleToken;
    let model: THREE.Object3D;
    propeller = null;
    if (item.kind === 'plane') {
      // No aeroplane in the model packs, so this one is built from simple shapes.
      model = makePlane();
      propeller = model.getObjectByName('propeller') ?? null;
    } else {
      const gltf = await loadModel(`${item.kind}/${item.name}.glb`);
      if (token !== vehicleToken) return;
      model = gltf.scene.clone(true);
      model.scale.setScalar(VEHICLE_SCALE);
    }
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

  // ---- what makes one village different from the next ----
  const hashOf = (text: string): number => {
    let h = 7;
    for (const c of text) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    return h;
  };
  const NAME_START = ['Apple', 'Moss', 'Honey', 'Pebble', 'Clover', 'Maple', 'Sunny', 'Willow', 'Berry', 'Fern'];
  const NAME_END = ['ton', 'by', 'ford', 'wick', 'dale', 'brook', 'field', 'ham'];
  const villageName = (v: Village): string => {
    const h = hashOf(v.id);
    return NAME_START[h % NAME_START.length] + NAME_END[(h >> 8) % NAME_END.length];
  };
  const toastEl = $('toast');
  let toastTimer = 0;
  /** A short message at the top of the screen, gone in a few seconds. */
  function toast(text: string): void {
    toastEl.textContent = text;
    toastEl.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toastEl.hidden = true;
    }, 3500);
  }

  // ---- villagers of whichever village is nearby ----
  interface Villager {
    actor: Actor;
    persona: string;
    marker: THREE.Sprite;
    /** Set for townsfolk who stroll about. */
    wander: { heading: number; timer: number; walking: boolean } | null;
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
    // Each village has its own name, and not all the townsfolk live in every one.
    const locals = VILLAGERS.filter((def) => !def.wander || hashOf(v.id + def.persona) % 3 !== 0);
    const models = await Promise.all(locals.map((def) => loadModel(`char/${def.model}.glb`)));
    if (token !== villageToken) return;
    if (started) {
      toast(`🏠 ${villageName(v)}`);
      speak(`Welcome to ${villageName(v)}!`);
    }
    locals.forEach((def, i) => {
      const actor = new Actor(models[i].scene, assets.clips, ['Idle_A', 'Waving', 'Walking_A']);
      const x = v.x + def.dx;
      const z = v.z + def.dz;
      actor.root.position.set(x, groundAt(x, z), z);
      actor.play('Idle_A');
      const marker = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false }));
      marker.position.y = 3.5;
      marker.scale.setScalar(1.4);
      actor.root.add(marker);
      scene.add(actor.root);
      villagers.push({ actor, persona: def.persona, marker, wander: def.wander ? { heading: 0, timer: Math.random() * 3, walking: false } : null });
    });
  }

  function updateVillagers(dt: number, who: THREE.Vector3): void {
    const v = nearestVillage(who.x, who.z);
    const close = v && v.kind === 'village' && Math.hypot(v.x - who.x, v.z - who.z) < 170 ? v : null;
    if (close !== villageShown) void showVillage(close);
    nearVillager = null;
    let best = 5;
    for (const person of villagers) {
      const mark = person.persona === 'shop' ? '🛒' : MARKS[quests.state(person.persona)];
      person.marker.visible = mark !== '';
      if (mark) person.marker.material.map = emojiTexture(mark);
      const p = person.actor.root.position;
      const d = Math.hypot(p.x - who.x, p.z - who.z);
      // Far-off villagers are not drawn or animated.
      person.actor.root.visible = d < 100;
      if (d >= 100) continue;
      if (d < 9) {
        // Turn and wave when the hero comes over.
        const want = Math.atan2(who.x - p.x, who.z - p.z);
        let diff = want - person.actor.root.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        person.actor.root.rotation.y += diff * Math.min(1, 6 * dt);
        person.actor.play('Waving');
      } else if (person.wander && villageShown) {
        // Stroll a few steps, stop a while, and never leave the village green.
        const w = person.wander;
        w.timer -= dt;
        if (w.timer <= 0) {
          w.walking = !w.walking;
          w.timer = 2 + Math.random() * 4;
          if (w.walking) w.heading = Math.random() * Math.PI * 2;
        }
        if (w.walking) {
          const nx = p.x + Math.sin(w.heading) * 1.6 * dt;
          const nz = p.z + Math.cos(w.heading) * 1.6 * dt;
          if (Math.hypot(nx - villageShown.x, nz - villageShown.z) > 24) w.heading += Math.PI;
          else p.set(nx, groundAt(nx, nz), nz);
          let turn = w.heading - person.actor.root.rotation.y;
          turn = Math.atan2(Math.sin(turn), Math.cos(turn));
          person.actor.root.rotation.y += turn * Math.min(1, 6 * dt);
          person.actor.play('Walking_A');
        } else {
          person.actor.play('Idle_A');
        }
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
    if (vehicleKind === 'plane' && carPos.y > Math.max(groundAt(carPos.x, carPos.z), SEA_LEVEL) + 0.6) {
      speak('Land the plane first!');
      return;
    }
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

  // ---- quests: walking up to a villager gives a job, a reminder, or the reward ----
  function talkTo(persona: string): void {
    if (persona === 'shop') {
      openShop();
      return;
    }
    // Townsfolk with no jobs to give just chat.
    if (quests.state(persona) === 'none') {
      chat.open(PERSONAS[persona]);
      return;
    }
    const result = quests.talk(persona);
    if (result.reward > 0) {
      coins += result.reward;
      showCoins();
      sfx.win();
      cheerUntil = now + 2.5;
    }
    showQuests();
    dirty = true;
    chat.open(PERSONAS[persona], result.text);
  }

  // ---- shop: spend coins on better gear ----
  const shopEl = $('shop');
  interface ShopItem {
    icon: string;
    price: number;
    owned(): boolean;
    buy(): void;
    /** For things that can be switched once owned. */
    use?(): void;
  }
  const hatItem = (icon: string, key: string, price: number): ShopItem => ({
    icon,
    price,
    owned: () => hatsOwned.has(key),
    buy: () => {
      hatsOwned.add(key);
      hat = key;
      wearHat();
    },
    use: () => {
      hat = hat === key ? '' : key;
      wearHat();
      dirty = true;
    },
  });
  const furnitureItem = (icon: string, key: string, price: number): ShopItem => ({
    icon,
    price,
    owned: () => furniture.has(key),
    buy: () => {
      furniture.add(key);
    },
  });
  const SHOP: ShopItem[] = [
    { icon: '🪓', price: 10, owned: () => swordLevel >= 1, buy: () => { swordLevel = 1; void loadSword(1); } },
    { icon: '⚔️', price: 30, owned: () => swordLevel >= 2, buy: () => { swordLevel = 2; void loadSword(2); } },
    { icon: '❤️', price: 15, owned: () => extraHearts >= 3, buy: () => { extraHearts++; maxHearts++; hearts = maxHearts; showHearts(); } },
    { icon: '👟', price: 20, owned: () => boots, buy: () => { boots = true; } },
    hatItem('🥳', 'party', 8),
    hatItem('🎩', 'top', 12),
    hatItem('👑', 'crown', 25),
    // Furniture appears in his house the next time he goes in.
    furnitureItem('💡', 'lamp', 6),
    furnitureItem('📚', 'shelf', 8),
    furnitureItem('🗄️', 'cabinet', 8),
    furnitureItem('🛋️', 'couch', 10),
    furnitureItem('🍽️', 'table', 10),
  ];
  function renderShop(): void {
    // Top of the market: one button for each kind of thing he is carrying. A tap sells one.
    const selling = ITEMS.filter((item) => bag[item.key] > 0).map((item) => {
      const b = document.createElement('button');
      b.className = 'sell';
      const price = document.createElement('span');
      price.textContent = `×${bag[item.key]} ➜ 🪙${item.price}`;
      b.append(item.icon, price);
      b.addEventListener('click', () => {
        if (bag[item.key] <= 0) return;
        bag[item.key]--;
        coins += item.price;
        showCoins();
        showBag();
        sfx.coin();
        dirty = true;
        renderShop();
      });
      return b;
    });
    // Every market sells the gear; hats and furniture depend on the village, so they are worth travelling for.
    const stock = SHOP.filter((item, i) => i < 4 || item.owned() || hashOf(`${villageShown?.id}${i}`) % 3 !== 0);
    shopEl.replaceChildren(
      ...selling,
      ...stock.map((item) => {
        const b = document.createElement('button');
        const owned = item.owned();
        b.className = owned ? 'owned' : coins < item.price ? 'poor' : '';
        const price = document.createElement('span');
        price.textContent = owned ? '✅' : `🪙 ${item.price}`;
        b.append(item.icon, price);
        b.addEventListener('click', () => {
          // Something already owned that can be switched: a hat goes on or comes off.
          if (item.owned() && item.use) {
            item.use();
            sfx.place();
            renderShop();
            return;
          }
          if (item.owned() || coins < item.price) {
            sfx.remove();
            return;
          }
          coins -= item.price;
          item.buy();
          showCoins();
          sfx.win();
          dirty = true;
          renderShop();
        });
        return b;
      }),
    );
  }
  function openShop(): void {
    renderShop();
    shopEl.hidden = false;
    shopSeen = true;
    speak('Welcome to the market! Tap the top row to sell what is in your bag. Tap the rest to buy.', { pitch: 1.15, rate: 0.95 });
  }

  // ---- pet: a befriended animal that follows along ----
  let pet: Pet | null = petSpecies >= 0 && assets.pets[petSpecies] ? new Pet(scene, assets.pets[petSpecies], player.pos) : null;
  let nearAnimal: Animal | null = null;
  function befriend(animal: Animal): void {
    petSpecies = animals.adopt(animal);
    // The old pet goes back to the wild.
    pet?.dispose();
    pet = new Pet(scene, assets.pets[petSpecies], animal.root.position);
    quests.add('pet', 1);
    showQuests();
    sfx.star();
    speak('You made a new friend!');
    cheerUntil = now + 2;
    dirty = true;
  }

  input.onAction = () => {
    if (!started) return;
    const lift = peers.driverNear(player.pos, 6);
    if (riding) hopOut();
    else if (fishing) reel();
    else if (driving) exitVehicle();
    else if (holeNear) useHole(holeNear);
    else if (nearVillager) talkTo(nearVillager.persona);
    else if (nearFlag()) startRace(false);
    else if (nearAnimal) befriend(nearAnimal);
    else if (nearDoor()) goInside();
    else if (nearVehicle()) enterVehicle();
    else if (lift) riding = lift;
    else if (canFish()) startFishing();
    dirty = true;
  };
  actionEl.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    input.onAction();
  });

  // ---- garage: any car or boat, wherever he is ----
  /** A spot for the new vehicle: land ahead for cars, the nearest water for boats. */
  /** A little propeller plane made of boxes: fuselage, wings, tail and a spinning propeller. */
  function makePlane(): THREE.Object3D {
    const plane = new THREE.Group();
    const part = (w: number, h: number, d: number, color: number, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      plane.add(mesh);
      return mesh;
    };
    part(1.3, 1.3, 5, 0xe8413c, 0, 0.4, 0);
    part(1.1, 0.7, 1.3, 0xbfe9ff, 0, 1.2, 0.5);
    part(9, 0.18, 1.6, 0xf4f6fa, 0, 0.5, 0.6);
    part(3.4, 0.16, 1, 0xf4f6fa, 0, 0.6, -2.3);
    part(0.16, 1.3, 1, 0xe8413c, 0, 1.2, -2.3);
    part(0.5, 0.5, 0.3, 0x2b2d33, 0, 0.4, 2.6);
    const prop = part(2.6, 0.22, 0.08, 0x2b2d33, 0, 0.4, 2.8);
    prop.name = 'propeller';
    for (const x of [-0.9, 0.9]) part(0.25, 0.7, 0.7, 0x2b2d33, x, -0.55, 0.6);
    return plane;
  }

  function findSpot(kind: 'car' | 'boat' | 'plane'): THREE.Vector3 | null {
    // The plane always waits at the west end of the airstrip, pointing down the runway.
    if (kind === 'plane') return new THREE.Vector3(AIRSTRIP.x - AIRSTRIP.halfLength + 8, AIRSTRIP.h, AIRSTRIP.z);
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

  /** Two vehicles are free; the rest are unlocked with coins, once, and kept. */
  function renderGarage(): void {
    garageEl.replaceChildren(
      ...GARAGE.map((item) => {
        const b = document.createElement('button');
        b.append(item.icon);
        if (!ownedVehicles.has(item.name)) {
          const price = document.createElement('span');
          price.textContent = `🪙${item.price}`;
          b.append(price);
          if (coins < item.price) b.className = 'poor';
        }
        b.addEventListener('click', () => {
          if (!ownedVehicles.has(item.name)) {
            if (coins < item.price) {
              sfx.remove();
              return;
            }
            coins -= item.price;
            ownedVehicles.add(item.name);
            showCoins();
            sfx.win();
            dirty = true;
          }
          garageEl.hidden = true;
          if (inside || underground) return;
          if (driving) exitVehicle();
          const spot = findSpot(item.kind);
          if (!spot) {
            speak(item.kind === 'boat' ? 'Boats need water. Let us find the sea!' : 'Cars need dry land!');
            return;
          }
          void setVehicle(item).then(() => {
            carPos.copy(spot);
            carHeading = item.kind === 'plane' ? Math.PI / 2 : facing;
            // The plane is parked at the airstrip: he has to go there to fly it.
            if (item.kind === 'plane' && player.pos.distanceTo(spot) > 30) {
              speak('Your plane is waiting at the airstrip! Follow the plane on the map.');
              dirty = true;
              return;
            }
            enterVehicle();
            sfx.honk();
            dirty = true;
          });
        });
        return b;
      }),
    );
  }
  $('garage-btn').addEventListener('click', () => {
    renderGarage();
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
  /** The fort whose giant skeleton is currently out. */
  let bossFort = '';

  interface MagicBolt {
    mesh: THREE.Mesh;
    vel: THREE.Vector3;
    life: number;
  }
  const bolts: MagicBolt[] = [];
  const boltGeometry = new THREE.SphereGeometry(0.35, 10, 8);
  const boltMaterial = new THREE.MeshBasicMaterial({ color: 0x7df9ff });

  const isSafe = (x: number, z: number): boolean => {
    if (!parent.fighting || Math.hypot(x, z) < 110) return true;
    const v = nearestVillage(x, z);
    return v !== null && v.kind === 'village' && Math.hypot(v.x - x, v.z - z) < VILLAGE_RADIUS + 55;
  };

  /** Our id in the room; 'me' when playing alone. */
  let selfId = 'me';
  /** Whether skeletons may go for us right now. */
  let targetable = true;
  let netEnemyTimer = 0;

  /** A skeleton's blow or orb landed on us. */
  function hurt(from: { x: number; z: number }): void {
    if (now < invulnerableUntil || !targetable) return;
    invulnerableUntil = now + 1.2;
    lastHurt = now;
    hearts--;
    sfx.ouch();
    const away = Math.atan2(player.pos.x - from.x, player.pos.z - from.z);
    knock.set(Math.sin(away) * 10, 0, Math.cos(away) * 10);
    if (hero) busyUntil = now + hero.once('Hit_A', 1.5) * 0.7;
    if (hearts <= 0) {
      // Out of hearts: pop back to the last quiet spot, good as new.
      hearts = maxHearts;
      player.pos.copy(safeSpot);
      player.vel.set(0, 0, 0);
      knock.set(0, 0, 0);
      enemies.clearNear(player.pos, 80);
      speak('Oops! Let us try again!');
    }
    showHearts();
  }

  /** A skeleton was beaten. When friends play together, everyone in the room gets the prize. */
  function reward(boss: boolean, fort: string): void {
    if (boss) {
      // The fort's giant skeleton: a big reward, and the fort stays won.
      coins += 25;
      bonusStars += 5;
      if (fort) clearedForts.add(fort);
      showCoins();
      showStars(true);
      sfx.win();
      speak(fort.startsWith('b') ? 'You beat the giant skeleton! The treasure is yours!' : 'You beat the giant skeleton! The fort is safe now.');
      cheerUntil = now + 3;
      dirty = true;
      return;
    }
    coins++;
    kills++;
    bag.bone++;
    showCoins();
    showBag();
    if (quests.add('skeletons', 1)) showQuests();
    bonusStars++;
    showStars(true);
    sfx.star();
    speak(String(starTotal()));
    dirty = true;
  }

  const enemyContext: EnemyContext = {
    isSafe,
    onHit(targetId, from) {
      if (targetId === selfId) hurt(from);
      else net.send({ t: 'hit', to: targetId, x: from.x, z: from.z });
    },
    onDefeat(_at, boss) {
      const fort = boss ? bossFort : '';
      if (boss) bossFort = '';
      reward(boss, fort);
      net.send({ t: 'won', boss, fort });
    },
    collide(pos, radius) {
      terrain.collide(pos, radius);
    },
    sendDamage(id, amount, x, z) {
      net.send({ t: 'dmg', id, n: amount, x, z });
    },
  };

  function attack(): void {
    if (!started || driving || swimming || inside || chat.isOpen || !hero || now < attackReady) return;
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
        if (enemies.damageAt(point, 2.7, 1 + swordLevel, enemyContext) > 0) sfx.bonk();
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
    if (hearts < maxHearts && now - lastHurt > 6) {
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

    // Nobody gets jumped while they are away from the controls.
    targetable = !flying && !driving && !chat.isOpen && !inside && !riding && performance.now() - input.lastActivity < AWAY_MS;
    const targets: Target[] = [{ id: selfId, pos: player.pos, targetable }, ...peers.targets()];
    // When friends play together, the player with the lowest id runs the skeletons for everyone;
    // the others show the same skeletons and report their hits.
    enemies.remote = net.connected && peers.ids().some((id) => id < selfId);
    if (!enemies.remote) {
      // Anyone walking up to a fort that has not been won brings out its giant skeleton.
      for (const t of targets) {
        const fort = nearestVillage(t.pos.x, t.pos.z);
        // A dungeon's giant skeleton waits by the treasure; a separate mark records beating it.
        const deep = fort?.kind === 'dungeon';
        const mark = fort ? (deep ? `b${fort.id}` : fort.id) : '';
        if (
          fort &&
          (fort.kind === 'fort' || deep) &&
          t.targetable &&
          parent.fighting &&
          !clearedForts.has(mark) &&
          !enemies.bossAlive &&
          Math.hypot(fort.x - t.pos.x, fort.z - t.pos.z) < (deep ? 20 : 60)
        ) {
          bossFort = mark;
          enemies.spawnBoss(fort.x + (deep ? 3 : 10), fort.z + (deep ? 3 : 10));
        }
      }
    }
    enemies.maxEnemies = night > 0.5 ? 6 : 3;
    enemies.update(dt, targets, enemyContext);
    netEnemyTimer -= dt;
    if (!enemies.remote && net.connected && netEnemyTimer <= 0) {
      netEnemyTimer = 0.12;
      // The host's clock is everyone's clock, so it is day or night for all at once.
      net.send({ t: 'en', c: Math.round(dayClock), w: Math.round(worldTime), ...enemies.snapshot() });
    }
  }

  // ---- the builder's kit: more materials, ready-made shapes, and undo ----
  type Cell = [number, number, number, number];
  /** Each edit as the cells it changed and what they were before, newest last. */
  const undoStack: Cell[][] = [];
  let stamp = '';
  let extraBlock = 0;
  const currentBlock = (): number => extraBlock || HOTBAR[Math.max(0, tool - FIRST_BLOCK)];

  /** Change some cells, tell friends, and remember how to undo it. Returns how many changed. */
  function edit(cells: Cell[], remember = true): number {
    const before: Cell[] = [];
    const changed: Cell[] = [];
    for (const [x, y, z, t] of cells) {
      const was = blocks.map.get(`${x},${y},${z}`) ?? 0;
      if (was === t) continue;
      before.push([x, y, z, was]);
      changed.push([x, y, z, t]);
    }
    if (changed.length === 0) return 0;
    blocks.setMany(changed);
    net.send({ t: 'B', list: changed });
    if (remember) {
      undoStack.push(before);
      if (undoStack.length > 30) undoStack.shift();
    }
    return changed.length;
  }

  /** The cells of each ready-made shape: x across, y up, z away from the builder. */
  const SHAPES: Record<string, () => [number, number, number][]> = {
    wall: () => {
      const out: [number, number, number][] = [];
      for (let x = -2; x <= 2; x++) for (let y = 0; y < 3; y++) out.push([x, y, 0]);
      return out;
    },
    tower: () => {
      const out: [number, number, number][] = [];
      for (let y = 0; y < 6; y++) for (let x = -1; x <= 1; x++) for (let z = 0; z < 3; z++) if (x !== 0 || z !== 1) out.push([x, y, z]);
      return out;
    },
    stairs: () => {
      const out: [number, number, number][] = [];
      for (let z = 0; z < 5; z++) for (let y = 0; y <= z; y++) for (let x = -1; x <= 1; x++) out.push([x, y, z]);
      return out;
    },
    hut: () => {
      const out: [number, number, number][] = [];
      for (let x = -2; x <= 2; x++) {
        for (let z = 0; z < 5; z++) {
          const edge = Math.abs(x) === 2 || z === 0 || z === 4;
          // A doorway in the middle of the near wall.
          for (let y = 0; y < 3; y++) if (edge && !(x === 0 && z === 0 && y < 2)) out.push([x, y, z]);
          out.push([x, 3, z]);
        }
      }
      return out;
    },
    bridge: () => {
      const out: [number, number, number][] = [];
      for (let z = 0; z < 8; z++) for (let x = -1; x <= 1; x++) out.push([x, 0, z]);
      for (let z = 0; z < 8; z++) for (const x of [-2, 2]) out.push([x, 0, z], [x, 1, z]);
      return out;
    },
    pyramid: () => {
      const out: [number, number, number][] = [];
      for (let y = 0; y < 4; y++) for (let x = -3 + y; x <= 3 - y; x++) for (let z = y; z <= 6 - y; z++) out.push([x, y, z]);
      return out;
    },
  };
  /** Build a whole shape at the tapped spot, facing the way the hero faces. */
  function placeStamp(bx: number, by: number, bz: number): void {
    const turns = ((Math.round(facing / (Math.PI / 2)) % 4) + 4) % 4;
    const k = currentBlock();
    const shape: Cell[] = stamp === 'mine' ? blueprint : SHAPES[stamp]().map(([x, y, z]) => [x, y, z, k]);
    const cells: Cell[] = shape.map(([x, y, z, type]) => {
      // Quarter turns: away from the builder is +z, +x, -z or -x.
      const wx = [x, z, -x, -z][turns];
      const wz = [z, -x, -z, x][turns];
      return [bx + wx, by + y, bz + wz, type];
    });
    const n = edit(cells);
    if (n === 0) return;
    if (quests.add('blocks', n, k)) showQuests();
    sfx.place();
    sfx.win();
    dirty = true;
  }
  const buildEl = $('build');
  const kitButtons: HTMLButtonElement[] = [];
  const kitButton = (label: string, onTap: (b: HTMLButtonElement) => void, color = 0): void => {
    const b = document.createElement('button');
    if (color) b.style.background = `#${color.toString(16).padStart(6, '0')}`;
    else b.textContent = label;
    b.addEventListener('click', () => onTap(b));
    buildEl.appendChild(b);
    kitButtons.push(b);
  };
  const lightKit = (on: HTMLButtonElement | null): void => kitButtons.forEach((b) => b.classList.toggle('on', b === on));
  kitButton('↩️', () => {
    const last = undoStack.pop();
    if (!last) return;
    // Putting things back is not itself something to undo.
    edit(last, false);
    sfx.remove();
    dirty = true;
  });
  for (const [key, icon] of [['wall', '🧱'], ['tower', '🗼'], ['stairs', '🪜'], ['hut', '🏠'], ['bridge', '🌉'], ['pyramid', '🔺']]) {
    kitButton(icon, (b) => {
      stamp = stamp === key ? '' : key;
      if (tool < FIRST_BLOCK) selectTool(FIRST_BLOCK);
      lightKit(stamp ? b : null);
    });
  }
  for (const type of EXTRA_BLOCKS) {
    kitButton('', () => {
      selectTool(FIRST_BLOCK);
      extraBlock = type;
      toolButtons.forEach((b) => b.classList.remove('selected'));
    }, BLOCK_COLORS[type]);
  }
  // 📸 remembers whatever is built near him; 🖼️ builds it again somewhere else.
  const BLUEPRINT_KEY = 'oliverblox-blueprint';
  let blueprint: Cell[] = [];
  try {
    blueprint = JSON.parse(localStorage.getItem(BLUEPRINT_KEY) ?? '[]') as Cell[];
  } catch {
    blueprint = [];
  }
  kitButton('📸', () => {
    const cx = Math.floor(player.pos.x);
    const cz = Math.floor(player.pos.z);
    const near: Cell[] = [];
    for (const [key, type] of blocks.map) {
      const [x, y, z] = key.split(',').map(Number);
      if (Math.abs(x - cx) <= 8 && Math.abs(z - cz) <= 8) near.push([x, y, z, type]);
    }
    if (near.length === 0) {
      speak('Stand next to something you built, then take its picture.');
      return;
    }
    // Stored from its lowest block, a little in front of where it is placed.
    const low = Math.min(...near.map((c) => c[1]));
    const midX = Math.round(near.reduce((sum, c) => sum + c[0], 0) / near.length);
    const minZ = Math.min(...near.map((c) => c[2]));
    blueprint = near.slice(0, 600).map(([x, y, z, type]) => [x - midX, y - low, z - minZ, type]);
    localStorage.setItem(BLUEPRINT_KEY, JSON.stringify(blueprint));
    sfx.win();
    speak('Got it! Tap the picture button, then tap where you want another one.');
  });
  kitButton('🖼️', (b) => {
    if (blueprint.length === 0) {
      speak('Take a picture of something you built first.');
      return;
    }
    stamp = stamp === 'mine' ? '' : 'mine';
    if (tool < FIRST_BLOCK) selectTool(FIRST_BLOCK);
    lightKit(stamp ? b : null);
  });
  onPickTool = () => {
    // Choosing from the hotbar goes back to its own colours and single blocks.
    extraBlock = 0;
    stamp = '';
    lightKit(null);
  };
  $('build-btn').addEventListener('click', () => {
    buildEl.hidden = !buildEl.hidden;
  });

  // ---- building, or swinging if a weapon is in hand ----
  const ray = new THREE.Vector3();
  input.onTap = (px, py, button) => {
    if (started && inside) {
      // In a friend's house things stay where they put them.
      if (visiting) return;
      // At home, taps arrange the furniture instead of building.
      ray
        .set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1, 0.5)
        .unproject(camera)
        .sub(camera.position)
        .normalize();
      const point = home.floorPoint(camera.position, ray);
      const did = point ? home.tap(point.x, point.z) : null;
      if (did === 'pick') sfx.chirp();
      else if (did) sfx.place();
      return;
    }
    if (!started || driving) return;
    garageEl.hidden = true;
    shopEl.hidden = true;
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
      if (hit.kind === 'block' && edit([[hit.x, hit.y, hit.z, 0]]) > 0) {
        sfx.remove();
        dirty = true;
      }
      return;
    }
    if (stamp) {
      placeStamp(hit.px, hit.py, hit.pz);
      return;
    }
    if (bodyTouchesCell(player, hit.px, hit.py, hit.pz)) return;
    if (edit([[hit.px, hit.py, hit.pz, currentBlock()]]) > 0) {
      if (quests.add('blocks', 1, currentBlock())) showQuests();
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
    // Held still for the moment the screen is dark between two places.
    if (travelling) {
      hero?.update(dt);
      return;
    }
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    // Camera-relative movement: forward is away from the camera.
    const mx = -sin * input.moveZ + cos * input.moveX;
    const mz = -cos * input.moveZ - sin * input.moveX;
    const moving = Math.hypot(mx, mz) > 0.1;
    if (moving && now >= busyUntil) facing = Math.atan2(mx, mz);
    const ground = groundAt(pos.x, pos.z);
    const before = pos.clone();

    if (inside) {
      // Indoors: a flat floor and four walls.
      vel.set(mx * WALK_SPEED, 0, mz * WALK_SPEED);
      pos.addScaledVector(vel, dt);
      home.clamp(pos, 0.7, 0);
      pos.y = ROOM.y;
      player.onGround = true;
      swimming = false;
    } else if (flying) {
      // God mode: no gravity, no walls, straight over mountains and sea.
      const speed = FLY_SPEED * (input.run ? 2 : 1);
      vel.set(mx * speed, ((input.jump ? 1 : 0) - (input.down ? 1 : 0)) * 11, mz * speed);
      pos.addScaledVector(vel, dt);
      pos.y = Math.max(pos.y, groundAt(pos.x, pos.z) + 0.1, SWIM_Y);
      // Solid things stay solid in the air; only flying above them gets past.
      terrain.collide(pos, player.hw);
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
        let speed = crawling ? CRAWL_SPEED : input.run ? RUN_SPEED * (boots ? 1.35 : 1) : WALK_SPEED;
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

  let planeClimb = 0;
  /**
   * A small flight sim. Push forward to speed up along the ground; past take-off speed the
   * up button climbs and the down button descends. Too slow in the air and it sinks back down.
   */
  function updatePlane(dt: number, controlled: boolean): void {
    const floor = Math.max(groundAt(carPos.x, carPos.z), SEA_LEVEL);
    const airborne = carPos.y > floor + 0.3;
    const TAKE_OFF = 15;
    if (controlled) {
      if (input.moveZ > 0.1) carSpeed += 15 * dt;
      else if (input.moveZ < -0.1) carSpeed -= 16 * dt;
      else if (!airborne) carSpeed -= 5 * dt;
      carSpeed = Math.min(36, Math.max(airborne ? 9 : 0, carSpeed));
      carHeading -= input.moveX * (airborne ? 1.1 : 1.5 * Math.min(1, carSpeed / 6)) * dt;
    } else if (!airborne) {
      carSpeed = Math.max(0, carSpeed - 20 * dt);
    }
    // Lift needs speed: flying too slowly loses height however hard the up button is pressed.
    let want = 0;
    if (carSpeed >= TAKE_OFF) want = controlled ? ((input.jump ? 1 : 0) - (input.down ? 1 : 0)) * 10 : 0;
    else if (airborne) want = -(TAKE_OFF - carSpeed) * 0.9 - 1;
    planeClimb += (want - planeClimb) * Math.min(1, 3 * dt);
    carPos.x += Math.sin(carHeading) * carSpeed * dt;
    carPos.z += Math.cos(carHeading) * carSpeed * dt;
    carPos.y = Math.min(160, carPos.y + planeClimb * dt);
    const below = Math.max(groundAt(carPos.x, carPos.z), SEA_LEVEL);
    if (carPos.y <= below) {
      carPos.y = below;
      planeClimb = Math.max(0, planeClimb);
    }
    if (terrain.collide(carPos, 2)) carSpeed *= 1 - Math.min(1, 4 * dt);
    if (carSpeed > 0.1) dirty = true;

    carPitch += (-planeClimb * 0.035 - carPitch) * Math.min(1, 5 * dt);
    carRoll += ((airborne && controlled ? input.moveX * 0.55 : 0) - carRoll) * Math.min(1, 4 * dt);
    vehicle.position.copy(carPos).setY(carPos.y + 0.9);
    vehicle.rotation.set(carPitch, carHeading, carRoll);
    if (propeller) propeller.rotation.z += (6 + carSpeed) * dt * 3;
    if (controlled) {
      let diff = carHeading + Math.PI - camYaw;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      camYaw += diff * Math.min(1, 3 * dt);
    }
  }

  function updateVehicle(dt: number, controlled: boolean): void {
    if (vehicleKind === 'plane') {
      updatePlane(dt, controlled);
      return;
    }
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
    // Pulled in close underground, where walls would otherwise get between the camera and the hero.
    const dist = !started ? 6.5 : inside ? 7 : underground ? Math.min(camDist, 6.5) : driving ? camDist + 4 : camDist;
    const pitch = started ? camPitch : 0.12;
    camOffset.set(Math.sin(camYaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(camYaw) * Math.cos(pitch));
    camera.position.copy(camTarget).addScaledVector(camOffset, dist);
    // Never let the camera sink into a hillside or under the sea.
    const floor = Math.max(groundAt(camera.position.x, camera.position.z), SEA_LEVEL) + 0.6;
    if (camera.position.y < floor) camera.position.y = floor;
    if (inside) home.clamp(camera.position, 0.5, 0.6);
    if (dungeonNow) {
      // Underground the camera stays inside the outer walls and under the roof.
      const edge = DUNGEON_HALF - 1;
      camera.position.x = Math.min(dungeonNow.x + edge, Math.max(dungeonNow.x - edge, camera.position.x));
      camera.position.z = Math.min(dungeonNow.z + edge, Math.max(dungeonNow.z - edge, camera.position.z));
      camera.position.y = Math.min(camera.position.y, dungeonNow.h + DUNGEON_HEIGHT - 0.8);
      camera.lookAt(camTarget);
    }
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
    // While running a program, Bolt goes where the commands send him.
    if (coding) boltWant.set(codePos.x, codePos.y + 1.4, codePos.z);
    if (robot.position.distanceTo(boltWant) > 80) robot.position.copy(boltWant);
    robot.position.lerp(boltWant, Math.min(1, (coding ? 12 : 4) * dt));
    robot.rotation.y = coding ? (codeTurns * Math.PI) / 2 : Math.atan2(who.x - robot.position.x, who.z - robot.position.z);

    boltHead.copy(robot.position).setY(robot.position.y + 1.7).project(camera);
    const show = now < bubbleUntil && boltHead.z < 1 && !chat.isOpen;
    bubble.hidden = !show;
    if (show) {
      bubble.textContent = `⭐ ${starTotal()}`;
      bubble.style.left = `${(boltHead.x * 0.5 + 0.5) * window.innerWidth}px`;
      bubble.style.top = `${(-boltHead.y * 0.5 + 0.5) * window.innerHeight}px`;
    }
  }

  // ---- maze treasure: a big chest waiting in the middle ----
  const mazeChest = assets.props.chest.clone(true);
  mazeChest.scale.setScalar(2.2);
  mazeChest.visible = false;
  scene.add(mazeChest);

  // ---- the sign over his own house ----
  const houseSign = makeMarker('🏡');
  houseSign.scale.setScalar(0.09);
  const houseName = makeLabel();
  houseSign.visible = false;
  scene.add(houseSign, houseName);

  // ---- ring race: start at the flag in a village, run or drive through eight rings ----
  const flag = makeMarker('🏁');
  flag.scale.setScalar(0.09);
  flag.visible = false;
  scene.add(flag);
  const flagPos = new THREE.Vector3();
  const ringGeometry = new THREE.TorusGeometry(2.3, 0.3, 8, 22);
  const ringNext = new THREE.MeshBasicMaterial({ color: 0xffd43b });
  const ringLater = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.45 });
  const RACE_SECONDS = 90;
  let race: { rings: THREE.Mesh[]; next: number; start: number } | null = null;
  const raceEl = $('race');
  const nearFlag = (): boolean =>
    flag.visible && !driving && Math.hypot(flagPos.x - player.pos.x, flagPos.z - player.pos.z) < 4.5;
  function startRace(fromFriend = false): void {
    const v = villageShown;
    if (!v || race) return;
    // Friends in the same village race the same rings.
    if (!fromFriend) net.send({ t: 'race', x: v.x, z: v.z });
    const rings: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.4;
      const x = v.x + Math.sin(a) * 42;
      const z = v.z + Math.cos(a) * 42;
      const ring = new THREE.Mesh(ringGeometry, i === 0 ? ringNext : ringLater);
      ring.position.set(x, Math.max(groundAt(x, z), SEA_LEVEL) + 2.3, z);
      // Turned side-on to the circle, so running round the village goes through each one.
      ring.rotation.y = a + Math.PI / 2;
      scene.add(ring);
      rings.push(ring);
    }
    race = { rings, next: 0, start: now };
    raceEl.hidden = false;
    sfx.chirp();
    speak('Ready, set, go! Run through the yellow rings!');
  }
  function endRace(won: boolean): void {
    if (!race) return;
    for (const ring of race.rings) scene.remove(ring);
    const seconds = Math.round(now - race.start);
    race = null;
    raceEl.hidden = true;
    if (!won) {
      speak('Out of time. Try again!');
      return;
    }
    // Faster is worth more, but finishing always pays.
    raced = true;
    net.send({ t: 'racewon', n: getPlayerName() });
    const prize = Math.max(3, 14 - Math.floor(seconds / 6));
    coins += prize;
    showCoins();
    sfx.win();
    speak(`You finished in ${seconds} seconds! Here are ${prize} coins!`);
    cheerUntil = now + 3;
    dirty = true;
  }

  // ---- fishing: cast from the shore, wait for the float to dip, then reel in ----
  const bobber = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 }));
  bobber.visible = false;
  scene.add(bobber);
  let fishing: { biteAt: number; from: THREE.Vector3; splashed: boolean } | null = null;
  /** Standing on the shore or in the shallows, facing water. */
  const canFish = (): boolean => {
    if (swimming || flying || driving || inside || riding) return false;
    const ahead = groundAt(player.pos.x + Math.sin(facing) * 4, player.pos.z + Math.cos(facing) * 4);
    return ahead < SEA_LEVEL - 0.6 && groundAt(player.pos.x, player.pos.z) > SEA_LEVEL - 1.2;
  };
  function startFishing(): void {
    fishing = { biteAt: now + 2 + Math.random() * 4, from: player.pos.clone(), splashed: false };
    bobber.position.set(player.pos.x + Math.sin(facing) * 4, SEA_LEVEL + 0.1, player.pos.z + Math.cos(facing) * 4);
    bobber.visible = true;
    sfx.splash();
    if (hero) busyUntil = now + hero.once('Throw', 1.3) * 0.8;
  }
  function stopFishing(): void {
    fishing = null;
    bobber.visible = false;
  }
  function reel(): void {
    if (!fishing) return;
    const biting = now >= fishing.biteAt;
    stopFishing();
    if (!biting) {
      speak('Too soon! Wait for the float to dip.');
      return;
    }
    fishCount++;
    bag.fish++;
    showBag();
    sfx.coin();
    speak(`You caught a fish! It is in your bag. You can sell it at the market.`);
    cheerUntil = now + 2;
    dirty = true;
  }

  // ---- riding in a friend's car or boat ----
  let riding: string | null = null;
  function hopOut(): void {
    riding = null;
    avatar.visible = true;
    player.pos.x += 3.4;
    player.pos.y = Math.max(groundAt(player.pos.x, player.pos.z), SWIM_Y);
    player.vel.set(0, 0, 0);
    selectTool(tool);
    sfx.door();
  }

  // ---- letters to find: Robin's job puts three letters around the village, one of them the right one ----
  const letterSprites: { sprite: THREE.Sprite; letter: number }[] = [];
  let lettersShown = '';
  let letterNag = 0;
  function updateLetters(who: THREE.Vector3): void {
    const q = quests.get('ranger');
    const v = villageShown;
    const active = q && q.type === 'letter' && q.have < q.need && v ? q : null;
    const key = active && v ? `${v.id}:${active.k}` : '';
    if (key !== lettersShown) {
      lettersShown = key;
      for (const s of letterSprites) scene.remove(s.sprite);
      letterSprites.length = 0;
      if (active && v) {
        const k = active.k ?? 0;
        [k, (k + 7) % 26, (k + 15) % 26].forEach((letter, i) => {
          const a = k * 1.7 + i * 2.1;
          const x = v.x + Math.sin(a) * 38;
          const z = v.z + Math.cos(a) * 38;
          const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(LETTERS[letter]) }));
          sprite.scale.set(12, 3, 1);
          sprite.position.set(x, groundAt(x, z) + 2.4, z);
          scene.add(sprite);
          letterSprites.push({ sprite, letter });
        });
      }
    }
    if (!active) return;
    for (const s of letterSprites) {
      if (Math.hypot(s.sprite.position.x - who.x, s.sprite.position.z - who.z) > 2.6) continue;
      if (s.letter === active.k) {
        quests.add('letter', 1);
        showQuests();
        sfx.win();
        speak(`Yes! That is the letter ${LETTERS[s.letter]}! Go and tell Robin.`);
        cheerUntil = now + 2;
        dirty = true;
      } else if (now > letterNag) {
        // The wrong letter is a chance to name it, not a failure.
        letterNag = now + 4;
        sfx.remove();
        speak(`That is ${LETTERS[s.letter]}. Look for ${LETTERS[active.k ?? 0]}!`);
      }
    }
  }

  // ---- caves and dungeons ----
  // The dark hole at a cave mouth, the ladder back out, and the roof overhead.
  const hole = new THREE.Mesh(new THREE.CircleGeometry(3.4, 24), new THREE.MeshBasicMaterial({ color: 0x050507 }));
  hole.rotation.x = -Math.PI / 2;
  hole.visible = false;
  const ladder = makeMarker('🪜');
  ladder.scale.setScalar(0.09);
  ladder.visible = false;
  const roof = new THREE.Mesh(
    new THREE.PlaneGeometry(DUNGEON_HALF * 2 + 40, DUNGEON_HALF * 2 + 40),
    new THREE.MeshLambertMaterial({ color: 0x2a2a31, side: THREE.DoubleSide }),
  );
  roof.rotation.x = Math.PI / 2;
  roof.visible = false;
  // The hero's torch: the only real light underground.
  const torch = new THREE.PointLight(0xffc98a, 0, 34, 1.4);
  torch.position.y = 3;
  torch.visible = false;
  avatar.add(torch);
  scene.add(hole, ladder, roof);
  /** The dungeon he is in, if any. */
  let dungeonNow: Village | null = null;
  /** The cave mouth or dungeon ladder he is standing at, if any. */
  let holeNear: Village | null = null;
  /** Where a dungeon's ladder is: just inside its +z edge. */
  const ladderSpot = (d: Village): THREE.Vector3 =>
    new THREE.Vector3(d.x, groundAt(d.x, d.z + DUNGEON_HALF - 1.7), d.z + DUNGEON_HALF - 1.7);
  function useHole(from: Village | null): void {
    const to = from ? linkedPlace(from) : null;
    // A cave so far out that its dungeon would not exist is just a hole in the ground.
    if (!from || !to || (from.kind === 'cave' && to.kind !== 'dungeon')) return;
    setFlying(false);
    setCrawling(false);
    if (to.kind === 'dungeon') {
      // He lands a few steps in from the ladder, which stands against the wall behind him.
      player.pos.set(to.x, groundAt(to.x, to.z + DUNGEON_HALF - 4.6), to.z + DUNGEON_HALF - 4.6);
      // Arrive looking along the first corridor, with the camera behind.
      facing = Math.PI;
      camYaw = 0;
      camPitch = 0.55;
      speak('Down into the dark! Find the treasure.');
    } else {
      player.pos.set(to.x, groundAt(to.x, to.z + 11), to.z + 11);
      speak('Back up in the sunshine!');
    }
    player.vel.set(0, 0, 0);
    camTarget.copy(player.pos);
    sfx.door();
    dirty = true;
  }
  function updateCaves(who: THREE.Vector3, place: Village | null): void {
    const dist = place ? Math.hypot(place.x - who.x, place.z - who.z) : Infinity;
    const cave = place?.kind === 'cave' && dist < 150 ? place : null;
    const dungeon = place?.kind === 'dungeon' && dist < DUNGEON_HALF + 30 ? place : null;
    underground = dungeon !== null;
    dungeonNow = dungeon;
    hole.visible = cave !== null;
    if (cave) hole.position.set(cave.x, groundAt(cave.x, cave.z) + 0.12, cave.z);
    roof.visible = ladder.visible = dungeon !== null;
    torch.intensity = dungeon ? 30 : 0;
    // Switched right off above ground: even a dark light makes every surface do extra work.
    torch.visible = dungeon !== null;
    holeNear = null;
    // Walking onto the hole goes down; walking onto the ladder comes back up.
    if (cave && !driving) atZone(cave.x, cave.z, 2.4, () => useHole(cave));
    if (dungeon) {
      const spot = ladderSpot(dungeon);
      roof.position.set(dungeon.x, dungeon.h + DUNGEON_HEIGHT, dungeon.z);
      ladder.position.copy(spot).setY(spot.y + 3);
      atZone(spot.x, spot.z, 1.3, () => useHole(dungeon));
      // A sealed room: nobody walks out through the outer wall.
      const edge = DUNGEON_HALF - 1.2;
      player.pos.x = Math.min(dungeon.x + edge, Math.max(dungeon.x - edge, player.pos.x));
      player.pos.z = Math.min(dungeon.z + edge, Math.max(dungeon.z - edge, player.pos.z));
    }
  }

  /** The smaller things going on around the hero: caves, maze treasure, the race, fishing and letters. */
  function updateExtras(who: THREE.Vector3): void {
    const place = nearestVillage(who.x, who.z);
    updateCaves(who, place);
    const maze = place && (place.kind === 'maze' || place.kind === 'dungeon') && !clearedForts.has(place.id) ? place : null;
    mazeChest.visible = maze !== null;
    if (maze) {
      mazeChest.position.set(maze.x, groundAt(maze.x, maze.z), maze.z);
      if (Math.hypot(maze.x - who.x, maze.z - who.z) < 3) {
        clearedForts.add(maze.id);
        const deep = maze.kind === 'dungeon';
        coins += deep ? 40 : 20;
        bag.gem += deep ? 4 : 2;
        showBag();
        bonusStars += deep ? 6 : 3;
        showCoins();
        showStars(true);
        sfx.coin();
        speak(deep ? 'You found the dungeon treasure! Forty coins!' : 'You found the treasure in the middle of the maze! Twenty coins!');
        cheerUntil = now + 3;
        dirty = true;
      }
    }

    const mine = villageShown?.buildings[1];
    houseSign.visible = houseName.visible = !!mine;
    if (mine) {
      houseSign.position.set(mine.x, groundAt(mine.x, mine.z) + mine.scale * 1.15, mine.z);
      houseName.position.copy(houseSign.position);
      const title = `${getPlayerName() || 'My'} house`;
      if (houseName.userData.title !== title) {
        houseName.userData.title = title;
        setLabel(houseName, title);
      }
    }
    flag.visible = villageShown !== null && !race;
    if (villageShown) {
      flagPos.set(villageShown.x + 17, 0, villageShown.z - 17);
      flagPos.y = groundAt(flagPos.x, flagPos.z);
      flag.position.copy(flagPos).setY(flagPos.y + 3);
    }
    if (race) {
      const ring = race.rings[race.next];
      ring.rotation.z += 0.04;
      if (Math.hypot(ring.position.x - who.x, ring.position.z - who.z) < 3.6) {
        scene.remove(ring);
        race.next++;
        sfx.star();
        if (race.next >= race.rings.length) endRace(true);
        else race.rings[race.next].material = ringNext;
      }
    }
    if (race) {
      const left = RACE_SECONDS - Math.floor(now - race.start);
      raceEl.textContent = `🏁 ${race.next}/${race.rings.length}  ⏱️ ${Math.max(0, left)}`;
      if (left <= 0) endRace(false);
    }

    if (fishing) {
      const biting = now >= fishing.biteAt;
      bobber.position.y = biting ? SEA_LEVEL - 0.3 : SEA_LEVEL + 0.1 + Math.sin(now * 3) * 0.05;
      if (biting && !fishing.splashed) {
        fishing.splashed = true;
        sfx.splash();
      }
      if (now > fishing.biteAt + 1.6) {
        stopFishing();
        speak('It got away! Try again.');
      } else if (fishing.from.distanceTo(player.pos) > 2) {
        stopFishing();
      }
    }
    updateLetters(who);
  }

  // ---- the bag: what he is carrying and what he owns ----
  const bagEl = $('bag');
  const zoomEl = $('map-zoom');
  function showBag(): void {
    if (bagEl.hidden) return;
    const cell = (icon: string, label: string, onTap?: () => void, lit = false): HTMLElement => {
      const b = document.createElement('button');
      const text = document.createElement('span');
      text.textContent = label;
      b.append(icon, text);
      if (lit) b.className = 'on';
      if (onTap) b.addEventListener('click', onTap);
      return b;
    };
    const hatIcons: Record<string, string> = { party: '🥳', top: '🎩', crown: '👑' };
    // With a friend standing close, tapping a thing hands one over.
    const friend = peers.nearest(player.pos, 7);
    const give = (key: string): (() => void) | undefined =>
      friend
        ? () => {
            if (key === 'coin' ? coins < 1 : bag[key] < 1) return;
            if (key === 'coin') coins--;
            else bag[key]--;
            net.send({ t: 'give', to: friend.id, key });
            sfx.coin();
            showCoins();
            showBag();
            dirty = true;
          }
        : undefined;
    bagEl.replaceChildren(
      ...(friend ? [cell('🎁', `➜ ${friend.face}`, undefined, true)] : []),
      ...ITEMS.map((item) => cell(item.icon, `×${bag[item.key]}`, give(item.key))),
      cell('🪙', `×${coins}`, give('coin')),
      cell(['🗡️', '🪓', '⚔️'][swordLevel], '✓'),
      cell('🪄', '✓'),
      ...(boots ? [cell('👟', '✓')] : []),
      // Hats can be put on and taken off straight from the bag.
      ...[...hatsOwned].map((key) =>
        cell(hatIcons[key] ?? '🎩', hat === key ? '✓' : '', () => {
          hat = hat === key ? '' : key;
          wearHat();
          dirty = true;
          sfx.place();
          showBag();
        }, hat === key),
      ),
    );
  }
  $('bag-btn').addEventListener('click', () => {
    bagEl.hidden = !bagEl.hidden;
    showBag();
  });

  // ---- the guide: one goal at a time, an arrow to it, and Bolt to explain ----
  interface Step {
    icon: string;
    say: string;
    target(): { x: number; z: number } | null;
    done(): boolean;
  }
  const homeVillage = nearestVillage(80, 75);
  const firstFort = nearestVillage(-150, 40);
  const firstMaze = nearestVillage(70, -150);
  const firstCave = nearestVillage(-70, -150);
  const firstDungeon = firstCave ? linkedPlace(firstCave) : null;
  const offset = (v: Village | null, dx: number, dz: number): { x: number; z: number } | null =>
    v ? { x: v.x + dx, z: v.z + dz } : null;
  const nearestStar = (): { x: number; z: number } | null => {
    let best: { x: number; z: number } | null = null;
    let bestDist = Infinity;
    for (const s of terrain.stars) {
      const d = Math.hypot(s.pos.x - player.pos.x, s.pos.z - player.pos.z);
      if (d < bestDist) {
        best = s.pos;
        bestDist = d;
      }
    }
    return best;
  };
  // ---- the menu: everything that is not needed every second lives behind one button ----
  const menuEl = $('menu');
  $('menu-btn').addEventListener('click', () => {
    menuEl.hidden = !menuEl.hidden;
  });
  // Choosing something from the menu puts the menu away.
  menuEl.addEventListener('click', () => {
    menuEl.hidden = true;
  });
  /** His house in the village nearest to where he is now, or the first village if none is near. */
  function myHouse(): { x: number; z: number; rot: number; scale: number } | null {
    let best: Village | null = null;
    let bestDist = Infinity;
    for (const v of villagesNear(player.pos.x, player.pos.z)) {
      const d = Math.hypot(v.x - player.pos.x, v.z - player.pos.z);
      if (v.kind === 'village' && d < bestDist) {
        best = v;
        bestDist = d;
      }
    }
    return (best ?? homeVillage)?.buildings[1] ?? null;
  }
  $('home-btn').addEventListener('click', () => {
    if (!started) return;
    if (driving) {
      speak('Hop out first, then we can go home.');
      return;
    }
    travel(() => {
      // Wherever he is, indoors, underground or far away, he lands at his own front door.
      if (inside) goOutside();
      if (riding) hopOut();
      setFlying(false);
      const house = myHouse();
      if (!house) return;
      const d = house.scale * 0.4 + 6;
      player.pos.set(house.x + Math.sin(house.rot) * d, 0, house.z + Math.cos(house.rot) * d);
      player.pos.y = groundAt(player.pos.x, player.pos.z);
      player.vel.set(0, 0, 0);
      facing = house.rot + Math.PI;
      camYaw = house.rot;
      camTarget.copy(player.pos);
      speak('Home sweet home!');
      dirty = true;
    });
  });

  const STEPS: Step[] = [
    { icon: '⭐', say: 'Let us find a star! Follow the arrow at the top.', target: nearestStar, done: () => starTotal() >= 1 },
    { icon: '🏠', say: 'Great! Now let us visit the village.', target: () => offset(homeVillage, 0, 0), done: () => !!homeVillage && Math.hypot(homeVillage.x - player.pos.x, homeVillage.z - player.pos.z) < 26 },
    {
      icon: '🏡',
      say: 'The house with the little house sign is yours! Walk up to the door and go in.',
      target: () => (homeVillage ? { x: homeVillage.buildings[1].x, z: homeVillage.buildings[1].z } : null),
      done: () => homeSeen,
    },
    { icon: '❗', say: 'Mira the wizard has a job for you. Walk up to her and tap the yellow button.', target: () => offset(homeVillage, 7, 5), done: () => quests.state('mage') !== 'new' || coins > 0 },
    { icon: '🎁', say: 'Do the job, then go back to Mira for your coins.', target: () => (quests.state('mage') === 'done' ? offset(homeVillage, 7, 5) : nearestStar()), done: () => coins > 0 || shopSeen },
    { icon: '🛒', say: 'You have coins! Visit the market, by the shopping trolley.', target: () => offset(homeVillage, -3, 9), done: () => shopSeen },
    { icon: '🐾', say: 'Now make an animal friend. Walk up to one and tap the paw.', target: () => animals.nearest(player.pos, 400)?.root.position ?? null, done: () => petSpecies >= 0 },
    { icon: '🏁', say: 'Try the ring race! Go to the flag in the village.', target: () => offset(homeVillage, 17, -17), done: () => raced },
    { icon: '🎣', say: 'Let us go fishing. Stand at the edge of the water and tap the fishing button.', target: () => null, done: () => fishCount > 0 },
    { icon: '🏛️', say: 'Time for an adventure! Find the treasure in the middle of the maze.', target: () => offset(firstMaze, 0, 0), done: () => !!firstMaze && clearedForts.has(firstMaze.id) },
    { icon: '🏰', say: 'Are you brave? Beat the giant skeleton at the fort.', target: () => offset(firstFort, 0, 0), done: () => !!firstFort && clearedForts.has(firstFort.id) },
    { icon: '🕳️', say: 'Last one! Walk into the cave and find the dungeon treasure.', target: () => (underground && firstDungeon ? offset(firstDungeon, 0, 0) : offset(firstCave, 0, 0)), done: () => !!firstDungeon && clearedForts.has(firstDungeon.id) },
  ];
  const guideEl = $('guide');
  const guideIcon = $('guide-icon');
  const guideArrow = $('guide-arrow');
  const guideDist = $('guide-dist');
  /** Where the current goal is, for the arrow and the map. */
  let guideTarget: { x: number; z: number } | null = null;
  let guideTimer = 1.5;
  let guideSaid = -1;
  // Once the guided goals are done there is always one more small thing to go for.
  const BONUS: Record<string, { icon: string; count: () => number; say: (n: number) => string; min: number; max: number }> = {
    stars: { icon: '⭐', count: starTotal, say: (n) => `Can you find ${n} more stars?`, min: 3, max: 5 },
    skeletons: { icon: '💀', count: () => kills, say: (n) => `Can you bonk ${n} skeletons?`, min: 2, max: 4 },
    fish: { icon: '🐟', count: () => fishCount, say: (n) => `Can you catch ${n} fish?`, min: 1, max: 2 },
  };
  function newBonus(): void {
    const kinds = Object.keys(BONUS).filter((k) => k !== 'skeletons' || parent.fighting);
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    const def = BONUS[kind];
    const need = def.min + Math.floor(Math.random() * (def.max - def.min + 1));
    bonus = { kind, need, start: def.count() };
    speak(def.say(need));
    dirty = true;
  }

  function updateGuide(dt: number, who: THREE.Vector3): void {
    guideTimer -= dt;
    const step: Step | undefined = STEPS[guideStep];
    const extra = !step && bonus ? BONUS[bonus.kind] : null;
    if (guideTimer <= 0) {
      guideTimer = 0.5;
      // Keeps the bag's give buttons right as friends come and go.
      showBag();
      // Skip anything already done, so an old save is not walked through the basics again.
      let advanced = false;
      while (guideStep < STEPS.length && STEPS[guideStep].done()) {
        guideStep++;
        advanced = true;
      }
      if (advanced) {
        sfx.win();
        dirty = true;
      }
      const next = STEPS[guideStep];
      if (next && guideSaid !== guideStep && !chat.isOpen) {
        guideSaid = guideStep;
        // Bolt explains each new goal once.
        window.setTimeout(() => speak(next.say), advanced ? 1800 : 0);
        bubbleUntil = now + 4;
      } else if (!next && !chat.isOpen) {
        if (guideSaid !== guideStep) {
          guideSaid = guideStep;
          if (advanced) speak('You did everything! You are a real hero.');
        } else if (!bonus || !BONUS[bonus.kind]) {
          newBonus();
        } else if (BONUS[bonus.kind].count() - bonus.start >= bonus.need) {
          bonus = null;
          coins += 5;
          showCoins();
          sfx.win();
          cheerUntil = now + 2;
          speak('Well done! Here are five coins.');
          dirty = true;
        }
      }
      // Stars are the only extra goal with somewhere to point.
      guideTarget = next ? next.target() : bonus?.kind === 'stars' ? nearestStar() : null;
      guideIcon.textContent = next ? next.icon : extra ? extra.icon : '';
    }
    guideEl.hidden = (!step && !extra) || race !== null || inside !== null || chat.isOpen;
    if (guideEl.hidden) return;
    const progress = extra && bonus ? `${Math.min(bonus.need, extra.count() - bonus.start)}/${bonus.need}` : '';
    if (!guideTarget) {
      guideArrow.textContent = '';
      guideDist.textContent = progress;
      return;
    }
    // Turn the arrow to point at the goal as seen on screen: up means straight ahead.
    const dx = guideTarget.x - who.x;
    const dz = guideTarget.z - who.z;
    const right = dx * Math.cos(camYaw) - dz * Math.sin(camYaw);
    const ahead = -dx * Math.sin(camYaw) - dz * Math.cos(camYaw);
    guideArrow.textContent = '⬆';
    guideArrow.style.transform = `rotate(${Math.atan2(right, ahead)}rad)`;
    guideDist.textContent = progress || String(Math.round(Math.hypot(dx, dz)));
  }

  let actionShown = '';

  // ---- map: where the villages, stars and his things are ----
  const miniMap = new MiniMap($<HTMLCanvasElement>('map'));
  $('map-in').addEventListener('click', () => miniMap.zoomBy(-1));
  $('map-out').addEventListener('click', () => miniMap.zoomBy(1));
  function updateMap(dt: number, who: THREE.Vector3): void {
    const icons: MapIcon[] = [];
    for (const s of terrain.stars) icons.push({ x: s.pos.x, z: s.pos.z, icon: '⭐' });
    if (!driving) icons.push({ x: carPos.x, z: carPos.z, icon: vehicleKind === 'boat' ? '⛵' : vehicleKind === 'plane' ? '✈️' : '🚗', pin: vehicleKind === 'plane' });
    icons.push({ x: AIRSTRIP.x, z: AIRSTRIP.z, icon: '🛫' });
    // Only the closest village is pinned to the rim, so the arrow to follow is never in doubt.
    const places = villagesNear(who.x, who.z);
    let closest: Village | null = null;
    let best = Infinity;
    for (const v of places) {
      const d = Math.hypot(v.x - who.x, v.z - who.z);
      if (v.kind === 'village' && d < best) {
        best = d;
        closest = v;
      }
    }
    for (const v of places) {
      const won = clearedForts.has(v.id);
      const icon = v.kind === 'village' ? '🏠' : v.kind === 'cave' ? '🕳️' : v.kind === 'maze' ? (won ? '✔️' : '🏛️') : won ? '🏳️' : '🏰';
      icons.push({ x: v.x, z: v.z, icon, pin: v === closest });
    }
    for (const p of peers.positions()) icons.push({ x: p.x, z: p.z, icon: p.icon, pin: true });
    if (guideTarget) icons.push({ x: guideTarget.x, z: guideTarget.z, icon: '🎯', pin: true });
    const mine = villageShown?.buildings[1];
    if (mine) icons.push({ x: mine.x, z: mine.z, icon: '🏡' });
    miniMap.update(dt, who.x, who.z, camYaw, driving ? carHeading : facing, icons);
  }

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
        terrain,
        setYaw: (yaw: number) => {
          camYaw = yaw;
        },
        setFacing: (f: number) => {
          facing = f;
        },
        lettersDebug: () => letterSprites.map((l) => ({ letter: LETTERS[l.letter], x: l.sprite.position.x, z: l.sprite.position.z })),
        homeLayout: () => home.layout(),
        screenOf: (x: number, y: number, z: number) => {
          const v = new THREE.Vector3(x, y, z).project(camera);
          return [(v.x * 0.5 + 0.5) * window.innerWidth, (-v.y * 0.5 + 0.5) * window.innerHeight];
        },
        setWorld: (seconds: number) => {
          worldTime = seconds;
        },
        airstrip: () => AIRSTRIP,
        blocksMap: () => blocks.map,
        away: () => {
          input.lastActivity = -1e9;
        },
        peersVisible: () => peers.visibleDebug(),
        peersBadges: () => peers.badgesDebug(),
        perf: () => ({ ...renderer.info.render }),
        frameMs: () => frameMs,
        petPos: () => pet?.position ?? player.pos,
        finishGoal: () => {
          if (bonus) bonus.start -= 99;
        },
        peersGear: () => peers.gearDebug(),
        peersDebug: () => peers.positions().map((q) => q.icon).concat(peers.vehiclesDebug()),
        setClock: (seconds: number) => {
          dayClock = seconds;
        },
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
          coins,
          quests: quests.list(),
          pet: petSpecies,
          swordLevel,
          maxHearts,
          inside: inside !== null,
          peers: peers.count,
          forts: clearedForts.size,
          owned: ownedVehicles.size,
          online: net.connected,
          quality,
          visiting,
          homes: homes.size,
          rain: +rain.toFixed(2),
          layout,
          wallColour,
          guide: guideStep,
          bag,
          underground,
          race: race ? race.next : -1,
          fishing: fishing !== null,
          fish: fishCount,
          hat,
          furniture: furniture.size,
          riding: riding !== null,
          night: +night.toFixed(2),
          level: puzzleLevel,
          host: !enemies.remote,
          selfId,
        }),
        quests,
        animals,
        give: (n: number) => {
          coins += n;
          showCoins();
        },
      },
    });
  }

  return {
    frame(dt) {
      if (started) {
        if (driving) {
          updateVehicle(dt, true);
          player.pos.copy(carPos);
        } else if (riding) {
          // A passenger: carried along wherever the friend drives.
          const seat = peers.driverPos(riding);
          if (seat) {
            player.pos.copy(seat);
            avatar.visible = false;
          } else {
            hopOut();
          }
          updateVehicle(dt, false);
        } else {
          updatePlayer(dt);
          updateVehicle(dt, false);
        }
        wasJump = input.jump;
        updateCombat(dt);

        const who = driving ? carPos : player.pos;
        const picked = [...terrain.collect(who, driving ? 3.5 : 2.2), ...terrain.openChests(who, 2.8)];
        if (picked.length > 0) {
          net.send({ t: 'got', ids: picked });
          gotPickups(picked, true);
        }
        // Count play time, and call a break when the day's limit is used up.
        addPlayTime(dt);
        if (parent.limit > 0 && breakEl.hidden && minutesToday() >= parent.limit) {
          breakEl.hidden = false;
          speak('Time for a break! See you later.');
        }
        coder.update(dt);
        // Tell the other players where we are, ten times a second.
        netTimer -= dt;
        if (net.connected && netTimer <= 0) {
          netTimer = 0.1;
          // Show who is here: our own face, then our friends'.
          const here = `✅ ${faceFor(selfId)} ${getPlayerName()} ${peers.faces()}`.replace(/ +/g, ' ');
          if (roomStatus.textContent !== here) roomStatus.textContent = here;
          net.send({
            t: 's',
            x: +who.x.toFixed(2),
            y: +who.y.toFixed(2),
            z: +who.z.toFixed(2),
            f: +(driving ? carHeading : facing).toFixed(2),
            a: hero?.playing ?? 'Idle_A',
            h: CHARACTERS[heroIndex],
            g: targetable ? 1 : 0,
            n: getPlayerName(),
            v: driving ? vehicleName : '',
            p: petSpecies,
            r: riding ? 1 : 0,
            k: hat,
            w: tool === SWORD ? swordLevel : tool === STAFF ? 3 : -1,
            i: inside ? (visiting ?? selfId) : '',
            q: performance.now() - input.lastActivity > AWAY_MS ? 1 : 0,
          });
        }
        nearAnimal = animals.nearest(player.pos, 4.5);
        // The shop shuts when he walks away from the shopkeeper.
        if (!shopEl.hidden && nearVillager?.persona !== 'shop') shopEl.hidden = true;
        const talk = nearVillager?.persona === 'shop' ? '🛒' : '💬';
        const fishIcon = fishing && now >= fishing.biteAt ? '❗' : '🎣';
        const icon = inside
          ? ''
          : riding
            ? '🚶'
            : fishing
              ? fishIcon
              : driving
                ? vehicleKind === 'plane'
                  ? '🛬'
                  : '🚶'
                : holeNear
                  ? holeNear.kind === 'cave'
                    ? '🕳️'
                    : '🪜'
                  : nearVillager
                  ? talk
                  : nearFlag()
                    ? '🏁'
                    : nearAnimal
                      ? '🐾'
                      : nearDoor()
                        ? '🚪'
                        : nearVehicle()
                          ? vehicleKind === 'boat'
                            ? '⛵'
                            : vehicleKind === 'plane'
                              ? '✈️'
                              : '🚗'
                          : peers.driverNear(player.pos, 6)
                            ? '🚙'
                            : canFish()
                              ? '🎣'
                              : '';
        if (icon !== actionShown) {
          actionShown = icon;
          actionEl.hidden = icon === '';
          actionEl.textContent = icon;
          // In the plane the two buttons are climb and descend.
          const flyingPlane = driving && vehicleKind === 'plane';
          jumpEl.textContent = driving && !flyingPlane ? '📣' : '⬆️';
          flyEl.hidden = driving;
          crawlEl.hidden = driving && !flyingPlane;
          if (flyingPlane) crawlEl.textContent = '⬇️';
          else if (!flying) crawlEl.textContent = '🐛';
        }
      } else {
        // Slow turntable of the hero behind the start screen.
        camYaw += dt * 0.35;
        avatar.position.copy(player.pos);
        hero?.update(dt);
        updateVehicle(dt, false);
      }

      const who = driving ? carPos : player.pos;
      terrain.view = viewChunks;
      terrain.update(who.x, who.z, 2);
      animals.update(dt, who);
      pet?.update(dt, inside ?? who);
      peers.room = inside ? (visiting ?? selfId) : '';
      peers.update(dt);
      if (selfBubble.visible && now > emoteUntil) selfBubble.visible = false;
      if (goalStar.visible) goalStar.rotation.y = now * 2;
      updateVillagers(dt, who);
      if (started) {
        updateDoors(dt);
        updateExtras(who);
        // Doorways work again once he has stepped clear of all of them.
        if (!inAnyZone && !travelling) zonesArmed = true;
        updateGuide(dt, who);
      }
      for (const s of terrain.stars) {
        const mesh = s.group.children[0];
        mesh.rotation.y = now * 2;
        mesh.position.y = Math.sin(now * 3 + s.pos.x) * 0.25;
      }
      updateCamera(dt, who);
      updateBolt(dt, who);
      mapEl.hidden = zoomEl.hidden = inside !== null || underground;
      if (started && !inside && !underground) updateMap(dt, who);

      // Sky, sea, clouds and the sun's shadow all travel with the player.
      sky.position.copy(camera.position);
      water.position.x = who.x;
      water.position.z = who.z;
      sun.target.position.copy(who);
      updateDay(dt);
      updateWeather(dt, inside !== null || underground);
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

/** How long the game logic took last frame, not counting drawing. For performance checks. */
let frameMs = 0;
let last = performance.now();
function loop(time: number): void {
  const elapsed = (time - last) / 1000;
  const dt = Math.min(elapsed, 0.05);
  if (started) watchSpeed(elapsed);
  last = time;
  now = time / 1000;
  input.update();
  if (game) {
    const began = performance.now();
    game.frame(dt);
    frameMs = performance.now() - began;
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

// Keep a copy of the game on the device so it loads quickly and opens without internet.
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
}
