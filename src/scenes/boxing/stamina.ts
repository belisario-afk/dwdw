// Stamina system for Boxing scene
// - Stamina model (0..1) affecting attack power, defense success, recovery rate
// - Late-track fatigue

import { clamp } from './math';
import type { AttackType } from './fighter';

export interface StaminaConfig {
  maxStamina: number;
  recoveryRate: number;
  fatigueThreshold: number;
  criticalThreshold: number;
}

export class StaminaManager {
  private stamina: number;
  private config: StaminaConfig;
  private fatigue: number; // Accumulated fatigue that slows recovery
  private lastActivityTime: number;

  constructor(config: Partial<StaminaConfig> = {}) {
    this.config = {
      maxStamina: 1.0,
      recoveryRate: 0.05,
      fatigueThreshold: 0.3,
      criticalThreshold: 0.1,
      ...config
    };

    this.stamina = this.config.maxStamina;
    this.fatigue = 0;
    this.lastActivityTime = 0;
  }

  update(deltaTime: number, songEnergy: number, currentTime: number): void {
    // Calculate recovery rate based on song energy and fatigue
    const baseRecovery = this.config.recoveryRate;
    const energyBonus = songEnergy * 0.6; // Song energy helps recovery
    const fatigueDebuff = this.fatigue * 0.5; // Fatigue slows recovery
    
    const recoveryRate = baseRecovery * (0.7 + energyBonus) * (1 - fatigueDebuff);
    
    // Recover stamina
    this.stamina = clamp(this.stamina + recoveryRate * deltaTime, 0, this.config.maxStamina);
    
    // Recover from fatigue slowly when not active
    const timeSinceActivity = currentTime - this.lastActivityTime;
    if (timeSinceActivity > 2.0) { // 2 seconds of inactivity
      this.fatigue = Math.max(0, this.fatigue - deltaTime * 0.02);
    }
  }

  /* ========= Stamina costs ========= */
  
  consumeForAttack(attackType: AttackType): number {
    const baseCosts = {
      jab: 0.06,
      cross: 0.08,
      hook: 0.10,
      uppercut: 0.12
    };

    const cost = baseCosts[attackType];
    
    // Increase cost if stamina is low (harder to perform when tired)
    const fatigueMultiplier = this.stamina < this.config.fatigueThreshold ? 1.5 : 1.0;
    const finalCost = cost * fatigueMultiplier;
    
    this.consumeStamina(finalCost);
    return finalCost;
  }

  consumeForDefense(defenseIntensity: number = 1.0): number {
    const baseCost = 0.03;
    const cost = baseCost * defenseIntensity;
    
    this.consumeStamina(cost);
    return cost;
  }

  consumeForMovement(intensity: number): number {
    const baseCost = 0.01;
    const cost = baseCost * intensity;
    
    this.consumeStamina(cost);
    return cost;
  }

  private consumeStamina(amount: number): void {
    this.stamina = Math.max(0, this.stamina - amount);
    
    // Add fatigue when consuming stamina while already low
    if (this.stamina < this.config.fatigueThreshold) {
      this.fatigue = Math.min(1, this.fatigue + amount * 0.5);
    }
    
    this.lastActivityTime = performance.now() / 1000;
  }

  /* ========= Damage and recovery ========= */
  
  takeDamage(damage: number): void {
    const staminaDrain = damage * 0.15; // Hits drain stamina
    this.consumeStamina(staminaDrain);
    
    // Heavy hits add fatigue
    if (damage > 0.7) {
      this.fatigue = Math.min(1, this.fatigue + damage * 0.2);
    }
  }

  applyRecoveryBoost(amount: number): void {
    this.stamina = clamp(this.stamina + amount, 0, this.config.maxStamina);
    this.fatigue = Math.max(0, this.fatigue - amount * 0.5);
  }

  /* ========= State queries ========= */
  
  getStamina(): number {
    return this.stamina;
  }

  getStaminaPercentage(): number {
    return (this.stamina / this.config.maxStamina) * 100;
  }

  getFatigue(): number {
    return this.fatigue;
  }

