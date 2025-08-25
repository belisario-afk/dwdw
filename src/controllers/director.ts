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

// Tiny cover sprite following the flow
type FlowSprite = {
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  life: number; ttl: number;
  scale: number; alpha: number;
};

type FlowSettings = {
  particleCount: number;      // 100..2000
  speed: number;              // base speed multiplier
  lineWidth: number;          // trail width
  colorMode: 'palette' | 'key' | 'image';
  edgeOverlay: boolean;       // show edge strength overlay
  swirlAmount: number;        // 0..1 blend into procedural swirl
  spritesEnabled: boolean;    // enable tiny album covers
  spriteCount: number;        // number of sprites
  spriteScalePct: number;     // sprite size as percent of min(w,h)
  spriteBeatBurst: boolean;   // respawn sprites on beats
};

// Neon Bars
type NeonBar = { v: number; target: number; peak: number; };
type Stinger = { start: number; dur: number; dir: 1 | -1; hue: number };

// Lyrics types
type LyricWord = { start: number; end: number; text: string };
type LyricLine = { start: number; end: number; text: string; words?: LyricWord[] };
type LyricsState = {
  provider: 'lrclib';
  trackId: string | null;
  synced: boolean;
  lines: LyricLine[];
  updatedAt: number;
};

// Stained Glass Voronoi types
type SGSite = { x: number; y: number; color: { r: number; g: number; b: number } };
type SGCell = { pts: Array<{ x: number; y: number }>; cx: number; cy: number; color: { r: number; g: number; b: number }; radius: number };
type Sparkle = { x: number; y: number; life: number; max: number; hue: number; size: number };

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
  private lastTrackDurationMs: number = 0;
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

  // Karaoke/lyrics state
  private lyricsAutoFetch = true;
  private lyrics: LyricsState | null = null;
  private currentLyricIndex = -1;

  // Lyrics overlay settings
  private lyricsOverlayEnabled = true;
  private lyricsOverlayScale = 1.0;

  // Playback progress (for lyrics timing)
  private playbackMs = 0;
  private playbackIsPlaying = false;
  private pbPollTimer: any = null;

  // Beat Ball scene
  private ball = { x: 0, y: 0, vx: 0, vy: 0, speed: 280, radius: 28, hue: 140 };

  // Album art flow field + image sampler
  private albumArtUrl: string | null = null;
  private albumImg: HTMLImageElement | null = null; // original image for sprites
  private flowW = 0;
  private flowH = 0;
  private flowVec: Float32Array | null = null; // [vx, vy] per texel (tangent)
  private flowMag: Float32Array | null = null; // magnitude 0..1
  private flowOverlayCanvas: HTMLCanvasElement | null = null;
  private flowImageCanvas: HTMLCanvasElement | null = null; // color sampling
  private flowImageCtx: CanvasRenderingContext2D | null = null;

  private flowParticles: FlowP[] = [];
  private flowSprites: FlowSprite[] = [];

  private flowSettings: FlowSettings = {
    particleCount: 1200,
    speed: 36,
    lineWidth: 1.2,
    colorMode: 'palette',
    edgeOverlay: false,
    swirlAmount: 0.6,
    spritesEnabled: false,
    spriteCount: 18,
    spriteScalePct: 6,
    spriteBeatBurst: true
  };

  // Neon Bars state
  private neonBars: NeonBar[] = [];
  private neonGlow = 0;
  private neonStingers: Stinger[] = [];
  private neonLastLayoutW = 0;

  // Stained Glass Voronoi state
  private sgSites: SGSite[] = [];
  private sgCells: SGCell[] = [];
  private sgLastW = 0;
  private sgLastH = 0;
  private sgPulse = 0; // 0..1 neon edge pulse
  private sgSparkles: Sparkle[] = [];
  private sgDownbeatCounter = 0; // reseed occasionally

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
    this.bufCtxA = a!;
    this.bufCtxB = b!;

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

      // Adjust defaults by motion for Flow Field
      this.flowSettings.particleCount = this.reduceMotion ? 600 : 1200;
      this.ensureFlowParticles();
      this.ensureFlowSprites();

      // Reset Neon Bars layout cache to recompute bar count on next draw
      this.neonLastLayoutW = 0;

      // Mark SG Voronoi for rebuild
      this.sgLastW = 0; this.sgLastH = 0;
    };
    window.addEventListener('resize', onResize);
    onResize();

    // Initialize beat schedule
    this.recomputeBeatSchedule();

    // Start internal playback polling for lyrics timing
    this.startPlaybackPolling();

    this.start();
  }

  // Public API

  getCanvas(): HTMLCanvasElement { return this.canvas; }

  setPalette(p: UIPalette) {
    this.basePalette = { ...p, colors: [...p.colors] };
    this.palette = { ...p, colors: [...p.colors] };
    this.emit('palette', p);
  }

  // New: set album art for Flow Field scene and color sampling
  async setAlbumArt(url: string | null) {
    if (!url || url === this.albumArtUrl) return;
    this.albumArtUrl = url;
    try {
      const img = await loadImage(url);
      this.albumImg = img;
      await this.buildFlowField(img);
      // Reset particles/sprites to take advantage of new field
      this.flowParticles = [];
      this.flowSprites = [];
      if (this.sceneName === 'Flow Field' || this.nextSceneName === 'Flow Field') {
        this.ensureFlowParticles();
        this.ensureFlowSprites();
      }
      // Recolor Voronoi cells on next draw
      this.sgLastW = 0; this.sgLastH = 0;
    } catch (e) {
      // If art fails (CORS/404), clear field so scene uses procedural fallback
      this.flowVec = null;
      this.flowMag = null;
      this.flowW = 0;
      this.flowH = 0;
      this.albumImg = null;
      this.flowOverlayCanvas = null;
      this.flowImageCanvas = null;
      this.flowImageCtx = null;
      // Recolor Voronoi with palette
      this.sgLastW = 0; this.sgLastH = 0;
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

        <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
          <button id="open-flow-panel">Configure Flow Field…</button>
          <button id="open-lyrics-panel">Lyrics…</button>
        </div>
      `;
      panel.querySelector<HTMLInputElement>('#reduce-motion')!
        .addEventListener('change', (e) => {
          this.reduceMotion = (e.target as HTMLInputElement).checked;
          // Update flow particle default
          this.flowSettings.particleCount = this.reduceMotion ? 600 : 1200;
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
      panel.querySelector<HTMLButtonElement>('#open-flow-panel')!
        .addEventListener('click', () => {
          this.togglePanel('access', false);
          this.toggleFlowFieldPanel(true);
        });
      panel.querySelector<HTMLButtonElement>('#open-lyrics-panel')!
        .addEventListener('click', () => {
          this.togglePanel('access', false);
          this.toggleLyricsPanel(true);
        });
    });
    this.togglePanel('access', undefined);
  }

  private toggleFlowFieldPanel(force?: boolean) {
    this.mountPanel('flow', 'Flow Field', (panel) => {
      const s = this.flowSettings;
      panel.innerHTML = `
        <div style="display:flex;gap:8px;flex-direction:column;min-width:260px;">
          <label>Particles: <input id="ff-count" type="range" min="100" max="2000" step="50" value="${s.particleCount}"><span id="ff-count-val">${s.particleCount}</span></label>
          <label>Speed: <input id="ff-speed" type="range" min="10" max="120" step="1" value="${s.speed}"><span id="ff-speed-val">${s.speed}</span></label>
          <label>Trail width: <input id="ff-width" type="range" min="0.5" max="4" step="0.1" value="${s.lineWidth}"><span id="ff-width-val">${s.lineWidth.toFixed(1)}</span></label>
          <label>Color mode:
            <select id="ff-color">
              <option value="palette" ${s.colorMode==='palette'?'selected':''}>Album palette</option>
              <option value="key" ${s.colorMode==='key'?'selected':''}>Musical key hue</option>
              <option value="image" ${s.colorMode==='image'?'selected':''}>Sample from cover</option>
            </select>
          </label>

          <label style="display:flex;gap:8px;align-items:center;">
            <input id="ff-edge" type="checkbox" ${s.edgeOverlay?'checked':''}/> Edge overlay
          </label>

          <label>Swirl fallback blend:
            <input id="ff-swirl" type="range" min="0" max="1" step="0.05" value="${s.swirlAmount}"><span id="ff-swirl-val">${s.swirlAmount.toFixed(2)}</span>
          </label>

          <fieldset style="border:1px solid rgba(255,255,255,.1);border-radius:8px;padding:8px;">
            <legend>Tiny covers</legend>
            <label style="display:flex;gap:8px;align-items:center;">
              <input id="ff-sprites" type="checkbox" ${s.spritesEnabled?'checked':''}/> Enable tiny album covers
            </label>
            <label>Count:
              <input id="ff-sprite-count" type="range" min="0" max="64" step="1" value="${s.spriteCount}">
              <span id="ff-sprite-count-val">${s.spriteCount}</span>
            </label>
            <label>Size (% of min dimension):
              <input id="ff-sprite-scale" type="range" min="2" max="14" step="1" value="${s.spriteScalePct}">
              <span id="ff-sprite-scale-val">${s.spriteScalePct}%</span>
            </label>
            <label style="display:flex;gap:8px;align-items:center;">
              <input id="ff-sprite-beat" type="checkbox" ${s.spriteBeatBurst?'checked':''}/> Burst on beats
            </label>
          </fieldset>
        </div>
      `;

      // Wire inputs
      panel.querySelector<HTMLInputElement>('#ff-count')!.oninput = (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        this.flowSettings.particleCount = v;
        panel.querySelector('#ff-count-val')!.textContent = String(v);
        this.ensureFlowParticles();
      };
      panel.querySelector<HTMLInputElement>('#ff-speed')!.oninput = (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        this.flowSettings.speed = v;
        panel.querySelector('#ff-speed-val')!.textContent = String(v);
      };
      panel.querySelector<HTMLInputElement>('#ff-width')!.oninput = (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        this.flowSettings.lineWidth = v;
        panel.querySelector('#ff-width-val')!.textContent = v.toFixed(1);
      };
      panel.querySelector<HTMLSelectElement>('#ff-color')!.onchange = (e) => {
        this.flowSettings.colorMode = (e.target as HTMLSelectElement).value as FlowSettings['colorMode'];
      };
      panel.querySelector<HTMLInputElement>('#ff-edge')!.onchange = (e) => {
        this.flowSettings.edgeOverlay = (e.target as HTMLInputElement).checked;
      };
      panel.querySelector<HTMLInputElement>('#ff-swirl')!.oninput = (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        this.flowSettings.swirlAmount = v;
        panel.querySelector('#ff-swirl-val')!.textContent = v.toFixed(2);
      };
      panel.querySelector<HTMLInputElement>('#ff-sprites')!.onchange = (e) => {
        this.flowSettings.spritesEnabled = (e.target as HTMLInputElement).checked;
        this.ensureFlowSprites();
      };
      panel.querySelector<HTMLInputElement>('#ff-sprite-count')!.oninput = (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        this.flowSettings.spriteCount = v;
        panel.querySelector('#ff-sprite-count-val')!.textContent = String(v);
        this.ensureFlowSprites();
      };
      panel.querySelector<HTMLInputElement>('#ff-sprite-scale')!.oninput = (e) => {
        const v = Number((e.target as HTMLInputElement).value);
        this.flowSettings.spriteScalePct = v;
        panel.querySelector('#ff-sprite-scale-val')!.textContent = `${v}%`;
      };
      panel.querySelector<HTMLInputElement>('#ff-sprite-beat')!.onchange = (e) => {
        this.flowSettings.spriteBeatBurst = (e.target as HTMLInputElement).checked;
      };
    });
    this.togglePanel('flow', force);
  }

  private toggleLyricsPanel(force?: boolean) {
    this.mountPanel('lyrics', 'Lyrics', (panel) => {
      panel.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:10px;min-width:280px;">
          <label style="display:flex;gap:8px;align-items:center;">
            <input id="lyr-auto" type="checkbox" ${this.lyricsAutoFetch ? 'checked' : ''}/>
            <span>Auto‑fetch lyrics (LRCLIB)</span>
          </label>

          <label style="display:flex;gap:8px;align-items:center;">
            <input id="lyr-overlay" type="checkbox" ${this.lyricsOverlayEnabled ? 'checked' : ''}/>
            <span>Show lyrics overlay</span>
          </label>

          <label>Overlay size:
            <input id="lyr-size" type="range" min="0.7" max="1.6" step="0.05" value="${this.lyricsOverlayScale}">
            <span id="lyr-size-val">${this.lyricsOverlayScale.toFixed(2)}x</span>
          </label>

          <div style="font-size:12px;opacity:.8;">
            Provider: LRCLIB (synced when available). We don't scrape lyrics sites.
          </div>

          <div id="lyr-status" style="font-size:12px;opacity:.9;">
            ${this.lyrics?.lines?.length ? `Loaded ${this.lyrics.lines.length} line(s)${this.lyrics.synced ? ' (synced)' : ''}.` : 'No lyrics loaded.'}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button id="lyr-refetch">Refetch for current track</button>
            <button id="lyr-clear">Clear</button>
          </div>
        </div>
      `;
      panel.querySelector<HTMLInputElement>('#lyr-auto')!
        .addEventListener('change', (e) => {
          this.lyricsAutoFetch = (e.target as HTMLInputElement).checked;
          if (this.lyricsAutoFetch && this.lastTrackId) {
            this.refetchLyricsForCurrentTrack().catch(() => {});
          }
          this.togglePanel('lyrics', false);
        });
      panel.querySelector<HTMLInputElement>('#lyr-overlay')!
        .addEventListener('change', (e) => {
          this.lyricsOverlayEnabled = (e.target as HTMLInputElement).checked;
          this.togglePanel('lyrics', false);
        });
      panel.querySelector<HTMLInputElement>('#lyr-size')!
        .addEventListener('input', (e) => {
          const v = Number((e.target as HTMLInputElement).value);
          this.lyricsOverlayScale = Math.max(0.7, Math.min(1.6, v));
          const label = panel.querySelector('#lyr-size-val');
          if (label) label.textContent = `${this.lyricsOverlayScale.toFixed(2)}x`;
        });
      panel.querySelector<HTMLButtonElement>('#lyr-refetch')!
        .addEventListener('click', () => {
          this.refetchLyricsForCurrentTrack().catch(() => {});
          this.togglePanel('lyrics', false);
        });
      panel.querySelector<HTMLButtonElement>('#lyr-clear')!
        .addEventListener('click', () => {
          this.lyrics = null;
          this.currentLyricIndex = -1;
          this.togglePanel('lyrics', false);
        });
    });
    this.togglePanel('lyrics', force);
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

    // Track duration and reset overlay timing
    this.lastTrackDurationMs = track.duration_ms ?? 0;
    this.playbackMs = 0;
    this.currentLyricIndex = -1;

    // Flow field / album sampler: set new album art if available
    const art = track.album?.images?.[0]?.url || null;
    if (art) {
      this.setAlbumArt(art).catch(() => {});
    }

    if (!track.id || (track as any).is_local) {
      this.lastTrackId = null;
      this.features = {};
      this.keyHueTarget = null;
      this.lyrics = null;
      this.currentLyricIndex = -1;
      this.recomputeBeatSchedule();
      return;
    }
    if (this.lastTrackId === track.id) return;
    this.lastTrackId = track.id;

    // Lyrics auto-fetch
    if (this.lyricsAutoFetch) {
      this.fetchLyricsLRCLIB(track).catch(() => {});
    } else {
      this.lyrics = null;
      this.currentLyricIndex = -1;
    }

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
    // Update local playback progress for lyric timing
    if (this.playbackIsPlaying) this.playbackMs += dt * 1000;

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

    // Update current lyric line (if any)
    this.updateCurrentLyricLine();

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

    // Lyrics overlay (on top of everything)
    this.drawLyricsOverlay(this.ctx, W, H);

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
      if (this.sceneName === 'Neon Bars' || this.nextSceneName === 'Neon Bars') {
        this.onBeat_NeonBars();
      }
      if (this.sceneName === 'Stained Glass Voronoi' || this.nextSceneName === 'Stained Glass Voronoi') {
        this.onBeat_Stained();
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

    // Scene-specific downbeat
    if (this.sceneName === 'Neon Bars' || this.nextSceneName === 'Neon Bars') {
      this.onDownbeat_NeonBars();
    }
    if (this.sceneName === 'Stained Glass Voronoi' || this.nextSceneName === 'Stained Glass Voronoi') {
      this.onDownbeat_Stained();
    }

    // Auto scene switching only when current mode is Auto
    if (this.autoSceneOnDownbeat && this.sceneName === 'Auto' && !this.nextSceneName && this.crossfadeT <= 0) {
      const choices = ['Particles', 'Tunnel', 'Terrain', 'Typography', 'Lyric Lines', 'Beat Ball', 'Flow Field', 'Neon Bars', 'Stained Glass Voronoi'];
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
      case 'Neon Bars':
        this.drawNeonBars(ctx, w, h, time, dt);
        break;
      case 'Stained Glass Voronoi':
        this.drawStainedGlassVoronoi(ctx, w, h, time, dt);
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
    // Use willReadFrequently; we call getImageData right after drawing text
    const tctx = this.textField.getContext('2d', { willReadFrequently: true } as any)!;
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
    const delta = angularDelta(this.keyHueCurrent, this.keyHueTarget);
    this.keyHueCurrent = (this.keyHueCurrent + delta * Math.min(1, dt * 3)) % 360;

    const mode = this.features.mode ?? 1;
    const mixAmt = mode === 1 ? 0.6 : 0.4;

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
      sw = ch * targetAR;
      sx = (cw - sw) / 2;
    } else {
      sh = cw / targetAR;
      sy = (ch - sh) / 2;
    }
    o.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);

    const imgData = o.getImageData(0, 0, w, h);

    // Keep a copy for color sampling (upscaled later)
    this.flowImageCanvas = document.createElement('canvas');
    this.flowImageCanvas.width = w; this.flowImageCanvas.height = h;
    this.flowImageCtx = this.flowImageCanvas.getContext('2d', { willReadFrequently: true } as any)!;
    this.flowImageCtx.putImageData(imgData, 0, 0);

    // Grayscale luminance
    const data = imgData.data;
    const lum = new Float32Array(w * h);
    for (let i = 0, p = 0; i < data.length; i += 4, p++) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      lum[p] = 0.299 * r + 0.587 * g + 0.114 * b;
    }

    const vec = new Float32Array(w * h * 2);
    const mag = new Float32Array(w * h);

    // Sobel kernels produce gradient (gx, gy)
    const idx = (x: number, y: number) => y * w + x;
    let maxEdge = 0;
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
          const em = Math.hypot(gx, gy);
          maxEdge = Math.max(maxEdge, em);
          mag[pos] = em;
        } else {
          vec[pos * 2 + 0] = 0;
          vec[pos * 2 + 1] = 0;
          mag[pos] = 0;
        }
      }
    }
    // Normalize magnitudes to 0..1 with a curve
    const invMax = maxEdge > 0 ? 1 / maxEdge : 1;
    for (let i = 0; i < mag.length; i++) {
      const m = Math.min(1, mag[i] * invMax);
      mag[i] = Math.pow(m, 0.7);
    }

    // Prebuild overlay image
    const overlay = document.createElement('canvas');
    overlay.width = w; overlay.height = h;
    const oc = overlay.getContext('2d')!;
    const heat = oc.createImageData(w, h);
    const hd = heat.data;
    for (let i = 0; i < mag.length; i++) {
      const v = Math.round(mag[i] * 255);
      hd[i * 4 + 0] = v;
      hd[i * 4 + 1] = v;
      hd[i * 4 + 2] = v;
      hd[i * 4 + 3] = Math.round(255 * 0.9);
    }
    oc.putImageData(heat, 0, 0);

    this.flowW = w;
    this.flowH = h;
    this.flowVec = vec;
    this.flowMag = mag;
    this.flowOverlayCanvas = overlay;
  }

  private ensureFlowParticles() {
    const W = this.bufferA.width;
    const H = this.bufferA.height;
    const target = this.flowSettings.particleCount | 0;
    while (this.flowParticles.length < target) {
      const hue = this.pickFlowHue(this.flowParticles.length);
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
    if (this.flowParticles.length > target) this.flowParticles.length = target;
    for (const p of this.flowParticles) { p.px = p.x; p.py = p.y; }
  }

  private ensureFlowSprites() {
    const W = this.bufferA.width, H = this.bufferA.height;
    const target = this.flowSettings.spritesEnabled ? this.flowSettings.spriteCount : 0;
    while (this.flowSprites.length < target) {
      this.flowSprites.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: 0, vy: 0,
        angle: 0,
        life: 0,
        ttl: 3 + Math.random() * 6,
        scale: 1,
        alpha: 0.9
      });
    }
    if (this.flowSprites.length > target) this.flowSprites.length = target;
  }

  private onBeat_FlowField() {
    // On beat: refresh some particles and optionally respawn sprites
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

    if (this.flowSettings.spritesEnabled && this.flowSettings.spriteBeatBurst && this.flowSprites.length) {
      for (let i = 0; i < Math.min(6, this.flowSprites.length); i++) {
        const s = this.flowSprites[(Math.random() * this.flowSprites.length) | 0];
        s.life = 0;
        s.ttl = 2 + Math.random() * 5;
        s.alpha = 1;
      }
    }
  }

  private drawFlowField(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    // Background using palette
    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, this.palette.colors[0] || this.palette.dominant);
    bg.addColorStop(1, this.palette.colors.at(-1) || this.palette.secondary);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Trails fade
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, 0, w, h);

    // Particles
    this.ensureFlowParticles();

    const baseSpeed = this.flowSettings.speed + (this.features.energy ?? 0.5) * (this.reduceMotion ? 20 : 30);
    const beatBoost = this.beatActive ? 1.45 : 1.0;
    const jitter = this.reduceMotion ? 0.08 : 0.16;

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < this.flowParticles.length; i++) {
      const p = this.flowParticles[i];

      // Sample flow vector (art + swirl)
      const fv = this.sampleFlowVector(p.x, p.y, w, h, time);
      const m = fv[2]; // strength
      const targetVx = fv[0] * baseSpeed * (0.4 + m) * beatBoost;
      const targetVy = fv[1] * baseSpeed * (0.4 + m) * beatBoost;

      p.vx = lerp(p.vx, targetVx, 0.08 + m * 0.12);
      p.vy = lerp(p.vy, targetVy, 0.08 + m * 0.12);

      p.vx += (Math.random() - 0.5) * jitter;
      p.vy += (Math.random() - 0.5) * jitter;

      p.px = p.x; p.py = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Wrap/respawn
      p.life += dt;
      if (p.life > p.ttl || p.x < -2 || p.y < -2 || p.x > w + 2 || p.y > h + 2) {
        p.x = Math.random() * w;
        p.y = Math.random() * h;
        p.px = p.x; p.py = p.y;
        p.vx = 0; p.vy = 0;
        p.life = 0;
        p.ttl = 1.5 + Math.random() * 4;
        // Slight hue drift
        p.hue = this.pickFlowHue(i);
      }

      // Color
      let stroke = '';
      switch (this.flowSettings.colorMode) {
        case 'key': {
          const hue = (this.keyHueTarget ?? rgbToHsl(hexToRgb(this.palette.dominant)!).h) % 360;
          stroke = `hsla(${hue}, 90%, ${60 + (this.features.valence ?? 0.5) * 20}%, ${Math.min(1, p.alpha * (0.6 + m))})`;
          break;
        }
        case 'image': {
          const c = this.sampleImageColor(p.x, p.y, w, h);
          stroke = `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.min(1, p.alpha * (0.6 + m))})`;
          break;
        }
        case 'palette':
        default: {
          const col = this.palette.colors[i % this.palette.colors.length] || this.palette.dominant;
          const rgb = hexToRgb(col)!;
          stroke = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.min(1, p.alpha * (0.6 + m))})`;
          break;
        }
      }

      ctx.strokeStyle = stroke;
      ctx.lineWidth = this.flowSettings.lineWidth * (1 + m * 0.8);
      ctx.beginPath();
      ctx.moveTo(p.px, p.py);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    // Edge overlay
    if (this.flowSettings.edgeOverlay && this.flowOverlayCanvas) {
      ctx.globalAlpha = 0.15;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(this.flowOverlayCanvas, 0, 0, w, h);
      ctx.globalAlpha = 1;
    }

    // Tiny album cover sprites
    if (this.flowSettings.spritesEnabled && this.albumImg) {
      this.ensureFlowSprites();
      const minDim = Math.min(w, h);
      const spriteSize = Math.max(8, Math.round((this.flowSettings.spriteScalePct / 100) * minDim));

      for (let i = 0; i < this.flowSprites.length; i++) {
        const s = this.flowSprites[i];
        const fv = this.sampleFlowVector(s.x, s.y, w, h, time);
        const m = fv[2];
        const targetVx = fv[0] * (baseSpeed * 0.9) * (0.4 + m) * beatBoost;
        const targetVy = fv[1] * (baseSpeed * 0.9) * (0.4 + m) * beatBoost;
        s.vx = lerp(s.vx, targetVx, 0.06 + m * 0.10);
        s.vy = lerp(s.vy, targetVy, 0.06 + m * 0.10);
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.angle = Math.atan2(s.vy, s.vx);

        s.life += dt;
        if (s.life > s.ttl || s.x < -spriteSize || s.y < -spriteSize || s.x > w + spriteSize || s.y > h + spriteSize) {
          s.x = Math.random() * w;
          s.y = Math.random() * h;
          s.vx = s.vy = 0;
          s.life = 0;
          s.ttl = 3 + Math.random() * 6;
          s.alpha = 0.95;
        }

        // Draw sprite
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.angle);
        const hw = spriteSize / 2;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(this.albumImg, -hw, -hw, spriteSize, spriteSize);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
  }

  // Sample from combined flow: album edge vectors + procedural swirl based on settings
  private sampleFlowVector(x: number, y: number, w: number, h: number, time: number): [number, number, number] {
    let vx = 0, vy = 0, m = 0;

    if (this.flowVec && this.flowMag && this.flowW && this.flowH) {
      // Bilinear sample
      const fx = (x / w) * (this.flowW - 1);
      const fy = (y / h) * (this.flowH - 1);
      const ix = Math.floor(fx), iy = Math.floor(fy);
      const tx = fx - ix, ty = fy - iy;

      const v00 = this.getFlow(ix,     iy);
      const v10 = this.getFlow(ix + 1, iy);
      const v01 = this.getFlow(ix,     iy + 1);
      const v11 = this.getFlow(ix + 1, iy + 1);

      const mv00 = this.getMag(ix,     iy);
      const mv10 = this.getMag(ix + 1, iy);
      const mv01 = this.getMag(ix,     iy + 1);
      const mv11 = this.getMag(ix + 1, iy + 1);

      vx = lerp(lerp(v00[0], v10[0], tx), lerp(v01[0], v11[0], tx), ty);
      vy = lerp(lerp(v00[1], v10[1], tx), lerp(v01[1], v11[1], tx), ty);
      m = lerp(lerp(mv00, mv10, tx), lerp(mv01, mv11, tx), ty);
    }

    // Procedural swirl fallback/blend
    const swirlT = this.flowSettings.swirlAmount;
    if (swirlT > 0) {
      const s = this.sampleSwirl(x, y, w, h, time);
      // Blend swirl in; if no art vectors, m is small so give swirl some strength
      const blend = swirlT * (0.6 + 0.4 * (1 - m));
      vx = lerp(vx, s[0], blend);
      vy = lerp(vy, s[1], blend);
      m = Math.max(m, s[2] * swirlT);
    }

    // Normalize to avoid zero-length vectors
    const len = Math.hypot(vx, vy);
    if (len > 1e-5) { vx /= len; vy /= len; }
    return [vx, vy, Math.max(0, Math.min(1, m))];
  }

  // Swirl vector field (animated)
  private sampleSwirl(x: number, y: number, w: number, h: number, time: number): [number, number, number] {
    // Map to -1..1 space
    const nx = (x / w) * 2 - 1;
    const ny = (y / h) * 2 - 1;
    const r = Math.hypot(nx, ny) + 1e-6;
    const angle = Math.atan2(ny, nx);

    // Add gentle time-based rotation and radial flow
    const t = time * 0.2;
    const twist = Math.sin(angle * 3 + t) * 0.5 + Math.cos(r * 6 - t) * 0.5;
    const dir = angle + Math.PI / 2 + twist * 0.5;

    let vx = Math.cos(dir);
    let vy = Math.sin(dir);

    // Magnitude strongest around mid-radius
    const mag = Math.exp(-((r - 0.6) * (r - 0.6)) * 6);
    return [vx, vy, mag];
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

  private sampleImageColor(x: number, y: number, w: number, h: number) {
    if (!this.flowImageCanvas || !this.flowImageCtx) {
      const c = hexToRgb(this.palette.dominant)!;
      return c;
    }
    const fx = Math.max(0, Math.min(1, x / w));
    const fy = Math.max(0, Math.min(1, y / h));
    const px = Math.floor(fx * (this.flowImageCanvas.width - 1));
    const py = Math.floor(fy * (this.flowImageCanvas.height - 1));
    const d = this.flowImageCtx.getImageData(px, py, 1, 1).data;
    return { r: d[0], g: d[1], b: d[2] };
  }

  private pickFlowHue(i: number): number {
    if (this.flowSettings.colorMode === 'key' && this.keyHueTarget != null) return this.keyHueTarget;
    const col = this.palette.colors[i % this.palette.colors.length] || this.palette.dominant;
    return rgbToHsl(hexToRgb(col)!).h;
  }

  // Neon Bars

  private ensureNeonBars(w: number) {
    // Recompute bar count when width changes significantly
    if (this.neonBars.length && Math.abs(this.neonLastLayoutW - w) < 16) return;
    this.neonLastLayoutW = w;

    const targetBars = this.reduceMotion ? 24 : 48;
    const current = this.neonBars.length;
    if (current < targetBars) {
      for (let i = current; i < targetBars; i++) this.neonBars.push({ v: 0.1, target: 0.1, peak: 0.12 });
    } else if (current > targetBars) {
      this.neonBars.length = targetBars;
    }
  }

  private onBeat_NeonBars() {
    // Boost neon glow on each beat
    this.neonGlow = Math.min(1, this.neonGlow + 0.6);
    // Add a little hit to low/mid bars to emulate kick/snare
    const n = this.neonBars.length;
    if (!n) return;
    for (let i = 0; i < n; i++) {
      const band = i / n;
      let boost = 0;
      if (band < 0.2) boost = 0.25 + (this.features.energy ?? 0.5) * 0.2; // kick-ish
      else if (band > 0.35 && band < 0.7) boost = 0.12; // snare-ish
      if (boost) this.neonBars[i].target = Math.min(1, this.neonBars[i].target + boost);
    }
  }

  private onDownbeat_NeonBars() {
    // Launch two sweeping stingers across the bars (left->right and right->left)
    const hue = this.keyHueTarget ?? rgbToHsl(hexToRgb(this.palette.dominant)!).h;
    const now = performance.now() / 1000;
    const dur = 0.6;
    this.neonStingers.push({ start: now, dur, dir: 1, hue });
    this.neonStingers.push({ start: now + 0.05, dur, dir: -1, hue: (hue + 180) % 360 });
  }

  private drawNeonBars(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    this.ensureNeonBars(w);

    // Background: subtle dark gradient
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#07070a');
    bg.addColorStop(1, '#0e0e14');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Bottom base line
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = '#ffffff18';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h * 0.88);
    ctx.lineTo(w, h * 0.88);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const energy = this.features.energy ?? 0.5;
    const dance = this.features.danceability ?? 0.5;

    // Update bar values (pseudo-EQ)
    const n = this.neonBars.length;
    const attack = 0.18 + dance * 0.25;
    const decay = 0.08 + (1 - dance) * 0.06;
    const baseFloor = 0.08 + energy * 0.12;
    const maxAmp = 0.75 + energy * 0.25;

    for (let i = 0; i < n; i++) {
      const band = i / Math.max(1, n - 1);
      // Frequency-skewed motion: lows slower, highs quicker
      const f1 = 0.8 + band * 1.6;
      const f2 = 1.6 + band * 2.2;
      const noise =
        (Math.sin(time * f1 * 1.7 + i * 0.9) * 0.5 + 0.5) * 0.6 +
        (Math.sin(time * f2 * 2.1 + i * 1.7) * 0.5 + 0.5) * 0.4;

      let target = baseFloor + noise * maxAmp;

      // Emphasize beat for some bands
      if (this.beatActive) {
        if (band < 0.2) target += 0.25 + energy * 0.15; // kick area
        else if (band > 0.35 && band < 0.7) target += 0.1; // snare area
      }

      // Clamp
      target = Math.max(0.02, Math.min(1, target));
      const b = this.neonBars[i];
      b.target = target;

      // Smoothing with different rise/fall
      if (target > b.v) b.v = lerp(b.v, target, attack);
      else b.v = lerp(b.v, target, decay);

      // Peak hold with gravity
      b.peak = Math.max(b.peak - dt * (0.25 + (1 - dance) * 0.6), b.v);
    }

    // Bars geometry
    const gap = Math.max(1, Math.floor(w / n * 0.18));
    const bw = Math.max(2, Math.floor((w - gap * (n + 1)) / Math.max(1, n)));
    const baseY = h * 0.88;
    const maxH = h * 0.72;

    // Neon glow intensity decays
    this.neonGlow = Math.max(0, this.neonGlow - dt * 2.5);
    const glowPulse = 0.25 + this.neonGlow * 0.9;

    // Draw stingers (downbeat sweeps)
    this.drawNeonStingers(ctx, w, h, time);

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 0; i < n; i++) {
      const b = this.neonBars[i];
      const x = gap + i * (bw + gap);
      const bh = b.v * maxH;
      const y = baseY - bh;

      // Bar color gradient
      const pal = this.palette.colors;
      const col = pal[i % pal.length] || this.palette.dominant;
      const c = hexToRgb(col)!;
      const hue = this.keyHueTarget ?? rgbToHsl(c).h;

      // Vertical neon gradient
      const g = ctx.createLinearGradient(0, y, 0, baseY);
      const topCol = `hsla(${hue}, 92%, ${70 + (this.features.valence ?? 0.5) * 10}%, 1)`;
      const midCol = `hsla(${(hue + 12) % 360}, 88%, 55%, 0.95)`;
      const botCol = `hsla(${(hue + 24) % 360}, 86%, 40%, 0.9)`;
      g.addColorStop(0, topCol);
      g.addColorStop(0.6, midCol);
      g.addColorStop(1, botCol);

      // Glow
      ctx.shadowBlur = 18 + glowPulse * 22;
      ctx.shadowColor = `hsla(${hue}, 100%, 60%, ${0.45 + glowPulse * 0.3})`;
      ctx.fillStyle = g;

      // Rounded bar
      const r = Math.min(8, bw * 0.4);
      roundRect(ctx, x, y, bw, Math.max(2, bh), r);
      ctx.fill();

      // Peak cap
      const py = baseY - Math.max(2, b.peak * maxH);
      ctx.shadowBlur = 12 + glowPulse * 14;
      ctx.shadowColor = `hsla(${(hue + 30) % 360}, 100%, 65%, 0.6)`;
      ctx.fillStyle = `hsla(${(hue + 20) % 360}, 100%, 85%, ${0.9})`;
      roundRect(ctx, x, Math.min(py, y - 2), bw, 3, 2);
      ctx.fill();

      // Optional inner glow line for extra neon
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 0.25 + glowPulse * 0.2;
      ctx.strokeStyle = `hsla(${(hue + 180) % 360}, 90%, 80%, 0.9)`;
      ctx.lineWidth = Math.max(1, bw * 0.15);
      ctx.beginPath();
      ctx.moveTo(x + bw / 2, baseY - 2);
      ctx.lineTo(x + bw / 2, y + 4);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Subtle scanlines overlay for retro vibe
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = '#ffffff';
    for (let yy = 0; yy < h; yy += 4) {
      ctx.fillRect(0, yy, w, 1);
    }
    ctx.globalAlpha = 1;
  }

  private drawNeonStingers(ctx: CanvasRenderingContext2D, w: number, h: number, time: number) {
    if (!this.neonStingers.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const now = performance.now() / 1000;
    for (let i = this.neonStingers.length - 1; i >= 0; i--) {
      const s = this.neonStingers[i];
      const t = (now - s.start) / s.dur;
      if (t >= 1) { this.neonStingers.splice(i, 1); continue; }
      const pos = (s.dir === 1 ? t : 1 - t) * w;
      const wpx = Math.max(10, Math.min(40, w * 0.04));
      const grad = ctx.createLinearGradient(pos - wpx, 0, pos + wpx, 0);
      grad.addColorStop(0, `hsla(${s.hue}, 100%, 50%, 0)`);
      grad.addColorStop(0.5, `hsla(${s.hue}, 100%, 70%, ${0.35 * (1 - t)})`);
      grad.addColorStop(1, `hsla(${s.hue}, 100%, 50%, 0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(pos - wpx, 0, wpx * 2, h);
    }
    ctx.restore();
  }

  // Stained Glass Voronoi scene

  private ensureStained(w: number, h: number) {
    if (this.sgCells.length && this.sgLastW === w && this.sgLastH === h) return;
    // Build sites
    const N = this.reduceMotion ? 36 : 72;
    const margin = Math.min(w, h) * 0.06;
    this.sgSites = [];
    for (let i = 0; i < N; i++) {
      const x = margin + Math.random() * (w - margin * 2);
      const y = margin + Math.random() * (h - margin * 2);
      const c = this.sampleImageColor(x, y, w, h);
      this.sgSites.push({ x, y, color: c });
    }
    this.sgCells = this.computeVoronoi(this.sgSites, w, h);
    this.sgLastW = w; this.sgLastH = h;
  }

  private reseedStained(w: number, h: number) {
    this.sgLastW = 0; this.sgLastH = 0;
    this.ensureStained(w, h);
  }

  private onBeat_Stained() {
    // Edge pulse on every beat
    this.sgPulse = Math.min(1, this.sgPulse + 0.5);
  }

  private onDownbeat_Stained() {
    // Extra pulse
    this.sgPulse = 1;
    // Sparkles along random edges
    this.spawnSparks(14 + Math.round((this.features.energy ?? 0.5) * 18));
    // Reseed every couple of downbeats for variety
    this.sgDownbeatCounter++;
    if (this.sgDownbeatCounter % 2 === 0) {
      this.reseedStained(this.bufferA.width, this.bufferA.height);
    }
  }

  private drawStainedGlassVoronoi(ctx: CanvasRenderingContext2D, w: number, h: number, time: number, dt: number) {
    this.ensureStained(w, h);

    // Background: vignetted dark base
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.55, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    bg.addColorStop(0, '#07080b');
    bg.addColorStop(1, '#0a0a10');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Decay pulse and sparkles
    this.sgPulse = Math.max(0, this.sgPulse - dt * 2.0);

    const keyHue = this.keyHueTarget ?? rgbToHsl(hexToRgb(this.palette.dominant)!).h;
    const keyAmount = this.keyColorEnabled ? 0.25 : 0.0;
    const valence = this.features.valence ?? 0.5;
    const energy = this.features.energy ?? 0.5;

    // Draw cells
    ctx.save();
    for (const cell of this.sgCells) {
      if (cell.pts.length < 3) continue;

      // Tint towards key hue for cohesion
      let baseRGB = tintRgbTowardHue(cell.color, keyHue, keyAmount);

      // Build path
      ctx.beginPath();
      ctx.moveTo(cell.pts[0].x, cell.pts[0].y);
      for (let i = 1; i < cell.pts.length; i++) ctx.lineTo(cell.pts[i].x, cell.pts[i].y);
      ctx.closePath();

      // Fill: beveled gradient based on centroid and a pseudo-light direction
      const lightDir = { x: Math.cos(time * 0.2) * 0.6 + 0.4, y: Math.sin(time * 0.18) * 0.6 + 0.4 };
      const g = ctx.createRadialGradient(
        cell.cx + (lightDir.x - 0.5) * cell.radius * 0.8,
        cell.cy + (lightDir.y - 0.5) * cell.radius * 0.8,
        1,
        cell.cx, cell.cy, Math.max(8, cell.radius)
      );
      const hsl = rgbToHsl(baseRGB);
      const l1 = Math.min(0.9, hsl.l + 0.25 + valence * 0.1);
      const l2 = Math.max(0.1, hsl.l - 0.15 + (1 - valence) * 0.05);
      const cTop = hslToRgb(hsl.h, Math.min(1, hsl.s + 0.1), l1);
      const cBot = hslToRgb(hsl.h, hsl.s, l2);
      g.addColorStop(0, `rgba(${cTop.r},${cTop.g},${cTop.b},0.95)`);
      g.addColorStop(1, `rgba(${cBot.r},${cBot.g},${cBot.b},0.95)`);

      ctx.fillStyle = g;
      ctx.shadowColor = `rgba(${cTop.r},${cTop.g},${cTop.b},${0.25 + this.sgPulse * 0.4})`;
      ctx.shadowBlur = 10 + (18 + energy * 24) * (0.2 + this.sgPulse * 0.8);
      ctx.fill();

      // Edge bevel stroke
      ctx.shadowBlur = 0;
      const edgeHue = (keyHue + 20) % 360;
      ctx.lineWidth = Math.max(1.2, Math.min(4, Math.sqrt(cell.radius) * 0.6));
      ctx.strokeStyle = `hsla(${edgeHue}, 90%, ${70 + valence * 10}%, ${0.35 + this.sgPulse * 0.35})`;
      ctx.stroke();

      // Inner highlight stroke (adds glass glint)
      ctx.globalAlpha = 0.18 + this.sgPulse * 0.12;
      ctx.lineWidth = Math.max(0.8, ctx.lineWidth * 0.6);
      ctx.strokeStyle = `rgba(255,255,255,0.6)`;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // Sparkles
    this.drawSparks(ctx, w, h, dt);
  }

  private spawnSparks(count: number) {
    if (!this.sgCells.length) return;
    const hue = this.keyHueTarget ?? rgbToHsl(hexToRgb(this.palette.dominant)!).h;
    for (let i = 0; i < count; i++) {
      const cell = this.sgCells[(Math.random() * this.sgCells.length) | 0];
      if (cell.pts.length < 2) continue;
      const a = cell.pts[(Math.random() * cell.pts.length) | 0];
      const b = cell.pts[(Math.random() * cell.pts.length) | 0];
      const t = Math.random();
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      this.sgSparkles.push({
        x, y,
        life: 0,
        max: 0.5 + Math.random() * 0.7,
        hue: (hue + (Math.random() - 0.5) * 40) % 360,
        size: 1.5 + Math.random() * 2.5
      });
    }
  }

  private drawSparks(ctx: CanvasRenderingContext2D, w: number, h: number, dt: number) {
    if (!this.sgSparkles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = this.sgSparkles.length - 1; i >= 0; i--) {
      const s = this.sgSparkles[i];
      s.life += dt;
      if (s.life >= s.max) { this.sgSparkles.splice(i, 1); continue; }
      const t = s.life / s.max;
      const a = 1 - t;
      ctx.shadowBlur = 12;
      ctx.shadowColor = `hsla(${s.hue}, 100%, 70%, ${a})`;
      ctx.fillStyle = `hsla(${s.hue}, 100%, 70%, ${a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.size * (1 + 0.8 * (1 - t)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.shadowBlur = 0;
  }

  private computeVoronoi(sites: SGSite[], w: number, h: number): SGCell[] {
    // Sutherland–Hodgman half-plane clipping for each site
    const bbox = [
      { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }
    ];
    const out: SGCell[] = [];

    for (let i = 0; i < sites.length; i++) {
      const A = sites[i];
      let poly = bbox.slice();

      for (let j = 0; j < sites.length; j++) {
        if (i === j) continue;
        const B = sites[j];
        // Half-plane: points closer to A than B
        const sx = B.x - A.x;
        const sy = B.y - A.y;
        const mx = (A.x + B.x) * 0.5;
        const my = (A.y + B.y) * 0.5;

        poly = clipPolygonHalfPlane(poly, sx, sy, mx, my);
        if (poly.length === 0) break;
      }

      if (poly.length >= 3) {
        // Centroid and "radius" for gradients
        let area = 0, cx = 0, cy = 0;
        for (let k = 0; k < poly.length; k++) {
          const p0 = poly[k];
          const p1 = poly[(k + 1) % poly.length];
          const a = p0.x * p1.y - p1.x * p0.y;
          area += a;
          cx += (p0.x + p1.x) * a;
          cy += (p0.y + p1.y) * a;
        }
        area *= 0.5;
        if (Math.abs(area) < 1e-5) continue;
        cx /= 6 * area;
        cy /= 6 * area;

        // Approx radius as max distance to vertices
        let r = 0;
        for (const p of poly) r = Math.max(r, Math.hypot(p.x - cx, p.y - cy));
        out.push({ pts: poly, cx, cy, color: A.color, radius: r });
      }
    }

    return out;
  }

  // Lyrics: fetch + timing + UI helpers

  private async refetchLyricsForCurrentTrack() {
    if (!this.lastTrackId) return;
    try {
      const pb = await (this.api as any).getCurrentPlaybackCached?.().catch(() => null);
      const tr = (pb?.item && (pb.item as any).type === 'track') ? pb!.item as SpotifyApi.TrackObjectFull : null;
      if (tr) return this.fetchLyricsLRCLIB(tr);
    } catch {}
  }

  private async fetchLyricsLRCLIB(track: SpotifyApi.TrackObjectFull) {
    try {
      const trackName = track.name || '';
      const artistName = (track.artists || []).map(a => a.name).join(', ');
      const albumName = track.album?.name || '';
      const durationSec = Math.max(1, Math.round((track.duration_ms || 0) / 1000));

      const params = new URLSearchParams();
      if (trackName) params.set('track_name', trackName);
      if (artistName) params.set('artist_name', artistName);
      if (albumName) params.set('album_name', albumName);
      if (durationSec) params.set('duration', String(durationSec));

      const url = `https://lrclib.net/api/search?${params.toString()}`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`LRCLIB ${res.status}`);
      const data = await res.json();

      let synced = '';
      let plain = '';
      if (Array.isArray(data) && data.length) {
        const best = data.find((d: any) => d?.syncedLyrics) ?? data[0];
        synced = best?.syncedLyrics || '';
        plain = best?.plainLyrics || '';
      }

      let state: LyricsState | null = null;
      if (synced && typeof synced === 'string') {
        const lines = parseLRC(synced);
        state = { provider: 'lrclib', trackId: track.id || null, synced: true, lines, updatedAt: Date.now() };
      } else if (plain && typeof plain === 'string') {
        const lines = parsePlainLyrics(plain, durationSec);
        state = { provider: 'lrclib', trackId: track.id || null, synced: false, lines, updatedAt: Date.now() };
      }

      this.lyrics = state;
      this.currentLyricIndex = -1; // force refresh
    } catch {
      // Fail silently; keep fallback text
      this.lyrics = null;
      this.currentLyricIndex = -1;
    }
  }

  private updateCurrentLyricLine() {
    if (!this.lyrics || !this.lyrics.lines.length) return;
    const t = this.playbackMs / 1000;
    const lines = this.lyrics.lines;

    // Binary search current line
    let lo = 0, hi = lines.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (t < lines[mid].start) {
        hi = mid - 1;
      } else if (t >= lines[mid].end) {
        lo = mid + 1;
      } else {
        idx = mid; break;
      }
    }

    if (idx !== -1 && idx !== this.currentLyricIndex) {
      this.currentLyricIndex = idx;
      const text = lines[idx].text || '';
      if (text.trim()) this.setLyricText(text);
    }
  }

  private startPlaybackPolling() {
    // Poll playback every 1000ms to sync lyrics timing across scenes (overlay etc)
    const tick = async () => {
      try {
        // Optional cached method
        const pb = await (this.api as any).getCurrentPlaybackCached?.();
        if (pb) {
          this.playbackIsPlaying = !!pb.is_playing;
          const ms = typeof pb.progress_ms === 'number' ? pb.progress_ms : this.playbackMs;

          // If track changed outside our onTrack flow, adopt it
          const tr = (pb.item && (pb.item as any).type === 'track') ? pb.item as SpotifyApi.TrackObjectFull : null;
          if (tr && tr.id && tr.id !== this.lastTrackId) {
            this.onTrack(tr).catch(() => {});
          }

          // Keep local progress roughly in sync; allow small drift to animate smoothly
          const drift = Math.abs(ms - this.playbackMs);
          if (drift > 750) this.playbackMs = ms;
        }
      } catch {
        // Ignore polling errors; will try again next tick
      }
    };

    if (this.pbPollTimer) clearInterval(this.pbPollTimer);
    this.pbPollTimer = setInterval(tick, 1000);
    tick().catch(() => {});
  }

  // Lyrics overlay renderer

  private drawLyricsOverlay(ctx: CanvasRenderingContext2D, W: number, H: number) {
    if (!this.lyricsOverlayEnabled) return;
    if (!this.lyrics || !this.lyrics.lines.length || this.currentLyricIndex < 0) return;

    const line = this.lyrics.lines[this.currentLyricIndex];
    const text = (line?.text || '').trim();
    if (!text) return;

    const t = this.playbackMs / 1000;
    const dur = Math.max(0.1, (line.end - line.start) || 0.1);
    const progress = Math.max(0, Math.min(1, (t - line.start) / dur));

    // Style
    const minDim = Math.min(W, H);
    const fontPx = Math.round(minDim * 0.045 * this.lyricsOverlayScale);
    const margin = Math.round(minDim * 0.05);
    const padX = Math.round(fontPx * 0.6);
    const padY = Math.round(fontPx * 0.45);

    ctx.save();

    // Measure text
    const fontFace = `700 ${fontPx}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    ctx.font = fontFace;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    const metrics = ctx.measureText(text);
    const textW = metrics.width;
    const boxW = Math.min(W - margin * 2, Math.ceil(textW + padX * 2));
    const boxH = Math.ceil(fontPx + padY * 2);

    const cx = W / 2;
    const by = H - margin; // bottom baseline position
    const bx = cx - boxW / 2;
    const topY = by - boxH + Math.round(padY * 0.35); // adjust so text baseline sits nicely

    // Background panel (for readability)
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = '#000';
    roundRect(ctx, bx, topY, boxW, boxH, Math.min(16, Math.round(fontPx * 0.35)));
    ctx.fill();
    ctx.globalAlpha = 1;

    // Base (unfilled) text
    ctx.lineWidth = Math.max(2, Math.round(fontPx * 0.08));
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.shadowColor = 'transparent';
    ctx.strokeText(text, cx, by);
    ctx.fillText(text, cx, by);

    // Progress highlight
    const baseHue =
      this.keyHueTarget != null && this.keyColorEnabled
        ? this.keyHueTarget
        : rgbToHsl(hexToRgb(this.palette.dominant)!).h;
    const hi = `hsla(${baseHue}, 100%, ${60 + (this.features.valence ?? 0.5) * 15}%, 1)`;
    const hi2 = `hsla(${(baseHue + 20) % 360}, 100%, 55%, 1)`;
    const grad = ctx.createLinearGradient(cx - textW / 2, 0, cx + textW / 2, 0);
    grad.addColorStop(0, hi);
    grad.addColorStop(1, hi2);

    // Clip to progress width relative to text
    const progW = textW * progress;
    ctx.save();
    ctx.beginPath();
    ctx.rect(cx - textW / 2, by - fontPx, Math.max(0, progW), fontPx * 1.2);
    ctx.clip();

    ctx.fillStyle = grad;
    ctx.shadowColor = hi;
    ctx.shadowBlur = Math.max(6, Math.round(fontPx * 0.25));
    ctx.fillText(text, cx, by);
    ctx.restore();

    // Underline progress bar
    const barY = by + Math.round(fontPx * 0.18);
    const barR = Math.round(Math.min(10, fontPx * 0.18));
    const barPad = Math.round(padX * 0.4);
    const barW = boxW - barPad * 2;
    const filled = Math.round(barW * progress);

    // Track
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#fff';
    roundRect(ctx, bx + barPad, barY, barW, Math.max(2, Math.round(fontPx * 0.08)), barR);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Fill
    const barGrad = ctx.createLinearGradient(bx + barPad, 0, bx + barPad + barW, 0);
    barGrad.addColorStop(0, hi);
    barGrad.addColorStop(1, hi2);
    ctx.fillStyle = barGrad;
    roundRect(ctx, bx + barPad, barY, Math.max(2, filled), Math.max(2, Math.round(fontPx * 0.08)), barR);
    ctx.fill();

    ctx.restore();
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
      panel.style.top = id === 'quality' ? '56px' : id === 'access' ? '128px' : '208px';
      panel.style.minWidth = '260px';
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
function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
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
  if (!A or !B) return a;
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

// Polygon clip against half-plane: keep points P s.t. dot(P - M, S) <= 0
function clipPolygonHalfPlane(poly: Array<{ x: number; y: number }>, sx: number, sy: number, mx: number, my: number) {
  if (poly.length === 0) return poly;
  const out: Array<{ x: number; y: number }> = [];
  const f = (px: number, py: number) => (px - mx) * sx + (py - my) * sy; // <= 0 is inside

  for (let i = 0; i < poly.length; i++) {
    const A = poly[i];
    const B = poly[(i + 1) % poly.length];
    const fa = f(A.x, A.y);
    const fb = f(B.x, B.y);
    const ain = fa <= 0;
    const bin = fb <= 0;

    if (ain && bin) {
      // in -> in
      out.push({ x: B.x, y: B.y });
    } else if (ain && !bin) {
      // in -> out : add intersection
      const t = fa / (fa - fb);
      out.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
    } else if (!ain && bin) {
      // out -> in : add intersection + B
      const t = fa / (fa - fb);
      out.push({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
      out.push({ x: B.x, y: B.y });
    } else {
      // out -> out : nothing
    }
  }
  return out;
}

// Tint an RGB color toward a target hue by amount 0..1
function tintRgbTowardHue(c: { r: number; g: number; b: number }, hue: number, amt: number) {
  if (amt <= 0) return c;
  const hsl = rgbToHsl(c);
  const tgt = hslToRgb(hue, Math.max(0.45, hsl.s), hsl.l);
  return {
    r: Math.round(lerp(c.r, tgt.r, amt)),
    g: Math.round(lerp(c.g, tgt.g, amt)),
    b: Math.round(lerp(c.b, tgt.b, amt))
  };
}