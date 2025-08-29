// 3D Boxing Scene — fluid, reactive, and optimized
// - Natural rigs (shoulder/elbow) for punches/blocks/slips/ducks/weaves and counters
// - Reactive logic: when one attacks, the other selects a reaction (block/duck/slip/weave or take hit)
// - Beat-driven orchestration with a tiny scheduler for counters and combos
// - KO sequence near song end with cinematic zoom/shake
// - Album art discs on chests (cached textures)
// - Instanced ring geometry, adaptive quality for smooth FPS

import type { VisualDirector, SceneDef } from '@controllers/director';
import * as THREE from 'three';

type TrackLike = {
  id?: string;
  title?: string;
  artist?: string;
  durationMs?: number;
  progressMs?: number;
  startedAt?: number;
  albumArtUrl?: string;
  album?: { images?: Array<{ url: string }> };
  item?: { album?: { images?: Array<{ url: string }> } };
};

// -------- Quality profile detection --------
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
const DEVICE_MEMORY = (navigator as any).deviceMemory || 4;
const QUALITY = (() => {
  if (isMobile() || DEVICE_MEMORY <= 4) return 'low';
  if (DEVICE_MEMORY <= 8) return 'med';
  return 'high';
})();

// -------- Texture cache for album art --------
const albumTexCache = new Map<string, THREE.Texture>();
async function loadAlbumTexture(url: string): Promise<THREE.Texture | null> {
  if (!url) return null;
  if (albumTexCache.has(url)) return albumTexCache.get(url)!;
  try {
    const img = await loadImage(url);
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    // circular mask
    ctx.save();
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
    // cover-fit draw
    const s = Math.max(size / img.width, size / img.height);
    const dw = img.width * s; const dh = img.height * s;
    ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    ctx.restore();
    // gloss
    const grad = ctx.createRadialGradient(size * 0.32, size * 0.28, size * 0.06, size * 0.32, size * 0.28, size * 0.6);
    grad.addColorStop(0, 'rgba(255,255,255,0.26)');
    grad.addColorStop(1, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(size * 0.32, size * 0.28, size * 0.6, 0, Math.PI * 2); ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    albumTexCache.set(url, tex);
    return tex;
  } catch {
    return null;
  }
}
function pickAlbumUrl(detail: any): string {
  if (!detail) return '';
  if (typeof detail.albumArtUrl === 'string') return detail.albumArtUrl;
  const images = detail.album?.images || detail.item?.album?.images;
  if (Array.isArray(images) && images.length) return images[1]?.url || images[0]?.url || '';
  return '';
}
function coerceTrack(t: any): TrackLike | null {
  if (!t) return null;
  const durationMs = t.duration_ms ?? t.durationMs;
  const progressMs = t.progress_ms ?? t.progressMs;
  const startedAt = t.startedAt ?? (progressMs != null ? Date.now() - progressMs : Date.now());
  return {
    id: t.id,
    title: t.name || t.title,
    artist: t.artist || (Array.isArray(t.artists) ? t.artists.map((a: any) => a.name).join(', ') : undefined),
    durationMs, progressMs, startedAt, albumArtUrl: pickAlbumUrl(t)
  };
}
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img); img.onerror = reject; img.src = url;
  });
}

// -------- Spark impact system (lightweight) --------
class SparkPool {
  group = new THREE.Group();
  sprites: THREE.Sprite[] = [];
  data: { t: number; life: number; vel: THREE.Vector3 }[] = [];
  mat: THREE.SpriteMaterial;

