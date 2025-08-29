// Camera director for Boxing scene
// - Shot director: base framing, zoom on nearing KO, tasteful shake on impacts
// - Slight lateral drift
// - Avoids motion sickness

import * as THREE from 'three';
import { damp, clamp } from './math';
import type { HitResult } from './collision';

export interface CameraConfig {
  baseFov: number;
  basePosition: THREE.Vector3;
  baseTarget: THREE.Vector3;
  maxShake: number;
  maxZoom: number;
  reduceMotion: boolean;
}

export class BoxingCameraDirector {
  private camera: THREE.PerspectiveCamera;
  private config: CameraConfig;
  
  // Camera state
  private basePosition = new THREE.Vector3();
  private baseTarget = new THREE.Vector3();
  private currentShake = 0;
  private currentZoom = 0;
  private driftOffset = new THREE.Vector3();
  private time = 0;

  // Shake parameters
  private shakeDecay = 8;
  private shakeMagnitude = 1;
  private shakeFrequency = 25;

  constructor(camera: THREE.PerspectiveCamera, config: Partial<CameraConfig> = {}) {
    this.camera = camera;
    this.config = {
      baseFov: 60,
      basePosition: new THREE.Vector3(0, 3, 12),
      baseTarget: new THREE.Vector3(0, 2, 0),
      maxShake: 0.8,
      maxZoom: 15,
      reduceMotion: false,
      ...config
    };

    this.basePosition.copy(this.config.basePosition);
    this.baseTarget.copy(this.config.baseTarget);
    
    this.setupInitialPosition();
  }

  private setupInitialPosition(): void {
    this.camera.position.copy(this.basePosition);
    this.camera.lookAt(this.baseTarget);
    this.camera.fov = this.config.baseFov;
    this.camera.updateProjectionMatrix();
  }

  update(deltaTime: number, sceneTime: number): void {
    this.time = sceneTime;
    
    this.updateShake(deltaTime);
    this.updateDrift(deltaTime);
    this.updateCameraTransform();
  }

  private updateShake(deltaTime: number): void {
    // Decay shake over time
    this.currentShake = damp(this.currentShake, 0, this.shakeDecay, deltaTime);
  }

  private updateDrift(deltaTime: number): void {
    // Subtle lateral drift for organic feel
    const driftSpeed = 0.3;
    const driftAmount = this.config.reduceMotion ? 0.1 : 0.3;
    
    this.driftOffset.x = Math.sin(this.time * driftSpeed) * driftAmount;
    this.driftOffset.y = Math.sin(this.time * driftSpeed * 0.7) * driftAmount * 0.5;
    this.driftOffset.z = Math.cos(this.time * driftSpeed * 0.5) * driftAmount * 0.3;
  }

  private updateCameraTransform(): void {
    // Start with base position and target
    const position = this.basePosition.clone();
    const target = this.baseTarget.clone();

    // Apply drift
    position.add(this.driftOffset);

    // Apply zoom (move camera closer on intense moments)
    if (this.currentZoom > 0) {
      const zoomDirection = this.baseTarget.clone().sub(this.basePosition).normalize();
      position.addScaledVector(zoomDirection, this.currentZoom);
    }

    // Apply shake
    if (this.currentShake > 0 && !this.config.reduceMotion) {
      const shakeOffset = this.calculateShakeOffset();
      position.add(shakeOffset);
      target.add(shakeOffset.multiplyScalar(0.3)); // Target shakes less than camera
    }

    // Update camera
    this.camera.position.copy(position);
    this.camera.lookAt(target);
  }

  private calculateShakeOffset(): THREE.Vector3 {
    const intensity = this.currentShake * this.shakeMagnitude;
    const frequency = this.shakeFrequency;
    
    // Multi-octave noise for more organic shake
    const x = Math.sin(this.time * frequency) * intensity +
             Math.sin(this.time * frequency * 2.3) * intensity * 0.5 +
             Math.sin(this.time * frequency * 4.7) * intensity * 0.25;
             
    const y = Math.cos(this.time * frequency * 1.3) * intensity +
             Math.cos(this.time * frequency * 3.1) * intensity * 0.5 +
             Math.cos(this.time * frequency * 5.9) * intensity * 0.25;
             
    const z = Math.sin(this.time * frequency * 0.7) * intensity * 0.3 +
             Math.sin(this.time * frequency * 2.9) * intensity * 0.15;

    return new THREE.Vector3(x, y, z);
  }

  /* ========= External events ========= */

