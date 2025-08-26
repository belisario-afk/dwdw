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

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify: any;
    director?: VisualDirector;

    TikTokLiveConnector?: any;
    WebcastPushConnection?: any;
  }
}

const CLIENT_ID = '927fda6918514f96903e828fcd6bb576';
const REDIRECT_URI = new URL(import.meta.env.BASE_URL, location.origin).toString();

(async function boot() {
  ensureRoute();

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

  director.setEmoHeroImage(`${import.meta.env.BASE_URL}assets/demon-slayer-hero.png`);
  director.setEmoHeroImage(`${import.meta.env.BASE_URL}assets/Demon-Slayer-PNG-Pic.png`);
  // director.setEmoBackgroundImage(`${import.meta.env.BASE_URL}assets/demon-slayer-bg.jpg`);

  const ui = new UI(auth, api, player, director, vj, cache);
  ui.init();

  // Scene smart fallback (covers mislabeled scene ids)
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
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    lastTrackId = null;
  }
  if (auth.getAccessToken()) startAuthedFlows();
  auth.on('tokens', (t) => { if (t) { director.setFeaturesEnabled(true); startAuthedFlows(); } else stopAuthedFlows(); });

  // ————————————————————————————————————————————————————————————————
  // TikTok livestream chat -> Spotify queue commands
  // Commands:
  //   !play Song Name -Artist Name
  //   !skip
  //   !pause
  //   !resume
  //   !volume 0-100
  // Includes simple cooldowns to prevent spam.
  // ————————————————————————————————————————————————————————————————

  type QueueItem = {
    uri: string;
    title: string;
    artist: string;
    albumArtUrl?: string;
    requestedBy?: string;
  };
  const queueState: { items: QueueItem[] } = { items: [] };

  // Cooldowns
  const GLOBAL_COOLDOWN_MS = 4000;
  const USER_COOLDOWN_MS = 15000;
  let lastGlobalAt = 0;
  const lastUserAt = new Map<string, number>();

  // UI panel management
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
          <span id="tt-status" style="color:#a0a0b2; font-size:12px;">Not connected</span>
        </div>

        <div style="color:#9aa; font-size:12px;">
          Go live on TikTok, then enter your username (e.g., lmohss) or paste your profile link and Connect.
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
    lastActionEl = panel.querySelector('#last-action') as HTMLDivElement;

    const btnConnect = panel.querySelector('#btn-tt-connect') as HTMLButtonElement;
    const btnDisconnect = panel.querySelector('#btn-tt-disconnect') as HTMLButtonElement;
    const inputUser = panel.querySelector('#tiktok-username') as HTMLInputElement;

    btnConnect.onclick = async () => {
      const raw = inputUser.value.trim();
      const uniqueId = normalizeTikTokId(raw);
      if (!uniqueId) {
        setTTStatus('Enter username like lmohss or paste your profile URL');
        return;
      }
      try {
        await tiktokConnect(uniqueId);
        setTTStatus(`Connected to @${uniqueId}`);
      } catch (e: any) {
        console.debug('TikTok connect failed', e);
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

  // Ensure Queue button exists
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

  // Minimal Spotify helpers
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
      headers: { Authorization: { toString: () => `Bearer ${token}` } as any } // ensure header stringification
    } as RequestInit);
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

  // Command parsing
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
    } catch (e) {
      queueState.items = queueState.items.filter(
        (i) => !(i.uri === optimistic.uri && i.requestedBy === optimistic.requestedBy)
      );
      renderQueueList();
      setLastAction(`Failed to queue track`);
      console.debug('Queue add failed', e);
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
    } catch (e) {
      console.debug('Command failed', e);
      setLastAction(`Command failed`);
    }
  }

  // ——— TikTok bridge helpers ———

  function normalizeTikTokId(input: string): string | null {
    if (!input) return null;
    let s = input.trim();
    // If it's a URL, extract /@username
    if (/^https?:\/\//i.test(s)) {
      try {
        const u = new URL(s);
        const m = u.pathname.match(/\/@([A-Za-z0-9._-]+)/);
        if (m) s = m[1];
      } catch {
        // ignore parse errors
      }
    }
    // Strip leading @
    if (s.startsWith('@')) s = s.slice(1);
    // Validate chars
    if (!/^[A-Za-z0-9._-]{2,24}$/.test(s)) return null;
    return s;
  }

  async function ensureTikTokConnector(): Promise<boolean> {
    if (
      (window.TikTokLiveConnector && window.TikTokLiveConnector.WebcastPushConnection) ||
      (window as any).WebcastPushConnection
    ) return true;

    // If index.html preloaded script, wait a moment for it
    await new Promise((r) => setTimeout(r, 200));

    // If still not present, attempt dynamic load (unpkg -> jsDelivr)
    const sources = [
      'https://unpkg.com/tiktok-live-connector/dist/browser.js',
      'https://cdn.jsdelivr.net/npm/tiktok-live-connector/dist/browser.js'
    ];
    for (const src of sources) {
      const ok = await new Promise<boolean>((resolve) => {
        const s = document.createElement('script');
        s.src = src;
        s.async = true;
        s.defer = true;
        s.crossOrigin = 'anonymous';
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      });
      if (ok) break;
    }

    return !!(
      (window.TikTokLiveConnector && window.TikTokLiveConnector.WebcastPushConnection) ||
      (window as any).WebcastPushConnection
    );
  }

  let ttConn: any | null = null;

  async function tiktokConnect(username: string) {
    await tiktokDisconnect();
    const ok = await ensureTikTokConnector();
    if (!ok) throw new Error('TikTok connector unavailable (script blocked). Try disabling ad blockers or hard refresh.');

    const Ctor =
      (window.TikTokLiveConnector && window.TikTokLiveConnector.WebcastPushConnection) ||
      (window as any).WebcastPushConnection;

    // Must be LIVE and use uniqueId
    ttConn = new Ctor(username, { enableExtendedGiftInfo: false });

    ttConn.on('chat', (data: any) => {
      const user = data?.uniqueId || data?.nickname || 'user';
      const comment: string = data?.comment || '';
      if (!comment) return;
      handleIncomingChat(user, comment);
    });

    ttConn.on('disconnected', () => setTTStatus('Disconnected'));
    ttConn.on('error', (e: any) => {
      console.debug('TikTok connection error:', e?.message || e);
      setTTStatus(`Error: ${e?.message || 'unknown'}`);
    });

    await ttConn.connect();
  }

  async function tiktokDisconnect() {
    if (ttConn?.disconnect) {
      try { await ttConn.disconnect(); } catch {}
    }
    ttConn = null;
  }

  // Initialize panel immediately
  initQueuePanel();
})();