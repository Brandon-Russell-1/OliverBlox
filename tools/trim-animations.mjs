// Shrinks the shared animation files in public/assets/anim.
//
// KayKit's animation files each carry a full mannequin model and dozens of clips. The game only
// reads the clips, and only the handful listed below, so everything else is thrown away.
//
// Run from a folder that has the two packages installed (they are not needed to build the game):
//   npm install @gltf-transform/core @gltf-transform/functions
//   node trim-animations.mjs <path to public/assets/anim>
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { prune, resample } from '@gltf-transform/functions';

/** Every clip the game plays, for heroes, villagers, friends and skeletons. */
const KEEP = new Set([
  'Idle_A',
  'Walking_A',
  'Running_A',
  'Jump_Idle',
  'Crawling',
  'Crouching',
  'Cheering',
  'Waving',
  'Melee_1H_Attack_Slice_Horizontal',
  'Melee_1H_Attack_Chop',
  'Throw',
  'Hit_A',
  'Death_A',
]);

const dir = process.argv[2];
const io = new NodeIO();
for (const file of readdirSync(dir).filter((f) => f.endsWith('.glb'))) {
  const path = join(dir, file);
  const before = statSync(path).size;
  const doc = await io.read(path);
  const root = doc.getRoot();
  for (const clip of root.listAnimations()) {
    if (KEEP.has(clip.getName())) continue;
    // Dropping a clip does not drop its keyframes, so take those out first.
    for (const channel of clip.listChannels()) channel.dispose();
    for (const sampler of clip.listSamplers()) sampler.dispose();
    clip.dispose();
  }
  // The mannequin itself is never drawn; only its bones' names matter, and those live on the nodes.
  for (const list of [root.listMeshes(), root.listSkins(), root.listMaterials(), root.listTextures()]) {
    for (const item of list) item.dispose();
  }
  // Any keyframe data nothing points at any more is dead weight.
  for (const accessor of root.listAccessors()) {
    if (accessor.listParents().every((parent) => parent === root)) accessor.dispose();
  }
  await doc.transform(resample(), prune({ keepLeaves: true }));
  await io.write(path, doc);
  const kept = root.listAnimations().map((a) => a.getName());
  console.log(`${file}: ${(before / 1024) | 0} KB -> ${(statSync(path).size / 1024) | 0} KB, clips: ${kept.join(', ')}`);
}
