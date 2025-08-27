// Standalone "Requests Floater" overlay (no director needed).
// - Creates a fixed, topmost canvas overlay.
// - Listens to window "songrequest" CustomEvent and draws a floater.
// - Exposes window.__emitSongRequest({...}) for easy testing.

type Floater = {
  id: string;
  name: string;
  song: string;
  pfp?: HTMLImageElement | null;
  album?: HTMLImageElement | null;
  color: string;
  x: number; y: number;
  vx: number; vy: number;
  alpha: number;
  life: number;
  ttl: number;
  bornAt: number;
  pulse: number;
  awaitingMeta?: boolean;
};

(function setup() {
  if ((window as any).__requestsFloaterOverlayReady) return;
  (window as any).__requestsFloaterOverlayReady = true;

  const DEBUG = (() => { try { return localStorage.getItem('songreq-debug') === '1'; } catch { return false; } })();

  // Canvas overlay
  const c = document.createElement('canvas');
  c.id = 'requests-floaters-overlay';
  Object.assign(c.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '100vw',
    height: '100vh',
    zIndex: '2147483647',
    pointerEvents: 'none',
    opacity: '1',
    visibility: 'visible',
    display: 'block',
  } as CSSStyleDeclaration);
  document.body.appendChild(c);
  const ctx = c.getContext('2d')!;
  function resize() {
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    c.width = Math.floor(window.innerWidth * dpr);
    c.height = Math.floor(window.innerHeight * dpr);
    // Keep CSS size in CSS pixels
    c.style.width = '100vw';
    c.style.height = '100vh';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // Floater state
  const floaters: Floater[] = [];
  const byId = new Map<string, Floater>();

  function rand(min: number, max: number) { return min + Math.random() * (max - min); }
  function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

  function loadImg(url: string): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = url;
      } catch {
        resolve(null);
      }
    });
  }

  function truncate(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
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

  function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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

  function hexToRgba(hex: string, a: number) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
    if (!m) return `rgba(34,204,136,${a})`;
    const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  async function addFloater(req: any) {
    const id = String(req.id || `${req.userName || 'Guest'}:${req.songTitle || ''}:${Date.now()}:${Math.random()}`);
    if (byId.has(id)) return;
    const W = c.width / (window.devicePixelRatio || 1);
    const H = c.height / (window.devicePixelRatio || 1);

    const flo: Floater = {
      id,
      name: String(req.userName || 'Guest'),
      song: String(req.songTitle || ''),
      pfp: null,
      album: null,
      color: String(req.color || '#22cc88'),
      x: rand(W * 0.2, W * 0.8),
      y: rand(H * 0.25, H * 0.75),
      vx: 0, vy: 0,
      alpha: 0,
      life: 0,
      ttl: Math.max(6, Math.min(60, Number(req.ttlSec ?? 14))),
      bornAt: performance.now() / 1000,
      pulse: 0,
    };

    // Start loading images (don’t block rendering)
    if (req.pfpUrl) loadImg(req.pfpUrl).then(img => { if (img) flo.pfp = img; });
    if (req.albumArtUrl) loadImg(req.albumArtUrl).then(img => { if (img) flo.album = img; });

    floaters.push(flo);
    byId.set(id, flo);
    if (DEBUG) console.log('[Standalone Requests] added floater', { id: flo.id, name: flo.name, song: flo.song });
  }

  function onSongRequest(ev: Event) {
    const ce = ev as CustomEvent<any>;
    const payload = ce.detail ?? {};
    if (DEBUG) console.log('[Standalone Requests] event', payload);
    addFloater(payload);
  }

  // Public quick emitter
  if (!(window as any).__emitSongRequest) {
    (window as any).__emitSongRequest = (p: any) => window.dispatchEvent(new CustomEvent('songrequest', { detail: p }));
  }

  // Hook events
  const events = ['songrequest', 'tiktok:songrequest', 'song-request', 'songQueued', 'queue:add', 'queue:add:request'];
  for (const e of events) window.addEventListener(e, onSongRequest as any);

  // Animation loop
  let last = performance.now();
  function frame(now: number) {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = c.width / dpr, H = c.height / dpr;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#0f1220');
    grad.addColorStop(1, '#141018');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    // Hint when empty
    if (!floaters.length) {
      ctx.fillStyle = '#fff';
      ctx.font = '700 22px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Requests Floater (Standalone)', W / 2, H * 0.12);
      ctx.font = '500 16px system-ui, sans-serif';
      ctx.fillStyle = '#ddd';
      ctx.fillText('Call window.__emitSongRequest({ userName, songTitle, pfpUrl?, albumArtUrl? })', W / 2, H * 0.12 + 28);
    }

    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      f.life += dt;
      const appear = Math.min(1, f.life / 0.35);
      const vanish = Math.min(1, Math.max(0, (f.ttl - f.life) / 0.8));
      f.alpha = appear * vanish;
      if (f.life >= f.ttl) { byId.delete(f.id); floaters.splice(i, 1); continue; }

      // Motion
      const t = f.life * 0.7;
      const targetVx = Math.sin(t + i) * 30;
      const targetVy = Math.cos(0.9 * t + i * 1.3) * 22;
      f.vx = lerp(f.vx, targetVx, 0.08);
      f.vy = lerp(f.vy, targetVy, 0.08);
      f.x += f.vx * dt;
      f.y += f.vy * dt;

      // Draw card
      const base = Math.max(90, Math.min(200, Math.min(W, H) * 0.2));
      const boxW = base * 1.5;
      const boxH = base * 0.95;
      const square = base * 0.68;

      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.translate(f.x, f.y);

      // Panel
      ctx.shadowBlur = 22;
      ctx.shadowColor = f.color;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRectPath(ctx, -boxW / 2, -boxH / 2, boxW, boxH, 14);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Album
      const leftX = -boxW / 2 + 14;
      const topY = -square / 2;
      if (f.album) ctx.drawImage(f.album, leftX, topY, square, square);
      else { ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(leftX, topY, square, square); }

      // PFP circle
      const pfpR = square * 0.28;
      const pfpCx = leftX + square - pfpR * 0.85;
      const pfpCy = topY + square - pfpR * 0.85;
      ctx.save();
      ctx.beginPath(); ctx.arc(pfpCx, pfpCy, pfpR, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
      if (f.pfp) ctx.drawImage(f.pfp, pfpCx - pfpR, pfpCy - pfpR, pfpR * 2, pfpR * 2);
      else { ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect(pfpCx - pfpR, pfpCy - pfpR, pfpR * 2, pfpR * 2); }
      ctx.restore();

      // Text
      const txtX = leftX + square + 12;
      const txtW = boxW - (square + 14 + 12);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';

      ctx.fillStyle = '#fff';
      ctx.font = `700 ${Math.round(square * 0.22)}px system-ui, sans-serif`;
      const nameY = -square * 0.15;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(f.name, txtX, nameY);
      ctx.fillText(f.name, txtX, nameY);

      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.font = `500 ${Math.round(square * 0.18)}px system-ui, sans-serif`;
      const songY = nameY + square * 0.35;
      const songLine = truncate(ctx, f.song || '', txtW);
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.strokeText(songLine, txtX, songY);
      ctx.fillText(songLine, txtX, songY);

      // Underline
      const underY = songY + square * 0.12;
      const underW = Math.max(28, Math.min(txtW, txtW * (0.5 + 0.5 * Math.abs(Math.sin(t * 1.2)))));
      ctx.fillStyle = hexToRgba(f.color, 0.9);
      roundRectPath(ctx, txtX, underY, underW, Math.max(3, Math.round(square * 0.04)), 4);
      ctx.fill();

      ctx.restore();
    }

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (DEBUG) console.log('[Standalone Requests] overlay ready');
})();