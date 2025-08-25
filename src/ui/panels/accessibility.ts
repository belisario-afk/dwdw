import { SceneManager } from '@visuals/engine';

export class AccessibilityPanel {
  private el: HTMLDivElement;
  private open = false;

  constructor(private manager: SceneManager) {
    this.el = document.createElement('div');
    this.el.className = 'panel';
    this.el.style.left = '12px';
    this.el.style.bottom = '56px';
    this.el.style.width = '320px';
    this.el.style.display = 'none';
    this.el.innerHTML = `
      <div class="col">
        <div class="row" style="justify-content: space-between;">
          <b>Accessibility</b>
          <span class="badge">Safety</span>
        </div>
        <label>Epilepsy Safe <input id="a-epilepsy" type="checkbox" checked></label>
        <label>Intensity Limit <input id="a-intensity" type="range" min="0.2" max="1.0" step="0.05" value="0.8"></label>
        <label>Reduced Motion <input id="a-reduced" type="checkbox"></label>
        <label>High Contrast <input id="a-contrast" type="checkbox"></label>
      </div>
    `;
    document.getElementById('panels')!.appendChild(this.el);

    (this.el.querySelector('#a-epilepsy') as HTMLInputElement).onchange = (e) => {
      this.manager.setAccessibility({ epilepsySafe: (e.target as HTMLInputElement).checked });
    };
    (this.el.querySelector('#a-intensity') as HTMLInputElement).oninput = (e) => {
      this.manager.setAccessibility({ intensityLimit: Number((e.target as HTMLInputElement).value) });
    };
    (this.el.querySelector('#a-reduced') as HTMLInputElement).onchange = (e) => {
      this.manager.setAccessibility({ reducedMotion: (e.target as HTMLInputElement).checked });
    };
    (this.el.querySelector('#a-contrast') as HTMLInputElement).onchange = (e) => {
      this.manager.setAccessibility({ highContrast: (e.target as HTMLInputElement).checked });
    };
  }

  toggle() {
    this.open = !this.open;
    this.el.style.display = this.open ? 'block' : 'none';
  }
}