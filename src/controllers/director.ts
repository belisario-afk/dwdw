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

type AudioFeaturesLite = {
  tempo?: number;           // BPM
  energy?: number;          // 0..1
  danceability?: number;    // 0..1
  valence?: number;         // 0..1
};

/**
 * VisualDirector
 * - Renders simple scenes on a canvas so you always see visuals.
 * - Supports scene switching, crossfade, quality and accessibility toggles.
 * - Optionally reacts to Spotify audio features (robust to 403s).
 */
export class VisualDirector extends Emitter<DirectorEvents> {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  // Rendering pipeline
  private running = false;
  private lastT = 0;
  private fpsAccum = 0;
  private fpsCount = 0;

  // Double-buffer for quality/crossfade
  private renderScale = 1;           // 0.5 low, 0.75 med, 1 high
  private bufferA: HTMLCanvasElement;
  private bufferB: HTMLCanvasElement;
  private bufCtxA: CanvasRenderingContext2D;
  private bufCtxB: CanvasRenderingContext2D;
  private crossfadeT = 0;            // seconds remaining for crossfade
  private crossfadeDur = 0.6;        // seconds
  private nextSceneName: string | null = null;

  // Scene state
  private sceneName: string = 'Auto';
  private palette: UIPalette = {
    dominant: '#22cc88',
    secondary: '#cc2288',
    colors: ['#22cc88', '#cc2288', '#22aacc', '#ffaa22']
  };
  private reduceMotion = false;

  // Audio-features
  private featuresEnabled = true;  // enable by default; we'll backoff if 403s
  private features: AudioFeaturesLite = {};
  private lastTrackId: string | null = null;
  private featuresBackoffUntil = 0;

  constructor(private api: SpotifyAPI) {
    super();

    // Create and mount canvas
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    const host = document.getElementById('canvas-host') || document.body;
    host.appendChild(this.canvas);

    const c2d = this.canvas.getContext('2d');
    if (!c2d) throw new Error('2D context not available');
    this.ctx = c2d;

    // Offscreen buffers
    this.bufferA = document.createElement('canvas');
    this.bufferB = document.createElement('canvas');
    const a = this.bufferA.getContext('2d');
    const b = this.bufferB.getContext('2d');
    if (!a || !b) throw new Error('2D buffer context not available');
    this.bufCtxA = a;
    this.bufCtxB = b;

    // Resize
    const onResize = () => {
      const w = Math.max(640, Math.floor(window.innerWidth));
      const h = Math.max(360, Math.floor(window.innerHeight));
      this.canvas.width = w;
      this.canvas.height = h;
      const bw = Math.max(320, Math.floor(w * this.renderScale));
      const bh = Math.max(180, Math.floor(h * this.renderScale));
      this.bufferA.width = bw;
      this.bufferA.height = bh;
      this.bufferB.width = bw;
      this.bufferB.height = bh;
    };
    window.addEventListener('resize', onResize);
    onResize();

    // Start render loop
    this.start();
  }

  // Public API used by UI/main/VJ

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  setPalette(p: UIPalette) {
    this.palette = p;
    this.emit('palette', p);
  }

  requestScene(scene: string) {
    const name = scene || 'Auto';
    if (name === this.sceneName) return;
    // Trigger crossfade to new scene
    this.nextSceneName = name;
    this.crossfadeT = this.crossfadeDur;
    this.emit('sceneChanged', name);
  }

  crossfadeNow() {
    // Quick crossfade pulse to the same scene (visual nudge)
    this.nextSceneName = this.sceneName;
    this.crossfadeT = Math.max(this.crossfadeT, this.crossfadeDur * 0.6);
  }

