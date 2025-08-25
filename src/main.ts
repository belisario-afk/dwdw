import { ensureRoute } from './router';
import { Auth } from '@auth/pkce';
import { SpotifyAPI } from '@spotify/api';
import { PlayerController } from '@spotify/player';
import { UI } from '@ui/ui';
import { VisualDirector } from '@controllers/director';
import { VJ } from '@controllers/vj';
import { Palette } from '@utils/palette';
import { Cache } from '@utils/storage';

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify: any;
  }
}

// Keep your client ID (or switch to import.meta.env.VITE_SPOTIFY_CLIENT_ID)
const CLIENT_ID = '927fda6918514f96903e828fcd6bb576';

// Build a redirect URI that works on both localhost and GitHub Pages.
// IMPORTANT: This must NOT include any ?query or #hash. Use origin + BASE_URL only.
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

  const ui = new UI(auth, api, player, director, vj, cache);
  ui.init();

  // Screensaver logic
  let idleTimer: any = null;
  function onActive() {
    clearTimeout(idleTimer);
    ui.setScreensaver(false);
    idleTimer = setTimeout(() => ui.setScreensaver(true), 30000);
  }
  ['mousemove', 'keydown', 'pointerdown'].forEach(ev =>
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

  // Handle OAuth callback (tolerant) and attempt restore.
  // This will not throw on normal loads and will clean ?code&state from the URL.
  await auth.handleRedirectCallback();
  await auth.restore();

  // Auto-cinematic mode selection changes visuals with track
  api.on('track-changed', async (track) => {
    if (!track) return;
    const img = (track as any).album?.images?.[0]?.url || null;
    if (img) {
      try {
        const palette = await Palette.fromImageURL(img);
        ui.applyPalette(palette);
        director.setPalette(palette);
      } catch (e) {
        console.warn('Palette extraction failed', e);
      }
    }
    director.onTrack(track);
  });

  // Start/stop flows that require an access token
  let started = false;
  let pollTimer: any = null;

  async function startAuthedFlows() {
    if (started) return;
    started = true;

    // Let UI wire up anything that assumes a valid token/device list etc.
    await ui.postLogin();

    // Initial playback fetch (guard token just in case)
    try {
      if (auth.getAccessToken()) {
        const pb = await api.getCurrentPlaybackCached();
        ui.updatePlayback(pb);
      }
    } catch (e) {
      // Non-fatal
      console.debug('Initial playback fetch failed:', e);
    }

    // Update seek/labels periodically (only if token is present)
    pollTimer = setInterval(async () => {
      if (!auth.getAccessToken()) return;
      try {
        const pb = await api.getCurrentPlaybackCached();
        ui.updatePlayback(pb);
      } catch {
        // Swallow to avoid console spam when token expires momentarily
      }
    }, 1000);
  }

  function stopAuthedFlows() {
    if (!started) return;
    started = false;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    // If your UI has a method to reset playback UI, call it here.
    // ui.resetPlaybackUI?.();
  }

  // Kick off if we already have tokens, and react to login/logout
  if (auth.isAuthenticated()) startAuthedFlows();
  auth.on('tokens', (t) => {
    if (t) startAuthedFlows();
    else stopAuthedFlows();
  });
})();