import { Auth } from '@auth/pkce';
import { SpotifyAPI } from './api';
import { Emitter } from '@utils/emitter';

type Events = {
  'ready': (deviceId: string) => void;
  'state': (state: Spotify.PlaybackState | null) => void;
  'connected': (ok: boolean) => void;
}

export class PlayerController extends Emitter<Events> {
  private player?: Spotify.Player;
  private deviceId: string | null = null;

  constructor(private auth: Auth, private api: SpotifyAPI) {
    super();
    (window as any).onSpotifyWebPlaybackSDKReady = () => this.init();
    setTimeout(() => {
      if ((window as any).Spotify && !(this as any)._inited) {
        this.init();
      }
    }, 500);
  }

  getDeviceId() { return this.deviceId; }
  isConnected() { return !!this.player; }

  private init() {
    (this as any)._inited = true;
    const token = this.auth.getAccessToken();
    if (!token) return;
    const Spotify = (window as any).Spotify;
    if (!Spotify) return;

    this.player = new Spotify.Player({
      name: 'dwdw Web Player',
      volume: 0.8,
      getOAuthToken: (cb: (tk: string) => void) => {
        const t = this.auth.getAccessToken();
        if (t) cb(t);
      }
    });

    this.player.addListener('ready', ({ device_id }: any) => {
      this.deviceId = device_id;
      this.emit('ready', device_id);
    });
    this.player.addListener('not_ready', ({ device_id }: any) => {
      if (this.deviceId === device_id) this.deviceId = null;
    });
    this.player.addListener('player_state_changed', (state: any) => {
      this.emit('state', state);
    });
    this.player.addListener('initialization_error', ({ message }: any) => console.error(message));
    this.player.addListener('authentication_error', ({ message }: any) => console.error(message));
    this.player.addListener('account_error', ({ message }: any) => console.error(message));

    this.player.connect().then(ok => this.emit('connected', ok));
  }

  async ensureActiveDevice() {
    if (!this.deviceId) return null;
    const devices = await this.api.getDevices();
    const active = devices.find(d => d.is_active);
    if (active?.id === this.deviceId) return this.deviceId;
    await this.api.transferPlayback(this.deviceId!, true);
    return this.deviceId;
  }

  async resume() { await this.api.play(); }
  async pause() { await this.api.pause(); }
  async next() { await this.api.next(); }
  async previous() { await this.api.previous(); }
  async seek(ms: number) { await this.api.seek(ms); }
  async setVolume(percent: number) {
    try {
      await this.api.setVolume(percent);
    } catch {
      await this.player?.setVolume(Math.max(0, Math.min(1, percent / 100)));
    }
  }
}