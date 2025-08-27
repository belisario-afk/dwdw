// Updated to use loadImageSafe + optional proxy, and with event debug logging.
import { VisualDirector, type SceneDef } from '../controllers/director';
import { loadImageSafe } from '../utils/safe-image';
import { getProxiedUrl } from '../utils/img-proxy';

export type SongRequestPayload = {
  id?: string;
  userName?: string;
  songTitle?: string;
  pfpUrl?: string;
  albumArtUrl?: string;
  color?: string;
  ttlSec?: number;
  // Common alternates we normalize:
  name?: string; displayName?: string; username?: string; user?: string; sender?: string;
  avatar?: string; profileImage?: string; photo?: string; picture?: string; pfp?: string;
  title?: string; trackTitle?: string; track?: string; song?: string;
  artist?: string; artist_name?: string; artistName?: string;
  albumArt?: string; cover?: string; artwork?: string; thumbnail?: string; image?: string; img?: string; thumbnail_url?: string;
  trackId?: string; track_id?: string; id_str?: string;
  uri?: string; trackUri?: string; trackURI?: string; spotifyUri?: string; spotify_uri?: string;
  url?: string; track_url?: string;
};

type Floater = {
  id: string;
  name: string;
  song: string;
  pfp?: HTMLImageElement | null;
  album?: HTMLImageElement | null;
  color: string;
  x: number; y: number;
  vx: number; vy: number;
  scale: number;
  alpha: number;
  life: number;
  ttl: number;
  pulse: number;
  bornAt: number;
  wantRemove: boolean;
  seedX: number; seedY: number;
  phaseX: number; phaseY: number;
  oscSpeedX: number; oscSpeedY: number;
  ampX: number; ampY: number;
  awaitingMeta?: boolean;
};

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function rand(min: number, max: number) { return min + Math.random() * (max - min); }

function normalizePayload(raw: any): { base: SongRequestPayload; trackRef?: string } {
  const base: SongRequestPayload = { ...raw };
  const userName = raw.userName ?? raw.username ?? raw.displayName ?? raw.name ?? raw.user ?? raw.sender;
  if (userName) base.userName = String(userName);
  const pfpUrl = raw.pfpUrl ?? raw.avatar ?? raw.profileImage ?? raw.photo ?? raw.picture ?? raw.pfp;
  if (pfpUrl) base.pfpUrl = String(pfpUrl);
  const albumArtUrl = raw.albumArtUrl ?? raw.albumArt ?? raw.cover ?? raw.artwork ?? raw.thumbnail ?? raw.image ?? raw.img ?? raw.thumbnail_url;
  if (albumArtUrl) base.albumArtUrl = String(albumArtUrl);
  const songTitle =
    raw.songTitle ?? raw.title ?? raw.trackTitle ?? raw.song ??
    (raw.artist || raw.artist_name || raw.artistName ? `${raw.artist || raw.artist_name || raw.artistName} — ${raw.track || ''}`.trim() : raw.track);
  if (songTitle) base.songTitle = String(songTitle);
  const trackRef =
    raw.uri ?? raw.trackUri ?? raw.trackURI ?? raw.spotifyUri ?? raw.spotify_uri ??
    raw.track_url ?? raw.url ?? raw.trackId ?? raw.track_id ?? raw.id_str;
  return { base, trackRef: trackRef ? String(trackRef) : undefined };
}

function parseSpotifyTrackId(ref: string | undefined): string | null {
  if (!ref) return null;
  const m1 = /^spotify:track:([A-Za-z0-9]+)$/.exec(ref); if (m1) return m1[1];
  const m2 = /open\.spotify\.com\/track\/([A-Za-z0-9]+)/.exec(ref); if (m2) return m2[1];
  if (/^[A-Za-z0-9]{8,}$/.test(ref)) return ref;
  return null;
}

