import * as THREE from 'three';
import type {
  AnimationClipInfo,
  MaterialInfo,
  ModelAnalysis,
  SceneNodeInfo,
  TextureInfo,
} from '../ui/types';
import { getMaterialTextures } from './resourceDisposal';

export interface AnalyzeModelOptions {
  root: THREE.Object3D;
  animations: THREE.AnimationClip[];
  fileName: string;
  fileFormat: 'GLB' | 'glTF';
  sourceFileCount: number;
  sourceSizeBytes: number;
  generator?: string | null;
  gltfVersion?: string | null;
  generateTexturePreviews?: boolean;
}

function getMeshStats(mesh: THREE.Mesh): {
  vertices: number;
  triangles: number;
  parts: number;
  uvChannels: string[];
} {
  const geom = mesh.geometry;
  if (!geom) {
    return { vertices: 0, triangles: 0, parts: 0, uvChannels: [] };
  }

  const instanceCount = (mesh as THREE.InstancedMesh).isInstancedMesh
    ? Math.max(1, (mesh as THREE.InstancedMesh).count)
    : 1;

  const posAttr = geom.getAttribute('position');
  const vertices = posAttr ? posAttr.count * instanceCount : 0;

  let triangles = 0;
  if (geom.index) {
    triangles = Math.floor(geom.index.count / 3) * instanceCount;
  } else if (posAttr) {
    triangles = Math.floor(posAttr.count / 3) * instanceCount;
  }

  const parts = geom.groups && geom.groups.length > 0 ? geom.groups.length : 1;

  const uvChannels: string[] = [];
  if (geom.getAttribute('uv')) uvChannels.push('UV0');
  if (geom.getAttribute('uv1') || geom.getAttribute('uv2')) uvChannels.push('UV1');
  if (geom.getAttribute('uv3')) uvChannels.push('UV2');

  return { vertices, triangles, parts, uvChannels };
}

function estimateGeometryMemory(geom: THREE.BufferGeometry): number {
  let bytes = 0;
  for (const attrName of Object.keys(geom.attributes)) {
    const attr = geom.attributes[attrName];
    if (attr && attr.array) {
      bytes += attr.array.byteLength;
    }
  }
  if (geom.index && geom.index.array) {
    bytes += geom.index.array.byteLength;
  }
  return bytes;
}

function getTextureDimensions(texture: THREE.Texture): { width: number; height: number } {
  const img = texture.image as
    | { width?: number; height?: number; videoWidth?: number; videoHeight?: number }
    | undefined;
  if (!img) return { width: 0, height: 0 };
  const width = img.width ?? img.videoWidth ?? 0;
  const height = img.height ?? img.videoHeight ?? 0;
  return { width, height };
}

