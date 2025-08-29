// Boxing Scene Registration - Professional, smooth, advanced multi-module system
// - Scene bootstrap, renderer reuse, lifecycle, event hooks
// - Quality selection, post-processing pipeline hookup
// - Registration with director
//
// Features:
// - Real-time collision with IK constraints, state machines
// - Stamina/AI system with song energy integration
// - Camera direction with impact shakes and zoom
// - Post-processing (FXAA + vignette) on medium/high quality
// - Shadow mapping with tuned budget
// - Sweat/blood particle effects on heavy hits (quality-gated)
// - Respects prefers-reduced-motion for accessibility
// - Album art discs on fighter chests
// - Debug mode via ?boxingDebug=1 or localStorage

import type { VisualDirector, SceneDef } from '@controllers/director';
import * as THREE from 'three';

// Import all modules
import { QualityManager, detectQualityTier, isDebugMode } from './quality';
import { 
  createMaterials, 
  createLights, 
  setupFog, 
  loadAlbumTexture, 
  coerceTrack,
  pickAlbumUrl,
  clearAlbumCache,
  disposeMaterials,
  disposeLights,
  type BoxingMaterials,
  type BoxingLights,
  type TrackLike
} from './assets';
import { buildRing, disposeRing, type RingComponents } from './ring';
import { Scheduler, CombatTimer } from './scheduler';
import { SparkPool } from './effects/sparks';
import { QualitySweatManager } from './effects/sweat';
import { createPostProcessor } from './effects/post';
import { Fighter, type FighterConfig, type AttackType } from './fighter';
import { 
  CollisionDetector, 
  startCombatExchange, 
  applyHitEffects, 
  calculateCameraShake,
  type HitResult 
} from './collision';
import { BoxingAI, AI_PRESETS } from './ai';
import { BoxingCameraDirector } from './camera';
import { FighterIKConstraints } from './ik';
import { StaminaManager, STAMINA_PRESETS } from './stamina';
import { AnimationStateMachine } from './anim-state';

/* ========= Container setup ========= */
function ensureLayer(): HTMLElement {
  let el = document.getElementById('boxing3d-layer') as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'boxing3d-layer';
    Object.assign(el.style, {
      position: 'fixed',
      left: '0',
      top: '0',
      right: '0',
      bottom: '0',
      pointerEvents: 'none',
      zIndex: '90'
    });
    document.body.appendChild(el);
  }
  return el;
}

/* ========= Track helpers ========= */
function trackRemainingMs(): number {
  // This would be provided by the director - simplified for now
  return 60000; // Default 1 minute
}

