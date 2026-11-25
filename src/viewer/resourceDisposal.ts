import * as THREE from 'three';

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'displacementMap',
  'lightMap',
  'envMap',
  'clearcoatMap',
  'clearcoatNormalMap',
  'clearcoatRoughnessMap',
  'sheenColorMap',
  'sheenRoughnessMap',
  'specularIntensityMap',
  'specularColorMap',
  'transmissionMap',
  'thicknessMap',
  'iridescenceMap',
  'iridescenceThicknessMap',
  'anisotropyMap',
] as const;

export function getMaterialTextures(material: THREE.Material): Array<{ slot: string; texture: THREE.Texture }> {
  const found: Array<{ slot: string; texture: THREE.Texture }> = [];
  const matRecord = material as unknown as Record<string, unknown>;
  for (const slot of TEXTURE_SLOTS) {
    const candidate = matRecord[slot];
    if (candidate && typeof candidate === 'object' && (candidate as THREE.Texture).isTexture) {
      found.push({ slot, texture: candidate as THREE.Texture });
    }
  }
  return found;
}

/**
 * Disposes all geometries, materials, textures, and skeleton resources under a Three.js Object3D.
 */
export function disposeObject3D(root: THREE.Object3D): void {
  const disposedGeometries = new Set<THREE.BufferGeometry>();
  const disposedMaterials = new Set<THREE.Material>();
  const disposedTextures = new Set<THREE.Texture>();

  root.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry && !disposedGeometries.has(mesh.geometry)) {
        mesh.geometry.dispose();
        disposedGeometries.add(mesh.geometry);
      }

      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of materials) {
        if (!mat || disposedMaterials.has(mat)) continue;
        const textures = getMaterialTextures(mat);
        for (const { texture } of textures) {
          if (!disposedTextures.has(texture)) {
            texture.dispose();
            disposedTextures.add(texture);
          }
        }
        mat.dispose();
        disposedMaterials.add(mat);
      }
    }

    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      const skinned = obj as THREE.SkinnedMesh;
      if (skinned.skeleton) {
        skinned.skeleton.dispose();
      }
    }
  });
}
