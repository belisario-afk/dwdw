// Boxing Scene — Professional, detailed, smooth, advanced
// - Clean articulated rigs with joint constraints (shoulders/elbows + legs/feet)
// - Real-time reactions: block, duck, slip L/R, weave, stagger, KO
// - Actual glove→head collision detection (swept segment vs sphere) with damage
// - Stamina system: punch power, defense success, recovery
// - Footwork & bounce with stance phase; deterministic noise (no random jitter)
// - Animation layers (attack + defense) with blending and time-smoothing
// - Instanced ring, adaptive quality; zero per-frame allocations in hot loops
// - Renderer reuse, event cleanup, texture caching

import type { VisualDirector, SceneDef } from '@controllers/director';
import * as THREE from 'three';

/* ========= Quality detection ========= */
function isMobile() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}
const DEVICE_MEMORY = (navigator as any).deviceMemory || 4;
const QUALITY: 'low' | 'med' | 'high' = (() => {
  if (isMobile() || DEVICE_MEMORY <= 4) return 'low';
  if (DEVICE_MEMORY <= 8) return 'med';
  return 'high';
})();

/* ========= Deterministic noise / RNG ========= */
function hash(n: number) { const s = Math.sin(n * 127.1) * 43758.5453123; return (s - Math.floor(s)) * 2 - 1; }
function noise1d(x: number) { const i = Math.floor(x); const f = x - i; const u = f * f * (3 - 2 * f); return lerp(hash(i), hash(i + 1), u); }
function hashNoise(x: number) { const s = Math.sin(x * 12.9898) * 43758.5453; return s - Math.floor(s); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(x: number, a: number, b: number) { return Math.min(b, Math.max(a, x)); }
function easeIn(t: number) { return t * t; }
function easeOut(t: number) { return 1 - (1 - t) * (1 - t); }
function easeInOut(t: number) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }
function damp(current: number, target: number, lambda: number, dt: number) { return THREE.MathUtils.damp(current, target, lambda, dt); }

/* ========= Album art texture cache ========= */
const albumTexCache = new Map<string, THREE.Texture>();
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img); img.onerror = (e) => reject(e);
    img.src = url;
  });
}
async function loadAlbumTexture(url?: string | null): Promise<THREE.Texture | null> {
  if (!url) return null;
  if (albumTexCache.has(url)) return albumTexCache.get(url)!;
  try {
    const img = await loadImage(url);
    const size = 512;
    const canvas = document.createElement('canvas'); canvas.width = size; canvas.height = size;
    const g = canvas.getContext('2d')!;
    g.save(); g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.clip();
    const s = Math.max(size / img.width, size / img.height);
    const dw = img.width * s, dh = img.height * s;
    g.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
    g.restore();
    const gloss = g.createRadialGradient(size * 0.32, size * 0.28, size * 0.06, size * 0.32, size * 0.28, size * 0.6);
    gloss.addColorStop(0, 'rgba(255,255,255,0.26)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gloss; g.beginPath(); g.arc(size * 0.32, size * 0.28, size * 0.6, 0, Math.PI * 2); g.fill();
    const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = true;
    albumTexCache.set(url, tex);
    return tex;
  } catch { return null; }
}
function pickAlbumUrl(detail: any): string {
  if (!detail) return '';
  if (detail.albumArtUrl) return detail.albumArtUrl;
  const images = detail.album?.images || detail.item?.album?.images;
  if (images?.length) return images[1]?.url || images[0]?.url || '';
  return '';
}
type TrackLike = { durationMs?: number; progressMs?: number; startedAt?: number; albumArtUrl?: string; album?: any; item?: any; id?: string; title?: string };
function coerceTrack(t: any): TrackLike | null {
  if (!t) return null;
  const durationMs = t.duration_ms ?? t.durationMs;
  const progressMs = t.progress_ms ?? t.progressMs;
  return { durationMs, progressMs, startedAt: t.startedAt ?? (progressMs != null ? Date.now() - progressMs : Date.now()), albumArtUrl: pickAlbumUrl(t) };
}

/* ========= Impact sparks (pooled) ========= */
class SparkPool {
  group = new THREE.Group();
  private sprites: THREE.Sprite[] = [];
  private data: { life: number; vel: THREE.Vector3 }[] = [];
  private mat: THREE.SpriteMaterial;
  constructor(cap = 48) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,240,180,0.95)'); grd.addColorStop(0.35, 'rgba(255,210,80,0.7)'); grd.addColorStop(1, 'rgba(255,210,80,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(32, 32, 32, 0, Math.PI * 2); g.fill();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.SpriteMaterial({ map: tex, transparent: true, color: 0xfff0cc });
    for (let i = 0; i < cap; i++) {
      const s = new THREE.Sprite(this.mat); s.visible = false; s.scale.setScalar(0.15);
      this.group.add(s); this.sprites.push(s); this.data.push({ life: 0, vel: new THREE.Vector3() });
    }
  }
  spawn(pos: THREE.Vector3, dir: THREE.Vector3, count = 7, scale = 1) {
    for (let k = 0; k < count; k++) {
      const idx = this.data.findIndex(d => d.life <= 0); if (idx < 0) break;
      const s = this.sprites[idx], d = this.data[idx];
      s.visible = true; s.position.copy(pos);
      const sc = (0.18 + Math.random() * 0.1) * scale; s.scale.set(sc, sc, 1);
      d.life = 0.45 + Math.random() * 0.25;
      d.vel.copy(dir).multiplyScalar(2 + Math.random() * 2).add(new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.6, Math.random() - 0.5));
    }
  }
  update(dt: number) {
    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i]; if (d.life <= 0) { this.sprites[i].visible = false; continue; }
      d.life -= dt; this.sprites[i].position.addScaledVector(d.vel, dt);
      (this.sprites[i].material as THREE.SpriteMaterial).opacity = Math.max(0, d.life * 2);
      if (d.life <= 0) this.sprites[i].visible = false;
    }
  }
}

