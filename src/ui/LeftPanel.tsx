import { useState } from 'react';
import {
  Bone,
  Box,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  FolderOpen,
  FolderUp,
  Layers,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { formatByteSize } from '../loaders/fileValidation';
import type { ModelAnalysis, SceneNodeInfo } from './types';

interface LeftPanelProps {
  analysis: ModelAnalysis | null;
  selectedNodeUuid: string | null;
  hiddenNodeUuids: Set<string>;
  isBusy: boolean;
  onOpenFilePicker: () => void;
  onOpenFolderPicker: () => void;
  onClearModel: () => void;
  onSelectNode: (uuid: string | null) => void;
  onFocusNode: (uuid: string) => void;
  onToggleNodeVisibility: (uuid: string) => void;
  onCloseMobile?: () => void;
}

interface TreeNodeProps {
  node: SceneNodeInfo;
  depth: number;
  selectedNodeUuid: string | null;
  hiddenNodeUuids: Set<string>;
  onSelectNode: (uuid: string) => void;
  onFocusNode: (uuid: string) => void;
  onToggleVisibility: (uuid: string) => void;
}

function HierarchyTreeRow({
  node,
  depth,
  selectedNodeUuid,
  hiddenNodeUuids,
  onSelectNode,
  onFocusNode,
  onToggleVisibility,
}: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedNodeUuid === node.uuid;
  const isHidden = hiddenNodeUuids.has(node.uuid);

  return (
    <div>
      <div
        className={`group flex items-center gap-1 pr-2 py-1 text-xs rounded transition-colors ${
          isSelected
            ? 'bg-sky-500/15 text-sky-200'
            : 'text-[#C8D0DC] hover:bg-[#1E222B]'
        }`}
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? `Свернуть ${node.name}` : `Развернуть ${node.name}`}
            className="w-4 h-4 flex items-center justify-center text-[#7E8899] hover:text-[#E6EAF0] shrink-0"
          >
            {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
        ) : (
          <span className="w-4 h-4 shrink-0" aria-hidden="true" />
        )}

        <button
          type="button"
          onClick={() => onSelectNode(node.uuid)}
          onDoubleClick={() => onFocusNode(node.uuid)}
          className="flex-1 min-w-0 flex items-center gap-1.5 text-left py-0.5 focus:outline-none"
          title={`${node.name} (${node.type}) — двойной клик для фокусировки`}
        >
          {node.isBone ? (
            <Bone className="w-3.5 h-3.5 text-amber-400/80 shrink-0" aria-hidden="true" />
          ) : node.isMesh ? (
            <Box className="w-3.5 h-3.5 text-sky-400 shrink-0" aria-hidden="true" />
          ) : (
            <Layers className="w-3.5 h-3.5 text-[#7E8899] shrink-0" aria-hidden="true" />
          )}
          <span className={`truncate ${isHidden ? 'line-through text-[#667080]' : ''}`}>
            {node.name}
          </span>
        </button>

        <button
          type="button"
          onClick={() => onToggleVisibility(node.uuid)}
          aria-label={isHidden ? `Показать ${node.name}` : `Скрыть ${node.name}`}
          aria-pressed={!isHidden}
          className={`w-6 h-6 rounded flex items-center justify-center shrink-0 transition-colors ${
            isHidden
              ? 'text-[#667080] hover:text-[#E6EAF0]'
              : 'text-[#7E8899] opacity-60 group-hover:opacity-100 hover:text-[#E6EAF0]'
          }`}
        >
          {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>

      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <HierarchyTreeRow
              key={child.uuid}
              node={child}
              depth={depth + 1}
              selectedNodeUuid={selectedNodeUuid}
              hiddenNodeUuids={hiddenNodeUuids}
              onSelectNode={onSelectNode}
              onFocusNode={onFocusNode}
              onToggleVisibility={onToggleVisibility}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function LeftPanel({
  analysis,
  selectedNodeUuid,
  hiddenNodeUuids,
  isBusy,
  onOpenFilePicker,
  onOpenFolderPicker,
  onClearModel,
  onSelectNode,
  onFocusNode,
  onToggleNodeVisibility,
  onCloseMobile,
}: LeftPanelProps) {
  const [viewTab, setViewTab] = useState<'tree' | 'meshes'>('tree');

  return (
    <aside
      aria-label="Панель файлов и структуры сцены"
      className="h-full w-full bg-[#16181D] border-r border-[#262A34] flex flex-col min-h-0 select-none"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-[#262A34] flex items-center justify-between gap-2 shrink-0">
        <h2 className="text-xs font-semibold text-[#E6EAF0] tracking-wide">Сцена и файлы</h2>
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Закрыть панель сцены"
            className="lg:hidden h-7 w-7 rounded flex items-center justify-center text-[#9AA3B2] hover:bg-[#1E222B] hover:text-[#E6EAF0]"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* File Upload Actions */}
      <div className="p-3 border-b border-[#262A34] space-y-2 shrink-0">
        <button
          type="button"
          onClick={onOpenFilePicker}
          disabled={isBusy}
          className="w-full py-2 px-3 rounded-md bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-xs font-medium text-sky-200 flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          <span>{analysis ? 'Заменить модель' : 'Открыть GLB / glTF'}</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onOpenFolderPicker}
            disabled={isBusy}
            className="flex-1 py-1.5 px-2.5 rounded-md bg-[#1C1F26] hover:bg-[#232732] border border-[#2A2F3B] text-xs text-[#B6BFCF] flex items-center justify-center gap-1.5 whitespace-nowrap transition-colors disabled:opacity-50"
            title="Выбрать папку с .gltf, .bin и текстурами"
          >
            <FolderUp className="w-3.5 h-3.5 shrink-0 text-[#8C95A6]" aria-hidden="true" />
            <span>Папка glTF</span>
          </button>

          {analysis && (
            <button
              type="button"
              onClick={onClearModel}
              disabled={isBusy}
              aria-label="Очистить загруженную модель"
              title="Удалить модель из сцены"
              className="py-1.5 px-2.5 rounded-md bg-[#1C1F26] hover:bg-rose-500/15 border border-[#2A2F3B] hover:border-rose-500/30 text-xs text-[#9AA3B2] hover:text-rose-300 flex items-center justify-center transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {analysis && (
          <div className="pt-1 text-xs text-[#8C95A6] space-y-0.5">
            <div className="text-[#E6EAF0] font-medium truncate" title={analysis.fileName}>
              {analysis.fileName}
            </div>
            <div className="font-mono tabular-nums text-[11px] flex items-center gap-1.5">
              <span>{analysis.fileFormat}</span>
              <span aria-hidden="true">·</span>
              <span>{formatByteSize(analysis.sourceSizeBytes)}</span>
              {analysis.sourceFileCount > 1 && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{analysis.sourceFileCount} ф.</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Hierarchy / Mesh List Switcher */}
      <div className="px-3 pt-2.5 pb-2 border-b border-[#262A34] shrink-0">
        <div className="grid grid-cols-2 bg-[#121418] border border-[#262A34] rounded-md p-0.5">
          <button
            type="button"
            onClick={() => setViewTab('tree')}
            aria-pressed={viewTab === 'tree'}
            className={`py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              viewTab === 'tree'
                ? 'bg-[#262C38] text-[#E6EAF0]'
                : 'text-[#8C95A6] hover:text-[#E6EAF0]'
            }`}
          >
            Структура
          </button>
          <button
            type="button"
            onClick={() => setViewTab('meshes')}
            aria-pressed={viewTab === 'meshes'}
            className={`py-1 text-xs font-medium rounded transition-colors whitespace-nowrap ${
              viewTab === 'meshes'
                ? 'bg-[#262C38] text-[#E6EAF0]'
                : 'text-[#8C95A6] hover:text-[#E6EAF0]'
            }`}
          >
            Mesh ({analysis ? analysis.meshCount : 0})
          </button>
        </div>
      </div>

      {/* Object Tree / Mesh List Body */}
      <div className="flex-1 min-h-0 overflow-y-auto lab-scroll p-2">
        {!analysis ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-4 py-8 text-[#7E8899]">
            <FolderOpen className="w-7 h-7 mb-2.5 text-[#495264]" aria-hidden="true" />
            <p className="text-xs leading-relaxed">
              Загрузите локальный файл <span className="text-[#B6BFCF]">.glb</span> или{' '}
              <span className="text-[#B6BFCF]">.gltf</span>, чтобы увидеть иерархию и список объектов.
            </p>
          </div>
        ) : viewTab === 'tree' ? (
          <div className="space-y-0.5">
            {analysis.hierarchy.map((node) => (
              <HierarchyTreeRow
                key={node.uuid}
                node={node}
                depth={0}
                selectedNodeUuid={selectedNodeUuid}
                hiddenNodeUuids={hiddenNodeUuids}
                onSelectNode={(uuid) => onSelectNode(uuid === selectedNodeUuid ? null : uuid)}
                onFocusNode={onFocusNode}
                onToggleVisibility={onToggleNodeVisibility}
              />
            ))}
          </div>
        ) : analysis.meshes.length === 0 ? (
          <p className="text-xs text-[#7E8899] px-2 py-4">В сцене не найдено Mesh-объектов.</p>
        ) : (
          <div className="space-y-1">
            {analysis.meshes.map((mesh) => {
              const isSelected = selectedNodeUuid === mesh.uuid;
              const isHidden = hiddenNodeUuids.has(mesh.uuid);
              return (
                <div
                  key={mesh.uuid}
                  className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs transition-colors ${
                    isSelected
                      ? 'bg-sky-500/15 text-sky-200'
                      : 'text-[#C8D0DC] hover:bg-[#1E222B]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectNode(isSelected ? null : mesh.uuid)}
                    onDoubleClick={() => onFocusNode(mesh.uuid)}
                    className="flex-1 min-w-0 text-left"
                  >
                    <div className={`truncate font-medium ${isHidden ? 'line-through text-[#667080]' : ''}`}>
                      {mesh.name}
                    </div>
                    <div className="font-mono tabular-nums text-[11px] text-[#7E8899]">
                      {mesh.triangleCount.toLocaleString('ru-RU')} тр. ·{' '}
                      {mesh.vertexCount.toLocaleString('ru-RU')} верш.
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleNodeVisibility(mesh.uuid)}
                    aria-label={isHidden ? `Показать ${mesh.name}` : `Скрыть ${mesh.name}`}
                    className="w-7 h-7 rounded flex items-center justify-center text-[#7E8899] hover:text-[#E6EAF0] shrink-0"
                  >
                    {isHidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}