  constructor(cap = 32) {
    const tex = this.makeCircleTex();
    this.mat = new THREE.SpriteMaterial({ map: tex, transparent: true, color: 0xfff2cc });
    for (let i = 0; i < cap; i++) {
      const s = new THREE.Sprite(this.mat);
      s.scale.setScalar(0.15);
      s.visible = false;
      this.group.add(s);
      this.sprites.push(s);
      this.data.push({ t: 0, life: 0, vel: new THREE.Vector3() });
    }
  }
  makeCircleTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,200,0.9)');
    grd.addColorStop(0.4, 'rgba(255,200,50,0.6)');
    grd.addColorStop(1, 'rgba(255,200,50,0.0)');
    g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }
  spawn(pos: THREE.Vector3, dir: THREE.Vector3, count = 6, scale = 1) {
    for (let k = 0; k < count; k++) {
      const i = this.data.findIndex(d => d.life <= 0);
      if (i < 0) break;
      const d = this.data[i]; const s = this.sprites[i];
      d.life = 0.45 + Math.random() * 0.25; d.t = 0;
      d.vel.copy(dir).multiplyScalar(2 + Math.random() * 2).addScaledVector(randUnit3(), 1.2);
      s.position.copy(pos); s.visible = true;
      const sc = (0.18 + Math.random() * 0.1) * scale; s.scale.set(sc, sc, 1);
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i]; const s = this.sprites[i];
      if (d.life <= 0) continue;
      d.t += dt; d.life -= dt;
      s.position.addScaledVector(d.vel, dt);
      s.material.opacity = Math.max(0, d.life * 2);
      if (d.life <= 0) s.visible = false;
    }
  }
}
function randUnit3() {
  const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5);
  return v.normalize();
}

// -------- Fighter rig and animation --------
type FighterPose =
  | 'idle'
  | 'jab'
  | 'cross'
  | 'hook'
  | 'uppercut'
  | 'block'
  | 'duck'
  | 'slipL'
  | 'slipR'
  | 'weave'
  | 'stagger'
  | 'ko';

class Fighter {
  group = new THREE.Group();
  torso: THREE.Mesh;
  head: THREE.Mesh;

  leftShoulder = new THREE.Group();
  leftUpper: THREE.Mesh;
  leftElbow = new THREE.Group();
  leftFore: THREE.Mesh;

  rightShoulder = new THREE.Group();
  rightUpper: THREE.Mesh;
  rightElbow = new THREE.Group();
  rightFore: THREE.Mesh;

  disc: THREE.Mesh; // album disc
  discMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // Anim state
  pose: FighterPose = 'idle';
  poseT = 0;
  idleSeed = Math.random() * 1000;
  facingRight: boolean;
  hue: number;
  koT = 0;
  actionCooldown = 0; // prevents spam
  recoverT = 0;

