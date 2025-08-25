import * as THREE from 'three';
import { VisualScene } from './types';
import { SceneManager } from '@visuals/engine';

class FluidScene implements VisualScene {
  name = 'Fluid' as const;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat?: THREE.ShaderMaterial;
  private quad?: THREE.Mesh;
  private t = 0;

  init(manager: SceneManager): void {
    const geo = new THREE.PlaneGeometry(2, 2);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uColA: { value: new THREE.Color(manager.getPalette().colors[0]) },
        uColB: { value: new THREE.Color(manager.getPalette().colors[2]) },
        uIters: { value: manager.getMacro('fluidIters', 35) }
      },
      fragmentShader: `
        precision highp float;
        uniform float uTime;
        uniform vec3 uColA, uColB;
        uniform float uIters;
        void main(){
          vec2 res = vec2(${window.innerWidth.toFixed(1)}, ${window.innerHeight.toFixed(1)});
          vec2 uv = gl_FragCoord.xy / res;
          vec2 p = uv*2.0-1.0;
          float a = 0.0;
          vec2 v = p;
          for(int i=0;i<128;i++){
            if(float(i)>uIters) break;
            float t = uTime*0.1;
            v += 0.01*vec2(sin(v.y*3.0+t), cos(v.x*3.0-t));
            a += length(v)*0.001;
          }
          vec3 col = mix(uColA, uColB, smoothstep(0.0,1.0,a));
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
      (this.mat.uniforms.uColA.value as THREE.Color).set(manager.getPalette().colors[0]);
      (this.mat.uniforms.uColB.value as THREE.Color).set(manager.getPalette().colors[2]);
      this.mat.uniforms.uIters.value = manager.getMacro('fluidIters', 35);
    }
  }
  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }
  dispose(): void {
    (this.quad?.geometry as any)?.dispose?.();
    (this.quad?.material as any)?.dispose?.();
  }
}

export const scene = new FluidScene();