import * as THREE from 'three';
import { VisualScene } from './types';
import { SceneManager } from '@visuals/engine';

class TerrainScene implements VisualScene {
  name = 'Terrain' as const;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
  private mesh?: THREE.Mesh;
  private t = 0;

  init(manager: SceneManager): void {
    this.camera.position.set(0, 2, 3);
    this.camera.lookAt(0, 0, 0);

    const geo = new THREE.PlaneGeometry(8, 8, 256, 256);
    // Fix: orient plane to XZ so it's visible as ground from a perspective camera
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uColA: { value: new THREE.Color(manager.getPalette().colors[0]) },
        uColB: { value: new THREE.Color(manager.getPalette().colors[3] || manager.getPalette().secondary) }
      },
      vertexShader: `
        uniform float uTime;
        varying float vH;
        void main(){
          vec3 p = position;
          float h = sin(p.x*2.0 + uTime*1.0)*0.2 + cos(p.z*2.0 - uTime*0.8)*0.2;
          vH = h*0.5+0.5;
          p.y += h;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        precision highp float;
        varying float vH;
        uniform vec3 uColA, uColB;
        void main(){
          vec3 col = mix(uColA, uColB, vH);
          gl_FragColor = vec4(col, 1.0);
        }
      `
    });

    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = false;
    this.mesh.castShadow = false;
    this.scene.add(this.mesh);

    // Soft ambient light to lift the terrain
    const amb = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(amb);

    // Directional light for subtle shading
    const dir = new THREE.DirectionalLight(0xffffff, 0.6);
    dir.position.set(2, 3, 2);
    this.scene.add(dir);
  }

  update(dt: number, manager: SceneManager): void {
    this.t += dt * manager.getMacro('speed', 1);
    if (this.mesh) {
      const mat = this.mesh.material as THREE.ShaderMaterial;
      mat.uniforms.uTime.value = this.t;
      (mat.uniforms.uColA.value as THREE.Color).set(manager.getPalette().colors[0]);
      (mat.uniforms.uColB.value as THREE.Color).set(manager.getPalette().colors[3] || manager.getPalette().secondary);
    }
    this.camera.position.x = Math.sin(this.t * 0.2) * 1.0;
    this.camera.position.z = 3 + Math.sin(this.t * 0.15) * 0.5;
    this.camera.lookAt(0, 0, 0);
  }

  render(renderer: THREE.WebGLRenderer, _camera: THREE.Camera, weight: number): void {
    const mat = this.mesh?.material as THREE.ShaderMaterial | undefined;
    if (mat) {
      mat.transparent = true;
      mat.opacity = Math.max(0, Math.min(1, weight));
    }
    renderer.render(this.scene, this.camera);
  }

  resize(w: number, h: number): void {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    (this.mesh?.geometry as any)?.dispose?.();
    (this.mesh?.material as any)?.dispose?.();
  }

  setPalette(p: { dominant: string; secondary: string; colors: string[] }) {
    const mat = this.mesh?.material as THREE.ShaderMaterial | undefined;
    if (mat) {
      (mat.uniforms.uColA.value as THREE.Color).set(p.colors[0]);
      (mat.uniforms.uColB.value as THREE.Color).set(p.colors[3] || p.secondary);
    }
  }
}

export const scene = new TerrainScene();