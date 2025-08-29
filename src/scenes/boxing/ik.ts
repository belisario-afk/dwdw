// IK constraints for Boxing scene
// - Simple IK constraints
// - Arm reach solver: clamp elbow flex/extend to hit target arc without popping
// - Foot planting: keep feet aligned in stance with subtle lift during gait

import * as THREE from 'three';
import { clamp } from './math';

export interface IKChain {
  root: THREE.Object3D;
  middle: THREE.Object3D;
  end: THREE.Object3D;
  upperLength: number;
  lowerLength: number;
  totalLength: number;
}

export interface IKTarget {
  position: THREE.Vector3;
  rotation?: THREE.Quaternion;
  weight: number; // 0-1, how strongly to apply IK
}

export class IKSolver {
  /* ========= Two-bone IK solver (arms/legs) ========= */
  static solveTwoBone(
    chain: IKChain,
    target: IKTarget,
    poleVector?: THREE.Vector3
  ): void {
    if (target.weight <= 0) return;

    const rootPos = chain.root.getWorldPosition(new THREE.Vector3());
    const targetPos = target.position.clone();
    
    // Calculate distance to target
    const distance = rootPos.distanceTo(targetPos);
    const maxReach = chain.totalLength * 0.95; // Slight bend even at full extension
    
    // Clamp target to reachable distance
    if (distance > maxReach) {
      const direction = targetPos.sub(rootPos).normalize();
      targetPos.copy(rootPos).addScaledVector(direction, maxReach);
    }
    
    // Two-bone IK calculation
    const { upperAngle, lowerAngle } = this.calculateTwoBoneAngles(
      distance,
      chain.upperLength,
      chain.lowerLength
    );

    // Apply rotations with weight
    this.applyArmIK(chain, upperAngle, lowerAngle, target.weight, poleVector);
  }

  private static calculateTwoBoneAngles(
    distance: number,
    upperLength: number,
    lowerLength: number
  ): { upperAngle: number; lowerAngle: number } {
    
    // Law of cosines for two-bone IK
    const upperLengthSq = upperLength * upperLength;
    const lowerLengthSq = lowerLength * lowerLength;
    const distanceSq = distance * distance;
    
    // Upper bone angle (at shoulder/hip)
    const cosUpperAngle = (upperLengthSq + distanceSq - lowerLengthSq) / 
                         (2 * upperLength * distance);
    const upperAngle = Math.acos(clamp(cosUpperAngle, -1, 1));
    
    // Lower bone angle (at elbow/knee)
    const cosLowerAngle = (upperLengthSq + lowerLengthSq - distanceSq) / 
                         (2 * upperLength * lowerLength);
    const lowerAngle = Math.acos(clamp(cosLowerAngle, -1, 1));
    
    return { upperAngle, lowerAngle };
  }

  private static applyArmIK(
    chain: IKChain,
    upperAngle: number,
    lowerAngle: number,
    weight: number,
    poleVector?: THREE.Vector3
  ): void {
    // This is a simplified version - a full implementation would require
    // proper coordinate space transformations and pole vector handling
    
    // For now, we'll apply the constraints as angle limits
    const currentUpper = chain.middle.rotation.z;
    const currentLower = chain.end.rotation.z;
    
    // Apply IK solution with weight blending
    const targetUpper = upperAngle;
    const targetLower = Math.PI - lowerAngle; // Elbow bend direction
    
    chain.middle.rotation.z = THREE.MathUtils.lerp(currentUpper, targetUpper, weight);
    chain.end.rotation.z = THREE.MathUtils.lerp(currentLower, targetLower, weight);
  }

