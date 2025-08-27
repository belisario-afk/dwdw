// Emits the UI floater immediately, then attempts to queue the track.
// Also emits a result event you can listen to (songrequest:result).

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

export function emitSongRequestResult(result: {
  ok: boolean;
  status: number;
  message?: string;
  request?: SongRequestPayload;
}) {
  window.dispatchEvent(new CustomEvent('songrequest:result', { detail: result }));
}

// Helper to compose a payload from a Spotify track object (if you already have it)
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

function parseTrackId(ref: string | undefined | null): string | null {
  if (!ref) return null;
  const s1 = /^spotify:track:([A-Za-z0-9]+)$/.exec(ref); if (s1) return s1[1];
  const s2 = /open\.spotify\.com\/track\/([A-Za-z0-9]+)/.exec(ref); if (s2) return s2[1];
  if (/^[A-Za-z0-9]{8,}$/.test(ref)) return ref;
  return null;
}

async function safeText(r: Response) { try { return await r.text(); } catch { return ''; } }

export async function queueTrackAndEmit(params: {
  accessToken: string;            // user-modify-playback-state scope
  viewer: { displayName: string; avatarUrl?: string; color?: string };
  trackUriOrUrlOrId: string;      // spotify:track:... | open.spotify.com/track/... | id
  trackMeta?: { title?: string; albumArtUrl?: string };
  deviceId?: string;              // optional, if you want to target a specific device
}) {
  const { accessToken, viewer, trackUriOrUrlOrId, trackMeta, deviceId } = params;
  const id = parseTrackId(trackUriOrUrlOrId);
  const uri = id ? `spotify:track:${id}` : trackUriOrUrlOrId;

  // Emit to UI immediately so a floater appears regardless of queue result
  const req: SongRequestPayload = {
    userName: viewer.displayName || 'Guest',
    songTitle: trackMeta?.title,
    albumArtUrl: trackMeta?.albumArtUrl,
    pfpUrl: viewer.avatarUrl,
    color: viewer.color,
    uri,
  };
  emitSongRequest(req);

  try {
    const qs = new URLSearchParams({ uri });
    if (deviceId) qs.set('device_id', deviceId);
    const resp = await fetch(`https://api.spotify.com/v1/me/player/queue?${qs.toString()}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (resp.status === 204) {
      emitSongRequestResult({ ok: true, status: 204, request: req });
      return { ok: true, status: 204 };
    }
    if (resp.status === 404) {
      emitSongRequestResult({ ok: false, status: 404, message: 'No active device or invalid device_id.', request: req });
      return { ok: false, status: 404 };
    }
    const text = await safeText(resp);
    emitSongRequestResult({ ok: false, status: resp.status, message: text, request: req });
    return { ok: false, status: resp.status };
  } catch (e: any) {
    emitSongRequestResult({ ok: false, status: 0, message: e?.message || 'network error', request: req });
    return { ok: false, status: 0 };
  }
}

// Expose manual emitter for quick testing in console
;(window as any).__emitSongRequest = emitSongRequest;