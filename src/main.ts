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
    director?: VisualDirector; // debug hook

    // TikTok live connector (loaded dynamically when user clicks Connect)
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

  // Expose for quick console testing: window.director.requestScene('Emo Slashes')
  (window as any).director = director;

  // Collector image for Emo Slashes:
  // Put your PNG in public/assets/ (recommended name: demon-slayer-hero.png to avoid spaces)
  // These two calls are safe: the first one wins if it exists; otherwise the second tries the original filename.
  director.setEmoHeroImage(`${import.meta.env.BASE_URL}assets/demon-slayer-hero.png`);
  director.setEmoHeroImage(`${import.meta.env.BASE_URL}assets/Demon-Slayer-PNG-Pic.png`);
  // Optional: separate background image (JPEG/wallpaper). If not set, the PNG is used for a blurred/dim BG.
  // director.setEmoBackgroundImage(`${import.meta.env.BASE_URL}assets/demon-slayer-bg.jpg`);
  // Optional: start on the scene to preview
  // director.requestScene('Emo Slashes');

  const ui = new UI(auth, api, player, director, vj, cache);
  ui.init();

  // Wire scene picker and top‑level controls
  const sceneSelect = document.getElementById('scene-select') as HTMLSelectElement | null;
  if (sceneSelect) {
    sceneSelect.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      director.requestScene(val);
    });
  }

  const btnCrossfade = document.getElementById('btn-crossfade');
  btnCrossfade?.addEventListener('click', () => director.crossfadeNow());

  const btnQuality = document.getElementById('btn-quality');
  btnQuality?.addEventListener('click', () => director.toggleQualityPanel());

  const btnAccess = document.getElementById('btn-accessibility');
  btnAccess?.addEventListener('click', () => director.toggleAccessibilityPanel());

  const btnFullscreen = document.getElementById('btn-fullscreen');
  btnFullscreen?.addEventListener('click', async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
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

  // Enable audio reactive visuals by default after login
  if (auth.getAccessToken()) director.setFeaturesEnabled(true);

  // Playback polling + palette application
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

        // Palette from album art
        const img = track.album?.images?.[0]?.url || null;
        if (img) {
          try {
            const palette = await Palette.fromImageURL(img);
            ui.applyPalette(palette);
            director.setPalette(palette);
            // Provide album art to VisualDirector (Flow Field, Stained Glass sampling, etc.)
            director.setAlbumArt(img).catch(() => {});
          } catch (e) {
            console.warn('Palette extraction failed', e);
          }
        }

        // Inform director of new track (fetches audio features if enabled)
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
      try {
        await handlePlaybackUpdate();
      } catch {}
    }, 1000);
  }

  function stopAuthedFlows() {
    if (!started) return;
    started = false;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    lastTrackId = null;
  }

  if (auth.getAccessToken()) startAuthedFlows();
  auth.on('tokens', (t) => {
    if (t) {
      director.setFeaturesEnabled(true);
      startAuthedFlows();
    } else {
      stopAuthedFlows();
    }
  });

  // ————————————————————————————————————————————————————————————————
  // Experimental: Song Queue panel + TikTok chat command parsing
  // Opt-in, safe; can be removed by deleting this block.
  // Features:
  // - Side panel showing queued songs
  // - Parse commands like: !play Song Name -Artist Name
  // - Manual "Simulate chat" input for testing (no TikTok needed)
  // - Optional Connect to TikTok live chat (loads connector script on demand)
  // ————————————————————————————————————————————————————————————————

  type QueueItem = {
    uri: string;
    title: string;
    artist: string;
    albumArtUrl?: string;
    requestedBy?: string;
  };

  const queueState: { items: QueueItem[] } = { items: [] };

  function parsePlayCommand(text: string): { query: string } | null {
    if (!text) return null;
    const trimmed = text.trim();
    if (!trimmed.toLowerCase().startsWith('!play')) return null;

    const payload = trimmed.slice(5).trim(); // after !play
    if (!payload) return null;

    const dash = payload.indexOf('-');
    if (dash > 0) {
      const song = payload.slice(0, dash).trim();
      const artist = payload.slice(dash + 1).trim();
      if (song && artist) return { query: `${song} ${artist}` };
    }
    return { query: payload };
  }

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
  let queuePanelOpen = false;

  function renderQueueList() {
    if (!queueListEl) return;
    queueListEl.innerHTML = queueState.items
      .map(
        (i) => `
      <div style="display:flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:6px 8px; background:#101017;">
        ${i.albumArtUrl ? `<img src="${i.albumArtUrl}" alt="" width="40" height="40" style="border-radius:6px; object-fit:cover;" />` : ''}
        <div style="display:flex; flex-direction:column; min-width:0;">
          <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i.title}</div>
          <div style="color:#a0a0b2; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i.artist}${i.requestedBy ? ` • requested by ${i.requestedBy}` : ''}</div>
        </div>
      </div>`
      )
      .join('');
  }

  function setTTStatus(text: string) {
    if (ttStatusEl) ttStatusEl.textContent = text;
  }

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
    panel.style.width = '340px';
    panel.style.maxHeight = '70vh';
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
        <div style="display:flex; justify-content: space-between; align-items:center;">
          <b>Song Queue</b>
          <span class="badge">TikTok / Manual</span>
        </div>

        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <input id="tiktok-username" type="text" placeholder="TikTok username" style="flex:1 1 160px; min-width:160px; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#171720; color:#fff;" />
          <button id="btn-tt-connect">Connect</button>
          <button id="btn-tt-disconnect">Disconnect</button>
          <span id="tt-status" style="color:#a0a0b2; font-size:12px;">Not connected</span>
        </div>

        <div style="display:flex; gap:6px; align-items:center;">
          <input id="manual-user" type="text" placeholder="Your name" style="flex:0 0 120px; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#171720; color:#fff;" />
          <input id="manual-cmd" type="text" placeholder="Type: !play song -artist" style="flex:1 1 auto; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#171720; color:#fff;" />
          <button id="btn-simulate">Send</button>
        </div>

        <div id="queue-list" style="display:flex; flex-direction:column; gap:8px;"></div>
      </div>
    `;

    host.appendChild(panel);
    queuePanelEl = panel;
    queueListEl = panel.querySelector('#queue-list') as HTMLDivElement;
    ttStatusEl = panel.querySelector('#tt-status') as HTMLSpanElement;

    const btnConnect = panel.querySelector('#btn-tt-connect') as HTMLButtonElement;
    const btnDisconnect = panel.querySelector('#btn-tt-disconnect') as HTMLButtonElement;
    const inputUser = panel.querySelector('#tiktok-username') as HTMLInputElement;

    btnConnect.onclick = async () => {
      const u = inputUser.value.trim();
      if (!u) return;
      try {
        await tiktokConnect(u);
        setTTStatus(`Connected to @${u}`);
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
      if (text) await handleChatCommand(user, text);
    };
  }

  // Wire or inject Queue button
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

  // Minimal Spotify helpers (avoid modifying existing API class)
  async function spotifyGET<T>(pathAndQuery: string): Promise<T> {
    const token = auth.getAccessToken();
    if (!token) throw new Error('No access token');
    const resp = await fetch(`https://api.spotify.com/v1${pathAndQuery}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!resp.ok) {
      throw new Error(`Spotify GET ${resp.status} ${await resp.text()}`);
    }
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
    if (!resp.ok) {
      throw new Error(`Spotify POST ${resp.status} ${await resp.text()}`);
    }
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
    // Adds to the currently active device queue
    await spotifyPOST(`/me/player/queue?uri=${encodeURIComponent(uri)}`);
  }

  async function enqueueByQuery(query: string, requestedBy?: string) {
    const item = await searchTrackTop(query);
    if (!item) return;
    const optimistic: QueueItem = { ...item, requestedBy };

    // Optimistic UI update
    queueState.items.push(optimistic);
    renderQueueList();

    try {
      await addToQueue(item.uri);
    } catch (e) {
      // Rollback on failure
      queueState.items = queueState.items.filter(
        (i) => !(i.uri === optimistic.uri && i.requestedBy === optimistic.requestedBy)
      );
      renderQueueList();
      throw e;
    }
  }

  async function handleChatCommand(user: string, text: string) {
    const cmd = parsePlayCommand(text);
    if (!cmd) return;
    try {
      await enqueueByQuery(cmd.query, user);
    } catch (e) {
      console.debug('Queue add failed', e);
    }
  }

  // TikTok bridge (loaded on demand)
  let ttConn: any | null = null;

  async function ensureTikTokConnector(): Promise<boolean> {
    if (
      (window.TikTokLiveConnector && window.TikTokLiveConnector.WebcastPushConnection) ||
      (window as any).WebcastPushConnection
    ) {
      return true;
    }
    await new Promise<void>((resolve) => {
      const existing = document.querySelector('script[data-tiktok-connector]');
      if (existing) {
        existing.addEventListener('load', () => resolve());
        (existing as any).onerror = () => resolve();
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/tiktok-live-connector/dist/browser.js';
      s.async = true;
      s.defer = true;
      s.setAttribute('data-tiktok-connector', '1');
      s.onload = () => resolve();
      s.onerror = () => resolve();
      document.head.appendChild(s);
    });
    return !!(
      (window.TikTokLiveConnector && window.TikTokLiveConnector.WebcastPushConnection) ||
      (window as any).WebcastPushConnection
    );
  }

  async function tiktokConnect(username: string) {
    await tiktokDisconnect();
    const ok = await ensureTikTokConnector();
    if (!ok) throw new Error('TikTok connector unavailable');

    const Ctor =
      (window.TikTokLiveConnector && window.TikTokLiveConnector.WebcastPushConnection) ||
      (window as any).WebcastPushConnection;

    ttConn = new Ctor(username, { enableExtendedGiftInfo: false });

    ttConn.on('chat', (data: any) => {
      const user = data?.uniqueId || data?.nickname || 'user';
      const comment: string = data?.comment || '';
      if (!comment) return;
      if (comment.trim().toLowerCase().startsWith('!play')) {
        handleChatCommand(user, comment);
      }
    });

    ttConn.on('error', (e: any) => {
      console.debug('TikTok connection error:', e?.message || e);
    });

    await ttConn.connect();
  }

  async function tiktokDisconnect() {
    if (ttConn?.disconnect) {
      try { await ttConn.disconnect(); } catch {}
    }
    ttConn = null;
  }

  // Initialize panel immediately so user can test
  initQueuePanel();
  // ————————————————————————————————————————————————————————————————
})();