// 3D "Boxing" scene using Three.js
// - Two fighters with animated punches, blocks, footwork, and KO near song end
// - Album art discs on each fighter's chest (champ = left, challenger = right)
// - Listens for: 'song:nowplaying'|'song:play'|'spotify:nowPlaying'|'songchanged' (champ)
//                'queue:next'|'nextTrack'|'queueUpdated' (challenger)
// - Beat-reactive: onBeat alternates punch/block; onDownbeat adds impact energy

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

type FighterPose = 'idle' | 'jab' | 'cross' | 'block' | 'stagger' | 'ko';

class AlbumDisc {
  mesh: THREE.Mesh;
  private mat: THREE.MeshBasicMaterial;
  private tex: THREE.Texture | null = null;
  private url: string | null = null;

  constructor(radius = 0.9) {
    const geo = new THREE.CircleGeometry(radius, 64);
    this.mat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      map: undefined,
      transparent: true
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
  }

  async setAlbum(url?: string | null) {
    this.url = url || null;
    if (!this.url) {
      this.clear();
      return;
    }
    const tex = await makeCircularTexture(this.url).catch(() => null);
    if (tex) {
      this.disposeTex();
      this.tex = tex;
      this.mat.map = tex;
      this.mat.needsUpdate = true;
    }
  }

  clear() {
    this.disposeTex();
    this.mat.map = undefined as any;
    this.mat.needsUpdate = true;
  }

  disposeTex() {
    if (this.tex) {
      this.tex.dispose();
      this.tex = null;
    }
  }

  dispose() {
    this.disposeTex();
    this.mesh.geometry.dispose();
    this.mat.dispose();
  }
}

class Fighter {
  group = new THREE.Group();
  body: THREE.Mesh;
  leftUpper: THREE.Mesh;
  leftFore: THREE.Mesh;
  rightUpper: THREE.Mesh;
  rightFore: THREE.Mesh;
  head: THREE.Mesh;
  shadow: THREE.Mesh;
  disc: AlbumDisc;

  hue: number;
  facingRight: boolean;

  // Animation state
  pose: FighterPose = 'idle';
  poseT = 0; // 0..1 progress through pose
  idlePhase = Math.random() * Math.PI * 2;
  staggerT = 0;
  koT = 0;

