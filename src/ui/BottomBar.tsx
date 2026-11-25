import { formatByteSize } from '../loaders/fileValidation';
import type { LoadProgressState, ModelAnalysis } from './types';

interface BottomBarProps {
  analysis: ModelAnalysis | null;
  progress: LoadProgressState;
}

export function BottomBar({ analysis, progress }: BottomBarProps) {
  return (
    <footer className="h-8 shrink-0 bg-[#16181D] border-t border-[#262A34] px-3 flex items-center justify-between gap-4 text-[11px] text-[#8C95A6] select-none z-20">
      {/* Left: File metadata */}
      <div className="flex items-center gap-2 min-w-0 truncate">
        {analysis ? (
          <>
            <span className="text-[#D4DBE6] font-medium truncate max-w-[180px] sm:max-w-[260px]">
              {analysis.fileName}
            </span>
            <span aria-hidden="true" className="hidden sm:inline">
              ·
            </span>
            <span className="hidden sm:inline font-mono tabular-nums">
              {analysis.fileFormat}
            </span>
            <span aria-hidden="true" className="hidden md:inline">
              ·
            </span>
            <span className="hidden md:inline font-mono tabular-nums">
              {formatByteSize(analysis.sourceSizeBytes)}
            </span>
          </>
        ) : (
          <span>Нет загруженной модели</span>
        )}
      </div>

      {/* Right: Dimensions, Polygons & Real Progress */}
      <div className="flex items-center gap-3 shrink-0 font-mono tabular-nums">
        {progress.active ? (
          <div className="flex items-center gap-2" role="status" aria-live="polite">
            <span className="font-sans text-[#C8D0DC] truncate max-w-[180px]">
              {progress.label}
            </span>
            <div className="w-24 h-1.5 bg-[#262A34] rounded-full overflow-hidden">
              <div
                className="h-full bg-sky-400 transition-[width] duration-150"
                style={{ width: `${Math.min(100, Math.max(0, progress.percent))}%` }}
              />
            </div>
            <span className="text-sky-300 w-8 text-right">{Math.round(progress.percent)}%</span>
          </div>
        ) : analysis ? (
          <>
            <span className="hidden md:inline text-[#9AA3B2]">
              {analysis.dimensions.x.toFixed(2)} × {analysis.dimensions.y.toFixed(2)} ×{' '}
              {analysis.dimensions.z.toFixed(2)}
            </span>
            <span aria-hidden="true" className="hidden md:inline">
              ·
            </span>
            <span className="text-[#D4DBE6]">
              {analysis.triangleCount.toLocaleString('ru-RU')} треуг.
            </span>
            <span aria-hidden="true" className="hidden sm:inline">
              ·
            </span>
            <span className="hidden sm:inline text-[#9AA3B2]">
              {analysis.vertexCount.toLocaleString('ru-RU')} верш.
            </span>
          </>
        ) : (
          <span className="font-sans text-[#6F7889]">GLB / glTF 2.0</span>
        )}
      </div>
    </footer>
  );
}
