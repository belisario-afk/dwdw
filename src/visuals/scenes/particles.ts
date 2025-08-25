import * as THREE from 'three';
import { VisualScene } from './types';
import { SceneManager } from '@visuals/engine';
import SimplexNoise from 'simplex-noise';

const noise = new SimplexNoise();

class ParticlesScene implements VisualScene {
  name = 'Particles' as const;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.1, 200);
  private mesh?: THREE.Points;
  private material?: THREE.ShaderMaterial;
  private count = 2_000_000;
  private t = 0;

  init(manager: SceneManager): void {
    this.camera.position.z = 4;
    const million = manager.getMacro('particleMillions', 2);
    const count = Math.floor(million * 1_000_000);
    this.count = count;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 4;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
      seeds[i] = Math.random() * 1000;
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Color(manager.getPalette().colors[0]) },
        uColorB: { value: new THREE.Color(manager.getPalette().colors[1]) },
        uIntensity: { value: manager.getMacro('intensity', 0.7) }
      },
      vertexShader: `
        attribute float aSeed;
        uniform float uTime;
        varying float vSeed;
        void main() {
          vSeed = aSeed;
          vec3 p = position;
          float t = uTime * 0.2 + aSeed * 0.01;
          p.x += sin(t + p.y) * 0.2;
          p.y += sin(t * 1.123 + p.z) * 0.2;
          p.z += cos(t * 0.874 + p.x) * 0.2;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 1.0;
        }
      `,
      fragmentShader: `
        precision highp float;
        uniform vec3 uColorA, uColorB;
        uniform float uIntensity;
        varying float vSeed;
        void main() {
          float d = length(gl_PointCoord - vec2(0.5));
          float alpha = smoothstep(0.5, 0.0, d) * uIntensity;
          vec3 col = mix(uColorA, uColorB, fract(vSeed));
          gl_FragColor = vec4(col, alpha);
        }
      `
    });
    this.mesh = new THREE.Points(geometry, this.material);
    this.scene.add(this.mesh);
  }

  update(dt: number, manager: SceneManager): void {
    this.t += dt;
    if (this.material) {
      this.material.uniforms.uTime.value = this.t;
      this.material.uniforms.uIntensity.value = manager.getMacro('intensity', 0.7);
      (this.material.uniforms.uColorA.value as THREE.Color).set(manager.getPalette().colors[0]);
      (this.material.uniforms.uColorB.value as THREE.Color).set(manager.getPalette().colors[1]);
    }
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.autoClear = false;
    renderer.setClearAlpha(0.0);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.mesh?.geometry.dispose();
    (this.mesh?.material as any)?.dispose?.();
  }
  setPalette() {}
}

export const scene = new ParticlesScene();