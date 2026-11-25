import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { analyzeLoadedModel } from './modelAnalyzer';

test('analyzeLoadedModel calculates exact vertices, triangles, materials, textures, UVs, dimensions, skeleton and animations', () => {
  const root = new THREE.Group();
  root.name = 'TestAssetRoot';

  // Build raw BufferGeometry with 4 vertices, 2 triangles (indexed), UV0 and UV1
  const geomA = new THREE.BufferGeometry();
  const positionsA = new Float32Array([
    0, 0, 0,
    2, 0, 0,
    2, 3, 0,
    0, 3, 0,
  ]);
  const uvsA = new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]);
  geomA.setAttribute('position', new THREE.BufferAttribute(positionsA, 3));
  geomA.setAttribute('uv', new THREE.BufferAttribute(uvsA, 2));
  geomA.setAttribute('uv1', new THREE.BufferAttribute(uvsA, 2));
  geomA.setIndex([0, 1, 2, 0, 2, 3]);
  geomA.addGroup(0, 3, 0);
  geomA.addGroup(3, 3, 0);

  // Non-indexed BufferGeometry with 3 vertices, 1 triangle, depth along Z = 4
  const geomB = new THREE.BufferGeometry();
  const positionsB = new Float32Array([
    0, 0, 0,
    0, 0, 4,
    0, 1, 4,
  ]);
  geomB.setAttribute('position', new THREE.BufferAttribute(positionsB, 3));

  const tex = new THREE.DataTexture(new Uint8Array(16 * 16 * 4), 16, 16);
  tex.name = 'BaseColorTex';
  tex.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshStandardMaterial({
    name: 'MetalMat',
    color: 0x336699,
    metalness: 0.8,
    roughness: 0.25,
    map: tex,
  });

  const meshA = new THREE.Mesh(geomA, mat);
  meshA.name = 'HullPanel';
  const meshB = new THREE.Mesh(geomB, mat); // shared material
  meshB.name = 'FinMesh';

  const bone = new THREE.Bone();
  bone.name = 'RootBone';

  root.add(meshA, meshB, bone);

  const track = new THREE.NumberKeyframeTrack('HullPanel.position[x]', [0, 1.5], [0, 1]);
  const clip = new THREE.AnimationClip('SlideOpen', 1.5, [track]);

  const analysis = analyzeLoadedModel({
    root,
    animations: [clip],
    fileName: 'mech_part.glb',
    fileFormat: 'GLB',
    sourceFileCount: 1,
    sourceSizeBytes: 12345,
    generator: 'Blender 4.2',
    gltfVersion: '2.0',
    generateTexturePreviews: false,
  });

  assert.equal(analysis.meshCount, 2);
  assert.equal(analysis.vertexCount, 7);
  assert.equal(analysis.triangleCount, 3);
  assert.equal(analysis.polygonPartCount, 3); // 2 groups on geomA + 1 default on geomB
  assert.equal(analysis.materialCount, 1); // deduplicated shared material
  assert.equal(analysis.textureCount, 1);
  assert.equal(analysis.dimensions.x, 2);
  assert.equal(analysis.dimensions.y, 3);
  assert.equal(analysis.dimensions.z, 4);
  assert.equal(analysis.hasUV, true);
  assert.deepEqual(analysis.uvChannels, ['UV0', 'UV1']);
  assert.equal(analysis.hasSkeleton, true);
  assert.equal(analysis.boneCount, 1);
  assert.equal(analysis.hasAnimations, true);
  assert.equal(analysis.animationCount, 1);
  assert.equal(analysis.animations[0].name, 'SlideOpen');
  assert.ok(analysis.estimatedGeometryBytes > 0);
  assert.ok(analysis.estimatedTextureBytes > 0);
  assert.equal(analysis.materials[0].name, 'MetalMat');
  assert.equal(analysis.textures[0].width, 16);
  assert.equal(analysis.textures[0].height, 16);
  assert.equal(analysis.textures[0].colorSpace, 'sRGB');
});
