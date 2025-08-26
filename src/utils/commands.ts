export function parsePlayCommand(text: string): { query: string } | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed.toLowerCase().startsWith('!play')) return null;

  const payload = trimmed.slice(5).trim(); // after !play
  if (!payload) return null;

  // If format is "song -artist", boost the query a bit; otherwise use as-is
  const dash = payload.indexOf('-');
  if (dash > 0) {
    const song = payload.slice(0, dash).trim();
    const artist = payload.slice(dash + 1).trim();
    if (song && artist) {
      // Spotify tends to match better with free text; explicit filters can be too strict.
      return { query: `${song} ${artist}` };
    }
  }
  return { query: payload };
}