  toggleQualityPanel() {
    this.mountPanel('quality', 'Quality', (panel) => {
      panel.innerHTML = `
        <div style="display:flex; gap:8px; align-items:center;">
          <button data-q="low">Low</button>
          <button data-q="med">Medium</button>
          <button data-q="high">High</button>
          <span style="opacity:.8;font-size:12px;">Render scale: ${this.renderScale}</span>
        </div>
      `;
      panel.querySelectorAll('button[data-q]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const q = (btn as HTMLButtonElement).dataset.q!;
          if (q === 'low') this.setRenderScale(0.5);
          if (q === 'med') this.setRenderScale(0.75);
          if (q === 'high') this.setRenderScale(1);
          this.togglePanel('quality', false); // close
        });
      });
    });
    this.togglePanel('quality', undefined); // toggle
  }

  toggleAccessibilityPanel() {
    this.mountPanel('access', 'Accessibility', (panel) => {
      panel.innerHTML = `
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;">
          <input id="reduce-motion" type="checkbox" ${this.reduceMotion ? 'checked' : ''} />
          <span>Reduce motion</span>
        </label>
        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;margin-top:6px;">
          <input id="audio-reactive" type="checkbox" ${this.featuresEnabled ? 'checked' : ''} />
          <span>Audio reactive effects</span>
        </label>
      `;
      panel.querySelector<HTMLInputElement>('#reduce-motion')!
        .addEventListener('change', (e) => {
          this.reduceMotion = (e.target as HTMLInputElement).checked;
          this.togglePanel('access', false);
        });
      panel.querySelector<HTMLInputElement>('#audio-reactive')!
        .addEventListener('change', (e) => {
          this.featuresEnabled = (e.target as HTMLInputElement).checked;
          if (!this.featuresEnabled) this.features = {};
          this.togglePanel('access', false);
        });
    });
    this.togglePanel('access', undefined); // toggle
  }

  setFeaturesEnabled(on: boolean) {
    this.featuresEnabled = !!on;
    if (!on) this.features = {};
  }

  // Called by main when the track changes
  async onTrack(track: SpotifyApi.TrackObjectFull | null) {
    if (!track) return;
    if (!track.id || (track as any).is_local) {
      this.lastTrackId = null;
      this.features = {};
      return;
    }
    if (this.lastTrackId === track.id) return;
    this.lastTrackId = track.id;

    // Auto scene can vary by track characteristics later if desired
    if (this.sceneName === 'Auto' && !this.nextSceneName) {
      const picks = ['Particles', 'Tunnel', 'Terrain'];
      const idx = Math.abs(hashString(track.id)) % picks.length;
      this.requestScene(picks[idx]);
    }

    if (!this.featuresEnabled) return;
    // Backoff if we recently hit 403
    if (Date.now() < this.featuresBackoffUntil) return;

    try {
      const f = await this.api.getAudioFeatures(track.id);
      this.features = {
        tempo: clampNum(f?.tempo, 40, 220),
        energy: clamp01(f?.energy),
        danceability: clamp01(f?.danceability),
        valence: clamp01(f?.valence)
      };
    } catch (e: any) {
      // 403/404: set a backoff to avoid spamming
      this.features = {};
      this.featuresBackoffUntil = Date.now() + 5 * 60 * 1000; // 5 min
    }
  }

  // Internals

  private setRenderScale(s: number) {
    this.renderScale = Math.max(0.4, Math.min(1, s));
    // Force resize to apply scale
    const evt = new Event('resize');
    window.dispatchEvent(evt);
  }

  private start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (t - this.lastT) / 1000); // cap delta
      this.lastT = t;
      this.render(dt, t / 1000);

      // FPS
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
    const W = this.canvas.width;
    const H = this.canvas.height;
    const bw = this.bufferA.width;
    const bh = this.bufferA.height;

    // Determine scenes
    const curName = this.sceneName;
    const nextName = this.nextSceneName;

    // Render current scene into buffer A
    this.drawScene(this.bufCtxA, bw, bh, time, dt, curName);

    // If crossfading and next scene exists, render it and composite
    if (this.crossfadeT > 0 && nextName) {
      this.drawScene(this.bufCtxB, bw, bh, time, dt, nextName);
      const t = 1 - this.crossfadeT / this.crossfadeDur; // 0..1
      // Draw A then B with alpha t
      this.ctx.clearRect(0, 0, W, H);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.drawImage(this.bufferA, 0, 0, W, H);
      this.ctx.globalAlpha = Math.min(1, Math.max(0, t));
      this.ctx.drawImage(this.bufferB, 0, 0, W, H);
      this.ctx.globalAlpha = 1;
      this.crossfadeT -= dt;
      if (this.crossfadeT <= 0) {
        // Finish transition
        this.sceneName = nextName;
        this.nextSceneName = null;
        this.crossfadeT = 0;
      }
    } else {
      // Normal draw
      this.ctx.clearRect(0, 0, W, H);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.drawImage(this.bufferA, 0, 0, W, H);
    }

    // Tiny scene label
    this.ctx.fillStyle = '#ffffff88';
    this.ctx.font = '12px system-ui, sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(this.sceneName, W - 10, H - 10);
  }

  // Scene implementations (simple but responsive)

  private drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number, name: string) {
    switch (name) {
      case 'Particles':
        this.drawParticles(ctx, w, h, time, dt);
        break;
      case 'Tunnel':
        this.drawTunnel(ctx, w, h, time, dt);
        break;
      case 'Terrain':
        this.drawTerrain(ctx, w, h, time, dt);
        break;
      case 'Typography':
        this.drawTypography(ctx, w, h, time, dt);
        break;
      case 'Auto':
      default:
        this.drawAuto(ctx, w, h, time, dt);
        break;
    }
  }

  private drawAuto(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    // Smooth gradient pulse based on tempo/energy
    const energy = this.features.energy ?? 0.5;
    const bpm = this.features.tempo ?? 120;
    const pulse = (Math.sin(time * (bpm / 60) * Math.PI * 2) * 0.5 + 0.5) ** (2 - energy);
    const cols = this.palette.colors;
    const grad = ctx.createLinearGradient(0, 0, w, h);
    cols.forEach((c, i) => grad.addColorStop(i / Math.max(1, cols.length - 1), c));
    ctx.fillStyle = grad;
    ctx.globalAlpha = 0.8 + 0.2 * pulse;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 1;

    // Overlay circles
    const count = this.reduceMotion ? 6 : 16;
    for (let i = 0; i < count; i++) {
      const t = time * (0.2 + (i % 5) * 0.07) + i;
      const x = (Math.sin(t) * 0.5 + 0.5) * w;
      const y = (Math.cos(t * 0.9) * 0.5 + 0.5) * h;
      const r = (Math.sin(t * 1.3) * 0.35 + 0.65) * Math.min(w, h) * 0.04;

      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = this.mixColor(this.palette.dominant, this.palette.secondary, pulse);
      ctx.globalAlpha = 0.45;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawParticles(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    const energy = this.features.energy ?? 0.6;
    const speed = (this.reduceMotion ? 20 : 60) * (0.5 + energy);
    ctx.clearRect(0, 0, w, h);
    // trail
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(0, 0, w, h);

    const count = this.reduceMotion ? 80 : 220;
    for (let i = 0; i < count; i++) {
      const ang = (i / count) * Math.PI * 2 + time * 0.2;
      const radius = (Math.sin(time * 0.5 + i) * 0.5 + 0.5) * (Math.min(w, h) * 0.45);
      const x = w / 2 + Math.cos(ang) * radius;
      const y = h / 2 + Math.sin(ang) * radius;

      ctx.beginPath();
      const r = (Math.sin(time * 2 + i * 13.37) * 0.5 + 0.5) * (this.reduceMotion ? 1.5 : 3.5) + energy * 2;
      ctx.arc(x + Math.sin(time + i) * speed * 0.01, y + Math.cos(time * 0.7 + i) * speed * 0.01, r, 0, Math.PI * 2);
      ctx.fillStyle = this.palette.colors[i % this.palette.colors.length];
      ctx.globalAlpha = 0.7;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawTunnel(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    const bpm = this.features.tempo ?? 120;
    const spin = time * 0.4 + (this.features.danceability ?? 0.5) * 0.5;
    ctx.clearRect(0, 0, w, h);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(spin * 0.2);
    const rings = this.reduceMotion ? 12 : 28;
    for (let i = 0; i < rings; i++) {
      const t = i / rings;
      const r = t * Math.min(w, h) * 0.9;
      const th = 8 + 12 * (Math.sin(time * (bpm / 60) * Math.PI * 2 + t * 6.28) * 0.5 + 0.5);
      ctx.strokeStyle = this.mixColor(this.palette.dominant, this.palette.secondary, t);
      ctx.lineWidth = th;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  private drawTerrain(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    const rows = this.reduceMotion ? 20 : 50;
    ctx.clearRect(0, 0, w, h);
    ctx.lineWidth = 2;
    for (let y = 0; y < rows; y++) {
      const t = y / rows;
      const yy = h * (0.2 + t * 0.7);
      ctx.strokeStyle = this.mixColor(this.palette.colors[0], this.palette.colors.at(-1) || this.palette.secondary, t);
      ctx.globalAlpha = 1 - t * 0.9;
      ctx.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const n = Math.sin((x * 0.01) + time * (0.6 + t)) + Math.cos((x * 0.015) - time * (0.4 + t));
        const e = (this.features.energy ?? 0.5) * 40;
        const yy2 = yy + n * (6 + e * (1 - t));
        if (x === 0) ctx.moveTo(x, yy2);
        else ctx.lineTo(x, yy2);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  private drawTypography(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    ctx.fillStyle = this.palette.colors[1] || this.palette.secondary;
    ctx.fillRect(0, 0, w, h);
    const bpm = this.features.tempo ?? 100;
    const scale = 1 + 0.15 * (Math.sin(time * (bpm / 60) * Math.PI * 2) * 0.5 + 0.5);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = this.palette.colors[0] || this.palette.dominant;
    ctx.font = `${Math.floor(Math.min(w, h) * 0.16)}px system-ui, sans-serif`;
    ctx.fillText('DWDW', 0, 0);
    ctx.restore();
  }

  // Utils

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
    const s = m.length === 3 ? m.split('').map((x) => x + x).join('') : m;
    const n = parseInt(s, 16);
    if (Number.isNaN(n) || (s.length !== 6)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  private panelsRoot(): HTMLDivElement {
    const root = document.getElementById('panels') as HTMLDivElement | null;
    if (!root) {
      const div = document.createElement('div');
      div.id = 'panels';
      document.body.appendChild(div);
      return div;
    }
    return root;
  }

  private mountPanel(id: string, title: string, render: (body: HTMLDivElement) => void) {
    const root = this.panelsRoot();
    let panel = root.querySelector<HTMLDivElement>(`.panel[data-id="${id}"]`);
    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'panel';
      panel.dataset.id = id;
      panel.style.position = 'absolute';
      panel.style.right = '12px';
      panel.style.top = id === 'quality' ? '56px' : '128px';
      panel.style.minWidth = '220px';
      panel.style.zIndex = '1000';
      panel.innerHTML = `
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:6px;">
          <strong>${title}</strong>
          <button class="close" aria-label="Close">✕</button>
        </div>
        <div class="body"></div>
      `;
      root.appendChild(panel);
      panel.querySelector<HTMLButtonElement>('button.close')!.onclick = () => this.togglePanel(id, false);
    }
    render(panel.querySelector<HTMLDivElement>('.body')!);
  }

  private togglePanel(id: string, force?: boolean) {
    const root = this.panelsRoot();
    const panel = root.querySelector<HTMLDivElement>(`.panel[data-id="${id}"]`);
    if (!panel) return;
    const show = force ?? panel.classList.contains('hidden');
    panel.classList.toggle('hidden', !show);
  }
}

// Helpers
function clamp01(v: any): number | undefined {
  if (typeof v !== 'number') return undefined;
  if (Number.isNaN(v)) return undefined;
  return Math.max(0, Math.min(1, v));
}
function clampNum(v: any, min: number, max: number): number | undefined {
  if (typeof v !== 'number') return undefined;
  if (Number.isNaN(v)) return undefined;
  return Math.max(min, Math.min(max, v));
}
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return h;
}