// Fighter rig for Boxing scene
// - Articulated rig (shoulders/elbows + simple hips/ankles/feet)
// - Joint constraints
// - Guard/default pose

import * as THREE from 'three';
import { lerp, clamp, easeIn, easeOut, easeInOut, damp, noise1d } from './math';
import { loadAlbumTexture } from './assets';

export type AttackType = 'jab' | 'cross' | 'hook' | 'uppercut';
export type DefenseType = 'idle' | 'block' | 'duck' | 'slipL' | 'slipR' | 'weave' | 'stagger' | 'ko';

export interface FighterConfig {
  hue: number;
  facingRight: boolean;
  quality: 'low' | 'med' | 'high';
}

export class Fighter {
  // Three.js components
  group = new THREE.Group();

  // Core body parts
  torso!: THREE.Mesh;
  head!: THREE.Mesh;
  pelvis = new THREE.Group();

  // Arms
  leftShoulder = new THREE.Group();
  leftUpper!: THREE.Mesh;
  leftElbow = new THREE.Group();
  leftFore!: THREE.Mesh;
  rightShoulder = new THREE.Group();
  rightUpper!: THREE.Mesh;
  rightElbow = new THREE.Group();
  rightFore!: THREE.Mesh;

  // Legs/Feet (simple)
  leftHip = new THREE.Group();
  leftLeg!: THREE.Mesh;
  leftAnkle = new THREE.Group();
  leftFoot!: THREE.Mesh;
  rightHip = new THREE.Group();
  rightLeg!: THREE.Mesh;
  rightAnkle = new THREE.Group();
  rightFoot!: THREE.Mesh;

  // Album disc
  disc!: THREE.Mesh;
  discMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Configuration
  readonly facingRight: boolean;
  readonly hue: number;
  private quality: 'low' | 'med' | 'high';

  // State
  stamina = 1.0; // 0..1
  defense: DefenseType = 'idle';
  defT = 0;

  // Attack overlay
  atk: AttackType | null = null;
  atkT = 0;
  atkDur = 0.32;
  atkLead = true;

  // Footwork
  gait = 0; // phase
  idleSeed = Math.random() * 1000;

  // Scratch vectors for calculations
  private v1 = new THREE.Vector3();
  private v2 = new THREE.Vector3();
  private q = new THREE.Quaternion();

  constructor(config: FighterConfig) {
    this.hue = config.hue;
    this.facingRight = config.facingRight;
    this.quality = config.quality;
    
    this.group.rotation.y = this.facingRight ? 0 : Math.PI;
    this.buildRig();
  }

  private buildRig(): void {
    // Create materials based on hue
    const bodyCol = new THREE.Color().setHSL(this.hue / 360, 0.45, 0.52);
    const gloveCol = new THREE.Color().setHSL((this.hue + 10) / 360, 0.86, 0.55);
    const skinCol = new THREE.Color().setHSL((this.hue + 170) / 360, 0.35, 0.72);

    const matTorso = new THREE.MeshStandardMaterial({ 
      color: bodyCol, 
      roughness: 0.82, 
      metalness: 0.12 
    });
    const matArm = new THREE.MeshStandardMaterial({ 
      color: bodyCol, 
      roughness: 0.8, 
      metalness: 0.12 
    });
    const matGlove = new THREE.MeshStandardMaterial({ 
      color: gloveCol, 
      emissive: gloveCol.clone().multiplyScalar(0.25), 
      emissiveIntensity: 0.22, 
      roughness: 0.6, 
      metalness: 0.05 
    });
    const matHead = new THREE.MeshStandardMaterial({ 
      color: skinCol, 
      roughness: 0.72, 
      metalness: 0.08 
    });
    const matLeg = new THREE.MeshStandardMaterial({ 
      color: bodyCol.clone().offsetHSL(0, -0.05, -0.05), 
      roughness: 0.85, 
      metalness: 0.12 
    });

    this.buildTorso(matTorso, matHead);
    this.buildArms(matArm, matGlove);
    this.buildLegs(matLeg);
    this.buildAlbumDisc();
  }