async function fromSpotifyOEmbed(trackId: string): Promise<{ title?: string; thumb?: string } | null> {
  try {
    const url = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/track/${trackId}`)}`;
    const r = await fetch(url, { mode: 'cors' });
    if (!r.ok) return null;
    const j = await r.json();
    return { title: j?.title, thumb: j?.thumbnail_url };
  } catch {
    return null;
  }
}

function makeRequestsScene(): SceneDef {
  const floaters: Floater[] = [];
  const byId = new Map<string, Floater>();
  let lastSizeW = 0, lastSizeH = 0;
  let beatPulse = 0;

  // Debug switch: enable with localStorage.setItem('songreq-debug','1')
  const DEBUG = (() => { try { return localStorage.getItem('songreq-debug') === '1'; } catch { return false; } })();

  // UI helpers
  let keysHooked = false;
  let demoTimer: any = null;
  let demoOn = false;

  function ensureKeys(_director: VisualDirector) {
    if (keysHooked) return;
    keysHooked = true;
    document.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R') spawnSampleOnce();
      if (e.key === 'd' || e.key === 'D') toggleDemo();
    });
  }
  function toggleDemo() {
    demoOn = !demoOn;
    try { localStorage.setItem('requests-demo', demoOn ? '1' : '0'); } catch {}
    if (demoOn) { if (!demoTimer) demoTimer = setInterval(() => spawnSampleOnce(), 2800); }
    else { if (demoTimer) { clearInterval(demoTimer); demoTimer = null; } }
  }
  function spawnSampleOnce() {
    const names = ['Alex','Riley','Sam','Jordan','Casey','Taylor'];
    const songs = ['Justice — D.A.N.C.E','Porter Robinson — Language','Pegboard Nerds — Hero','ODESZA — A Moment Apart','Daft Punk — One More Time','Madeon — The Prince'];
    const name = names[(Math.random()*names.length)|0];
    const song = songs[(Math.random()*songs.length)|0];
    const pfp = 'https://i.pravatar.cc/128?img=' + (((Math.random()*70)|0)+1);
    const alb = 'https://picsum.photos/seed/' + ((Math.random()*100000)|0) + '/256';
    emitSongRequest({ userName: name, songTitle: song, pfpUrl: pfp, albumArtUrl: alb, color: sampleColor() });
  }
  function sampleColor() {
    const arr = ['#22cc88','#cc2288','#22aacc','#ffaa22','#8a2be2','#00d4ff'];
    return arr[(Math.random()*arr.length)|0];
  }

  async function addRequest(rawReq: any, director: VisualDirector) {
    const { base, trackRef } = normalizePayload(rawReq);
    const id = String(base.id || `${base.userName || 'Guest'}:${base.songTitle || trackRef || ''}:${Date.now()}:${Math.random()}`);
    if (byId.has(id)) {
      const existing = byId.get(id)!;
      existing.life = 0;
      existing.ttl = Math.max(existing.ttl, (base.ttlSec ?? 14));
      return;
    }

    const W = director.getCanvas().width;
    const H = director.getCanvas().height;

    const flo: Floater = {
      id,
      name: base.userName || 'Guest',
      song: base.songTitle || (trackRef ? 'Loading…' : ''),
      pfp: null,
      album: null,
      color: base.color || (director as any).palette?.dominant || '#22cc88',
      x: rand(W * 0.15, W * 0.85),
      y: rand(H * 0.2, H * 0.75),
      vx: 0, vy: 0,
      scale: 1,
      alpha: 0,
      life: 0,
      ttl: Math.max(6, Math.min(60, base.ttlSec ?? 14)),
      pulse: 0,
      bornAt: performance.now() / 1000,
      wantRemove: false,
      seedX: Math.random() * 1000, seedY: Math.random() * 1000,
      phaseX: Math.random() * Math.PI * 2, phaseY: Math.random() * Math.PI * 2,
      oscSpeedX: 0.6 + Math.random() * 0.6, oscSpeedY: 0.5 + Math.random() * 0.7,
      ampX: 26 + Math.random() * 18, ampY: 22 + Math.random() * 16,
      awaitingMeta: false,
    };

    // Load images via proxy (if configured) and safe loader
    if (base.pfpUrl) {
      const url = getProxiedUrl(base.pfpUrl);
      loadImageSafe(url).then(img => { if (img) flo.pfp = img; }).catch(() => {});
    }
    if (base.albumArtUrl) {
      const url = getProxiedUrl(base.albumArtUrl);
      loadImageSafe(url).then(img => { if (img) flo.album = img; }).catch(() => {});
    }

    // Resolve missing title/cover via Spotify oEmbed if we have a track ID/URI/URL
    const tid = parseSpotifyTrackId(trackRef || '');
    if ((!base.songTitle || !base.albumArtUrl) && tid) {
      flo.awaitingMeta = true;
      fromSpotifyOEmbed(tid).then(async (meta) => {
        flo.awaitingMeta = false;
        if (!meta) return;
        if (!base.songTitle && meta.title) flo.song = String(meta.title);
        if (!base.albumArtUrl && meta.thumb) {
          try {
            const url = getProxiedUrl(meta.thumb);
            const img = await loadImageSafe(url);
            if (img) flo.album = img;
          } catch {}
        }
      }).catch(() => { flo.awaitingMeta = false; });
    }

    // Evict oldest if over capacity
    const maxFloaters = 24;
    if (floaters.length >= maxFloaters) {
      let oldestIdx = 0, oldestBorn = Infinity;
      for (let i = 0; i < floaters.length; i++) if (floaters[i].bornAt < oldestBorn) { oldestBorn = floaters[i].bornAt; oldestIdx = i; }
      const dead = floaters.splice(oldestIdx, 1)[0]; byId.delete(dead.id);
    }

    floaters.push(flo);
    byId.set(id, flo);
  }

  const onSongReq = (ev: Event, director?: VisualDirector) => {
    try {
      const ce = ev as CustomEvent<any>;
      const payload = ce.detail ?? null;
      if (DEBUG) console.log('[Requests Floaters] event', ev.type, payload);
      if (!payload || !director) return;
      addRequest(payload, director);
    } catch (e) {
      if (DEBUG) console.warn('[Requests Floaters] onSongReq error', e);
    }
  };

  // Ensure a global emitter exists even if the bridge wasn’t loaded
  function ensureGlobalEmitter() {
    if (!(window as any).__emitSongRequest) {
      (window as any).__emitSongRequest = (p: SongRequestPayload) => {
        window.dispatchEvent(new CustomEvent<any>('songrequest', { detail: p }));
      };
    }
  }
  function emitSongRequest(p: SongRequestPayload) {
    ensureGlobalEmitter();
    (window as any).__emitSongRequest(p);
  }

  const scene: SceneDef = {
    name: 'Requests Floaters',
    draw(ctx, w, h, time, dt, director) {
      // One-time setup
      if (!(window as any).__songReqHooked) {
        (window as any).__songReqHooked = true;
        ensureGlobalEmitter();
        const events = ['songrequest','tiktok:songrequest','song-request','songQueued','queue:add','queue:add:request'];
        for (const ev of events) window.addEventListener(ev, (e) => onSongReq(e, director) as any);
        ensureKeys(director);

        // Optional auto-demo via URL or localStorage
        try {
          const url = new URL(window.location.href);
          const demoParam = url.searchParams.get('demo');
          const saved = localStorage.getItem('requests-demo');
          if (demoParam === '1' || saved === '1') {
            demoOn = true;
            if (!demoTimer) demoTimer = setInterval(() => spawnSampleOnce(), 2800);
          }
        } catch {}
      }

      if (w !== lastSizeW || h !== lastSizeH) {
        lastSizeW = w; lastSizeH = h;
        for (const f of floaters) { f.x = clamp(f.x, 40, w - 40); f.y = clamp(f.y, 40, h - 40); }
      }

      // Background
      const pal = (director as any).palette;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      const c0 = pal?.colors?.[0] || pal?.dominant || '#223';
      const c1 = pal?.colors?.[1] || pal?.secondary || '#332';
      grad.addColorStop(0, c0); grad.addColorStop(1, c1);
      ctx.fillStyle = grad; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.25;
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.55, Math.min(w, h) * 0.4, w * 0.5, h * 0.5, Math.max(w, h) * 0.9);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      const energy = (director as any).features?.energy ?? 0.5;
      const dance = (director as any).features?.danceability ?? 0.5;
      beatPulse = Math.max(0, beatPulse - dt * 1.8);

      // Draw hint if empty
      if (!floaters.length) {
        drawNoRequestsHint(ctx, w, h);
      }

      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];

        f.life += dt;
        const appear = Math.min(1, f.life / 0.4);
        const vanish = Math.min(1, Math.max(0, (f.ttl - f.life) / 0.8));
        f.alpha = appear * vanish;
        if (f.life >= f.ttl || f.wantRemove) { byId.delete(f.id); floaters.splice(i, 1); continue; }

        // Smooth motion
        const baseAmpScale = 0.8 + energy * 1.2 + beatPulse * 0.6;
        const spdScale = 0.7 + dance * 0.8;
        f.phaseX += dt * f.oscSpeedX * spdScale;
        f.phaseY += dt * f.oscSpeedY * spdScale;
        const desiredVx = Math.sin(f.phaseX + f.seedX) * f.ampX * baseAmpScale;
        const desiredVy = Math.cos(f.phaseY + f.seedY) * f.ampY * baseAmpScale;
        f.vx = lerp(f.vx, desiredVx, 0.12);
        f.vy = lerp(f.vy, desiredVy, 0.12);

        const margin = 30, cx = w / 2, cy = h / 2;
        let fx = 0, fy = 0;
        if (f.x < margin) fx += (margin - f.x) * 1.2;
        if (f.x > w - margin) fx -= (f.x - (w - margin)) * 1.2;
        if (f.y < margin) fy += (margin - f.y) * 1.2;
        if (f.y > h - margin) fy -= (f.y - (h - margin)) * 1.2;
        fx += (cx - f.x) * 0.02; fy += (cy - f.y) * 0.02;

        f.vx += fx * dt; f.vy += fy * dt;
        f.x += f.vx * dt; f.y += f.vy * dt;

        f.pulse = Math.max(0, f.pulse - dt * 2.0);
        const scalePulse = 1 + f.pulse * 0.10 + beatPulse * 0.04;
        f.scale = lerp(f.scale, scalePulse, 0.18);

        const baseDim = Math.max(80, Math.min(180, Math.min(w, h) * 0.18));
        const boxW = baseDim * 1.45;
        const boxH = baseDim * 0.9;

        ctx.save();
        ctx.translate(f.x, f.y);
        ctx.scale(f.scale, f.scale);
        ctx.globalAlpha = f.alpha;

        // Panel
        ctx.shadowBlur = 18 + 20 * (beatPulse + f.pulse) * 0.5;
        ctx.shadowColor = f.color;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        roundRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 14);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Album square
        const square = baseDim * 0.66;
        const leftX = -boxW / 2 + 14;
        const topY = -square / 2;
        if (f.album) ctx.drawImage(f.album, leftX, topY, square, square);
        else { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(leftX, topY, square, square); }

        // PFP circle
        const pfpR = square * 0.28;
        const pfpCx = leftX + square - pfpR * 0.8;
        const pfpCy = topY + square - pfpR * 0.8;
        ctx.save();
        ctx.beginPath(); ctx.arc(pfpCx, pfpCy, pfpR, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
        if (f.pfp) ctx.drawImage(f.pfp, pfpCx - pfpR, pfpCy - pfpR, pfpR * 2, pfpR * 2);
        else { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(pfpCx - pfpR, pfpCy - pfpR, pfpR * 2, pfpR * 2); }
        ctx.restore();

        // Text block
        const txtX = leftX + square + 12;
        const txtW = boxW - (square + 14 + 12);
        const name = f.name || 'Guest';
        const song = f.song || (f.awaitingMeta ? 'Loading…' : '');

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(square * 0.22)}px var(--lyrics-font, system-ui), system-ui, sans-serif`;
        const nameY = -square * 0.15;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(name, txtX, nameY);
        ctx.fillText(name, txtX, nameY);

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = `500 ${Math.round(square * 0.18)}px var(--lyrics-font, system-ui), system-ui, sans-serif`;
        const songY = nameY + square * 0.35;
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        const songLine = truncateToWidth(ctx, song, txtW);
        ctx.strokeText(songLine, txtX, songY);
        ctx.fillText(songLine, txtX, songY);

        // Accent underline
        const underY = songY + square * 0.12;
        const progressW = (0.35 + 0.65 * (beatPulse + f.pulse));
        const underW = Math.max(24, Math.min(txtW, txtW * progressW));
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = hexToRgba(f.color, 0.9);
        roundRect(ctx, txtX, underY, underW, Math.max(3, Math.round(square * 0.04)), 4);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.restore();
      }
    },
    onBeat(_director) {
      beatPulse = Math.min(1, beatPulse + 0.6);
      for (let i = 0; i < Math.min(6, floaters.length); i++) {
        const f = floaters[(Math.random() * floaters.length) | 0];
        f.vx += (Math.random() - 0.5) * 40;
        f.vy -= 20 + Math.random() * 30;
        f.pulse = Math.min(1, f.pulse + 1);
      }
    },
    onDownbeat() {
      beatPulse = 1;
      for (const f of floaters) f.pulse = Math.min(1, f.pulse + 0.5);
    }
  };

  return scene;

  // Helpers
  function drawNoRequestsHint(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const msg1 = 'Requests Floaters';
    const msg2 = 'Waiting for song requests…';
    const msg3 = 'Press D for demo, R for one. Or call window.__emitSongRequest({...})';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const boxW = Math.min(720, Math.floor(w * 0.9));
    const boxH = 120;
    const x = (w - boxW) / 2;
    const y = h * 0.12;
    ctx.globalAlpha = 0.35; ctx.fillStyle = '#000';
    roundRect(ctx, x, y, boxW, boxH, 12); ctx.fill();
    ctx.globalAlpha = 1;

    ctx.font = '700 22px system-ui, sans-serif';
    ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3;
    ctx.strokeText(msg1, w/2, y + 36); ctx.fillText(msg1, w/2, y + 36);

    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillStyle = '#ddd'; ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 2;
    ctx.strokeText(msg2, w/2, y + 66); ctx.fillText(msg2, w/2, y + 66);

    ctx.font = '400 14px system-ui, sans-serif';
    ctx.fillStyle = '#bbb'; ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 2;
    ctx.strokeText(msg3, w/2, y + 92); ctx.fillText(msg3, w/2, y + 92);
    ctx.restore();
  }

  function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
    if (!text) return '';
    if (ctx.measureText(text).width <= maxW) return text;
    const ell = '…';
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = ((lo + hi) >> 1) + 1;
      const t = text.slice(0, mid) + ell;
      if (ctx.measureText(t).width <= maxW) lo = mid;
      else hi = mid - 1;
    }
    return text.slice(0, lo) + ell;
  }
  function hexToRgba(hex: string, a: number) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    if (!m) return `rgba(34,204,136,${a})`;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return `rgba(${r},${g},${b},${a})`;
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
}

// Register when director is ready
function attachWhenReady() {
  const attempt = () => {
    const d = (window as any).__director as VisualDirector | undefined;
    if (!d) return false;
    try { d.registerScene(makeRequestsScene()); return true; }
    catch (e) { console.warn('Requests Floaters: register failed', e); return false; }
  };
  if (!attempt()) {
    const timer = setInterval(() => { if (attempt()) clearInterval(timer); }, 300);
    window.addEventListener('load', () => { if (attempt()) clearInterval(timer); });
  }
}
attachWhenReady();