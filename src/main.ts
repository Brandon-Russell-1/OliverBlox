import * as THREE from 'three';
import './style.css';
import { loadAssets, loadModel, CHARACTERS, PETS, type Assets } from './assets';
import { Terrain, groundAt, nearestVillage, villagesNear, SEA_LEVEL, VILLAGE_RADIUS, type Village } from './terrain';
import { MiniMap, type MapIcon } from './map';
import { Home, ROOM } from './home';
import { Coder } from './coder';
import { Net, Peers } from './net';
import { Blocks, HOTBAR, BLOCK_COLORS } from './blocks';
import { type Body, moveBody, bodyTouchesCell } from './physics';
import { Input } from './input';
import { Animals, Pet, type Animal } from './animals';
import { Quests, QUEST_ICONS, type QuestSave } from './quests';
import { Actor } from './actor';
import { Enemies, type EnemyContext, type Target } from './combat';
import { emojiTexture, faceFor, makeMarker, EMOTES } from './emoji';
import { Chat, PERSONAS, setupParentPanel, getAiSettings } from './chat';
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
let coins = save?.coins ?? 0;
let swordLevel = save?.sword ?? 0;
let extraHearts = save?.extraHearts ?? 0;
let boots = save?.boots ?? false;
let petSpecies = save?.pet ?? -1;
let maxHearts = 5 + extraHearts;
const quests = new Quests(save?.quests);
const clearedForts = new Set<string>(save?.forts ?? []);
const ownedVehicles = new Set<string>(save?.vehicles ?? GARAGE.filter((g) => g.price === 0).map((g) => g.name));
/** While he is indoors, the spot outside the door to come back to. */
let inside: THREE.Vector3 | null = null;
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