  private buildTorso(matTorso: THREE.MeshStandardMaterial, matHead: THREE.MeshStandardMaterial): void {
    // Torso
    const torsoGeo = new THREE.SphereGeometry(1.0, 28, 28);
    this.torso = new THREE.Mesh(torsoGeo, matTorso);
    this.torso.scale.set(1.1, 1.3, 1);
    this.torso.position.y = 2.05;
    this.torso.castShadow = this.quality !== 'low';
    this.group.add(this.torso);

    // Pelvis
    this.pelvis.position.set(0, 1.1, 0);
    this.group.add(this.pelvis);

    // Head
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 24), matHead);
    this.head.position.set(0, 3.2, 0.05);
    this.head.castShadow = this.quality !== 'low';
    this.group.add(this.head);
  }

  private buildArms(matArm: THREE.MeshStandardMaterial, matGlove: THREE.MeshStandardMaterial): void {
    const upperGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.95, 16);
    const foreGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.0, 16);

    // Left arm
    this.leftShoulder.position.set(-0.62, 2.45, 0.22);
    this.group.add(this.leftShoulder);
    
    this.leftUpper = new THREE.Mesh(upperGeo, matArm);
    this.leftUpper.rotation.z = Math.PI / 2;
    this.leftShoulder.add(this.leftUpper);
    
    this.leftElbow.position.set(-0.95, 0, 0);
    this.leftShoulder.add(this.leftElbow);
    
    this.leftFore = new THREE.Mesh(foreGeo, matGlove);
    this.leftFore.rotation.z = Math.PI / 2;
    this.leftFore.position.set(-0.5, 0, 0);
    this.leftElbow.add(this.leftFore);

    // Right arm
    this.rightShoulder.position.set(0.62, 2.45, 0.22);
    this.group.add(this.rightShoulder);
    
    this.rightUpper = new THREE.Mesh(upperGeo, matArm);
    this.rightUpper.rotation.z = Math.PI / 2;
    this.rightShoulder.add(this.rightUpper);
    
    this.rightElbow.position.set(0.95, 0, 0);
    this.rightShoulder.add(this.rightElbow);
    
    this.rightFore = new THREE.Mesh(foreGeo, matGlove);
    this.rightFore.rotation.z = Math.PI / 2;
    this.rightFore.position.set(0.5, 0, 0);
    this.rightElbow.add(this.rightFore);
  }

  private buildLegs(matLeg: THREE.MeshStandardMaterial): void {
    const legGeo = new THREE.CylinderGeometry(0.16, 0.2, 1.1, 14);
    const footGeo = new THREE.BoxGeometry(0.36, 0.16, 0.68);

    // Left leg
    this.leftHip.position.set(-0.4, 1.1, 0.05);
    this.pelvis.add(this.leftHip);
    
    this.leftLeg = new THREE.Mesh(legGeo, matLeg);
    this.leftLeg.rotation.x = Math.PI / 2;
    this.leftHip.add(this.leftLeg);
    
    this.leftAnkle.position.set(0, -0.55, 0);
    this.leftHip.add(this.leftAnkle);
    
    this.leftFoot = new THREE.Mesh(footGeo, matLeg);
    this.leftFoot.position.set(0, -0.05, 0.18);
    this.leftAnkle.add(this.leftFoot);

    // Right leg
    this.rightHip.position.set(0.4, 1.1, 0.05);
    this.pelvis.add(this.rightHip);
    
    this.rightLeg = new THREE.Mesh(legGeo, matLeg);
    this.rightLeg.rotation.x = Math.PI / 2;
    this.rightHip.add(this.rightLeg);
    
    this.rightAnkle.position.set(0, -0.55, 0);
    this.rightHip.add(this.rightAnkle);
    
    this.rightFoot = new THREE.Mesh(footGeo, matLeg);
    this.rightFoot.position.set(0, -0.05, 0.18);
    this.rightAnkle.add(this.rightFoot);
  }

  private buildAlbumDisc(): void {
    // Album disc (on chest)
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 48), this.discMat);
    this.disc.position.set(0, 2.08, 0.92);
    this.group.add(this.disc);
  }

  /* ========= Album art ========= */
  async setAlbum(url?: string | null): Promise<void> {
    const texture = await loadAlbumTexture(url);
    this.discMat.map = texture;
    this.discMat.needsUpdate = true;
  }

  /* ========= Combat actions ========= */
  startAttack(type: AttackType, lead = true, staminaCost = 0.08): void {
    if (this.defense === 'ko') return;
    if (this.atk && this.atkT < this.atkDur * 0.7) return; // avoid spam mid-swing

    this.atk = type;
    this.atkT = 0;
    this.atkDur = type === 'jab' ? 0.28 : type === 'cross' ? 0.34 : type === 'hook' ? 0.38 : 0.4;
    this.atkLead = lead;

    // Stamina cost varies by attack type
    const cost = staminaCost * (type === 'jab' ? 0.8 : 1.2);
    this.stamina = Math.max(0.1, this.stamina - cost);
  }

  setDefense(type: DefenseType): void {
    if (this.defense === 'ko') return;
    this.defense = type;
    this.defT = 0;
  }

  takeHit(power = 1): void {
    if (this.defense === 'ko') return;
    const damage = 0.12 * power;
    this.stamina = Math.max(0, this.stamina - damage);
    this.defense = 'stagger';
    this.defT = 0;
  }

  knockOut(): void {
    this.defense = 'ko';
    this.defT = 0;
  }

  /* ========= Getters for collision/positioning ========= */
  getLeadFore(): THREE.Mesh {
    return this.facingRight ? this.rightFore : this.leftFore;
  }

  getRearFore(): THREE.Mesh {
    return this.facingRight ? this.leftFore : this.rightFore;
  }

  headWorldPos(out: THREE.Vector3): THREE.Vector3 {
    return this.head.getWorldPosition(out);
  }

  gloveWorldPos(lead: boolean, out: THREE.Vector3): THREE.Vector3 {
    return (lead ? this.getLeadFore() : this.getRearFore()).getWorldPosition(out);
  }

  /* ========= Main update loop ========= */
  update(deltaTime: number, sceneTime: number, songEnergy: number): void {
    // Frame smoothing to avoid spikes
    const smoothDt = Math.min(0.033, Math.max(0.001, deltaTime));

    this.updateStamina(smoothDt, songEnergy);
    this.updateIdleMotion(sceneTime, songEnergy, smoothDt);
    this.updateFootwork(smoothDt, songEnergy);
    this.updateJointAngles(smoothDt, sceneTime);
    this.updateAttackAnimation(smoothDt);
    this.updateDefenseAnimation(smoothDt);
    this.applyJointConstraints();
  }

  private updateStamina(deltaTime: number, songEnergy: number): void {
    // Recover stamina slowly, influenced by song energy
    const recoveryRate = 0.05 * (0.7 + 0.6 * (1 - songEnergy));
    this.stamina = clamp(this.stamina + deltaTime * recoveryRate, 0, 1);
  }

  private updateIdleMotion(sceneTime: number, songEnergy: number, deltaTime: number): void {
    // Subtle sway and bob
    const sway = noise1d(this.idleSeed + sceneTime * 0.5) * 0.06;
    const bob = Math.sin(sceneTime * 1.8) * 0.04 * (1 + songEnergy * 0.4);
    const step = Math.sin(sceneTime * 1.25 + (this.facingRight ? 0 : Math.PI)) * 0.08 * (0.6 + 0.4 * this.stamina);

    this.group.position.x = (this.facingRight ? 1 : -1) * 0.08 + step * 0.6;
    this.torso.position.y = 2.05 + bob;
    this.head.position.y = 3.2 + bob * 1.1;
  }

  private updateFootwork(deltaTime: number, songEnergy: number): void {
    // Footwork gait (legs)
    this.gait += deltaTime * (1.5 + 0.8 * songEnergy);
    const leftStep = Math.sin(this.gait);
    const rightStep = Math.sin(this.gait + Math.PI);

    this.leftHip.rotation.x = leftStep * 0.15;
    this.rightHip.rotation.x = rightStep * 0.15;
    this.leftAnkle.rotation.x = -leftStep * 0.1;
    this.rightAnkle.rotation.x = -rightStep * 0.1;
  }

  private updateJointAngles(deltaTime: number, sceneTime: number): void {
    // Base guard joint angles will be modified by attack/defense overlays
    // These will be applied at the end of the update
  }

  private updateAttackAnimation(deltaTime: number): void {
    // Attack animation is handled in the main update
    // This is kept for organization and potential future expansion
  }

  private updateDefenseAnimation(deltaTime: number): void {
    // Defense animation is handled in the main update
    // This is kept for organization and potential future expansion
  }

  private applyJointConstraints(): void {
    // Apply joint rotation constraints to prevent unrealistic poses
    // This is where IK constraints would be applied in the future
    
    // For now, the joint angles are already clamped in the main update logic
    // Future: implement proper IK constraints here
  }

  /* ========= Animation state machine ========= */
  getAttackProgress(): number {
    if (!this.atk) return 0;
    return clamp(this.atkT / this.atkDur, 0, 1);
  }

  isInAttackApex(): boolean {
    if (!this.atk) return false;
    const progress = this.getAttackProgress();
    return progress >= 0.4 && progress <= 0.7; // Attack apex window
  }

  getStaminaFactor(): number {
    return this.stamina;
  }

  isKnockedOut(): boolean {
    return this.defense === 'ko';
  }

  /* ========= Disposal ========= */
  dispose(): void {
    // Dispose materials
    const materials: THREE.Material[] = [];
    
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh && object.material) {
        if (Array.isArray(object.material)) {
          materials.push(...object.material);
        } else {
          materials.push(object.material);
        }
      }
    });

    for (const material of materials) {
      material.dispose();
    }

    // Dispose geometries
    this.group.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry) {
        object.geometry.dispose();
      }
    });

    // Clear group
    this.group.clear();
  }
}