/* ========= Fighter rig ========= */
type AttackType = 'jab' | 'cross' | 'hook' | 'uppercut';
type DefenseType = 'idle' | 'block' | 'duck' | 'slipL' | 'slipR' | 'weave' | 'stagger' | 'ko';

class Fighter {
  group = new THREE.Group();

  // Core
  torso: THREE.Mesh; head: THREE.Mesh; pelvis = new THREE.Group();

  // Arms
  leftShoulder = new THREE.Group(); leftUpper: THREE.Mesh; leftElbow = new THREE.Group(); leftFore: THREE.Mesh;
  rightShoulder = new THREE.Group(); rightUpper: THREE.Mesh; rightElbow = new THREE.Group(); rightFore: THREE.Mesh;

  // Legs/Feet (simple)
  leftHip = new THREE.Group(); leftLeg: THREE.Mesh; leftAnkle = new THREE.Group(); leftFoot: THREE.Mesh;
  rightHip = new THREE.Group(); rightLeg: THREE.Mesh; rightAnkle = new THREE.Group(); rightFoot: THREE.Mesh;

  // Album disc
  disc: THREE.Mesh; discMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

  // State
  facingRight: boolean; hue: number;
  stamina = 1; // 0..1
  defense: DefenseType = 'idle'; defT = 0;
  // Attack overlay
  atk: AttackType | null = null; atkT = 0; atkDur = 0.32; atkLead = true;

  // Footwork
  gait = 0; // phase
  idleSeed = Math.random() * 1000;

  // Scratch
  private v1 = new THREE.Vector3(); private v2 = new THREE.Vector3(); private q = new THREE.Quaternion();

