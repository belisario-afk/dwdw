// Mathematical utilities for the Boxing scene
// - Deterministic noise, easing, clamps, damping, random hash
// - Segment-sphere intersection helpers

import * as THREE from 'three';

/* ========= Deterministic noise / RNG ========= */
export function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return (s - Math.floor(s)) * 2 - 1;
}

export function noise1d(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u);
}

export function hashNoise(x: number): number {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

/* ========= Interpolation and easing ========= */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x));
}

export function easeIn(t: number): number {
  return t * t;
}

export function easeOut(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

export function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function damp(current: number, target: number, lambda: number, dt: number): number {
  return THREE.MathUtils.damp(current, target, lambda, dt);
}

/* ========= Geometric helpers ========= */
export function segmentSphereIntersection(
  segmentStart: THREE.Vector3,
  segmentEnd: THREE.Vector3,
  sphereCenter: THREE.Vector3,
  sphereRadius: number
): boolean {
  // Check if line segment intersects with sphere
  const dir = new THREE.Vector3().subVectors(segmentEnd, segmentStart);
  const toCenter = new THREE.Vector3().subVectors(sphereCenter, segmentStart);
  
  const projLength = toCenter.dot(dir.normalize());
  const segmentLength = segmentStart.distanceTo(segmentEnd);
  
  // Clamp projection to segment bounds
  const clampedProj = Math.max(0, Math.min(segmentLength, projLength));
  
  // Find closest point on segment to sphere center
  const closestPoint = new THREE.Vector3()
    .copy(segmentStart)
    .add(dir.multiplyScalar(clampedProj));
  
  // Check if distance is within sphere radius
  return closestPoint.distanceTo(sphereCenter) <= sphereRadius;
}

/* ========= Random utilities ========= */
export function randomRange(min: number, max: number, seed?: number): number {
  const rng = seed !== undefined ? hashNoise(seed) : Math.random();
  return min + (max - min) * rng;
}

export function randomInCircle(radius: number, seed?: number): THREE.Vector2 {
  const angle = (seed !== undefined ? hashNoise(seed) : Math.random()) * Math.PI * 2;
  const r = (seed !== undefined ? hashNoise(seed + 1) : Math.random()) * radius;
  return new THREE.Vector2(Math.cos(angle) * r, Math.sin(angle) * r);
}