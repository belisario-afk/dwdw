export type AudioFeatures = {
  tempo: number;
  energy: number;
  valence: number;
  danceability: number;
  loudness: number;
};

type AudioFeaturesErrorInfo = {
  status: number;      // 0 = network/unknown
  detail?: unknown;    // parsed server error if available
};

let audioFeaturesErrorHandler: ((info: AudioFeaturesErrorInfo) => void) | undefined;

export function setAudioFeaturesErrorHandler(fn: (info: AudioFeaturesErrorInfo) => void) {
  audioFeaturesErrorHandler = fn;
}

const NEUTRAL: AudioFeatures = {
  tempo: 120,
  energy: 0.5,
  valence: 0.5,
  danceability: 0.5,
  loudness: -8,
};

export async function getAudioFeatures(trackId: string, token: string): Promise<AudioFeatures> {
  if (!trackId || !token) return NEUTRAL;

  try {
    const res = await fetch(`https://api.spotify.com/v1/audio-features/${encodeURIComponent(trackId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      let detail: unknown = undefined;
      try { detail = await res.json(); } catch {}
      console.warn(`Audio features fetch failed ${res.status}:`, detail);
      audioFeaturesErrorHandler?.({ status: res.status, detail });
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
    audioFeaturesErrorHandler?.({ status: 0, detail: e });
    return NEUTRAL;
  }
}