// Impact sparks effect for Boxing scene
// - Pooled impact sprites (allocation-free hot path)
// - Parameterized by power and mitigation

import * as THREE from 'three';
import { randomRange } from '../math';

export interface SparkOptions {
  count: number;
  scale: number;
  velocity: number;
  spread: number;
  lifetime: number;
  color: THREE.Color;
}

interface SparkData {
  life: number;
  maxLife: number;
  velocity: THREE.Vector3;
  active: boolean;
}

export class SparkPool {
  private group = new THREE.Group();
  private sprites: THREE.Sprite[] = [];
  private data: SparkData[] = [];
  private material!: THREE.SpriteMaterial;
  private capacity: number;

  constructor(capacity = 48) {
    this.capacity = capacity;
    this.createSparkTexture();
    this.initializePool();
  }

  private createSparkTexture(): void {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    
    // Create radial gradient for spark
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,240,180,0.95)');
    gradient.addColorStop(0.35, 'rgba(255,210,80,0.7)');
    gradient.addColorStop(1, 'rgba(255,210,80,0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(32, 32, 32, 0, Math.PI * 2);
    ctx.fill();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    
    this.material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      color: 0xfff0cc,
      alphaTest: 0.001
    });
  }

  private initializePool(): void {
    for (let i = 0; i < this.capacity; i++) {
      const sprite = new THREE.Sprite(this.material);
      sprite.visible = false;
      sprite.scale.setScalar(0.15);
      
      this.group.add(sprite);
      this.sprites.push(sprite);
      this.data.push({
        life: 0,
        maxLife: 0,
        velocity: new THREE.Vector3(),
        active: false
      });
    }
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  spawn(position: THREE.Vector3, direction: THREE.Vector3, options: Partial<SparkOptions> = {}): void {
    const opts: SparkOptions = {
      count: 7,
      scale: 1,
      velocity: 3,
      spread: 1,
      lifetime: 0.6,
      color: new THREE.Color(0xfff0cc),
      ...options
    };

    let spawned = 0;
    for (let i = 0; i < this.capacity && spawned < opts.count; i++) {
      const data = this.data[i];
      if (data.active) continue;

      const sprite = this.sprites[i];
      const sparkData = this.data[i];

      // Position
      sprite.position.copy(position);
      sprite.visible = true;

      // Scale with variation
      const scale = (0.18 + Math.random() * 0.1) * opts.scale;
      sprite.scale.set(scale, scale, 1);

      // Velocity with spread
      sparkData.velocity.copy(direction);
      sparkData.velocity.multiplyScalar(opts.velocity * (0.8 + Math.random() * 0.4));
      
      // Add random spread
      sparkData.velocity.add(new THREE.Vector3(
        (Math.random() - 0.5) * opts.spread,
        Math.random() * 0.6 * opts.spread,
        (Math.random() - 0.5) * opts.spread
      ));

      // Lifetime
      sparkData.maxLife = sparkData.life = opts.lifetime * (0.8 + Math.random() * 0.4);
      sparkData.active = true;

      // Color
      (sprite.material as THREE.SpriteMaterial).color.copy(opts.color);

      spawned++;
    }
  }

  spawnImpact(position: THREE.Vector3, direction: THREE.Vector3, power: number = 1): void {
    this.spawn(position, direction, {
      count: Math.floor(5 + power * 8),
      scale: 0.8 + power * 0.5,
      velocity: 2 + power * 2,
      spread: 1 + power * 0.5,
      lifetime: 0.4 + power * 0.3,
      color: new THREE.Color().setHSL(0.15, 0.8, 0.7 + power * 0.2)
    });
  }

  spawnBlocked(position: THREE.Vector3, direction: THREE.Vector3): void {
    this.spawn(position, direction, {
      count: 3,
      scale: 0.6,
      velocity: 1.5,
      spread: 0.8,
      lifetime: 0.3,
      color: new THREE.Color(0x88ccff)
    });
  }

  update(deltaTime: number): void {
    for (let i = 0; i < this.capacity; i++) {
      const data = this.data[i];
      if (!data.active) {
        this.sprites[i].visible = false;
        continue;
      }

      const sprite = this.sprites[i];
      
      // Update lifetime
      data.life -= deltaTime;
      
      if (data.life <= 0) {
        data.active = false;
        sprite.visible = false;
        continue;
      }

      // Update position
      sprite.position.addScaledVector(data.velocity, deltaTime);
      
      // Apply gravity
      data.velocity.y -= 9.8 * deltaTime;
      
      // Update opacity based on life
      const lifeFactor = data.life / data.maxLife;
      (sprite.material as THREE.SpriteMaterial).opacity = Math.max(0, lifeFactor * 2);
      
      // Scale fade out
      const scaleFactor = 0.5 + lifeFactor * 0.5;
      sprite.scale.multiplyScalar(scaleFactor);
    }
  }

  clear(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.data[i].active = false;
      this.sprites[i].visible = false;
    }
  }

  dispose(): void {
    this.clear();
    this.material.map?.dispose();
    this.material.dispose();
    
    for (const sprite of this.sprites) {
      this.group.remove(sprite);
    }
    
    this.sprites.length = 0;
    this.data.length = 0;
  }
}