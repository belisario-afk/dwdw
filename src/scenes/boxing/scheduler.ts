// Lightweight scheduler for Boxing scene
// - Timed counters/combos and delayed effects
// - Frame-rate independent timing

export interface ScheduledAction {
  id: string;
  executeAt: number;
  callback: () => void;
  repeat?: boolean;
  interval?: number;
}

export class Scheduler {
  private actions = new Map<string, ScheduledAction>();
  private currentTime = 0;

  update(deltaTime: number): void {
    this.currentTime += deltaTime;
    
    const toExecute: ScheduledAction[] = [];
    const toRemove: string[] = [];
    
    for (const [id, action] of this.actions) {
      if (this.currentTime >= action.executeAt) {
        toExecute.push(action);
        
        if (action.repeat && action.interval) {
          // Reschedule repeating action
          action.executeAt = this.currentTime + action.interval;
        } else {
          // Mark for removal
          toRemove.push(id);
        }
      }
    }
    
    // Execute callbacks
    for (const action of toExecute) {
      try {
        action.callback();
      } catch (error) {
        console.warn('Scheduler action error:', error);
      }
    }
    
    // Remove completed actions
    for (const id of toRemove) {
      this.actions.delete(id);
    }
  }

  schedule(id: string, delay: number, callback: () => void): void {
    this.actions.set(id, {
      id,
      executeAt: this.currentTime + delay,
      callback
    });
  }

  scheduleRepeating(id: string, interval: number, callback: () => void, startDelay = 0): void {
    this.actions.set(id, {
      id,
      executeAt: this.currentTime + startDelay,
      callback,
      repeat: true,
      interval
    });
  }

  cancel(id: string): boolean {
    return this.actions.delete(id);
  }

  cancelAll(): void {
    this.actions.clear();
  }

  has(id: string): boolean {
    return this.actions.has(id);
  }

  getTime(): number {
    return this.currentTime;
  }

  reset(): void {
    this.currentTime = 0;
    this.actions.clear();
  }
}

/* ========= Combat timing helpers ========= */
export class CombatTimer {
  private scheduler: Scheduler;
  private combos = new Map<string, number>();
  
  constructor(scheduler: Scheduler) {
    this.scheduler = scheduler;
  }

  startCombo(attackerId: string, duration: number = 3.0): void {
    const comboId = `combo_${attackerId}`;
    this.combos.set(attackerId, this.scheduler.getTime() + duration);
    
    this.scheduler.schedule(comboId, duration, () => {
      this.combos.delete(attackerId);
    });
  }

  isInCombo(attackerId: string): boolean {
    const endTime = this.combos.get(attackerId);
    return endTime !== undefined && this.scheduler.getTime() < endTime;
  }

  getComboTimeRemaining(attackerId: string): number {
    const endTime = this.combos.get(attackerId);
    if (endTime === undefined) return 0;
    return Math.max(0, endTime - this.scheduler.getTime());
  }

  scheduleDelayedEffect(id: string, delay: number, callback: () => void): void {
    this.scheduler.schedule(`effect_${id}`, delay, callback);
  }

  scheduleCounterWindow(defenderId: string, duration: number, onCounter: () => void): void {
    const counterId = `counter_${defenderId}`;
    let counterUsed = false;
    
    this.scheduler.schedule(counterId, duration, () => {
      // Counter window expired
    });
    
    // Allow manual triggering of counter within window
    const triggerCounter = () => {
      if (!counterUsed && this.scheduler.has(counterId)) {
        counterUsed = true;
        this.scheduler.cancel(counterId);
        onCounter();
      }
    };
    
    // Store counter trigger for external access
    (this as any)[`triggerCounter_${defenderId}`] = triggerCounter;
  }

  triggerCounter(defenderId: string): boolean {
    const trigger = (this as any)[`triggerCounter_${defenderId}`];
    if (trigger) {
      trigger();
      delete (this as any)[`triggerCounter_${defenderId}`];
      return true;
    }
    return false;
  }
}