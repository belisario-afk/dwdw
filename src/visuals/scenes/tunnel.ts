import * as THREE from 'three';
import { VisualScene } from './types';
import { SceneManager } from '@visuals/engine';

class TunnelScene implements VisualScene {
  name = 'Tunnel' as const;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat?: THREE.ShaderMaterial;
  private quad?: THREE.Mesh;

  init(manager: SceneManager): void {
    const geo = new THREE.PlaneGeometry(2, 2);
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColA: { value: new THREE.Color(manager.getPalette().dominant) },
        uColB: { value: new THREE.Color(manager.getPalette().secondary) },
        uSteps: { value: manager.getMacro('raymarchSteps', 512) },
        uBloom: { value: manager.getMacro('bloom', 0.8) },
        uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) }
      },
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColA, uColB;
        uniform float uSteps;
        uniform float uBloom;
        uniform vec2 uResolution;

        float map(vec3 p) {
          float t = sin(p.z*2.0 + uTime*0.5)*0.2;
          float r = length(p.xy) - (0.5 + t);
          return r;
        }
        void main() {
          vec2 res = uResolution;
          vec2 uv = (gl_FragCoord.xy / res) * 2.0 - 1.0;
          vec3 ro = vec3(0.0, 0.0, uTime*0.7);
          vec3 rd = normalize(vec3(uv, 1.5));
          float t = 0.0;
          float glow = 0.0;
          for (int i = 0; i < 1024; i++) {
            if (float(i) > uSteps) break;
            vec3 p = ro + rd * t;
            float d = map(p);
            glow += exp(-abs(d)*10.0)*0.01;
            t += 0.05 + d * 0.5;
          }
          vec3 col = mix(uColA, uColB, sin(uTime*0.5)*0.5+0.5);
          col += glow * (0.5 + uBloom);
          gl_FragColor = vec4(col, 1.0);
        }
      `,
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position,1.0); }`
    });
    this.quad = new THREE.Mesh(geo, this.mat);
    this.scene.add(this.quad);
  }

  update(dt: number, manager: SceneManager): void {
    if (this.mat) {
      this.mat.uniforms.uTime.value += dt * (manager.getMacro('speed', 1));
      (this.mat.uniforms.uColA.value as THREE.Color).set(manager.getPalette().dominant);
      (this.mat.uniforms.uColB.value as THREE.Color).set(manager.getPalette().secondary);
      this.mat.uniforms.uSteps.value = manager.getMacro('raymarchSteps', 512);
      this.mat.uniforms.uBloom.value = manager.getMacro('bloom', 0.8);
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
      (this.mat.uniforms.uColA.value as THREE.Color).set(p.dominant);
      (this.mat.uniforms.uColB.value as THREE.Color).set(p.secondary);
    }
  }
}

export const scene = new TunnelScene();