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
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColA: { value: new THREE.Color(manager.getPalette().colors[0]) },
        uColB: { value: new THREE.Color(manager.getPalette().colors[3]) }
      },
      vertexShader: `
        uniform float uTime;
        varying float vH;
        void main(){
          vec3 p = position;
          float h = sin(p.x*2.0 + uTime*1.0)*0.2 + cos(p.y*2.0 - uTime*0.8)*0.2;
          vH = h*0.5+0.5;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p.x, h, p.y, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uColA, uColB;
        varying float vH;
        void main(){
          vec3 col = mix(uColA, uColB, vH);
          gl_FragColor = vec4(col, 1.0);
        }`
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.scene.add(this.mesh);

    const light = new THREE.DirectionalLight(0xffffff, 0.5);
    light.position.set(1, 2, 1);
    this.scene.add(light);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));
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
  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }
  dispose(): void {
    (this.mesh?.geometry as any)?.dispose?.();
    (this.mesh?.material as any)?.dispose?.();
  }
}

export const scene = new TerrainScene();