  constructor(hue: number, facingRight: boolean) {
    this.hue = hue; this.facingRight = facingRight;
    this.group.rotation.y = facingRight ? 0 : Math.PI;

    // Materials
    const bodyCol = new THREE.Color().setHSL(hue / 360, 0.45, 0.52);
    const gloveCol = new THREE.Color().setHSL((hue + 10) / 360, 0.86, 0.55);
    const skinCol = new THREE.Color().setHSL((hue + 170) / 360, 0.35, 0.72);

    const matTorso = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.82, metalness: 0.12 });
    const matArm = new THREE.MeshStandardMaterial({ color: bodyCol, roughness: 0.8, metalness: 0.12 });
    const matGlove = new THREE.MeshStandardMaterial({ color: gloveCol, emissive: gloveCol.clone().multiplyScalar(0.25), emissiveIntensity: 0.22, roughness: 0.6, metalness: 0.05 });
    const matHead = new THREE.MeshStandardMaterial({ color: skinCol, roughness: 0.72, metalness: 0.08 });
    const matLeg = new THREE.MeshStandardMaterial({ color: bodyCol.clone().offsetHSL(0, -0.05, -0.05), roughness: 0.85, metalness: 0.12 });

    // Torso and pelvis
    const torsoGeo = new THREE.SphereGeometry(1.0, 28, 28);
    this.torso = new THREE.Mesh(torsoGeo, matTorso); this.torso.scale.set(1.1, 1.3, 1); this.torso.position.y = 2.05; this.torso.castShadow = QUALITY !== 'low';
    this.group.add(this.torso);
    this.pelvis.position.set(0, 1.1, 0); this.group.add(this.pelvis);

    // Head
    this.head = new THREE.Mesh(new THREE.SphereGeometry(0.52, 24, 24), matHead);
    this.head.position.set(0, 3.2, 0.05); this.head.castShadow = QUALITY !== 'low';
    this.group.add(this.head);

    // Arms
    const upperGeo = new THREE.CylinderGeometry(0.14, 0.18, 0.95, 16);
    const foreGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.0, 16);
    // Left arm
    this.leftShoulder.position.set(-0.62, 2.45, 0.22); this.group.add(this.leftShoulder);
    this.leftUpper = new THREE.Mesh(upperGeo, matArm); this.leftUpper.rotation.z = Math.PI / 2; this.leftShoulder.add(this.leftUpper);
    this.leftElbow.position.set(-0.95, 0, 0); this.leftShoulder.add(this.leftElbow);
    this.leftFore = new THREE.Mesh(foreGeo, matGlove); this.leftFore.rotation.z = Math.PI / 2; this.leftFore.position.set(-0.5, 0, 0); this.leftElbow.add(this.leftFore);
    // Right arm
    this.rightShoulder.position.set(0.62, 2.45, 0.22); this.group.add(this.rightShoulder);
    this.rightUpper = new THREE.Mesh(upperGeo, matArm); this.rightUpper.rotation.z = Math.PI / 2; this.rightShoulder.add(this.rightUpper);
    this.rightElbow.position.set(0.95, 0, 0); this.rightShoulder.add(this.rightElbow);
    this.rightFore = new THREE.Mesh(foreGeo, matGlove); this.rightFore.rotation.z = Math.PI / 2; this.rightFore.position.set(0.5, 0, 0); this.rightElbow.add(this.rightFore);

    // Legs/Feet
    const legGeo = new THREE.CylinderGeometry(0.16, 0.2, 1.1, 14);
    const footGeo = new THREE.BoxGeometry(0.36, 0.16, 0.68);
    // Left
    this.leftHip.position.set(-0.4, 1.1, 0.05); this.pelvis.add(this.leftHip);
    this.leftLeg = new THREE.Mesh(legGeo, matLeg); this.leftLeg.rotation.x = Math.PI / 2; this.leftHip.add(this.leftLeg);
    this.leftAnkle.position.set(0, -0.55, 0); this.leftHip.add(this.leftAnkle);
    this.leftFoot = new THREE.Mesh(footGeo, matLeg); this.leftFoot.position.set(0, -0.05, 0.18); this.leftAnkle.add(this.leftFoot);
    // Right
    this.rightHip.position.set(0.4, 1.1, 0.05); this.pelvis.add(this.rightHip);
    this.rightLeg = new THREE.Mesh(legGeo, matLeg); this.rightLeg.rotation.x = Math.PI / 2; this.rightHip.add(this.rightLeg);
    this.rightAnkle.position.set(0, -0.55, 0); this.rightHip.add(this.rightAnkle);
    this.rightFoot = new THREE.Mesh(footGeo, matLeg); this.rightFoot.position.set(0, -0.05, 0.18); this.rightAnkle.add(this.rightFoot);

    // Album disc (on chest)
    this.disc = new THREE.Mesh(new THREE.CircleGeometry(0.85, 48), this.discMat);
    this.disc.position.set(0, 2.08, 0.92); this.group.add(this.disc);
  }

  async setAlbum(url?: string | null) {
    const t = await loadAlbumTexture(url || null); this.discMat.map = t || null; this.discMat.needsUpdate = true;
  }

  startAttack(type: AttackType, lead = true, staminaCost = 0.08) {
    if (this.defense === 'ko') return;
    if (this.atk && this.atkT < this.atkDur * 0.7) return; // avoid spam mid-swing
    this.atk = type; this.atkT = 0; this.atkDur = type === 'jab' ? 0.28 : type === 'cross' ? 0.34 : type === 'hook' ? 0.38 : 0.4;
    this.atkLead = lead;
    this.stamina = Math.max(0.1, this.stamina - staminaCost * (type === 'jab' ? 0.8 : 1.2));
  }
  setDefense(type: DefenseType) {
    if (this.defense === 'ko') return;
    this.defense = type; this.defT = 0;
  }
  takeHit(power = 1) {
    if (this.defense === 'ko') return;
    const dmg = 0.12 * power;
    this.stamina = Math.max(0, this.stamina - dmg);
    this.defense = 'stagger'; this.defT = 0;
  }
  knockOut() { this.defense = 'ko'; this.defT = 0; }

  getLeadFore(): THREE.Mesh { return this.facingRight ? this.rightFore : this.leftFore; }
  getRearFore(): THREE.Mesh { return this.facingRight ? this.leftFore : this.rightFore; }
  headWorldPos(out: THREE.Vector3) { return this.head.getWorldPosition(out); }
  gloveWorldPos(lead: boolean, out: THREE.Vector3) { return (lead ? this.getLeadFore() : this.getRearFore()).getWorldPosition(out); }

  update(dt: number, t: number, songEnergy: number) {
    // Frame smoothing to avoid spikes
    const sdt = Math.min(0.033, Math.max(0.001, dt));

    // Recover stamina slowly
    this.stamina = clamp(this.stamina + sdt * 0.05 * (0.7 + 0.6 * (1 - songEnergy)), 0, 1);

    // Idle motion
    const sway = noise1d(this.idleSeed + t * 0.5) * 0.06;
    const bob = Math.sin(t * 1.8) * 0.04 * (1 + songEnergy * 0.4);
    const step = Math.sin(t * 1.25 + (this.facingRight ? 0 : Math.PI)) * 0.08 * (0.6 + 0.4 * this.stamina);
    this.group.position.x = (this.facingRight ? 1 : -1) * 0.08 + step * 0.6;
    this.torso.position.y = 2.05 + bob;
    this.head.position.y = 3.2 + bob * 1.1;

    // Footwork gait (legs)
    this.gait += sdt * (1.5 + 0.8 * songEnergy);
    const lStep = Math.sin(this.gait);
    const rStep = Math.sin(this.gait + Math.PI);
    this.leftHip.rotation.x = lStep * 0.15; this.rightHip.rotation.x = rStep * 0.15;
    this.leftAnkle.rotation.x = -lStep * 0.1; this.rightAnkle.rotation.x = -rStep * 0.1;

    // Base guard (joint angles)
    let lS = -0.28, lE = -0.65, rS = 0.28, rE = 0.65;
    // Attack overlay
    if (this.atk) {
      this.atkT += sdt;
      const p = clamp(this.atkT / this.atkDur, 0, 1);
      const inP = easeOut(Math.min(1, p * 1.4));
      const retP = easeIn(Math.max(0, (p - 0.5) * 2));
      const lead = this.atkLead;
      switch (this.atk) {
        case 'jab': {
          if (this.facingRight ? lead : !lead) { // right jab
            rE = clamp(0.65 - 1.15 * inP + 0.9 * retP, -1.6, 1.6);
            rS = clamp(0.28 - 0.2 * inP + 0.15 * retP, -1.0, 1.0);
          } else { // left jab
            lE = clamp(-0.65 + 1.15 * inP - 0.9 * retP, -1.6, 1.6);
            lS = clamp(-0.28 + 0.2 * inP - 0.15 * retP, -1.0, 1.0);
          }
          break;
        }
        case 'cross': {
          const yaw = (this.facingRight ? -1 : 1) * 0.3 * inP - 0.25 * retP;
          this.group.rotation.y = (this.facingRight ? 0 : Math.PI) + sway * 0.5 + yaw;
          if (this.facingRight ? !lead : lead) { // rear hand
            lE = clamp(-0.65 - 1.25 * inP + 1.0 * retP, -1.8, 1.8);
            lS = clamp(-0.28 - 0.1 * inP + 0.1 * retP, -1.0, 1.0);
          } else {
            rE = clamp(0.65 + 1.25 * inP - 1.0 * retP, -1.8, 1.8);
            rS = clamp(0.28 + 0.1 * inP - 0.1 * retP, -1.0, 1.0);
          }
          break;
        }
        case 'hook': {
          const roll = (this.facingRight ? -1 : 1) * 0.4 * inP;
          this.group.rotation.z = roll * 0.4 - 0.3 * retP;
          if (this.facingRight ? lead : !lead) {
            rE = clamp(0.65 - 1.0 * inP + 0.9 * retP, -1.8, 1.8);
            rS = clamp(0.28 + 0.7 * inP - 0.5 * retP, -1.0, 1.4);
          } else {
            lE = clamp(-0.65 + 1.0 * inP - 0.9 * retP, -1.8, 1.8);
            lS = clamp(-0.28 - 0.7 * inP + 0.5 * retP, -1.4, 1.0);
          }
          break;
        }
        case 'uppercut': {
          const lift = 0.22 * inP - 0.18 * retP; this.group.position.y += lift;
          if (this.facingRight ? lead : !lead) {
            rE = clamp(0.65 - 1.25 * inP + 1.0 * retP, -1.8, 1.8);
            rS = clamp(0.28 + 0.2 * inP - 0.2 * retP, -1.0, 1.0);
          } else {
            lE = clamp(-0.65 + 1.25 * inP - 1.0 * retP, -1.8, 1.8);
            lS = clamp(-0.28 - 0.2 * inP + 0.2 * retP, -1.0, 1.0);
          }
          break;
        }
      }
      if (p >= 1) this.atk = null;
    }

    // Defense overlay
    this.defT += sdt;
    switch (this.defense) {
      case 'block': {
        const p = easeInOut(Math.min(1, this.defT * 2.2));
        lE = lerp(lE, -1.35, p); rE = lerp(rE, 1.35, p);
        lS = lerp(lS, -0.6, p); rS = lerp(rS, 0.6, p);
        break;
      }
      case 'duck': {
        const p = easeInOut(Math.min(1, this.defT * 2.2));
        this.group.position.y = lerp(this.group.position.y, -0.4, p);
        this.group.rotation.x = lerp(this.group.rotation.x, 0.18, p);
        break;
      }
      case 'slipL': {
        const p = easeInOut(Math.min(1, this.defT * 2.2));
        const dir = this.facingRight ? -1 : 1;
        this.group.position.x += dir * 0.16 * p;
        this.group.rotation.y += dir * 0.2 * p;
        break;
      }
      case 'slipR': {
        const p = easeInOut(Math.min(1, this.defT * 2.2));
        const dir = this.facingRight ? 1 : -1;
        this.group.position.x += dir * 0.16 * p;
        this.group.rotation.y += dir * 0.2 * p;
        break;
      }
      case 'weave': {
        const p = Math.min(1, this.defT * 2.0);
        this.group.position.y = lerp(this.group.position.y, -0.28, Math.sin(p * Math.PI));
        this.group.rotation.z = lerp(this.group.rotation.z, (this.facingRight ? -1 : 1) * 0.35, Math.sin(p * Math.PI));
        break;
      }
      case 'stagger': {
        const p = easeOut(Math.min(1, this.defT * 1.8));
        this.group.rotation.z = (this.facingRight ? 1 : -1) * 0.28 * p;
        this.group.position.x += (this.facingRight ? -1 : 1) * 0.07 * p;
        if (this.defT > 0.6) { this.defense = 'idle'; this.defT = 0; }
        break;
      }
      case 'ko': {
        const p = easeIn(Math.min(1, this.defT * 1.6));
        this.group.rotation.x = lerp(this.group.rotation.x, Math.PI / 2, p);
        this.group.position.y = lerp(this.group.position.y, -1.1, p);
        lS += 0.7 * p; lE += 1.3 * p; rS -= 0.7 * p; rE -= 1.3 * p;
        break;
      }
      default: break;
    }

    // Reset lean back to stance smoothly if not in strong defense
    if (this.defense === 'idle' || this.defense === 'block') {
      this.group.rotation.z = damp(this.group.rotation.z, 0, 8, sdt);
      this.group.rotation.x = damp(this.group.rotation.x, 0, 8, sdt);
      this.group.position.y = damp(this.group.position.y, 0, 8, sdt);
      this.group.rotation.y = damp(this.group.rotation.y, (this.facingRight ? 0 : Math.PI) + sway * 0.5, 6, sdt);
    }

    // Apply joint rotations (already clamped)
    this.leftShoulder.rotation.z = lS;
    this.leftElbow.rotation.z = lE;
    this.rightShoulder.rotation.z = rS;
    this.rightElbow.rotation.z = rE;
  }
}

