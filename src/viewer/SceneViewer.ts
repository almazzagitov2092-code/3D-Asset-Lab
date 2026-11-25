import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { CameraMode, LightingPreset, RenderMode } from '../ui/types';
import {
  computeCameraFraming,
  computeCenteringOffset,
  computeMatchingOrthoHalfHeight,
  computeMatchingPerspectiveDistance,
} from './cameraMath';
import { disposeObject3D } from './resourceDisposal';

export interface SceneViewerCallbacks {
  onNodeSelected?: (uuid: string | null) => void;
  onContextLost?: (lost: boolean) => void;
}

const _offsetVec = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _ndc = new THREE.Vector2();

function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function isMobileViewport(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < 1024 || 'ontouchstart' in window;
}

export class SceneViewer {
  private container: HTMLElement;
  private callbacks: SceneViewerCallbacks;

  private isSoftwareGl: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private envRenderTarget: THREE.WebGLRenderTarget | null = null;
  private studioEnvTexture: THREE.Texture | null = null;

  private perspectiveCamera: THREE.PerspectiveCamera;
  private orthoCamera: THREE.OrthographicCamera;
  private activeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  private cameraMode: CameraMode = 'perspective';
  private orthoHalfHeight = 2.5;

  private controls: OrbitControls;
  private raycaster = new THREE.Raycaster();

  // Lighting rig
  private hemiLight: THREE.HemisphereLight;
  private keyLight: THREE.DirectionalLight;
  private fillLight: THREE.DirectionalLight;
  private rimLight: THREE.DirectionalLight;
  private ambientUnlitLight: THREE.AmbientLight;
  private lightingPreset: LightingPreset = 'studio';

  // Studio helpers
  private gridHelper: THREE.GridHelper;
  private axesHelper: THREE.AxesHelper;
  private selectionBoxHelper: THREE.BoxHelper | null = null;

  // Loaded model state
  private displayPivot: THREE.Group;
  private loadedModel: THREE.Object3D | null = null;
  private loadedAnimations: THREE.AnimationClip[] = [];
  private mixer: THREE.AnimationMixer | null = null;
  private activeAction: THREE.AnimationAction | null = null;
  private isAnimationPlaying = false;
  private activeAnimationIndex = 0;

  // Render mode tracking (preserves original wireframe state for accurate export)
  private renderMode: RenderMode = 'solid';
  private originalWireframeStates = new WeakMap<THREE.Material, boolean>();

  // Camera framing memory for reset
  private defaultCameraPos = new THREE.Vector3(3.6, 2.5, 3.6);
  private defaultCameraTarget = new THREE.Vector3(0, 0.5, 0);
  private defaultOrthoHalfHeight = 2.4;

  // On-demand render & animation loop pacing
  private frameId = 0;
  private renderBusy = false;
  private renderDirty = false;
  private lastTickTime = 0;
  private disposed = false;

  // Resize & interaction tracking
  private resizeObserver: ResizeObserver;
  private pointerDownPos = { x: 0, y: 0 };
  private twoFingerLastAngle: number | null = null;

