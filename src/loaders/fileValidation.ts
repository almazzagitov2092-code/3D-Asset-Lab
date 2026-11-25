export const GLB_MAGIC = 0x46546c67; // "glTF" in little-endian ASCII
export const GLB_HEADER_SIZE = 12;

export interface ValidatedFileBundle {
  primaryFile: File;
  format: 'GLB' | 'glTF';
  resourceFiles: Map<string, File>;
  totalBytes: number;
}

export interface GlbHeaderValidation {
  valid: boolean;
  version?: number;
  declaredLength?: number;
  error?: string;
}

export interface GltfJsonValidation {
  valid: boolean;
  version?: string;
  externalUris: string[];
  error?: string;
}

export function getFileExtension(name: string): string {
  const lower = name.trim().toLowerCase();
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx === -1 || dotIdx === lower.length - 1) return '';
  return lower.slice(dotIdx + 1);
}

export function normalizeResourcePath(uri: string): string {
  let clean = uri.split('?')[0].split('#')[0];
  try {
    clean = decodeURIComponent(clean);
  } catch {
    // Keep raw URI if percent decoding fails
  }
  clean = clean.replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\/+/, '');
  return clean;
}

export function getBaseName(path: string): string {
  const normalized = normalizeResourcePath(path);
  const idx = normalized.lastIndexOf('/');
  return idx === -1 ? normalized : normalized.slice(idx + 1);
}

export function validateGlbBuffer(buffer: ArrayBuffer): GlbHeaderValidation {
  if (buffer.byteLength < GLB_HEADER_SIZE) {
    return {
      valid: false,
      error: 'Файл GLB слишком мал или повреждён (меньше 12 байт заголовка).',
    };
  }

  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    return {
      valid: false,
      error: 'Неверная сигнатура GLB: файл не является корректным бинарным glTF.',
    };
  }

  const version = view.getUint32(4, true);
  if (version !== 2) {
    return {
      valid: false,
      version,
      error: `Неподдерживаемая версия GLB (${version}). Требуется glTF 2.0.`,
    };
  }

  const declaredLength = view.getUint32(8, true);
  if (declaredLength < GLB_HEADER_SIZE || declaredLength > buffer.byteLength) {
    return {
      valid: false,
      version,
      declaredLength,
      error: `Файл GLB обрезан или повреждён: заявлено ${declaredLength} байт, фактически ${buffer.byteLength} байт.`,
    };
  }

  return {
    valid: true,
    version,
    declaredLength,
  };
}

export function validateGltfJson(text: string): GltfJsonValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      valid: false,
      externalUris: [],
      error: 'Повреждённый файл glTF: ошибка разбора JSON.',
    };
  }

  if (!parsed || typeof parsed !== 'object') {
    return {
      valid: false,
      externalUris: [],
      error: 'Некорректная структура glTF: корневой элемент должен быть JSON-объектом.',
    };
  }

  const root = parsed as {
    asset?: { version?: string };
    buffers?: Array<{ uri?: string }>;
    images?: Array<{ uri?: string }>;
  };

  if (!root.asset || typeof root.asset.version !== 'string') {
    return {
      valid: false,
      externalUris: [],
      error: 'В файле glTF отсутствует обязательный раздел asset.version.',
    };
  }

  if (!root.asset.version.startsWith('2.')) {
    return {
      valid: false,
      version: root.asset.version,
      externalUris: [],
      error: `Неподдерживаемая версия glTF (${root.asset.version}). Поддерживается glTF 2.0.`,
    };
  }

  const externalUris: string[] = [];
  const collectUri = (uri?: string) => {
    if (!uri || typeof uri !== 'string') return;
    if (uri.startsWith('data:') || uri.startsWith('http://') || uri.startsWith('https://')) {
      return;
    }
    externalUris.push(normalizeResourcePath(uri));
  };

  if (Array.isArray(root.buffers)) {
    for (const buf of root.buffers) collectUri(buf?.uri);
  }
  if (Array.isArray(root.images)) {
    for (const img of root.images) collectUri(img?.uri);
  }

  return {
    valid: true,
    version: root.asset.version,
    externalUris,
  };
}

export function selectModelBundle(files: File[]): { bundle?: ValidatedFileBundle; error?: string } {
  if (!files || files.length === 0) {
    return { error: 'Файлы не выбраны.' };
  }

  const primary = files.find((f) => {
    const ext = getFileExtension(f.name);
    return ext === 'glb' || ext === 'gltf';
  });

  if (!primary) {
    const firstExt = getFileExtension(files[0].name);
    return {
      error: firstExt
        ? `Формат .${firstExt} не поддерживается. Загрузите файл .glb или .gltf (вместе с .bin и текстурами при необходимости).`
        : 'Неподдерживаемый файл. Выберите модель в формате .glb или .gltf.',
    };
  }

  const ext = getFileExtension(primary.name);
  const format: 'GLB' | 'glTF' = ext === 'glb' ? 'GLB' : 'glTF';

  const resourceFiles = new Map<string, File>();
  let totalBytes = 0;

  for (const file of files) {
    totalBytes += file.size;
    const relPath =
      'webkitRelativePath' in file && typeof file.webkitRelativePath === 'string' && file.webkitRelativePath
        ? normalizeResourcePath(file.webkitRelativePath)
        : normalizeResourcePath(file.name);

    resourceFiles.set(relPath.toLowerCase(), file);
    const base = getBaseName(relPath).toLowerCase();
    if (!resourceFiles.has(base)) {
      resourceFiles.set(base, file);
    }
  }

  return {
    bundle: {
      primaryFile: primary,
      format,
      resourceFiles,
      totalBytes,
    },
  };
}

export function findMissingGltfResources(
  externalUris: string[],
  resourceFiles: Map<string, File>,
): string[] {
  const missing: string[] = [];
  for (const uri of externalUris) {
    const norm = normalizeResourcePath(uri).toLowerCase();
    const base = getBaseName(uri).toLowerCase();
    const matched =
      resourceFiles.has(norm) ||
      resourceFiles.has(base) ||
      Array.from(resourceFiles.keys()).some((k) => k.endsWith(`/${norm}`) || k.endsWith(norm));

    if (!matched) {
      missing.push(uri);
    }
  }
  return missing;
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Б';
  if (bytes < 1024) return `${Math.round(bytes)} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}
