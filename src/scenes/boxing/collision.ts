// Collision detection for Boxing scene
// - Swept-segment (glove) vs sphere (head) detection
// - One-hit-per-swing gating
// - Defense mitigation
// - Damage application
// - Camera shake impulse
// - Effect triggers

import * as THREE from 'three';
import { segmentSphereIntersection } from './math';
import type { Fighter, AttackType, DefenseType } from './fighter';

export interface HitResult {
  hit: boolean;
  power: number;
  mitigated: boolean;
  defenseType: DefenseType;
  impactPoint: THREE.Vector3;
  impactDirection: THREE.Vector3;
}

export interface CollisionData {
  attacker: Fighter;
  target: Fighter;
  lead: boolean;
  type: AttackType;
  t: number;
  dur: number;
  prev: THREE.Vector3;
  hasHit: boolean; // One-hit-per-swing gating
}

export class CollisionDetector {
  private activeAttacks: CollisionData[] = [];
  private hitCallbacks: ((result: HitResult) => void)[] = [];

  addHitCallback(callback: (result: HitResult) => void): void {
    this.hitCallbacks.push(callback);
  }

  startAttack(
    attacker: Fighter, 
    target: Fighter, 
    lead: boolean, 
    type: AttackType, 
    duration: number
  ): void {
    // Get starting position for glove tracking
    const startPos = new THREE.Vector3();
    attacker.gloveWorldPos(lead, startPos);

    this.activeAttacks.push({
      attacker,
      target,
      lead,
      type,
      t: 0,
      dur: duration,
      prev: startPos.clone(),
      hasHit: false
    });
  }

  update(deltaTime: number): void {
    // Update all active attacks
    for (let i = this.activeAttacks.length - 1; i >= 0; i--) {
      const attack = this.activeAttacks[i];
      attack.t += deltaTime;

      // Check if attack is finished
      if (attack.t >= attack.dur) {
        this.activeAttacks.splice(i, 1);
        continue;
      }

      // Skip if already hit (one-hit-per-swing)
      if (attack.hasHit) continue;

      // Check collision
      const hitResult = this.checkCollision(attack);
      if (hitResult.hit) {
        attack.hasHit = true;
        this.processHit(hitResult);
      }
    }
  }

  private checkCollision(attack: CollisionData): HitResult {
    const result: HitResult = {
      hit: false,
      power: 0,
      mitigated: false,
      defenseType: attack.target.defense,
      impactPoint: new THREE.Vector3(),
      impactDirection: new THREE.Vector3()
    };

    // Get current and previous glove positions
    const currentPos = new THREE.Vector3();
    attack.attacker.gloveWorldPos(attack.lead, currentPos);

    // Get target head position and radius
    const headPos = new THREE.Vector3();
    attack.target.headWorldPos(headPos);
    const headRadius = 0.52; // Match Fighter head geometry

    // Check swept segment vs sphere collision
    const collision = segmentSphereIntersection(
      attack.prev, 
      currentPos, 
      headPos, 
      headRadius
    );

    if (collision) {
      // Calculate attack power based on timing and type
      const progress = attack.t / attack.dur;
      const power = this.calculateAttackPower(attack.type, progress, attack.attacker.getStaminaFactor());

      // Check defense mitigation
      const mitigation = this.calculateDefenseMitigation(attack.target.defense, attack.type);

      result.hit = true;
      result.power = power * (1 - mitigation);
      result.mitigated = mitigation > 0;
      result.impactPoint.copy(headPos);
      result.impactDirection.subVectors(currentPos, attack.prev).normalize();
    }

    // Update previous position for next frame
    attack.prev.copy(currentPos);

    return result;
  }

  private calculateAttackPower(type: AttackType, progress: number, stamina: number): number {
    // Base power by attack type
    const basePower = {
      jab: 0.6,
      cross: 0.8,
      hook: 0.9,
      uppercut: 1.0
    }[type];

    // Power peaks near attack apex (around 50-70% progress)
    const timingFactor = Math.sin(Math.PI * Math.pow(progress, 0.8));

    // Stamina affects power
    const staminaFactor = 0.5 + 0.5 * stamina;

    return basePower * timingFactor * staminaFactor;
  }

