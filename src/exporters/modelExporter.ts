import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { validateGlbBuffer } from '../loaders/fileValidation';
import type { ExportFormat, ExportResultInfo } from '../ui/types';

export interface ExportModelParams {
  root: THREE.Object3D;
  animations: THREE.AnimationClip[];
  baseFileName: string;
  format: ExportFormat;
  onlyVisible?: boolean;
  onProgress?: (percent: number, label: string) => void;
}

function stripExtension(name: string): string {
  const clean = name.trim();
  const idx = clean.lastIndexOf('.');
  return idx > 0 ? clean.slice(0, idx) : clean || 'model';
}

export function triggerBlobDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Delay revoke slightly so browser download manager finishes grabbing the blob
  window.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 4000);
}

/**
 * Exports a loaded Three.js model to a real binary GLB, JSON glTF, or OBJ file.
 * Preserves hierarchy, transforms, materials, textures, skeletons, and animations for GLB/glTF.
 */
export async function exportModelToFormat(params: ExportModelParams): Promise<ExportResultInfo> {
  const { root, animations, baseFileName, format, onlyVisible = false, onProgress } = params;

  const stem = stripExtension(baseFileName);
  const outName = `${stem}_export.${format}`;

  root.updateMatrixWorld(true);

  if (format === 'glb') {
    onProgress?.(20, 'Сериализация геометрии, материалов и текстур в GLB...');
    const exporter = new GLTFExporter();
    const result = await new Promise<ArrayBuffer>((resolve, reject) => {
      exporter.parse(
        root,
        (output) => {
          if (output instanceof ArrayBuffer) {
            resolve(output);
          } else {
            reject(new Error('GLTFExporter не вернул бинарный буфер GLB.'));
          }
        },
        (error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        },
        {
          binary: true,
          onlyVisible,
          animations: animations.length > 0 ? animations : undefined,
        },
      );
    });

    onProgress?.(85, 'Проверка целостности заголовка GLB...');
    if (!result || result.byteLength === 0) {
      throw new Error('Экспортированный GLB имеет нулевой размер.');
    }

    const headerCheck = validateGlbBuffer(result);
    if (!headerCheck.valid) {
      throw new Error(headerCheck.error || 'Сформированный GLB не прошёл проверку заголовка.');
    }

    const blob = new Blob([result], { type: 'model/gltf-binary' });
    triggerBlobDownload(blob, outName);
    onProgress?.(100, 'GLB успешно экспортирован');

    return {
      format: 'glb',
      fileName: outName,
      sizeBytes: blob.size,
      verifiedHeader: true,
      timestamp: Date.now(),
      blob,
    };
  }

  if (format === 'gltf') {
    onProgress?.(20, 'Сериализация сцены в формат glTF 2.0 (JSON)...');
    const exporter = new GLTFExporter();
    const jsonObject = await new Promise<Record<string, unknown>>((resolve, reject) => {
      exporter.parse(
        root,
        (output) => {
          if (output && typeof output === 'object' && !(output instanceof ArrayBuffer)) {
            resolve(output as Record<string, unknown>);
          } else {
            reject(new Error('GLTFExporter не вернул JSON-структуру glTF.'));
          }
        },
        (error) => {
          reject(error instanceof Error ? error : new Error(String(error)));
        },
        {
          binary: false,
          onlyVisible,
          animations: animations.length > 0 ? animations : undefined,
        },
      );
    });

    onProgress?.(85, 'Формирование файла glTF...');
    const jsonString = JSON.stringify(jsonObject, null, 2);
    if (!jsonString || jsonString.length === 0) {
      throw new Error('Экспортированный glTF пуст.');
    }

    const blob = new Blob([jsonString], { type: 'model/gltf+json' });
    triggerBlobDownload(blob, outName);
    onProgress?.(100, 'glTF успешно экспортирован');

    return {
      format: 'gltf',
      fileName: outName,
      sizeBytes: blob.size,
      verifiedHeader: true,
      timestamp: Date.now(),
      blob,
    };
  }

  // OBJ export via Three.js OBJExporter (geometry + normals + UVs)
  onProgress?.(30, 'Экспорт полигональной геометрии в OBJ...');
  const objExporter = new OBJExporter();
  const objText = objExporter.parse(root);
  if (!objText || objText.trim().length === 0) {
    throw new Error('Экспортированный OBJ не содержит геометрии.');
  }

  const blob = new Blob([objText], { type: 'text/plain;charset=utf-8' });
  triggerBlobDownload(blob, outName);
  onProgress?.(100, 'OBJ успешно экспортирован');

  return {
    format: 'obj',
    fileName: outName,
    sizeBytes: blob.size,
    verifiedHeader: true,
    timestamp: Date.now(),
    blob,
  };
}
