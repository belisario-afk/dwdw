import { Auth } from '@auth/pkce';
import { Emitter } from '@utils/emitter';
import { backoff } from '@utils/net';
import { cacheWithEtag } from '@utils/storage';

type PlaybackState = SpotifyApi.CurrentPlaybackResponse;
type Track = SpotifyApi.TrackObjectFull;
type Device = SpotifyApi.UserDevice;

export class SpotifyAPI extends Emitter<{
  'track-changed': (track: SpotifyApi.TrackObjectFull | null) => void;
  'devices': (devices: Device[]) => void;
}> {
  constructor(private auth: Auth) { super(); }

  private lastPlayback: PlaybackState | null = null;
  private lastPlaybackTimestamp = 0;

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    let token = this.auth.getAccessToken();
    if (!token) {
      await this.auth.refresh().catch(() => {});
      token = this.auth.getAccessToken();
      if (!token) throw new Error('No access token');
    }
    const doFetch = async (): Promise<Response> => {
      const resp = await fetch(`https://api.spotify.com/v1${path}`, {
        ...init,
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(init?.headers || {})
        }
      });
      if (resp.status === 401) {
        await this.auth.refresh().catch(() => {});
        token = this.auth.getAccessToken();
        if (!token) throw new Error('Unauthorized');
        return fetch(`https://api.spotify.com/v1${path}`, {
          ...init,
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...(init?.headers || {})
          }
        });
      }
      return resp;
    };

    const resp = await backoff(doFetch);
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Spotify API ${resp.status}: ${txt}`);
    }
    return resp.json() as Promise<T>;
  }

  async me() {
    return this.request<SpotifyApi.CurrentUsersProfileResponse>('/me');
  }

  async getDevices(): Promise<Device[]> {
    const res = await this.request<SpotifyApi.UserDevicesResponse>('/me/player/devices');
    const devices = res.devices || [];
    this.emit('devices', devices);
    return devices;
  }

  async transferPlayback(deviceId: string, play = true) {
    await this.request<void>('/me/player', {
      method: 'PUT',
      body: JSON.stringify({ device_ids: [deviceId], play })
    });
  }

  async play(options?: SpotifyApi.StartOrResumeUsersPlaybackOptions) {
    await this.request<void>('/me/player/play', {
      method: 'PUT',
      body: JSON.stringify(options || {})
    });
  }

  async pause() {
    await this.request<void>('/me/player/pause', { method: 'PUT' });
  }

  async next() {
    await this.request<void>('/me/player/next', { method: 'POST' });
  }

  async previous() {
    await this.request<void>('/me/player/previous', { method: 'POST' });
  }

  async seek(ms: number) {
    await this.request<void>(`/me/player/seek?position_ms=${Math.floor(ms)}`, { method: 'PUT' });
  }

  async setVolume(volPercent: number) {
    await this.request<void>(`/me/player/volume?volume_percent=${Math.round(volPercent)}`, { method: 'PUT' });
  }

  async getCurrentPlayback(): Promise<PlaybackState | null> {
    const state = await this.request<PlaybackState>('/me/player?additional_types=track');
    this.lastPlayback = state;
    this.lastPlaybackTimestamp = Date.now();
    this.emit(
      'track-changed',
      state && state.item && (state.item as any).type === 'track' ? (state.item as Track) : null
    );
    return state;
  }

  async getCurrentPlaybackCached(): Promise<PlaybackState | null> {
    if (!this.lastPlayback || Date.now() - this.lastPlaybackTimestamp > 3000) {
      return this.getCurrentPlayback();
    }
    if (this.lastPlayback.is_playing) {
      const delta = Date.now() - this.lastPlaybackTimestamp;
      this.lastPlayback.progress_ms = Math.min(
        (this.lastPlayback.progress_ms || 0) + delta,
        ((this.lastPlayback.item as any)?.duration_ms as number) || 0
      );
      this.lastPlaybackTimestamp = Date.now();
    }
    return this.lastPlayback;
  }

  async getAudioFeatures(trackId: string) {
    return this.request<SpotifyApi.AudioFeaturesResponse>(`/audio-features/${trackId}`);
  }

  async getAudioAnalysis(trackId: string) {
    const token = this.auth.getAccessToken();
    return cacheWithEtag(`analysis:${trackId}`, () =>
      fetch(`https://api.spotify.com/v1/audio-analysis/${trackId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      })
    );
  }
}