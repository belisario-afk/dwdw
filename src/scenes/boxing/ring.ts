// Ring construction for Boxing scene
// - Instanced ring posts/ropes
// - Floor mesh
// - Light placement
// - Shadow budgets

import * as THREE from 'three';
import type { QualityFlags } from './quality';
import type { BoxingMaterials } from './assets';

export interface RingComponents {
  posts: THREE.InstancedMesh;
  ropes: THREE.InstancedMesh;
  platform: THREE.Group;
  base: THREE.Mesh;
  mat: THREE.Mesh;
}

export function buildRing(scene: THREE.Scene, materials: BoxingMaterials, quality: QualityFlags): RingComponents {
  // Ring platform group
  const platform = new THREE.Group();
  scene.add(platform);

  // Floor base
  const baseGeo = new THREE.CylinderGeometry(8, 8, 0.8, 32);
  const base = new THREE.Mesh(baseGeo, materials.ring);
  base.receiveShadow = quality.shadows;
  base.position.y = 0;
  platform.add(base);

  // Mat
  const matGeo = new THREE.PlaneGeometry(12, 12, 1, 1);
  const mat = new THREE.Mesh(matGeo, materials.mat);
  mat.receiveShadow = quality.shadows;
  mat.rotation.x = -Math.PI / 2;
  mat.position.y = 0.401;
  platform.add(mat);

  // Posts (instanced for performance)
  const postGeo = new THREE.CylinderGeometry(0.12, 0.12, 2.6, 10);
  const posts = new THREE.InstancedMesh(postGeo, materials.post, 4);
  posts.castShadow = quality.shadows;
  
  const px = 5.4, pz = 3.6;
  const postPositions = [
    new THREE.Vector3(-px, 1.3, -pz),
    new THREE.Vector3(px, 1.3, -pz),
    new THREE.Vector3(-px, 1.3, pz),
    new THREE.Vector3(px, 1.3, pz)
  ];
  
  const postMatrix = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) {
    postMatrix.compose(postPositions[i], new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    posts.setMatrixAt(i, postMatrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  scene.add(posts);

  // Ropes (instanced)
  const ropeGeo = new THREE.CylinderGeometry(0.05, 0.05, 10.8, 8);
  const ropes = new THREE.InstancedMesh(ropeGeo, materials.rope, 12);
  
  const ropeHeights = [1.25, 1.55, 1.85];
  let ropeIndex = 0;
  
  const addRope = (start: THREE.Vector3, end: THREE.Vector3, height: number) => {
    const mid = start.clone().lerp(end, 0.5);
    mid.y = height;
    
    const direction = end.clone().sub(start);
    const length = direction.length();
    
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      direction.normalize()
    );
    
    const matrix = new THREE.Matrix4().compose(
      mid,
      quaternion,
      new THREE.Vector3(1, length, 1)
    );
    
    ropes.setMatrixAt(ropeIndex++, matrix);
  };

  for (const height of ropeHeights) {
    // Front and back ropes
    addRope(new THREE.Vector3(-px, height, -pz), new THREE.Vector3(px, height, -pz), height);
    addRope(new THREE.Vector3(-px, height, pz), new THREE.Vector3(px, height, pz), height);
    
    // Left and right ropes
    addRope(new THREE.Vector3(-px, height, -pz), new THREE.Vector3(-px, height, pz), height);
    addRope(new THREE.Vector3(px, height, -pz), new THREE.Vector3(px, height, pz), height);
  }
  
  ropes.instanceMatrix.needsUpdate = true;
  scene.add(ropes);

  return { posts, ropes, platform, base, mat };
}

export function disposeRing(components: RingComponents): void {
  // Dispose geometries and remove from scene
  components.posts.geometry.dispose();
  components.ropes.geometry.dispose();
  
  components.posts.parent?.remove(components.posts);
  components.ropes.parent?.remove(components.ropes);
  components.platform.parent?.remove(components.platform);
  
  // Clear platform children
  while (components.platform.children.length > 0) {
    const child = components.platform.children[0];
    components.platform.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
    }
  }
}

/* ========= Ring positioning helpers ========= */
export const RING_BOUNDS = {
  minX: -5.4,
  maxX: 5.4,
  minZ: -3.6,
  maxZ: 3.6,
  floorY: 0.4,
  centerY: 1.8
};

export function isInRing(position: THREE.Vector3): boolean {
  return position.x >= RING_BOUNDS.minX &&
         position.x <= RING_BOUNDS.maxX &&
         position.z >= RING_BOUNDS.minZ &&
         position.z <= RING_BOUNDS.maxZ;
}

export function clampToRing(position: THREE.Vector3): THREE.Vector3 {
  return new THREE.Vector3(
    Math.max(RING_BOUNDS.minX, Math.min(RING_BOUNDS.maxX, position.x)),
    position.y,
    Math.max(RING_BOUNDS.minZ, Math.min(RING_BOUNDS.maxZ, position.z))
  );
}