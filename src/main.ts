import '@/styles/service-banner.css';
import { initServiceBannerForAudioFeatures } from '@/utils/serviceBanner'; initServiceBannerForAudioFeatures();
import './fonts';
import './styles/lyrics.css';
import { ensureRoute } from './router';
import { Auth } from '@auth/pkce';
import { SpotifyAPI } from '@spotify/api';
import { PlayerController } from '@spotify/player';
import { UI } from '@ui/ui';
import { VisualDirector } from '@controllers/director';
import { VJ } from '@controllers/vj';
import { Palette } from '@utils/palette';
import { Cache } from '@utils/storage';
import '@ui/responsive.css';
import { initResponsiveHUD } from '@ui/responsive';

initResponsiveHUD();

// Quiet known noisy messages from our own code (cannot suppress Chromium EME warning)
(() => {
  const origWarn = console.warn.bind(console);
  const origError = console.error.bind(console);
  console.warn = (...args: any[]) => {
    const s = String(args[0] ?? '');
    if (s.includes('robustness level be specified')) return; // filter if emitted by app code
    origWarn(...args);
  };
  console.error = (...args: any[]) => {
    const s = String(args[0] ?? '');
    if (s.includes('Audio features fetch failed')) return; // keep console clean
    origError(...args);
  };
})();

// Intercept Spotify audio-features 403/429 and return empty JSON to avoid noisy logs in vendor bundles
(() => {
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
      ? input.toString()
      : (input as Request).url;

    if (url && url.startsWith('https://api.spotify.com/v1/audio-features')) {
      try {
        const resp = await origFetch(input as any, init);
        if (resp.status === 403 || resp.status === 429) {
          return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return resp;
      } catch {
        // Network/other error: return safe empty object to prevent vendor logs
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }
    return origFetch(input as any, init);
  };
})();

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify: any;
    director?: VisualDirector;

    // Configuration hook (we will set this on boot so console.log shows a value)
    TIKTOK_PROXY_URL?: string;
  }
}

// Hard fallback if nothing else is present
const DEFAULT_TIKTOK_PROXY = 'https://dwdw-7a4i.onrender.com';

const CLIENT_ID = '927fda6918514f96903e828fcd6bb576';
const REDIRECT_URI = new URL(import.meta.env.BASE_URL, location.origin).toString();

