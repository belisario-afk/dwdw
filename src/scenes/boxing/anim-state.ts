// Animation state machine for Boxing scene
// - Layered animation graph with blend weights for locomotion, attack, defense
// - Attack timing windows (apex), recovery blending
// - Clamp/fail-safe to avoid glitches

import * as THREE from 'three';
import { lerp, clamp, easeIn, easeOut, easeInOut } from './math';
import type { AttackType, DefenseType } from './fighter';

export interface AnimationLayer {
  name: string;
  weight: number;
  active: boolean;
  time: number;
  duration: number;
  blendMode: 'replace' | 'additive' | 'multiply';
}

export interface JointState {
  rotation: THREE.Euler;
  position: THREE.Vector3;
  scale: THREE.Vector3;
}

export interface AnimationState {
  layers: Map<string, AnimationLayer>;
  jointStates: Map<string, JointState>;
  blendedResult: Map<string, JointState>;
}

export class AnimationStateMachine {
  private state: AnimationState;
  private transitions: Map<string, string[]>;
  private currentState = 'idle';
  
  // Layer weights for blending
  private locomotionWeight = 1.0;
  private attackWeight = 0.0;
  private defenseWeight = 0.0;
  private reactionWeight = 0.0;

  constructor() {
    this.state = {
      layers: new Map(),
      jointStates: new Map(),
      blendedResult: new Map()
    };
    
    this.transitions = new Map();
    this.initializeLayers();
    this.setupTransitions();
  }

  private initializeLayers(): void {
    // Base locomotion layer (always active)
    this.addLayer('locomotion', {
      name: 'locomotion',
      weight: 1.0,
      active: true,
      time: 0,
      duration: Infinity,
      blendMode: 'replace'
    });

    // Attack layer
    this.addLayer('attack', {
      name: 'attack',
      weight: 0.0,
      active: false,
      time: 0,
      duration: 0.4,
      blendMode: 'additive'
    });

    // Defense layer
    this.addLayer('defense', {
      name: 'defense',
      weight: 0.0,
      active: false,
      time: 0,
      duration: 0.6,
      blendMode: 'additive'
    });

    // Reaction layer (hits, staggers)
    this.addLayer('reaction', {
      name: 'reaction',
      weight: 0.0,
      active: false,
      time: 0,
      duration: 0.5,
      blendMode: 'additive'
    });
  }

  private setupTransitions(): void {
    // Define valid state transitions
    this.transitions.set('idle', ['attack', 'defense', 'stagger', 'ko']);
    this.transitions.set('attack', ['idle', 'defense', 'stagger', 'combo']);
    this.transitions.set('defense', ['idle', 'attack', 'counter', 'stagger']);
    this.transitions.set('stagger', ['idle', 'ko']);
    this.transitions.set('combo', ['idle', 'attack', 'defense', 'stagger']);
    this.transitions.set('counter', ['idle', 'attack', 'defense']);
    this.transitions.set('ko', []); // Terminal state
  }

  private addLayer(name: string, layer: AnimationLayer): void {
    this.state.layers.set(name, layer);
  }

  /* ========= State management ========= */
  
  update(deltaTime: number): void {
    // Update all active layers
    for (const [name, layer] of this.state.layers) {
      if (layer.active) {
        layer.time += deltaTime;
        
        // Check if layer has finished
        if (layer.duration !== Infinity && layer.time >= layer.duration) {
          this.finishLayer(name);
        }
      }
    }

    // Blend all layers together
    this.blendLayers();
  }

  private finishLayer(layerName: string): void {
    const layer = this.state.layers.get(layerName);
    if (!layer) return;

    // Fade out layer
    layer.weight = Math.max(0, layer.weight - 0.1);
    
    if (layer.weight <= 0) {
      layer.active = false;
      layer.time = 0;
      
      // Return to idle if this was the main action
      if (layerName === 'attack' || layerName === 'defense' || layerName === 'reaction') {
        this.transitionTo('idle');
      }
    }
  }

  transitionTo(newState: string, duration?: number): boolean {
    // Check if transition is valid
    const validTransitions = this.transitions.get(this.currentState);
    if (!validTransitions?.includes(newState)) {
      console.warn(`Invalid transition from ${this.currentState} to ${newState}`);
      return false;
    }

    const previousState = this.currentState;
    this.currentState = newState;

    // Handle specific state logic
    switch (newState) {
      case 'attack':
        this.startAttackAnimation(duration);
        break;
      case 'defense':
        this.startDefenseAnimation(duration);
        break;
      case 'stagger':
        this.startReactionAnimation('stagger', duration);
        break;
      case 'ko':
        this.startReactionAnimation('ko', duration);
        break;
      case 'idle':
        this.returnToIdle();
        break;
    }

    return true;
  }

  /* ========= Animation layer control ========= */
  
