import { Auth } from '@auth/pkce';
import { SpotifyAPI } from '@spotify/api';

declare global {
  interface Window {
    Spotify?: any;
    onSpotifyWebPlaybackSDKReady?: () => void;
  }
}

export class PlayerController {
  private sdkPlayer: any | null = null;
  private deviceId: string | null = null;
  private deviceReadyPromise: Promise<string> | null = null;
  private deviceReadyResolve: ((id: string) => void) | null = null;

  constructor(private auth: Auth, private api: SpotifyAPI) {}

  private waitForSDK(): Promise<void> {
    if (window.Spotify) return Promise.resolve();
    return new Promise((resolve) => {
      const prev = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => {
        prev?.();
        resolve();
      };
      // Fallback: if SDK already loaded but callback didn't fire
      const check = setInterval(() => {
        if (window.Spotify) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });
  }

  private async ensurePlayer(): Promise<void> {
    if (this.sdkPlayer) return;

    await this.waitForSDK();
    const token = this.auth.getAccessToken();
    if (!token) throw new Error('Not authenticated');

    this.sdkPlayer = new window.Spotify.Player({
      name: 'dwdw Web Player',
      getOAuthToken: (cb: (t: string) => void) => {
        const t = this.auth.getAccessToken();
        if (t) cb(t);
      },
      volume: 0.8
    });

    this.deviceReadyPromise = new Promise<string>((resolve) => {
      this.deviceReadyResolve = resolve;
    });

    this.sdkPlayer.addListener('ready', ({ device_id }: { device_id: string }) => {
      this.deviceId = device_id;
      this.deviceReadyResolve?.(device_id);
    });

    this.sdkPlayer.addListener('not_ready', ({ device_id }: { device_id: string }) => {
      if (this.deviceId === device_id) this.deviceId = null;
    });

    this.sdkPlayer.addListener('initialization_error', ({ message }: { message: string }) => {
      console.error('SDK init error:', message);
    });
    this.sdkPlayer.addListener('authentication_error', ({ message }: { message: string }) => {
      console.error('SDK auth error:', message);
    });
    this.sdkPlayer.addListener('account_error', ({ message }: { message: string }) => {
      console.error('SDK account error:', message);
    });

    await this.sdkPlayer.connect();
  }

  private async waitForDevice(): Promise<string> {
    if (this.deviceId) return this.deviceId;
    if (!this.deviceReadyPromise) {
      // if we got here without ensurePlayer, do it
      await this.ensurePlayer();
    }
    return this.deviceReadyPromise!;
  }

  async ensureActiveDevice(): Promise<string> {
    await this.ensurePlayer();
    const id = await this.waitForDevice();

    // If our device isn't active, transfer playback
    try {
      const devices = await this.api.getDevices();
      const mine = devices.find((d: any) => d.id === id);
      if (!mine?.is_active) {
        await this.api.transferPlayback(id, true);
        // Give it a moment
        await new Promise((r) => setTimeout(r, 300));
      }
    } catch {
      // ignore transient errors
    }
    return id;
  }

  private async authedFetch(url: string, opts: RequestInit) {
    const token = this.auth.getAccessToken();
    if (!token) throw new Error('Not authenticated');
    return fetch(url, {
      ...opts,
      headers: {
        ...(opts.headers || {}),
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
  }

  async resume() {
    const id = await this.ensureActiveDevice();
    await this.authedFetch(`https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: '{}' // required by some browsers
    });
  }

  async pause() {
    await this.ensureActiveDevice();
    await this.authedFetch('https://api.spotify.com/v1/me/player/pause', { method: 'PUT' });
  }

  async next() {
    await this.ensureActiveDevice();
    await this.authedFetch('https://api.spotify.com/v1/me/player/next', { method: 'POST' });
  }

  async previous() {
    await this.ensureActiveDevice();
    await this.authedFetch('https://api.spotify.com/v1/me/player/previous', { method: 'POST' });
  }

  async seek(positionMs: number) {
    await this.ensureActiveDevice();
    const ms = Math.max(0, Math.round(positionMs || 0));
    await this.authedFetch(`https://api.spotify.com/v1/me/player/seek?position_ms=${ms}`, { method: 'PUT' });
  }

  async setVolume(percent: number) {
    await this.ensureActiveDevice();
    const vol = Math.max(0, Math.min(100, Math.round(percent)));
    await this.authedFetch(`https://api.spotify.com/v1/me/player/volume?volume_percent=${vol}`, { method: 'PUT' });
    // Also set local SDK volume for immediate UX feedback
    if (this.sdkPlayer) {
      try {
        await this.sdkPlayer.setVolume(vol / 100);
      } catch {}
    }
  }
}