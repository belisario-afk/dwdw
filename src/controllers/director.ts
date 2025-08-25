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

export class VisualDirector extends Emitter<DirectorEvents> {
  private currentScene: string = 'Auto';
  private palette: UIPalette | null = null;
  // Toggle if you want to completely disable features fetches
  private featuresEnabled = true;
  private lastFeaturesFor: string | null = null;

  constructor(private api: SpotifyAPI) {
    super();
  }

  async onTrack(track: SpotifyApi.TrackObjectFull | null) {
    if (!track) return;

    // Skip audio-features for local/unplayable/missing id
    const isLocal = (track as any)?.is_local;
    const hasId = !!track.id;
    if (!this.featuresEnabled || isLocal || !hasId) return;

    // Avoid re-fetching for the same track id
    if (this.lastFeaturesFor === track.id) return;
    this.lastFeaturesFor = track.id;

    try {
      await this.api.getAudioFeatures(track.id);
      // Hook: store and use features if your renderer needs them
    } catch (e: any) {
      // Common: 403/404 or other restrictions — ignore quietly
      // console.debug('Audio features unavailable:', e?.status, e?.message || e);
    }
  }

  setPalette(p: UIPalette) {
    this.palette = p;
    this.emit('palette', p);
  }

  requestScene(scene: string) {
    this.currentScene = scene || 'Auto';
    this.emit('sceneChanged', this.currentScene);
  }

  crossfadeNow() {
    // Hook for your renderer
  }

  toggleQualityPanel() {
    // Hook for your renderer
  }

  toggleAccessibilityPanel() {
    // Hook for your renderer
  }

  getCanvas(): HTMLCanvasElement {
    const fromHost = document.querySelector<HTMLCanvasElement>('#canvas-host canvas');
    if (fromHost) return fromHost;
    const fallback = document.createElement('canvas');
    fallback.width = 1920;
    fallback.height = 1080;
    return fallback;
  }
}