// Emits a floater immediately, then queues the track on Spotify.
// If Spotify returns 404 (no active device), we auto-activate a device and retry once.

import { ensureActiveDevice } from './spotify-devices';

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

function parseTrackId(ref: string | undefined | null): string | null {
  if (!ref) return null;
  const s1 = /^spotify:track:([A-Za-z0-9]+)$/.exec(ref); if (s1) return s1[1];
  const s2 = /open\.spotify\.com\/track\/([A-Za-z0-9]+)/.exec(ref); if (s2) return s2[1];
  if (/^[A-Za-z0-9]{8,}$/.test(ref)) return ref;
  return null;
}

async function safeText(r: Response) { try { return await r.text(); } catch { return ''; } }

async function postQueue(accessToken: string, uri: string, deviceId?: string) {
  const qs = new URLSearchParams({ uri });
  if (deviceId) qs.set('device_id', deviceId);
  const resp = await fetch(`https://api.spotify.com/v1/me/player/queue?${qs.toString()}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  return resp;
}

export async function queueTrackAndEmit(params: {
  accessToken: string;            // needs user-modify-playback-state (and user-read-playback-state for auto-activate)
  viewer: { displayName: string; avatarUrl?: string; color?: string };
  trackUriOrUrlOrId: string;      // spotify:track:... | open.spotify.com/track/... | id
  trackMeta?: { title?: string; albumArtUrl?: string };
  deviceId?: string;              // optional preferred device to target
  autoActivateDevice?: boolean;   // default true: attempt to activate a device on 404
  minVolumePercentIfActivate?: number; // optional; e.g. 10
}) {
  const {
    accessToken, viewer, trackUriOrUrlOrId, trackMeta,
    deviceId, autoActivateDevice = true, minVolumePercentIfActivate
  } = params;

  const id = parseTrackId(trackUriOrUrlOrId);
  const uri = id ? `spotify:track:${id}` : trackUriOrUrlOrId;

  // Emit chat-to-queue linking event first so QueueFloater can attach avatar info
  window.dispatchEvent(new CustomEvent('songrequest:chat', {
    detail: {
      platform: 'tiktok',
      userId: viewer.displayName, // Use displayName as userId for consistency
      userName: viewer.displayName || 'Guest',
      pfpUrl: viewer.avatarUrl || ''
    }
  }));

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

  // Try queue
  let lastStatus = 0;
  try {
    let resp = await postQueue(accessToken, uri, deviceId);
    lastStatus = resp.status;

    if (resp.status === 204) {
      emitSongRequestResult({ ok: true, status: 204, request: req });
      return { ok: true, status: 204 };
    }

    if (resp.status === 404 && autoActivateDevice) {
      // Attempt to activate a device, then retry once
      const activeId = await ensureActiveDevice(accessToken, {
        preferredDeviceId: deviceId,
        play: true,
        fallbackToFirst: true,
        minVolumePercent: minVolumePercentIfActivate,
      });

      if (!activeId) {
        emitSongRequestResult({
          ok: false,
          status: 404,
          message: 'No active device. Open Spotify on any device (desktop/mobile/web) and try again.',
          request: req,
        });
        return { ok: false, status: 404 };
      }

      resp = await postQueue(accessToken, uri, activeId);
      lastStatus = resp.status;

      if (resp.status === 204) {
        emitSongRequestResult({ ok: true, status: 204, request: req });
        return { ok: true, status: 204 };
      }
    }

    const text = await safeText(resp);
    emitSongRequestResult({ ok: false, status: resp.status, message: text, request: req });
    return { ok: false, status: resp.status, message: text };
  } catch (e: any) {
    emitSongRequestResult({ ok: false, status: lastStatus || 0, message: e?.message || 'network error', request: req });
    return { ok: false, status: lastStatus || 0, message: e?.message || 'network error' };
  }
}

// Expose manual emitter for quick testing
;(window as any).__emitSongRequest = emitSongRequest;