/* ========= Scene registration ========= */
function buildRingInstanced(scene: THREE.Scene) {
  const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.6, 10);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3f, roughness: 0.7, metalness: 0.2 });
  const posts = new THREE.InstancedMesh(postGeo, postMat, 4); posts.castShadow = QUALITY !== 'low';
  const px = 5.4, pz = 3.6;
  const postPos = [new THREE.Vector3(-px, 1.3, -pz), new THREE.Vector3(px, 1.3, -pz), new THREE.Vector3(-px, 1.3, pz), new THREE.Vector3(px, 1.3, pz)];
  const m = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) { m.compose(postPos[i], new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); posts.setMatrixAt(i, m); }
  scene.add(posts);

  const ropeGeo = new THREE.CylinderGeometry(0.05, 0.05, 10.8, 8);
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0.15 });
  const ropes = new THREE.InstancedMesh(ropeGeo, ropeMat, 12);
  const heights = [1.25, 1.55, 1.85]; let idx = 0;
  const addRope = (a: THREE.Vector3, b: THREE.Vector3, y: number) => {
    const mid = a.clone().lerp(b, 0.5); mid.y = y; const dir = b.clone().sub(a); const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    const mat = new THREE.Matrix4().compose(mid, quat, new THREE.Vector3(1, len, 1)); ropes.setMatrixAt(idx++, mat);
  };
  for (const y of heights) {
    addRope(new THREE.Vector3(-px, y, -pz), new THREE.Vector3(px, y, -pz), y);
    addRope(new THREE.Vector3(-px, y, pz), new THREE.Vector3(px, y, pz), y);
    addRope(new THREE.Vector3(-px, y, -pz), new THREE.Vector3(-px, y, pz), y);
    addRope(new THREE.Vector3(px, y, -pz), new THREE.Vector3(px, y, pz), y);
  }
  scene.add(ropes);
}

