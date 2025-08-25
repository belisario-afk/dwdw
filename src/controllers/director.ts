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
  tempo?: number;        // BPM
  energy?: number;       // 0..1
  danceability?: number; // 0..1
  valence?: number;      // 0..1
  key?: number;          // 0..11 (C..B)
  mode?: number;         // 1=major, 0=minor
};

type Confetti = { x: number; y: number; vx: number; vy: number; life: number; max: number; hue: number; size: number; };

// Flow field particle
type FlowP = {
  x: number; y: number;
  px: number; py: number;   // previous pos for streaks
  vx: number; vy: number;
  life: number; ttl: number;
  hue: number; size: number; alpha: number;
};

export class VisualDirector extends Emitter<DirectorEvents> {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;

  private running = false;
  private lastT = 0;
  private fpsAccum = 0;
  private fpsCount = 0;

  private renderScale = 1;
  private bufferA: HTMLCanvasElement;
  private bufferB: HTMLCanvasElement;
  private bufCtxA: CanvasRenderingContext2D;
  private bufCtxB: CanvasRenderingContext2D;
  private crossfadeT = 0;
  private crossfadeDur = 0.6;
  private nextSceneName: string | null = null;

  private sceneName: string = 'Auto';

  // Palettes: base from album art, working is what we actually render
  private basePalette: UIPalette = {
    dominant: '#22cc88',
    secondary: '#cc2288',
    colors: ['#22cc88', '#cc2288', '#22aacc', '#ffaa22']
  };
  private palette: UIPalette = { ...this.basePalette };
  private reduceMotion = false;

  // Feature toggles
  private featuresEnabled = true;
  private keyColorEnabled = true;
  private autoSceneOnDownbeat = true;
  private beatConfettiEnabled = true;

  // Audio-reactivity
  private features: AudioFeaturesLite = {};
  private lastTrackId: string | null = null;
  private featuresBackoffUntil = 0;

  // Beat scheduler
  private beatInterval = 60 / 120; // seconds
  private nextBeatTime = 0;        // seconds since start
  private lastBeatTime = -1;
  private beatActive = false;
  private beatCount = 0;           // counts beats to detect downbeats (every 4 beats)

  // Downbeats (every 4 beats by default if analysis not used)
  private downbeatEvery = 4;

  // Key-to-hue palette morph
  private keyHueTarget: number | null = null;
  private keyHueCurrent: number = 0;

  // Confetti
  private confetti: Confetti[] = [];

  // Lyric Lines scene
  private lyricText = 'DWDW';
  private textField: HTMLCanvasElement | null = null;
  private textPoints: Array<{ x: number; y: number }> = [];
  private lyricAgents: Array<{ x: number; y: number; vx: number; vy: number; target: number }> = [];
  private lastTextW = 0;
  private lastTextH = 0;

  // Beat Ball scene
  private ball = { x: 0, y: 0, vx: 0, vy: 0, speed: 280, radius: 28, hue: 140 };

  // Album art flow field
  private albumArtUrl: string | null = null;
  private flowW = 0;
  private flowH = 0;
  private flowVec: Float32Array | null = null; // [vx, vy] per texel (tangent)
  private flowMag: Float32Array | null = null; // magnitude 0..1
  private flowParticles: FlowP[] = [];
  private flowParticlesTarget = 0;

  constructor(private api: SpotifyAPI) {
    super();

    // Canvas setup
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    const host = document.getElementById('canvas-host') || document.body;
    host.appendChild(this.canvas);

    const c2d = this.canvas.getContext('2d');
    if (!c2d) throw new Error('2D context not available');
    this.ctx = c2d;

    this.bufferA = document.createElement('canvas');
    this.bufferB = document.createElement('canvas');
    const a = this.bufferA.getContext('2d');
    const b = this.bufferB.getContext('2d');
    if (!a || !b) throw new Error('2D buffer context not available');
    this.bufCtxA = a;
    this.bufCtxB = b;

    const onResize = () => {
      const w = Math.max(640, Math.floor(window.innerWidth));
      const h = Math.max(360, Math.floor(window.innerHeight));
      this.canvas.width = w; this.canvas.height = h;
      const bw = Math.max(320, Math.floor(w * this.renderScale));
      const bh = Math.max(180, Math.floor(h * this.renderScale));
      this.bufferA.width = bw; this.bufferA.height = bh;
      this.bufferB.width = bw; this.bufferB.height = bh;

      // Rebuild text field for lyric scene
      this.prepareTextField(this.lyricText, bw, bh);
      // Reset ball to center
      this.ball.x = w / 2; this.ball.y = h / 2;
      if (this.ball.vx === 0 && this.ball.vy === 0) this.randomizeBallDirection();

      // Flow particles target count
      this.flowParticlesTarget = this.reduceMotion ? 450 : 1200;
      // Re-initialize particles to fit new size smoothly
      if (this.sceneName === 'Flow Field' || this.nextSceneName === 'Flow Field') {
        this.ensureFlowParticles();
      }
    };
    window.addEventListener('resize', onResize);
    onResize();

    // Initialize beat schedule
    this.recomputeBeatSchedule();

    this.start();
  }