  isExhausted(): boolean {
    return this.stamina <= this.config.criticalThreshold;
  }

  isFatigued(): boolean {
    return this.stamina <= this.config.fatigueThreshold || this.fatigue > 0.5;
  }

  canPerformAction(cost: number): boolean {
    return this.stamina >= cost;
  }

  /* ========= Performance modifiers ========= */
  
  getAttackPowerModifier(): number {
    // Attack power is reduced when stamina is low
    if (this.stamina > this.config.fatigueThreshold) {
      return 1.0; // Full power
    }
    
    // Linear reduction below fatigue threshold
    const fatigueRatio = this.stamina / this.config.fatigueThreshold;
    return 0.5 + 0.5 * fatigueRatio; // 50% to 100% power
  }

  getDefenseSuccessModifier(): number {
    // Defense is less effective when tired
    if (this.isExhausted()) {
      return 0.3; // 30% effectiveness when exhausted
    }
    
    if (this.isFatigued()) {
      return 0.6 + 0.4 * (this.stamina / this.config.fatigueThreshold);
    }
    
    return 1.0; // Full effectiveness
  }

  getSpeedModifier(): number {
    // Movement and attack speed affected by stamina
    const staminaFactor = this.stamina / this.config.maxStamina;
    const fatigueFactor = 1 - this.fatigue * 0.5;
    
    return Math.max(0.4, staminaFactor * fatigueFactor);
  }

  getRecoveryModifier(): number {
    // How quickly stamina recovers
    const baseFactor = 1.0;
    const fatiguePenalty = this.fatigue * 0.6;
    
    return Math.max(0.2, baseFactor - fatiguePenalty);
  }

  /* ========= Late-track fatigue simulation ========= */
  
  applyTrackProgressFatigue(progress: number): void {
    // Simulate increasing fatigue as track progresses
    if (progress > 0.7) { // Last 30% of track
      const lateTrackFactor = (progress - 0.7) / 0.3;
      const additionalFatigue = lateTrackFactor * 0.1; // Up to 10% additional fatigue
      
      this.fatigue = Math.min(1, this.fatigue + additionalFatigue * 0.016); // Per frame
    }
  }

  /* ========= Debugging and visualization ========= */
  
  getDebugInfo(): { [key: string]: number } {
    return {
      stamina: Math.round(this.stamina * 100) / 100,
      staminaPercent: Math.round(this.getStaminaPercentage()),
      fatigue: Math.round(this.fatigue * 100) / 100,
      attackPower: Math.round(this.getAttackPowerModifier() * 100) / 100,
      defenseSuccess: Math.round(this.getDefenseSuccessModifier() * 100) / 100,
      speed: Math.round(this.getSpeedModifier() * 100) / 100,
      recovery: Math.round(this.getRecoveryModifier() * 100) / 100
    };
  }

  reset(): void {
    this.stamina = this.config.maxStamina;
    this.fatigue = 0;
    this.lastActivityTime = 0;
  }
}

/* ========= Presets for different fighter types ========= */
export const STAMINA_PRESETS = {
  HEAVYWEIGHT: {
    maxStamina: 1.0,
    recoveryRate: 0.03, // Slower recovery
    fatigueThreshold: 0.4,
    criticalThreshold: 0.15
  },
  
  LIGHTWEIGHT: {
    maxStamina: 1.0,
    recoveryRate: 0.07, // Faster recovery
    fatigueThreshold: 0.25,
    criticalThreshold: 0.08
  },

  CONTENDER: {
    maxStamina: 1.0,
    recoveryRate: 0.05, // Balanced recovery
    fatigueThreshold: 0.3,
    criticalThreshold: 0.1
  },
  
  ENDURANCE: {
    maxStamina: 1.2, // Higher max stamina
    recoveryRate: 0.06,
    fatigueThreshold: 0.2,
    criticalThreshold: 0.05
  },
  
  POWER: {
    maxStamina: 0.8, // Lower max stamina
    recoveryRate: 0.04,
    fatigueThreshold: 0.4,
    criticalThreshold: 0.2
  }
};