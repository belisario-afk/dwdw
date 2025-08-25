import { Emitter } from '@utils/emitter';
import { SpotifyAPI } from '@spotify/api';
import { SceneManager } from '@visuals/engine';
import { type VisualSceneName } from '@visuals/scenes/types';
import { tempoFromAnalysis, phraseBoundaryWatcher } from '@visuals/music';
import { QualityPanel } from '@ui/panels/quality';
import { AccessibilityPanel } from '@ui/panels/accessibility';

type Events = {
  'fps': (fps: number) => void;
}

export class VisualDirector extends Emitter<Events> {
  public sceneManager: SceneManager;
  private qualityPanel: QualityPanel;
  private accPanel: AccessibilityPanel;
  private currentTrackId: string | null = null;
  private autoMode = true;

  constructor(private api: SpotifyAPI) {
    super();
    this.sceneManager = new SceneManager(document.getElementById('canvas-host')!, (fps) => this.emit('fps', fps));
    this.qualityPanel = new QualityPanel(this.sceneManager);
    this.accPanel = new AccessibilityPanel(this.sceneManager);
    this.sceneManager.loadScene('Tunnel');
  }

  setPalette(palette: { dominant: string; secondary: string; colors: string[] }) {
    this.sceneManager.setPalette(palette);
  }

  getCanvas(): HTMLCanvasElement {
    return this.sceneManager.getCanvas();
  }

  toggleQualityPanel() { this.qualityPanel.toggle(); }
  toggleAccessibilityPanel() { this.accPanel.toggle(); }

  requestScene(name: string) {
    if (name === 'Auto') {
      this.autoMode = true;
      return;
    }
    this.autoMode = false;
    this.sceneManager.crossfadeTo(name as VisualSceneName, 2.0);
  }

  async crossfadeNow() {
    const next = this.sceneManager.getNextSceneName();
    this.sceneManager.crossfadeTo(next, 2.0);
  }

  async onTrack(track: SpotifyApi.TrackObjectFull) {
    const id = track.id;
    this.currentTrackId = id;
    const features = await this.api.getAudioFeatures(id);
    const energy = features.energy || 0;
    const valence = features.valence || 0;
    const dance = features.danceability || 0;

    if (this.autoMode) {
      let pick: VisualSceneName = 'Particles';
      if (dance > 0.65 && energy > 0.6) pick = 'Particles';
      else if (dance > 0.55 && energy < 0.5) pick = 'Typography';
      else if (valence < 0.35) pick = 'Tunnel';
      else if (energy > 0.75) pick = 'Terrain';
      else pick = 'Fluid';
      this.sceneManager.crossfadeTo(pick, 2.5);
    }

    const analysis = await this.api.getAudioAnalysis(id).then(r => r.json());
    const tempo = tempoFromAnalysis(analysis);
    const watcher = phraseBoundaryWatcher(analysis, 4);
    watcher.on('phrase', (barIdx: number) => {
      if (this.autoMode && (barIdx % 8 === 0)) {
        const next = this.sceneManager.getNextSceneName();
        this.sceneManager.crossfadeTo(next, 2.0);
      }
      this.sceneManager.onPhrase(barIdx, tempo);
    });
    watcher.start();
  }
}