  // Public API

  getCanvas(): HTMLCanvasElement { return this.canvas; }

  setPalette(p: UIPalette) {
    // store as base palette and reset working palette immediately
    this.basePalette = { ...p, colors: [...p.colors] };
    this.palette = { ...p, colors: [...p.colors] };
    this.emit('palette', p);
  }

  // New: set album art for Flow Field scene
  async setAlbumArt(url: string | null) {
    if (!url || url === this.albumArtUrl) return;
    this.albumArtUrl = url;
    try {
      const img = await loadImage(url);
      await this.buildFlowField(img);
      // Reset particles to take advantage of new field
      this.flowParticles = [];
      if (this.sceneName === 'Flow Field' || this.nextSceneName === 'Flow Field') {
        this.ensureFlowParticles();
      }
    } catch (e) {
      // If art fails (CORS/404), clear field so scene will fallback gracefully
      this.flowVec = null;
      this.flowMag = null;
      this.flowW = 0;
      this.flowH = 0;
    }
  }

  requestScene(scene: string) {
    const name = scene || 'Auto';
    if (name === this.sceneName) return;
    this.nextSceneName = name;
    this.crossfadeT = this.crossfadeDur;
    this.emit('sceneChanged', name);
  }

  crossfadeNow() {
    this.nextSceneName = this.sceneName;
    this.crossfadeT = Math.max(this.crossfadeT, this.crossfadeDur * 0.6);
  }

  toggleQualityPanel() {
    this.mountPanel('quality', 'Quality', (panel) => {
      panel.innerHTML = `
        <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
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
          this.togglePanel('quality', false);
        });
      });
    });
    this.togglePanel('quality', undefined);
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

        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;margin-top:6px;">
          <input id="key-color" type="checkbox" ${this.keyColorEnabled ? 'checked' : ''} />
          <span>Key color sync</span>
        </label>

        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;margin-top:6px;">
          <input id="auto-scene" type="checkbox" ${this.autoSceneOnDownbeat ? 'checked' : ''} />
          <span>Downbeat scene switching (Auto scene)</span>
        </label>

        <label style="display:flex;gap:8px;align-items:center;cursor:pointer;margin-top:6px;">
          <input id="beat-confetti" type="checkbox" ${this.beatConfettiEnabled ? 'checked' : ''} />
          <span>Beat confetti</span>
        </label>
      `;
      panel.querySelector<HTMLInputElement>('#reduce-motion')!
        .addEventListener('change', (e) => {
          this.reduceMotion = (e.target as HTMLInputElement).checked;
          // Update flow particles target on motion toggle
          this.flowParticlesTarget = this.reduceMotion ? 450 : 1200;
          this.ensureFlowParticles();
          this.togglePanel('access', false);
        });
      panel.querySelector<HTMLInputElement>('#audio-reactive')!
        .addEventListener('change', (e) => {
          this.setFeaturesEnabled((e.target as HTMLInputElement).checked);
          this.togglePanel('access', false);
        });
      panel.querySelector<HTMLInputElement>('#key-color')!
        .addEventListener('change', (e) => {
          this.keyColorEnabled = (e.target as HTMLInputElement).checked;
          if (!this.keyColorEnabled) {
            // snap back to base palette
            this.palette = { ...this.basePalette, colors: [...this.basePalette.colors] };
          }
          this.togglePanel('access', false);
        });
      panel.querySelector<HTMLInputElement>('#auto-scene')!
        .addEventListener('change', (e) => {
          this.autoSceneOnDownbeat = (e.target as HTMLInputElement).checked;
          this.togglePanel('access', false);
        });
      panel.querySelector<HTMLInputElement>('#beat-confetti')!
        .addEventListener('change', (e) => {
          this.beatConfettiEnabled = (e.target as HTMLInputElement).checked;
          this.togglePanel('access', false);
        });
    });
    this.togglePanel('access', undefined);
  }

  setFeaturesEnabled(on: boolean) {
    this.featuresEnabled = !!on;
    if (!on) this.features = {};
    this.recomputeBeatSchedule();
  }

  setLyricText(text: string) {
    this.lyricText = text || '';
    this.prepareTextField(this.lyricText, this.bufferA.width, this.bufferA.height);
  }

