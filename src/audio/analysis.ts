export type AnalysisFrame = {
  time: number; // seconds
  loudness: number; // normalized
  chroma: number[]; // 12 bins
  spectralFlux: number;
};

export function buildFramesFromAnalysis(analysis: SpotifyApi.AudioAnalysisResponse): AnalysisFrame[] {
  const frames: AnalysisFrame[] = [];
  const segs = analysis.segments || [];
  let prevSpec: number[] | null = null;
  for (const s of segs) {
    const time = s.start;
    const loud = s.loudness_max;
    const chroma = s.pitches || new Array(12).fill(0);
    let flux = 0;
    if (prevSpec) {
      for (let i = 0; i < 12; i++) flux += Math.max(0, chroma[i] - prevSpec[i]);
    }
    frames.push({
      time, loudness: loud, chroma, spectralFlux: flux
    });
    prevSpec = chroma;
  }
  const lMin = Math.min(...frames.map(f => f.loudness));
  const lMax = Math.max(...frames.map(f => f.loudness));
  for (const f of frames) {
    f.loudness = (f.loudness - lMin) / Math.max(1e-5, (lMax - lMin));
  }
  return frames;
}

export function adaptiveThresholdOnset(frames: AnalysisFrame[], win = 8, mul = 1.5): number[] {
  const onsetTimes: number[] = [];
  const mags = frames.map(f => f.spectralFlux);
  for (let i = 0; i < frames.length; i++) {
    const a = Math.max(0, i - win), b = Math.min(frames.length, i + win);
    const mean = mags.slice(a, b).reduce((p, c) => p + c, 0) / Math.max(1, b - a);
    if (mags[i] > mean * mul) onsetTimes.push(frames[i].time);
  }
  return onsetTimes;
}