  constructor(colorHue: number, facingRight = true) {
    this.hue = colorHue;
    this.facingRight = facingRight;
    this.group.rotation.y = facingRight ? 0 : Math.PI;

    // Body
    const bodyGeo = new THREE.SphereGeometry(1.1, 32, 32);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(this.hue / 360, 0.55, 0.55),
      metalness: 0.15,
      roughness: 0.85
    });
    this.body = new THREE.Mesh(bodyGeo, bodyMat);
    this.body.position.y = 2.1;
    this.body.castShadow = true;
    this.body.receiveShadow = false;
    this.group.add(this.body);

    // Disc (album)
    this.disc = new AlbumDisc(0.9);
    this.disc.mesh.position.set(0, 2.1, 1.05);
    this.group.add(this.disc.mesh);

    // Head
    const headGeo = new THREE.SphereGeometry(0.55, 24, 24);
    const headMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(this.hue / 360, 0.35, 0.72),
      metalness: 0.1,
      roughness: 0.75
    });
    this.head = new THREE.Mesh(headGeo, headMat);
    this.head.position.set(0, 3.2, 0);
    this.head.castShadow = true;
    this.group.add(this.head);

    // Arms (simple cylinders)
    const upperGeo = new THREE.CylinderGeometry(0.14, 0.18, 1.0, 16);
    const foreGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.0, 16);
    const armMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(this.hue / 360, 0.4, 0.5),
      metalness: 0.15,
      roughness: 0.8
    });
    const gloveMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color().setHSL(this.hue / 360, 0.85, 0.55),
      metalness: 0.05,
      roughness: 0.6,
      emissive: new THREE.Color().setHSL(this.hue / 360, 0.9, 0.25),
      emissiveIntensity: 0.25
    });

    // Left arm
    this.leftUpper = new THREE.Mesh(upperGeo, armMat);
    this.leftUpper.castShadow = true;
    this.leftUpper.position.set(-0.55, 2.35, 0.25);
    this.leftUpper.rotation.z = Math.PI / 2.8;
    this.group.add(this.leftUpper);

    this.leftFore = new THREE.Mesh(foreGeo, gloveMat);
    this.leftFore.castShadow = true;
    this.leftFore.position.set(-1.15, 2.35, 0.25);
    this.leftFore.rotation.z = Math.PI / 2.2;
    this.group.add(this.leftFore);

    // Right arm
    this.rightUpper = new THREE.Mesh(upperGeo, armMat);
    this.rightUpper.castShadow = true;
    this.rightUpper.position.set(0.55, 2.35, 0.25);
    this.rightUpper.rotation.z = -Math.PI / 2.8;
    this.group.add(this.rightUpper);

    this.rightFore = new THREE.Mesh(foreGeo, gloveMat);
    this.rightFore.castShadow = true;
    this.rightFore.position.set(1.15, 2.35, 0.25);
    this.rightFore.rotation.z = -Math.PI / 2.2;
    this.group.add(this.rightFore);

    // Ground shadow (fake ellipse)
    const shGeo = new THREE.CircleGeometry(1.2, 32);
    const shMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35 });
    this.shadow = new THREE.Mesh(shGeo, shMat);
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.01;
    this.group.add(this.shadow);

    // Slight base position
    this.group.position.y = 0;
  }

  async setAlbumArt(url?: string | null) {
    await this.disc.setAlbum(url || null);
  }

  // Pose triggers
  jab() { this.pose = 'jab'; this.poseT = 0; }
  cross() { this.pose = 'cross'; this.poseT = 0; }
  block() { this.pose = 'block'; this.poseT = 0; }
  takeHit() { this.pose = 'stagger'; this.poseT = 0; this.staggerT = 1; }
  ko() { this.pose = 'ko'; this.poseT = 0; this.koT = 1; }

  update(dt: number, t: number, energy = 0) {
    const idleBob = Math.sin(t * 2 + this.idlePhase) * 0.06 * (1 + 0.5 * energy);
    const idleLean = Math.sin(t * 1.2 + this.idlePhase) * 0.06;

    // Base idle
    this.body.position.y = 2.1 + idleBob;
    this.head.position.y = 3.2 + idleBob * 1.1;
    this.shadow.scale.set(1 + energy * 0.1, 1 + energy * 0.1, 1);

    // Pose progress
    this.poseT = Math.min(1, this.poseT + dt * 2.4);

    // Reset arms (guard)
    let luRot = Math.PI / 2.8;
    let lfRot = Math.PI / 2.2;
    let ruRot = -Math.PI / 2.8;
    let rfRot = -Math.PI / 2.2;

    // Apply poses
    if (this.pose === 'jab') {
      // Lead hand quick extend
      const p = easeOutCubic(this.poseT);
      const extend = lerp(0, 1.2, p);
      const bend = lerp(0, -0.5, p);
      if (this.facingRight) {
        ruRot = -Math.PI / 2.8 + bend;
        rfRot = -Math.PI / 2.2 - extend;
      } else {
        luRot = Math.PI / 2.8 - bend;
        lfRot = Math.PI / 2.2 + extend;
      }
    } else if (this.pose === 'cross') {
      // Rear hand powerful cross
      const p = easeOutCubic(this.poseT);
      const extend = lerp(0, 1.4, p);
      const bodyYaw = (this.facingRight ? -1 : 1) * lerp(0, 0.28, p);
      this.group.rotation.y = (this.facingRight ? 0 : Math.PI) + bodyYaw;
      if (this.facingRight) {
        luRot = Math.PI / 2.8 - 0.2 * p;
        lfRot = Math.PI / 2.2 + 0.3 * p;
        ruRot = -Math.PI / 2.8 + 0.15 * p;
        rfRot = -Math.PI / 2.2 - extend;
      } else {
        ruRot = -Math.PI / 2.8 + 0.2 * p;
        rfRot = -Math.PI / 2.2 - 0.3 * p;
        luRot = Math.PI / 2.8 - 0.15 * p;
        lfRot = Math.PI / 2.2 + extend;
      }
    } else if (this.pose === 'block') {
      const p = easeInOutCubic(this.poseT);
      // Raise both forearms
      luRot = Math.PI / 2.8 - 0.4 * p;
      lfRot = Math.PI / 2.2 - 0.9 * p;
      ruRot = -Math.PI / 2.8 + 0.4 * p;
      rfRot = -Math.PI / 2.2 + 0.9 * p;
    } else if (this.pose === 'stagger') {
      const p = easeOutCubic(this.poseT);
      const lean = lerp(0, 0.35, p);
      this.group.position.x = (this.facingRight ? 1 : -1) * 0.1 * Math.sin(perfRand(t) * 8);
      this.group.rotation.z = (this.facingRight ? 1 : -1) * lean;
      // arms loosen
      luRot = Math.PI / 2.8 + 0.4 * p;
      lfRot = Math.PI / 2.2 + 0.8 * p;
      ruRot = -Math.PI / 2.8 - 0.4 * p;
      rfRot = -Math.PI / 2.2 - 0.8 * p;
      this.staggerT = Math.max(0, this.staggerT - dt * 1.4);
      if (this.poseT >= 1) this.pose = 'idle';
    } else if (this.pose === 'ko') {
      const p = this.poseT; // 0..1 fall
      const fall = easeInCubic(p);
      this.group.rotation.x = lerp(0, Math.PI / 2, fall);
      this.group.position.y = lerp(0, -1.2, fall);
      luRot += 0.6 * fall;
      lfRot += 1.2 * fall;
      ruRot -= 0.6 * fall;
      rfRot -= 1.2 * fall;
    } else {
      // idle sway
      this.group.rotation.y = (this.facingRight ? 0 : Math.PI) + idleLean * 0.4;
      this.group.position.x = Math.sin(t * 1.4 + this.idlePhase) * 0.05;
    }

    // Apply arm rotations
    this.leftUpper.rotation.z = luRot;
    this.leftFore.rotation.z = lfRot;
    this.rightUpper.rotation.z = ruRot;
    this.rightFore.rotation.z = rfRot;
  }

  dispose() {
    this.disc.dispose();
    this.body.geometry.dispose(); (this.body.material as THREE.Material).dispose();
    this.leftUpper.geometry.dispose(); (this.leftUpper.material as THREE.Material).dispose();
    this.leftFore.geometry.dispose(); (this.leftFore.material as THREE.Material).dispose();
    this.rightUpper.geometry.dispose(); (this.rightUpper.material as THREE.Material).dispose();
    this.rightFore.geometry.dispose(); (this.rightFore.material as THREE.Material).dispose();
    this.head.geometry.dispose(); (this.head.material as THREE.Material).dispose();
    this.shadow.geometry.dispose(); (this.shadow.material as THREE.Material).dispose();
  }
}

