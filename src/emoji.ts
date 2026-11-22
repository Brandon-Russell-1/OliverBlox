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
