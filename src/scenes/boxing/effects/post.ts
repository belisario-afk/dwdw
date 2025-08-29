// Post-processing effects for Boxing scene
// - Renderer wrapper that conditionally adds FXAA and vignette node
// - No heavy composer; keep it lean
// - Only on medium/high quality

import * as THREE from 'three';
import { EffectComposer } from 'postprocessing';
import { RenderPass, EffectPass, FXAAEffect, VignetteEffect } from 'postprocessing';
import type { QualityFlags } from '../quality';

export class PostProcessingManager {
  private composer: EffectComposer | null = null;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private quality: QualityFlags;
  private enabled: boolean;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    quality: QualityFlags
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.enabled = quality.fxaa; // Only enable post if FXAA is supported

    if (this.enabled) {
      this.setupComposer();
    }
  }

  private setupComposer(): void {
    if (!this.enabled) return;

    try {
      this.composer = new EffectComposer(this.renderer);

      // Base render pass
      const renderPass = new RenderPass(this.scene, this.camera);
      this.composer.addPass(renderPass);

      // Create effects array
      const effects: any[] = [];

      // FXAA for anti-aliasing
      if (this.quality.fxaa) {
        const fxaaEffect = new FXAAEffect();
        effects.push(fxaaEffect);
      }

      // Subtle vignette for cinematic feel
      const vignetteEffect = new VignetteEffect({
        darkness: 0.5,
        offset: 0.3
      });
      effects.push(vignetteEffect);

      // Add effect pass if we have effects
      if (effects.length > 0) {
        const effectPass = new EffectPass(this.camera, ...effects);
        effectPass.renderToScreen = true;
        this.composer.addPass(effectPass);
      }

    } catch (error) {
      console.warn('Post-processing setup failed, falling back to direct rendering:', error);
      this.enabled = false;
      this.composer = null;
    }
  }

  render(): void {
    if (this.enabled && this.composer) {
      this.composer.render();
    } else {
      // Fallback to direct rendering
      this.renderer.render(this.scene, this.camera);
    }
  }

  setSize(width: number, height: number): void {
    if (this.composer) {
      this.composer.setSize(width, height);
    }
  }

  dispose(): void {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.enabled = false;
  }
}

/* ========= Alternative lightweight post-processing for compatibility ========= */
export class LightweightPostProcessor {
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private quality: QualityFlags;
  
  // Lightweight screen quad for vignette
  private vignetteScene: THREE.Scene | null = null;
  private vignetteCamera: THREE.OrthographicCamera | null = null;
  private vignetteMaterial: THREE.ShaderMaterial | null = null;
  private enabled: boolean;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    quality: QualityFlags
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = quality;
    this.enabled = quality.fxaa && this.quality.fxaa; // Only if medium/high quality

    if (this.enabled) {
      this.setupVignette();
    }
  }

  private setupVignette(): void {
    if (!this.enabled) return;

    // Create vignette quad
    this.vignetteScene = new THREE.Scene();
    this.vignetteCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const vignetteVertexShader = `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `;

    const vignetteFragmentShader = `
      uniform sampler2D tDiffuse;
      uniform float darkness;
      uniform float offset;
      varying vec2 vUv;
      
      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        
        vec2 uv = (vUv - 0.5) * 2.0;
        float dist = length(uv);
        float vignette = smoothstep(offset, 1.0, dist);
        
        color.rgb = mix(color.rgb, color.rgb * (1.0 - darkness), vignette);
        
        gl_FragColor = color;
      }
    `;

    this.vignetteMaterial = new THREE.ShaderMaterial({
      uniforms: {
        tDiffuse: { value: null },
        darkness: { value: 0.3 },
        offset: { value: 0.4 }
      },
      vertexShader: vignetteVertexShader,
      fragmentShader: vignetteFragmentShader
    });

    const quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      this.vignetteMaterial
    );
    this.vignetteScene.add(quad);
  }

  render(): void {
    if (!this.enabled) {
      // Direct rendering
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // This would require render targets for proper implementation
    // For now, fall back to direct rendering
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    if (this.vignetteMaterial) {
      this.vignetteMaterial.dispose();
      this.vignetteMaterial = null;
    }
    
    if (this.vignetteScene) {
      this.vignetteScene.clear();
      this.vignetteScene = null;
    }
    
    this.vignetteCamera = null;
    this.enabled = false;
  }
}

/* ========= Post-processing factory ========= */
export function createPostProcessor(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  quality: QualityFlags
): PostProcessingManager | LightweightPostProcessor {
  
  // Try full post-processing first
  try {
    return new PostProcessingManager(renderer, scene, camera, quality);
  } catch (error) {
    console.warn('Using lightweight post-processing fallback');
    return new LightweightPostProcessor(renderer, scene, camera, quality);
  }
}