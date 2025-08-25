import { SpotifyAPI } from '@spotify/api';
import { Emitter } from '@utils/emitter';
// ... other imports as you have

export class VisualDirector extends Emitter<any> {
  constructor(private api: SpotifyAPI /* other deps if any */) {
    super();
  }

  // call this from main on 'track-changed'
  async onTrack(track: SpotifyApi.TrackObjectFull | null) {
    if (!track) return;
    // Palette/scene updates you already do...

    // Audio features are optional; don't fail visuals if forbidden
    try {
      const features = await this.api.getAudioFeatures(track.id);
      if (features) {
        // apply features if your director uses them
        // this.setFeatures(features);
      }
    } catch (e: any) {
      // 403 can happen in some contexts; just continue without features
      console.debug('Audio features unavailable:', e?.message || e);
    }
  }

  // ...rest of your class
}