  constructor(hue: number, facingRight: boolean) {
    this.hue = hue; this.facingRight = facingRight;
    this.group.rotation.y = facingRight ? 0 : Math.PI;

    // Torso
    const torsoGeo = new THREE.SphereGeometry(1.0, 28, 28);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue / 360, 0.55, 0.5),
      roughness: 0.85, metalness: 0.12
    });
    this.torso = new THREE.Mesh(torsoGeo, torsoMat);
    this.torso.scale.set(1.1, 1.3, 1.0);
    this.torso.position.y = 2.0;
    this.torso.castShadow = QUALITY !== 'low';
    this.group.add(this.torso);

    // Head
    const headGeo = new THREE.SphereGeometry(0.52, 24, 24);
    const headMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue / 360, 0.35, 0.72),
      roughness: 0.75, metalness: 0.08
    });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.set(0, 3.1, 0.05);
    this.head.castShadow = QUALITY !== 'low';
    this.group.add(this.head);

    // Arms
    const upperGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.95, 16);
    const foreGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.0, 16);
    const armMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue / 360, 0.45, 0.5),
      roughness: 0.8, metalness: 0.12
    });
    const gloveMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(hue / 360, 0.86, 0.55),
      emissive: new THREE.Color().setHSL(hue / 360, 0.9, 0.25),
      emissiveIntensity: 0.25, roughness: 0.6, metalness: 0.05
    });

    // Left rig
    this.leftShoulder.position.set(-0.6, 2.35, 0.25);
    this.group.add(this.leftShoulder);
    this.leftUpper = new THREE.Mesh(upperGeo, armMat);
    this.leftUpper.rotation.z = Math.PI / 2;
    this.leftShoulder.add(this.leftUpper);
    this.leftElbow.position.set(-0.95, 0, 0);
    this.leftShoulder.add(this.leftElbow);
    this.leftFore = new THREE.Mesh(foreGeo, gloveMat);
    this.leftFore.position.set(-0.5, 0, 0);
    this.leftFore.rotation.z = Math.PI / 2;
    this.leftElbow.add(this.leftFore);

    // Right rig
    this.rightShoulder.position.set(0.6, 2.35, 0.25);
    this.group.add(this.rightShoulder);
    this.rightUpper = new THREE.Mesh(upperGeo, armMat);
    this.rightUpper.rotation.z = Math.PI / 2;
    this.rightShoulder.add(this.rightUpper);
    this.rightElbow.position.set(0.95, 0, 0);
    this.rightShoulder.add(this.rightElbow);
    this.rightFore = new THREE.Mesh(foreGeo, gloveMat);
    this.rightFore.position.set(0.5, 0, 0);
    this.rightFore.rotation.z = Math.PI / 2;
    this.rightElbow.add(this.rightFore);

    // Album disc
    const discGeo = new THREE.CircleGeometry(0.85, 48);
    this.disc = new THREE.Mesh(discGeo, this.discMat);
    this.disc.position.set(0, 2.05, 0.92);
    this.group.add(this.disc);
  }

  async setAlbum(url?: string | null) {
    if (!url) { this.discMat.map = null as any; this.discMat.needsUpdate = true; return; }
    const tex = await loadAlbumTexture(url);
    if (tex) { this.discMat.map = tex; this.discMat.needsUpdate = true; }
  }

  // Pose triggers
  attack(type: 'jab' | 'cross' | 'hook' | 'uppercut') {
    if (this.actionCooldown > 0 || this.pose === 'ko') return;
    this.pose = type; this.poseT = 0;
    this.actionCooldown = 0.25; // small cooldown
  }
  defendBlock() {
    if (this.pose === 'ko') return;
    this.pose = 'block'; this.poseT = 0; this.actionCooldown = 0.2;
  }
  defendDuck() {
    if (this.pose === 'ko') return;
    this.pose = 'duck'; this.poseT = 0; this.actionCooldown = 0.25;
  }
  defendSlip(left = true) {
    if (this.pose === 'ko') return;
    this.pose = left ? 'slipL' : 'slipR'; this.poseT = 0; this.actionCooldown = 0.25;
  }
  defendWeave() {
    if (this.pose === 'ko') return;
    this.pose = 'weave'; this.poseT = 0; this.actionCooldown = 0.3;
  }
  stagger() {
    if (this.pose === 'ko') return;
    this.pose = 'stagger'; this.poseT = 0; this.actionCooldown = 0.35;
  }
  ko() {
    this.pose = 'ko'; this.poseT = 0; this.koT = 1; this.actionCooldown = 1.0;
  }

  update(dt: number, t: number, energy: number) {
    // Cooldowns
    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    this.recoverT = Math.max(0, this.recoverT - dt);

    // Idle locomotion
    const n1 = noise1d(this.idleSeed + t * 0.6);
    const sway = n1 * 0.06;
    const bob = Math.sin(t * 2) * 0.06 * (1 + energy * 0.5);
    const step = Math.sin(t * 1.3 + (this.facingRight ? 0 : Math.PI)) * 0.07;

    this.group.position.x = (this.facingRight ? 1 : -1) * 0.08 + step * 0.6;
    this.torso.position.y = 2.0 + bob;
    this.head.position.y = 3.1 + bob * 1.1;

    // base guard
    let lS = -0.25, lE = -0.6, rS = 0.25, rE = 0.6;
    this.poseT = Math.min(1, this.poseT + dt * 2.4);

    // Body lean yaw reset
    this.group.rotation.y = (this.facingRight ? 0 : Math.PI) + sway * 0.6;
    this.group.rotation.z = THREE.MathUtils.damp(this.group.rotation.z, 0, 8, dt);
    this.group.rotation.x = THREE.MathUtils.damp(this.group.rotation.x, 0, 8, dt);
    this.group.position.y = THREE.MathUtils.damp(this.group.position.y, 0, 8, dt);

    switch (this.pose) {
      case 'jab': {
        const p = easeOutCubic(this.poseT);
        if (this.facingRight) { rE = 0.6 - 1.1 * p; rS = 0.25 - 0.15 * p; }
        else { lE = -0.6 + 1.1 * p; lS = -0.25 + 0.15 * p; }
        break;
      }
      case 'cross': {
        const p = easeOutCubic(this.poseT);
        const yaw = (this.facingRight ? -1 : 1) * 0.25 * p;
        this.group.rotation.y += yaw;
        if (this.facingRight) { lE = -0.6 - 1.2 * p; lS = -0.25 - 0.1 * p; }
        else { rE = 0.6 + 1.2 * p; rS = 0.25 + 0.1 * p; }
        break;
      }
      case 'hook': {
        const p = easeOutCubic(this.poseT);
        const roll = (this.facingRight ? -1 : 1) * 0.35 * p;
        this.group.rotation.z = roll * 0.5;
        if (this.facingRight) { rE = 0.6 - 0.9 * p; rS = 0.25 + 0.6 * p; }
        else { lE = -0.6 + 0.9 * p; lS = -0.25 - 0.6 * p; }
        break;
      }
      case 'uppercut': {
        const p = easeOutCubic(this.poseT);
        const lift = 0.3 * p;
        this.group.position.y = THREE.MathUtils.lerp(0, 0.2, p);
        if (this.facingRight) { rE = 0.6 - 1.2 * p; rS = 0.25 + 0.2 * p; }
        else { lE = -0.6 + 1.2 * p; lS = -0.25 - 0.2 * p; }
        this.head.position.y += lift * 0.2;
        break;
      }
      case 'block': {
        const p = easeInOutCubic(this.poseT);
        lE = THREE.MathUtils.lerp(-0.6, -1.3, p);
        rE = THREE.MathUtils.lerp(0.6, 1.3, p);
        lS = THREE.MathUtils.lerp(-0.25, -0.6, p);
        rS = THREE.MathUtils.lerp(0.25, 0.6, p);
        break;
      }
      case 'duck': {
        const p = easeInOutCubic(this.poseT);
        this.group.position.y = THREE.MathUtils.lerp(0, -0.35, p);
        this.group.rotation.x = THREE.MathUtils.lerp(0, 0.18, p);
        break;
      }
      case 'slipL': {
        const p = easeInOutCubic(this.poseT);
        this.group.position.x += (this.facingRight ? -1 : 1) * 0.18 * p;
        this.group.rotation.y += (this.facingRight ? -1 : 1) * 0.2 * p;
        break;
      }
      case 'slipR': {
        const p = easeInOutCubic(this.poseT);
        this.group.position.x += (this.facingRight ? 1 : -1) * 0.18 * p;
        this.group.rotation.y += (this.facingRight ? 1 : -1) * 0.2 * p;
        break;
      }
      case 'weave': {
        const p = easeInOutCubic(this.poseT);
        this.group.position.y = THREE.MathUtils.lerp(0, -0.25, p);
        this.group.rotation.z = THREE.MathUtils.lerp(0, (this.facingRight ? -1 : 1) * 0.35, Math.sin(p * Math.PI));
        break;
      }
      case 'stagger': {
        const p = easeOutCubic(this.poseT);
        this.group.rotation.z = (this.facingRight ? 1 : -1) * 0.25 * p;
        this.group.position.x += (this.facingRight ? -1 : 1) * 0.08 * p;
        break;
      }
      case 'ko': {
        const p = easeInCubic(this.poseT);
        this.group.rotation.x = THREE.MathUtils.lerp(0, Math.PI / 2, p);
        this.group.position.y = THREE.MathUtils.lerp(0, -1.1, p);
        // arms flop a bit
        lS += 0.8 * p; lE += 1.4 * p; rS -= 0.8 * p; rE -= 1.4 * p;
        break;
      }
    }

    // Apply guard/pose rotations
    this.leftShoulder.rotation.z = lS;
    this.leftElbow.rotation.z = lE;
    this.rightShoulder.rotation.z = rS;
    this.rightElbow.rotation.z = rE;
  }
}

