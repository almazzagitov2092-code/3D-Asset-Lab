import { useState } from 'react';
import {
  Axis3D,
  CheckCircle2,
  Crosshair,
  Download,
  Grid3X3,
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Scan,
  X,
} from 'lucide-react';
import { formatByteSize } from '../loaders/fileValidation';
import type {
  CameraMode,
  ExportFormat,
  ExportResultInfo,
  InspectorTab,
  LightingPreset,
  ModelAnalysis,
  RenderMode,
  ViewerSettings,
} from './types';

interface RightPanelProps {
  analysis: ModelAnalysis | null;
  settings: ViewerSettings;
  activeTab: InspectorTab;
  isBusy: boolean;
  isAnimationPlaying: boolean;
  activeAnimationIndex: number;
  lastExport: ExportResultInfo | null;
  onTabChange: (tab: InspectorTab) => void;
  onCameraModeChange: (mode: CameraMode) => void;
  onRenderModeChange: (mode: RenderMode) => void;
  onLightingChange: (preset: LightingPreset) => void;
  onToggleGrid: () => void;
  onToggleAxes: () => void;
  onCenterModel: () => void;
  onFitCamera: () => void;
  onResetCamera: () => void;
  onToggleFullscreen: () => void;
  onPlayAnimation: (index: number) => void;
  onPauseAnimation: () => void;
  onExport: (format: ExportFormat, onlyVisible: boolean) => void;
  onReloadExportedBlob: (exported: ExportResultInfo) => void;
  onCloseMobile?: () => void;
}

const SLOT_LABELS: Record<string, string> = {
  map: 'Albedo / BaseColor',
  normalMap: 'Normal',
  roughnessMap: 'Roughness',
  metalnessMap: 'Metalness',
  aoMap: 'Ambient Occlusion',
  emissiveMap: 'Emissive',
  alphaMap: 'Alpha',
  bumpMap: 'Bump',
  displacementMap: 'Displacement',
  clearcoatMap: 'Clearcoat',
};

function MetricRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-[#222630] last:border-b-0">
      <span className="text-xs text-[#8C95A6] shrink-0">{label}</span>
      <span className="text-xs font-mono tabular-nums text-[#E6EAF0] text-right truncate">
        {value}
      </span>
    </div>
  );
}

