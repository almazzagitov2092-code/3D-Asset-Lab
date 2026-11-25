import { AlertTriangle, FileUp, FolderUp, Upload, X } from 'lucide-react';
import type { LoadProgressState } from './types';

interface ViewportOverlayProps {
  hasModel: boolean;
  isDragging: boolean;
  progress: LoadProgressState;
  errorMessage: string | null;
  contextLost: boolean;
  onDismissError: () => void;
  onOpenFilePicker: () => void;
  onOpenFolderPicker: () => void;
}

export function ViewportOverlay({
  hasModel,
  isDragging,
  progress,
  errorMessage,
  contextLost,
  onDismissError,
  onOpenFilePicker,
  onOpenFolderPicker,
}: ViewportOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4">
      {/* Top Error / Context Lost Banner */}
      <div className="flex flex-col items-center gap-2">
        {contextLost && (
          <div
            role="alert"
            className="pointer-events-auto max-w-lg w-full bg-[#24171A] border border-rose-500/45 rounded-md px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-rose-100"
          >
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              Контекст WebGL временно потерян графическим драйвером. Ожидание восстановления...
            </div>
          </div>
        )}

        {errorMessage && (
          <div
            role="alert"
            className="pointer-events-auto max-w-xl w-full bg-[#23181B] border border-rose-500/45 rounded-md px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-rose-100 shadow-lg"
          >
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 leading-relaxed">{errorMessage}</div>
            <button
              type="button"
              onClick={onDismissError}
              aria-label="Закрыть сообщение об ошибке"
              className="text-rose-300/80 hover:text-rose-100 p-0.5 shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Center Empty State (strictly no fake 3D primitives when empty) */}
      {!hasModel && !progress.active && !isDragging && (
        <div className="m-auto pointer-events-auto max-w-md w-full bg-[#16181D]/95 border border-[#2A2F3B] rounded-lg p-6 text-center shadow-xl">
          <div className="w-11 h-11 mx-auto mb-3.5 rounded-lg bg-[#1F242E] border border-[#2F3645] flex items-center justify-center">
            <Upload className="w-5 h-5 text-sky-400" aria-hidden="true" />
          </div>
          <h1 className="text-base font-semibold text-[#E6EAF0]">
            Загрузите 3D-модель для просмотра и анализа
          </h1>
          <p className="text-xs text-[#9AA3B2] mt-2 leading-relaxed">
            Поддерживаются локальные файлы <span className="text-[#E6EAF0]">.glb</span> и{' '}
            <span className="text-[#E6EAF0]">.gltf</span> с внешними буферами{' '}
            <span className="text-[#E6EAF0]">.bin</span> и текстурами. Перетащите файлы сюда или
            выберите на устройстве.
          </p>

          <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={onOpenFilePicker}
              className="w-full sm:w-auto px-4 py-2.5 rounded-md bg-sky-500 hover:bg-sky-400 text-[#0B1117] text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <FileUp className="w-4 h-4 shrink-0" />
              <span>Выбрать файл GLB / glTF</span>
            </button>

            <button
              type="button"
              onClick={onOpenFolderPicker}
              className="w-full sm:w-auto px-4 py-2.5 rounded-md bg-[#1F242E] hover:bg-[#282F3C] border border-[#2F3645] text-xs font-medium text-[#D4DBE6] flex items-center justify-center gap-2 transition-colors"
            >
              <FolderUp className="w-4 h-4 shrink-0 text-[#9AA3B2]" />
              <span>Загрузить папку glTF</span>
            </button>
          </div>
        </div>
      )}

      {/* Active Load / Export Progress Modal */}
      {progress.active && (
        <div
          role="status"
          aria-live="polite"
          className="m-auto pointer-events-auto max-w-sm w-full bg-[#16181D]/95 border border-[#2A2F3B] rounded-lg p-5 shadow-xl"
        >
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-xs font-medium text-[#E6EAF0] truncate">{progress.label}</span>
            <span className="text-xs font-mono tabular-nums text-sky-400 shrink-0">
              {Math.round(progress.percent)}%
            </span>
          </div>
          <div className="w-full h-1.5 bg-[#262A34] rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-400 transition-[width] duration-150"
              style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
            />
          </div>
        </div>
      )}

      {/* Drag & Drop Full-Viewport Highlight */}
      {isDragging && (
        <div className="absolute inset-3 rounded-lg border-2 border-dashed border-sky-400 bg-[#121820]/90 flex flex-col items-center justify-center text-center p-6 pointer-events-none">
          <Upload className="w-9 h-9 text-sky-400 mb-3" />
          <div className="text-sm font-semibold text-[#E6EAF0]">
            Отпустите файлы для загрузки модели
          </div>
          <div className="text-xs text-[#9AA3B2] mt-1">
            Поддерживаются .glb, .gltf и папки с текстурами и .bin
          </div>
        </div>
      )}

      {/* Bottom subtle interaction hint when model is active (desktop only, never blocks model) */}
      {hasModel && !progress.active && !isDragging ? (
        <div className="hidden sm:flex justify-center">
          <div className="px-3 py-1 rounded bg-[#16181D]/85 border border-[#262A34] text-[11px] text-[#8C95A6]">
            ЛКМ: вращение · ПКМ: перемещение · Колесо: масштаб · Клик: выбор объекта
          </div>
        </div>
      ) : (
        <div />
      )}
    </div>
  );
}