// -------- Scene registration --------
function registerBoxingScene(director: VisualDirector) {
  // Renderer (reuse if existing to avoid context churn)
  const container = ensureLayer();
  let renderer = (container as any)._renderer as THREE.WebGLRenderer | undefined;
  if (!renderer) {
    renderer = new THREE.WebGLRenderer({ antialias: QUALITY !== 'low', alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, QUALITY === 'high' ? 2 : 1.5));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = QUALITY !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);
    (container as any)._renderer = renderer;
  }

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  camera.position.set(0, 3.6, 9.2);

  // Lights
  const hemi = new THREE.HemisphereLight(0x9ec9ff, 0x1a1d24, QUALITY === 'high' ? 0.8 : 0.6);
  scene.add(hemi);
  const dir = new THREE.DirectionalLight(0xffffff, QUALITY === 'high' ? 0.9 : 0.7);
  dir.position.set(3.5, 6.2, 5.8);
  dir.castShadow = QUALITY !== 'low';
  if (dir.castShadow) {
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.near = 0.5; dir.shadow.camera.far = 30;
  }
  scene.add(dir);

  // Floor
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(14, 10),
    new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.96, metalness: 0.02 })
  );
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // Ring (instanced)
  buildRingInstanced(scene);

  // Fighters
  const champ = new Fighter(210, true); champ.group.position.set(-2.1, 0, 0); scene.add(champ.group);
  const challenger = new Fighter(0, false); challenger.group.position.set(2.1, 0, 0); scene.add(challenger.group);

  // Sparks
  const sparks = new SparkPool(QUALITY === 'high' ? 48 : 24); scene.add(sparks.group);

  // State
  let nowPlaying: TrackLike | null = null;
  let nextTrack: TrackLike | null = null;
  let camShake = 0;
  let camZoom = 0;
  let sceneTime = 0;

  // Tiny scheduler for counters/combos
  const scheduled: Array<{ at: number; fn: () => void }> = [];
  function schedule(delay: number, fn: () => void) { scheduled.push({ at: sceneTime + delay, fn }); }

  function trackRemainingMs(): number {
    if (!nowPlaying) return Infinity;
    const dur = nowPlaying.durationMs || 0;
    const start = nowPlaying.startedAt || Date.now() - (nowPlaying.progressMs || 0);
    const elapsed = Date.now() - start;
    return Math.max(0, dur - elapsed);
  }

  // Events
  const onChamp = async (e: Event) => {
    const detail = (e as CustomEvent).detail;
    nowPlaying = coerceTrack(detail);
    await champ.setAlbum(nowPlaying?.albumArtUrl || null);
    // reset states
    for (const f of [champ, challenger]) {
      f.pose = 'idle'; f.poseT = 0; f.koT = 0; f.group.rotation.x = 0; f.group.position.y = 0; f.actionCooldown = 0; f.recoverT = 0;
    }
  };
  const onNext = async (e: Event) => {
    const detail = (e as CustomEvent).detail;
    nextTrack = coerceTrack(detail);
    await challenger.setAlbum(nextTrack?.albumArtUrl || null);
  };
  const onQueueUpdated = (e: Event) => {
    const d = (e as CustomEvent).detail;
    let nxt: any = null;
    if (Array.isArray(d) && d.length) nxt = d[0];
    else if (Array.isArray(d?.queue) && d.queue.length) nxt = d.queue[0];
    else if (d?.next) nxt = d.next;
    if (nxt) onNext(new CustomEvent('queue:next', { detail: nxt }) as any);
  };
  window.addEventListener('song:nowplaying', onChamp);
  window.addEventListener('song:play', onChamp);
  window.addEventListener('spotify:nowPlaying', onChamp);
  window.addEventListener('songchanged', onChamp);
  window.addEventListener('queue:next', onNext);
  window.addEventListener('nextTrack', onNext);
  window.addEventListener('queueUpdated', onQueueUpdated);

  function cleanup() {
    window.removeEventListener('song:nowplaying', onChamp);
    window.removeEventListener('song:play', onChamp);
    window.removeEventListener('spotify:nowPlaying', onChamp);
    window.removeEventListener('songchanged', onChamp);
    window.removeEventListener('queue:next', onNext);
    window.removeEventListener('nextTrack', onNext);
    window.removeEventListener('queueUpdated', onQueueUpdated);
    floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
    scene.traverse((obj) => {
      const m = obj as THREE.Mesh;
      if ((m as any).isMesh) {
        m.geometry?.dispose?.();
        const mat = m.material as any;
        if (Array.isArray(mat)) mat.forEach((mm) => mm?.dispose?.()); else mat?.dispose?.();
      }
    });
  }

  // Exchange orchestrator: attack + defender reaction + optional counter
  function performExchange(attacker: Fighter, defender: Fighter, heavyBias = 0.4) {
    if (attacker.pose === 'ko' || defender.pose === 'ko') return;

    // Choose attack type
    const r = Math.random();
    const type: 'jab' | 'cross' | 'hook' | 'uppercut' =
      r < 0.4 ? 'jab' : r < 0.4 + heavyBias ? 'cross' : r < 0.4 + heavyBias + 0.15 ? 'hook' : 'uppercut';
    attacker.attack(type);

    // Choose defender reaction
    const rr = Math.random();
    let reacted = 'none' as 'block' | 'duck' | 'slipL' | 'slipR' | 'weave' | 'none';
    if (rr < 0.35) reacted = 'block';
    else if (rr < 0.50) reacted = 'duck';
    else if (rr < 0.70) reacted = (Math.random() < 0.5 ? 'slipL' : 'slipR');
    else if (rr < 0.85) reacted = 'weave';
    else reacted = 'none';

    if (reacted === 'block') defender.defendBlock();
    else if (reacted === 'duck') defender.defendDuck();
    else if (reacted === 'slipL') defender.defendSlip(true);
    else if (reacted === 'slipR') defender.defendSlip(false);
    else if (reacted === 'weave') defender.defendWeave();

    // Impact visuals (at punch apex)
    schedule(0.12, () => {
      const headPos = defender.head.getWorldPosition(new THREE.Vector3());
      const dir = new THREE.Vector3(attacker.facingRight ? 1 : -1, 0.2, 0);
      if (reacted === 'block') sparks.spawn(headPos, dir, QUALITY === 'high' ? 8 : 6, 0.8);
      else if (reacted === 'duck' || reacted === 'slipL' || reacted === 'slipR' || reacted === 'weave') {
        sparks.spawn(headPos, dir, QUALITY === 'high' ? 5 : 4, 0.6);
      } else {
        sparks.spawn(headPos, dir, QUALITY === 'high' ? 12 : 8, 1.1);
        defender.stagger();
      }
      camShake = Math.min(1, camShake + (reacted === 'none' ? 0.5 : 0.35));
    });

    // Possible counter if slip/weave succeeded
    if (reacted === 'slipL' || reacted === 'slipR' || reacted === 'weave') {
      schedule(0.25 + Math.random() * 0.1, () => {
        defender.attack(Math.random() < 0.6 ? 'jab' : 'cross');
      });
    }
  }

  const def: SceneDef = {
    name: 'Boxing',
    draw: (_ctx, w, h, time, dt) => {
      sceneTime += dt;

      // Resize only when necessary
      const targetPR = Math.min(window.devicePixelRatio || 1, QUALITY === 'high' ? 2 : 1.5);
      if (renderer!.getPixelRatio() !== targetPR) renderer!.setPixelRatio(targetPR);
      const needSize = renderer!.domElement.width !== Math.floor(w * targetPR) || renderer!.domElement.height !== Math.floor(h * targetPR);
      if (needSize) renderer!.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();

      // Process scheduled events
      for (let i = scheduled.length - 1; i >= 0; i--) {
        if (sceneTime >= scheduled[i].at) {
          const fn = scheduled[i].fn;
          scheduled.splice(i, 1);
          try { fn(); } catch {}
        }
      }

      // Fight logic and KO near end
      const remain = trackRemainingMs();
      const nearingKO = remain < 9000;
      const endKO = remain < 1500;

      if (nearingKO && champ.pose !== 'ko' && challenger.pose !== 'ko') {
        if (endKO) {
          // Favor champ being KO'd so challenger (next song) becomes champ
          const koChamp = Math.random() < 0.6;
          if (koChamp) champ.ko(); else challenger.ko();
          camShake = 1.0;
        }
      }

      // Camera
      camShake = Math.max(0, camShake - dt * 2.8);
      camZoom = THREE.MathUtils.damp(camZoom, nearingKO ? 0.16 : 0, dt, 3.2);
      const sx = (hashNoise(sceneTime * 3.3) - 0.5) * camShake * 0.18;
      const sy = (hashNoise(100 + sceneTime * 3.7) - 0.5) * camShake * 0.18;
      camera.position.set(0 + sx, 3.6 + sy, 9.2 - camZoom * 6.2);
      camera.lookAt(0, 2.2 + sy * 0.5, 0);

      const energy = nowPlaying?.durationMs ? 1 - Math.min(1, remain / Math.max(20000, nowPlaying.durationMs)) : 0.5;

      champ.update(dt, sceneTime, energy);
      challenger.update(dt, sceneTime + 0.35, energy * 0.95);

      // Sparks update
      sparks.update(dt);

      renderer!.render(scene, camera);
    },
    onBeat: () => {
      // Alternate exchanges with fluid reactions
      const leftAttacks = Math.random() < 0.5;
      if (leftAttacks) performExchange(champ, challenger, 0.45);
      else performExchange(challenger, champ, 0.45);
    },
    onDownbeat: () => { camShake = Math.min(1, camShake + 0.65); },
    dispose: () => cleanup()
  };

  director.registerScene(def);
}

