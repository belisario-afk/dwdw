// Quality detection and device profiling for Boxing scene
// - Device profiling (deviceMemory, UA hints)
// - Quality tiers (low/med/high) and flags (shadows, fxaa, particles, pixel ratio caps)

export type QualityTier = 'low' | 'med' | 'high';

export interface QualityFlags {
  shadows: boolean;
  fxaa: boolean;
  particles: boolean;
  sweatBlood: boolean;
  pixelRatio: number;
  shadowMapSize: number;
  maxDrawCalls: number;
  reducedMotion: boolean;
}

/* ========= Device detection ========= */
function isMobile(): boolean {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

function getDeviceMemory(): number {
  return (navigator as any).deviceMemory || 4;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/* ========= Quality tier determination ========= */
export function detectQualityTier(): QualityTier {
  const memory = getDeviceMemory();
  
  if (isMobile() || memory <= 4) {
    return 'low';
  }
  
  if (memory <= 8) {
    return 'med';
  }
  
  return 'high';
}

/* ========= Quality flags based on tier ========= */
export function getQualityFlags(tier: QualityTier): QualityFlags {
  const reducedMotion = prefersReducedMotion();
  
  const flags: QualityFlags = {
    shadows: false,
    fxaa: false,
    particles: true,
    sweatBlood: false,
    pixelRatio: 1.0,
    shadowMapSize: 512,
    maxDrawCalls: 50,
    reducedMotion
  };

  switch (tier) {
    case 'low':
      flags.pixelRatio = 1.0;
      flags.maxDrawCalls = 30;
      flags.shadowMapSize = 256;
      break;
      
    case 'med':
      flags.shadows = true;
      flags.fxaa = true;
      flags.sweatBlood = true;
      flags.pixelRatio = 1.5;
      flags.maxDrawCalls = 50;
      flags.shadowMapSize = 1024;
      break;
      
    case 'high':
      flags.shadows = true;
      flags.fxaa = true;
      flags.sweatBlood = true;
      flags.pixelRatio = 2.0;
      flags.maxDrawCalls = 80;
      flags.shadowMapSize = 2048;
      break;
  }

  // Respect reduced motion preference
  if (reducedMotion) {
    flags.sweatBlood = false;
    flags.particles = false;
  }

  return flags;
}

/* ========= Debug mode detection ========= */
export function isDebugMode(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('boxingDebug') === '1' ||
           localStorage.getItem('boxingDebug') === '1';
  } catch {
    return false;
  }
}

/* ========= Quality management ========= */
export class QualityManager {
  public readonly tier: QualityTier;
  public readonly flags: QualityFlags;
  public readonly debug: boolean;

  constructor(forceTier?: QualityTier) {
    this.tier = forceTier || detectQualityTier();
    this.flags = getQualityFlags(this.tier);
    this.debug = isDebugMode();
  }

  shouldUseFeature(feature: keyof QualityFlags): boolean {
    return this.flags[feature] as boolean;
  }

  getPixelRatio(): number {
    return Math.min(window.devicePixelRatio || 1, this.flags.pixelRatio);
  }
}