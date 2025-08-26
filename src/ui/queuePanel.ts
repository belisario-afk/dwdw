import type { QueueItem } from '@/queue/songQueue';

type ConnectHandler = (username: string) => void;
type VoidHandler = () => void;
type SimHandler = (user: string, text: string) => void;

export class QueuePanel {
  private panel: HTMLDivElement | null = null;
  private listEl: HTMLDivElement | null = null;
  private statusEl: HTMLSpanElement | null = null;
  private open = false;

  private onConnect?: ConnectHandler;
  private onDisconnect?: VoidHandler;
  private onSimulate?: SimHandler;

  init() {
    if (this.panel) return;
    const host = document.getElementById('panels');
    if (!host) return;

    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.right = '12px';
    panel.style.top = '56px';
    panel.style.width = '340px';
    panel.style.maxHeight = '70vh';
    panel.style.overflow = 'auto';
    panel.style.display = 'none';
    panel.setAttribute('aria-label', 'Song queue');

    panel.innerHTML = `
      <div class="col" style="display:flex; flex-direction:column; gap:10px;">
        <div class="row" style="display:flex; justify-content: space-between; align-items:center;">
          <b>Song Queue</b>
          <span class="badge">TikTok / Manual</span>
        </div>

        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
          <input id="tiktok-username" type="text" placeholder="TikTok username" style="flex:1 1 160px; min-width: 160px; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#171720; color:#fff;" />
          <button id="btn-tt-connect">Connect</button>
          <button id="btn-tt-disconnect">Disconnect</button>
          <span id="tt-status" style="color:#a0a0b2; font-size:12px;">Not connected</span>
        </div>

        <div style="display:flex; gap:6px; align-items:center;">
          <input id="manual-user" type="text" placeholder="Your name" style="flex:0 0 120px; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#171720; color:#fff;" />
          <input id="manual-cmd" type="text" placeholder="Type: !play song -artist" style="flex:1 1 auto; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.1); background:#171720; color:#fff;" />
          <button id="btn-simulate">Send</button>
        </div>

        <div id="queue-list" style="display:flex; flex-direction:column; gap:8px;"></div>
      </div>
    `;
    host.appendChild(panel);
    this.panel = panel;
    this.listEl = panel.querySelector('#queue-list') as HTMLDivElement;
    this.statusEl = panel.querySelector('#tt-status') as HTMLSpanElement;

    const btnConnect = panel.querySelector('#btn-tt-connect') as HTMLButtonElement;
    const btnDisconnect = panel.querySelector('#btn-tt-disconnect') as HTMLButtonElement;
    const inputUser = panel.querySelector('#tiktok-username') as HTMLInputElement;

    btnConnect.onclick = () => {
      const u = inputUser.value.trim();
      if (u) this.onConnect?.(u);
    };
    btnDisconnect.onclick = () => this.onDisconnect?.();

    const simUser = panel.querySelector('#manual-user') as HTMLInputElement;
    const simCmd = panel.querySelector('#manual-cmd') as HTMLInputElement;
    const btnSim = panel.querySelector('#btn-simulate') as HTMLButtonElement;
    btnSim.onclick = () => {
      const user = simUser.value.trim() || 'tester';
      const text = simCmd.value.trim();
      if (text) this.onSimulate?.(user, text);
    };
  }

  toggle() {
    if (!this.panel) this.init();
    if (!this.panel) return;
    this.open = !this.open;
    this.panel.style.display = this.open ? 'block' : 'none';
  }

  setItems(items: QueueItem[]) {
    if (!this.listEl) return;
    this.listEl.innerHTML = items
      .map((i) => `
        <div style="display:flex; align-items:center; gap:8px; border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:6px 8px; background:#101017;">
          ${i.albumArtUrl ? `<img src="${i.albumArtUrl}" alt="" width="40" height="40" style="border-radius:6px; object-fit:cover;" />` : ''}
          <div style="display:flex; flex-direction:column; min-width:0;">
            <div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i.title}</div>
            <div style="color:#a0a0b2; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${i.artist}${i.requestedBy ? ` • requested by ${i.requestedBy}` : ''}</div>
          </div>
        </div>
      `)
      .join('');
  }

  setStatus(text: string) {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  flashAdd(item: QueueItem, user?: string) {
    // Optional: could add a brief highlight animation; for now no-op.
  }

  onConnectTikTok(cb: ConnectHandler) { this.onConnect = cb; }
  onDisconnectTikTok(cb: VoidHandler) { this.onDisconnect = cb; }
  onSimulate(cb: SimHandler) { this.onSimulate = cb; }
}