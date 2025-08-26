import { Auth } from '@auth/pkce';
import { getAudioFeatures as getAudioFeaturesSafe } from '@/lib/spotifyAudioFeatures';

export class SpotifyAPI {
  constructor(private auth: Auth) {}

  private async request(method: string, path: string, body?: any) {
    const token = this.auth.getAccessToken();
    if (!token) throw Object.assign(new Error('No access token'), { status: 0 });

    const resp = await fetch(`https://api.spotify.com/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (!resp.ok) {
      let detail: any = null;
      try { detail = await resp.json(); } catch { try { detail = { raw: await resp.text() }; } catch {} }
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

  async me() { return this.request('GET', '/me'); }
  async getDevices() { return this.request('GET', '/me/player/devices'); }
  async transferPlayback(deviceId: string, play = false) {
    return this.request('PUT', '/me/player', { device_ids: [deviceId], play });
  }
  async getCurrentPlayback() { return this.request('GET', '/me/player'); }
  async getCurrentPlaybackCached() { return this.getCurrentPlayback(); }

  async pause() { return this.request('PUT', '/me/player/pause'); }
  async seek(positionMs: number) { return this.request('PUT', `/me/player/seek?position_ms=${Math.round(positionMs)}`); }

  // Updated: route through safe helper with neutral fallbacks on errors (e.g., 403)
  async getAudioFeatures(trackId: string) {
    const token = this.auth.getAccessToken();
    if (!token) throw Object.assign(new Error('No access token'), { status: 0 });
    return getAudioFeaturesSafe(trackId, token);
  }

  async getAudioAnalysis(trackId: string) { return this.request('GET', `/audio-analysis/${trackId}`); }

  // NEW: Search for tracks
  async searchTracks(query: string, limit = 5) {
    const q = encodeURIComponent(query);
    return this.request('GET', `/search?type=track&limit=${limit}&q=${q}`);
  }

  // NEW: Add to queue (optionally target specific device)
  async addToQueue(uri: string, deviceId?: string) {
    const qs = new URLSearchParams({ uri });
    if (deviceId) qs.append('device_id', deviceId);
    return this.request('POST', `/me/player/queue?${qs.toString()}`);
  }
}