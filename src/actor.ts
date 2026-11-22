import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/** A rigged character (hero, villager or skeleton) with a small animation state machine. */
export class Actor {
  readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private current = '';

  constructor(model: THREE.Object3D, clips: Map<string, THREE.AnimationClip>, names: string[]) {
    this.root = cloneSkinned(model);
    this.mixer = new THREE.AnimationMixer(this.root);
    for (const name of names) {
      const clip = clips.get(name);
      if (clip) this.actions.set(name, this.mixer.clipAction(clip));
    }
  }

  get playing(): string {
    return this.current;
  }

  /** Loop an animation, cross-fading from whatever was playing. */
  play(name: string, speed = 1): void {
    const next = this.actions.get(name);
    if (!next) return;
    next.timeScale = speed;
    if (name === this.current) return;
    this.actions.get(this.current)?.fadeOut(0.18);
    next.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.18).play();
    this.current = name;
  }

  /** Play an animation once from the start and hold its last frame. Returns its length in seconds. */
  once(name: string, speed = 1): number {
    const next = this.actions.get(name);
    if (!next) return 0;
    if (name !== this.current) this.actions.get(this.current)?.fadeOut(0.1);
    next.timeScale = speed;
    next.reset().setLoop(THREE.LoopOnce, 1).fadeIn(0.1).play();
    next.clampWhenFinished = true;
    this.current = name;
    return next.getClip().duration / speed;
  }

  /** Put something (a sword, a staff) in the character's right hand. */
  hold(item: THREE.Object3D | null): void {
    const hand = this.root.getObjectByName('handslotr');
    if (!hand) return;
    hand.clear();
    if (item) hand.add(item);
  }

  update(dt: number): void {
    this.mixer.update(dt);
  }
}
