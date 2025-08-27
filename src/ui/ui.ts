import { Auth } from '@auth/pkce';
import { SpotifyAPI } from '@spotify/api';
import { PlayerController } from '@spotify/player';
import { VisualDirector } from '@controllers/director';
import { VJ } from '@controllers/vj';
import { formatTime } from '@utils/format';
import { Cache } from '@utils/storage';

export class UI {
  private els = {
    login: document.getElementById('btn-login') as HTMLButtonElement | null,
    logout: document.getElementById('btn-logout') as HTMLButtonElement | null,
    userLabel: document.getElementById('user-label') as HTMLSpanElement | null,
    gpuLabel: document.getElementById('gpu-label') as HTMLSpanElement | null,
    fpsLabel: document.getElementById('fps-label') as HTMLSpanElement | null,
    fullscreen: document.getElementById('btn-fullscreen') as HTMLButtonElement | null,
    play: document.getElementById('btn-play') as HTMLButtonElement | null,
    pause: document.getElementById('btn-pause') as HTMLButtonElement | null,
    prev: document.getElementById('btn-prev') as HTMLButtonElement | null,
    next: document.getElementById('btn-next') as HTMLButtonElement | null,
    seek: document.getElementById('seek') as HTMLInputElement | null,
    volume: document.getElementById('volume') as HTMLInputElement | null,
    devpick: document.getElementById('device-picker') as HTMLSelectElement | null,
    timeLabel: document.getElementById('time-label') as HTMLSpanElement | null,
    sceneSelect: document.getElementById('scene-select') as HTMLSelectElement | null,
    crossfade: document.getElementById('btn-crossfade') as HTMLButtonElement | null,
    record: document.getElementById('btn-record') as HTMLButtonElement | null,
    vj: document.getElementById('btn-vj') as HTMLButtonElement | null,
    quality: document.getElementById('btn-quality') as HTMLButtonElement | null,
    acc: document.getElementById('btn-accessibility') as HTMLButtonElement | null,
    panels: document.getElementById('panels') as HTMLDivElement | null,
    screensaver: document.getElementById('screensaver') as HTMLDivElement | null
  };

  private recording: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private devicePoll: number | null = null;
  private seekTimer: number | null = null;

  constructor(
    private auth: Auth,
    private api: SpotifyAPI,
    private player: PlayerController,
    private director: VisualDirector,
    private vj: VJ,
    private cache: Cache
  ) {}

  private ensureAuthed(): boolean {
    if (!this.auth.getAccessToken()) {
      console.debug('Action requires login.');
      return false;
    }
    return true;
  }

  private startDevicePolling() {
    if (this.devicePoll !== null) return;
    const refreshDevices = async () => {
      if (!this.auth.getAccessToken()) return;
      try {
        const devices = await this.api.getDevices();
        if (!this.els.devpick) return;
        this.els.devpick.innerHTML = '';
        for (const d of devices) {
          const opt = document.createElement('option');
          opt.value = d.id || '';
          opt.textContent = `${d.name}${d.is_active ? ' (active)' : ''}`;
          this.els.devpick.appendChild(opt);
          if (d.is_active && d.id) this.els.devpick.value = d.id;
        }
        // Enable/disable transport based on whether we have any devices
        const hasDevices = devices.length > 0;
        this.setTransportEnabled(hasDevices);
      } catch {
        // ignore transient errors
      }
    };
    refreshDevices();
    this.devicePoll = window.setInterval(refreshDevices, 5000);
  }

  private stopDevicePolling() {
    if (this.devicePoll !== null) {
      clearInterval(this.devicePoll);
      this.devicePoll = null;
    }
    if (this.els.devpick) this.els.devpick.innerHTML = '';
    this.setTransportEnabled(false);
  }

  private setTransportEnabled(on: boolean) {
    const btns = [this.els.play, this.els.pause, this.els.prev, this.els.next];
    btns.forEach((b) => b && (b.disabled = !on));
    if (this.els.seek) this.els.seek.disabled = !on;
    if (this.els.volume) this.els.volume.disabled = !on;
  }

  init() {
    // Auth/UI controls
    if (this.els.login) this.els.login.onclick = () => this.auth.login();
    if (this.els.logout) this.els.logout.onclick = () => this.auth.logout();
    if (this.els.fullscreen)
      this.els.fullscreen.onclick = () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen();
        else document.exitFullscreen();
      };

    // Transport controls
    if (this.els.play)
      this.els.play.onclick = async () => {
        if (!this.ensureAuthed()) return;
        try {
          await this.player.ensureActiveDevice();
          await this.player.resume();
        } catch (e) {
          console.debug('Play failed', e);
        }
      };
    if (this.els.pause)
      this.els.pause.onclick = async () => {
        if (!this.ensureAuthed()) return;
        try {
          await this.player.pause();
        } catch (e) {
          console.debug('Pause failed', e);
        }
      };
    if (this.els.prev)
      this.els.prev.onclick = async () => {
        if (!this.ensureAuthed()) return;
        try {
          await this.player.previous();
        } catch (e) {
          console.debug('Previous failed', e);
        }
      };
    if (this.els.next)
      this.els.next.onclick = async () => {
        if (!this.ensureAuthed()) return;
        try {
          await this.player.next();
        } catch (e) {
          console.debug('Next failed', e);
        }
      };