const starTotal = (): number => collected.size + bonusStars;
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
      chip.textContent = `${QUEST_ICONS[q.type]} ${q.have}/${q.need}`;
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
  if (started && !driving && !inside) setFlying(!flying);
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

  // ---- house interiors ----
  const home = new Home(scene);
  const mapEl = $('map');
  /** Standing by the door of a village house (the well does not count). */
  const nearDoor = (): boolean =>
    villageShown !== null &&
    villageShown.buildings.some((b) => b.def > 0 && Math.hypot(b.x - player.pos.x, b.z - player.pos.z) < b.scale * 0.5 + 3.4);
  function goInside(): void {
    setFlying(false);
    setCrawling(false);
    inside = player.pos.clone();
    player.pos.set(ROOM.x, ROOM.y, ROOM.z + ROOM.halfZ - 2.2);
    player.vel.set(0, 0, 0);
    facing = Math.PI;
    camYaw = 0;
    camTarget.copy(player.pos);
    home.show(true);
    mapEl.hidden = true;
    attackEl.hidden = true;
    sfx.door();
  }
  function goOutside(): void {
    if (!inside) return;
    player.pos.copy(inside);
    camTarget.copy(player.pos);
    inside = null;
    home.show(false);
    mapEl.hidden = false;
    selectTool(tool);
    sfx.door();
  }

  // ---- playing together: other players in the same room, and shared building ----
  const net = new Net();
  const peers = new Peers(scene, assets.clips);
  const greeted = new Set<string>();
  let netTimer = 0;
  net.onMessage = (from, msg) => {
    if (msg.t === 's') {
      peers.set(from, msg);
      // First sight of someone: show them everything built here so far.
      if (!greeted.has(from)) {
        greeted.add(from);
        net.send({ t: 'B', list: blocks.save() });
      }
    } else if (msg.t === 'bye') {
      peers.remove(from);
      greeted.delete(from);
    } else if (msg.t === 'b') {
      if ([msg.x, msg.y, msg.z, msg.k].every(Number.isInteger)) blocks.set(msg.x, msg.y, msg.z, msg.k);
      dirty = true;
    } else if (msg.t === 'B' && Array.isArray(msg.list)) {
      blocks.load(msg.list.slice(0, 5000).filter((b) => Array.isArray(b) && b.length === 4 && b.every(Number.isInteger)));
      dirty = true;
    } else if (msg.t === 'hello') {
      selfId = String(msg.id);
    } else if (msg.t === 'en') {
      if (enemies.remote) enemies.apply(msg);
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
      const k = tool >= FIRST_BLOCK ? HOTBAR[tool - FIRST_BLOCK] : HOTBAR[0];
      if (!blocks.set(x, y, z, k)) return;
      net.send({ t: 'b', x, y, z, k });
      if (quests.add('blocks', 1)) showQuests();
      sfx.place();
      dirty = true;
    },
    running: (on) => {
      coding = on;
      if (on) sfx.chirp();
      else sfx.win();
    },
  });
  $('code-btn').addEventListener('click', () => {
    if (!inside) coder.toggle();
  });

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
    const models = await Promise.all(VILLAGERS.map((def) => loadModel(`char/${def.model}.glb`)));
    if (token !== villageToken) return;
    VILLAGERS.forEach((def, i) => {
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
  const SHOP = [
    { icon: '🪓', price: 10, owned: () => swordLevel >= 1, buy: () => { swordLevel = 1; void loadSword(1); } },
    { icon: '⚔️', price: 30, owned: () => swordLevel >= 2, buy: () => { swordLevel = 2; void loadSword(2); } },
    { icon: '❤️', price: 15, owned: () => extraHearts >= 3, buy: () => { extraHearts++; maxHearts++; hearts = maxHearts; showHearts(); } },
    { icon: '👟', price: 20, owned: () => boots, buy: () => { boots = true; } },
  ];
  function renderShop(): void {
    shopEl.replaceChildren(
      ...SHOP.map((item) => {
        const b = document.createElement('button');
        const owned = item.owned();
        b.className = owned ? 'owned' : coins < item.price ? 'poor' : '';
        const price = document.createElement('span');
        price.textContent = owned ? '✅' : `🪙 ${item.price}`;
        b.append(item.icon, price);
        b.addEventListener('click', () => {
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
    speak('Welcome to my shop! Coins buy better gear.', { pitch: 1.15, rate: 0.95 });
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
    if (inside) goOutside();
    else if (driving) exitVehicle();
    else if (nearVillager) talkTo(nearVillager.persona);
    else if (nearAnimal) befriend(nearAnimal);
    else if (nearDoor()) goInside();
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
          if (inside) return;
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
    if (Math.hypot(x, z) < 110) return true;
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
      speak('You beat the giant skeleton! The fort is safe now.');
      cheerUntil = now + 3;
      dirty = true;
      return;
    }
    coins++;
    showCoins();
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

    targetable = !flying && !driving && !chat.isOpen && !inside;
    const targets: Target[] = [{ id: selfId, pos: player.pos, targetable }, ...peers.targets()];
    // When friends play together, the player with the lowest id runs the skeletons for everyone;
    // the others show the same skeletons and report their hits.
    enemies.remote = net.connected && peers.ids().some((id) => id < selfId);
    if (!enemies.remote) {
      // Anyone walking up to a fort that has not been won brings out its giant skeleton.
      for (const t of targets) {
        const fort = nearestVillage(t.pos.x, t.pos.z);
        if (
          fort?.kind === 'fort' &&
          t.targetable &&
          !clearedForts.has(fort.id) &&
          !enemies.bossAlive &&
          Math.hypot(fort.x - t.pos.x, fort.z - t.pos.z) < 60
        ) {
          bossFort = fort.id;
          enemies.spawnBoss(fort.x + 10, fort.z + 10);
        }
      }
    }
    enemies.update(dt, targets, enemyContext);
    netEnemyTimer -= dt;
    if (!enemies.remote && net.connected && netEnemyTimer <= 0) {
      netEnemyTimer = 0.12;
      net.send({ t: 'en', ...enemies.snapshot() });
    }
  }

  // ---- building, or swinging if a weapon is in hand ----
  const ray = new THREE.Vector3();
  input.onTap = (px, py, button) => {
    if (!started || driving || inside) return;
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
      if (hit.kind === 'block' && blocks.set(hit.x, hit.y, hit.z, 0)) {
        net.send({ t: 'b', x: hit.x, y: hit.y, z: hit.z, k: 0 });
        sfx.remove();
        dirty = true;
      }
      return;
    }
    if (bodyTouchesCell(player, hit.px, hit.py, hit.pz)) return;
    if (blocks.set(hit.px, hit.py, hit.pz, HOTBAR[tool - FIRST_BLOCK])) {
      net.send({ t: 'b', x: hit.px, y: hit.py, z: hit.pz, k: HOTBAR[tool - FIRST_BLOCK] });
      if (quests.add('blocks', 1)) showQuests();
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
    const dist = !started ? 6.5 : inside ? 7 : driving ? camDist + 4 : camDist;
    const pitch = started ? camPitch : 0.12;
    camOffset.set(Math.sin(camYaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(camYaw) * Math.cos(pitch));
    camera.position.copy(camTarget).addScaledVector(camOffset, dist);
    // Never let the camera sink into a hillside or under the sea.
    const floor = Math.max(groundAt(camera.position.x, camera.position.z), SEA_LEVEL) + 0.6;
    if (camera.position.y < floor) camera.position.y = floor;
    if (inside) home.clamp(camera.position, 0.5, 0.6);
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

  let actionShown = '';

  // ---- map: where the villages, stars and his things are ----
  const miniMap = new MiniMap($<HTMLCanvasElement>('map'));
  function updateMap(dt: number, who: THREE.Vector3): void {
    const icons: MapIcon[] = [];
    for (const s of terrain.stars) icons.push({ x: s.pos.x, z: s.pos.z, icon: '⭐' });
    if (!driving) icons.push({ x: carPos.x, z: carPos.z, icon: vehicleKind === 'boat' ? '⛵' : '🚗' });
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
      const icon = v.kind === 'village' ? '🏠' : clearedForts.has(v.id) ? '🏳️' : '🏰';
      icons.push({ x: v.x, z: v.z, icon, pin: v === closest });
    }
    for (const p of peers.positions()) icons.push({ x: p.x, z: p.z, icon: p.icon, pin: true });
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
        } else {
          updatePlayer(dt);
          updateVehicle(dt, false);
        }
        wasJump = input.jump;
        updateCombat(dt);

        const who = driving ? carPos : player.pos;
        const found = terrain.collect(who, driving ? 3.5 : 2.2);
        if (found > 0) {
          if (quests.add('stars', found)) showQuests();
          showStars(true);
          sfx.star();
          // Counting out loud as the stars add up.
          speak(String(starTotal()));
          cheerUntil = now + 2.2;
          bubbleUntil = now + 3;
          dirty = true;
        }

        const opened = terrain.openChests(who, 2.8);
        if (opened > 0) {
          coins += opened * 8;
          showCoins();
          sfx.win();
          speak('Treasure! Eight coins!');
          cheerUntil = now + 2;
          dirty = true;
        }
        coder.update(dt);
        // Tell the other players where we are, ten times a second.
        netTimer -= dt;
        if (net.connected && netTimer <= 0) {
          netTimer = 0.1;
          // Show who is here: our own face, then our friends'.
          const here = `✅ ${faceFor(selfId)} ${peers.faces()}`;
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
          });
        }
        nearAnimal = animals.nearest(player.pos, 4.5);
        // The shop shuts when he walks away from the shopkeeper.
        if (!shopEl.hidden && nearVillager?.persona !== 'shop') shopEl.hidden = true;
        const talk = nearVillager?.persona === 'shop' ? '🛒' : '💬';
        const icon = inside ? '🚪' : driving ? '🚶' : nearVillager ? talk : nearAnimal ? '🐾' : nearDoor() ? '🚪' : nearVehicle() ? (vehicleKind === 'boat' ? '⛵' : '🚗') : '';
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
      pet?.update(dt, inside ?? who);
      peers.update(dt);
      if (selfBubble.visible && now > emoteUntil) selfBubble.visible = false;
      updateVillagers(dt, who);
      for (const s of terrain.stars) {
        const mesh = s.group.children[0];
        mesh.rotation.y = now * 2;
        mesh.position.y = Math.sin(now * 3 + s.pos.x) * 0.25;
      }
      updateCamera(dt, who);
      updateBolt(dt, who);
      if (started && !inside) updateMap(dt, who);

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
