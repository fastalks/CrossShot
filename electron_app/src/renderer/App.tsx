import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';
import type { ScreenshotMeta } from '../shared/types';
import Header from './components/Header';
import ActionPanel from './components/ActionPanel';
import StitchStudio, { type StitchStudioHandle } from './components/StitchStudio';
import FloatingDeviceIcon from './components/FloatingDeviceIcon';
type DevicePlatform = 'android' | 'ios';

const parseDeviceInfo = (raw: any): { name: string; platform: DevicePlatform } => {
  const resolveLabelFromRecord = (record: Record<string, unknown>): string => {
    const candidates = ['name', 'model', 'device', 'brand', 'manufacturer', 'osVersion']
      .map((key) => record[key])
      .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      .map((value) => value.trim());
    return candidates[0] ?? '未知设备';
  };

  if (!raw) return { name: '未知设备', platform: 'android' };

  // If object, prefer explicit fields
  if (typeof raw === 'object') {
    const obj = raw as Record<string, any>;
    const name = resolveLabelFromRecord(obj);
    const plat = (obj.platform || obj.os || '').toString().toLowerCase();
    const platform: DevicePlatform = plat.includes('ios') || plat.includes('iphone') || plat.includes('ipad') || plat.includes('apple') ? 'ios' : 'android';
    return { name: name || '未知设备', platform };
  }

  const trimmed = String(raw).trim();
  if (!trimmed) return { name: '未知设备', platform: 'android' };

  // try parse JSON string
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) {
        const name = resolveLabelFromRecord(parsed as Record<string, unknown>);
        const plat = JSON.stringify(parsed).toLowerCase();
        const platform: DevicePlatform = plat.includes('ios') || plat.includes('iphone') || plat.includes('ipad') || plat.includes('apple') ? 'ios' : 'android';
        return { name: name || '未知设备', platform };
      }
    } catch (_) {
      // fallthrough
    }
  }

  const platform: DevicePlatform = trimmed.toLowerCase().includes('ios') || trimmed.toLowerCase().includes('iphone') || trimmed.toLowerCase().includes('ipad') || trimmed.toLowerCase().includes('apple') ? 'ios' : 'android';
  return { name: trimmed || '未知设备', platform };
};

const toTimestamp = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const App: React.FC = () => {
  const [screenshots, setScreenshots] = useState<ScreenshotMeta[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const stitcherRef = useRef<StitchStudioHandle | null>(null);

  const selectedScreenshots = useMemo(
    () => screenshots.filter((item: ScreenshotMeta) => selectedIds.includes(item.id)),
    [screenshots, selectedIds],
  );

  const platformSummaries = useMemo(() => {
    const summaries: Record<DevicePlatform, { platform: DevicePlatform; deviceCount: number; latestDevices: Array<{ id: string; name: string; timestamp: string }> }> = {
      android: { platform: 'android', deviceCount: 0, latestDevices: [] },
      ios: { platform: 'ios', deviceCount: 0, latestDevices: [] },
    };
    const seen: Record<DevicePlatform, Set<string>> = {
      android: new Set<string>(),
      ios: new Set<string>(),
    };

    const sorted = [...screenshots].sort((a, b) => toTimestamp(b.timestamp) - toTimestamp(a.timestamp));
    sorted.forEach((shot) => {
      const info = parseDeviceInfo(shot.deviceInfo);
      const summary = summaries[info.platform];
      const alreadySeen = seen[info.platform];
      if (!alreadySeen.has(info.name)) {
        alreadySeen.add(info.name);
        summary.latestDevices.push({ id: shot.id, name: info.name, timestamp: shot.timestamp });
      }
    });

    summaries.android.deviceCount = seen.android.size;
    summaries.ios.deviceCount = seen.ios.size;

    return Object.values(summaries);
  }, [screenshots]);

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

  const toggleSelection = (screenshot: ScreenshotMeta) => {
    setSelectedIds((previous: string[]) =>
      previous.includes(screenshot.id)
        ? previous.filter((id) => id !== screenshot.id)
        : [...previous, screenshot.id],
    );
  };

  const handleDelete = async (id: string) => {
    try {
      const deleted = await window.crossShotApi.deleteScreenshot(id);
      if (deleted) {
        setScreenshots((previous: ScreenshotMeta[]) => previous.filter((item) => item.id !== id));
        setSelectedIds((previous: string[]) => previous.filter((selectedId) => selectedId !== id));
      }
    } catch (error) {
      console.error('Failed to delete screenshot:', error);
      window.alert('删除截图时出现错误');
    }
  };
  const handleExportComposite = async () => {
    if (!stitcherRef.current) {
      return;
    }
    try {
      await stitcherRef.current.exportComposite();
    } catch (error) {
      console.error('Failed to export composite image:', error);
      window.alert('导出合成图时出现问题，请稍后重试。');
    }
  };

  const handleCopyComposite = async () => {
    if (!stitcherRef.current) {
      return;
    }
    try {
      await stitcherRef.current.copyComposite();
      window.alert('合成图已复制到剪贴板');
    } catch (error) {
      console.error('Failed to copy composite:', error);
      window.alert('复制到剪贴板时出现问题，请稍后重试。');
    }
  };

  const handleRefreshDevices = () => {
    window.alert('设备状态已刷新');
  };

  return (
    <div className="app">
      <Header
        total={screenshots.length}
        selectedCount={selectedIds.length}
        canExport={selectedScreenshots.length > 0}
        onExport={handleExportComposite}
        onClearAnnotations={() => {
          setSelectedIds([]);
        }}
      />
      <div className="workspace">
        <main className="workspace-main">
          <StitchStudio
            ref={stitcherRef}
            screenshots={screenshots}
            selectedIds={selectedIds}
            onToggleSelection={toggleSelection}
            onDelete={handleDelete}
          />
        </main>
        <aside className="action-sidebar">
          <ActionPanel
            pairReady={selectedScreenshots.length > 0}
            onRefreshDevices={handleRefreshDevices}
            onSaveComposite={handleExportComposite}
            onCopyComposite={handleCopyComposite}
            platformSummaries={platformSummaries}
          />
        </aside>
      </div>
    </div>
  );
};

export default App;