  onHit(result: HitResult): void {
    if (!result.hit) return;

    // Calculate shake intensity based on hit power and mitigation
    let shakeIntensity = result.power * 0.6;
    
    if (result.mitigated) {
      shakeIntensity *= 0.4; // Reduced shake for blocked/mitigated hits
    }

    // Apply motion reduction preference
    if (this.config.reduceMotion) {
      shakeIntensity *= 0.3;
    }

    // Clamp to maximum
    shakeIntensity = Math.min(shakeIntensity, this.config.maxShake);

    // Add shake (accumulative for rapid hits)
    this.currentShake = Math.min(this.currentShake + shakeIntensity, this.config.maxShake);
  }

  onNearKO(remaining: number, total: number): void {
    // Zoom in as we near the end of the track (KO moment)
    const endFactor = 1 - (remaining / total);
    
    if (remaining < 9000) { // Last 9 seconds
      const intensity = Math.pow(endFactor, 2);
      this.currentZoom = damp(this.currentZoom, intensity * this.config.maxZoom, 3, 0.016);
    } else {
      this.currentZoom = damp(this.currentZoom, 0, 2, 0.016);
    }
  }

  onDownbeat(): void {
    // Subtle downbeat bump
    if (!this.config.reduceMotion) {
      this.currentShake = Math.min(this.currentShake + 0.1, this.config.maxShake);
    }
  }

  onComboStart(): void {
    // Slight zoom for combo sequences
    this.currentZoom = Math.min(this.currentZoom + 1, this.config.maxZoom * 0.3);
  }

  onRoundEnd(): void {
    // Return to base framing
    this.currentZoom = 0;
    this.currentShake = 0;
  }

  /* ========= Camera presets ========= */

  setFraming(preset: 'close' | 'medium' | 'wide'): void {
    switch (preset) {
      case 'close':
        this.basePosition.set(0, 2.5, 8);
        this.baseTarget.set(0, 2.2, 0);
        break;
        
      case 'medium':
        this.basePosition.set(0, 3, 12);
        this.baseTarget.set(0, 2, 0);
        break;
        
      case 'wide':
        this.basePosition.set(0, 4, 16);
        this.baseTarget.set(0, 1.5, 0);
        break;
    }
  }

  setAngle(preset: 'straight' | 'low' | 'high' | 'side'): void {
    const baseDistance = this.basePosition.distanceTo(this.baseTarget);
    
    switch (preset) {
      case 'straight':
        this.basePosition.set(0, 3, baseDistance);
        break;
        
      case 'low':
        this.basePosition.set(0, 1.5, baseDistance * 0.8);
        this.baseTarget.y = 2.5;
        break;
        
      case 'high':
        this.basePosition.set(0, 5, baseDistance * 0.9);
        this.baseTarget.y = 1.5;
        break;
        
      case 'side':
        this.basePosition.set(baseDistance * 0.7, 3, baseDistance * 0.7);
        break;
    }
  }

  /* ========= Dynamic camera behaviors ========= */

  followFighter(fighter: any, smooth = true): void {
    // Adjust camera to follow a specific fighter
    const fighterPos = fighter.group.position;
    const targetPos = fighterPos.clone();
    targetPos.y += 2; // Look slightly above fighter
    
    if (smooth) {
      this.baseTarget.lerp(targetPos, 0.02);
    } else {
      this.baseTarget.copy(targetPos);
    }
  }

  frameAction(fighter1Pos: THREE.Vector3, fighter2Pos: THREE.Vector3): void {
    // Automatically frame the action between two fighters
    const center = fighter1Pos.clone().add(fighter2Pos).multiplyScalar(0.5);
    const distance = fighter1Pos.distanceTo(fighter2Pos);
    
    // Adjust camera distance based on fighter separation
    const idealDistance = Math.max(10, distance * 2);
    this.basePosition.z = idealDistance;
    this.baseTarget.copy(center);
    this.baseTarget.y += 2;
  }

  /* ========= Configuration updates ========= */

  setReduceMotion(reduce: boolean): void {
    this.config.reduceMotion = reduce;
    
    if (reduce) {
      // Immediately reduce current effects
      this.currentShake *= 0.5;
      this.config.maxShake *= 0.5;
    }
  }

  setShakeIntensity(intensity: number): void {
    this.shakeMagnitude = clamp(intensity, 0, 2);
  }

  reset(): void {
    this.currentShake = 0;
    this.currentZoom = 0;
    this.driftOffset.set(0, 0, 0);
    this.setupInitialPosition();
  }
}