  // Track hook
  async onTrack(track: SpotifyApi.TrackObjectFull | null) {
    if (!track) return;

    // Update lyric text to "Track — Artist"
    const artist = (track.artists && track.artists.length) ? track.artists.map(a => a.name).join(', ') : '';
    this.setLyricText(`${track.name}${artist ? ' — ' + artist : ''}`);

    // Reset beat phase on new track
    this.beatCount = 0;

    // Flow field: set new album art if available
    const art = track.album?.images?.[0]?.url || null;
    if (art) {
      this.setAlbumArt(art).catch(() => {});
    }

    if (!track.id || (track as any).is_local) {
      this.lastTrackId = null;
      this.features = {};
      this.keyHueTarget = null;
      this.recomputeBeatSchedule();
      return;
    }
    if (this.lastTrackId === track.id) return;
    this.lastTrackId = track.id;

    if (!this.featuresEnabled || Date.now() < this.featuresBackoffUntil) {
      this.recomputeBeatSchedule();
      return;
    }

    try {
      const f = await this.api.getAudioFeatures(track.id);
      this.features = {
        tempo: typeof f?.tempo === 'number' ? f.tempo : undefined,
        energy: typeof f?.energy === 'number' ? f.energy : undefined,
        danceability: typeof f?.danceability === 'number' ? f.danceability : undefined,
        valence: typeof f?.valence === 'number' ? f.valence : undefined,
        key: typeof f?.key === 'number' && f.key >= 0 ? f.key : undefined,
        mode: typeof f?.mode === 'number' ? f.mode : undefined
      };
      this.recomputeBeatSchedule();

      // Setup key hue target for palette morph
      if (typeof this.features.key === 'number') {
        const baseHue = (this.features.key % 12) * 30; // map 12 keys to 360°
        const modeAdj = (this.features.mode ?? 1) === 1 ? 0 : -15; // minor shifts slightly cooler
        this.keyHueTarget = ((baseHue + modeAdj) + 360) % 360;
        this.keyHueCurrent = this.keyHueTarget;
      } else {
        this.keyHueTarget = null;
      }

      // Optional analysis: not required here
    } catch {
      // Back off features if forbidden
      this.features = {};
      this.featuresBackoffUntil = Date.now() + 5 * 60 * 1000;
      this.recomputeBeatSchedule();
    }
  }

  // Internals

  private recomputeBeatSchedule() {
    const bpm = this.featuresEnabled && this.features.tempo ? this.features.tempo : 120;
    this.beatInterval = 60 / Math.max(1, bpm);
    const now = this.lastT ? this.lastT / 1000 : 0;
    this.nextBeatTime = now + this.beatInterval;
  }

  private setRenderScale(s: number) {
    this.renderScale = Math.max(0.4, Math.min(1, s));
    const evt = new Event('resize');
    window.dispatchEvent(evt);
  }

  private start() {
    if (this.running) return;
    this.running = true;
    this.lastT = performance.now();
    // Initialize ball direction
    this.ball.x = this.canvas.width / 2;
    this.ball.y = this.canvas.height / 2;
    this.randomizeBallDirection();

    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.1, (t - this.lastT) / 1000);
      this.lastT = t;
      this.render(dt, t / 1000);

