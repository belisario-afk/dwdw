// AI system for Boxing scene
// - Choice policy for attacks (jab/cross/hook/uppercut) and defenses (block/duck/slipL/slipR/weave)
// - Counters after successful evasions
// - Uses stamina and song energy

import * as THREE from 'three';
import { randomRange } from './math';
import type { Fighter, AttackType, DefenseType } from './fighter';
import type { Scheduler } from './scheduler';

export interface AIConfig {
  aggressiveness: number; // 0-1, affects attack frequency
  skill: number; // 0-1, affects defense success rate and counter timing
  stamina: number; // 0-1, current stamina level
  songEnergy: number; // 0-1, influences behavior intensity
}

export interface AIDecision {
  type: 'attack' | 'defend' | 'counter' | 'wait';
  action?: AttackType | DefenseType;
  leadHand?: boolean;
  delay?: number;
}

export class BoxingAI {
  private fighter: Fighter;
  private opponent: Fighter;
  private scheduler: Scheduler;
  private config: AIConfig;
  
  // Internal state
  private lastActionTime = 0;
  private comboCount = 0;
  private maxComboLength = 3;
  private counterWindow = 0;
  private lastDefenseSuccess = false;

  constructor(
    fighter: Fighter,
    opponent: Fighter,
    scheduler: Scheduler,
    config: Partial<AIConfig> = {}
  ) {
    this.fighter = fighter;
    this.opponent = opponent;
    this.scheduler = scheduler;
    this.config = {
      aggressiveness: 0.6,
      skill: 0.7,
      stamina: 1.0,
      songEnergy: 0.5,
      ...config
    };
  }

  update(deltaTime: number): void {
    this.updateConfig();
    
    const currentTime = this.scheduler.getTime();
    const timeSinceLastAction = currentTime - this.lastActionTime;
    
    // Update counter window
    if (this.counterWindow > 0) {
      this.counterWindow -= deltaTime;
    }

    // Don't act if fighter is knocked out
    if (this.fighter.isKnockedOut()) return;

    // Check if we should act
    if (this.shouldAct(timeSinceLastAction)) {
      const decision = this.makeDecision();
      this.executeDecision(decision);
      this.lastActionTime = currentTime;
    }
  }

  private updateConfig(): void {
    // Update stamina and song energy from current state
    this.config.stamina = this.fighter.getStaminaFactor();
    // Note: songEnergy would be passed in from the scene
  }

  private shouldAct(timeSinceLastAction: number): boolean {
    // Base cooldown between actions
    const baseCooldown = 1.0 - this.config.aggressiveness * 0.5;
    const staminaFactor = 0.5 + 0.5 * this.config.stamina;
    const energyFactor = 0.8 + 0.4 * this.config.songEnergy;
    
    const cooldown = baseCooldown / (staminaFactor * energyFactor);
    
    return timeSinceLastAction >= cooldown;
  }

  private makeDecision(): AIDecision {
    // Priority 1: Counter if we have a window
    if (this.counterWindow > 0 && this.lastDefenseSuccess) {
      return this.chooseCounterAttack();
    }

    // Priority 2: Defend if opponent is attacking
    if (this.opponent.atk && this.opponent.getAttackProgress() < 0.6) {
      return this.chooseDefense();
    }

    // Priority 3: Attack if conditions are favorable
    if (this.shouldAttack()) {
      return this.chooseAttack();
    }

    // Default: Wait
    return { type: 'wait' };
  }

  private shouldAttack(): boolean {
    // Don't attack if low stamina
    if (this.config.stamina < 0.3) return false;

    // Don't attack if opponent is defending well
    if (this.opponent.defense !== 'idle' && this.opponent.defense !== 'stagger') {
      return Math.random() < 0.2;
    }

    // Higher aggressiveness = more likely to attack
    const attackChance = this.config.aggressiveness * 0.8 + this.config.songEnergy * 0.2;
    
    return Math.random() < attackChance;
  }

  private chooseAttack(): AIDecision {
    const stamina = this.config.stamina;
    const energy = this.config.songEnergy;
    
    // Attack type probabilities based on stamina and combo count
    let jabChance = 0.4 + (1 - stamina) * 0.3; // Favor jabs when tired
    let crossChance = 0.25 * stamina; // Need stamina for power shots
    let hookChance = 0.2 * stamina * energy; // Need both stamina and energy
    let uppercutChance = 0.15 * stamina * energy; // Rarest, most demanding

    // Normalize probabilities
    const total = jabChance + crossChance + hookChance + uppercutChance;
    jabChance /= total;
    crossChance /= total;
    hookChance /= total;
    uppercutChance /= total;

    // Choose attack type
    const rnd = Math.random();
    let attackType: AttackType;
    
    if (rnd < jabChance) {
      attackType = 'jab';
    } else if (rnd < jabChance + crossChance) {
      attackType = 'cross';
    } else if (rnd < jabChance + crossChance + hookChance) {
      attackType = 'hook';
    } else {
      attackType = 'uppercut';
    }

    // Choose hand (favor lead hand)
    const leadHand = Math.random() < 0.7;

    this.comboCount++;
    
    return {
      type: 'attack',
      action: attackType,
      leadHand
    };
  }

