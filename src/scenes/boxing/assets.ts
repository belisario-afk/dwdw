// Asset management for Boxing scene
// - Album art cache (CanvasTexture)
// - Shared materials
// - Environment lights (hemi, key, rim) and fog helpers

import * as THREE from 'three';
import type { QualityFlags } from './quality';

/* ========= Album art texture cache ========= */
const albumTexCache = new Map<string, THREE.Texture>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = url;
  });
}

export async function loadAlbumTexture(url?: string | null): Promise<THREE.Texture | null> {
  if (!url) return null;
  if (albumTexCache.has(url)) return albumTexCache.get(url)!;
  
  try {
    const img = await loadImage(url);
    const size = 512;
    
    // Create canvas for resizing
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    
    // Draw image centered and scaled
    const scale = Math.min(size / img.width, size / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    const x = (size - w) / 2;
    const y = (size - h) / 2;
    
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, x, y, w, h);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    albumTexCache.set(url, texture);
    return texture;
  } catch (error) {
    console.warn('Failed to load album texture:', error);
    return null;
  }
}

export function clearAlbumCache(): void {
  for (const texture of albumTexCache.values()) {
    texture.dispose();
  }
  albumTexCache.clear();
}

/* ========= Shared materials ========= */
export interface BoxingMaterials {
  torso: THREE.MeshStandardMaterial;
  limb: THREE.MeshStandardMaterial;
  glove: THREE.MeshStandardMaterial;
  shorts: THREE.MeshStandardMaterial;
  ring: THREE.MeshStandardMaterial;
  mat: THREE.MeshStandardMaterial;
  post: THREE.MeshStandardMaterial;
  rope: THREE.MeshBasicMaterial;
}

export function createMaterials(hue1: number, hue2: number): BoxingMaterials {
  const color1 = new THREE.Color().setHSL(hue1, 0.7, 0.6);
  const color2 = new THREE.Color().setHSL(hue2, 0.7, 0.6);
  
  return {
    torso: new THREE.MeshStandardMaterial({
      color: color1,
      metalness: 0.1,
      roughness: 0.7
    }),
    limb: new THREE.MeshStandardMaterial({
      color: color1,
      metalness: 0.1,
      roughness: 0.8
    }),
    glove: new THREE.MeshStandardMaterial({
      color: color2,
      metalness: 0.2,
      roughness: 0.6
    }),
    shorts: new THREE.MeshStandardMaterial({
      color: color2.clone().multiplyScalar(0.8),
      metalness: 0.1,
      roughness: 0.9
    }),
    ring: new THREE.MeshStandardMaterial({
      color: 0x0b1320,
      metalness: 0.2,
      roughness: 0.8
    }),
    mat: new THREE.MeshStandardMaterial({
      color: 0x102033,
      metalness: 0.1,
      roughness: 0.9
    }),
    post: new THREE.MeshStandardMaterial({
      color: 0x444444,
      metalness: 0.3,
      roughness: 0.5
    }),
    rope: new THREE.MeshBasicMaterial({
      color: 0xe0e0e0
    })
  };
}

export function disposeMaterials(materials: BoxingMaterials): void {
  Object.values(materials).forEach(material => material.dispose());
}

/* ========= Environment setup ========= */
export interface BoxingLights {
  ambient: THREE.AmbientLight;
  key: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
}

export function createLights(quality: QualityFlags): BoxingLights {
  // Ambient lighting
  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  
  // Key light (main directional)
  const key = new THREE.DirectionalLight(0xffffff, 0.9);
  key.position.set(5, 10, 6);
  
  if (quality.shadows) {
    key.castShadow = true;
    key.shadow.mapSize.setScalar(quality.shadowMapSize);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 50;
    key.shadow.camera.left = -15;
    key.shadow.camera.right = 15;
    key.shadow.camera.top = 15;
    key.shadow.camera.bottom = -15;
  }
  
  // Rim light (back lighting)
  const rim = new THREE.DirectionalLight(0x88ccff, 0.4);
  rim.position.set(-6, 7, -5);
  
  // Hemisphere light for subtle fill
  const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362818, 0.2);
  
  return { ambient, key, rim, hemi };
}

export function setupFog(scene: THREE.Scene): void {
  scene.fog = new THREE.FogExp2(0x071016, 0.06);
}

export function disposeLights(lights: BoxingLights): void {
  Object.values(lights).forEach(light => {
    if (light.shadow?.map) {
      light.shadow.map.dispose();
    }
  });
}

/* ========= Track data helpers ========= */
export interface TrackLike {
  id: string;
  title: string;
  artist: string;
  albumArtUrl?: string;
  durationMs?: number;
}

export function pickAlbumUrl(detail: any): string {
  return detail?.albumArtUrl || detail?.albumArt || detail?.album?.images?.[0]?.url || '';
}

export function coerceTrack(t: any): TrackLike | null {
  if (!t) return null;
  return {
    id: String(t.id || ''),
    title: String(t.title || t.name || ''),
    artist: String(t.artist || (t.artists || []).map((a: any) => a.name).join(', ') || ''),
    albumArtUrl: pickAlbumUrl(t),
    durationMs: Number(t.durationMs || t.duration_ms || 0) || undefined
  };
}