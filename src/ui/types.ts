export type CameraMode = 'perspective' | 'orthographic';

export type LightingPreset = 'studio' | 'daylight' | 'contrast' | 'unlit';

export type RenderMode = 'solid' | 'wireframe';

export type ExportFormat = 'glb' | 'gltf' | 'obj';

export type InspectorTab = 'geometry' | 'materials' | 'textures' | 'export';

export interface ViewerSettings {
  cameraMode: CameraMode;
  renderMode: RenderMode;
  lightingPreset: LightingPreset;
  showGrid: boolean;
  showAxes: boolean;
  isFullscreen: boolean;
}

export interface Dimensions3D {
  x: number;
  y: number;
  z: number;
}

export interface SceneNodeInfo {
  uuid: string;
  name: string;
  type: string;
  isMesh: boolean;
  isSkinnedMesh: boolean;
  isBone: boolean;
  isGroup: boolean;
  visible: boolean;
  vertexCount: number;
  triangleCount: number;
  children: SceneNodeInfo[];
}

export interface MaterialInfo {
  uuid: string;
  name: string;
  type: string;
  colorHex: string | null;
  emissiveHex: string | null;
  metalness: number | null;
  roughness: number | null;
  opacity: number;
  transparent: boolean;
  doubleSide: boolean;
  textureSlots: string[];
  meshCount: number;
}

export interface TextureInfo {
  uuid: string;
  name: string;
  slots: string[];
  width: number;
  height: number;
  colorSpace: string;
  estimatedBytes: number;
  previewDataUrl: string | null;
}

export interface AnimationClipInfo {
  index: number;
  name: string;
  duration: number;
  trackCount: number;
}

export interface ModelAnalysis {
  fileName: string;
  fileFormat: 'GLB' | 'glTF';
  sourceFileCount: number;
  sourceSizeBytes: number;
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
  polygonPartCount: number;
  materialCount: number;
  textureCount: number;
  dimensions: Dimensions3D;
  hasSkeleton: boolean;
  boneCount: number;
  hasAnimations: boolean;
  animationCount: number;
  animations: AnimationClipInfo[];
  hasUV: boolean;
  uvChannels: string[];
  estimatedGeometryBytes: number;
  estimatedTextureBytes: number;
  estimatedTotalMemoryBytes: number;
  hierarchy: SceneNodeInfo[];
  meshes: SceneNodeInfo[];
  materials: MaterialInfo[];
  textures: TextureInfo[];
  generator: string | null;
  gltfVersion: string | null;
}

export interface LoadProgressState {
  active: boolean;
  percent: number;
  label: string;
}

export interface ExportResultInfo {
  format: ExportFormat;
  fileName: string;
  sizeBytes: number;
  verifiedHeader: boolean;
  timestamp: number;
  blob: Blob;
}
