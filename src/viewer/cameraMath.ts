import * as THREE from 'three';

export interface CameraFramingResult {
  position: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
  orthoHalfHeight: number;
  near: number;
  far: number;
  maxDimension: number;
}

/**
 * Computes optimal camera position, target, clipping planes, and orthographic half-height
 * so a bounding box fits cleanly within the viewport with margin.
 */
export function computeCameraFraming(
  box: THREE.Box3,
  fovDegrees: number,
  aspect: number,
  marginFactor = 1.45,
): CameraFramingResult {
  const safeAspect = Math.max(aspect, 0.25);

  if (box.isEmpty()) {
    return {
      position: new THREE.Vector3(3.5, 2.4, 3.5),
      target: new THREE.Vector3(0, 0.5, 0),
      distance: 5.5,
      orthoHalfHeight: 2.2,
      near: 0.01,
      far: 1000,
      maxDimension: 1,
    };
  }

  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const radius = Math.max(sphere.radius, maxDimension * 0.5, 0.001);

  const vFovRad = THREE.MathUtils.degToRad(fovDegrees);
  const hFovRad = 2 * Math.atan(Math.tan(vFovRad / 2) * safeAspect);
  const limitingHalfFov = Math.min(vFovRad, hFovRad) / 2;

  const distance = (radius / Math.sin(Math.max(limitingHalfFov, 0.1))) * marginFactor;

  // Classic 3/4 studio inspection angle
  const viewDir = new THREE.Vector3(0.75, 0.45, 0.85).normalize();
  const position = center.clone().addScaledVector(viewDir, distance);

  const orthoHalfHeight = (radius * marginFactor) / Math.min(1, safeAspect);
  const near = Math.max(distance / 2500, maxDimension / 10000, 0.001);
  const far = Math.max(distance * 40, maxDimension * 120, 200);

  return {
    position,
    target: center,
    distance,
    orthoHalfHeight,
    near,
    far,
    maxDimension,
  };
}

/**
 * Computes the vertical half-height of an OrthographicCamera that visually matches
 * a PerspectiveCamera at the given distance from the orbit target.
 */
export function computeMatchingOrthoHalfHeight(distance: number, fovDegrees: number): number {
  const safeDistance = Math.max(distance, 0.001);
  return safeDistance * Math.tan(THREE.MathUtils.degToRad(fovDegrees) * 0.5);
}

/**
 * Computes the PerspectiveCamera distance that visually matches an OrthographicCamera
 * with the given half-height and zoom.
 */
export function computeMatchingPerspectiveDistance(
  orthoHalfHeight: number,
  orthoZoom: number,
  fovDegrees: number,
): number {
  const effectiveHalfHeight = Math.max(orthoHalfHeight / Math.max(orthoZoom, 0.001), 0.001);
  return effectiveHalfHeight / Math.tan(THREE.MathUtils.degToRad(fovDegrees) * 0.5);
}

/**
 * Computes a grounding offset vector that centers an object in X/Z and places its
 * bounding-box minimum Y flush at y = 0.
 */
export function computeCenteringOffset(box: THREE.Box3): THREE.Vector3 {
  if (box.isEmpty()) {
    return new THREE.Vector3(0, 0, 0);
  }
  const center = new THREE.Vector3();
  box.getCenter(center);
  return new THREE.Vector3(-center.x, -box.min.y, -center.z);
}
