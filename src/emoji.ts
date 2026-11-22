import * as THREE from 'three';

const textures = new Map<string, THREE.Texture>();

/** An emoji drawn onto a texture, for markers that float in the 3D world. */
export function emojiTexture(emoji: string): THREE.Texture {
  let texture = textures.get(emoji);
  if (!texture) {
    const c = document.createElement('canvas');
    c.width = c.height = 96;
    const g = c.getContext('2d');
    if (g) {
      g.font = '72px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(emoji, 48, 54);
    }
    texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.set(emoji, texture);
  }
  return texture;
}

const FACES = ['🦊', '🐼', '🐸', '🦁', '🐵', '🐰', '🐯', '🐨', '🐶', '🐱', '🦄', '🐲'];

/** Every player gets an animal face from their id: it marks them on the map and over their head. */
export function faceFor(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return FACES[h % FACES.length];
}

/** The only things players can say to each other: pictures, picked from this list. */
export const EMOTES = ['👋', '😀', '😂', '❤️', '👍', '😮', '🆘', '📍'];

const labels = new Map<string, THREE.Texture>();

/** A name drawn onto a texture, to float under a friend's face. */
export function textTexture(text: string): THREE.Texture {
  let texture = labels.get(text);
  if (!texture) {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    if (g) {
      g.font = '800 40px "Trebuchet MS", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.lineWidth = 8;
      g.strokeStyle = '#1c2a6b';
      g.strokeText(text, 128, 34);
      g.fillStyle = '#fff';
      g.fillText(text, 128, 34);
    }
    texture = new THREE.CanvasTexture(c);
    texture.colorSpace = THREE.SRGBColorSpace;
    labels.set(text, texture);
  }
  return texture;
}

/** A friend's name, shown just under their face marker. Hidden until a name is set. */
export function makeLabel(): THREE.Sprite {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, sizeAttenuation: false }));
  sprite.scale.set(0.16, 0.04, 1);
  // Same anchor as the face, pushed down a fixed amount on screen so the two never overlap.
  sprite.position.y = 3.4;
  sprite.center.set(0.5, 1.8);
  sprite.renderOrder = 10;
  sprite.visible = false;
  return sprite;
}

export function setLabel(sprite: THREE.Sprite, name: string): void {
  sprite.visible = name !== '';
  if (name) sprite.material.map = textTexture(name);
}

/** A marker that stays the same size on screen however far away it is, so friends are easy to spot. */
export function makeMarker(emoji: string): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: emojiTexture(emoji), depthTest: false, sizeAttenuation: false }),
  );
  sprite.scale.setScalar(0.06);
  sprite.position.y = 3.4;
  sprite.renderOrder = 10;
  return sprite;
}
