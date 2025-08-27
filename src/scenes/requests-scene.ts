import { VisualDirector, type SceneDef } from '../controllers/director';

export type SongRequestPayload = {
  id?: string;
  userName: string;
  songTitle: string;
  pfpUrl?: string;
  albumArtUrl?: string;
  color?: string;
  ttlSec?: number;
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
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function rand(min: number, max: number) { return min + Math.random() * (max - min); }

function makeRequestsScene(): SceneDef {
  const floaters: Floater[] = [];
  const byId = new Map<string, Floater>();
  let lastSizeW = 0, lastSizeH = 0;
  let beatPulse = 0;

  async function addRequest(req: SongRequestPayload, director: VisualDirector) {
    const id = String(req.id || `${req.userName}:${req.songTitle}:${Date.now()}:${Math.random()}`);
    const existing = byId.get(id);
    if (existing) {
      existing.life = 0;
      existing.ttl = Math.max(existing.ttl, (req.ttlSec ?? 14));
      return;
    }

    const W = director.getCanvas().width;
    const H = director.getCanvas().height;

    const flo: Floater = {
      id,
      name: req.userName || 'Guest',
      song: req.songTitle || '',
      pfp: null,
      album: null,
      color: req.color || (director as any).palette?.dominant || '#22cc88',
      x: rand(W * 0.15, W * 0.85),
      y: rand(H * 0.2, H * 0.75),
      vx: rand(-40, 40),
      vy: rand(-20, 20),
      scale: 1,
      alpha: 0,
      life: 0,
      ttl: Math.max(6, Math.min(60, req.ttlSec ?? 14)),
      pulse: 0,
      bornAt: performance.now() / 1000,
      wantRemove: false,
    };

    if (req.pfpUrl) {
      loadImage(req.pfpUrl).then(img => { flo.pfp = img; }).catch(() => { flo.pfp = null; });
    }
    if (req.albumArtUrl) {
      loadImage(req.albumArtUrl).then(img => { flo.album = img; }).catch(() => { flo.album = null; });
    }

    const maxFloaters = 24;
    if (floaters.length >= maxFloaters) {
      let oldestIdx = 0;
      let oldestBorn = Infinity;
      for (let i = 0; i < floaters.length; i++) {
        if (floaters[i].bornAt < oldestBorn) { oldestBorn = floaters[i].bornAt; oldestIdx = i; }
      }
      const dead = floaters.splice(oldestIdx, 1)[0];
      byId.delete(dead.id);
    }

    floaters.push(flo);
    byId.set(id, flo);
  }

  const onSongReq = (ev: Event, director?: VisualDirector) => {
    try {
      const ce = ev as CustomEvent<SongRequestPayload>;
      const payload = ce.detail;
      if (!payload || !director) return;
      addRequest(payload, director);
    } catch {}
  };

  function drawRoundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

  const scene: SceneDef = {
    name: 'Requests Floaters',
    draw(ctx, w, h, time, dt, director) {
      if (!(window as any).__songReqHooked) {
        (window as any).__songReqHooked = true;
        window.addEventListener('songrequest', (e) => onSongReq(e, director) as any);
        (window as any).__emitSongRequest = (p: SongRequestPayload) => {
          window.dispatchEvent(new CustomEvent<SongRequestPayload>('songrequest', { detail: p }));
        };
      }

      if (w !== lastSizeW || h !== lastSizeH) {
        lastSizeW = w; lastSizeH = h;
        for (const f of floaters) { f.x = clamp(f.x, 40, w - 40); f.y = clamp(f.y, 40, h - 40); }
      }

      const pal = (director as any).palette;
      const grad = ctx.createLinearGradient(0, 0, w, h);
      const c0 = pal?.colors?.[0] || pal?.dominant || '#223';
      const c1 = pal?.colors?.[1] || pal?.secondary || '#332';
      grad.addColorStop(0, c0); grad.addColorStop(1, c1);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 0.25;
      const vg = ctx.createRadialGradient(w * 0.5, h * 0.55, Math.min(w, h) * 0.4, w * 0.5, h * 0.5, Math.max(w, h) * 0.9);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.9)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;

      const energy = (director as any).features?.energy ?? 0.5;
      const dance = (director as any).features?.danceability ?? 0.5;
      const jitter = (0.8 + energy) * 6;
      beatPulse = Math.max(0, beatPulse - dt * 1.8);

      ctx.save();
      ctx.globalCompositeOperation = 'source-over';

      for (let i = floaters.length - 1; i >= 0; i--) {
        const f = floaters[i];

        f.life += dt;
        const appear = Math.min(1, f.life / 0.4);
        const vanish = Math.min(1, Math.max(0, (f.ttl - f.life) / 0.8));
        f.alpha = appear * vanish;
        if (f.life >= f.ttl || f.wantRemove) {
          byId.delete(f.id);
          floaters.splice(i, 1);
          continue;
        }

        f.vx += (Math.random() - 0.5) * jitter * 0.4;
        f.vy += (Math.random() - 0.5) * jitter * 0.4;
        f.vx = lerp(f.vx, f.vx * (1 + beatPulse * 0.4), 0.3);
        f.vy = lerp(f.vy, f.vy * (1 + beatPulse * 0.4), 0.3);
        f.x += (f.vx + Math.sin((time + i) * (0.6 + dance)) * 8) * dt;
        f.y += (f.vy + Math.cos((time * 0.9 + i) * (0.7 + energy)) * 6) * dt;

        const margin = 24;
        if (f.x < margin) { f.x = margin; f.vx = Math.abs(f.vx) * 0.8; }
        else if (f.x > w - margin) { f.x = w - margin; f.vx = -Math.abs(f.vx) * 0.8; }
        if (f.y < margin) { f.y = margin; f.vy = Math.abs(f.vy) * 0.8; }
        else if (f.y > h - margin) { f.y = h - margin; f.vy = -Math.abs(f.vy) * 0.8; }

        f.pulse = Math.max(0, f.pulse - dt * 2.0);
        const scalePulse = 1 + f.pulse * 0.12 + beatPulse * 0.05;
        f.scale = lerp(f.scale, scalePulse, 0.2);

        const baseDim = Math.max(80, Math.min(180, Math.min(w, h) * 0.18));
        const boxW = baseDim * 1.45;
        const boxH = baseDim * 0.9;
        const cx = f.x, cy = f.y;

        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(f.scale, f.scale);
        ctx.globalAlpha = f.alpha;

        ctx.shadowBlur = 18 + 24 * (beatPulse + f.pulse) * 0.6;
        ctx.shadowColor = f.color;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        drawRoundedRect(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 14);
        ctx.fill();
        ctx.shadowBlur = 0;

        const square = baseDim * 0.66;
        const leftX = -boxW / 2 + 14;
        const topY = -square / 2;
        if (f.album) {
          ctx.drawImage(f.album, leftX, topY, square, square);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(leftX, topY, square, square);
        }

        const pfpR = square * 0.28;
        const pfpCx = leftX + square - pfpR * 0.8;
        const pfpCy = topY + square - pfpR * 0.8;
        ctx.save();
        ctx.beginPath();
        ctx.arc(pfpCx, pfpCy, pfpR, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
        if (f.pfp) {
          ctx.drawImage(f.pfp, pfpCx - pfpR, pfpCy - pfpR, pfpR * 2, pfpR * 2);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.2)';
          ctx.fillRect(pfpCx - pfpR, pfpCy - pfpR, pfpR * 2, pfpR * 2);
        }
        ctx.restore();

        const txtX = leftX + square + 12;
        const txtW = boxW - (square + 14 + 12);
        const name = f.name;
        const song = f.song;

        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';

        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(square * 0.22)}px var(--lyrics-font, system-ui), system-ui, sans-serif`;
        const nameY = -square * 0.15;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.strokeText(name, txtX, nameY);
        ctx.fillText(name, txtX, nameY);

        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.font = `500 ${Math.round(square * 0.18)}px var(--lyrics-font, system-ui), system-ui, sans-serif`;
        const songY = nameY + square * 0.35;
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        const songLine = truncateToWidth(ctx, song, txtW);
        ctx.strokeText(songLine, txtX, songY);
        ctx.fillText(songLine, txtX, songY);

        const underY = songY + square * 0.12;
        const underW = Math.max(24, Math.min(txtW, (txtW * (0.35 + 0.65 * (beatPulse + f.pulse)))));
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = hexToRgba(f.color, 0.9);
        drawRoundedRect(ctx, txtX, underY, underW, Math.max(3, Math.round(square * 0.04)), 4);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.restore();
      }

      ctx.restore();
    },
    onBeat(_director) {
      beatPulse = Math.min(1, beatPulse + 0.6);
      for (let i = 0; i < Math.min(6, floaters.length); i++) {
        const f = floaters[(Math.random() * floaters.length) | 0];
        f.vx += (Math.random() - 0.5) * 120;
        f.vy -= 60 + Math.random() * 60;
        f.pulse = Math.min(1, f.pulse + 1);
      }
    },
    onDownbeat() {
      beatPulse = 1;
      for (const f of floaters) f.pulse = Math.min(1, f.pulse + 0.5);
    }
  };

  return scene;

  function truncateToWidth(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
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
    const r = parseInt(m[1], 16);
    const g = parseInt(m[2], 16);
    const b = parseInt(m[3], 16);
    return `rgba(${r},${g},${b},${a})`;
  }
}

// Register when director is ready
function attachWhenReady() {
  const attempt = () => {
    const d = (window as any).__director as VisualDirector | undefined;
    if (!d) return false;
    try {
      d.registerScene(makeRequestsScene());
      return true;
    } catch (e) {
      console.warn('Requests Floaters: register failed', e);
      return false;
    }
  };
  if (!attempt()) {
    const timer = setInterval(() => { if (attempt()) clearInterval(timer); }, 300);
    window.addEventListener('load', () => { if (attempt()) clearInterval(timer); });
  }
}
attachWhenReady();