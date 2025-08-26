// Safe wrapper for Spotify audio-features with neutral fallbacks.
// Use this instead of direct fetches to /v1/audio-features/:id.

export type AudioFeatures = {
  tempo: number;
  energy: number;
  valence: number;
  danceability: number;
  loudness: number;
};

const NEUTRAL: AudioFeatures = {
  tempo: 120,
  energy: 0.5,
  valence: 0.5,
  danceability: 0.5,
  loudness: -8,
};

// Optional error hook, e.g., to show a banner
type ErrorInfo = { status: number; detail?: string };
let onError: ((info: ErrorInfo) => void) | null = null;
export function setAudioFeaturesErrorHandler(fn: ((info: ErrorInfo) => void) | null) {
  onError = fn;
}

export async function getAudioFeatures(trackId: string, token: string): Promise<AudioFeatures> {
  if (!trackId || !token) return NEUTRAL;

  try {
    const res = await fetch(
      `https://api.spotify.com/v1/audio-features/${encodeURIComponent(trackId)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      let detail = '';
      try { detail = JSON.stringify(await res.json()); } catch {}
      console.warn(`Audio features fetch failed ${res.status}: ${detail}`);
      if (onError) onError({ status: res.status, detail });
      return NEUTRAL;
    }

    const j = await res.json();
    if (!j) return NEUTRAL;

    return {
      tempo: j.tempo ?? NEUTRAL.tempo,
      energy: j.energy ?? NEUTRAL.energy,
      valence: j.valence ?? NEUTRAL.valence,
      danceability: j.danceability ?? NEUTRAL.danceability,
      loudness: j.loudness ?? NEUTRAL.loudness,
    };
  } catch (e) {
    console.warn('Audio features fetch error:', e);
    if (onError) onError({ status: 0, detail: String(e) });
    return NEUTRAL;
  }
}