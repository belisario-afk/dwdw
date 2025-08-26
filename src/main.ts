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

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void;
    Spotify: any;
    director?: VisualDirector; // debug hook
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
})();