  private calculateDefenseMitigation(defense: DefenseType, attackType: AttackType): number {
    switch (defense) {
      case 'block':
        // Blocking is very effective against straight punches
        return attackType === 'jab' || attackType === 'cross' ? 0.8 : 0.4;
      
      case 'duck':
        // Ducking avoids high attacks completely
        return attackType === 'uppercut' ? 0.1 : 0.9;
      
      case 'slipL':
      case 'slipR':
        // Slipping is good against straight punches
        return attackType === 'jab' || attackType === 'cross' ? 0.7 : 0.2;
      
      case 'weave':
        // Weaving is good against hooks
        return attackType === 'hook' ? 0.8 : 0.4;
      
      case 'stagger':
        // Already hit, minimal defense
        return 0.1;
      
      case 'ko':
        // No defense when knocked out
        return 0;
      
      default:
        // No active defense
        return 0;
    }
  }

  private processHit(result: HitResult): void {
    // Notify all callbacks
    for (const callback of this.hitCallbacks) {
      try {
        callback(result);
      } catch (error) {
        console.warn('Hit callback error:', error);
      }
    }
  }

  clear(): void {
    this.activeAttacks.length = 0;
  }

  getActiveAttackCount(): number {
    return this.activeAttacks.length;
  }
}

/* ========= Hit response helpers ========= */
export function applyHitEffects(target: Fighter, result: HitResult): void {
  if (!result.hit) return;

  if (result.power > 0.8 && !result.mitigated) {
    // Heavy unmitigated hit - potential knockout
    if (target.getStaminaFactor() < 0.2) {
      target.knockOut();
    } else {
      target.takeHit(result.power);
    }
  } else {
    // Regular hit
    target.takeHit(result.power);
  }
}

export function calculateCameraShake(result: HitResult): number {
  if (!result.hit) return 0;
  
  // Shake intensity based on power and mitigation
  const baseShake = result.power * 0.8;
  const mitigationFactor = result.mitigated ? 0.3 : 1.0;
  
  return baseShake * mitigationFactor;
}

/* ========= Combat exchange helpers ========= */
export interface ExchangeConfig {
  collisionDetector: CollisionDetector;
  scheduler: any; // Scheduler reference for timing
}

export function startCombatExchange(
  attacker: Fighter,
  defender: Fighter,
  config: ExchangeConfig
): void {
  if (attacker.isKnockedOut() || defender.isKnockedOut()) return;

  // Choose attack based on stamina and strategy
  const staminaFactor = attacker.getStaminaFactor();
  const rnd = Math.random();
  
  // Lower stamina favors lighter attacks
  const heavyBias = Math.max(0.2, 0.8 * staminaFactor);
  
  let attackType: AttackType;
  if (rnd < 0.45) {
    attackType = 'jab';
  } else if (rnd < 0.45 + heavyBias * 0.25) {
    attackType = 'cross';
  } else if (rnd < 0.45 + heavyBias * 0.4) {
    attackType = 'hook';
  } else {
    attackType = 'uppercut';
  }

  const leadHand = Math.random() < 0.7; // Favor lead hand
  attacker.startAttack(attackType, leadHand);

  // Start collision tracking
  config.collisionDetector.startAttack(
    attacker,
    defender,
    leadHand,
    attackType,
    attacker.atkDur
  );

  // Defender reaction
  chooseDefenseReaction(defender, attackType, staminaFactor);
}

function chooseDefenseReaction(
  defender: Fighter, 
  incomingAttack: AttackType, 
  attackerStamina: number
): void {
  const defenseStamina = defender.getStaminaFactor();
  const reactionChance = 0.3 + 0.5 * defenseStamina;
  
  if (Math.random() > reactionChance) {
    // No reaction - take the hit
    return;
  }

  // Choose appropriate defense based on attack type
  const rnd = Math.random();
  
  switch (incomingAttack) {
    case 'jab':
    case 'cross':
      if (rnd < 0.4) defender.setDefense('block');
      else if (rnd < 0.7) defender.setDefense(Math.random() < 0.5 ? 'slipL' : 'slipR');
      else defender.setDefense('duck');
      break;
      
    case 'hook':
      if (rnd < 0.5) defender.setDefense('weave');
      else if (rnd < 0.8) defender.setDefense('duck');
      else defender.setDefense('block');
      break;
      
    case 'uppercut':
      if (rnd < 0.6) defender.setDefense('block');
      else defender.setDefense(Math.random() < 0.5 ? 'slipL' : 'slipR');
      break;
  }
}