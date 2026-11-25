import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  computeCameraFraming,
  computeCenteringOffset,
  computeMatchingOrthoHalfHeight,
  computeMatchingPerspectiveDistance,
} from './cameraMath';

test('computeCameraFraming frames bounding box with positive distance and valid clip planes', () => {
  const box = new THREE.Box3(new THREE.Vector3(-1, 0, -2), new THREE.Vector3(3, 4, 2));
  const framing = computeCameraFraming(box, 45, 16 / 9);

  assert.equal(framing.target.x, 1);
  assert.equal(framing.target.y, 2);
  assert.equal(framing.target.z, 0);
  assert.ok(framing.distance > 4);
  assert.ok(framing.near > 0 && framing.near < framing.far);
  assert.ok(framing.orthoHalfHeight > 2);
  assert.equal(framing.maxDimension, 4);
});

test('computeCameraFraming handles empty box gracefully', () => {
  const framing = computeCameraFraming(new THREE.Box3(), 45, 1.5);
  assert.ok(framing.distance > 0);
  assert.ok(framing.orthoHalfHeight > 0);
});

test('perspective and orthographic matching functions are inverses', () => {
  const dist = 12.5;
  const fov = 45;
  const halfHeight = computeMatchingOrthoHalfHeight(dist, fov);
  const roundTripDist = computeMatchingPerspectiveDistance(halfHeight, 1, fov);
  assert.ok(Math.abs(roundTripDist - dist) < 1e-6);

  const zoomedDist = computeMatchingPerspectiveDistance(halfHeight, 2, fov);
  assert.ok(Math.abs(zoomedDist - dist / 2) < 1e-6);
});

test('computeCenteringOffset centers X/Z and grounds minimum Y to zero', () => {
  const box = new THREE.Box3(new THREE.Vector3(2, -3, 4), new THREE.Vector3(6, 5, 10));
  const offset = computeCenteringOffset(box);
  assert.equal(offset.x, -4);
  assert.equal(offset.y, 3);
  assert.equal(offset.z, -7);
});