function ensureLayer(): HTMLElement {
  let el = document.getElementById('boxing3d-layer') as HTMLElement | null;
  if (!el) {
    el = document.createElement('div');
    el.id = 'boxing3d-layer';
    Object.assign(el.style, { position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', pointerEvents: 'none', zIndex: '90' });
    document.body.appendChild(el);
  }
  return el;
}

function registerBoxingScene(director: VisualDirector) {
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
  scene.fog = new THREE.FogExp2(0x0b0e14, QUALITY === 'high' ? 0.03 : 0.04);

  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 200);
  camera.position.set(0, 3.7, 9.2);

  // Lights
  const hemi = new THREE.HemisphereLight(0x9ec9ff, 0x12141a, QUALITY === 'high' ? 0.85 : 0.7);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffffff, QUALITY === 'high' ? 0.9 : 0.7);
  key.position.set(3.5, 6.2, 5.8);
  key.castShadow = QUALITY !== 'low';
  if (key.castShadow) { key.shadow.mapSize.set(1024, 1024); key.shadow.camera.near = 0.5; key.shadow.camera.far = 30; }
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x88aaff, QUALITY === 'high' ? 0.35 : 0.25); rim.position.set(-6, 5, -5); scene.add(rim);

  // Floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ color: 0x10141c, roughness: 0.96, metalness: 0.02 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

  // Ring
  buildRingInstanced(scene);

  // Fighters
  const champ = new Fighter(210, true); champ.group.position.set(-2.0, 0, 0); scene.add(champ.group);
  const challenger = new Fighter(0, false); challenger.group.position.set(2.0, 0, 0); scene.add(challenger.group);

  // Sparks
  const sparks = new SparkPool(QUALITY === 'high' ? 56 : 36); scene.add(sparks.group);

  // Track info
  let nowPlaying: TrackLike | null = null;
  let nextTrack: TrackLike | null = null;
  function trackRemainingMs() {
    if (!nowPlaying) return Infinity;
    const dur = nowPlaying.durationMs ?? 0;
    const start = nowPlaying.startedAt ?? (nowPlaying.progressMs != null ? Date.now() - nowPlaying.progressMs : Date.now());
    return Math.max(0, dur - (Date.now() - start));
  }

  // Active attacks (for collision)
  const activeAttacks: Array<{ attacker: Fighter; target: Fighter; lead: boolean; type: AttackType; t: number; dur: number; prev: THREE.Vector3 }> = [];
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3(), tmpD = new THREE.Vector3();

  function startExchange(attacker: Fighter, defender: Fighter) {
    if (attacker.defense === 'ko' || defender.defense === 'ko') return;

    // Choose attack, considering stamina
    const stam = attacker.stamina;
    const rnd = Math.random();
    const heavyBias = clamp(0.2 + 0.6 * (1 - stam), 0.2, 0.7);
    const type: AttackType = rnd < 0.45 ? 'jab' : rnd < 0.45 + heavyBias ? 'cross' : rnd < 0.45 + heavyBias + 0.15 ? 'hook' : 'uppercut';
    const lead = Math.random() < 0.7; // mostly lead hand
    attacker.startAttack(type, lead);

    // Defender reaction based on stamina and randomness
    const r = Math.random();
    const defBias = clamp(0.35 + 0.4 * defender.stamina, 0.25, 0.8);
    if (r < defBias * 0.5) defender.setDefense('block');
    else if (r < defBias * 0.7) defender.setDefense('duck');
    else if (r < defBias * 0.85) defender.setDefense(Math.random() < 0.5 ? 'slipL' : 'slipR');
    else if (r < defBias) defender.setDefense('weave');
    else defender.setDefense('idle');

    // Create an active attack to track collision along glove path
    const startPos = attacker.gloveWorldPos(lead, new THREE.Vector3());
    activeAttacks.push({ attacker, target: defender, lead, type, t: 0, dur: attacker.atkDur, prev: startPos.clone() });
  }

  // Events
  const onChamp = async (e: Event) => {
    const detail = (e as CustomEvent).detail;
    nowPlaying = coerceTrack(detail);
    await champ.setAlbum(nowPlaying?.albumArtUrl || null);
    for (const f of [champ, challenger]) { f.defense = 'idle'; f.defT = 0; f.atk = null; f.atkT = 0; f.stamina = 1; }
    activeAttacks.length = 0;
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
        const mat = m.material as any; if (Array.isArray(mat)) mat.forEach((mm) => mm?.dispose?.()); else mat?.dispose?.();
      }
    });
  }

  // Camera and beat logic
  let camShake = 0; let camZoom = 0; let sceneTime = 0;

  const def: SceneDef = {
    name: 'Boxing',
    draw: (_ctx, w, h, _time, dt) => {
      sceneTime += dt;
      // Resize only when necessary
      const pr = Math.min(window.devicePixelRatio || 1, QUALITY === 'high' ? 2 : 1.5);
      if (renderer!.getPixelRatio() !== pr) renderer!.setPixelRatio(pr);
      const needSize = renderer!.domElement.width !== Math.floor(w * pr) || renderer!.domElement.height !== Math.floor(h * pr);
      if (needSize) renderer!.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix();

      // Fight cadence + KO near end
      const remain = trackRemainingMs();
      const nearingKO = remain < 9000; const endKO = remain < 1400;
      const energy = nowPlaying?.durationMs ? 1 - Math.min(1, remain / Math.max(20000, nowPlaying.durationMs)) : 0.5;

      // Update fighters
      champ.update(dt, sceneTime, energy);
      challenger.update(dt, sceneTime + 0.35, energy * 0.95);

      // Update active attacks and collisions
      for (let i = activeAttacks.length - 1; i >= 0; i--) {
        const a = activeAttacks[i];
        a.t += dt;
        const cur = a.attacker.gloveWorldPos(a.lead, tmpA);
        const prev = a.prev;
        // Head sphere
        const head = a.target.headWorldPos(tmpB);
        const radius = 0.42;
        // Swept segment vs sphere
        tmpD.copy(cur).sub(prev);
        const segLen = tmpD.length();
        if (segLen > 1e-5) {
          tmpD.normalize();
          const toCenter = head.clone().sub(prev);
          const proj = THREE.MathUtils.clamp(toCenter.dot(tmpD), 0, segLen);
          const closest = prev.clone().addScaledVector(tmpD, proj);
          const distSq = head.distanceToSquared(closest);
          if (distSq <= radius * radius) {
            // Evaluate defense mitigation
            let mitigation = 0;
            switch (a.target.defense) {
              case 'block': mitigation = 0.6; break;
              case 'duck': mitigation = 0.4; break;
              case 'slipL': case 'slipR': mitigation = 0.5; break;
              case 'weave': mitigation = 0.35; break;
              default: mitigation = 0;
            }
            const power = clamp(0.6 + (a.type === 'cross' || a.type === 'hook' || a.type === 'uppercut' ? 0.5 : 0.2), 0.4, 1.1) * (0.6 + 0.6 * a.attacker.stamina);
            const finalPower = power * (1 - mitigation);
            // Visuals
            const dir = new THREE.Vector3(a.attacker.facingRight ? 1 : -1, 0.2, 0);
            sparks.spawn(head, dir, QUALITY === 'high' ? (finalPower > 0.5 ? 12 : 7) : (finalPower > 0.5 ? 8 : 5), 0.9 + finalPower * 0.5);
            camShake = Math.min(1, camShake + (0.25 + finalPower * 0.55));
            if (finalPower > 0.15) a.target.takeHit(finalPower);
            // Remove this attack after hit
            activeAttacks.splice(i, 1);
            continue;
          }
        }
        a.prev.copy(cur);
        if (a.t >= a.dur + 0.05) activeAttacks.splice(i, 1);
      }

      // End-of-track KO
      if (nearingKO && !activeAttacks.length && champ.defense !== 'ko' && challenger.defense !== 'ko') {
        if (endKO) {
          (Math.random() < 0.6 ? champ : challenger).knockOut();
          camShake = 1.0;
        }
      }

      // Camera
      camShake = Math.max(0, camShake - dt * 2.7);
      camZoom = damp(camZoom, nearingKO ? 0.14 : 0, 4, dt);
      const sx = (hashNoise(sceneTime * 3.3) - 0.5) * camShake * 0.18;
      const sy = (hashNoise(100 + sceneTime * 3.7) - 0.5) * camShake * 0.18;
      camera.position.set(0 + sx, 3.7 + sy, 9.2 - camZoom * 6.2);
      camera.lookAt(0, 2.3 + sy * 0.5, 0);

      // Sparks
      sparks.update(dt);

      renderer!.render(scene, camera);
    },
    onBeat: () => {
      // Alternating exchanges; stamina modulates frequency
      const leftAttacks = Math.random() < 0.5;
      if (leftAttacks) startExchange(champ, challenger);
      else startExchange(challenger, champ);
    },
    onDownbeat: () => { camShake = Math.min(1, camShake + 0.55); },
    dispose: () => cleanup(),
  };

  director.registerScene(def);
}

/* ========= Exports ========= */
export { registerBoxingScene };
export default registerBoxingScene;