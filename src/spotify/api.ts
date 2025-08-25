import { Auth } from '@auth/pkce';

export class SpotifyAPI {
  constructor(private auth: Auth) {}

  private async request(method: string, path: string, body?: any) {
    const token = this.auth.getAccessToken();
    if (!token) throw Object.assign(new Error('No access token'), { status: 0 });

    const resp = await fetch(`https://api.spotify.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': body ? 'application/json' : undefined
      } as any,
      body: body ? JSON.stringify(body) : undefined
    });

    if (!resp.ok) {
      let detail: any = null;
      try {
        detail = await resp.json();
      } catch {
        try {
          detail = { raw: await resp.text() };
        } catch {}
      }
      const message =
        (detail && (detail.error?.message || detail.message)) ||
        (detail && typeof detail === 'string' && detail) ||
        '';
      const err = Object.assign(
        new Error(`Spotify API ${resp.status}${message ? ': ' + message : ''}`),
        { status: resp.status, payload: detail }
      );
      throw err;
    }
    if (resp.status === 204) return null;
    return resp.json();
  }

  // ... your existing typed wrappers call this.request(...)
  // Example:
  async getDevices() { return this.request('GET', '/me/player/devices'); }
  async getCurrentPlayback() { return this.request('GET', '/me/player'); }
  async getCurrentPlaybackCached() { return this.getCurrentPlayback(); }
  async pause() { return this.request('PUT', '/me/player/pause'); }
  async seek(positionMs: number) { return this.request('PUT', `/me/player/seek?position_ms=${Math.round(positionMs)}`); }
  async transferPlayback(deviceId: string, play = false) {
    return this.request('PUT', '/me/player', { device_ids: [deviceId], play });
  }
  async me() { return this.request('GET', '/me'); }
  async getAudioFeatures(trackId: string) { return this.request('GET', `/audio-features/${trackId}`); }
}