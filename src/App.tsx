import { useCallback, useEffect, useRef, useState } from 'react';
import { exportModelToFormat } from './exporters/modelExporter';
import { extractFilesFromDataTransfer, loadLocalModelFiles } from './loaders/modelLoader';
import { BottomBar } from './ui/BottomBar';
import { LeftPanel } from './ui/LeftPanel';
import { RightPanel } from './ui/RightPanel';
import { TopToolbar } from './ui/TopToolbar';
import type {
  CameraMode,
  ExportFormat,
  ExportResultInfo,
  InspectorTab,
  LightingPreset,
  LoadProgressState,
  ModelAnalysis,
  RenderMode,
  ViewerSettings,
} from './ui/types';
import { ViewportOverlay } from './ui/ViewportOverlay';
import { analyzeLoadedModel } from './viewer/modelAnalyzer';
import { SceneViewer } from './viewer/SceneViewer';

function isDesktopWidth(): boolean {
  if (typeof window === 'undefined') return true;
  return window.innerWidth >= 1024;
}

export default function App() {
  const appRootRef = useRef<HTMLDivElement | null>(null);
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<SceneViewer | null>(null);
  const revokeResourcesRef = useRef<(() => void) | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  // Track responsive layout cleanly so only one LeftPanel and RightPanel mount in the DOM
  const [isDesktop, setIsDesktop] = useState<boolean>(() => isDesktopWidth());
  // Panels start open on desktop and closed on mobile/Android so the 3D viewport is never covered
  const [leftOpen, setLeftOpen] = useState<boolean>(() => isDesktopWidth());
  const [rightOpen, setRightOpen] = useState<boolean>(() => isDesktopWidth());
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('geometry');

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(min-width: 1024px)');
    const handleChange = (e: MediaQueryListEvent) => {
      setIsDesktop(e.matches);
      if (!e.matches) {
        setLeftOpen(false);
        setRightOpen(false);
      } else {
        setLeftOpen(true);
        setRightOpen(true);
      }
    };
    mq.addEventListener('change', handleChange);
    return () => mq.removeEventListener('change', handleChange);
  }, []);

  const [analysis, setAnalysis] = useState<ModelAnalysis | null>(null);
  const [selectedNodeUuid, setSelectedNodeUuid] = useState<string | null>(null);
  const [hiddenNodeUuids, setHiddenNodeUuids] = useState<Set<string>>(() => new Set());
  const [lastExport, setLastExport] = useState<ExportResultInfo | null>(null);

  const [isDragging, setIsDragging] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [contextLost, setContextLost] = useState(false);
  const [progress, setProgress] = useState<LoadProgressState>({
    active: false,
    percent: 0,
    label: '',
  });

  const [isAnimationPlaying, setIsAnimationPlaying] = useState(false);
  const [activeAnimationIndex, setActiveAnimationIndex] = useState(0);

  const [settings, setSettings] = useState<ViewerSettings>({
    cameraMode: 'perspective',
    renderMode: 'solid',
    lightingPreset: 'studio',
    showGrid: true,
    showAxes: true,
    isFullscreen: false,
  });

  // Initialize Three.js SceneViewer once on mount
  useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const viewer = new SceneViewer(mount, {
      onNodeSelected: (uuid) => setSelectedNodeUuid(uuid),
      onContextLost: (lost) => setContextLost(lost),
    });
    viewerRef.current = viewer;

    const handleFullscreenChange = () => {
      setSettings((prev) => ({
        ...prev,
        isFullscreen: Boolean(document.fullscreenElement),
      }));
      viewer.handleResize();
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (revokeResourcesRef.current) {
        revokeResourcesRef.current();
        revokeResourcesRef.current = null;
      }
      viewer.dispose();
      viewerRef.current = null;
    };
  }, []);

  // Trigger viewport resize cleanly when sidebars open/close on desktop
  useEffect(() => {
    const id = window.setTimeout(() => {
      viewerRef.current?.handleResize();
    }, 30);
    return () => window.clearTimeout(id);
  }, [leftOpen, rightOpen]);

  const loadFiles = useCallback(async (files: File[]) => {
    if (!files || files.length === 0) return;
    const viewer = viewerRef.current;
    if (!viewer) return;

    setErrorMessage(null);
    setProgress({ active: true, percent: 5, label: 'Подготовка файлов...' });

    try {
      const result = await loadLocalModelFiles(files, (percent, label) => {
        setProgress({ active: true, percent, label });
      });

      // Revoke previous model's temporary Blob URLs after new model loads safely
      if (revokeResourcesRef.current) {
        revokeResourcesRef.current();
      }
      revokeResourcesRef.current = result.revokeResources;

      viewer.setModel(result.gltf.scene, result.gltf.animations);

      const analyzed = analyzeLoadedModel({
        root: result.gltf.scene,
        animations: result.gltf.animations,
        fileName: result.fileName,
        fileFormat: result.fileFormat,
        sourceFileCount: result.sourceFileCount,
        sourceSizeBytes: result.sourceSizeBytes,
        generator: result.generator,
        gltfVersion: result.gltfVersion,
        generateTexturePreviews: true,
      });

      setAnalysis(analyzed);
      setSelectedNodeUuid(null);
      setHiddenNodeUuids(new Set());
      setIsAnimationPlaying(false);
      setActiveAnimationIndex(0);
      setLastExport(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить 3D-модель.';
      setErrorMessage(message);
    } finally {
      setProgress({ active: false, percent: 0, label: '' });
    }
  }, []);

  const handleFileInputChange = useCallback(
    (ev: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = ev.target.files;
      if (fileList && fileList.length > 0) {
        void loadFiles(Array.from(fileList));
      }
      // Reset input value so re-selecting the exact same file works
      ev.target.value = '';
    },
    [loadFiles],
  );

  const handleOpenFilePicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleOpenFolderPicker = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  const handleClearModel = useCallback(() => {
    viewerRef.current?.clearModel();
    if (revokeResourcesRef.current) {
      revokeResourcesRef.current();
      revokeResourcesRef.current = null;
    }
    setAnalysis(null);
    setSelectedNodeUuid(null);
    setHiddenNodeUuids(new Set());
    setIsAnimationPlaying(false);
    setActiveAnimationIndex(0);
    setLastExport(null);
    setErrorMessage(null);
  }, []);

  // Drag & Drop handlers on entire workspace
  const handleDragEnter = useCallback((ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    dragDepthRef.current += 1;
    setIsDragging(true);
  }, []);

  const handleDragOver = useCallback((ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((ev: React.DragEvent) => {
    ev.preventDefault();
    ev.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback(
    async (ev: React.DragEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      dragDepthRef.current = 0;
      setIsDragging(false);

      if (!ev.dataTransfer) return;
      try {
        const files = await extractFilesFromDataTransfer(ev.dataTransfer);
        if (files.length > 0) {
          void loadFiles(files);
        }
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : 'Ошибка при чтении перетащенных файлов.',
        );
      }
    },
    [loadFiles],
  );

  // Viewer controls
  const handleCameraModeChange = useCallback((mode: CameraMode) => {
    viewerRef.current?.setCameraMode(mode);
    setSettings((prev) => ({ ...prev, cameraMode: mode }));
  }, []);

  const handleRenderModeChange = useCallback((mode: RenderMode) => {
    viewerRef.current?.setRenderMode(mode);
    setSettings((prev) => ({ ...prev, renderMode: mode }));
  }, []);

  const handleLightingChange = useCallback((preset: LightingPreset) => {
    viewerRef.current?.setLightingPreset(preset);
    setSettings((prev) => ({ ...prev, lightingPreset: preset }));
  }, []);

  const handleToggleGrid = useCallback(() => {
    setSettings((prev) => {
      const next = !prev.showGrid;
      viewerRef.current?.setShowGrid(next);
      return { ...prev, showGrid: next };
    });
  }, []);

  const handleToggleAxes = useCallback(() => {
    setSettings((prev) => {
      const next = !prev.showAxes;
      viewerRef.current?.setShowAxes(next);
      return { ...prev, showAxes: next };
    });
  }, []);

  const handleCenterModel = useCallback(() => {
    viewerRef.current?.centerModel();
    viewerRef.current?.fitCameraToModel();
  }, []);

  const handleFitCamera = useCallback(() => {
    viewerRef.current?.fitCameraToModel();
  }, []);

  const handleResetCamera = useCallback(() => {
    viewerRef.current?.resetCamera();
  }, []);

  const handleToggleFullscreen = useCallback(async () => {
    const target = appRootRef.current || document.documentElement;
    try {
      if (!document.fullscreenElement) {
        await target.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      setErrorMessage('Полноэкранный режим недоступен в текущем окне браузера.');
    }
  }, []);

  // Scene hierarchy actions
  const handleSelectNode = useCallback((uuid: string | null) => {
    setSelectedNodeUuid(uuid);
    viewerRef.current?.selectNodeByUuid(uuid);
  }, []);

  const handleFocusNode = useCallback((uuid: string) => {
    setSelectedNodeUuid(uuid);
    viewerRef.current?.focusNodeByUuid(uuid);
  }, []);

  const handleToggleNodeVisibility = useCallback((uuid: string) => {
    setHiddenNodeUuids((prev) => {
      const next = new Set(prev);
      const willBeVisible = next.has(uuid);
      if (willBeVisible) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      viewerRef.current?.setNodeVisibility(uuid, willBeVisible);
      return next;
    });
  }, []);

  // Animation controls
  const handlePlayAnimation = useCallback((index: number) => {
    setActiveAnimationIndex(index);
    setIsAnimationPlaying(true);
    viewerRef.current?.playAnimation(index);
  }, []);

  const handlePauseAnimation = useCallback(() => {
    setIsAnimationPlaying(false);
    viewerRef.current?.pauseAnimation();
  }, []);

  // Real Export
  const handleExport = useCallback(
    async (format: ExportFormat, onlyVisible = false) => {
      const viewer = viewerRef.current;
      if (!viewer || !analysis) return;

      const { root, animations, restoreAfterExport } = viewer.getLoadedModelForExport();
      if (!root) return;

      setErrorMessage(null);
      setProgress({ active: true, percent: 10, label: `Экспорт ${format.toUpperCase()}...` });

      try {
        const result = await exportModelToFormat({
          root,
          animations,
          baseFileName: analysis.fileName,
          format,
          onlyVisible,
          onProgress: (percent, label) => {
            setProgress({ active: true, percent, label });
          },
        });
        setLastExport(result);
        setInspectorTab('export');
      } catch (err) {
        const message =
          err instanceof Error ? err.message : `Ошибка при экспорте в формат ${format.toUpperCase()}.`;
        setErrorMessage(message);
      } finally {
        restoreAfterExport();
        setProgress({ active: false, percent: 0, label: '' });
      }
    },
    [analysis],
  );

  const handleReloadExportedBlob = useCallback(
    (exported: ExportResultInfo) => {
      const file = new File([exported.blob], exported.fileName, {
        type: exported.blob.type || 'model/gltf-binary',
      });
      void loadFiles([file]);
    },
    [loadFiles],
  );

  const handleToggleLeft = useCallback(() => {
    setLeftOpen((prev) => {
      const next = !prev;
      if (next && !isDesktopWidth()) {
        setRightOpen(false);
      }
      return next;
    });
  }, []);

  const handleToggleRight = useCallback(() => {
    setRightOpen((prev) => {
      const next = !prev;
      if (next && !isDesktopWidth()) {
        setLeftOpen(false);
      }
      return next;
    });
  }, []);

  return (
    <div
      ref={appRootRef}
      data-model-loaded={analysis ? 'true' : 'false'}
      data-mesh-count={analysis ? String(analysis.meshCount) : '0'}
      data-triangle-count={analysis ? String(analysis.triangleCount) : '0'}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="h-screen w-screen overflow-hidden bg-[#121418] text-[#E6EAF0] flex flex-col"
    >
      {/* Hidden Real File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".glb,.gltf,.bin,.png,.jpg,.jpeg,.webp,.ktx2,.bmp,.tga"
        onChange={handleFileInputChange}
        data-testid="model-file-input"
        aria-label="Загрузить файлы 3D-модели"
        className="hidden"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        webkitdirectory=""
        onChange={handleFileInputChange}
        aria-label="Загрузить папку с файлами glTF"
        className="hidden"
      />

      {/* Top Bar */}
      <TopToolbar
        settings={settings}
        hasModel={Boolean(analysis)}
        isBusy={progress.active}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        onToggleLeft={handleToggleLeft}
        onToggleRight={handleToggleRight}
        onOpenFilePicker={handleOpenFilePicker}
        onQuickExportGlb={() => void handleExport('glb', false)}
        onCameraModeChange={handleCameraModeChange}
        onRenderModeChange={handleRenderModeChange}
        onLightingChange={handleLightingChange}
        onToggleGrid={handleToggleGrid}
        onToggleAxes={handleToggleAxes}
        onFitCamera={handleFitCamera}
        onResetCamera={handleResetCamera}
        onToggleFullscreen={() => void handleToggleFullscreen()}
      />

      {/* Workspace Area */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* Left Panel (Desktop docked sidebar OR Mobile slide-over drawer) */}
        {leftOpen && isDesktop && (
          <div className="w-68 xl:w-72 shrink-0 h-full min-h-0">
            <LeftPanel
              analysis={analysis}
              selectedNodeUuid={selectedNodeUuid}
              hiddenNodeUuids={hiddenNodeUuids}
              isBusy={progress.active}
              onOpenFilePicker={handleOpenFilePicker}
              onOpenFolderPicker={handleOpenFolderPicker}
              onClearModel={handleClearModel}
              onSelectNode={handleSelectNode}
              onFocusNode={handleFocusNode}
              onToggleNodeVisibility={handleToggleNodeVisibility}
            />
          </div>
        )}

        {leftOpen && !isDesktop && (
          <div className="fixed inset-x-0 top-12 bottom-8 z-30 flex">
            <div className="w-[82vw] max-w-xs h-full shadow-2xl">
              <LeftPanel
                analysis={analysis}
                selectedNodeUuid={selectedNodeUuid}
                hiddenNodeUuids={hiddenNodeUuids}
                isBusy={progress.active}
                onOpenFilePicker={() => {
                  setLeftOpen(false);
                  handleOpenFilePicker();
                }}
                onOpenFolderPicker={() => {
                  setLeftOpen(false);
                  handleOpenFolderPicker();
                }}
                onClearModel={handleClearModel}
                onSelectNode={handleSelectNode}
                onFocusNode={handleFocusNode}
                onToggleNodeVisibility={handleToggleNodeVisibility}
                onCloseMobile={() => setLeftOpen(false)}
              />
            </div>
            <button
              type="button"
              aria-label="Закрыть панель сцены"
              onClick={() => setLeftOpen(false)}
              className="flex-1 bg-black/55"
            />
          </div>
        )}

        {/* Central 3D WebGL Viewport */}
        <main className="flex-1 min-w-0 min-h-0 relative bg-[#121418]">
          <div
            ref={canvasMountRef}
            className="viewport-canvas-host absolute inset-0 w-full h-full"
          />
          <ViewportOverlay
            hasModel={Boolean(analysis)}
            isDragging={isDragging}
            progress={progress}
            errorMessage={errorMessage}
            contextLost={contextLost}
            onDismissError={() => setErrorMessage(null)}
            onOpenFilePicker={handleOpenFilePicker}
            onOpenFolderPicker={handleOpenFolderPicker}
          />
        </main>

        {/* Right Inspector Panel (Desktop docked sidebar OR Mobile slide-over drawer) */}
        {rightOpen && isDesktop && (
          <div className="w-76 xl:w-80 shrink-0 h-full min-h-0">
            <RightPanel
              analysis={analysis}
              settings={settings}
              activeTab={inspectorTab}
              isBusy={progress.active}
              isAnimationPlaying={isAnimationPlaying}
              activeAnimationIndex={activeAnimationIndex}
              lastExport={lastExport}
              onTabChange={setInspectorTab}
              onCameraModeChange={handleCameraModeChange}
              onRenderModeChange={handleRenderModeChange}
              onLightingChange={handleLightingChange}
              onToggleGrid={handleToggleGrid}
              onToggleAxes={handleToggleAxes}
              onCenterModel={handleCenterModel}
              onFitCamera={handleFitCamera}
              onResetCamera={handleResetCamera}
              onToggleFullscreen={() => void handleToggleFullscreen()}
              onPlayAnimation={handlePlayAnimation}
              onPauseAnimation={handlePauseAnimation}
              onExport={(fmt, onlyVis) => void handleExport(fmt, onlyVis)}
              onReloadExportedBlob={handleReloadExportedBlob}
            />
          </div>
        )}

        {rightOpen && !isDesktop && (
          <div className="fixed inset-x-0 top-12 bottom-8 z-30 flex justify-end">
            <button
              type="button"
              aria-label="Закрыть инспектор"
              onClick={() => setRightOpen(false)}
              className="flex-1 bg-black/55"
            />
            <div className="w-[84vw] max-w-xs h-full shadow-2xl">
              <RightPanel
                analysis={analysis}
                settings={settings}
                activeTab={inspectorTab}
                isBusy={progress.active}
                isAnimationPlaying={isAnimationPlaying}
                activeAnimationIndex={activeAnimationIndex}
                lastExport={lastExport}
                onTabChange={setInspectorTab}
                onCameraModeChange={handleCameraModeChange}
                onRenderModeChange={handleRenderModeChange}
                onLightingChange={handleLightingChange}
                onToggleGrid={handleToggleGrid}
                onToggleAxes={handleToggleAxes}
                onCenterModel={handleCenterModel}
                onFitCamera={handleFitCamera}
                onResetCamera={handleResetCamera}
                onToggleFullscreen={() => void handleToggleFullscreen()}
                onPlayAnimation={handlePlayAnimation}
                onPauseAnimation={handlePauseAnimation}
                onExport={(fmt, onlyVis) => void handleExport(fmt, onlyVis)}
                onReloadExportedBlob={handleReloadExportedBlob}
                onCloseMobile={() => setRightOpen(false)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Status Bar */}
      <BottomBar analysis={analysis} progress={progress} />
    </div>
  );
}
