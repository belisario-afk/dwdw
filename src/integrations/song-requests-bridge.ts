// Bridge to send song requests into the "Requests Floaters" scene + helpers.
export type SongRequestPayload = {
  id?: string;
  userName: string;
  songTitle?: string;
  pfpUrl?: string;
  albumArtUrl?: string;
  color?: string;
  ttlSec?: number;
  uri?: string; // optional spotify uri/url/id to resolve title/cover if missing
};

export function emitSongRequest(req: SongRequestPayload) {
  window.dispatchEvent(new CustomEvent<SongRequestPayload>('songrequest', { detail: req }));
}

// Helper: map a Spotify track object to a SongRequestPayload
export function emitSongRequestFromSpotify(track: any, viewer: { displayName: string; avatarUrl?: string; color?: string }) {
  if (!track) return;
  const artist = (track.artists && track.artists.length) ? track.artists.map((a: any) => a.name).join(', ') : '';
  const songTitle = artist ? `${artist} — ${track.name}` : track.name;
  const albumArtUrl = track.album?.images?.[0]?.url;
  emitSongRequest({
    userName: viewer.displayName || 'Guest',
    songTitle,
    albumArtUrl,
    pfpUrl: viewer.avatarUrl,
    color: viewer.color,
    uri: track.uri || track.external_urls?.spotify || track.id
  });
}

// Expose on window for manual testing or external integrations.
// Example in console:
// window.__emitSongRequest({ userName: 'ChatUser', songTitle: 'Daft Punk — One More Time', pfpUrl: 'https://...', albumArtUrl: 'https://...' })
;(window as any).__emitSongRequest = emitSongRequest;