  private chooseDefense(): AIDecision {
    if (!this.opponent.atk) {
      return { type: 'wait' };
    }

    const opponentAttack = this.opponent.atk;
    const skill = this.config.skill;
    const stamina = this.config.stamina;

    // Base success chance based on skill and stamina
    const baseSuccessChance = skill * 0.8 + stamina * 0.2;
    
    if (Math.random() > baseSuccessChance) {
      // Failed to react in time
      return { type: 'wait' };
    }

    // Choose best defense for the incoming attack
    let defenseType: DefenseType;
    const rnd = Math.random();

    switch (opponentAttack) {
      case 'jab':
      case 'cross':
        if (rnd < 0.4) defenseType = 'block';
        else if (rnd < 0.7) defenseType = Math.random() < 0.5 ? 'slipL' : 'slipR';
        else defenseType = 'duck';
        break;

      case 'hook':
        if (rnd < 0.5) defenseType = 'weave';
        else if (rnd < 0.8) defenseType = 'duck';
        else defenseType = 'block';
        break;

      case 'uppercut':
        if (rnd < 0.6) defenseType = 'block';
        else defenseType = Math.random() < 0.5 ? 'slipL' : 'slipR';
        break;

      default:
        defenseType = 'block';
    }

    // Set up potential counter window
    this.setupCounterWindow(defenseType);

    return {
      type: 'defend',
      action: defenseType
    };
  }

  private chooseCounterAttack(): AIDecision {
    // Quick counter attacks - favor faster punches
    const stamina = this.config.stamina;
    const rnd = Math.random();

    let attackType: AttackType;
    if (rnd < 0.6) {
      attackType = 'jab';
    } else if (rnd < 0.8 && stamina > 0.5) {
      attackType = 'cross';
    } else if (stamina > 0.6) {
      attackType = 'hook';
    } else {
      attackType = 'jab'; // Fallback to safe option
    }

    const leadHand = Math.random() < 0.8; // Strongly favor lead hand for counters

    return {
      type: 'counter',
      action: attackType,
      leadHand
    };
  }

  private setupCounterWindow(defenseType: DefenseType): void {
    // Some defenses create better counter opportunities
    const counterWindowDuration = this.getCounterWindowDuration(defenseType);
    
    if (counterWindowDuration > 0) {
      this.counterWindow = counterWindowDuration;
      this.lastDefenseSuccess = true;
    }
  }

  private getCounterWindowDuration(defenseType: DefenseType): number {
    // Different defenses create different counter opportunities
    switch (defenseType) {
      case 'slipL':
      case 'slipR':
        return 0.8; // Good counter window after slipping
      case 'weave':
        return 0.6; // Decent counter window
      case 'duck':
        return 0.4; // Short counter window
      case 'block':
        return 0.2; // Very short window
      default:
        return 0;
    }
  }

  private executeDecision(decision: AIDecision): void {
    switch (decision.type) {
      case 'attack':
      case 'counter':
        if (decision.action && decision.leadHand !== undefined) {
          this.fighter.startAttack(
            decision.action as AttackType,
            decision.leadHand
          );
        }
        break;

      case 'defend':
        if (decision.action) {
          this.fighter.setDefense(decision.action as DefenseType);
        }
        break;

      case 'wait':
        // Reset combo count if we're waiting
        this.comboCount = 0;
        break;
    }

    // Clear counter window after acting
    if (decision.type === 'counter') {
      this.counterWindow = 0;
      this.lastDefenseSuccess = false;
    }
  }

  /* ========= Public interface for external events ========= */
  
  onDefenseSuccess(defenseType: DefenseType): void {
    this.lastDefenseSuccess = true;
    this.setupCounterWindow(defenseType);
  }

  onTookHit(power: number): void {
    this.lastDefenseSuccess = false;
    this.counterWindow = 0;
    this.comboCount = 0;
  }

  updateSongEnergy(energy: number): void {
    this.config.songEnergy = energy;
  }

  updateAggressiveness(aggressiveness: number): void {
    this.config.aggressiveness = Math.max(0, Math.min(1, aggressiveness));
  }

  updateSkill(skill: number): void {
    this.config.skill = Math.max(0, Math.min(1, skill));
  }

  /* ========= Strategy patterns ========= */
  
  setStrategy(strategy: 'aggressive' | 'defensive' | 'counter' | 'balanced'): void {
    switch (strategy) {
      case 'aggressive':
        this.config.aggressiveness = 0.8;
        this.maxComboLength = 4;
        break;
        
      case 'defensive':
        this.config.aggressiveness = 0.3;
        this.maxComboLength = 2;
        break;
        
      case 'counter':
        this.config.aggressiveness = 0.4;
        this.config.skill = Math.min(1, this.config.skill + 0.2);
        this.maxComboLength = 2;
        break;
        
      case 'balanced':
      default:
        this.config.aggressiveness = 0.6;
        this.maxComboLength = 3;
        break;
    }
  }
}

/* ========= AI behavior presets ========= */
export const AI_PRESETS = {
  ROOKIE: {
    aggressiveness: 0.4,
    skill: 0.3,
  },
  
  CONTENDER: {
    aggressiveness: 0.6,
    skill: 0.6,
  },
  
  CHAMPION: {
    aggressiveness: 0.7,
    skill: 0.9,
  },
  
  BERSERKER: {
    aggressiveness: 0.9,
    skill: 0.5,
  },
  
  TECHNICAL: {
    aggressiveness: 0.4,
    skill: 0.8,
  }
};