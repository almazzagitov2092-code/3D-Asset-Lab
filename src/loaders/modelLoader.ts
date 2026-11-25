import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import {
  findMissingGltfResources,
  getBaseName,
  normalizeResourcePath,
  selectModelBundle,
  validateGlbBuffer,
  validateGltfJson,
} from './fileValidation';

export interface LoadedModelResult {
  gltf: GLTF;
  fileName: string;
  fileFormat: 'GLB' | 'glTF';
  sourceFileCount: number;
  sourceSizeBytes: number;
  generator: string | null;
  gltfVersion: string | null;
  revokeResources: () => void;
}

export interface LoadProgressCallback {
  (percent: number, label: string): void;
}

function readFileAsArrayBuffer(
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(ev.loaded, ev.total);
      }
    };
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error('Не удалось прочитать файл как бинарный буфер.'));
      }
    };
    reader.onerror = () => {
      reject(new Error(`Ошибка чтения файла "${file.name}".`));
    };
    reader.readAsArrayBuffer(file);
  });
}

function readFileAsText(
  file: File,
  onProgress?: (loaded: number, total: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(ev.loaded, ev.total);
      }
    };
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Не удалось прочитать glTF-файл как текст.'));
      }
    };
    reader.onerror = () => {
      reject(new Error(`Ошибка чтения файла "${file.name}".`));
    };
    reader.readAsText(file);
  });
}

/**
 * Recursively extracts File objects from a Drag & Drop DataTransfer, including dropped folders
 * containing .gltf + .bin + textures.
 */
export async function extractFilesFromDataTransfer(dataTransfer: DataTransfer): Promise<File[]> {
  const items = Array.from(dataTransfer.items || []);
  const entries: FileSystemEntry[] = [];

  for (const item of items) {
    if (item.kind === 'file' && typeof item.webkitGetAsEntry === 'function') {
      const entry = item.webkitGetAsEntry();
      if (entry) entries.push(entry);
    }
  }

  if (entries.length === 0) {
    return Array.from(dataTransfer.files || []);
  }

  const collected: File[] = [];

  const readEntry = async (entry: FileSystemEntry, prefix = ''): Promise<void> => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await new Promise<File>((resolve, reject) => {
        fileEntry.file(resolve, reject);
      });
      const relativePath = prefix ? `${prefix}/${file.name}` : file.name;
      Object.defineProperty(file, 'webkitRelativePath', {
        value: relativePath,
        configurable: true,
      });
      collected.push(file);
      return;
    }

    if (entry.isDirectory) {
      const dirEntry = entry as FileSystemDirectoryEntry;
      const reader = dirEntry.createReader();
      const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;

      const readBatch = (): Promise<FileSystemEntry[]> =>
        new Promise((resolve, reject) => {
          reader.readEntries(resolve, reject);
        });

      let batch = await readBatch();
      while (batch.length > 0) {
        for (const child of batch) {
          await readEntry(child, nextPrefix);
        }
        batch = await readBatch();
      }
    }
  };

  for (const entry of entries) {
    await readEntry(entry);
  }

  return collected;
}

/**
 * Loads a real .glb or .gltf (+ external .bin / texture files) using Three.js GLTFLoader.
 */