  /* ========= Arm reach constraints ========= */
  static constrainArmReach(
    shoulder: THREE.Object3D,
    elbow: THREE.Object3D,
    target: THREE.Vector3,
    upperArmLength: number,
    forearmLength: number,
    maxExtension = 0.95
  ): void {
    const shoulderPos = shoulder.getWorldPosition(new THREE.Vector3());
    const distance = shoulderPos.distanceTo(target);
    const maxReach = (upperArmLength + forearmLength) * maxExtension;
    
    if (distance > maxReach) {
      // Target too far - clamp to maximum reach
      const direction = target.clone().sub(shoulderPos).normalize();
      target.copy(shoulderPos).addScaledVector(direction, maxReach);
    }
    
    // Apply elbow constraints to prevent hyperextension
    const currentElbowAngle = elbow.rotation.z;
    const minElbowAngle = -Math.PI * 0.9; // Don't fully extend
    const maxElbowAngle = Math.PI * 0.1;  // Don't bend backwards
    
    elbow.rotation.z = clamp(currentElbowAngle, minElbowAngle, maxElbowAngle);
  }

  /* ========= Foot planting ========= */
  static constrainFootPlanting(
    hip: THREE.Object3D,
    ankle: THREE.Object3D,
    foot: THREE.Object3D,
    groundLevel = 0,
    liftHeight = 0.1
  ): void {
    const footWorldPos = foot.getWorldPosition(new THREE.Vector3());
    
    // Keep foot at or slightly above ground level
    const minFootY = groundLevel + liftHeight;
    
    if (footWorldPos.y < minFootY) {
      // Foot is below ground - adjust leg to lift it
      const hipWorldPos = hip.getWorldPosition(new THREE.Vector3());
      const legLength = hipWorldPos.y - groundLevel;
      
      // Calculate required hip angle to keep foot at proper height
      const targetFootY = minFootY;
      const deltaY = targetFootY - footWorldPos.y;
      
      // Simple approximation - adjust hip rotation
      hip.rotation.x += deltaY * 0.1;
      
      // Clamp hip rotation to realistic range
      hip.rotation.x = clamp(hip.rotation.x, -Math.PI * 0.3, Math.PI * 0.3);
    }
  }
}

/* ========= Fighter-specific IK constraints ========= */
export class FighterIKConstraints {
  private leftArmChain: IKChain;
  private rightArmChain: IKChain;
  private leftLegChain: IKChain;
  private rightLegChain: IKChain;

  constructor(fighter: any) { // Fighter type would be imported
    // Create IK chains for fighter limbs
    this.leftArmChain = {
      root: fighter.leftShoulder,
      middle: fighter.leftElbow,
      end: fighter.leftFore,
      upperLength: 0.95,
      lowerLength: 1.0,
      totalLength: 1.95
    };
    
    this.rightArmChain = {
      root: fighter.rightShoulder,
      middle: fighter.rightElbow,
      end: fighter.rightFore,
      upperLength: 0.95,
      lowerLength: 1.0,
      totalLength: 1.95
    };
    
    this.leftLegChain = {
      root: fighter.leftHip,
      middle: fighter.leftAnkle,
      end: fighter.leftFoot,
      upperLength: 1.1,
      lowerLength: 0.55,
      totalLength: 1.65
    };
    
    this.rightLegChain = {
      root: fighter.rightHip,
      middle: fighter.rightAnkle,
      end: fighter.rightFoot,
      upperLength: 1.1,
      lowerLength: 0.55,
      totalLength: 1.65
    };
  }

  applyConstraints(fighter: any): void {
    // Apply arm reach constraints
    this.constrainArmReach(fighter, true);  // Left arm
    this.constrainArmReach(fighter, false); // Right arm
    
    // Apply foot planting
    this.constrainFootPlanting(fighter);
    
    // Apply joint angle limits
    this.applyJointLimits(fighter);
  }

