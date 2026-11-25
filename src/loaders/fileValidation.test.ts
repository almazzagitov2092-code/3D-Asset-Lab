import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findMissingGltfResources,
  formatByteSize,
  getBaseName,
  getFileExtension,
  GLB_MAGIC,
  normalizeResourcePath,
  selectModelBundle,
  validateGlbBuffer,
  validateGltfJson,
} from './fileValidation';

function makeValidGlbHeader(totalLength = 20): ArrayBuffer {
  const buf = new ArrayBuffer(totalLength);
  const view = new DataView(buf);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  return buf;
}

test('validateGlbBuffer accepts valid glTF 2.0 binary header', () => {
  const res = validateGlbBuffer(makeValidGlbHeader(64));
  assert.equal(res.valid, true);
  assert.equal(res.version, 2);
  assert.equal(res.declaredLength, 64);
});

test('validateGlbBuffer rejects truncated and corrupted files', () => {
  assert.equal(validateGlbBuffer(new ArrayBuffer(8)).valid, false);

  const badMagic = makeValidGlbHeader(32);
  new DataView(badMagic).setUint32(0, 0x12345678, true);
  assert.equal(validateGlbBuffer(badMagic).valid, false);

  const truncated = makeValidGlbHeader(32);
  new DataView(truncated).setUint32(8, 128, true);
  assert.equal(validateGlbBuffer(truncated).valid, false);
});

test('validateGltfJson extracts external URIs and ignores data URIs', () => {
  const json = JSON.stringify({
    asset: { version: '2.0' },
    buffers: [{ uri: './mesh.bin', byteLength: 16 }, { uri: 'data:application/octet-stream;base64,AA==' }],
    images: [{ uri: 'textures/albedo.png' }],
  });
  const res = validateGltfJson(json);
  assert.equal(res.valid, true);
  assert.deepEqual(res.externalUris, ['mesh.bin', 'textures/albedo.png']);
});

test('validateGltfJson rejects malformed JSON or missing asset.version', () => {
  assert.equal(validateGltfJson('{bad json').valid, false);
  assert.equal(validateGltfJson(JSON.stringify({ scenes: [] })).valid, false);
  assert.equal(validateGltfJson(JSON.stringify({ asset: { version: '1.0' } })).valid, false);
});

test('selectModelBundle and findMissingGltfResources resolve multi-file glTF bundles', () => {
  const gltfFile = new File(['{}'], 'character.gltf', { type: 'model/gltf+json' });
  const binFile = new File([new Uint8Array(8)], 'mesh.bin');
  const texFile = new File([new Uint8Array(8)], 'albedo.png');

  const selected = selectModelBundle([binFile, gltfFile, texFile]);
  assert.ok(selected.bundle);
  assert.equal(selected.bundle.format, 'glTF');
  assert.equal(selected.bundle.primaryFile.name, 'character.gltf');

  const missingNone = findMissingGltfResources(
    ['mesh.bin', 'textures/albedo.png'],
    selected.bundle.resourceFiles,
  );
  assert.deepEqual(missingNone, []);

  const missingNormal = findMissingGltfResources(
    ['mesh.bin', 'textures/normal.png'],
    selected.bundle.resourceFiles,
  );
  assert.deepEqual(missingNormal, ['textures/normal.png']);
});

test('selectModelBundle rejects unsupported file extensions', () => {
  const fbx = new File([new Uint8Array(10)], 'model.fbx');
  const res = selectModelBundle([fbx]);
  assert.equal(res.bundle, undefined);
  assert.match(res.error || '', /\.fbx/);
});

test('path and byte formatting utilities work accurately', () => {
  assert.equal(getFileExtension('Asset.GLB'), 'glb');
  assert.equal(normalizeResourcePath('./textures\\Hero%20Diffuse.png?v=1'), 'textures/Hero Diffuse.png');
  assert.equal(getBaseName('textures/metal/albedo.png'), 'albedo.png');
  assert.equal(formatByteSize(512), '512 Б');
  assert.equal(formatByteSize(2048), '2.0 КБ');
  assert.equal(formatByteSize(1024 * 1024 * 2.5), '2.50 МБ');
});
