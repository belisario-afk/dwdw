import { Emitter } from '@utils/emitter';

export function tempoFromAnalysis(analysis: SpotifyApi.AudioAnalysisResponse): number {
  if (analysis.track.tempo) return analysis.track.tempo;
  const secs = analysis.sections?.[0];
  return secs?.tempo || 120;
}

export function phraseBoundaryWatcher(analysis: SpotifyApi.AudioAnalysisResponse, barsPerPhrase = 4) {
  const em = new Emitter<{ 'phrase': (barIdx: number) => void }>();
  let i = 0;
  const bars = analysis.bars || [];
  let handle = 0 as any;
  function tick() {
    const now = performance.now() / 1000;
    if (i < bars.length && now >= (bars[i].start || 0)) {
      if (i % barsPerPhrase === 0) em.emit('phrase', i);
      i++;
    }
    handle = requestAnimationFrame(tick);
  }
  return {
    on: em.on.bind(em),
    start() { handle = requestAnimationFrame(tick); },
    stop() { cancelAnimationFrame(handle); }
  };
}