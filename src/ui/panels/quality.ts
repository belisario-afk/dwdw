import { SceneManager } from '@visuals/engine';

export class QualityPanel {
  private el: HTMLDivElement;
  private open = false;

  constructor(private manager: SceneManager) {
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.el.style.left = '12px';
    this.el.style.top = '56px';
    this.el.style.width = '360px';
    this.el.style.display = 'none';
    this.el.innerHTML = `
      <div class="col">
        <div class="row" style="justify-content: space-between;">
          <b>Quality</b>
          <span class="badge">Expensive</span>
        </div>
        <label>Render Scale <input id="q-scale" type="range" min="1" max="2" step="0.05" value="1"></label>
        <label>MSAA <input id="q-msaa" type="range" min="0" max="16" step="2" value="0"></label>
        <label>Bloom <input id="q-bloom" type="range" min="0" max="2" step="0.05" value="0.8"></label>
        <label>SSAO <input id="q-ssao" type="checkbox"></label>
        <label>Motion Blur <input id="q-moblur" type="checkbox"></label>
        <label>Raymarch Steps <input id="q-steps" type="range" min="256" max="1024" step="64" value="512"></label>
        <label>Particles (M) <input id="q-particles" type="range" min="1" max="5" step="0.5" value="2"></label>
        <label>Fluid Iterations <input id="q-fluid" type="range" min="10" max="70" step="1" value="35"></label>
      </div>
    `;
    document.getElementById('panels')!.appendChild(this.el);

    (this.el.querySelector('#q-scale') as HTMLInputElement).oninput = (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.manager.setQuality({ scale: v });
    };
    (this.el.querySelector('#q-msaa') as HTMLInputElement).oninput = (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.manager.setQuality({ msaa: v });
    };
    (this.el.querySelector('#q-bloom') as HTMLInputElement).oninput = (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.manager.setPost({ bloom: v });
    };
    (this.el.querySelector('#q-ssao') as HTMLInputElement).onchange = (e) => {
      const v = (e.target as HTMLInputElement).checked;
      this.manager.setPost({ ssao: v });
    };
    (this.el.querySelector('#q-moblur') as HTMLInputElement).onchange = (e) => {
      const v = (e.target as HTMLInputElement).checked;
      this.manager.setPost({ motionBlur: v });
    };
    (this.el.querySelector('#q-steps') as HTMLInputElement).oninput = (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.manager.setMacro('raymarchSteps', v);
    };
    (this.el.querySelector('#q-particles') as HTMLInputElement).oninput = (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.manager.setMacro('particleMillions', v);
    };
    (this.el.querySelector('#q-fluid') as HTMLInputElement).oninput = (e) => {
      const v = Number((e.target as HTMLInputElement).value);
      this.manager.setMacro('fluidIters', v);
    };
  }

  toggle() {
    this.open = !this.open;
    this.el.style.display = this.open ? 'block' : 'none';
  }
}