// -------- Ring (instanced) --------
function buildRingInstanced(scene: THREE.Scene) {
  const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.6, 10);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3f, roughness: 0.7, metalness: 0.2 });
  const posts = new THREE.InstancedMesh(postGeo, postMat, 4);
  posts.castShadow = QUALITY !== 'low';
  const px = 5.4, pz = 3.6;
  const postPos = [
    new THREE.Vector3(-px, 1.3, -pz),
    new THREE.Vector3(px, 1.3, -pz),
    new THREE.Vector3(-px, 1.3, pz),
    new THREE.Vector3(px, 1.3, pz),
  ];
  const m = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) { m.compose(postPos[i], new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); posts.setMatrixAt(i, m); }
  scene.add(posts);

  // Ropes (12 cylinders -> instanced)
  const ropeGeo = new THREE.CylinderGeometry(0.05, 0.05, 10.8, 8);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.15 });
  const ropes = new THREE.InstancedMesh(ropeGeo, ropeMat, 12);
  const heights = [1.25, 1.55, 1.85];
  let idx = 0;
  const addRope = (a: THREE.Vector3, b: THREE.Vector3, y: number) => {
    const mid = a.clone().lerp(b, 0.5); mid.y = y;
    const dir = b.clone().sub(a); const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, len / 1.0, 1));
    ropes.setMatrixAt(idx++, mat);
  };
  for (const y of heights) {
    addRope(new THREE.Vector3(-px, y, -pz), new THREE.Vector3(px, y, -pz), y); // back
    addRope(new THREE.Vector3(-px, y, pz), new THREE.Vector3(px, y, pz), y);   // front
    addRope(new THREE.Vector3(-px, y, -pz), new THREE.Vector3(-px, y, pz), y); // left
    addRope(new THREE.Vector3(px, y, -pz), new THREE.Vector3(px, y, pz), y);   // right
  }
  scene.add(ropes);
}

// -------- Helpers --------
function ensureLayer(): HTMLElement {
  let el = document.getElementById('boxing3d-layer') as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'boxing3d-layer';
    el.style.position = 'fixed';
    el.style.left = '0'; el.style.top = '0';
    el.style.right = '0'; el.style.bottom = '0';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '90';
    document.body.appendChild(el);
  }
  return el;
}
function noise1d(x: number) {
  // Smooth hash noise in [−1, 1]
  const i = Math.floor(x); const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u);
}
function hash(n: number) {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return (s - Math.floor(s)) * 2 - 1;
}
function hashNoise(x: number) {
  const s = Math.sin(x * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t: number) { return t * t * t; }
function easeInOutCubic(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

export { registerBoxingScene };
export default registerBoxingScene;