  constructor(container: HTMLElement, callbacks: SceneViewerCallbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = Math.max(container.clientWidth, 1);
    const height = Math.max(container.clientHeight, 1);
    const aspect = width / height;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      alpha: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyOptimalPixelRatio();
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.setAttribute('data-testid', 'viewport-canvas');
    this.renderer.domElement.setAttribute('aria-label', 'Область 3D-просмотра модели');

    container.appendChild(this.renderer.domElement);

    // Scene & studio environment IBL
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x121418);

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    this.envRenderTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    this.studioEnvTexture = this.envRenderTarget.texture;
    this.scene.environment = this.studioEnvTexture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    // Cameras
    this.perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.01, 1000);
    this.perspectiveCamera.position.copy(this.defaultCameraPos);

    this.orthoCamera = new THREE.OrthographicCamera(
      -this.orthoHalfHeight * aspect,
      this.orthoHalfHeight * aspect,
      this.orthoHalfHeight,
      -this.orthoHalfHeight,
      -1000,
      1000,
    );
    this.orthoCamera.position.copy(this.defaultCameraPos);
    this.activeCamera = this.perspectiveCamera;

    // Controls
    this.controls = new OrbitControls(this.activeCamera, this.renderer.domElement);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.07;
    this.controls.screenSpacePanning = true;
    this.controls.rotateSpeed = 0.85;
    this.controls.zoomSpeed = 1.05;
    this.controls.panSpeed = 0.85;
    this.controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };
    this.controls.target.copy(this.defaultCameraTarget);
    this.controls.update();

    this.controls.addEventListener('change', this.handleControlsChange);

    // 3-point studio lighting + unlit helper light
    this.hemiLight = new THREE.HemisphereLight(0xcfe3ff, 0x222630, 0.85);
    this.hemiLight.position.set(0, 20, 0);
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(0xfff5e8, 2.0);
    this.keyLight.position.set(5, 8, 6);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.set(1024, 1024);
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.fillLight = new THREE.DirectionalLight(0xa8c8ff, 0.75);
    this.fillLight.position.set(-6, 4, 3);
    this.scene.add(this.fillLight);

    this.rimLight = new THREE.DirectionalLight(0xdbeafe, 0.95);
    this.rimLight.position.set(-2, 5, -7);
    this.scene.add(this.rimLight);

    this.ambientUnlitLight = new THREE.AmbientLight(0xffffff, 0);
    this.scene.add(this.ambientUnlitLight);

    // Studio floor grid & coordinate axes
    this.gridHelper = new THREE.GridHelper(12, 24, 0x475066, 0x282e3a);
    this.gridHelper.position.y = -0.002;
    this.scene.add(this.gridHelper);

    this.axesHelper = new THREE.AxesHelper(2.2);
    this.axesHelper.position.y = 0.002;
    this.scene.add(this.axesHelper);

    // Container pivot for display centering (keeps loadedModel's own transforms untouched for export)
    this.displayPivot = new THREE.Group();
    this.displayPivot.name = '__ViewportDisplayPivot__';
    this.scene.add(this.displayPivot);

    // Event listeners
    const dom = this.renderer.domElement;
    dom.addEventListener('pointerdown', this.handlePointerDown);
    dom.addEventListener('pointerup', this.handlePointerUp);
    dom.addEventListener('touchstart', this.handleTouchStart, { passive: true });
    dom.addEventListener('touchmove', this.handleTouchMove, { passive: true });
    dom.addEventListener('touchend', this.handleTouchEnd, { passive: true });
    dom.addEventListener('touchcancel', this.handleTouchEnd, { passive: true });
    dom.addEventListener('webglcontextlost', this.handleContextLost);
    dom.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.applyLightingPreset('studio');

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.activeCamera);
    }

    this.requestRender();
  }

  private applyOptimalPixelRatio(): void {
    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
      return;
    }
    // Cap pixel ratio at 1.5 on mobile devices to prevent mobile GPU overload, 2.0 on desktop
    const maxDpr = isMobileViewport() ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxDpr));
  }

  private handleControlsChange = (): void => {
    this.requestRender();
  };

  private handlePointerDown = (ev: PointerEvent): void => {
    this.pointerDownPos = { x: ev.clientX, y: ev.clientY };
  };

  private handlePointerUp = (ev: PointerEvent): void => {
    if (!this.loadedModel) return;
    // Ignore drags — only treat crisp taps/clicks as node selection
    const dx = ev.clientX - this.pointerDownPos.x;
    const dy = ev.clientY - this.pointerDownPos.y;
    if (Math.hypot(dx, dy) > 5) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    _ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(_ndc, this.activeCamera);
    const hits = this.raycaster.intersectObject(this.loadedModel, true);
    const visibleHit = hits.find((h) => h.object.visible);

    if (visibleHit) {
      this.selectNodeByUuid(visibleHit.object.uuid);
      this.callbacks.onNodeSelected?.(visibleHit.object.uuid);
    } else {
      this.selectNodeByUuid(null);
      this.callbacks.onNodeSelected?.(null);
    }
  };

  /**
   * Two-finger twist gesture handler for Android/touch screens so users can rotate
   * with two fingers in addition to OrbitControls' 1-finger rotate, pinch-to-zoom, and 2-finger pan.
   */
  private handleTouchStart = (ev: TouchEvent): void => {
    if (ev.touches.length === 2) {
      const dx = ev.touches[1].clientX - ev.touches[0].clientX;
      const dy = ev.touches[1].clientY - ev.touches[0].clientY;
      this.twoFingerLastAngle = Math.atan2(dy, dx);
    } else {
      this.twoFingerLastAngle = null;
    }
  };

  private handleTouchMove = (ev: TouchEvent): void => {
    if (ev.touches.length !== 2 || this.twoFingerLastAngle === null) {
      this.twoFingerLastAngle = null;
      return;
    }

    const dx = ev.touches[1].clientX - ev.touches[0].clientX;
    const dy = ev.touches[1].clientY - ev.touches[0].clientY;
    const angle = Math.atan2(dy, dx);
    let delta = angle - this.twoFingerLastAngle;

    // Wrap across -PI..PI boundary
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;

    if (Math.abs(delta) > 0.008 && Math.abs(delta) < 0.6) {
      _offsetVec.subVectors(this.activeCamera.position, this.controls.target);
      _offsetVec.applyAxisAngle(_yAxis, -delta);
      this.activeCamera.position.copy(this.controls.target).add(_offsetVec);
      this.activeCamera.lookAt(this.controls.target);
      this.controls.update();
      this.requestRender();
    }

    this.twoFingerLastAngle = angle;
  };

  private handleTouchEnd = (): void => {
    this.twoFingerLastAngle = null;
  };

  private handleContextLost = (ev: Event): void => {
    ev.preventDefault();
    this.cancelScheduledFrame();
    this.callbacks.onContextLost?.(true);
  };

  private handleContextRestored = (): void => {
    this.callbacks.onContextLost?.(false);
    this.requestRender();
  };

  public handleResize(): void {
    if (this.disposed) return;
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const aspect = width / height;

    this.applyOptimalPixelRatio();
    this.renderer.setSize(width, height, false);

    this.perspectiveCamera.aspect = aspect;
    this.perspectiveCamera.updateProjectionMatrix();

    this.orthoCamera.left = -this.orthoHalfHeight * aspect;
    this.orthoCamera.right = this.orthoHalfHeight * aspect;
    this.orthoCamera.top = this.orthoHalfHeight;
    this.orthoCamera.bottom = -this.orthoHalfHeight;
    this.orthoCamera.updateProjectionMatrix();

    this.requestRender();
  }

  public setModel(model: THREE.Object3D, animations: THREE.AnimationClip[]): void {
    this.clearModel();

    this.loadedModel = model;
    this.loadedAnimations = animations;

    // Configure shadows and anisotropy on loaded textures without altering material identity
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    model.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        mesh.castShadow = !this.isSoftwareGl;
        mesh.receiveShadow = !this.isSoftwareGl;

        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (!mat) continue;
          const anyMat = mat as THREE.MeshStandardMaterial;
          if (!this.originalWireframeStates.has(mat)) {
            this.originalWireframeStates.set(mat, Boolean(anyMat.wireframe));
          }
          if (anyMat.map) {
            anyMat.map.anisotropy = Math.min(maxAniso, 8);
          }
        }
      }
    });

    this.displayPivot.position.set(0, 0, 0);
    this.displayPivot.add(model);

    // Center visually on floor plane via displayPivot while keeping model.position original for export
    this.centerModel();
    this.fitCameraToModel();

    // Re-apply current wireframe mode if user already had wireframe active
    if (this.renderMode === 'wireframe') {
      this.applyWireframeToModel(true);
    }

    // Set up AnimationMixer if real animations exist
    if (animations.length > 0) {
      this.mixer = new THREE.AnimationMixer(model);
      this.activeAnimationIndex = 0;
      this.activeAction = this.mixer.clipAction(animations[0]);
      this.isAnimationPlaying = false;
    }

    this.requestRender();
  }

  public clearModel(): void {
    this.stopAnimation();
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }
    this.activeAction = null;
    this.loadedAnimations = [];
    this.clearSelectionHighlight();

    if (this.loadedModel) {
      this.displayPivot.remove(this.loadedModel);
      disposeObject3D(this.loadedModel);
      this.loadedModel = null;
    }

    this.displayPivot.position.set(0, 0, 0);
    this.rebuildHelpersForScale(12, 2.2);
    this.requestRender();
  }

  public getLoadedModelForExport(): {
    root: THREE.Object3D | null;
    animations: THREE.AnimationClip[];
    restoreAfterExport: () => void;
  } {
    if (!this.loadedModel) {
      return { root: null, animations: [], restoreAfterExport: () => {} };
    }

    // Temporarily restore original wireframe states so exported materials are never forced wireframe
    const wasWireframe = this.renderMode === 'wireframe';
    if (wasWireframe) {
      this.applyWireframeToModel(false);
    }

    return {
      root: this.loadedModel,
      animations: this.loadedAnimations,
      restoreAfterExport: () => {
        if (wasWireframe) {
          this.applyWireframeToModel(true);
          this.requestRender();
        }
      },
    };
  }

  public centerModel(): void {
    if (!this.loadedModel) return;
    this.displayPivot.position.set(0, 0, 0);
    this.displayPivot.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(this.loadedModel);
    const offset = computeCenteringOffset(box);
    this.displayPivot.position.copy(offset);
    this.displayPivot.updateMatrixWorld(true);

    if (this.selectionBoxHelper) {
      this.selectionBoxHelper.update();
    }
    this.requestRender();
  }

  public fitCameraToModel(): void {
    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const aspect = width / height;

    const box = this.loadedModel
      ? new THREE.Box3().setFromObject(this.displayPivot)
      : new THREE.Box3();

    const framing = computeCameraFraming(box, this.perspectiveCamera.fov, aspect, 1.48);

    this.defaultCameraPos.copy(framing.position);
    this.defaultCameraTarget.copy(framing.target);
    this.defaultOrthoHalfHeight = framing.orthoHalfHeight;
    this.orthoHalfHeight = framing.orthoHalfHeight;

    // Update Perspective camera
    this.perspectiveCamera.near = framing.near;
    this.perspectiveCamera.far = framing.far;
    this.perspectiveCamera.position.copy(framing.position);
    this.perspectiveCamera.updateProjectionMatrix();

    // Update Orthographic camera
    this.orthoCamera.left = -this.orthoHalfHeight * aspect;
    this.orthoCamera.right = this.orthoHalfHeight * aspect;
    this.orthoCamera.top = this.orthoHalfHeight;
    this.orthoCamera.bottom = -this.orthoHalfHeight;
    this.orthoCamera.near = -framing.far;
    this.orthoCamera.far = framing.far;
    this.orthoCamera.zoom = 1;
    this.orthoCamera.position.copy(framing.position);
    this.orthoCamera.updateProjectionMatrix();

    // Update OrbitControls distances
    this.controls.target.copy(framing.target);
    this.controls.minDistance = Math.max(framing.maxDimension * 0.05, 0.01);
    this.controls.maxDistance = Math.max(framing.distance * 12, 50);
    this.controls.update();

    // Scale grid, axes, and key light shadow frustum proportionally to model
    const gridSpan = Math.max(Math.ceil(framing.maxDimension * 4), 4);
    const axesLen = Math.max(framing.maxDimension * 0.85, 0.5);
    this.rebuildHelpersForScale(gridSpan, axesLen);

    const shadowHalf = Math.max(framing.maxDimension * 1.4, 2);
    this.keyLight.position
      .copy(framing.target)
      .add(new THREE.Vector3(shadowHalf * 1.4, shadowHalf * 2.1, shadowHalf * 1.6));
    this.keyLight.target.position.copy(framing.target);
    this.keyLight.target.updateMatrixWorld();
    this.keyLight.shadow.camera.left = -shadowHalf;
    this.keyLight.shadow.camera.right = shadowHalf;
    this.keyLight.shadow.camera.top = shadowHalf;
    this.keyLight.shadow.camera.bottom = -shadowHalf;
    this.keyLight.shadow.camera.near = Math.max(shadowHalf * 0.05, 0.05);
    this.keyLight.shadow.camera.far = shadowHalf * 10;
    this.keyLight.shadow.camera.updateProjectionMatrix();

    this.requestRender();
  }

  public resetCamera(): void {
    if (this.loadedModel) {
      this.fitCameraToModel();
      return;
    }

    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const aspect = width / height;

    this.orthoHalfHeight = this.defaultOrthoHalfHeight;
    this.perspectiveCamera.position.copy(this.defaultCameraPos);
    this.orthoCamera.position.copy(this.defaultCameraPos);
    this.orthoCamera.zoom = 1;
    this.orthoCamera.left = -this.orthoHalfHeight * aspect;
    this.orthoCamera.right = this.orthoHalfHeight * aspect;
    this.orthoCamera.top = this.orthoHalfHeight;
    this.orthoCamera.bottom = -this.orthoHalfHeight;
    this.orthoCamera.updateProjectionMatrix();

    this.controls.target.copy(this.defaultCameraTarget);
    this.controls.update();
    this.requestRender();
  }

  public setCameraMode(mode: CameraMode): void {
    if (this.cameraMode === mode) return;

    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const aspect = width / height;
    const target = this.controls.target.clone();

    if (mode === 'orthographic') {
      const dist = this.perspectiveCamera.position.distanceTo(target);
      this.orthoHalfHeight = computeMatchingOrthoHalfHeight(dist, this.perspectiveCamera.fov);
      this.orthoCamera.position.copy(this.perspectiveCamera.position);
      this.orthoCamera.quaternion.copy(this.perspectiveCamera.quaternion);
      this.orthoCamera.zoom = 1;
      this.orthoCamera.left = -this.orthoHalfHeight * aspect;
      this.orthoCamera.right = this.orthoHalfHeight * aspect;
      this.orthoCamera.top = this.orthoHalfHeight;
      this.orthoCamera.bottom = -this.orthoHalfHeight;
      this.orthoCamera.updateProjectionMatrix();
      this.activeCamera = this.orthoCamera;
    } else {
      const targetDist = computeMatchingPerspectiveDistance(
        this.orthoHalfHeight,
        this.orthoCamera.zoom,
        this.perspectiveCamera.fov,
      );
      const dir = this.orthoCamera.position.clone().sub(target);
      if (dir.lengthSq() < 1e-6) dir.set(1, 0.6, 1);
      dir.normalize();
      this.perspectiveCamera.position.copy(target).addScaledVector(dir, targetDist);
      this.perspectiveCamera.aspect = aspect;
      this.perspectiveCamera.updateProjectionMatrix();
      this.activeCamera = this.perspectiveCamera;
    }

    this.cameraMode = mode;
    this.controls.object = this.activeCamera;
    this.controls.target.copy(target);
    this.controls.update();
    this.requestRender();
  }

  public setRenderMode(mode: RenderMode): void {
    this.renderMode = mode;
    this.applyWireframeToModel(mode === 'wireframe');
    this.requestRender();
  }

  private applyWireframeToModel(wireframe: boolean): void {
    if (!this.loadedModel) return;
    this.loadedModel.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const mesh = obj as THREE.Mesh;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mat of mats) {
          if (!mat) continue;
          const anyMat = mat as THREE.MeshStandardMaterial;
          if ('wireframe' in anyMat) {
            anyMat.wireframe = wireframe ? true : Boolean(this.originalWireframeStates.get(mat));
          }
        }
      }
    });
  }

  public setLightingPreset(preset: LightingPreset): void {
    this.lightingPreset = preset;
    this.applyLightingPreset(preset);
    this.requestRender();
  }

  private applyLightingPreset(preset: LightingPreset): void {
    switch (preset) {
      case 'studio':
        this.scene.background = new THREE.Color(0x121418);
        this.scene.environment = this.studioEnvTexture;
        this.renderer.toneMappingExposure = 1.08;
        this.hemiLight.color.setHex(0xcfe3ff);
        this.hemiLight.groundColor.setHex(0x222630);
        this.hemiLight.intensity = 0.85;
        this.keyLight.color.setHex(0xfff5e8);
        this.keyLight.intensity = 2.0;
        this.fillLight.color.setHex(0xa8c8ff);
        this.fillLight.intensity = 0.75;
        this.rimLight.color.setHex(0xdbeafe);
        this.rimLight.intensity = 0.95;
        this.ambientUnlitLight.intensity = 0;
        break;
      case 'daylight':
        this.scene.background = new THREE.Color(0x1b212b);
        this.scene.environment = this.studioEnvTexture;
        this.renderer.toneMappingExposure = 1.22;
        this.hemiLight.color.setHex(0xe0f2fe);
        this.hemiLight.groundColor.setHex(0x475569);
        this.hemiLight.intensity = 1.35;
        this.keyLight.color.setHex(0xfffbeb);
        this.keyLight.intensity = 2.6;
        this.fillLight.color.setHex(0xbae6fd);
        this.fillLight.intensity = 0.95;
        this.rimLight.color.setHex(0xfef3c7);
        this.rimLight.intensity = 0.6;
        this.ambientUnlitLight.intensity = 0;
        break;
      case 'contrast':
        this.scene.background = new THREE.Color(0x0c0e12);
        this.scene.environment = this.studioEnvTexture;
        this.renderer.toneMappingExposure = 1.0;
        this.hemiLight.color.setHex(0x64748b);
        this.hemiLight.groundColor.setHex(0x0f172a);
        this.hemiLight.intensity = 0.3;
        this.keyLight.color.setHex(0xfff1dc);
        this.keyLight.intensity = 2.8;
        this.fillLight.color.setHex(0x38bdf8);
        this.fillLight.intensity = 0.35;
        this.rimLight.color.setHex(0xe0f2fe);
        this.rimLight.intensity = 1.85;
        this.ambientUnlitLight.intensity = 0;
        break;
      case 'unlit':
        this.scene.background = new THREE.Color(0x161920);
        this.scene.environment = null;
        this.renderer.toneMappingExposure = 1.0;
        this.hemiLight.intensity = 0;
        this.keyLight.intensity = 0;
        this.fillLight.intensity = 0;
        this.rimLight.intensity = 0;
        this.ambientUnlitLight.intensity = 2.4;
        break;
    }
  }

  public setShowGrid(visible: boolean): void {
    this.gridHelper.visible = visible;
    this.requestRender();
  }

  public setShowAxes(visible: boolean): void {
    this.axesHelper.visible = visible;
    this.requestRender();
  }

  public setNodeVisibility(uuid: string, visible: boolean): void {
    if (!this.loadedModel) return;
    const node = this.loadedModel.getObjectByProperty('uuid', uuid);
    if (node) {
      node.visible = visible;
      if (this.selectionBoxHelper) {
        this.selectionBoxHelper.update();
      }
      this.requestRender();
    }
  }

  public selectNodeByUuid(uuid: string | null): void {
    this.clearSelectionHighlight();
    if (!uuid || !this.loadedModel) {
      this.requestRender();
      return;
    }

    const node = this.loadedModel.getObjectByProperty('uuid', uuid);
    if (!node) {
      this.requestRender();
      return;
    }

    const box = new THREE.Box3().setFromObject(node);
    if (!box.isEmpty()) {
      this.selectionBoxHelper = new THREE.BoxHelper(node, 0x38bdf8);
      this.scene.add(this.selectionBoxHelper);
    }
    this.requestRender();
  }

  public focusNodeByUuid(uuid: string): void {
    if (!this.loadedModel) return;
    const node = this.loadedModel.getObjectByProperty('uuid', uuid);
    if (!node) return;

    this.selectNodeByUuid(uuid);
    const box = new THREE.Box3().setFromObject(node);
    if (box.isEmpty()) return;

    const width = Math.max(this.container.clientWidth, 1);
    const height = Math.max(this.container.clientHeight, 1);
    const aspect = width / height;
    const framing = computeCameraFraming(box, this.perspectiveCamera.fov, aspect, 1.7);

    this.activeCamera.position.copy(framing.position);
    if (this.cameraMode === 'orthographic') {
      this.orthoHalfHeight = framing.orthoHalfHeight;
      this.orthoCamera.zoom = 1;
      this.orthoCamera.left = -this.orthoHalfHeight * aspect;
      this.orthoCamera.right = this.orthoHalfHeight * aspect;
      this.orthoCamera.top = this.orthoHalfHeight;
      this.orthoCamera.bottom = -this.orthoHalfHeight;
      this.orthoCamera.updateProjectionMatrix();
    }
    this.controls.target.copy(framing.target);
    this.controls.update();
    this.requestRender();
  }

  public playAnimation(index?: number): void {
    if (!this.mixer || this.loadedAnimations.length === 0) return;

    if (typeof index === 'number' && index >= 0 && index < this.loadedAnimations.length) {
      if (this.activeAction) {
        this.activeAction.stop();
      }
      this.activeAnimationIndex = index;
      this.activeAction = this.mixer.clipAction(this.loadedAnimations[index]);
    } else if (!this.activeAction) {
      this.activeAction = this.mixer.clipAction(this.loadedAnimations[this.activeAnimationIndex]);
    }

    if (this.activeAction) {
      this.activeAction.paused = false;
      this.activeAction.play();
    }

    if (!this.isAnimationPlaying) {
      this.isAnimationPlaying = true;
      this.lastTickTime = performance.now();
      this.cancelScheduledFrame();
      this.animationTick();
    }
  }

  public pauseAnimation(): void {
    this.isAnimationPlaying = false;
    if (this.activeAction) {
      this.activeAction.paused = true;
    }
    this.cancelScheduledFrame();
    this.requestRender();
  }

  public stopAnimation(): void {
    this.isAnimationPlaying = false;
    if (this.activeAction) {
      this.activeAction.stop();
    }
    this.cancelScheduledFrame();
  }

  private clearSelectionHighlight(): void {
    if (this.selectionBoxHelper) {
      this.scene.remove(this.selectionBoxHelper);
      this.selectionBoxHelper.geometry.dispose();
      (this.selectionBoxHelper.material as THREE.Material).dispose();
      this.selectionBoxHelper = null;
    }
  }

  private rebuildHelpersForScale(gridSize: number, axesSize: number): void {
    const gridVisible = this.gridHelper.visible;
    const axesVisible = this.axesHelper.visible;

    this.scene.remove(this.gridHelper);
    this.gridHelper.geometry.dispose();
    if (Array.isArray(this.gridHelper.material)) {
      this.gridHelper.material.forEach((m) => m.dispose());
    } else {
      this.gridHelper.material.dispose();
    }

    this.gridHelper = new THREE.GridHelper(gridSize, 24, 0x475066, 0x282e3a);
    this.gridHelper.position.y = -0.002;
    this.gridHelper.visible = gridVisible;
    this.scene.add(this.gridHelper);

    this.scene.remove(this.axesHelper);
    this.axesHelper.geometry.dispose();
    if (Array.isArray(this.axesHelper.material)) {
      this.axesHelper.material.forEach((m) => m.dispose());
    } else {
      this.axesHelper.material.dispose();
    }

    this.axesHelper = new THREE.AxesHelper(axesSize);
    this.axesHelper.position.y = 0.002;
    this.axesHelper.visible = axesVisible;
    this.scene.add(this.axesHelper);
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private animationTick = (): void => {
    if (this.disposed || !this.isAnimationPlaying) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastTickTime) / 1000, 0.1);
    this.lastTickTime = now;

    if (this.mixer) {
      this.mixer.update(dt);
    }
    if (this.selectionBoxHelper) {
      this.selectionBoxHelper.update();
    }
    this.controls.update();
    this.renderer.render(this.scene, this.activeCamera);

    if (this.isSoftwareGl) {
      this.afterDraw(this.animationTick);
    } else {
      this.frameId = requestAnimationFrame(this.animationTick);
    }
  };

  public requestRender(): void {
    if (this.disposed || this.isAnimationPlaying) return;
    if (this.renderBusy) {
      this.renderDirty = true;
      return;
    }
    this.renderBusy = true;
    this.frameId = requestAnimationFrame(() => {
      if (this.disposed) return;
      this.renderDirty = false;
      this.controls.update();
      this.renderer.render(this.scene, this.activeCamera);

      const done = () => {
        this.renderBusy = false;
        if (this.renderDirty && !this.disposed && !this.isAnimationPlaying) {
          this.requestRender();
        }
      };

      if (this.isSoftwareGl) {
        this.afterDraw(done);
      } else {
        done();
      }
    });
  }

  private cancelScheduledFrame(): void {
    cancelAnimationFrame(this.frameId);
    window.clearTimeout(this.frameId);
    this.frameId = 0;
    this.renderBusy = false;
  }

  public dispose(): void {
    this.disposed = true;
    this.cancelScheduledFrame();
    this.clearModel();

    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.handleControlsChange);
    this.controls.dispose();

    const dom = this.renderer.domElement;
    dom.removeEventListener('pointerdown', this.handlePointerDown);
    dom.removeEventListener('pointerup', this.handlePointerUp);
    dom.removeEventListener('touchstart', this.handleTouchStart);
    dom.removeEventListener('touchmove', this.handleTouchMove);
    dom.removeEventListener('touchend', this.handleTouchEnd);
    dom.removeEventListener('touchcancel', this.handleTouchEnd);
    dom.removeEventListener('webglcontextlost', this.handleContextLost);
    dom.removeEventListener('webglcontextrestored', this.handleContextRestored);

    this.gridHelper.geometry.dispose();
    if (Array.isArray(this.gridHelper.material)) {
      this.gridHelper.material.forEach((m) => m.dispose());
    } else {
      this.gridHelper.material.dispose();
    }

    this.axesHelper.geometry.dispose();
    if (Array.isArray(this.axesHelper.material)) {
      this.axesHelper.material.forEach((m) => m.dispose());
    } else {
      this.axesHelper.material.dispose();
    }

    if (this.envRenderTarget) {
      this.envRenderTarget.dispose();
      this.envRenderTarget = null;
    }

    this.renderer.dispose();
    if (dom.parentNode === this.container) {
      this.container.removeChild(dom);
    }
  }
}
