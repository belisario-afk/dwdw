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

  // Disable audio-features by default to avoid 403 spam; you can enable via setFeaturesEnabled(true)
  private featuresEnabled = false;
  private lastFeaturesFor: string | null = null;

  constructor(private api: SpotifyAPI) {
    super();
  }

  // Called by main when the track changes
  async onTrack(track: SpotifyApi.TrackObjectFull | null) {
    if (!track) return;

    // Optional audio-features fetch (disabled by default)
    if (this.featuresEnabled) {
      // Skip for local/unplayable/missing id or non-track items
      const isLocal = (track as any)?.is_local;
      if (!track.id || isLocal || (track as any)?.type !== 'track') return;

      // Avoid re-fetching for the same track
      if (this.lastFeaturesFor !== track.id) {
        this.lastFeaturesFor = track.id;
        try {
          await this.api.getAudioFeatures(track.id);
          // Hook: store and use features if your renderer needs them
          // this.applyFeatures(features);
        } catch {
          // Common: 403/404 or other restrictions — ignore quietly
        }
      }
    }

    // Hook: react visuals to the new track if needed
  }

  // Enable/disable audio-features at runtime
  setFeaturesEnabled(on: boolean) {
    this.featuresEnabled = !!on;
    if (!on) this.lastFeaturesFor = null;
  }

  // UI/main call this after extracting a palette from album art
  setPalette(p: UIPalette) {
    this.palette = p;
    this.emit('palette', p);
    // Hook: forward palette to your renderer if applicable
  }

  // VJ and UI call this to request a scene
  requestScene(scene: string) {
    this.currentScene = scene || 'Auto';
    this.emit('sceneChanged', this.currentScene);
    // Hook: actually switch scenes in your renderer here
  }

  // UI button to force a visual crossfade
  crossfadeNow() {
    // Hook: trigger your renderer's crossfade transition here
  }

  // UI button to open quality panel
  toggleQualityPanel() {
    // Hook: show/hide quality settings UI
  }

  // UI button to open accessibility panel
  toggleAccessibilityPanel() {
    // Hook: show/hide accessibility settings UI
  }

  // Needed by UI.toggleRecord() to capture the canvas stream
  getCanvas(): HTMLCanvasElement {
    const fromHost = document.querySelector<HTMLCanvasElement>('#canvas-host canvas');
    if (fromHost) return fromHost;
    const fallback = document.createElement('canvas');
    fallback.width = 1920;
    fallback.height = 1080;
    return fallback;
  }

  // If you have a render loop, call this.emit('fps', fps) there.
}