// Small helper to list Spotify devices so you can pass a device_id if needed.
export type SpotifyDevice = {
  id: string | null;
  is_active: boolean;
  is_private_session: boolean;
  is_restricted: boolean;
  name: string;
  type: string;
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