  private startAttackAnimation(duration = 0.4): void {
    const attackLayer = this.state.layers.get('attack');
    if (!attackLayer) return;

    attackLayer.active = true;
    attackLayer.time = 0;
    attackLayer.duration = duration;
    attackLayer.weight = 1.0;
    
    // Reduce locomotion influence during attack
    this.locomotionWeight = 0.3;
    this.attackWeight = 1.0;
  }

  private startDefenseAnimation(duration = 0.6): void {
    const defenseLayer = this.state.layers.get('defense');
    if (!defenseLayer) return;

    defenseLayer.active = true;
    defenseLayer.time = 0;
    defenseLayer.duration = duration;
    defenseLayer.weight = 1.0;
    
    // Reduce locomotion during defense
    this.locomotionWeight = 0.4;
    this.defenseWeight = 1.0;
  }

  private startReactionAnimation(type: 'stagger' | 'ko', duration = 0.5): void {
    const reactionLayer = this.state.layers.get('reaction');
    if (!reactionLayer) return;

    reactionLayer.active = true;
    reactionLayer.time = 0;
    reactionLayer.duration = type === 'ko' ? Infinity : duration;
    reactionLayer.weight = 1.0;
    
    // Strong reactions override other animations
    this.locomotionWeight = type === 'ko' ? 0 : 0.2;
    this.attackWeight = 0;
    this.defenseWeight = 0;
    this.reactionWeight = 1.0;
  }

  private returnToIdle(): void {
    // Fade out all action layers
    this.attackWeight = 0;
    this.defenseWeight = 0;
    this.reactionWeight = 0;
    this.locomotionWeight = 1.0;

    // Deactivate finished layers
    for (const layer of this.state.layers.values()) {
      if (layer.name !== 'locomotion' && layer.time >= layer.duration) {
        layer.active = false;
        layer.weight = 0;
        layer.time = 0;
      }
    }
  }

  /* ========= Layer blending ========= */
  
  private blendLayers(): void {
    // Clear previous blend result
    this.state.blendedResult.clear();

    // Start with locomotion as base
    const locomotionLayer = this.state.layers.get('locomotion');
    if (locomotionLayer?.active) {
      this.blendLayer('locomotion', this.locomotionWeight);
    }

    // Blend in attack layer
    const attackLayer = this.state.layers.get('attack');
    if (attackLayer?.active && this.attackWeight > 0) {
      this.blendLayer('attack', this.attackWeight);
    }

    // Blend in defense layer
    const defenseLayer = this.state.layers.get('defense');
    if (defenseLayer?.active && this.defenseWeight > 0) {
      this.blendLayer('defense', this.defenseWeight);
    }

    // Blend in reaction layer
    const reactionLayer = this.state.layers.get('reaction');
    if (reactionLayer?.active && this.reactionWeight > 0) {
      this.blendLayer('reaction', this.reactionWeight);
    }
  }

  private blendLayer(layerName: string, weight: number): void {
    const layer = this.state.layers.get(layerName);
    if (!layer || !layer.active || weight <= 0) return;

    // Get joint states for this layer
    const layerJoints = this.getLayerJointStates(layerName, layer.time);
    
    for (const [jointName, jointState] of layerJoints) {
      const existing = this.state.blendedResult.get(jointName);
      
      if (!existing) {
        // First layer for this joint
        this.state.blendedResult.set(jointName, {
          rotation: jointState.rotation.clone(),
          position: jointState.position.clone(),
          scale: jointState.scale.clone()
        });
      } else {
        // Blend with existing
        this.blendJointStates(existing, jointState, weight, layer.blendMode);
      }
    }
  }

  private blendJointStates(
    target: JointState, 
    source: JointState, 
    weight: number, 
    mode: 'replace' | 'additive' | 'multiply'
  ): void {
    const clampedWeight = clamp(weight, 0, 1);
    
    switch (mode) {
      case 'replace':
        target.rotation.x = lerp(target.rotation.x, source.rotation.x, clampedWeight);
        target.rotation.y = lerp(target.rotation.y, source.rotation.y, clampedWeight);
        target.rotation.z = lerp(target.rotation.z, source.rotation.z, clampedWeight);
        target.position.lerp(source.position, clampedWeight);
        target.scale.lerp(source.scale, clampedWeight);
        break;
        
      case 'additive':
        target.rotation.x += source.rotation.x * clampedWeight;
        target.rotation.y += source.rotation.y * clampedWeight;
        target.rotation.z += source.rotation.z * clampedWeight;
        target.position.addScaledVector(source.position, clampedWeight);
        break;
        
      case 'multiply':
        target.rotation.x *= 1 + (source.rotation.x - 1) * clampedWeight;
        target.rotation.y *= 1 + (source.rotation.y - 1) * clampedWeight;
        target.rotation.z *= 1 + (source.rotation.z - 1) * clampedWeight;
        break;
    }
  }