      // FPS
      this.fpsAccum += dt; this.fpsCount++;
      if (this.fpsAccum >= 0.5) {
        const fps = this.fpsCount / this.fpsAccum;
        this.emit('fps', fps);
        this.fpsAccum = 0; this.fpsCount = 0;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private render(dt: number, time: number) {
    // Beats
    this.updateBeat(time);

    // Key hue palette morph
    this.updateKeyPalette(dt);

    const W = this.canvas.width;
    const H = this.canvas.height;
    const bw = this.bufferA.width;
    const bh = this.bufferA.height;

    const curName = this.sceneName;
    const nextName = this.nextSceneName;

    // Draw current scene into buffer A
    this.drawScene(this.bufCtxA, bw, bh, time, dt, curName);

    // Crossfade if needed
    if (this.crossfadeT > 0 && nextName) {
      this.drawScene(this.bufCtxB, bw, bh, time, dt, nextName);
      const t = 1 - this.crossfadeT / this.crossfadeDur;
      this.ctx.clearRect(0, 0, W, H);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.drawImage(this.bufferA, 0, 0, W, H);
      this.ctx.globalAlpha = Math.min(1, Math.max(0, t));
      this.ctx.drawImage(this.bufferB, 0, 0, W, H);
      this.ctx.globalAlpha = 1;
      this.crossfadeT -= dt;
      if (this.crossfadeT <= 0) {
        this.sceneName = nextName;
        this.nextSceneName = null;
        this.crossfadeT = 0;
      }
    } else {
      this.ctx.clearRect(0, 0, W, H);
      this.ctx.imageSmoothingEnabled = true;
      this.ctx.drawImage(this.bufferA, 0, 0, W, H);
    }

    // Confetti overlay
    this.drawConfetti(this.ctx, W, H, dt);

    // Scene label
    this.ctx.fillStyle = '#ffffff88';
    this.ctx.font = '12px system-ui, sans-serif';
    this.ctx.textAlign = 'right';
    this.ctx.fillText(this.sceneName, W - 10, H - 10);
  }

  private updateBeat(time: number) {
    this.beatActive = false;
    while (time >= this.nextBeatTime) {
      this.beatActive = true;
      this.lastBeatTime = this.nextBeatTime;
      this.nextBeatTime += this.beatInterval;
      this.beatCount++;

      // Beat hooks
      this.onBeat_Common();

      if (this.sceneName === 'Beat Ball' || this.nextSceneName === 'Beat Ball') {
        this.onBeat_Ball();
      }
      if (this.sceneName === 'Lyric Lines' || this.nextSceneName === 'Lyric Lines') {
        this.onBeat_LyricLines();
      }
      if (this.sceneName === 'Flow Field' || this.nextSceneName === 'Flow Field') {
        this.onBeat_FlowField();
      }

      // Downbeat every N beats
      if (this.beatCount % this.downbeatEvery === 1) {
        this.onDownbeat();
      }
    }
  }

  private onBeat_Common() {
    // Small confetti burst every beat
    if (this.beatConfettiEnabled) {
      const energy = this.features.energy ?? 0.5;
      const count = Math.round(8 + energy * 14);
      this.spawnConfetti(count, 0.5);
    }
  }

  private onDownbeat() {
    // Extra confetti on downbeat
    if (this.beatConfettiEnabled) {
      const energy = this.features.energy ?? 0.5;
      const count = Math.round(18 + energy * 30);
      this.spawnConfetti(count, 1.0);
    }

    // Auto scene switching only when current mode is Auto
    if (this.autoSceneOnDownbeat && this.sceneName === 'Auto' && !this.nextSceneName && this.crossfadeT <= 0) {
      const choices = ['Particles', 'Tunnel', 'Terrain', 'Typography', 'Lyric Lines', 'Beat Ball', 'Flow Field'];
      const pick = choices[(Math.random() * choices.length) | 0];
      this.requestScene(pick);
    }
  }

  // Scenes

  private drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number, name: string) {
    switch (name) {
      case 'Lyric Lines':
        this.drawLyricLines(ctx, w, h, time, dt);
        break;
      case 'Beat Ball':
        this.drawBeatBall(ctx, w, h, time, dt);
        break;
      case 'Flow Field':
        this.drawFlowField(ctx, w, h, time, dt);
        break;
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

    const count = this.reduceMotion ? 6 : 16;
    for (let i = 0; i < count; i++) {
      const tt = time * (0.2 + (i % 5) * 0.07) + i;
      const x = (Math.sin(tt) * 0.5 + 0.5) * w;
      const y = (Math.cos(tt * 0.9) * 0.5 + 0.5) * h;
      const r = (Math.sin(tt * 1.3) * 0.35 + 0.65) * Math.min(w, h) * 0.04;

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
      ctx.arc(x, y, r, 0, Math.PI * 2);
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

  // Lyric Lines
  private drawLyricLines(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    if (!this.textField || this.lastTextW !== w || this.lastTextH !== h) {
      this.prepareTextField(this.lyricText, w, h);
    }
    if (this.lyricAgents.length === 0 && this.textPoints.length) {
      this.initLyricAgents();
    }

    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, w, h);

    const targetPts = this.textPoints;
    const stiffness = this.beatActive ? 8 : 4;
    const damping = 0.86;
    const noise = this.reduceMotion ? 0.1 : 0.25;

    for (const a of this.lyricAgents) {
      const t = targetPts[a.target];
      if (t) {
        const dx = t.x - a.x;
        const dy = t.y - a.y;
        a.vx += (dx * stiffness) * dt + (Math.random() - 0.5) * noise;
        a.vy += (dy * stiffness) * dt + (Math.random() - 0.5) * noise;
      } else {
        a.vx += (Math.random() - 0.5) * noise;
        a.vy += (Math.random() - 0.5) * noise;
      }
      a.vx *= 0.86;
      a.vy *= 0.86;
      a.x += a.vx;
      a.y += a.vy;
    }

    const sorted = this.lyricAgents.slice().sort((p, q) => p.x - q.x);
    ctx.lineWidth = this.beatActive ? 1.8 : 1.2;
    ctx.strokeStyle = this.palette.colors[0] || this.palette.dominant;
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    for (let i = 0; i < sorted.length; i++) {
      const p = sorted[i];
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private onBeat_LyricLines() {
    if (!this.textPoints.length) return;
    const count = Math.floor(this.lyricAgents.length * 0.08);
    for (let i = 0; i < count; i++) {
      const idx = (Math.random() * this.lyricAgents.length) | 0;
      this.lyricAgents[idx].target = (Math.random() * this.textPoints.length) | 0;
    }
  }

  private prepareTextField(text: string, w: number, h: number) {
    this.lastTextW = w; this.lastTextH = h;
    const sf = Math.min(w * 0.8, h * 0.32);
    if (!this.textField) this.textField = document.createElement('canvas');
    this.textField.width = w; this.textField.height = h;
    const tctx = this.textField.getContext('2d')!;
    tctx.clearRect(0, 0, w, h);
    tctx.fillStyle = '#fff';
    tctx.textAlign = 'center';
    tctx.textBaseline = 'middle';
    tctx.font = `bold ${Math.max(18, Math.floor(sf))}px system-ui, sans-serif`;
    tctx.fillText(text || 'DWDW', w / 2, h / 2);

    const img = tctx.getImageData(0, 0, w, h).data;
    const step = Math.max(3, Math.floor(Math.min(w, h) / 120));
    const pts: Array<{ x: number; y: number }> = [];
    for (let yy = 0; yy < h; yy += step) {
      for (let xx = 0; xx < w; xx += step) {
        const i = (yy * w + xx) * 4 + 3;
        if (img[i] > 32) pts.push({ x: xx, y: yy });
      }
    }
    const maxPts = 900;
    this.textPoints = pts.length > maxPts ? pts.sort(() => Math.random() - 0.5).slice(0, maxPts) : pts;
    this.lyricAgents = [];
  }

  private initLyricAgents() {
    const n = Math.min(900, this.textPoints.length);
    this.lyricAgents = new Array(n).fill(0).map(() => {
      const target = (Math.random() * this.textPoints.length) | 0;
      return { x: Math.random() * this.bufferA.width, y: Math.random() * this.bufferA.height, vx: 0, vy: 0, target };
    });
  }

  // Beat Ball
  private drawBeatBall(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, this.palette.colors[0] || this.palette.dominant);
    grad.addColorStop(1, this.palette.colors.at(-1) || this.palette.secondary);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const speedScale = 0.6 + (this.features.energy ?? 0.5) * 0.9;
    const spd = this.ball.speed * speedScale * (this.reduceMotion ? 0.6 : 1);
    this.ball.x += this.ball.vx * spd * dt;
    this.ball.y += this.ball.vy * spd * dt;

    const r = this.ball.radius;
    let bounced = false;
    if (this.ball.x < r) { this.ball.x = r; this.ball.vx = Math.abs(this.ball.vx); bounced = true; }
    else if (this.ball.x > w - r) { this.ball.x = w - r; this.ball.vx = -Math.abs(this.ball.vx); bounced = true; }
    if (this.ball.y < r) { this.ball.y = r; this.ball.vy = Math.abs(this.ball.vy); bounced = true; }
    else if (this.ball.y > h - r) { this.ball.y = h - r; this.ball.vy = -Math.abs(this.ball.vy); bounced = true; }

    const sinceBeat = this.lastBeatTime < 0 ? 999 : (time - this.lastBeatTime);
    const pulse = Math.max(0, 1 - sinceBeat * 6);
    const size = r * (1 + 0.25 * pulse);
    const hue = (this.ball.hue + (this.features.danceability ?? 0.5) * 90) % 360;

    ctx.shadowBlur = 30 * (0.3 + pulse);
    ctx.shadowColor = `hsla(${hue}, 90%, 60%, 0.9)`;
    ctx.fillStyle = `hsla(${hue}, 90%, ${bounced ? 70 : 60}%, 0.95)`;
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `hsla(${(hue + 180) % 360}, 90%, 60%, 0.35)`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(this.ball.x, this.ball.y);
    ctx.lineTo(this.ball.x - this.ball.vx * 80, this.ball.y - this.ball.vy * 80);
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  private onBeat_Ball() {
    this.randomizeBallDirection();
    this.ball.hue = (this.ball.hue + 47) % 360;
  }
  private randomizeBallDirection() {
    const ang = Math.random() * Math.PI * 2;
    this.ball.vx = Math.cos(ang);
    this.ball.vy = Math.sin(ang);
  }

  // Confetti overlay
  private spawnConfetti(count: number, power: number) {
    const W = this.canvas.width, H = this.canvas.height;
    const baseHue =
      this.keyHueTarget != null && this.keyColorEnabled
        ? this.keyHueTarget
        : rgbToHsl(hexToRgb(this.palette.dominant)!).h;
    const valence = this.features.valence ?? 0.5;
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (80 + Math.random() * 240) * (0.8 + power);
      const size = 2 + Math.random() * 4 * (1 + power);
      const hue = (baseHue + (Math.random() - 0.5) * 60 + valence * 60) % 360;
      this.confetti.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        life: 0,
        max: 0.8 + Math.random() * 1.2,
        hue, size
      });
    }
  }

  private drawConfetti(ctx: CanvasRenderingContext2D, W: number, H: number, dt: number) {
    if (!this.confetti.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const p = this.confetti[i];
      p.life += dt;
      if (p.life >= p.max) { this.confetti.splice(i, 1); continue; }
      const t = p.life / p.max;
      p.x += p.vx * dt;
      p.y += p.vy * dt + 60 * dt; // gravity
      p.vx *= 0.98; p.vy *= 0.98;

      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = `hsla(${p.hue}, 90%, 60%, ${0.9 * (1 - t)})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + 0.5 * (1 - t)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Key color morph
  private updateKeyPalette(dt: number) {
    if (!this.keyColorEnabled || this.keyHueTarget == null) return;
    // ease current hue toward target
    const delta = angularDelta(this.keyHueCurrent, this.keyHueTarget);
    this.keyHueCurrent = (this.keyHueCurrent + delta * Math.min(1, dt * 3)) % 360;

    // mix amount depends on mode (minor = subtler)
    const mode = this.features.mode ?? 1;
    const mixAmt = mode === 1 ? 0.6 : 0.4;

    // produce a shifted palette from base and blend
    const shifted = shiftPaletteHue(this.basePalette, this.keyHueCurrent);
    this.palette = blendPalettes(this.basePalette, shifted, mixAmt);
  }

  // Flow Field: build vector field from album art using Sobel edges
  private async buildFlowField(img: HTMLImageElement) {
    // Choose a compact field size for performance
    const maxDim = this.reduceMotion ? 112 : 160;
    const aspect = img.naturalWidth / img.naturalHeight;
    let w = 0, h = 0;
    if (aspect >= 1) { // wide
      w = maxDim;
      h = Math.max(16, Math.round(maxDim / aspect));
    } else {
      h = maxDim;
      w = Math.max(16, Math.round(maxDim * aspect));
    }

    // Draw into an offscreen canvas with "cover" fit to preserve composition
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    const o = off.getContext('2d')!;
    o.clearRect(0, 0, w, h);

    // Compute cover-fit draw rect
    const cw = img.naturalWidth;
    const ch = img.naturalHeight;
    const targetAR = w / h;
    const srcAR = cw / ch;
    let sx = 0, sy = 0, sw = cw, sh = ch;
    if (srcAR > targetAR) {
      // source is wider: crop width
      sw = ch * targetAR;
      sx = (cw - sw) / 2;
    } else {
      // source is taller: crop height
      sh = cw / targetAR;
      sy = (ch - sh) / 2;
    }
    o.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

    const data = o.getImageData(0, 0, w, h).data;
    // Grayscale luminance
    const lum = new Float32Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      lum[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const vec = new Float32Array(w * h * 2);
    const mag = new Float32Array(w * h);

    // Sobel kernels produce gradient (gx, gy)
    const idx = (x: number, y: number) => y * w + x;
    for (let y = 1; y < h - 1; y++) {
      for (let x = 1; x < w - 1; x++) {
        const i00 = idx(x - 1, y - 1), i01 = idx(x, y - 1), i02 = idx(x + 1, y - 1);
        const i10 = idx(x - 1, y),     i11 = idx(x, y),     i12 = idx(x + 1, y);
        const i20 = idx(x - 1, y + 1), i21 = idx(x, y + 1), i22 = idx(x + 1, y + 1);

        const gx =
          -lum[i00] + lum[i02] +
          -2 * lum[i10] + 2 * lum[i12] +
          -lum[i20] + lum[i22];

        const gy =
          -lum[i00] - 2 * lum[i01] - lum[i02] +
           lum[i20] + 2 * lum[i21] + lum[i22];

        // Tangent to the edge = perpendicular to gradient
        let tx = -gy, ty = gx;
        const m = Math.hypot(tx, ty);
        const pos = idx(x, y);

        if (m > 1e-3) {
          tx /= m; ty /= m;
          vec[pos * 2 + 0] = tx;
          vec[pos * 2 + 1] = ty;
          // edge magnitude (normalize and curve for contrast)
          const em = Math.min(1, Math.hypot(gx, gy) / 512);
          mag[pos] = Math.pow(em, 0.7);
        } else {
          vec[pos * 2 + 0] = 0;
          vec[pos * 2 + 1] = 0;
          mag[pos] = 0;
        }
      }
    }

    this.flowW = w;
    this.flowH = h;
    this.flowVec = vec;
    this.flowMag = mag;
  }

  private ensureFlowParticles() {
    const W = this.bufferA.width;
    const H = this.bufferA.height;
    this.flowParticlesTarget = this.reduceMotion ? 450 : 1200;
    while (this.flowParticles.length < this.flowParticlesTarget) {
      const hue = this.keyHueTarget != null && this.keyColorEnabled
        ? (this.keyHueTarget + Math.random() * 40 - 20 + 360) % 360
        : rgbToHsl(hexToRgb(this.palette.colors[this.flowParticles.length % this.palette.colors.length] || this.palette.dominant)!).h;

      this.flowParticles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        px: 0, py: 0,
        vx: 0, vy: 0,
        life: 0,
        ttl: 2 + Math.random() * 5,
        hue,
        size: this.reduceMotion ? 0.7 : 1.1,
        alpha: 0.5 + Math.random() * 0.5
      });
    }
    // Trim if needed
    if (this.flowParticles.length > this.flowParticlesTarget) {
      this.flowParticles.length = this.flowParticlesTarget;
    }
    // Initialize previous positions
    for (const p of this.flowParticles) { p.px = p.x; p.py = p.y; }
  }

  private onBeat_FlowField() {
    // On beat: refresh some particles and boost alpha
    const n = Math.min(120, Math.round((this.flowParticles.length * 0.08) || 0));
    const W = this.bufferA.width, H = this.bufferA.height;
    for (let i = 0; i < n; i++) {
      const idx = (Math.random() * this.flowParticles.length) | 0;
      const p = this.flowParticles[idx];
      p.x = Math.random() * W;
      p.y = Math.random() * H;
      p.px = p.x; p.py = p.y;
      p.vx *= 0.2; p.vy *= 0.2;
      p.life = 0;
      p.ttl = 1.5 + Math.random() * 4;
      p.alpha = 0.8;
    }
  }

  private drawFlowField(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    // Background subtle fill using palette
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, this.palette.colors[0] || this.palette.dominant);
    bg.addColorStop(1, this.palette.colors.at(-1) || this.palette.secondary);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Trails: darken a bit to leave paths
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, 0, w, h);

    // Ensure field and particles
    if (!this.flowVec || !this.flowMag || !this.flowW || !this.flowH) {
      // Fallback to a simple swirly field
      this.drawParticles(ctx, w, h, time, dt);
      return;
    }
    this.ensureFlowParticles();

    const baseSpeed = (this.reduceMotion ? 24 : 36) + (this.features.energy ?? 0.5) * (this.reduceMotion ? 24 : 42);
    const beatBoost = this.beatActive ? 1.45 : 1.0;
    const jitter = this.reduceMotion ? 0.1 : 0.18;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < this.flowParticles.length; i++) {
      const p = this.flowParticles[i];

      // Sample flow vector (bilinear)
      const fx = (p.x / w) * (this.flowW - 1);
      const fy = (p.y / h) * (this.flowH - 1);
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;

      const v00 = this.getFlow(ix,     iy);
      const v10 = this.getFlow(ix + 1, iy);
      const v01 = this.getFlow(ix,     iy + 1);
      const v11 = this.getFlow(ix + 1, iy + 1);

      // bilinear interpolate vector
      const vx = lerp(lerp(v00[0], v10[0], tx), lerp(v01[0], v11[0], tx), ty);
      const vy = lerp(lerp(v00[1], v10[1], tx), lerp(v01[1], v11[1], tx), ty);

      // magnitude for this texel
      const m00 = this.getMag(ix,     iy);
      const m10 = this.getMag(ix + 1, iy);
      const m01 = this.getMag(ix,     iy + 1);
      const m11 = this.getMag(ix + 1, iy + 1);
      const m = lerp(lerp(m00, m10, tx), lerp(m01, m11, tx), ty);

      // Desired velocity along field
      const targetVx = vx * baseSpeed * (0.4 + m) * beatBoost;
      const targetVy = vy * baseSpeed * (0.4 + m) * beatBoost;

      // Integrate with some inertia
      p.vx = lerp(p.vx, targetVx, 0.08 + m * 0.12);
      p.vy = lerp(p.vy, targetVy, 0.08 + m * 0.12);

      // Jitter to keep it lively
      p.vx += (Math.random() - 0.5) * jitter;
      p.vy += (Math.random() - 0.5) * jitter;

      // Advance
      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Wrap / respawn
      p.life += dt;
      if (p.life > p.ttl || p.x < -2 || p.y < -2 || p.x > w + 2 || p.y > h + 2) {
        p.x = Math.random() * w;
        p.y = Math.random() * h;
        p.px = p.x; p.py = p.y;
        p.vx = 0; p.vy = 0;
        p.life = 0;
        p.ttl = 1.5 + Math.random() * 4;
        // Slight hue drift
        p.hue = (p.hue + (Math.random() - 0.5) * 20) % 360;
      }

      // Draw streak
      const alpha = Math.min(1, p.alpha * (0.6 + m));
      ctx.strokeStyle = `hsla(${p.hue}, 90%, ${60 + (this.features.valence ?? 0.5) * 20}%, ${alpha})`;
      ctx.lineWidth = p.size * (1 + m * 0.8);
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
  }

  private getFlow(x: number, y: number): [number, number] {
    x = clampInt(x, 0, this.flowW - 1);
    y = clampInt(y, 0, this.flowH - 1);
    const i = (y * this.flowW + x) * 2;
    return [this.flowVec ? this.flowVec[i] : 0, this.flowVec ? this.flowVec[i + 1] : 0];
  }
  private getMag(x: number, y: number): number {
    x = clampInt(x, 0, this.flowW - 1);
    y = clampInt(y, 0, this.flowH - 1);
    const i = (y * this.flowW + x);
    return this.flowMag ? this.flowMag[i] : 0;
  }

  // Panels infra
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
      panel.style.minWidth = '240px';
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

  // Color helpers

  private mixColor(a: string, b: string, t: number) {
    const pa = hexToRgb(a);
    const pb = hexToRgb(b);
    if (!pa || !pb) return a;
    const c = {
      r: Math.round(pa.r + (pb.r - pa.r) * t),
      g: Math.round(pa.g + (pb.g - pa.g) * t),
      b: Math.round(pa.b + (pb.b - pa.b) * t)
    };
    return `rgb(${c.r}, ${c.g}, ${c.b})`;
  }
}

// Utility functions

function clampInt(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v | 0;
}
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// Color utils

function hexToRgb(hex: string) {
  const m = hex.trim().replace('#', '');
  const s = m.length === 3 ? m.split('').map((x) => x + x).join('') : m;
  const n = parseInt(s, 16);
  if (Number.isNaN(n) || (s.length !== 6)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function rgbToHex({ r, g, b }: { r: number; g: number; b: number }) {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}
function rgbToHsl({ r, g, b }: { r: number; g: number; b: number }) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return { h, s, l };
}
function hslToRgb(h: number, s: number, l: number) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r1 = 0, g1 = 0, b1 = 0;
  if (h < 60) { r1 = c; g1 = x; b1 = 0; }
  else if (h < 120) { r1 = x; g1 = c; b1 = 0; }
  else if (h < 180) { r1 = 0; g1 = c; b1 = x; }
  else if (h < 240) { r1 = 0; g1 = x; b1 = c; }
  else if (h < 300) { r1 = x; g1 = 0; b1 = c; }
  else { r1 = c; g1 = 0; b1 = x; }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  };
}
function shiftHueHex(hex: string, hue: number) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const { s, l } = rgbToHsl(rgb);
  const rgb2 = hslToRgb(hue, s, l);
  return rgbToHex(rgb2);
}
function shiftPaletteHue(p: UIPalette, hue: number): UIPalette {
  return {
    dominant: shiftHueHex(p.dominant, hue),
    secondary: shiftHueHex(p.secondary, hue),
    colors: p.colors.map(c => shiftHueHex(c, hue))
  };
}
function blendHex(a: string, b: string, t: number) {
  const A = hexToRgb(a), B = hexToRgb(b);
  if (!A || !B) return a;
  return rgbToHex({
    r: Math.round(A.r + (B.r - A.r) * t),
    g: Math.round(A.g + (B.g - A.g) * t),
    b: Math.round(A.b + (B.b - A.b) * t)
  });
}
function blendPalettes(a: UIPalette, b: UIPalette, t: number): UIPalette {
  return {
    dominant: blendHex(a.dominant, b.dominant, t),
    secondary: blendHex(a.secondary, b.secondary, t),
    colors: a.colors.map((c, i) => blendHex(c, b.colors[i % b.colors.length], t))
  };
}
function angularDelta(current: number, target: number) {
  let d = ((target - current + 540) % 360) - 180;
  return d;
}