export async function loadLocalModelFiles(
  files: File[],
  onProgress?: LoadProgressCallback,
): Promise<LoadedModelResult> {
  const { bundle, error } = selectModelBundle(files);
  if (error || !bundle) {
    throw new Error(error || 'Не удалось определить файл 3D-модели.');
  }

  const { primaryFile, format, resourceFiles, totalBytes } = bundle;
  const createdBlobUrls: string[] = [];

  const revokeResources = () => {
    for (const url of createdBlobUrls) {
      URL.revokeObjectURL(url);
    }
    createdBlobUrls.length = 0;
  };

  try {
    onProgress?.(5, `Проверка файла ${primaryFile.name}...`);

    const manager = new THREE.LoadingManager();
    const failedUrls: string[] = [];

    manager.onProgress = (_url, itemsLoaded, itemsTotal) => {
      if (itemsTotal > 0) {
        const pct = Math.min(95, 55 + Math.round((itemsLoaded / itemsTotal) * 40));
        onProgress?.(pct, `Загрузка ресурсов (${itemsLoaded}/${itemsTotal})...`);
      }
    };

    manager.onError = (url) => {
      failedUrls.push(url);
    };

    // Map every bundled file (by normalized relative path and basename) to a deduplicated Blob URL
    const pathToBlobUrl = new Map<string, string>();
    const fileToBlobUrl = new Map<File, string>();

    for (const [key, file] of resourceFiles.entries()) {
      let blobUrl = fileToBlobUrl.get(file);
      if (!blobUrl) {
        blobUrl = URL.createObjectURL(file);
        fileToBlobUrl.set(file, blobUrl);
        createdBlobUrls.push(blobUrl);
      }
      pathToBlobUrl.set(key, blobUrl);
    }

    manager.setURLModifier((url: string) => {
      if (url.startsWith('blob:') || url.startsWith('data:')) {
        return url;
      }
      const norm = normalizeResourcePath(url).toLowerCase();
      const base = getBaseName(url).toLowerCase();

      if (pathToBlobUrl.has(norm)) {
        return pathToBlobUrl.get(norm)!;
      }
      if (pathToBlobUrl.has(base)) {
        return pathToBlobUrl.get(base)!;
      }
      for (const [key, blobUrl] of pathToBlobUrl.entries()) {
        if (key.endsWith(`/${norm}`) || key.endsWith(norm)) {
          return blobUrl;
        }
      }
      return url;
    });

    const loader = new GLTFLoader(manager);

    let gltf: GLTF;

    if (format === 'GLB') {
      const buffer = await readFileAsArrayBuffer(primaryFile, (loaded, total) => {
        const pct = Math.min(50, 5 + Math.round((loaded / Math.max(total, 1)) * 45));
        onProgress?.(pct, `Чтение GLB (${Math.round((loaded / Math.max(total, 1)) * 100)}%)...`);
      });

      const headerCheck = validateGlbBuffer(buffer);
      if (!headerCheck.valid) {
        throw new Error(headerCheck.error || 'Повреждённый файл GLB.');
      }

      onProgress?.(60, 'Разбор геометрии и материалов GLB...');
      gltf = await new Promise<GLTF>((resolve, reject) => {
        loader.parse(
          buffer,
          '',
          (parsed) => resolve(parsed),
          (parseError) => {
            const msg = parseError instanceof Error ? parseError.message : String(parseError);
            reject(new Error(`Не удалось разобрать GLB: ${msg}`));
          },
        );
      });
    } else {
      const jsonText = await readFileAsText(primaryFile, (loaded, total) => {
        const pct = Math.min(45, 5 + Math.round((loaded / Math.max(total, 1)) * 40));
        onProgress?.(pct, `Чтение glTF (${Math.round((loaded / Math.max(total, 1)) * 100)}%)...`);
      });

      const jsonCheck = validateGltfJson(jsonText);
      if (!jsonCheck.valid) {
        throw new Error(jsonCheck.error || 'Повреждённый файл glTF.');
      }

      const missing = findMissingGltfResources(jsonCheck.externalUris, resourceFiles);
      if (missing.length > 0) {
        const list = missing.slice(0, 4).join(', ');
        const suffix = missing.length > 4 ? ` и ещё ${missing.length - 4}` : '';
        throw new Error(
          `Для glTF не хватает внешних ресурсов (${list}${suffix}). Выберите сразу все файлы модели (.gltf, .bin и текстуры) или перетащите всю папку.`,
        );
      }

      onProgress?.(55, 'Загрузка буферов и текстур glTF...');
      gltf = await new Promise<GLTF>((resolve, reject) => {
        loader.parse(
          jsonText,
          '',
          (parsed) => resolve(parsed),
          (parseError) => {
            const msg = parseError instanceof Error ? parseError.message : String(parseError);
            reject(new Error(`Не удалось разобрать glTF: ${msg}`));
          },
        );
      });
    }

    if (failedUrls.length > 0) {
      throw new Error(`Не удалось загрузить внешние ресурсы модели: ${failedUrls.join(', ')}`);
    }

    if (!gltf || !gltf.scene) {
      throw new Error('Загруженный файл не содержит 3D-сцены.');
    }

    onProgress?.(100, 'Готово');

    const assetMeta = (gltf.asset || {}) as { generator?: string; version?: string };

    return {
      gltf,
      fileName: primaryFile.name,
      fileFormat: format,
      sourceFileCount: files.length,
      sourceSizeBytes: totalBytes,
      generator: typeof assetMeta.generator === 'string' ? assetMeta.generator : null,
      gltfVersion: typeof assetMeta.version === 'string' ? assetMeta.version : null,
      revokeResources,
    };
  } catch (err) {
    revokeResources();
    throw err;
  }
}