    // Seek with debounce
    if (this.els.seek)
      this.els.seek.oninput = async () => {
        const val = Number(this.els.seek!.value);
        this.els.seek!.setAttribute('aria-valuetext', `${val / 10}%`);
        if (!this.ensureAuthed()) return;
        if (this.seekTimer) window.clearTimeout(this.seekTimer);
        this.seekTimer = window.setTimeout(async () => {
          try {
            const pb = await this.api.getCurrentPlaybackCached().catch(() => null);
            if (pb?.item?.duration_ms) {
              const ms = (val / 1000) * pb.item.duration_ms;
              await this.player.seek(ms);
            }
          } catch (e) {
            console.debug('Seek failed', e);
          }
        }, 120);
      };

    if (this.els.volume)
      this.els.volume.oninput = async () => {
        if (!this.ensureAuthed()) return;
        try {
          await this.player.setVolume(Number(this.els.volume!.value));
          this.els.volume!.setAttribute('aria-valuetext', `${this.els.volume!.value} percent`);
        } catch (e) {
          console.debug('Volume failed', e);
        }
      };

    // Device picker
    if (this.els.devpick)
      this.els.devpick.onchange = async () => {
        if (!this.ensureAuthed()) return;
        const id = this.els.devpick!.value;
        if (id) {
          try {
            await this.api.transferPlayback(id, true);
          } catch (e) {
            console.debug('Transfer playback failed', e);
          }
        }
      };

    // Visual scene controls + panels
    if (this.els.sceneSelect)
      this.els.sceneSelect.onchange = () => {
        const scene = this.els.sceneSelect!.value;
        this.director.requestScene(scene);
      };
    if (this.els.crossfade) this.els.crossfade.onclick = () => this.director.crossfadeNow();
    if (this.els.record) this.els.record.onclick = () => this.toggleRecord();
    if (this.els.vj) this.els.vj.onclick = () => this.vj.togglePanel();
    // Removed duplicate handlers for Quality and Accessibility.
    // Director auto-wires these buttons and handles keyboard shortcuts.

    // FPS label from director
    this.director.on('fps', (fps) => {
      if (this.els.fpsLabel) this.els.fpsLabel.textContent = `FPS: ${Math.round(fps)}`;
    });

    // React to login/logout
    this.auth.on('tokens', (tokens) => {
      if (tokens) {
        if (this.els.login) this.els.login.classList.add('hidden');
        if (this.els.logout) this.els.logout.classList.remove('hidden');
        this.startDevicePolling();
      } else {
        if (this.els.login) this.els.login.classList.remove('hidden');
        if (this.els.logout) this.els.logout.classList.add('hidden');
        if (this.els.userLabel) this.els.userLabel.textContent = '';
        if (this.els.timeLabel) this.els.timeLabel.textContent = '0:00 / 0:00';
        if (this.els.seek) this.els.seek.value = '0';
        if (this.els.play) this.els.play.classList.remove('hidden');
        if (this.els.pause) this.els.pause.classList.add('hidden');
        this.stopDevicePolling();
      }
    });
  }

  async postLogin() {
    if (!this.auth.getAccessToken()) return;
    try {
      const me = await this.api.me();
      if (this.els.userLabel) this.els.userLabel.textContent = `@${me.display_name || me.id}`;
    } catch (e) {
      console.debug('Failed to fetch profile:', e);
    }
    // Enable audio-reactive features after login
    this.director.setFeaturesEnabled(true);

    this.startDevicePolling();
    try {
      const pb = await this.api.getCurrentPlaybackCached();
      this.updatePlayback(pb);
    } catch {
      // ignore
    }
  }

  setGPULabel(txt: string) {
    if (this.els.gpuLabel) this.els.gpuLabel.textContent = 'GPU: ' + txt;
  }

  setScreensaver(on: boolean) {
    if (this.els.screensaver) this.els.screensaver.classList.toggle('active', on);
  }

  applyPalette(p: { dominant: string; secondary: string; colors: string[] }) {
    document.documentElement.style.setProperty('--accent', p.dominant);
    document.documentElement.style.setProperty('--accent-2', p.secondary);
    p.colors.slice(0, 4).forEach((c, i) => {
      document.documentElement.style.setProperty(`--album-${i}`, c);
    });
  }

  updatePlayback(pb: SpotifyApi.CurrentPlaybackResponse | null) {
    if (!pb || !pb.item || (pb.item as any).type !== 'track') {
      // No track; show play button
      if (this.els.play) this.els.play.classList.remove('hidden');
      if (this.els.pause) this.els.pause.classList.add('hidden');
      return;
    }
    const track = pb.item as SpotifyApi.TrackObjectFull;
    const dur = track.duration_ms || 0;
    const cur = pb.progress_ms || 0;
    if (this.els.timeLabel) this.els.timeLabel.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    if (this.els.seek) {
      this.els.seek.value = String(Math.round((1000 * cur) / Math.max(1, dur)));
      this.els.seek.setAttribute('aria-valuetext', `${formatTime(cur)} of ${formatTime(dur)}`);
    }
    if (pb.is_playing) {
      if (this.els.play) this.els.play.classList.add('hidden');
      if (this.els.pause) this.els.pause.classList.remove('hidden');
    } else {
      if (this.els.play) this.els.play.classList.remove('hidden');
      if (this.els.pause) this.els.pause.classList.add('hidden');
    }
  }

  async toggleRecord() {
    if (!this.recording) {
      const canvas = this.director.getCanvas();
      const stream = canvas.captureStream(60);
      const rec = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
      rec.ondataavailable = (e) => { if (e.data.size > 0) this.chunks.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(this.chunks, { type: 'video/webm' });
        this.chunks = [];
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `dwdw-${Date.now()}.webm`;
        a.click();
      };
      rec.start();
      this.recording = rec;
      if (this.els.record) this.els.record.textContent = '■ Stop';
    } else {
      this.recording.stop();
      this.recording = null;
      if (this.els.record) this.els.record.textContent = '● Rec';
    }
  }
}