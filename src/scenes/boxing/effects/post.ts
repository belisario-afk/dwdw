// Post-processing effects for Boxing scene
// - Renderer wrapper that conditionally adds FXAA and vignette node
// - No heavy composer; keep it lean
// - Only on medium/high quality

import * as THREE from 'three';
import type { QualityFlags } from '../quality';

// Fallback post-processing since we don't have postprocessing module
export class PostProcessingManager {
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
    this.enabled = false; // Disabled for now until we have postprocessing

    console.log('PostProcessing: Using fallback renderer (postprocessing module not available)');
  }

  render(): void {
    // Direct rendering without post-processing for now
    this.renderer.render(this.scene, this.camera);
  }

  setSize(width: number, height: number): void {
    // No additional handling needed for direct rendering
  }

  dispose(): void {
    this.enabled = false;
  }
}

/* ========= Alternative lightweight post-processing for compatibility ========= */
export class LightweightPostProcessor extends PostProcessingManager {
  // Same implementation as PostProcessingManager for now
}

/* ========= Post-processing factory ========= */
export function createPostProcessor(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  quality: QualityFlags
): PostProcessingManager {
  
  // Use lightweight fallback
  console.log('Using lightweight post-processing fallback');
  return new PostProcessingManager(renderer, scene, camera, quality);
}