function readProxyURL(): string | null {
  const fromWindow = (window as any).TIKTOK_PROXY_URL;
  const fromMeta = document.querySelector('meta[name="tiktok-proxy"]')?.getAttribute('content');
  const fromLS = localStorage.getItem('TIKTOK_PROXY_URL');
  const v = String(fromWindow || fromMeta || fromLS || DEFAULT_TIKTOK_PROXY || '').trim();
  if (v && /^https?:\/\//i.test(v)) return v.replace(/\/+$/, '');
  return null;
}

(async function boot() {
  ensureRoute();

  // Ensure window.TIKTOK_PROXY_URL is always defined at runtime
  const proxy = readProxyURL();
  if (proxy) (window as any).TIKTOK_PROXY_URL = proxy;

  const cache = new Cache('dwdw-v1');

  const auth = new Auth({
    clientId: CLIENT_ID,
    redirectUri: REDIRECT_URI,
    scopes: [
      'user-read-email',
      'user-read-private',
      'streaming',
      'user-read-playback-state',
      'user-modify-playback-state',
      'user-read-currently-playing',
      'playlist-read-private',
      'user-library-read'
    ]
  });

  const api = new SpotifyAPI(auth);
  const player = new PlayerController(auth, api);
  const director = new VisualDirector(api);
  const vj = new VJ(director, player);

  (window as any).director = director;

  // Optional assets for a scene
  director.setEmoHeroImage(`${import.meta.env.BASE_URL}assets/demon-slayer-hero.png`);
  director.setEmoHeroImage(`${import.meta.env.BASE_URL}assets/Demon-Slayer-PNG-Pic.png`);

  const ui = new UI(auth, api, player, director, vj, cache);
  ui.init();

  // Scene smart fallback
  const sceneFallbacks: Record<string, string[]> = {
    'Particles': ['Particles', 'Particle Field', 'Neon Particles', 'Flow Field'],
    'Tunnel': ['Tunnel', 'Audio Tunnel', 'Wormhole', 'Beat Tunnel'],
    'Terrain': ['Terrain', 'Landscape', 'Heightfield', 'Mountains', 'Terrain Scene'],
    'Typography': ['Typography', 'Lyric Typography', 'Lyrics', 'Lyric Lines', 'Type'],
    'Auto': ['Auto']
  };
  async function requestSceneSmart(name: string) {
    const candidates = sceneFallbacks[name] || [name];
    for (const c of candidates) {
      try { await director.requestScene(c); return true; } catch {}
    }
    try { await director.requestScene('Auto'); } catch {}
    return false;
  }

  // Controls
  const sceneSelect = document.getElementById('scene-select') as HTMLSelectElement | null;
  if (sceneSelect) {
    sceneSelect.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      requestSceneSmart(val);
    });
  }
  document.getElementById('btn-crossfade')?.addEventListener('click', () => director.crossfadeNow());
  document.getElementById('btn-quality')?.addEventListener('click', () => director.toggleQualityPanel());
  document.getElementById('btn-accessibility')?.addEventListener('click', () => director.toggleAccessibilityPanel());
  document.getElementById('btn-fullscreen')?.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  });

  // Screensaver
  let idleTimer: any = null;
  function onActive() {
    clearTimeout(idleTimer);
    ui.setScreensaver(false);
    idleTimer = setTimeout(() => ui.setScreensaver(true), 30000);
  }
  ['mousemove', 'keydown', 'pointerdown'].forEach((ev) =>
    window.addEventListener(ev, onActive, { passive: true })
  );
  onActive();

  // GPU label
  try {
    const gl =
      document.createElement('canvas').getContext('webgl2') ||
      document.createElement('canvas').getContext('webgl');
    const dbgInfo = (gl as any)?.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbgInfo
      ? (gl as any)?.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL)
      : 'Unknown';
    ui.setGPULabel(String(renderer));
  } catch {}

  // Auth flows
  await auth.handleRedirectCallback();
  await auth.restore();
  if (auth.getAccessToken()) director.setFeaturesEnabled(true);

  try { await requestSceneSmart('Auto'); } catch {}

  // Playback polling
  let started = false;
  let pollTimer: any = null;
  let lastTrackId: string | null = null;

  async function handlePlaybackUpdate() {
    if (!auth.getAccessToken()) return;
    const pb = await api.getCurrentPlaybackCached().catch(() => null);
    ui.updatePlayback(pb);

    if (pb && pb.item && (pb.item as any).type === 'track') {
      const track = pb.item as SpotifyApi.TrackObjectFull;
      if (track.id !== lastTrackId) {
        lastTrackId = track.id;

        const img = track.album?.images?.[0]?.url || null;
        if (img) {
          try {
            const palette = await Palette.fromImageURL(img);
            ui.applyPalette(palette);
            director.setPalette(palette);
            director.setAlbumArt(img).catch(() => {});
          } catch (e) {
            console.warn('Palette extraction failed', e);
          }
        }
        await director.onTrack(track).catch(() => {});
      }
    }
  }

  async function startAuthedFlows() {
    if (started) return;
    started = true;
    await ui.postLogin().catch(() => {});
    await handlePlaybackUpdate().catch(() => {});
    pollTimer = setInterval(async () => {
      try { await handlePlaybackUpdate(); } catch {}
    }, 1000);
  }
  function stopAuthedFlows() {
    if (!started) return;
    started = false;
    if (pollTimer) { clearInterval(pollTimer); }
    pollTimer = null;
    lastTrackId = null;
  }
  if (auth.getAccessToken()) startAuthedFlows();
  auth.on('tokens', (t) => { if (t) { director.setFeaturesEnabled(true); startAuthedFlows(); } else stopAuthedFlows(); });

  // ————————————————————————————————————————————————————————————————
  // TikTok livestream chat -> Spotify queue commands
  // ————————————————————————————————————————————————————————————————

  type QueueItem = {
    uri: string;
    title: string;
    artist: string;
    albumArtUrl?: string;
    requestedBy?: string;
  };
  const queueState: { items: QueueItem[] } = { items: [] };

  const GLOBAL_COOLDOWN_MS = 4000;
  const USER_COOLDOWN_MS = 15000;
  let lastGlobalAt = 0;
  const lastUserAt = new Map<string, number>();

  function ensurePanelHost(): HTMLElement | null {
    let host = document.getElementById('panels');
    if (!host) {
      host = document.createElement('div');
      host.id = 'panels';
      host.style.position = 'fixed';
      host.style.right = '0';
      host.style.top = '0';
      host.style.bottom = '0';
      host.style.pointerEvents = 'none';
      host.style.zIndex = '200';
      document.body.appendChild(host);
    }
    return host;
  }

  let queuePanelEl: HTMLDivElement | null = null;
  let queueListEl: HTMLDivElement | null = null;
  let ttStatusEl: HTMLSpanElement | null = null;
  let ttProxyEl: HTMLSpanElement | null = null;
  let lastActionEl: HTMLDivElement | null = null;
  let queuePanelOpen = false;

  function renderQueueList() {
    if (!queueListEl) return;
    queueListEl.innerHTML = queueState.items.map((i) => `
      <div style="display:flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:6px 8px; background:#101017;">
        ${i.albumArtUrl ? `<img src="${i.albumArtUrl}" alt="" width="40" height="40" style="border-radius:6px; object-fit:cover;" />` : ''}
        <div style="display:flex; flex-direction:column; min-width:0;">
          <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i.title}</div>
          <div style="color:#a0a0b2; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i.artist}${i.requestedBy ? ` • requested by ${i.requestedBy}` : ''}</div>
        </div>
      </div>
    `).join('');
  }
  function setTTStatus(text: string) { if (ttStatusEl) ttStatusEl.textContent = text; }
  function setProxyLabel() {
    const p = readProxyURL();
    if (p) (window as any).TIKTOK_PROXY_URL = p; // keep window var in sync
    if (ttProxyEl) ttProxyEl.textContent = `Proxy: ${p || 'not set'}`;
  }
  function setLastAction(text: string) { if (lastActionEl) lastActionEl.textContent = text; }

  function toggleQueuePanel() {
    if (!queuePanelEl) initQueuePanel();
    if (!queuePanelEl) return;
    queuePanelOpen = !queuePanelOpen;
    queuePanelEl.style.display = queuePanelOpen ? 'block' : 'none';
  }

  function initQueuePanel() {
    const host = ensurePanelHost();
    if (!host) return;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.position = 'absolute';
    panel.style.right = '12px';
    panel.style.top = '56px';
    panel.style.width = '360px';
    panel.style.maxWidth = '92vw';
    panel.style.maxHeight = '72vh';
    panel.style.overflow = 'auto';
    panel.style.pointerEvents = 'auto';
    panel.style.display = 'none';
    panel.style.background = '#121219';
    panel.style.border = '1px solid rgba(255, 255, 255, 0.08)';
    panel.style.borderRadius = '10px';
    panel.style.padding = '10px';
    panel.style.color = '#e8e8ef';
    panel.setAttribute('aria-label', 'Song queue');

    panel.innerHTML = `
      <div style="display:flex; flex-direction:column; gap:10px;">
        <div style="display:flex; justify-content: space-between; align-items:center; gap:8px; flex-wrap:wrap;">
          <b>Song Queue</b>
          <span class="badge" title="Type in TikTok chat">Viewers: !play Song -Artist • !skip • !pause • !resume • !volume 50</span>
        </div>

        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <input id="tiktok-username" type="text" placeholder="TikTok username (uniqueId or profile URL)" style="flex:1 1 160px; min-width:160px; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#171720; color:#fff;" />
          <button id="btn-tt-connect">Connect</button>
          <button id="btn-tt-disconnect">Disconnect</button>
        </div>

        <div style="display:flex; justify-content:space-between; align-items:center; color:#9aa; font-size:12px;">
          <span id="tt-status">Not connected</span>
          <span id="tt-proxy">Proxy: —</span>
        </div>

        <div style="display:flex; gap:6px; align-items:center; color:#9aa; font-size:12px;">
          <button id="btn-set-proxy" title="Set proxy URL">Set Proxy</button>
          <button id="btn-clear-proxy" title="Clear stored proxy">Clear</button>
        </div>

        <div style="color:#9aa; font-size:12px;">
          Go LIVE on TikTok, then enter your username (e.g., lmohss) or paste your profile link and Connect.
        </div>

        <div style="display:flex; gap:6px; align-items:center;">
          <input id="manual-user" type="text" placeholder="Your name (test)" style="flex:0 0 120px; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#171720; color:#fff;" />
          <input id="manual-cmd" type="text" placeholder="e.g., !play song -artist" style="flex:1 1 auto; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#171720; color:#fff;" />
          <button id="btn-simulate">Send</button>
        </div>

        <div id="last-action" style="color:#a0a0b2; font-size:12px;">Last: —</div>
        <div id="queue-list" style="display:flex; flex-direction:column; gap:8px;"></div>
      </div>
    `;

    host.appendChild(panel);
    queuePanelEl = panel;
    queueListEl = panel.querySelector('#queue-list') as HTMLDivElement;
    ttStatusEl = panel.querySelector('#tt-status') as HTMLSpanElement;
    ttProxyEl = panel.querySelector('#tt-proxy') as HTMLSpanElement;
    lastActionEl = panel.querySelector('#last-action') as HTMLDivElement;

    const btnConnect = panel.querySelector('#btn-tt-connect') as HTMLButtonElement;
    const btnDisconnect = panel.querySelector('#btn-tt-disconnect') as HTMLButtonElement;
    const btnSetProxy = panel.querySelector('#btn-set-proxy') as HTMLButtonElement;
    const btnClearProxy = panel.querySelector('#btn-clear-proxy') as HTMLButtonElement;
    const inputUser = panel.querySelector('#tiktok-username') as HTMLInputElement;

    setProxyLabel();

    btnSetProxy.onclick = () => {
      const current = readProxyURL() || '';
      const next = prompt('Enter proxy base URL (https://… no trailing slash):', current) || '';
      const val = next.trim().replace(/\/+$/, '');
      if (/^https?:\/\//i.test(val)) {
        localStorage.setItem('TIKTOK_PROXY_URL', val);
        (window as any).TIKTOK_PROXY_URL = val;
        setProxyLabel();
        setTTStatus('Proxy set.');
      } else {
        setTTStatus('Invalid URL.');
      }
    };
    btnClearProxy.onclick = () => {
      localStorage.removeItem('TIKTOK_PROXY_URL');
      setProxyLabel();
      setTTStatus('Stored proxy cleared. Using meta/default.');
    };

    btnConnect.onclick = async () => {
      const raw = inputUser.value.trim();
      const uniqueId = normalizeTikTokId(raw);
      if (!uniqueId) { setTTStatus('Enter username like lmohss or paste your profile URL'); return; }
      try {
        await tiktokConnectViaProxy(uniqueId); // proxy-only, no browser fallback
      } catch (e: any) {
        setTTStatus(`Connect failed: ${e?.message || e}`);
      }
    };
    btnDisconnect.onclick = async () => {
      await tiktokDisconnect();
      setTTStatus('Not connected');
    };

    const simUser = panel.querySelector('#manual-user') as HTMLInputElement;
    const simCmd = panel.querySelector('#manual-cmd') as HTMLInputElement;
    const btnSim = panel.querySelector('#btn-simulate') as HTMLButtonElement;
    btnSim.onclick = async () => {
      const user = simUser.value.trim() || 'tester';
      const text = simCmd.value.trim();
      if (text) await handleIncomingChat(user, text);
    };
  }

  // Add Queue button if missing
  let btnQueue = document.getElementById('btn-queue') as HTMLButtonElement | null;
  if (!btnQueue) {
    const toolbarRight = document.querySelector('.toolbar .right') as HTMLElement | null;
    if (toolbarRight) {
      btnQueue = document.createElement('button');
      btnQueue.id = 'btn-queue';
      btnQueue.title = 'Song Queue';
      btnQueue.textContent = 'Queue';
      toolbarRight.insertBefore(btnQueue, toolbarRight.querySelector('#btn-fullscreen') || null);
    }
  }
  btnQueue?.addEventListener('click', () => toggleQueuePanel());

  // Spotify helpers
  async function spotifyGET<T>(pathAndQuery: string): Promise<T> {
    const token = auth.getAccessToken();
    if (!token) throw new Error('No access token');
    const resp = await fetch(`https://api.spotify.com/v1${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resp.ok) throw new Error(`Spotify GET ${resp.status} ${await resp.text()}`);
    return resp.json();
  }
  async function spotifyPOST<T>(pathAndQuery: string): Promise<T | null> {
    const token = auth.getAccessToken();
    if (!token) throw new Error('No access token');
    const resp = await fetch(`https://api.spotify.com/v1${pathAndQuery}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (resp.status === 204) return null as any;
    if (!resp.ok) throw new Error(`Spotify POST ${resp.status} ${await resp.text()}`);
    return resp.json().catch(() => null as any);
  }
  async function spotifyPUT<T>(pathAndQuery: string): Promise<T | null> {
    const token = auth.getAccessToken();
    if (!token) throw new Error('No access token');
    const resp = await fetch(`https://api.spotify.com/v1${pathAndQuery}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (resp.status === 204) return null as any;
    if (!resp.ok) throw new Error(`Spotify PUT ${resp.status} ${await resp.text()}`);
    return resp.json().catch(() => null as any);
  }

  async function searchTrackTop(query: string): Promise<QueueItem | null> {
    const data = await spotifyGET<any>(`/search?type=track&limit=5&q=${encodeURIComponent(query)}`);
    const t = data?.tracks?.items?.[0];
    if (!t) return null;
    return {
      uri: t.uri,
      title: t.name,
      artist: (t.artists || []).map((a: any) => a.name).join(', '),
      albumArtUrl: t.album?.images?.[1]?.url || t.album?.images?.[0]?.url
    };
  }
  async function addToQueue(uri: string): Promise<void> {
    await spotifyPOST(`/me/player/queue?uri=${encodeURIComponent(uri)}`);
  }
  async function skipTrack(): Promise<void> {
    await spotifyPOST(`/me/player/next`);
  }
  async function pausePlayback(): Promise<void> {
    await spotifyPUT(`/me/player/pause`);
  }
  async function resumePlayback(): Promise<void> {
    await spotifyPUT(`/me/player/play`);
  }
  async function setVolume(vol: number): Promise<void> {
    const v = Math.max(0, Math.min(100, Math.round(vol)));
    await spotifyPUT(`/me/player/volume?volume_percent=${v}`);
  }

  type Parsed =
    | { type: 'play'; query: string }
    | { type: 'skip' }
    | { type: 'pause' }
    | { type: 'resume' }
    | { type: 'volume'; value: number }
    | null;

  function parseChatCommand(text: string): Parsed {
    if (!text) return null;
    const raw = text.trim();
    const lower = raw.toLowerCase();

    if (lower.startsWith('!play')) {
      const payload = raw.slice(5).trim();
      if (!payload) return null;
      const dash = payload.indexOf('-');
      if (dash > 0) {
        const song = payload.slice(0, dash).trim();
        const artist = payload.slice(dash + 1).trim();
        if (song && artist) return { type: 'play', query: `${song} ${artist}` };
      }
      return { type: 'play', query: payload };
    }
    if (lower.startsWith('!skip')) return { type: 'skip' };
    if (lower.startsWith('!pause')) return { type: 'pause' };
    if (lower.startsWith('!resume') || lower.startsWith('!playback')) return { type: 'resume' };
    if (lower.startsWith('!volume') || lower.startsWith('!vol')) {
      const num = Number(lower.replace(/!volume|!vol/g, '').trim());
      if (Number.isFinite(num)) return { type: 'volume', value: num };
      return null;
    }
    return null;
  }

  function passCooldown(user: string): boolean {
    const now = Date.now();
    if (now - lastGlobalAt < GLOBAL_COOLDOWN_MS) return false;
    const lu = lastUserAt.get(user) || 0;
    if (now - lu < USER_COOLDOWN_MS) return false;
    lastGlobalAt = now;
    lastUserAt.set(user, now);
    return true;
  }

  async function enqueueByQuery(query: string, requestedBy?: string) {
    const item = await searchTrackTop(query);
    if (!item) { setLastAction(`No results for "${query}"`); return; }
    const optimistic: QueueItem = { ...item, requestedBy };

    queueState.items.push(optimistic);
    if (queueState.items.length > 50) queueState.items.shift();
    renderQueueList();

    try {
      await addToQueue(item.uri);
      setLastAction(`Queued: ${item.title} • ${item.artist}${requestedBy ? ` (by ${requestedBy})` : ''}`);
    } catch {
      queueState.items = queueState.items.filter(
        (i) => !(i.uri === optimistic.uri && i.requestedBy === optimistic.requestedBy)
      );
      renderQueueList();
      setLastAction(`Failed to queue track`);
    }
  }

  async function handleIncomingChat(user: string, text: string) {
    const parsed = parseChatCommand(text);
    if (!parsed) return;

    if (!passCooldown(user)) {
      setLastAction(`Cooldown: please wait`);
      return;
    }

    try {
      switch (parsed.type) {
        case 'play':
          await enqueueByQuery(parsed.query, user);
          break;
        case 'skip':
          await skipTrack();
          setLastAction(`Skipped (by ${user})`);
          break;
        case 'pause':
          await pausePlayback();
          setLastAction(`Paused (by ${user})`);
          break;
        case 'resume':
          await resumePlayback();
          setLastAction(`Resumed (by ${user})`);
          break;
        case 'volume':
          await setVolume(parsed.value);
          setLastAction(`Volume set to ${Math.round(parsed.value)}% (by ${user})`);
          break;
      }
    } catch {
      setLastAction(`Command failed`);
    }
  }

  // ——— TikTok bridge (proxy-only) ———

  function normalizeTikTokId(input: string): string | null {
    if (!input) return null;
    let s = input.trim();
    if (/^https?:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        const m = u.pathname.match(/\/@([A-Za-z0-9._-]+)/);
        if (m) s = m[1];
      } catch {}
    }
    if (s.startsWith('@')) s = s.slice(1);
    if (!/^[A-Za-z0-9._-]{2,24}$/.test(s)) return null;
    return s;
  }

  async function checkProxyHealth(base: string): Promise<void> {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 6000);
    try {
      const res = await fetch(`${base}/health`, { signal: ctl.signal, cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status}`);
      const j = await res.json().catch(() => ({}));
      if (!j || j.ok !== true) throw new Error('health not ok');
    } finally {
      clearTimeout(t);
    }
  }

  let ttEventSource: EventSource | null = null;

  async function tiktokConnectViaProxy(username: string) {
    await tiktokDisconnect();

    const base = readProxyURL();
    if (!base) throw new Error('Proxy URL not configured');
    (window as any).TIKTOK_PROXY_URL = base; // keep it visible in console

    setProxyLabel();
    setTTStatus('Connecting via proxy…');

    try {
      await checkProxyHealth(base);
    } catch {
      throw new Error('Proxy not reachable. Check Render URL and /health');
    }

    const sseURL = `${base}/sse/${encodeURIComponent(username)}`;
    const es = new EventSource(sseURL, { withCredentials: false } as any);
    ttEventSource = es;

    es.onopen = () => setTTStatus(`Connected via proxy to @${username}`);
    es.onerror = () => setTTStatus('Proxy connection error (server sleeping or not reachable)');
    es.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.type === 'chat') {
          const user = msg.user || 'user';
          const comment = msg.comment || '';
          if (comment) handleIncomingChat(user, comment);
        } else if (msg.type === 'info') {
          setLastAction(msg.message || 'info');
        } else if (msg.type === 'error') {
          setLastAction(`Proxy error: ${msg.message || 'unknown'}`);
        }
      } catch {}
    };
  }

  async function tiktokDisconnect() {
    if (ttEventSource) {
      try { ttEventSource.close(); } catch {}
      ttEventSource = null;
    }
  }

  // Initialize panel immediately
  initQueuePanel();
})();