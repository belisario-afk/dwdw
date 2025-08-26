import * as THREE from 'three';
import { loadScene } from '@visuals/scenes/loader';
import { VisualScene, VisualSceneName } from '@visuals/scenes/types';
import { Emitter } from '@utils/emitter';

type Quality = { scale?: number; msaa?: number };
type Post = { bloom?: number; ssao?: boolean; motionBlur?: boolean };
type Accessibility = { epilepsySafe?: boolean; intensityLimit?: number; reducedMotion?: boolean; highContrast?: boolean };

export class SceneManager extends Emitter<{ 'fps': (fps: number) => void }> {
  private canvas: HTMLCanvasElement;
  private renderer: THREE.WebGLRenderer;
  private camera: THREE.PerspectiveCamera;
  private sceneA?: VisualScene;
  private sceneB?: VisualScene;
  private active: 'A' | 'B' = 'A';
  private mix = 0;
  private clock = new THREE.Clock();
  private fpsSmoothed = 60;

  private quality: Quality = { scale: 1, msaa: 0 };
  private post: Post = { bloom: 0.8 };
  private accessibility: Accessibility = { epilepsySafe: true, intensityLimit: 0.8, reducedMotion: false, highContrast: false };

  // Safer defaults; still adjustable at runtime with setMacro(...)
  private macros: Record<string, number> = {
    intensity: 0.7,
    bloom: 0.8,
    glitch: 0,
    speed: 1,
    raymarchSteps: 512,
    particleMillions: 0.5,
    fluidIters: 35
  };

  private palette = { dominant: '#22cc88', secondary: '#cc2288', colors: ['#22cc88', '#cc2288', '#2266cc', '#ffaa00'] };

  constructor(host: HTMLElement, fpsCb?: (fps: number) => void) {
    super();
    this.canvas = document.createElement('canvas');
    host.appendChild(this.canvas);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.autoClear = false;

    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 1000);

    window.addEventListener('resize', () => this.resize());
    this.resize();

    const loop = () => {
      requestAnimationFrame(loop);
      const dt = this.clock.getDelta();
      const spd = this.macros.speed || 1;

      if (this.sceneA) this.sceneA.update(dt * spd, this);
      if (this.sceneB) this.sceneB.update(dt * spd, this);

      // Clear once per frame; scenes handle their own transparency and crossfade opacity
      this.renderer.setClearColor(0x000000, 1);
      this.renderer.clear(true, true, true);

      if (this.sceneA && this.sceneB && this.mix > 0) {
        this.sceneA.render(this.renderer, this.camera, 1 - this.mix, this);
        this.sceneB.render(this.renderer, this.camera, this.mix, this);
      } else if (this.sceneA) {
        this.sceneA.render(this.renderer, this.camera, 1, this);
      }

      const fpsNow = 1 / Math.max(0.0001, dt);
      this.fpsSmoothed = this.fpsSmoothed * 0.9 + fpsNow * 0.1;
      this.emit('fps', this.fpsSmoothed);
      fpsCb?.(this.fpsSmoothed);
    };
    loop();
  }

  getCanvas() { return this.canvas; }

  getNextSceneName(): VisualSceneName {
    const all: VisualSceneName[] = ['Particles', 'Fluid', 'Tunnel', 'Terrain', 'Typography'];
    const current = this.active === 'A' ? this.sceneA?.name : this.sceneB?.name;
    let idx = Math.max(0, all.indexOf((current as any) || 'Particles'));
    return all[(idx + 1) % all.length];
  }

  async loadScene(name: VisualSceneName) {
    const scene = await loadScene(name);
    scene.init(this);
    if (!this.sceneA) this.sceneA = scene;
    else this.sceneB = scene;
  }

  async crossfadeTo(name: VisualSceneName, seconds = 2) {
    await this.loadScene(name);
    this.mix = 0;
    const start = performance.now();
    const dur = Math.max(0.001, seconds) * 1000;
    const tick = () => {
      const t = (performance.now() - start) / dur;
      this.mix = Math.min(1, t);
      if (this.mix < 1) requestAnimationFrame(tick);
      else {
        if (this.sceneB) {
          this.sceneA?.dispose();
          this.sceneA = this.sceneB;
          this.sceneB = undefined;
          this.active = 'A';
          this.mix = 0;
        }
      }
    };
    tick();
  }

  onPhrase(barIdx: number, tempo: number) {
    this.sceneA?.onPhrase?.(barIdx, tempo, this);
  }

  setPalette(p: { dominant: string; secondary: string; colors: string[] }) {
    this.palette = p;
    this.sceneA?.setPalette?.(p, this);
    this.sceneB?.setPalette?.(p, this);
  }

  setQuality(q: Partial<Quality>) {
    Object.assign(this.quality, q);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio * (this.quality.scale || 1), 3));
  }

  setPost(p: Partial<Post>) {
    Object.assign(this.post, p);
    if (typeof p.bloom === 'number') this.macros.bloom = p.bloom;
  }

  setAccessibility(a: Partial<Accessibility>) {
    Object.assign(this.accessibility, a);
  }

  setMacro(key: string, value: number) {
    this.macros[key] = value;
  }

  getMacro(key: string, def = 0) { return this.macros[key] ?? def; }
  getPalette() { return this.palette; }
  getAccessibility() { return this.accessibility; }

  private resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.sceneA?.resize?.(w, h, this);
    this.sceneB?.resize?.(w, h, this);
  }
}