import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import type { ScreenshotMeta } from '../shared/types';
import Header from './components/Header';
import ScreenshotList from './components/ScreenshotList';
import CompareView, { type Annotation, type CompareViewHandle } from './components/CompareView';

const createAnnotationId = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2, 10);
};

const App: React.FC = () => {
  const [screenshots, setScreenshots] = useState<ScreenshotMeta[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const workspaceRef = useRef<CompareViewHandle | null>(null);

  const selectedScreenshots = useMemo(
    () => screenshots.filter((item: ScreenshotMeta) => selectedIds.includes(item.id)),
    [screenshots, selectedIds],
  );

  useEffect(() => {
    window.crossShotApi
      .getScreenshots()
      .then(setScreenshots)
      .catch((error) => console.error('Failed to load screenshots:', error));

    const unsubscribe = window.crossShotApi.onNewScreenshot((latest) => {
      setScreenshots(latest);
      setSelectedIds((previous: string[]) =>
        previous.filter((id) => latest.some((item) => item.id === id)),
      );
    });

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (selectedIds.length < 2) {
      setAnnotations([]);
    }
  }, [selectedIds]);

  const toggleSelection = (screenshot: ScreenshotMeta) => {
    setSelectedIds((previous: string[]) => {
      if (previous.includes(screenshot.id)) {
        return previous.filter((id) => id !== screenshot.id);
      }
      if (previous.length >= 2) {
        return [previous[1], screenshot.id];
      }
      return [...previous, screenshot.id];
    });
  };

  const handleDelete = async (id: string) => {
    try {
      const deleted = await window.crossShotApi.deleteScreenshot(id);
      if (deleted) {
        setScreenshots((previous: ScreenshotMeta[]) => previous.filter((item) => item.id !== id));
        setSelectedIds((previous: string[]) => previous.filter((selectedId) => selectedId !== id));
        setAnnotations((previous) => previous.filter((annotation) => annotation.id !== id));
      }
    } catch (error) {
      console.error('Failed to delete screenshot:', error);
      window.alert('删除截图时出现错误');
    }
  };

  const handleCreateAnnotation = (payload: Omit<Annotation, 'id'>) => {
    setAnnotations((previous) => [...previous, { ...payload, id: createAnnotationId() }]);
  };

  const handleUpdateAnnotation = (id: string, updates: Partial<Annotation>) => {
    setAnnotations((previous) => previous.map((annotation) => (annotation.id === id ? { ...annotation, ...updates } : annotation)));
  };

  const handleDeleteAnnotation = (id: string) => {
    setAnnotations((previous) => previous.filter((annotation) => annotation.id !== id));
  };

  const handleClearAnnotations = () => {
    setAnnotations([]);
  };

  const handleExportComposite = async () => {
    if (!workspaceRef.current) {
      return;
    }
    try {
      await workspaceRef.current.exportComposite();
    } catch (error) {
      console.error('Failed to export composite image:', error);
      window.alert('导出合成图时出现问题，请稍后重试。');
    }
  };

  return (
    <div className="app">
      <Header
        total={screenshots.length}
        selectedCount={selectedIds.length}
        canExport={selectedScreenshots.length === 2}
        onExport={handleExportComposite}
        onClearAnnotations={handleClearAnnotations}
      />
      <div className="workspace">
        <aside className="workspace-sidebar">
          <ScreenshotList
            screenshots={screenshots}
            selectedIds={selectedIds}
            onToggleSelection={toggleSelection}
            onDelete={handleDelete}
          />
        </aside>
        <section className="workspace-main">
          <CompareView
            ref={workspaceRef}
            screenshots={selectedScreenshots}
            annotations={annotations}
            onCreateAnnotation={handleCreateAnnotation}
            onUpdateAnnotation={handleUpdateAnnotation}
            onDeleteAnnotation={handleDeleteAnnotation}
          />
        </section>
      </div>
    </div>
  );
};

export default App;