export function registerBoxingScene(director: VisualDirector) {
  // 3D scene graph
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const threeScene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  camera.position.set(0, 3.6, 9.5);
  camera.lookAt(0, 2.2, 0);
  threeScene.add(camera);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.35);
  threeScene.add(ambient);
  const dir = new THREE.DirectionalLight(0xffffff, 1.0);
  dir.position.set(3.5, 6.5, 6.0);
  dir.castShadow = true;
  dir.shadow.mapSize.set(1024, 1024);
  dir.shadow.camera.near = 0.5;
  dir.shadow.camera.far = 30;
  threeScene.add(dir);

  // Floor (ring platform)
  const floorGeo = new THREE.PlaneGeometry(14, 10, 1, 1);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x12151c, roughness: 0.95, metalness: 0.02 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  threeScene.add(floor);

  // Ropes and posts
  buildRing(threeScene);

  // Fighters
  const champ = new Fighter(210, true);
  champ.group.position.set(-2.2, 0, 0);
  threeScene.add(champ.group);

  const challenger = new Fighter(0, false);
  challenger.group.position.set(2.2, 0, 0);
  threeScene.add(challenger.group);

  // Camera subtle shake/zoom
  let camShake = 0;
  let camZoom = 0;

  // Track timing, for KO scheduling
  let nowPlaying: TrackLike | null = null;
  let nextTrack: TrackLike | null = null;
  let lastNPAt = 0;

  function trackRemainingMs(): number {
    if (!nowPlaying) return Infinity;
    const dur = nowPlaying.durationMs || 0;
    const baseStart = nowPlaying.startedAt || Date.now() - (nowPlaying.progressMs || 0);
    const elapsed = Date.now() - baseStart;
    return Math.max(0, dur - elapsed);
  }

  // Attach renderer canvas to DOM (overlay)
  const container = ensure3DLayer();
  container.appendChild(renderer.domElement);

  // Album art listeners
  const onChamp = async (e: Event) => {
    const detail = (e as CustomEvent).detail;
    nowPlaying = coerceTrack(detail);
    lastNPAt = Date.now();
    await champ.setAlbumArt(pickAlbumUrl(nowPlaying));
    // On new track start, reset fighters and remove KO state
    champ.pose = 'idle'; champ.poseT = 0; champ.koT = 0; champ.group.rotation.x = 0; champ.group.position.y = 0;
    challenger.pose = 'idle'; challenger.poseT = 0; challenger.koT = 0; challenger.group.rotation.x = 0; challenger.group.position.y = 0;
  };
  const onNext = async (e: Event) => {
    const detail = (e as CustomEvent).detail;
    nextTrack = coerceTrack(detail);
    await challenger.setAlbumArt(pickAlbumUrl(nextTrack));
  };
  const onQueueUpdated = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    let nxt: any = null;
    if (Array.isArray(detail) && detail.length > 0) nxt = detail[0];
    else if (Array.isArray(detail?.queue) && detail.queue.length > 0) nxt = detail.queue[0];
    else if (detail?.next) nxt = detail.next;
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
    champ.dispose();
    challenger.dispose();
    floor.geometry.dispose(); (floor.material as THREE.Material).dispose();
    renderer.dispose();
    if (renderer.domElement.parentElement === container) container.removeChild(renderer.domElement);
  }

  // Scene def integrates with VisualDirector's render loop
  const scene: SceneDef = {
    name: 'Boxing',
    draw: (_ctx, w, h, time, dt) => {
      // Size renderer to current viewport provided by director
      if (renderer.domElement.width !== Math.floor(w * renderer.getPixelRatio())) {
        renderer.setSize(w, h, false);
      }

      // Fight logic
      const remain = trackRemainingMs();
      const nearingKO = remain < 8000; // KO in last 8s
      const endKO = remain < 1500;

      // Beat-based action selection happens via onBeat; here we add KO sequence near end
      if (nearingKO && champ.pose !== 'ko' && challenger.pose !== 'ko') {
        // Exchange blows, then KO challenger just before the end, or champ if random
        if (endKO) {
          // KO the one who is losing (random 55/45 towards challenger)
          const koRight = Math.random() < 0.55;
          if (koRight) challenger.ko(); else champ.ko();
          camShake = 1.0;
        } else {
          // Build tension with cross/block alternation
          if (Math.random() < 0.02) champ.cross();
          if (Math.random() < 0.02) challenger.block();
        }
      }

      // Camera
      camShake = Math.max(0, camShake - dt * 2.5);
      camZoom = THREE.MathUtils.damp(camZoom, nearingKO ? 0.12 : 0, dt, 3);
      const sx = (Math.random() - 0.5) * camShake * 0.12;
      const sy = (Math.random() - 0.5) * camShake * 0.12;
      camera.position.set(0 + sx, 3.6 + sy, 9.5 - camZoom * 6);
      camera.lookAt(0, 2.2 + sy * 0.5, 0);

      const energy = Math.min(1, Math.max(0, 1 - remain / 45000)); // slowly rises through the track
      champ.update(dt, time, energy);
      challenger.update(dt, time + 0.3, energy * 0.9);

      renderer.render(threeScene, camera);
    },
    onBeat: () => {
      // Alternate jab/cross and blocks
      const leftAttack = Math.random() < 0.55;
      if (leftAttack) {
        if (Math.random() < 0.6) champ.jab(); else champ.cross();
        if (Math.random() < 0.4) challenger.block(); else challenger.takeHit();
      } else {
        if (Math.random() < 0.6) challenger.jab(); else challenger.cross();
        if (Math.random() < 0.4) champ.block(); else champ.takeHit();
      }
      camShake = Math.min(1, camShake + 0.35);
    },
    onDownbeat: () => {
      camShake = Math.min(1, camShake + 0.6);
    },
    // Optional: called by some directors when scene is removed
    dispose: () => cleanup()
  };

  director.registerScene(scene);
}

