import { SpotifyAPI } from '@spotify/api';
import { Emitter } from '@utils/emitter';

export type UIPalette = {
  dominant: string;
  secondary: string;
  colors: string[];
};

type DirectorEvents = {
  fps: (fps: number) => void;
  sceneChanged: (scene: string) => void;
  palette: (p: UIPalette) => void;
};

export class VisualDirector extends Emitter<DirectorEvents> {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private running = false;
  private lastT = 0;
  private fpsAccum = 0;
  private fpsCount = 0;
  private palette: UIPalette = {
    dominant: '#22cc88',
    secondary: '#cc2288',
    colors: ['#22cc88', '#cc2288', '#22aacc', '#ffaa22']
  };
  private scene: string = 'Auto';
  // Audio-features disabled by default to avoid 403 spam
  private featuresEnabled = false;
  private lastTrackId: string | null = null;

  constructor(private api: SpotifyAPI) {
    super();
    // Create and mount a canvas so you can see visuals
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(1280, window.innerWidth);
    this.canvas.height = Math.max(720, window.innerHeight);
    const host = document.getElementById('canvas-host') || document.body;
    host.appendChild(this.canvas);

    const c = this.canvas.getContext('2d');
    if (!c) throw new Error('2D context not available');
    this.ctx = c;

    window.addEventListener('resize', () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
    });

    this.start();
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  setPalette(p: UIPalette) {
    this.palette = p;
    this.emit('palette', p);
  }

  requestScene(scene: string) {
    this.scene = scene || 'Auto';
    this.emit('sceneChanged', this.scene);
  }

  crossfadeNow() {
    // Simple visual nudge: invert palette order briefly
    this.palette.colors.reverse();
    setTimeout(() => this.palette.colors.reverse(), 300);
  }

  toggleQualityPanel() {
    // No-op placeholder for UI
  }

  toggleAccessibilityPanel() {
    // No-op placeholder for UI
  }

  setFeaturesEnabled(on: boolean) {
    this.featuresEnabled = !!on;
    if (!on) this.lastTrackId = null;
  }

  async onTrack(track: SpotifyApi.TrackObjectFull | null) {
    if (!track) return;
    if (!this.featuresEnabled) return;
    if (!track.id || (track as any).is_local) return;
    if (this.lastTrackId === track.id) return;
    this.lastTrackId = track.id;
    try {
      await this.api.getAudioFeatures(track.id);
      // Hook: store/use features to modulate visuals
    } catch {
      // ignore restrictions
    }
  }

  private start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = (t - this.lastT) / 1000;
      this.lastT = t;
      this.render(dt, t / 1000);
      // FPS every ~0.5s
      this.fpsAccum += dt;
      this.fpsCount++;
      if (this.fpsAccum >= 0.5) {
        const fps = this.fpsCount / this.fpsAccum;
        this.emit('fps', fps);
        this.fpsAccum = 0;
        this.fpsCount = 0;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private render(dt: number, time: number) {
    const { width: w, height: h } = this.canvas;
    const ctx = this.ctx;

    // Background gradient based on palette
    const grad = ctx.createLinearGradient(0, 0, w, h);
    const cols = this.palette.colors;
    cols.forEach((c, i) => grad.addColorStop(i / Math.max(1, cols.length - 1), c));
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Simple animated blobs
    const count = 12;
    for (let i = 0; i < count; i++) {
      const t = time * (0.2 + (i % 5) * 0.05) + i;
      const x = (Math.sin(t) * 0.5 + 0.5) * w;
      const y = (Math.cos(t * 0.9) * 0.5 + 0.5) * h;
      const r = (Math.sin(t * 1.7) * 0.4 + 0.6) * Math.min(w, h) * 0.06;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = this.mixColor(this.palette.dominant, this.palette.secondary, (Math.sin(t) * 0.5 + 0.5));
      ctx.globalAlpha = 0.55;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    // Scene hint text (tiny)
    ctx.fillStyle = '#ffffff88';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(this.scene, w - 10, h - 10);
  }

  private mixColor(a: string, b: string, t: number) {
    const pa = this.hexToRgb(a);
    const pb = this.hexToRgb(b);
    if (!pa || !pb) return a;
    const c = {
      r: Math.round(pa.r + (pb.r - pa.r) * t),
      g: Math.round(pa.g + (pb.g - pa.g) * t),
      b: Math.round(pa.b + (pb.b - pa.b) * t)
    };
    return `rgb(${c.r}, ${c.g}, ${c.b})`;
  }

  private hexToRgb(hex: string) {
    const m = hex.trim().replace('#', '');
    const s = m.length === 3
      ? m.split('').map((x) => x + x).join('')
      : m;
    const n = parseInt(s, 16);
    if (Number.isNaN(n) || (s.length !== 6)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
}