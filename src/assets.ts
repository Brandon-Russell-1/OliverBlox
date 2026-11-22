import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

const BASE = `${import.meta.env.BASE_URL}assets/`;

/** A scenery model flattened to raw triangles so many copies can be baked into one mesh. */
export interface PropDef {
  pos: Float32Array;
  norm: Float32Array;
  uv: Float32Array;
  count: number;
  /** Half the widest horizontal extent. */
  radius: number;
  height: number;
}

export interface PropLibrary {
  trees: PropDef[];
  rocks: PropDef[];
  bushes: PropDef[];
  grass: PropDef[];
  material: THREE.Material;
  /** Village buildings, in the order of BUILDINGS. */
  buildings: PropDef[];
  buildingMaterial: THREE.Material;
}

export interface AnimatedModel {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

export interface Assets {
  props: PropLibrary;
  /** Shared humanoid animations, by clip name. They fit every KayKit character and skeleton. */
  clips: Map<string, THREE.AnimationClip>;
  pets: AnimatedModel[];
  enemies: THREE.Object3D[];
  sword: THREE.Object3D;
  staff: THREE.Object3D;
}

export const CHARACTERS = ['Rogue', 'Knight', 'Mage', 'Barbarian', 'Ranger', 'Druid', 'Engineer'];
/** The well comes first: it marks the middle of every village. */
export const BUILDINGS = ['well', 'home_A', 'home_B', 'tavern', 'market', 'blacksmith', 'windmill', 'church', 'townhall', 'tower_A', 'stables'];

const TREES = ['Tree_1_A', 'Tree_1_B', 'Tree_2_A', 'Tree_2_B', 'Tree_3_A', 'Tree_4_A', 'Tree_4_B', 'Tree_5_A', 'Tree_6_A', 'Tree_7_A'];
const ROCKS = ['Rock_1_A', 'Rock_1_H', 'Rock_2_A', 'Rock_2_E', 'Rock_3_A', 'Rock_3_H', 'Rock_4_A', 'Rock_5_A', 'Rock_6_A'];
const BUSHES = ['Bush_1_A', 'Bush_2_A', 'Bush_3_A', 'Bush_4_A'];
const GRASS = ['Grass_1_A', 'Grass_1_B', 'Grass_2_A', 'Grass_2_B'];
const ANIMS = ['MovementBasic', 'MovementAdvanced', 'General', 'Simulation', 'CombatMelee'];
const PETS = ['dog', 'cat', 'bunny', 'cow', 'deer', 'fox', 'pig', 'chick'];
const ENEMIES = ['Skeleton_Minion', 'Skeleton_Warrior'];

/** Swap the loader's physically based materials for cheap ones that suit the art and tablets. */
function simplify(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const old = mesh.material as THREE.MeshStandardMaterial;
    mesh.material = new THREE.MeshLambertMaterial({ map: old.map, color: old.color, emissive: old.emissive });
    mesh.castShadow = true;
    mesh.frustumCulled = false;
  });
}

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

/** Load a model once; later calls share the same download. Used for anything picked at play time. */
export function loadModel(path: string): Promise<GLTF> {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(BASE + path).then((gltf) => {
      simplify(gltf.scene);
      return gltf;
    });
    cache.set(path, p);
  }
  return p;
}

function firstMap(gltf: GLTF): THREE.Texture | null {
  let map: THREE.Texture | null = null;
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) map = (mesh.material as THREE.MeshLambertMaterial).map;
  });
  return map;
}

function toPropDef(gltf: GLTF): PropDef {
  gltf.scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  gltf.scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    let g = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    parts.push(g);
  });
  const count = parts.reduce((n, g) => n + g.attributes.position.count, 0);
  const pos = new Float32Array(count * 3);
  const norm = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let at = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, at * 3);
    norm.set(g.attributes.normal.array, at * 3);
    uv.set(g.attributes.uv.array, at * 2);
    at += g.attributes.position.count;
  }
  let radius = 0;
  let height = 0;
  for (let i = 0; i < count; i++) {
    radius = Math.max(radius, Math.abs(pos[i * 3]), Math.abs(pos[i * 3 + 2]));
    height = Math.max(height, pos[i * 3 + 1]);
  }
  return { pos, norm, uv, count, radius, height };
}

export async function loadAssets(onProgress: (fraction: number) => void): Promise<Assets> {
  const groups = [TREES, ROCKS, BUSHES, GRASS, ANIMS, PETS, ENEMIES, BUILDINGS];
  const total = groups.reduce((n, g) => n + g.length, 0) + 2;
  let done = 0;
  const load = async (path: string): Promise<GLTF> => {
    const gltf = await loadModel(path);
    onProgress(++done / total);
    return gltf;
  };
  const all = (names: string[], path: (n: string) => string): Promise<GLTF[]> =>
    Promise.all(names.map((n) => load(path(n))));
  const nature = (names: string[]): Promise<GLTF[]> => all(names, (n) => `nature/${n}_Color1.gltf`);

  const [trees, rocks, bushes, grass, anims, pets, enemies, buildings, sword, staff] = await Promise.all([
    nature(TREES),
    nature(ROCKS),
    nature(BUSHES),
    nature(GRASS),
    all(ANIMS, (n) => `anim/${n}.glb`),
    all(PETS, (n) => `pets/animal-${n}.glb`),
    all(ENEMIES, (n) => `enemy/${n}.glb`),
    all(BUILDINGS, (n) => `village/building_${n}_blue.gltf`),
    load('weapon/sword_1handed.gltf'),
    load('weapon/staff.gltf'),
  ]);

  const clips = new Map<string, THREE.AnimationClip>();
  for (const a of anims) for (const clip of a.animations) clips.set(clip.name, clip);

  return {
    props: {
      trees: trees.map(toPropDef),
      rocks: rocks.map(toPropDef),
      bushes: bushes.map(toPropDef),
      grass: grass.map(toPropDef),
      // Each pack shares one texture, so one material covers all of its models.
      material: new THREE.MeshLambertMaterial({ map: firstMap(trees[0]) }),
      buildings: buildings.map(toPropDef),
      buildingMaterial: new THREE.MeshLambertMaterial({ map: firstMap(buildings[0]) }),
    },
    clips,
    pets: pets.map((p) => ({ scene: p.scene, clips: p.animations })),
    enemies: enemies.map((e) => e.scene),
    sword: sword.scene,
    staff: staff.scene,
  };
}
