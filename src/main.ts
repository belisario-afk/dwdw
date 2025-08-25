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

const CLIENT_ID = '927fda6918514f96903e828fcd6bb576';
const REDIRECT_URI =
  location.hostname === '127.0.0.1'
    ? 'http://127.0.0.1:5173/callback'
    : 'https://belisario-afk.github.io/dwdw/callback';

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

  // Handle auth callback route
  if (location.hash.startsWith('#/callback') || location.pathname.endsWith('/callback')) {
    try {
      await auth.handleRedirectCallback();
      location.hash = '#/';
      await ui.postLogin();
    } catch (e) {
      console.error(e);
      alert('Authentication failed. See console.');
    }
  } else {
    if (await auth.restore()) {
      await ui.postLogin();
    }
  }

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

  // Update seek/labels
  setInterval(async () => {
    const pb = await api.getCurrentPlaybackCached();
    ui.updatePlayback(pb);
  }, 1000);
})();