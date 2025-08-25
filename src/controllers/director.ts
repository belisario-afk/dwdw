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

  constructor(private api: SpotifyAPI) {
    super();
  }

  // Called by main when the track changes
  async onTrack(track: SpotifyApi.TrackObjectFull | null) {
    if (!track) return;
    // Audio features are optional; ignore 403s or other failures
    try {
      await this.api.getAudioFeatures(track.id);
      // Hook: if you use features, store them and drive visuals here.
    } catch (e: any) {
      if (e?.status !== 403) {
        console.debug('Audio features unavailable:', e?.message || e);
      }
    }
    // Hook: react your visuals to the new track here.
  }

  // UI/main call this after extracting a palette from album art
  setPalette(p: UIPalette) {
    this.palette = p;
    this.emit('palette', p);
    // Hook: forward palette to your renderer if you have one.
    // e.g., this.renderer.setPalette(p);
  }

  // VJ and UI call this to request a scene
  requestScene(scene: string) {
    this.currentScene = scene || 'Auto';
    this.emit('sceneChanged', this.currentScene);
    // Hook: actually switch scenes in your renderer here.
    console.debug('[Director] requestScene:', this.currentScene);
  }

  // UI button to force a visual crossfade
  crossfadeNow() {
    // Hook: trigger your renderer's crossfade transition here.
    console.debug('[Director] crossfadeNow');
  }

  // UI button to open quality panel
  toggleQualityPanel() {
    // Hook: open/close your quality settings UI if you have one.
    console.debug('[Director] toggleQualityPanel');
  }

  // UI button to open accessibility panel
  toggleAccessibilityPanel() {
    // Hook: open/close your accessibility settings UI if you have one.
    console.debug('[Director] toggleAccessibilityPanel');
  }

  // Needed by UI.toggleRecord() to capture the canvas stream
  getCanvas(): HTMLCanvasElement {
    const fromHost = document.querySelector<HTMLCanvasElement>('#canvas-host canvas');
    if (fromHost) return fromHost;
    // Fallback so recording doesn’t crash if canvas isn’t mounted yet
    const fallback = document.createElement('canvas');
    fallback.width = 1920;
    fallback.height = 1080;
    return fallback;
  }

  // If you have a render loop somewhere, call this.emit('fps', fps) there.
}