// Utilities

function ensure3DLayer(): HTMLElement {
  let el = document.getElementById('boxing3d-layer') as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'boxing3d-layer';
    el.style.position = 'fixed';
    el.style.left = '0';
    el.style.top = '0';
    el.style.right = '0';
    el.style.bottom = '0';
    el.style.pointerEvents = 'none';
    el.style.zIndex = '90';
    document.body.appendChild(el);
  }
  return el;
}

function buildRing(scene: THREE.Scene) {
  // Posts
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3f, metalness: 0.2, roughness: 0.7 });
  const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.6, 12);
  const posts = [
    new THREE.Mesh(postGeo, postMat),
    new THREE.Mesh(postGeo, postMat),
    new THREE.Mesh(postGeo, postMat),
    new THREE.Mesh(postGeo, postMat)
  ];
  const px = 5.6, pz = 3.8;
  const postPos = [
    [-px, 1.3, -pz],
    [px, 1.3, -pz],
    [-px, 1.3, pz],
    [px, 1.3, pz]
  ];
  posts.forEach((m, i) => { m.position.set(postPos[i][0], postPos[i][1], postPos[i][2]); m.castShadow = true; scene.add(m); });

  // Ropes
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.2, roughness: 0.5 });
  const ropeGeo = new THREE.CylinderGeometry(0.05, 0.05, 11.2, 8);
  const ropeHeights = [1.3, 1.6, 1.9];
  for (const y of ropeHeights) {
    // front/back
    const r1 = new THREE.Mesh(ropeGeo, ropeMat); r1.position.set(0, y, -pz);
    r1.rotation.z = Math.PI / 2; r1.castShadow = true; scene.add(r1);
    const r2 = new THREE.Mesh(ropeGeo, ropeMat); r2.position.set(0, y, pz);
    r2.rotation.z = Math.PI / 2; r2.castShadow = true; scene.add(r2);
    // left/right
    const r3 = new THREE.Mesh(ropeGeo, ropeMat); r3.position.set(-px, y, 0);
    r3.rotation.x = Math.PI / 2; r3.castShadow = true; scene.add(r3);
    const r4 = new THREE.Mesh(ropeGeo, ropeMat); r4.position.set(px, y, 0);
    r4.rotation.x = Math.PI / 2; r4.castShadow = true; scene.add(r4);
  }
}