  /* ========= Animation data generation ========= */
  
  private getLayerJointStates(layerName: string, time: number): Map<string, JointState> {
    const states = new Map<string, JointState>();
    
    // Generate animation data based on layer type and time
    switch (layerName) {
      case 'locomotion':
        this.generateLocomotionStates(states, time);
        break;
      case 'attack':
        this.generateAttackStates(states, time);
        break;
      case 'defense':
        this.generateDefenseStates(states, time);
        break;
      case 'reaction':
        this.generateReactionStates(states, time);
        break;
    }
    
    return states;
  }

  private generateLocomotionStates(states: Map<string, JointState>, time: number): void {
    // Base idle/stance animation
    const sway = Math.sin(time * 0.5) * 0.06;
    const bob = Math.sin(time * 1.8) * 0.04;
    
    states.set('root', {
      rotation: new THREE.Euler(0, sway * 0.5, 0),
      position: new THREE.Vector3(0, bob, 0),
      scale: new THREE.Vector3(1, 1, 1)
    });
  }

  private generateAttackStates(states: Map<string, JointState>, time: number): void {
    // Attack animation based on current attack type
    // This would be expanded with specific attack animations
    const progress = time / 0.4; // Assuming 0.4s attack duration
    const attackCurve = Math.sin(progress * Math.PI);
    
    states.set('rightShoulder', {
      rotation: new THREE.Euler(0, 0, attackCurve * 0.5),
      position: new THREE.Vector3(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1)
    });
  }

  private generateDefenseStates(states: Map<string, JointState>, time: number): void {
    // Defense animation based on current defense type
    const progress = clamp(time / 0.6, 0, 1);
    const defenseCurve = easeInOut(progress);
    
    states.set('leftShoulder', {
      rotation: new THREE.Euler(0, 0, defenseCurve * -0.6),
      position: new THREE.Vector3(0, 0, 0),
      scale: new THREE.Vector3(1, 1, 1)
    });
  }

  private generateReactionStates(states: Map<string, JointState>, time: number): void {
    // Reaction animations (stagger, KO)
    const progress = clamp(time / 0.5, 0, 1);
    const reactionCurve = easeOut(progress);
    
    states.set('root', {
      rotation: new THREE.Euler(reactionCurve * 0.3, 0, reactionCurve * 0.2),
      position: new THREE.Vector3(0, -reactionCurve * 0.2, 0),
      scale: new THREE.Vector3(1, 1, 1)
    });
  }

  /* ========= Public interface ========= */
  
  getCurrentState(): string {
    return this.currentState;
  }

  getLayerWeight(layerName: string): number {
    switch (layerName) {
      case 'locomotion': return this.locomotionWeight;
      case 'attack': return this.attackWeight;
      case 'defense': return this.defenseWeight;
      case 'reaction': return this.reactionWeight;
      default: return 0;
    }
  }

  isLayerActive(layerName: string): boolean {
    return this.state.layers.get(layerName)?.active ?? false;
  }

  getBlendedJointState(jointName: string): JointState | undefined {
    return this.state.blendedResult.get(jointName);
  }

  /* ========= Attack timing windows ========= */
  
  getAttackProgress(): number {
    const attackLayer = this.state.layers.get('attack');
    if (!attackLayer?.active) return 0;
    
    return clamp(attackLayer.time / attackLayer.duration, 0, 1);
  }

  isInAttackApex(): boolean {
    const progress = this.getAttackProgress();
    return progress >= 0.4 && progress <= 0.7; // Attack hits during this window
  }

  getDefenseProgress(): number {
    const defenseLayer = this.state.layers.get('defense');
    if (!defenseLayer?.active) return 0;
    
    return clamp(defenseLayer.time / defenseLayer.duration, 0, 1);
  }

  /* ========= Fail-safes and cleanup ========= */
  
  forceIdle(): void {
    // Emergency return to idle state
    this.currentState = 'idle';
    this.returnToIdle();
    
    // Force reset all layers
    for (const layer of this.state.layers.values()) {
      if (layer.name !== 'locomotion') {
        layer.active = false;
        layer.weight = 0;
        layer.time = 0;
      }
    }
  }

  validateState(): boolean {
    // Check for NaN or invalid values
    for (const [jointName, jointState] of this.state.blendedResult) {
      if (isNaN(jointState.rotation.x) || isNaN(jointState.rotation.y) || isNaN(jointState.rotation.z) ||
          isNaN(jointState.position.x) || isNaN(jointState.position.y) || isNaN(jointState.position.z)) {
        console.error(`Invalid joint state for ${jointName}:`, jointState);
        this.forceIdle();
        return false;
      }
    }
    
    return true;
  }
}