function createTexturePreview(texture: THREE.Texture, maxSize = 96): string | null {
  if (typeof document === 'undefined') return null;
  const img = texture.image as CanvasImageSource & {
    width?: number;
    height?: number;
    data?: Uint8Array | Uint8ClampedArray;
  };
  if (!img) return null;

  try {
    const width = img.width ?? 0;
    const height = img.height ?? 0;
    if (width <= 0 || height <= 0) return null;

    const scale = Math.min(1, maxSize / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    if (
      img instanceof HTMLImageElement ||
      img instanceof HTMLCanvasElement ||
      (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) ||
      (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas)
    ) {
      ctx.drawImage(img, 0, 0, targetW, targetH);
      return canvas.toDataURL('image/png');
    }

    if (img.data && img.data.length >= width * height * 4) {
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = width;
      tempCanvas.height = height;
      const tempCtx = tempCanvas.getContext('2d');
      if (!tempCtx) return null;
      const pixelCount = width * height * 4;
      const clamped = new Uint8ClampedArray(pixelCount);
      clamped.set(img.data.subarray(0, pixelCount));
      tempCtx.putImageData(new ImageData(clamped, width, height), 0, 0);
      ctx.drawImage(tempCanvas, 0, 0, targetW, targetH);
      return canvas.toDataURL('image/png');
    }

    return null;
  } catch {
    return null;
  }
}

function formatColorSpaceLabel(colorSpace: string): string {
  if (!colorSpace) return 'Linear';
  if (colorSpace === THREE.SRGBColorSpace || colorSpace === 'srgb') return 'sRGB';
  if (colorSpace === THREE.LinearSRGBColorSpace || colorSpace === 'srgb-linear') return 'Linear sRGB';
  return colorSpace;
}

export function analyzeLoadedModel(options: AnalyzeModelOptions): ModelAnalysis {
  const {
    root,
    animations,
    fileName,
    fileFormat,
    sourceFileCount,
    sourceSizeBytes,
    generator = null,
    gltfVersion = null,
    generateTexturePreviews = true,
  } = options;

  root.updateMatrixWorld(true);

  let meshCount = 0;
  let vertexCount = 0;
  let triangleCount = 0;
  let polygonPartCount = 0;
  let hasSkeleton = false;
  const boneUuids = new Set<string>();
  const uvChannelSet = new Set<string>();

  const uniqueGeometries = new Set<THREE.BufferGeometry>();
  let estimatedGeometryBytes = 0;

  const materialMap = new Map<
    string,
    {
      material: THREE.Material;
      meshCount: number;
      textureSlots: Set<string>;
    }
  >();

  const textureMap = new Map<
    string,
    {
      texture: THREE.Texture;
      slots: Set<string>;
    }
  >();

  const flatMeshes: SceneNodeInfo[] = [];

  const buildNodeTree = (obj: THREE.Object3D): SceneNodeInfo => {
    const isMesh = Boolean((obj as THREE.Mesh).isMesh);
    const isSkinnedMesh = Boolean((obj as THREE.SkinnedMesh).isSkinnedMesh);
    const isBone = Boolean((obj as THREE.Bone).isBone);
    const isGroup = Boolean((obj as THREE.Group).isGroup) || obj.type === 'Scene' || obj.type === 'Object3D';

    let nodeVerts = 0;
    let nodeTris = 0;

    if (isBone) {
      boneUuids.add(obj.uuid);
    }

    if (isSkinnedMesh) {
      hasSkeleton = true;
      const skinned = obj as THREE.SkinnedMesh;
      if (skinned.skeleton && Array.isArray(skinned.skeleton.bones)) {
        for (const bone of skinned.skeleton.bones) {
          boneUuids.add(bone.uuid);
        }
      }
    }

    if (isMesh) {
      const mesh = obj as THREE.Mesh;
      meshCount += 1;

      const stats = getMeshStats(mesh);
      nodeVerts = stats.vertices;
      nodeTris = stats.triangles;
      vertexCount += stats.vertices;
      triangleCount += stats.triangles;
      polygonPartCount += stats.parts;
      for (const ch of stats.uvChannels) uvChannelSet.add(ch);

      if (mesh.geometry && !uniqueGeometries.has(mesh.geometry)) {
        uniqueGeometries.add(mesh.geometry);
        estimatedGeometryBytes += estimateGeometryMemory(mesh.geometry);
      }

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat) continue;
        let entry = materialMap.get(mat.uuid);
        if (!entry) {
          entry = {
            material: mat,
            meshCount: 0,
            textureSlots: new Set<string>(),
          };
          materialMap.set(mat.uuid, entry);
        }
        entry.meshCount += 1;

        const textures = getMaterialTextures(mat);
        for (const { slot, texture } of textures) {
          entry.textureSlots.add(slot);
          let texEntry = textureMap.get(texture.uuid);
          if (!texEntry) {
            texEntry = {
              texture,
              slots: new Set<string>(),
            };
            textureMap.set(texture.uuid, texEntry);
          }
          texEntry.slots.add(slot);
        }
      }
    }

    const children = obj.children.map((child) => buildNodeTree(child));

    const node: SceneNodeInfo = {
      uuid: obj.uuid,
      name: obj.name?.trim() || `${obj.type}_${obj.id}`,
      type: obj.type,
      isMesh,
      isSkinnedMesh,
      isBone,
      isGroup,
      visible: obj.visible,
      vertexCount: nodeVerts,
      triangleCount: nodeTris,
      children,
    };

    if (isMesh) {
      flatMeshes.push(node);
    }

    return node;
  };

  const rootTree = buildNodeTree(root);
  const hierarchy =
    root.children.length > 0 && (root.type === 'Group' || root.type === 'Scene') && !root.name
      ? rootTree.children
      : [rootTree];

  if (boneUuids.size > 0) {
    hasSkeleton = true;
  }

  const materials: MaterialInfo[] = Array.from(materialMap.values()).map(({ material, meshCount: count, textureSlots }) => {
    const std = material as THREE.MeshStandardMaterial;
    const colorHex = std.color && typeof std.color.getHexString === 'function' ? `#${std.color.getHexString()}` : null;
    const emissiveHex =
      std.emissive && typeof std.emissive.getHexString === 'function' && std.emissive.getHex() !== 0
        ? `#${std.emissive.getHexString()}`
        : null;

    return {
      uuid: material.uuid,
      name: material.name?.trim() || `Material_${material.id}`,
      type: material.type,
      colorHex,
      emissiveHex,
      metalness: typeof std.metalness === 'number' ? std.metalness : null,
      roughness: typeof std.roughness === 'number' ? std.roughness : null,
      opacity: typeof material.opacity === 'number' ? material.opacity : 1,
      transparent: Boolean(material.transparent),
      doubleSide: material.side === THREE.DoubleSide,
      textureSlots: Array.from(textureSlots),
      meshCount: count,
    };
  });

  let estimatedTextureBytes = 0;
  const textures: TextureInfo[] = Array.from(textureMap.values()).map(({ texture, slots }, idx) => {
    const { width, height } = getTextureDimensions(texture);
    // Uncompressed RGBA8 + ~33% mipmap chain estimate
    const estimatedBytes = width > 0 && height > 0 ? Math.round(width * height * 4 * 1.333) : 0;
    estimatedTextureBytes += estimatedBytes;

    return {
      uuid: texture.uuid,
      name: texture.name?.trim() || `Texture_${idx + 1}`,
      slots: Array.from(slots),
      width,
      height,
      colorSpace: formatColorSpaceLabel(texture.colorSpace),
      estimatedBytes,
      previewDataUrl: generateTexturePreviews ? createTexturePreview(texture) : null,
    };
  });

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3();
  if (!box.isEmpty()) {
    box.getSize(size);
  }

  const animationInfos: AnimationClipInfo[] = animations.map((clip, index) => ({
    index,
    name: clip.name?.trim() || `Animation_${index + 1}`,
    duration: Number.isFinite(clip.duration) ? clip.duration : 0,
    trackCount: clip.tracks.length,
  }));

  const estimatedTotalMemoryBytes = estimatedGeometryBytes + estimatedTextureBytes;

  return {
    fileName,
    fileFormat,
    sourceFileCount,
    sourceSizeBytes,
    meshCount,
    vertexCount,
    triangleCount,
    polygonPartCount,
    materialCount: materials.length,
    textureCount: textures.length,
    dimensions: {
      x: Number(size.x.toFixed(4)),
      y: Number(size.y.toFixed(4)),
      z: Number(size.z.toFixed(4)),
    },
    hasSkeleton,
    boneCount: boneUuids.size,
    hasAnimations: animationInfos.length > 0,
    animationCount: animationInfos.length,
    animations: animationInfos,
    hasUV: uvChannelSet.size > 0,
    uvChannels: Array.from(uvChannelSet).sort(),
    estimatedGeometryBytes,
    estimatedTextureBytes,
    estimatedTotalMemoryBytes,
    hierarchy,
    meshes: flatMeshes,
    materials,
    textures,
    generator,
    gltfVersion,
  };
}
