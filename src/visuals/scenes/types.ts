import * as THREE from 'three';
import { SceneManager } from '@visuals/engine';

export type VisualSceneName = 'Particles' | 'Fluid' | 'Tunnel' | 'Terrain' | 'Typography';

export interface VisualScene {
  name: VisualSceneName;
  init(manager: SceneManager): void;
  update(dt: number, manager: SceneManager): void;
  render(renderer: THREE.WebGLRenderer, camera: THREE.Camera, weight: number, manager: SceneManager): void;
  resize?(w: number, h: number, manager: SceneManager): void;
  dispose(): void;
  onPhrase?(barIdx: number, tempo: number, manager: SceneManager): void;
  setPalette?(p: { dominant: string; secondary: string; colors: string[] }, manager: SceneManager): void;
}