import { Auth } from '@auth/pkce';
import { SpotifyAPI } from '@spotify/api';
import { PlayerController } from '@spotify/player';
import { VisualDirector } from '@controllers/director';
import { VJ } from '@controllers/vj';
import { formatTime } from '@utils/format';
import { Cache } from '@utils/storage';

export class UI {
  private els = {
    login: document.getElementById('btn-login') as HTMLButtonElement,
    logout: document.getElementById('btn-logout') as HTMLButtonElement,
    userLabel: document.getElementById('user-label') as HTMLSpanElement,
    gpuLabel: document.getElementById('gpu-label') as HTMLSpanElement,
    fpsLabel: document.getElementById('fps-label') as HTMLSpanElement,
    fullscreen: document.getElementById('btn-fullscreen') as HTMLButtonElement,
    play: document.getElementById('btn-play') as HTMLButtonElement,
    pause: document.getElementById('btn-pause') as HTMLButtonElement,
    prev: document.getElementById('btn-prev') as HTMLButtonElement,
    next: document.getElementById('btn-next') as HTMLButtonElement,
    seek: document.getElementById('seek') as HTMLInputElement,
    volume: document.getElementById('volume') as HTMLInputElement,
    devpick: document.getElementById('device-picker') as HTMLSelectElement,
    timeLabel: document.getElementById('time-label') as HTMLSpanElement,
    sceneSelect: document.getElementById('scene-select') as HTMLSelectElement,
    crossfade: document.getElementById('btn-crossfade') as HTMLButtonElement,
    record: document.getElementById('btn-record') as HTMLButtonElement,
    vj: document.getElementById('btn-vj') as HTMLButtonElement,
    quality: document.getElementById('btn-quality') as HTMLButtonElement,
    acc: document.getElementById('btn-accessibility') as HTMLButtonElement,
    panels: document.getElementById('panels') as HTMLDivElement,
    screensaver: document.getElementById('screensaver') as HTMLDivElement
  };

  private recording: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(
    private auth: Auth,
    private api: SpotifyAPI,
    private player: PlayerController,
    private director: VisualDirector,
    private vj: VJ,
    private cache: Cache
  ) {}

  init() {
    this.els.login.onclick = () => this.auth.login();
    this.els.logout.onclick = () => this.auth.logout();
    this.els.fullscreen.onclick = () => {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen();
      else document.exitFullscreen();
    };
    this.els.play.onclick = async () => { await this.player.ensureActiveDevice(); await this.player.resume(); };
    this.els.pause.onclick = async () => { await this.player.pause(); };
    this.els.prev.onclick = async () => { await this.player.previous(); };
    this.els.next.onclick = async () => { await this.player.next(); };
    this.els.seek.oninput = async () => {
      const pb = await this.api.getCurrentPlaybackCached();
      if (pb?.item?.duration_ms) {
        const ms = (Number(this.els.seek.value) / 1000) * pb.item.duration_ms;
        await this.player.seek(ms);
      }
    };
    this.els.volume.oninput = async () => { await this.player.setVolume(Number(this.els.volume.value)); };
    this.els.sceneSelect.onchange = () => {
      const scene = this.els.sceneSelect.value;
      this.director.requestScene(scene);
    };
    this.els.crossfade.onclick = () => this.director.crossfadeNow();
    this.els.record.onclick = () => this.toggleRecord();
    this.els.vj.onclick = () => this.vj.togglePanel();
    this.els.quality.onclick = () => this.director.toggleQualityPanel();
    this.els.acc.onclick = () => this.director.toggleAccessibilityPanel();

    const refreshDevices = async () => {
      const devices = await this.api.getDevices();
      this.els.devpick.innerHTML = '';
      for (const d of devices) {
        const opt = document.createElement('option');
        opt.value = d.id!;
        opt.textContent = `${d.name}${d.is_active ? ' (active)' : ''}`;
        this.els.devpick.appendChild(opt);
        if (d.is_active) this.els.devpick.value = d.id!;
      }
    };
    this.els.devpick.onchange = async () => {
      const id = this.els.devpick.value;
      if (id) await this.api.transferPlayback(id, true);
    };
    setInterval(refreshDevices, 5000);

    this.director.on('fps', (fps) => this.els.fpsLabel.textContent = `FPS: ${Math.round(fps)}`);

    this.auth.on('tokens', (tokens) => {
      if (tokens) {
        this.els.login.classList.add('hidden');
        this.els.logout.classList.remove('hidden');
      } else {
        this.els.login.classList.remove('hidden');
        this.els.logout.classList.add('hidden');
        this.els.userLabel.textContent = '';
      }
    });
  }

  async postLogin() {
    const me = await this.api.me();
    this.els.userLabel.textContent = `@${me.display_name || me.id}`;
    await this.api.getCurrentPlayback();
  }

  setGPULabel(txt: string) {
    this.els.gpuLabel.textContent = 'GPU: ' + txt;
  }

  setScreensaver(on: boolean) {
    this.els.screensaver.classList.toggle('active', on);
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
    this.els.timeLabel.textContent = `${formatTime(cur)} / ${formatTime(dur)}`;
    this.els.seek.value = String(Math.round((1000 * cur) / Math.max(1, dur)));
    if (pb.is_playing) {
      this.els.play.classList.add('hidden');
      this.els.pause.classList.remove('hidden');
    } else {
      this.els.play.classList.remove('hidden');
      this.els.pause.classList.add('hidden');
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
      this.els.record.textContent = '■ Stop';
    } else {
      this.recording.stop();
      this.recording = null;
      this.els.record.textContent = '● Rec';
    }
  }
}