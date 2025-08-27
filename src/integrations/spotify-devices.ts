// Spotify device helpers: list devices, transfer playback, and ensure an active device.

export type SpotifyDevice = {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string; // "Computer" | "Smartphone" | "Speaker" | "TV" | "AVR" | ...
  volume_percent: number | null;
};

export async function getDevices(accessToken: string): Promise<SpotifyDevice[]> {
  const r = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(`devices ${r.status}`);
  const j = await r.json();
  return j?.devices || [];
}

export function findActiveDevice(devices: SpotifyDevice[]): SpotifyDevice | null {
  return devices.find(d => d.is_active) || null;
}

export async function transferPlayback(
  accessToken: string,
  deviceId: string,
  opts?: { play?: boolean; volumePercent?: number }
): Promise<void> {
  // Transfer and optionally start playback
  const r = await fetch('https://api.spotify.com/v1/me/player', {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ device_ids: [deviceId], play: !!opts?.play }),
  });
  if (r.status !== 204) {
    const t = await safeText(r);
    throw new Error(`transfer ${r.status} ${t}`);
  }

  // Optionally set volume
  if (typeof opts?.volumePercent === 'number') {
    const vol = Math.max(0, Math.min(100, Math.round(opts.volumePercent)));
    const rv = await fetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${vol}&device_id=${encodeURIComponent(deviceId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    // Ignore non-204; volume may be restricted on some devices.
  }
}

export async function ensureActiveDevice(
  accessToken: string,
  opts?: { preferredDeviceId?: string; play?: boolean; fallbackToFirst?: boolean; minVolumePercent?: number }
): Promise<string | null> {
  const { preferredDeviceId, play = true, fallbackToFirst = true, minVolumePercent } = opts || {};
  const devices = await getDevices(accessToken);

  // If there is an active device already, use it.
  const active = findActiveDevice(devices);
  if (active?.id) {
    // Optionally nudge volume up if super low (some devices start at 0)
    if (typeof minVolumePercent === 'number' && (active.volume_percent ?? 0) < minVolumePercent) {
      try {
        await transferPlayback(accessToken, active.id, { play, volumePercent: minVolumePercent });
      } catch {
        // ignore
      }
    }
    return active.id;
  }

  // If caller has a preferred device and it's known, activate it.
  const preferred = preferredDeviceId ? devices.find(d => d.id === preferredDeviceId) : null;
  if (preferred?.id) {
    try {
      await transferPlayback(accessToken, preferred.id, { play, volumePercent: minVolumePercent });
      return preferred.id;
    } catch {
      // fall through
    }
  }

  // Otherwise, optionally pick the first available device and activate it.
  if (fallbackToFirst) {
    const first = devices.find(d => !!d.id);
    if (first?.id) {
      try {
        await transferPlayback(accessToken, first.id, { play, volumePercent: minVolumePercent });
        return first.id;
      } catch {
        // ignore
      }
    }
  }

  // No devices available. User needs to open Spotify on any device.
  return null;
}

async function safeText(r: Response) {
  try { return await r.text(); } catch { return ''; }
}