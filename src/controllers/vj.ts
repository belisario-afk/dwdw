import { SceneManager } from '@visuals/engine';

export class VJ {
  private panel?: HTMLDivElement;
  private open = false;

  constructor(private director: any, private player: any) {}

  togglePanel() {
    if (!this.panel) this.build();
    this.open = !this.open;
    this.panel!.style.display = this.open ? 'block' : 'none';
  }

  private build() {
    const host = document.getElementById('panels')!;
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.style.right = '12px';
    panel.style.top = '56px';
    panel.style.width = '320px';
    panel.style.display = 'none';
    panel.innerHTML = `
      <div class="col">
        <div class="row" style="justify-content: space-between;">
          <b>VJ Controls</b>
          <span class="badge">MIDI/Keys</span>
        </div>
        <label>Intensity <input id="vj-intensity" type="range" min="0" max="1" step="0.01" value="0.7"></label>
        <label>Bloom <input id="vj-bloom" type="range" min="0" max="2" step="0.01" value="0.8"></label>
        <label>Glitch <input id="vj-glitch" type="range" min="0" max="1" step="0.01" value="0.0"></label>
        <label>Speed <input id="vj-speed" type="range" min="0.1" max="2" step="0.01" value="1.0"></label>
        <div class="row" style="justify-content: space-between;">
          <button id="vj-preset-fluid">Fluid</button>
          <button id="vj-preset-particles">Particles</button>
          <button id="vj-preset-tunnel">Tunnel</button>
        </div>
      </div>
    `;
    host.appendChild(panel);
    this.panel = panel;

    const bind = (id: string, cb: (v: number) => void) => {
      (panel.querySelector('#' + id)! as HTMLInputElement).oninput = (e) => cb(Number((e.target as HTMLInputElement).value));
    };
    bind('vj-intensity', v => this.director.sceneManager?.setMacro('intensity', v));
    bind('vj-bloom', v => this.director.sceneManager?.setMacro('bloom', v));
    bind('vj-glitch', v => this.director.sceneManager?.setMacro('glitch', v));
    bind('vj-speed', v => this.director.sceneManager?.setMacro('speed', v));

    (panel.querySelector('#vj-preset-fluid') as HTMLButtonElement).onclick = () => this.director.requestScene('Fluid');
    (panel.querySelector('#vj-preset-particles') as HTMLButtonElement).onclick = () => this.director.requestScene('Particles');
    (panel.querySelector('#vj-preset-tunnel') as HTMLButtonElement).onclick = () => this.director.requestScene('Tunnel');

    window.addEventListener('keydown', (e) => {
      if (!this.open) return;
      switch (e.key) {
        case '1': this.director.requestScene('Fluid'); break;
        case '2': this.director.requestScene('Particles'); break;
        case '3': this.director.requestScene('Tunnel'); break;
        case '4': this.director.requestScene('Terrain'); break;
        case '5': this.director.requestScene('Typography'); break;
        case ' ': this.player.pause(); break;
        case 'Enter': this.player.resume(); break;
      }
    });

    if ((navigator as any).requestMIDIAccess) {
      (navigator as any).requestMIDIAccess().then((midi: any) => {
        for (const input of midi.inputs.values()) {
          input.onmidimessage = (msg: any) => {
            const [status, cc, val] = msg.data;
            if ((status & 0xF0) === 0xB0) {
              const f = val / 127;
              if (cc === 1) this.director.sceneManager?.setMacro('intensity', f);
              if (cc === 2) this.director.sceneManager?.setMacro('bloom', f * 2);
              if (cc === 3) this.director.sceneManager?.setMacro('glitch', f);
              if (cc === 4) this.director.sceneManager?.setMacro('speed', 0.1 + f * 1.9);
            }
          };
        }
      }).catch(() => {});
    }
  }
}