import * as THREE from 'three';
import { VisualScene } from './types';
import { SceneManager } from '@visuals/engine';

class TypographyScene implements VisualScene {
  name = 'Typography' as const;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat?: THREE.ShaderMaterial;
  private quad?: THREE.Mesh;
  private t = 0;

  init(manager: SceneManager): void {
    const geo = new THREE.PlaneGeometry(2, 2);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(manager.getPalette().dominant) },
        uBg: { value: new THREE.Color('#000000') },
        uWeight: { value: 0.5 },
        uStretch: { value: 1.0 },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
      },
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColor, uBg;
        uniform float uWeight, uStretch;
        uniform vec2 uResolution;

        void main(){
          vec2 res = uResolution;
          vec2 uv = gl_FragCoord.xy / res;
          float y = 0.5 + 0.2*sin(uTime*0.5);
          float band = smoothstep(y-0.02*uStretch, y, uv.y) - smoothstep(y, y+0.02*uStretch, uv.y);
          vec3 col = mix(uBg, uColor, band * (0.5 + uWeight));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      vertexShader: `void main(){ gl_Position=vec4(position,1.0); }`
    });
    this.quad = new THREE.Mesh(geo, this.mat);
    this.scene.add(this.quad);
  }

  update(dt: number, manager: SceneManager): void {
    this.t += dt;
    if (this.mat) {
      this.mat.uniforms.uTime.value = this.t;
      (this.mat.uniforms.uColor.value as THREE.Color).set(manager.getPalette().dominant);
      this.mat.uniforms.uWeight.value = 0.5 + Math.sin(this.t * 2.0) * 0.2 * (manager.getMacro('intensity', 0.7));
      this.mat.uniforms.uStretch.value = 1.0 + Math.sin(this.t * 1.3) * 0.3;
    }
  }

  render(renderer: THREE.WebGLRenderer, _camera: THREE.Camera, weight: number): void {
    if (this.mat) this.mat.opacity = Math.max(0, Math.min(1, weight));
    renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number): void {
    if (this.mat) {
      (this.mat.uniforms.uResolution.value as THREE.Vector2).set(w, h);
    }
  }

  dispose(): void {
    (this.quad?.geometry as any)?.dispose?.();
    (this.quad?.material as any)?.dispose?.();
  }

  setPalette(p: { dominant: string; secondary: string; colors: string[] }) {
    if (this.mat) {
      (this.mat.uniforms.uColor.value as THREE.Color).set(p.dominant);
    }
  }
}

export const scene = new TypographyScene();