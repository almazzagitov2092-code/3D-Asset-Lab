import {
  Axis3D,
  Box,
  Download,
  FolderOpen,
  Grid3X3,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelRight,
  RotateCcw,
  Scan,
  Sun,
} from 'lucide-react';
import type { CameraMode, LightingPreset, RenderMode, ViewerSettings } from './types';

interface TopToolbarProps {
  settings: ViewerSettings;
  hasModel: boolean;
  isBusy: boolean;
  leftOpen: boolean;
  rightOpen: boolean;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onOpenFilePicker: () => void;
  onQuickExportGlb: () => void;
  onCameraModeChange: (mode: CameraMode) => void;
  onRenderModeChange: (mode: RenderMode) => void;
  onLightingChange: (preset: LightingPreset) => void;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onFitCamera: () => void;
  onResetCamera: () => void;
  onToggleFullscreen: () => void;
}

export function TopToolbar({
  settings,
  hasModel,
  isBusy,
  leftOpen,
  rightOpen,
  onToggleLeft,
  onToggleRight,
  onOpenFilePicker,
  onQuickExportGlb,
  onCameraModeChange,
  onRenderModeChange,
  onLightingChange,
  onToggleGrid,
  onToggleAxes,
  onFitCamera,
  onResetCamera,
  onToggleFullscreen,
}: TopToolbarProps) {
  return (
    <header className="h-12 shrink-0 bg-[#16181D] border-b border-[#262A34] px-3 flex items-center justify-between gap-3 select-none z-20">
      {/* Left: Brand & panel toggles */}
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onToggleLeft}
          aria-label={leftOpen ? 'Скрыть панель сцены' : 'Открыть панель сцены'}
          aria-expanded={leftOpen}
          title="Панель сцены и файлов"
          className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors shrink-0 ${
            leftOpen
              ? 'bg-[#232833] text-sky-400'
              : 'text-[#9AA3B2] hover:bg-[#1E222B] hover:text-[#E6EAF0]'
          }`}
        >
          <PanelLeft className="w-4 h-4" />
        </button>

        <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
          <Box className="w-4 h-4 text-sky-400 shrink-0" aria-hidden="true" />
          <span className="text-sm font-semibold tracking-normal text-[#E6EAF0]">
            3D Asset Lab
          </span>
        </div>
      </div>

      {/* Center: Desktop viewport controls */}
      <div className="hidden lg:flex items-center gap-2 min-w-0">
        {/* Perspective / Orthographic */}
        <div
          className="flex items-center bg-[#121418] border border-[#262A34] rounded-md p-0.5"
          role="group"
          aria-label="Тип проекции камеры"
        >
          <button
            type="button"
            onClick={() => onCameraModeChange('perspective')}
            aria-pressed={settings.cameraMode === 'perspective'}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
              settings.cameraMode === 'perspective'
                ? 'bg-[#262C38] text-[#E6EAF0]'
                : 'text-[#8C95A6] hover:text-[#E6EAF0]'
            }`}
          >
            Перспектива
          </button>
          <button
            type="button"
            onClick={() => onCameraModeChange('orthographic')}
            aria-pressed={settings.cameraMode === 'orthographic'}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
              settings.cameraMode === 'orthographic'
                ? 'bg-[#262C38] text-[#E6EAF0]'
                : 'text-[#8C95A6] hover:text-[#E6EAF0]'
            }`}
          >
            Орто
          </button>
        </div>

        {/* Solid / Wireframe */}
        <div
          className="flex items-center bg-[#121418] border border-[#262A34] rounded-md p-0.5"
          role="group"
          aria-label="Режим отображения геометрии"
        >
          <button
            type="button"
            onClick={() => onRenderModeChange('solid')}
            aria-pressed={settings.renderMode === 'solid'}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
              settings.renderMode === 'solid'
                ? 'bg-[#262C38] text-[#E6EAF0]'
                : 'text-[#8C95A6] hover:text-[#E6EAF0]'
            }`}
          >
            Solid
          </button>
          <button
            type="button"
            onClick={() => onRenderModeChange('wireframe')}
            aria-pressed={settings.renderMode === 'wireframe'}
            className={`px-2.5 py-1 text-xs font-medium rounded whitespace-nowrap transition-colors ${
              settings.renderMode === 'wireframe'
                ? 'bg-[#262C38] text-[#E6EAF0]'
                : 'text-[#8C95A6] hover:text-[#E6EAF0]'
            }`}
          >
            Wireframe
          </button>
        </div>

        {/* Lighting preset */}
        <label className="flex items-center gap-1.5 bg-[#121418] border border-[#262A34] rounded-md px-2 h-8 text-xs text-[#9AA3B2]">
          <Sun className="w-3.5 h-3.5 text-[#8C95A6] shrink-0" aria-hidden="true" />
          <span className="sr-only">Режим освещения</span>
          <select
            aria-label="Режим освещения"
            value={settings.lightingPreset}
            onChange={(e) => onLightingChange(e.target.value as LightingPreset)}
            className="bg-transparent text-xs text-[#E6EAF0] focus:outline-none cursor-pointer pr-1"
          >
            <option value="studio" className="bg-[#1C1F26] text-[#E6EAF0]">
              Студия
            </option>
            <option value="daylight" className="bg-[#1C1F26] text-[#E6EAF0]">
              Дневной
            </option>
            <option value="contrast" className="bg-[#1C1F26] text-[#E6EAF0]">
              Контраст
            </option>
            <option value="unlit" className="bg-[#1C1F26] text-[#E6EAF0]">
              Без света
            </option>
          </select>
        </label>

        <div className="h-4 w-px bg-[#262A34] mx-0.5" aria-hidden="true" />

        {/* Helpers & camera buttons */}
        <button
          type="button"
          onClick={onToggleGrid}
          aria-pressed={settings.showGrid}
          aria-label="Переключить сетку пола"
          title="Сетка пола"
          className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
            settings.showGrid
              ? 'bg-[#232833] text-sky-400'
              : 'text-[#8C95A6] hover:bg-[#1E222B] hover:text-[#E6EAF0]'
          }`}
        >
          <Grid3X3 className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleAxes}
          aria-pressed={settings.showAxes}
          aria-label="Переключить координатные оси"
          title="Координатные оси"
          className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors ${
            settings.showAxes
              ? 'bg-[#232833] text-sky-400'
              : 'text-[#8C95A6] hover:bg-[#1E222B] hover:text-[#E6EAF0]'
          }`}
        >
          <Axis3D className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onFitCamera}
          aria-label="Подогнать модель под окно"
          title="Подогнать модель под размер окна"
          className="h-8 w-8 rounded-md flex items-center justify-center text-[#8C95A6] hover:bg-[#1E222B] hover:text-[#E6EAF0] transition-colors"
        >
          <Scan className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onResetCamera}
          aria-label="Сбросить положение камеры"
          title="Сбросить камеру"
          className="h-8 w-8 rounded-md flex items-center justify-center text-[#8C95A6] hover:bg-[#1E222B] hover:text-[#E6EAF0] transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
        </button>

        <button
          type="button"
          onClick={onToggleFullscreen}
          aria-label={settings.isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
          title={settings.isFullscreen ? 'Выйти из полноэкранного режима' : 'Полноэкранный режим'}
          className="h-8 w-8 rounded-md flex items-center justify-center text-[#8C95A6] hover:bg-[#1E222B] hover:text-[#E6EAF0] transition-colors"
        >
          {settings.isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Right: Load, Export & Inspector toggle */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenFilePicker}
          disabled={isBusy}
          className="h-8 px-3 rounded-md bg-[#1F242E] hover:bg-[#282F3C] border border-[#2F3645] text-xs font-medium text-[#E6EAF0] flex items-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
        >
          <FolderOpen className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
          <span>{hasModel ? 'Заменить' : 'Загрузить'}</span>
        </button>

        <button
          type="button"
          onClick={onQuickExportGlb}
          disabled={!hasModel || isBusy}
          className="hidden sm:flex h-8 px-3 rounded-md bg-sky-500 hover:bg-sky-400 text-[#0B1117] text-xs font-semibold items-center gap-1.5 whitespace-nowrap transition-colors disabled:bg-[#1E222B] disabled:text-[#5B6475] disabled:border disabled:border-[#262A34] disabled:cursor-not-allowed"
        >
          <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>Экспорт GLB</span>
        </button>

        <button
          type="button"
          onClick={onToggleRight}
          aria-label={rightOpen ? 'Скрыть инспектор' : 'Открыть инспектор'}
          aria-expanded={rightOpen}
          title="Инспектор модели и экспорт"
          className={`h-8 w-8 rounded-md flex items-center justify-center transition-colors shrink-0 ${
            rightOpen
              ? 'bg-[#232833] text-sky-400'
              : 'text-[#9AA3B2] hover:bg-[#1E222B] hover:text-[#E6EAF0]'
          }`}
        >
          <PanelRight className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
}
