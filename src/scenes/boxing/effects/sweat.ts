// Sweat/blood particle effects for Boxing scene
// - Pooled particle ribbons for sweat/blood droplets on strong, unmitigated hits
// - Quality-gated for performance

import * as THREE from 'three';

interface SweatParticle {
  active: boolean;
  life: number;
  maxLife: number;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  size: number;
  gravity: number;
}

export class SweatPool {
  private group = new THREE.Group();
  private particles: THREE.Points[] = [];
  private particleData: SweatParticle[] = [];
  private geometry!: THREE.BufferGeometry;
  private material!: THREE.PointsMaterial;
  private capacity: number;
  private positions!: Float32Array;
  private sizes!: Float32Array;
  private colors!: Float32Array;

  constructor(capacity = 100) {
    this.capacity = capacity;
    this.createGeometry();
    this.createMaterial();
    this.initializePool();
  }

  private createGeometry(): void {
    this.geometry = new THREE.BufferGeometry();
    
    this.positions = new Float32Array(this.capacity * 3);
    this.sizes = new Float32Array(this.capacity);
    this.colors = new Float32Array(this.capacity * 3);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    // Set draw range to 0 initially
    this.geometry.setDrawRange(0, 0);
  }

  private createMaterial(): void {
    // Create a simple circular texture for droplets
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255,255,255,0.9)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(16, 16, 16, 0, Math.PI * 2);
    ctx.fill();
    
    const texture = new THREE.CanvasTexture(canvas);
    
    this.material = new THREE.PointsMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.001,
      vertexColors: true,
      size: 0.1,
      sizeAttenuation: true
    });
  }

  private initializePool(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.particleData.push({
        active: false,
        life: 0,
        maxLife: 0,
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        size: 0.05,
        gravity: 9.8
      });
    }

    // Create single Points mesh for all particles
    const points = new THREE.Points(this.geometry, this.material);
    this.group.add(points);
  }

  getGroup(): THREE.Group {
    return this.group;
  }

  spawnSweat(position: THREE.Vector3, velocity: THREE.Vector3, count: number = 5): void {
    this.spawnParticles(position, velocity, count, 'sweat');
  }

  spawnBlood(position: THREE.Vector3, velocity: THREE.Vector3, count: number = 8): void {
    this.spawnParticles(position, velocity, count, 'blood');
  }

  private spawnParticles(
    position: THREE.Vector3, 
    velocity: THREE.Vector3, 
    count: number, 
    type: 'sweat' | 'blood'
  ): void {
    let spawned = 0;
    
    for (let i = 0; i < this.capacity && spawned < count; i++) {
      const particle = this.particleData[i];
      if (particle.active) continue;

      // Position with slight random offset
      particle.position.copy(position);
      particle.position.add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.2,
        (Math.random() - 0.5) * 0.1,
        (Math.random() - 0.5) * 0.2
      ));

      // Velocity with variation
      particle.velocity.copy(velocity);
      particle.velocity.multiplyScalar(0.5 + Math.random() * 0.5);
      particle.velocity.add(new THREE.Vector3(
        (Math.random() - 0.5) * 2,
        Math.random() * 1,
        (Math.random() - 0.5) * 2
      ));

      // Properties based on type
      if (type === 'blood') {
        particle.life = particle.maxLife = 1.0 + Math.random() * 0.5;
        particle.size = 0.03 + Math.random() * 0.02;
        particle.gravity = 12;
      } else {
        particle.life = particle.maxLife = 0.8 + Math.random() * 0.4;
        particle.size = 0.02 + Math.random() * 0.015;
        particle.gravity = 9.8;
      }

      particle.active = true;
      spawned++;
    }
  }

  update(deltaTime: number): void {
    let activeCount = 0;

    for (let i = 0; i < this.capacity; i++) {
      const particle = this.particleData[i];
      
      if (!particle.active) continue;

      // Update lifetime
      particle.life -= deltaTime;
      
      if (particle.life <= 0) {
        particle.active = false;
        continue;
      }

      // Update physics
      particle.velocity.y -= particle.gravity * deltaTime;
      particle.position.addScaledVector(particle.velocity, deltaTime);

      // Update buffer attributes
      const index = activeCount * 3;
      this.positions[index] = particle.position.x;
      this.positions[index + 1] = particle.position.y;
      this.positions[index + 2] = particle.position.z;

      this.sizes[activeCount] = particle.size;

      // Color fade based on lifetime
      const lifeFactor = particle.life / particle.maxLife;
      const alpha = Math.max(0, lifeFactor);
      
      const colorIndex = activeCount * 3;
      this.colors[colorIndex] = 1;     // R
      this.colors[colorIndex + 1] = lifeFactor; // G (gets redder as it fades)
      this.colors[colorIndex + 2] = lifeFactor; // B

      activeCount++;
    }

    // Update geometry
    this.geometry.setDrawRange(0, activeCount);
    
    if (activeCount > 0) {
      this.geometry.getAttribute('position').needsUpdate = true;
      this.geometry.getAttribute('size').needsUpdate = true;
      this.geometry.getAttribute('color').needsUpdate = true;
    }
  }

  clear(): void {
    for (const particle of this.particleData) {
      particle.active = false;
    }
    this.geometry.setDrawRange(0, 0);
  }

  dispose(): void {
    this.clear();
    this.geometry.dispose();
    this.material.map?.dispose();
    this.material.dispose();
  }
}

/* ========= Quality-gated sweat/blood effects ========= */
export class QualitySweatManager {
  private sweatPool: SweatPool | null = null;
  private enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
    if (this.enabled) {
      this.sweatPool = new SweatPool();
    }
  }

  getGroup(): THREE.Group | null {
    return this.sweatPool?.getGroup() || null;
  }

  spawnHeavyHitEffect(
    position: THREE.Vector3, 
    velocity: THREE.Vector3, 
    power: number,
    mitigated: boolean
  ): void {
    if (!this.enabled || !this.sweatPool || mitigated) return;

    if (power > 0.7) {
      // Strong hit - blood
      this.sweatPool.spawnBlood(position, velocity, Math.floor(power * 10));
    } else if (power > 0.4) {
      // Medium hit - sweat
      this.sweatPool.spawnSweat(position, velocity, Math.floor(power * 8));
    }
  }

  update(deltaTime: number): void {
    if (this.sweatPool) {
      this.sweatPool.update(deltaTime);
    }
  }

  dispose(): void {
    if (this.sweatPool) {
      this.sweatPool.dispose();
      this.sweatPool = null;
    }
  }
}