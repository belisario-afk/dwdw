// Emits a floater right away, then attempts to queue the track.
// Also emits a result event you can listen to if desired.

export type SongRequestPayload = {
  id?: string;
  userName: string;
  songTitle?: string;
  pfpUrl?: string;
  albumArtUrl?: string;
  color?: string;
  ttlSec?: number;
  uri?: string; // spotify:track:... | open.spotify.com/track/... | id
};

export function emitSongRequest(req: SongRequestPayload) {
  window.dispatchEvent(new CustomEvent<SongRequestPayload>('songrequest', { detail: req }));
}

// Optional result signal (success/fail)
export function emitSongRequestResult(result: {
  ok: boolean;
  status: number;
  message?: string;
  request?: SongRequestPayload;
}) {
  window.dispatchEvent(new CustomEvent('songrequest:result', { detail: result }));
}

// Helper to compose title/cover from a Spotify track object (if you already have it)
export function songReqFromSpotifyTrack(
  track: any,
  viewer: { displayName: string; avatarUrl?: string; color?: string }
): SongRequestPayload {
  const artist = (track?.artists?.length ? track.artists.map((a: any) => a.name).join(', ') : '') || '';
  const songTitle = artist ? `${artist} — ${track?.name || ''}` : track?.name || '';
  const albumArtUrl = track?.album?.images?.[0]?.url;
  const uri = track?.uri || track?.external_urls?.spotify || track?.id;
  return {
    userName: viewer.displayName || 'Guest',
    songTitle,
    albumArtUrl,
    pfpUrl: viewer.avatarUrl,
    color: viewer.color,
    uri,
  };
}

// Parse a track ref (URI/URL/ID) to a track ID
function parseTrackId(ref: string | undefined | null): string | null {
  if (!ref) return null;
  const s1 = /^spotify:track:([A-Za-z0-9]+)$/.exec(ref); if (s1) return s1[1];
  const s2 = /open\.spotify\.com\/track\/([A-Za-z0-9]+)/.exec(ref); if (s2) return s2[1];
  if (/^[A-Za-z0-9]{8,}$/.test(ref)) return ref;
  return null;
}

// Main: queue and emit
export async function queueTrackAndEmit(params: {
  accessToken: string;            // OAuth token with user-modify-playback-state
  viewer: { displayName: string; avatarUrl?: string; color?: string };
  trackUriOrUrlOrId: string;      // spotify:track:... | open.spotify.com/track/... | id
  trackMeta?: { title?: string; albumArtUrl?: string }; // optional pre-known meta
  deviceId?: string;              // optional if you want to target a specific device
}) {
  const { accessToken, viewer, trackUriOrUrlOrId, trackMeta, deviceId } = params;
  const id = parseTrackId(trackUriOrUrlOrId);
  const uri = id ? `spotify:track:${id}` : trackUriOrUrlOrId;

  // Emit to UI immediately so floaters appear even if Spotify queue fails.
  emitSongRequest({
    userName: viewer.displayName || 'Guest',
    songTitle: trackMeta?.title,
    albumArtUrl: trackMeta?.albumArtUrl,
    pfpUrl: viewer.avatarUrl,
    color: viewer.color,
    uri
  });

  // Now attempt the queue call
  try {
    const qs = new URLSearchParams({ uri });
    if (deviceId) qs.set('device_id', deviceId);
    const resp = await fetch(`https://api.spotify.com/v1/me/player/queue?${qs.toString()}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // 204 is success
    if (resp.status === 204) {
      emitSongRequestResult({ ok: true, status: 204 });
      return { ok: true, status: 204 };
    }

    // 404 usually means "no active device" or bad device_id
    if (resp.status === 404) {
      emitSongRequestResult({
        ok: false,
        status: 404,
        message: 'No active device. Start playback on any device or pass a valid device_id.',
      });
      return { ok: false, status: 404 };
    }

    // Other errors
    const text = await safeText(resp);
    emitSongRequestResult({ ok: false, status: resp.status, message: text });
    return { ok: false, status: resp.status };
  } catch (e: any) {
    emitSongRequestResult({ ok: false, status: 0, message: e?.message || 'network error' });
    return { ok: false, status: 0 };
  }
}

async function safeText(r: Response) {
  try { return await r.text(); } catch { return ''; }
}

// Expose a manual emitter for quick testing in console
;(window as any).__emitSongRequest = emitSongRequest;