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
  private palette: UIPalette = {
    dominant: '#22cc88',
    secondary: '#cc2288',
    colors: ['#22cc88', '#cc2288', '#22aacc', '#ffaa22']
  };
  private reduceMotion = false;

  // Audio-reactivity
  private featuresEnabled = true;
  private features: AudioFeaturesLite = {};
  private lastTrackId: string | null = null;
  private featuresBackoffUntil = 0;

  // Beat scheduler
  private beatInterval = 60 / 120; // seconds (default 120 BPM)
  private nextBeatTime = 0;        // seconds since start (render time)
  private beatPhaseJitter = 0;     // 0..beatInterval offset for variety
  private lastBeatTime = -1;       // last beat timestamp
  private beatActive = false;

  // Lyric Lines scene state
  private lyricText = 'DWDW';
  private textField: HTMLCanvasElement | null = null;
  private textPoints: Array<{ x: number; y: number }> = [];
  private lyricAgents: Array<{ x: number; y: number; vx: number; vy: number; target: number }> = [];
  private lastTextW = 0;
  private lastTextH = 0;

  // Beat Ball scene state
  private ball = {
    x: 0, y: 0, vx: 0, vy: 0, speed: 280, radius: 28, hue: 140
  };

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
      this.canvas.width = w;
      this.canvas.height = h;
      const bw = Math.max(320, Math.floor(w * this.renderScale));
      const bh = Math.max(180, Math.floor(h * this.renderScale));
      this.bufferA.width = bw;
      this.bufferA.height = bh;
      this.bufferB.width = bw;
      this.bufferB.height = bh;

      // Rebuild text field if needed
      this.prepareTextField(this.lyricText, bw, bh);
      // Reset ball to center
      this.ball.x = w / 2; this.ball.y = h / 2;
      if (this.ball.vx === 0 && this.ball.vy === 0) this.randomizeBallDirection();
    };
    window.addEventListener('resize', onResize);
    onResize();

    // Initialize beat schedule
    this.recomputeBeatSchedule();

    this.start();
  }

  // Public API

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
      `;
      panel.querySelector<HTMLInputElement>('#reduce-motion')!
        .addEventListener('change', (e) => {
          this.reduceMotion = (e.target as HTMLInputElement).checked;
          this.togglePanel('access', false);
        });
      panel.querySelector<HTMLInputElement>('#audio-reactive')!
        .addEventListener('change', (e) => {
          this.setFeaturesEnabled((e.target as HTMLInputElement).checked);
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

    // Reset beat jitter on new track
    this.beatPhaseJitter = Math.random() * this.beatInterval;

    // Audio features (optional)
    if (!track.id || (track as any).is_local) {
      this.lastTrackId = null;
      this.features = {};
      this.recomputeBeatSchedule();
      return;
    }
    if (this.lastTrackId === track.id) return;
    this.lastTrackId = track.id;

    if (!this.featuresEnabled) return;
    if (Date.now() < this.featuresBackoffUntil) return;

    try {
      const f = await this.api.getAudioFeatures(track.id);
      this.features = {
        tempo: typeof f?.tempo === 'number' ? f.tempo : undefined,
        energy: typeof f?.energy === 'number' ? f.energy : undefined,
        danceability: typeof f?.danceability === 'number' ? f.danceability : undefined
      };
      this.recomputeBeatSchedule();
      // Try to refine beats from analysis (optional)
      try {
        const analysis = await this.api.getAudioAnalysis(track.id);
        const beats: Array<{ start: number; duration: number; confidence: number }> = analysis?.beats || [];
        if (beats && beats.length > 4) {
          // Use average beat interval from confident beats
          const intervals: number[] = [];
          for (let i = 1; i < beats.length; i++) {
            if (beats[i - 1].confidence > 0.3 && beats[i].confidence > 0.3) {
              intervals.push(beats[i].start - beats[i - 1].start);
            }
          }
          const avg = intervals.length ? intervals.reduce((a, b) => a + b, 0) / intervals.length : 0;
          if (avg > 0.2 && avg < 2.0) {
            this.beatInterval = avg;
            this.beatPhaseJitter = 0;
          }
        }
      } catch {
        // ignore analysis errors
      }
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
    // next beat aligned with current time + jitter
    const now = this.lastT ? this.lastT / 1000 : 0;
    this.nextBeatTime = now + (this.beatPhaseJitter || 0);
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
    this.updateBeat(time);

    const W = this.canvas.width;
    const H = this.canvas.height;
    const bw = this.bufferA.width;
    const bh = this.bufferA.height;

    const curName = this.sceneName;
    const nextName = this.nextSceneName;

    this.drawScene(this.bufCtxA, bw, bh, time, dt, curName);

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

      // Trigger per-beat hooks
      if (this.sceneName === 'Beat Ball' || this.nextSceneName === 'Beat Ball') {
        this.onBeat_Ball();
      }
      if (this.sceneName === 'Lyric Lines' || this.nextSceneName === 'Lyric Lines') {
        this.onBeat_LyricLines();
      }
    }
  }

  private drawScene(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number, name: string) {
    switch (name) {
      case 'Lyric Lines':
        this.drawLyricLines(ctx, w, h, time, dt);
        break;
      case 'Beat Ball':
        this.drawBeatBall(ctx, w, h, time, dt);
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

  // New scene: Lyric Lines
  private drawLyricLines(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    if (!this.textField || this.lastTextW !== w || this.lastTextH !== h) {
      this.prepareTextField(this.lyricText, w, h);
    }
    if (this.lyricAgents.length === 0 && this.textPoints.length) {
      this.initLyricAgents();
    }

    // background fade
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(0, 0, w, h);

    // move agents toward their targets
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
      a.vx *= damping;
      a.vy *= damping;
      a.x += a.vx;
      a.y += a.vy;
    }

    // connect agents into flowing lines sorted by x
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
    // Reassign some agent targets for a ripple effect
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

    // sample points from text bitmap
    const img = tctx.getImageData(0, 0, w, h).data;
    const step = Math.max(3, Math.floor(Math.min(w, h) / 120));
    const pts: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4 + 3; // alpha
        if (img[i] > 32) {
          pts.push({ x, y });
        }
      }
    }
    // down-sample to a manageable number
    const maxPts = 900;
    this.textPoints = pts.length > maxPts
      ? pts.sort(() => Math.random() - 0.5).slice(0, maxPts)
      : pts;

    // reset agents (will be re-initialized)
    this.lyricAgents = [];
  }

  private initLyricAgents() {
    const n = Math.min(900, this.textPoints.length);
    this.lyricAgents = new Array(n).fill(0).map(() => {
      const target = (Math.random() * this.textPoints.length) | 0;
      return {
        x: Math.random() * this.bufferA.width,
        y: Math.random() * this.bufferA.height,
        vx: 0, vy: 0,
        target
      };
    });
  }

  // New scene: Beat Ball
  private drawBeatBall(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    // background
    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, this.palette.colors[0] || this.palette.dominant);
    grad.addColorStop(1, this.palette.colors.at(-1) || this.palette.secondary);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // move ball
    const speedScale = 0.6 + (this.features.energy ?? 0.5) * 0.9;
    const spd = this.ball.speed * speedScale * (this.reduceMotion ? 0.6 : 1);
    this.ball.x += this.ball.vx * spd * dt;
    this.ball.y += this.ball.vy * spd * dt;

    // bounce on walls
    const r = this.ball.radius;
    let bounced = false;
    if (this.ball.x < r) { this.ball.x = r; this.ball.vx = Math.abs(this.ball.vx); bounced = true; }
    else if (this.ball.x > w - r) { this.ball.x = w - r; this.ball.vx = -Math.abs(this.ball.vx); bounced = true; }
    if (this.ball.y < r) { this.ball.y = r; this.ball.vy = Math.abs(this.ball.vy); bounced = true; }
    else if (this.ball.y > h - r) { this.ball.y = h - r; this.ball.vy = -Math.abs(this.ball.vy); bounced = true; }

    // draw ball with beat pulse
    const sinceBeat = this.lastBeatTime < 0 ? 999 : (time - this.lastBeatTime);
    const pulse = Math.max(0, 1 - sinceBeat * 6); // quick decay after beat
    const size = r * (1 + 0.25 * pulse);
    const hue = (this.ball.hue + (this.features.danceability ?? 0.5) * 90) % 360;

    ctx.shadowBlur = 30 * (0.3 + pulse);
    ctx.shadowColor = `hsla(${hue}, 90%, 60%, 0.9)`;
    ctx.fillStyle = `hsla(${hue}, 90%, ${bounced ? 70 : 60}%, 0.95)`;
    ctx.beginPath();
    ctx.arc(this.ball.x, this.ball.y, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // trailing streaks
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
    // change direction randomly but keep normalized velocity
    this.randomizeBallDirection();
    // also shift color
    this.ball.hue = (this.ball.hue + 47) % 360;
  }

  private randomizeBallDirection() {
    const ang = Math.random() * Math.PI * 2;
    this.ball.vx = Math.cos(ang);
    this.ball.vy = Math.sin(ang);
  }

  // Existing scenes

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

  // Panels

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
}