function coerceTrack(t: any): TrackLike | null {
  if (!t) return null;
  const durationMs = t.duration_ms ?? t.durationMs;
  const progressMs = t.progress_ms ?? t.progressMs;
  const startedAt = t.startedAt ?? (progressMs != null ? Date.now() - progressMs : undefined);
  return {
    id: t.id,
    title: t.name || t.title,
    artist: t.artist || (Array.isArray(t.artists) ? t.artists.map((a: any) => a.name).join(', ') : undefined),
    durationMs,
    progressMs,
    startedAt,
    albumArtUrl: pickAlbumUrl(t)
  };
}

function pickAlbumUrl(detail: any): string {
  if (!detail) return '';
  if (typeof detail.albumArtUrl === 'string') return detail.albumArtUrl;
  const album = detail.album || detail.item?.album;
  const images = album?.images;
  if (Array.isArray(images) && images.length) return images[1]?.url || images[0]?.url || '';
  if (typeof detail.image === 'string') return detail.image;
  return '';
}

async function makeCircularTexture(url: string): Promise<THREE.Texture> {
  const img = await loadImage(url);
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  // cover-fit
  const s = Math.max(size / img.width, size / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  ctx.restore();

  // gloss
  const grad = ctx.createRadialGradient(size * 0.3, size * 0.3, size * 0.05, size * 0.3, size * 0.3, size * 0.6);
  grad.addColorStop(0, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(size * 0.3, size * 0.3, size * 0.6, 0, Math.PI * 2); ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function easeOutCubic(t: number) { return 1 - Math.pow(1 - t, 3); }
function easeInCubic(t: number) { return t * t * t; }
function easeInOutCubic(t: number) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
function perfRand(t: number) { return (Math.sin(t * 12.9898) * 43758.5453) % 1; }

export default registerBoxingScene;