  private constrainArmReach(fighter: any, isLeft: boolean): void {
    const chain = isLeft ? this.leftArmChain : this.rightArmChain;
    
    // Get current elbow angle and constrain it
    const elbow = chain.middle;
    const currentAngle = elbow.rotation.z;
    
    // Define realistic elbow range
    const minAngle = isLeft ? -Math.PI * 0.9 : -Math.PI * 0.1;
    const maxAngle = isLeft ? Math.PI * 0.1 : Math.PI * 0.9;
    
    elbow.rotation.z = clamp(currentAngle, minAngle, maxAngle);
  }

  private constrainFootPlanting(fighter: any): void {
    const groundLevel = 0.4; // Ring floor level
    
    // Apply foot constraints
    IKSolver.constrainFootPlanting(
      this.leftLegChain.root,
      this.leftLegChain.middle,
      this.leftLegChain.end,
      groundLevel
    );
    
    IKSolver.constrainFootPlanting(
      this.rightLegChain.root,
      this.rightLegChain.middle,
      this.rightLegChain.end,
      groundLevel
    );
  }

  private applyJointLimits(fighter: any): void {
    // Shoulder constraints
    fighter.leftShoulder.rotation.z = clamp(fighter.leftShoulder.rotation.z, -1.4, 1.0);
    fighter.rightShoulder.rotation.z = clamp(fighter.rightShoulder.rotation.z, -1.0, 1.4);
    
    // Hip constraints (prevent unrealistic leg poses)
    fighter.leftHip.rotation.x = clamp(fighter.leftHip.rotation.x, -Math.PI * 0.3, Math.PI * 0.3);
    fighter.rightHip.rotation.x = clamp(fighter.rightHip.rotation.x, -Math.PI * 0.3, Math.PI * 0.3);
    
    // Ankle constraints
    fighter.leftAnkle.rotation.x = clamp(fighter.leftAnkle.rotation.x, -Math.PI * 0.2, Math.PI * 0.2);
    fighter.rightAnkle.rotation.x = clamp(fighter.rightAnkle.rotation.x, -Math.PI * 0.2, Math.PI * 0.2);
  }

  /* ========= Advanced IK features ========= */
  
  solveArmReach(fighter: any, isLeft: boolean, target: THREE.Vector3, weight = 1.0): void {
    const chain = isLeft ? this.leftArmChain : this.rightArmChain;
    
    IKSolver.solveTwoBone(chain, {
      position: target,
      weight: weight
    });
  }

  solveLookAt(fighter: any, target: THREE.Vector3, weight = 1.0): void {
    // Make fighter head/torso look toward target
    const currentRotation = fighter.group.rotation.y;
    const targetDirection = target.clone().sub(fighter.group.position);
    const targetAngle = Math.atan2(targetDirection.x, targetDirection.z);
    
    const newRotation = THREE.MathUtils.lerp(currentRotation, targetAngle, weight * 0.1);
    fighter.group.rotation.y = newRotation;
  }

  preventIntersection(fighter1: any, fighter2: any, minDistance = 2.0): void {
    // Prevent fighters from occupying the same space
    const pos1 = fighter1.group.position;
    const pos2 = fighter2.group.position;
    const distance = pos1.distanceTo(pos2);
    
    if (distance < minDistance) {
      const pushDirection = pos1.clone().sub(pos2).normalize();
      const pushAmount = (minDistance - distance) * 0.5;
      
      pos1.addScaledVector(pushDirection, pushAmount);
      pos2.addScaledVector(pushDirection, -pushAmount);
    }
  }
}

/* ========= Utilities ========= */
export function createIKTarget(position: THREE.Vector3, weight = 1.0): IKTarget {
  return {
    position: position.clone(),
    weight: clamp(weight, 0, 1)
  };
}

export function lerpIKTarget(a: IKTarget, b: IKTarget, t: number): IKTarget {
  return {
    position: a.position.clone().lerp(b.position, t),
    weight: THREE.MathUtils.lerp(a.weight, b.weight, t),
    rotation: a.rotation && b.rotation ? 
      a.rotation.clone().slerp(b.rotation, t) : undefined
  };
}