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
      // Optionally surface a hint to the user here
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
      } catch {
        // Avoid noisy logs; device polling can fail transiently
      }
    };

    // Initial fetch + periodic refresh
    refreshDevices();
    this.devicePoll = window.setInterval(refreshDevices, 5000);
  }

  private stopDevicePolling() {
    if (this.devicePoll !== null) {
      clearInterval(this.devicePoll);
      this.devicePoll = null;
    }
    if (this.els.devpick) this.els.devpick.innerHTML = '';
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

    // Transport controls (guarded)
    if (this.els.play)
      this.els.play.onclick = async () => {
        if (!this.ensureAuthed()) return;
        await this.player.ensureActiveDevice();
        await this.player.resume();
      };
    if (this.els.pause)
      this.els.pause.onclick = async () => {
        if (!this.ensureAuthed()) return;
        await this.player.pause();
      };
    if (this.els.prev)
      this.els.prev.onclick = async () => {
        if (!this.ensureAuthed()) return;
        await this.player.previous();
      };
    if (this.els.next)
      this.els.next.onclick = async () => {
        if (!this.ensureAuthed()) return;
        await this.player.next();
      };

    if (this.els.seek)
      this.els.seek.oninput = async () => {
        if (!this.ensureAuthed()) return;
        const pb = await this.api.getCurrentPlaybackCached().catch(() => null);
        if (pb?.item?.duration_ms) {
          const ms = (Number(this.els.seek!.value) / 1000) * pb.item.duration_ms;
          await this.player.seek(ms);
          // Update aria-valuetext for assistive tech
          this.els.seek!.setAttribute(
            'aria-valuetext',
            `${formatTime(pb.progress_ms || 0)} of ${formatTime(pb.item.duration_ms)}`
          );
        }
      };

    if (this.els.volume)
      this.els.volume.oninput = async () => {
        if (!this.ensureAuthed()) return;
        await this.player.setVolume(Number(this.els.volume!.value));
        // Announce volume to assistive tech
        this.els.volume!.setAttribute('aria-valuetext', `${this.els.volume!.value} percent`);
      };

    // Device picker
    if (this.els.devpick)
      this.els.devpick.onchange = async () => {
        if (!this.ensureAuthed()) return;
        const id = this.els.devpick!.value;
        if (id) await this.api.transferPlayback(id, true);
      };

    // Visual scene controls
    if (this.els.sceneSelect)
      this.els.sceneSelect.onchange = () => {
        const scene = this.els.sceneSelect!.value;
        this.director.requestScene(scene);
      };
    if (this.els.crossfade) this.els.crossfade.onclick = () => this.director.crossfadeNow();
    if (this.els.record) this.els.record.onclick = () => this.toggleRecord();
    if (this.els.vj) this.els.vj.onclick = () => this.vj.togglePanel();
    if (this.els.quality) this.els.quality.onclick = () => this.director.toggleQualityPanel();
    if (this.els.acc) this.els.acc.onclick = () => this.director.toggleAccessibilityPanel();

    // FPS label from director
    this.director.on('fps', (fps) => {
      if (this.els.fpsLabel) this.els.fpsLabel.textContent = `FPS: ${Math.round(fps)}`;
    });

    // React to login/logout to toggle UI and start/stop device polling
    this.auth.on('tokens', (tokens) => {
      if (tokens) {
        if (this.els.login) this.els.login.classList.add('hidden');
        if (this.els.logout) this.els.logout.classList.remove('hidden');
        this.startDevicePolling();
      } else {
        if (this.els.login) this.els.login.classList.remove('hidden');
        if (this.els.logout) this.els.logout.classList.add('hidden');
        if (this.els.userLabel) this.els.userLabel.textContent = '';
        // Reset playback UI on logout
        if (this.els.timeLabel) this.els.timeLabel.textContent = '0:00 / 0:00';
        if (this.els.seek) this.els.seek.value = '0';
        if (this.els.play) this.els.play.classList.remove('hidden');
        if (this.els.pause) this.els.pause.classList.add('hidden');
        this.stopDevicePolling();
      }
    });
  }

  async postLogin() {
    // Called only after we have tokens
    if (!this.auth.getAccessToken()) return;
    try {
      const me = await this.api.me();
      if (this.els.userLabel) this.els.userLabel.textContent = `@${me.display_name || me.id}`;
    } catch (e) {
      console.debug('Failed to fetch profile:', e);
    }

    // Kick device polling (idempotent) and an initial playback update
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
    if (!pb || !pb.item || (pb.item as any).type !== 'track') return;
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