/* ========= Main registration ========= */
export function registerBoxingScene(director: VisualDirector): void {
  // Quality detection
  const qualityManager = new QualityManager();
  const quality = qualityManager.flags;
  const isDebug = qualityManager.debug;

  // Scene components
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let renderer: THREE.WebGLRenderer | null = null;
  let materials: BoxingMaterials;
  let lights: BoxingLights;
  let ring: RingComponents;
  let scheduler: Scheduler;
  let combatTimer: CombatTimer;
  let postProcessor: any;

  // Effects
  let sparkPool: SparkPool;
  let sweatManager: QualitySweatManager;

  // Fighters
  let champ: Fighter;
  let challenger: Fighter;
  let champAI: BoxingAI;
  let challengerAI: BoxingAI;
  let champIK: FighterIKConstraints;
  let challengerIK: FighterIKConstraints;
  let champStamina: StaminaManager;
  let challengerStamina: StaminaManager;
  let champAnimState: AnimationStateMachine;
  let challengerAnimState: AnimationStateMachine;

  // Systems
  let collisionDetector: CollisionDetector;
  let cameraDirector: BoxingCameraDirector;

  // State
  let sceneTime = 0;
  let nowPlaying: TrackLike | null = null;

  function init(): void {
    // Create scene
    scene = new THREE.Scene();
    
    // Create camera
    camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.set(0, 3, 12);
    camera.lookAt(0, 2, 0);

    // Setup camera director
    cameraDirector = new BoxingCameraDirector(camera, {
      reduceMotion: quality.reducedMotion
    });

    // Create materials
    materials = createMaterials(220, 50); // Hues for champ/challenger

    // Setup lighting
    lights = createLights(quality);
    scene.add(lights.ambient);
    scene.add(lights.key);
    scene.add(lights.rim);
    scene.add(lights.hemi);

    // Setup fog
    setupFog(scene);

    // Build ring
    ring = buildRing(scene, materials, quality);

    // Create scheduler and combat timer
    scheduler = new Scheduler();
    combatTimer = new CombatTimer(scheduler);

    // Create effects
    sparkPool = new SparkPool(quality.maxDrawCalls);
    scene.add(sparkPool.getGroup());

    sweatManager = new QualitySweatManager(quality.sweatBlood);
    const sweatGroup = sweatManager.getGroup();
    if (sweatGroup) scene.add(sweatGroup);

    // Create fighters
    champ = new Fighter({
      hue: 220,
      facingRight: true,
      quality: qualityManager.tier
    });
    champ.group.position.set(1.2, 0, 0);
    scene.add(champ.group);

    challenger = new Fighter({
      hue: 50,
      facingRight: false,
      quality: qualityManager.tier
    });
    challenger.group.position.set(-1.2, 0, 0);
    scene.add(challenger.group);

    // Create fighter systems
    champStamina = new StaminaManager(STAMINA_PRESETS.CONTENDER);
    challengerStamina = new StaminaManager(STAMINA_PRESETS.CONTENDER);

    champAnimState = new AnimationStateMachine();
    challengerAnimState = new AnimationStateMachine();

    champIK = new FighterIKConstraints(champ);
    challengerIK = new FighterIKConstraints(challenger);

    champAI = new BoxingAI(champ, challenger, scheduler, AI_PRESETS.CONTENDER);
    challengerAI = new BoxingAI(challenger, champ, scheduler, AI_PRESETS.CONTENDER);

    // Create collision system
    collisionDetector = new CollisionDetector();
    
    // Setup collision callbacks
    collisionDetector.addHitCallback((result: HitResult) => {
      // Apply hit effects
      const target = result.impactPoint.x > 0 ? champ : challenger;
      applyHitEffects(target, result);

      // Camera shake
      const shakeAmount = calculateCameraShake(result);
      cameraDirector.onHit(result);

      // Spawn effects
      sparkPool.spawnImpact(result.impactPoint, result.impactDirection, result.power);
      
      if (!result.mitigated && result.power > 0.6) {
        sweatManager.spawnHeavyHitEffect(
          result.impactPoint,
          result.impactDirection,
          result.power,
          result.mitigated
        );
      }
    });

    // Initialize renderer (will be setup in draw function)
  }

  function setupRenderer(container: HTMLElement, width: number, height: number): void {
    if (!renderer) {
      renderer = new THREE.WebGLRenderer({ 
        antialias: quality.fxaa === false, // Use built-in AA only if FXAA is disabled
        alpha: true,
        powerPreference: 'high-performance'
      });
      
      renderer.setSize(width, height);
      renderer.shadowMap.enabled = quality.shadows;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      
      container.appendChild(renderer.domElement);

      // Setup post-processing
      if (quality.fxaa) {
        postProcessor = createPostProcessor(renderer, scene, camera, quality);
      }
    }
  }

  function updateFighters(deltaTime: number, songEnergy: number): void {
    // Update stamina systems
    champStamina.update(deltaTime, songEnergy, sceneTime);
    challengerStamina.update(deltaTime, songEnergy, sceneTime);

    // Update animation state machines
    champAnimState.update(deltaTime);
    challengerAnimState.update(deltaTime);
    
    // Validate animation states (fail-safe)
    if (!champAnimState.validateState()) {
      console.warn('Champion animation state reset due to invalid values');
    }
    if (!challengerAnimState.validateState()) {
      console.warn('Challenger animation state reset due to invalid values');
    }

    // Update fighters
    champ.update(deltaTime, sceneTime, songEnergy);
    challenger.update(deltaTime, sceneTime, songEnergy);

    // Apply IK constraints
    champIK.applyConstraints(champ);
    challengerIK.applyConstraints(challenger);
    
    // Prevent fighter intersection
    champIK.preventIntersection(champ, challenger);

    // Update AI
    champAI.updateSongEnergy(songEnergy);
    challengerAI.updateSongEnergy(songEnergy);
    
    champAI.update(deltaTime);
    challengerAI.update(deltaTime);
  }

  function updateSystems(deltaTime: number): void {
    // Update scheduler
    scheduler.update(deltaTime);

    // Update collision detection
    collisionDetector.update(deltaTime);

    // Update effects
    sparkPool.update(deltaTime);
    sweatManager.update(deltaTime);

    // Update camera
    cameraDirector.update(deltaTime, sceneTime);
  }

  function startRandomExchange(): void {
    // Choose who attacks
    const leftAttacks = Math.random() < 0.5;
    const attacker = leftAttacks ? challenger : champ;
    const defender = leftAttacks ? champ : challenger;

    startCombatExchange(attacker, defender, {
      collisionDetector,
      scheduler
    });
  }

  function drawDebugInfo(): void {
    if (!isDebug) return;

    // This would render debug overlays
    // For now, just log debug info
    if (sceneTime % 1 < 0.016) { // Once per second
      console.log('Boxing Debug:', {
        champStamina: champStamina.getDebugInfo(),
        challengerStamina: challengerStamina.getDebugInfo(),
        activeAttacks: collisionDetector.getActiveAttackCount(),
        cameraShake: cameraDirector ? 0 : 0 // Simplified for now
      });
    }
  }

  // Event handlers
  function onChamp(e: Event): void {
    const ce = e as CustomEvent<any>;
    const detail = ce.detail;
    if (!detail) return;

    const track = coerceTrack(detail);
    if (track?.id !== nowPlaying?.id) {
      nowPlaying = track;
      const albumUrl = pickAlbumUrl(detail);
      
      // Set album art on fighters
      if (albumUrl) {
        champ.setAlbum(albumUrl).catch(() => {});
        challenger.setAlbum(albumUrl).catch(() => {});
      }
    }
  }

  function onNext(e: Event): void {
    const ce = e as CustomEvent<any>;
    const nxt = ce.detail;
    if (nxt?.albumArtUrl) {
      champ.setAlbum(nxt.albumArtUrl).catch(() => {});
      challenger.setAlbum(nxt.albumArtUrl).catch(() => {});
    }
  }

  function onQueueUpdated(e: Event): void {
    // Handle queue updates
  }

  function cleanup(): void {
    // Remove event listeners
    window.removeEventListener('song:nowplaying', onChamp);
    window.removeEventListener('song:play', onChamp);
    window.removeEventListener('spotify:nowPlaying', onChamp);
    window.removeEventListener('songchanged', onChamp);
    window.removeEventListener('queue:next', onNext);
    window.removeEventListener('nextTrack', onNext);
    window.removeEventListener('queueUpdated', onQueueUpdated);

    // Dispose Three.js resources
    if (renderer) {
      const container = renderer.domElement.parentElement;
      if (container) container.removeChild(renderer.domElement);
      renderer.dispose();
      renderer = null;
    }

    // Dispose effects
    sparkPool.dispose();
    sweatManager.dispose();

    // Dispose fighters
    champ.dispose();
    challenger.dispose();

    // Dispose assets
    disposeMaterials(materials);
    disposeLights(lights);
    disposeRing(ring);
    clearAlbumCache();

    // Dispose post-processing
    if (postProcessor) {
      postProcessor.dispose();
      postProcessor = null;
    }

    // Clear scene
    scene.clear();
  }

  // Add event listeners
  window.addEventListener('song:nowplaying', onChamp);
  window.addEventListener('song:play', onChamp);
  window.addEventListener('spotify:nowPlaying', onChamp);
  window.addEventListener('songchanged', onChamp);
  window.addEventListener('queue:next', onNext);
  window.addEventListener('nextTrack', onNext);
  window.addEventListener('queueUpdated', onQueueUpdated);

  // Scene definition
  const sceneDef: SceneDef = {
    name: 'Boxing',
    draw: (_ctx, w, h, _time, dt) => {
      sceneTime += dt;
      
      // Initialize if needed
      if (!scene) {
        init();
      }

      // Setup renderer if needed
      const container = ensureLayer();
      if (!renderer) {
        setupRenderer(container, w, h);
      }

      // Resize only when necessary
      const pixelRatio = qualityManager.getPixelRatio();
      if (renderer!.getPixelRatio() !== pixelRatio) {
        renderer!.setPixelRatio(pixelRatio);
      }
      
      const needsResize = renderer!.domElement.width !== Math.floor(w * pixelRatio) || 
                         renderer!.domElement.height !== Math.floor(h * pixelRatio);
      if (needsResize) {
        renderer!.setSize(w, h, false);
        if (postProcessor) {
          postProcessor.setSize(w, h);
        }
      }
      
      camera.aspect = w / h;
      camera.updateProjectionMatrix();

      // Fight cadence + KO near end
      const remain = trackRemainingMs();
      const nearingKO = remain < 9000;
      const endKO = remain < 1400;
      const energy = nowPlaying?.durationMs ? 
        1 - Math.min(1, remain / Math.max(20000, nowPlaying.durationMs)) : 0.5;

      // Update systems
      updateSystems(dt);
      updateFighters(dt, energy);

      // Handle fight progression
      cameraDirector.onNearKO(remain, nowPlaying?.durationMs || 180000);
      
      // Random exchanges
      if (Math.random() < 0.002 * (1 + energy)) { // Increase frequency with energy
        startRandomExchange();
      }

      // Render
      if (postProcessor) {
        postProcessor.render();
      } else {
        renderer!.render(scene, camera);
      }

      // Debug overlay
      drawDebugInfo();
    },
    
    onDownbeat: () => {
      cameraDirector.onDownbeat();
    }
  };

  // Register with director
  director.registerScene(sceneDef);
}

/* ========= Exports ========= */
export default registerBoxingScene;