export function RightPanel({
  analysis,
  settings,
  activeTab,
  isBusy,
  isAnimationPlaying,
  activeAnimationIndex,
  lastExport,
  onTabChange,
  onCameraModeChange,
  onRenderModeChange,
  onLightingChange,
  onToggleGrid,
  onToggleAxes,
  onCenterModel,
  onFitCamera,
  onResetCamera,
  onToggleFullscreen,
  onPlayAnimation,
  onPauseAnimation,
  onExport,
  onReloadExportedBlob,
  onCloseMobile,
}: RightPanelProps) {
  const [exportFormat, setExportFormat] = useState<ExportFormat>('glb');
  const [onlyVisible, setOnlyVisible] = useState(false);

  const tabs: Array<{ id: InspectorTab; label: string }> = [
    { id: 'geometry', label: 'Геометрия' },
    { id: 'materials', label: 'Материалы' },
    { id: 'textures', label: 'Текстуры' },
    { id: 'export', label: 'Экспорт' },
  ];

  return (
    <aside
      aria-label="Инспектор параметров модели и экспорта"
      className="h-full w-full bg-[#16181D] border-l border-[#262A34] flex flex-col min-h-0 select-none"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#262A34] flex items-center justify-between gap-2 shrink-0">
        <h2 className="text-xs font-semibold text-[#E6EAF0] tracking-wide">Инспектор</h2>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Закрыть инспектор"
            className="lg:hidden h-7 w-7 rounded flex items-center justify-center text-[#9AA3B2] hover:bg-[#1E222B] hover:text-[#E6EAF0]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Разделы инспектора"
        className="px-2 pt-2 border-b border-[#262A34] flex items-center gap-0.5 shrink-0"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 py-2 px-1.5 text-[11px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                isActive
                  ? 'border-sky-400 text-[#E6EAF0]'
                  : 'border-transparent text-[#8C95A6] hover:text-[#C8D0DC]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-y-auto lab-scroll p-4 space-y-5">
        {activeTab === 'geometry' && (
          <>
            {/* Real Geometry Analysis */}
            <section aria-labelledby="geometry-stats-heading">
              <h3 id="geometry-stats-heading" className="text-xs font-semibold text-[#C8D0DC] mb-2">
                Анализ геометрии
              </h3>
              {!analysis ? (
                <p className="text-xs text-[#7E8899] leading-relaxed">
                  Метрики появятся автоматически после загрузки 3D-модели.
                </p>
              ) : (
                <div className="bg-[#1C1F26] border border-[#262A34] rounded-md px-3 py-1">
                  <MetricRow
                    label="Mesh-объекты"
                    value={analysis.meshCount.toLocaleString('ru-RU')}
                  />
                  <MetricRow
                    label="Вершины"
                    value={analysis.vertexCount.toLocaleString('ru-RU')}
                  />
                  <MetricRow
                    label="Треугольники"
                    value={analysis.triangleCount.toLocaleString('ru-RU')}
                  />
                  <MetricRow
                    label="Полигональные части"
                    value={analysis.polygonPartCount.toLocaleString('ru-RU')}
                  />
                  <MetricRow
                    label="Материалы"
                    value={analysis.materialCount.toLocaleString('ru-RU')}
                  />
                  <MetricRow
                    label="Текстуры"
                    value={analysis.textureCount.toLocaleString('ru-RU')}
                  />
                  <MetricRow label="Размер X" value={`${analysis.dimensions.x.toFixed(3)}`} />
                  <MetricRow label="Размер Y" value={`${analysis.dimensions.y.toFixed(3)}`} />
                  <MetricRow label="Размер Z" value={`${analysis.dimensions.z.toFixed(3)}`} />
                  <MetricRow
                    label="Скелет"
                    value={
                      analysis.hasSkeleton
                        ? `Да (${analysis.boneCount} костей)`
                        : 'Нет'
                    }
                  />
                  <MetricRow
                    label="Анимации"
                    value={
                      analysis.hasAnimations
                        ? `Да (${analysis.animationCount})`
                        : 'Нет'
                    }
                  />
                  <MetricRow
                    label="UV-развёртка"
                    value={
                      analysis.hasUV
                        ? `Да (${analysis.uvChannels.join(', ')})`
                        : 'Нет'
                    }
                  />
                  <MetricRow
                    label="Размер файла"
                    value={formatByteSize(analysis.sourceSizeBytes)}
                  />
                  <MetricRow
                    label="Память геометрии"
                    value={formatByteSize(analysis.estimatedGeometryBytes)}
                  />
                  <MetricRow
                    label="Память текстур (VRAM)"
                    value={formatByteSize(analysis.estimatedTextureBytes)}
                  />
                  <MetricRow
                    label="Итого ресурсов"
                    value={formatByteSize(analysis.estimatedTotalMemoryBytes)}
                  />
                  {analysis.gltfVersion && (
                    <MetricRow label="Версия glTF" value={analysis.gltfVersion} />
                  )}
                  {analysis.generator && (
                    <MetricRow label="Генератор" value={analysis.generator} />
                  )}
                </div>
              )}
            </section>

            {/* Real Animation Playback (shown only when model actually contains clips) */}
            {analysis && analysis.hasAnimations && (
              <section aria-labelledby="animation-heading">
                <h3 id="animation-heading" className="text-xs font-semibold text-[#C8D0DC] mb-2">
                  Анимации ({analysis.animationCount})
                </h3>
                <div className="bg-[#1C1F26] border border-[#262A34] rounded-md p-3 space-y-2.5">
                  <select
                    aria-label="Выбор клипа анимации"
                    value={activeAnimationIndex}
                    onChange={(e) => onPlayAnimation(Number(e.target.value))}
                    className="w-full h-8 px-2 rounded bg-[#121418] border border-[#2A2F3B] text-xs text-[#E6EAF0] focus:outline-none focus:border-sky-500"
                  >
                    {analysis.animations.map((clip) => (
                      <option key={clip.index} value={clip.index}>
                        {clip.name} ({clip.duration.toFixed(2)} с)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() =>
                      isAnimationPlaying ? onPauseAnimation() : onPlayAnimation(activeAnimationIndex)
                    }
                    className="w-full h-8 rounded bg-[#232833] hover:bg-[#2C3240] text-xs font-medium text-[#E6EAF0] flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {isAnimationPlaying ? (
                      <>
                        <Pause className="w-3.5 h-3.5 text-sky-400" />
                        <span>Пауза</span>
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 text-sky-400" />
                        <span>Воспроизвести</span>
                      </>
                    )}
                  </button>
                </div>
              </section>
            )}

            {/* Viewer Parameters (always available on desktop & mobile) */}
            <section aria-labelledby="viewport-params-heading">
              <h3 id="viewport-params-heading" className="text-xs font-semibold text-[#C8D0DC] mb-2">
                Параметры просмотра
              </h3>
              <div className="bg-[#1C1F26] border border-[#262A34] rounded-md p-3 space-y-3">
                {/* Camera Projection */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-[#8C95A6] block">Камера</span>
                  <div className="grid grid-cols-2 gap-1 bg-[#121418] p-0.5 rounded border border-[#262A34]">
                    <button
                      type="button"
                      onClick={() => onCameraModeChange('perspective')}
                      aria-pressed={settings.cameraMode === 'perspective'}
                      className={`py-1.5 text-xs rounded transition-colors ${
                        settings.cameraMode === 'perspective'
                          ? 'bg-[#262C38] text-[#E6EAF0] font-medium'
                          : 'text-[#8C95A6] hover:text-[#E6EAF0]'
                      }`}
                    >
                      Перспектива
                    </button>
                    <button
                      type="button"
                      onClick={() => onCameraModeChange('orthographic')}
                      aria-pressed={settings.cameraMode === 'orthographic'}
                      className={`py-1.5 text-xs rounded transition-colors ${
                        settings.cameraMode === 'orthographic'
                          ? 'bg-[#262C38] text-[#E6EAF0] font-medium'
                          : 'text-[#8C95A6] hover:text-[#E6EAF0]'
                      }`}
                    >
                      Ортография
                    </button>
                  </div>
                </div>

                {/* Solid / Wireframe */}
                <div className="space-y-1.5">
                  <span className="text-[11px] text-[#8C95A6] block">Отображение</span>
                  <div className="grid grid-cols-2 gap-1 bg-[#121418] p-0.5 rounded border border-[#262A34]">
                    <button
                      type="button"
                      onClick={() => onRenderModeChange('solid')}
                      aria-pressed={settings.renderMode === 'solid'}
                      className={`py-1.5 text-xs rounded transition-colors ${
                        settings.renderMode === 'solid'
                          ? 'bg-[#262C38] text-[#E6EAF0] font-medium'
                          : 'text-[#8C95A6] hover:text-[#E6EAF0]'
                      }`}
                    >
                      Solid
                    </button>
                    <button
                      type="button"
                      onClick={() => onRenderModeChange('wireframe')}
                      aria-pressed={settings.renderMode === 'wireframe'}
                      className={`py-1.5 text-xs rounded transition-colors ${
                        settings.renderMode === 'wireframe'
                          ? 'bg-[#262C38] text-[#E6EAF0] font-medium'
                          : 'text-[#8C95A6] hover:text-[#E6EAF0]'
                      }`}
                    >
                      Wireframe
                    </button>
                  </div>
                </div>

                {/* Lighting */}
                <div className="space-y-1.5">
                  <label htmlFor="inspector-lighting" className="text-[11px] text-[#8C95A6] block">
                    Освещение
                  </label>
                  <select
                    id="inspector-lighting"
                    value={settings.lightingPreset}
                    onChange={(e) => onLightingChange(e.target.value as LightingPreset)}
                    className="w-full h-8 px-2 rounded bg-[#121418] border border-[#262A34] text-xs text-[#E6EAF0] focus:outline-none focus:border-sky-500"
                  >
                    <option value="studio">Студийное (3 точки + IBL)</option>
                    <option value="daylight">Дневной свет</option>
                    <option value="contrast">Контрастное</option>
                    <option value="unlit">Без освещения (Unlit)</option>
                  </select>
                </div>

                {/* Toggles */}
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={onToggleGrid}
                    aria-pressed={settings.showGrid}
                    className={`h-8 px-2 rounded border text-xs flex items-center justify-center gap-1.5 transition-colors ${
                      settings.showGrid
                        ? 'bg-sky-500/15 border-sky-500/35 text-sky-200'
                        : 'bg-[#121418] border-[#262A34] text-[#8C95A6] hover:text-[#E6EAF0]'
                    }`}
                  >
                    <Grid3X3 className="w-3.5 h-3.5 shrink-0" />
                    <span>Сетка</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleAxes}
                    aria-pressed={settings.showAxes}
                    className={`h-8 px-2 rounded border text-xs flex items-center justify-center gap-1.5 transition-colors ${
                      settings.showAxes
                        ? 'bg-sky-500/15 border-sky-500/35 text-sky-200'
                        : 'bg-[#121418] border-[#262A34] text-[#8C95A6] hover:text-[#E6EAF0]'
                    }`}
                  >
                    <Axis3D className="w-3.5 h-3.5 shrink-0" />
                    <span>Оси XYZ</span>
                  </button>
                </div>

                {/* Camera Actions */}
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={onCenterModel}
                    disabled={!analysis}
                    className="h-8 px-2 rounded bg-[#121418] hover:bg-[#232833] border border-[#262A34] text-xs text-[#C8D0DC] flex items-center justify-center gap-1.5 transition-colors disabled:opacity-40"
                  >
                    <Crosshair className="w-3.5 h-3.5 shrink-0 text-[#8C95A6]" />
                    <span>Центрировать</span>
                  </button>
                  <button
                    type="button"
                    onClick={onFitCamera}
                    className="h-8 px-2 rounded bg-[#121418] hover:bg-[#232833] border border-[#262A34] text-xs text-[#C8D0DC] flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Scan className="w-3.5 h-3.5 shrink-0 text-[#8C95A6]" />
                    <span>Подогнать</span>
                  </button>
                  <button
                    type="button"
                    onClick={onResetCamera}
                    className="h-8 px-2 rounded bg-[#121418] hover:bg-[#232833] border border-[#262A34] text-xs text-[#C8D0DC] flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 shrink-0 text-[#8C95A6]" />
                    <span>Сброс</span>
                  </button>
                  <button
                    type="button"
                    onClick={onToggleFullscreen}
                    className="h-8 px-2 rounded bg-[#121418] hover:bg-[#232833] border border-[#262A34] text-xs text-[#C8D0DC] flex items-center justify-center gap-1.5 transition-colors"
                  >
                    {settings.isFullscreen ? (
                      <Minimize2 className="w-3.5 h-3.5 shrink-0 text-[#8C95A6]" />
                    ) : (
                      <Maximize2 className="w-3.5 h-3.5 shrink-0 text-[#8C95A6]" />
                    )}
                    <span>Экран</span>
                  </button>
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'materials' && (
          <section aria-labelledby="materials-heading">
            <h3 id="materials-heading" className="text-xs font-semibold text-[#C8D0DC] mb-2.5">
              Материалы ({analysis ? analysis.materialCount : 0})
            </h3>
            {!analysis ? (
              <p className="text-xs text-[#7E8899]">Загрузите модель для анализа материалов.</p>
            ) : analysis.materials.length === 0 ? (
              <p className="text-xs text-[#7E8899]">В модели не найдено материалов.</p>
            ) : (
              <div className="space-y-2.5">
                {analysis.materials.map((mat) => (
                  <div
                    key={mat.uuid}
                    className="bg-[#1C1F26] border border-[#262A34] rounded-md p-3 space-y-2"
                  >
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-5 h-5 rounded border border-white/15 shrink-0"
                        style={{ backgroundColor: mat.colorHex || '#6b7280' }}
                        aria-hidden="true"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-[#E6EAF0] truncate" title={mat.name}>
                          {mat.name}
                        </div>
                        <div className="text-[11px] text-[#8C95A6] flex items-center gap-1.5">
                          <span>{mat.type}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">{mat.meshCount} mesh</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums pt-1 border-t border-[#262A34]">
                      {mat.colorHex && (
                        <div className="flex justify-between">
                          <span className="text-[#8C95A6] font-sans">Цвет</span>
                          <span className="text-[#C8D0DC]">{mat.colorHex}</span>
                        </div>
                      )}
                      {mat.metalness !== null && (
                        <div className="flex justify-between">
                          <span className="text-[#8C95A6] font-sans">Metalness</span>
                          <span className="text-[#C8D0DC]">{mat.metalness.toFixed(2)}</span>
                        </div>
                      )}
                      {mat.roughness !== null && (
                        <div className="flex justify-between">
                          <span className="text-[#8C95A6] font-sans">Roughness</span>
                          <span className="text-[#C8D0DC]">{mat.roughness.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-[#8C95A6] font-sans">Opacity</span>
                        <span className="text-[#C8D0DC]">{mat.opacity.toFixed(2)}</span>
                      </div>
                    </div>

                    {(mat.textureSlots.length > 0 || mat.doubleSide || mat.transparent) && (
                      <div className="text-[11px] text-[#8C95A6] pt-1 border-t border-[#262A34] leading-relaxed">
                        {[
                          ...mat.textureSlots.map((s) => SLOT_LABELS[s] || s),
                          ...(mat.doubleSide ? ['DoubleSide'] : []),
                          ...(mat.transparent ? ['Transparent'] : []),
                        ].join(' · ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'textures' && (
          <section aria-labelledby="textures-heading">
            <h3 id="textures-heading" className="text-xs font-semibold text-[#C8D0DC] mb-2.5">
              Текстуры ({analysis ? analysis.textureCount : 0})
            </h3>
            {!analysis ? (
              <p className="text-xs text-[#7E8899]">Загрузите модель для просмотра текстур.</p>
            ) : analysis.textures.length === 0 ? (
              <p className="text-xs text-[#7E8899]">
                В загруженной модели текстурные карты отсутствуют.
              </p>
            ) : (
              <div className="space-y-2.5">
                {analysis.textures.map((tex) => (
                  <div
                    key={tex.uuid}
                    className="bg-[#1C1F26] border border-[#262A34] rounded-md p-2.5 flex items-start gap-3"
                  >
                    <div className="w-14 h-14 rounded border border-[#2E3442] overflow-hidden shrink-0 texture-checker flex items-center justify-center">
                      {tex.previewDataUrl ? (
                        <img
                          src={tex.previewDataUrl}
                          alt={`Превью текстуры ${tex.name}`}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-[#5A6375]" aria-hidden="true" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="text-xs font-medium text-[#E6EAF0] truncate" title={tex.name}>
                        {tex.name}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-[#9AA3B2]">
                        {tex.width > 0 && tex.height > 0 ? `${tex.width} × ${tex.height} px` : 'Размер н/д'} ·{' '}
                        {tex.colorSpace}
                      </div>
                      <div className="text-[11px] text-[#7E8899]">
                        {tex.slots.map((s) => SLOT_LABELS[s] || s).join(' · ')}
                        {tex.estimatedBytes > 0 ? ` · ~${formatByteSize(tex.estimatedBytes)}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {activeTab === 'export' && (
          <section aria-labelledby="export-heading" className="space-y-4">
            <div>
              <h3 id="export-heading" className="text-xs font-semibold text-[#C8D0DC] mb-2">
                Экспорт 3D-ассета
              </h3>
              <p className="text-xs text-[#8C95A6] leading-relaxed">
                Экспорт формирует реальный файл через Three.js GLTFExporter / OBJExporter для
                использования в браузерных играх и Godot.
              </p>
            </div>

            {/* Format selector */}
            <div className="space-y-2" role="radiogroup" aria-label="Формат экспорта">
              <button
                type="button"
                role="radio"
                aria-checked={exportFormat === 'glb'}
                onClick={() => setExportFormat('glb')}
                className={`w-full text-left p-3 rounded-md border transition-colors ${
                  exportFormat === 'glb'
                    ? 'bg-sky-500/12 border-sky-500/50'
                    : 'bg-[#1C1F26] border-[#262A34] hover:border-[#363C4A]'
                }`}
              >
                <div className="text-xs font-semibold text-[#E6EAF0]">
                  GLB — Бинарный glTF 2.0 (рекомендуется)
                </div>
                <div className="text-[11px] text-[#8C95A6] mt-1 leading-relaxed">
                  Сохраняет геометрию, иерархию, трансформации, PBR-материалы, текстуры, скелеты и
                  анимации в одном файле.
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={exportFormat === 'gltf'}
                onClick={() => setExportFormat('gltf')}
                className={`w-full text-left p-3 rounded-md border transition-colors ${
                  exportFormat === 'gltf'
                    ? 'bg-sky-500/12 border-sky-500/50'
                    : 'bg-[#1C1F26] border-[#262A34] hover:border-[#363C4A]'
                }`}
              >
                <div className="text-xs font-semibold text-[#E6EAF0]">glTF — JSON glTF 2.0</div>
                <div className="text-[11px] text-[#8C95A6] mt-1 leading-relaxed">
                  Текстовый JSON с встроенными буферами, материалами, текстурами, скелетами и
                  анимациями.
                </div>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={exportFormat === 'obj'}
                onClick={() => setExportFormat('obj')}
                className={`w-full text-left p-3 rounded-md border transition-colors ${
                  exportFormat === 'obj'
                    ? 'bg-sky-500/12 border-sky-500/50'
                    : 'bg-[#1C1F26] border-[#262A34] hover:border-[#363C4A]'
                }`}
              >
                <div className="text-xs font-semibold text-[#E6EAF0]">OBJ — Wavefront Geometry</div>
                <div className="text-[11px] text-[#8C95A6] mt-1 leading-relaxed">
                  Сохраняет только полигональную геометрию, нормали и UV. Материалы, текстуры,
                  скелеты и анимации форматом OBJExporter не включаются.
                </div>
              </button>
            </div>

            {/* Export option */}
            {exportFormat !== 'obj' && (
              <label className="flex items-center gap-2 text-xs text-[#B6BFCF] cursor-pointer">
                <input
                  type="checkbox"
                  checked={onlyVisible}
                  onChange={(e) => setOnlyVisible(e.target.checked)}
                  className="rounded border-[#3A4252] bg-[#121418] text-sky-500 focus:ring-sky-500"
                />
                <span>Только видимые узлы сцены</span>
              </label>
            )}

            {/* Export Trigger */}
            <button
              type="button"
              disabled={!analysis || isBusy}
              onClick={() => onExport(exportFormat, onlyVisible)}
              className="w-full py-2.5 px-4 rounded-md bg-sky-500 hover:bg-sky-400 text-[#0B1117] text-xs font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>Скачать {exportFormat.toUpperCase()}</span>
            </button>

            {/* Last Export Verification Card */}
            {lastExport && (
              <div className="bg-[#1C1F26] border border-emerald-500/30 rounded-md p-3 space-y-2.5">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-[#E6EAF0] truncate">
                      {lastExport.fileName}
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-[#9AA3B2] mt-0.5">
                      {formatByteSize(lastExport.sizeBytes)} ·{' '}
                      {lastExport.verifiedHeader ? 'Целостность проверена' : 'Готово'}
                    </div>
                  </div>
                </div>

                {(lastExport.format === 'glb' || lastExport.format === 'gltf') && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => onReloadExportedBlob(lastExport)}
                    className="w-full py-1.5 px-2.5 rounded bg-[#232833] hover:bg-[#2D3443] text-xs font-medium text-sky-200 flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                    <span>Перезагрузить экспорт для проверки</span>
                  </button>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
