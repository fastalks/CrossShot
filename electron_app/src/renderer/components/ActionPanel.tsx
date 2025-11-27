import React, { useEffect, useState } from 'react';
import type { DevicePlatform } from './DevicePanel';
import './ActionPanel.css';

interface ActionPanelProps {
  pairReady: boolean;
  onRefreshDevices: () => void;
  onSaveComposite: () => void;
  onCopyComposite: () => void;
  platformSummaries: PlatformSummary[];
}

interface PlatformSummary {
  platform: DevicePlatform;
  deviceCount: number;
  latestDevices: Array<{ id: string; name: string; timestamp: string }>;
}

const ActionPanel: React.FC<ActionPanelProps> = ({
  pairReady,
  onRefreshDevices,
  onSaveComposite,
  onCopyComposite,
  platformSummaries,
}: ActionPanelProps) => {
  const [sessions, setSessions] = useState<{ android: string | null; ios: string | null }>({ android: null, ios: null });

  useEffect(() => {
    let unsub: (() => void) | null = null;
    try {
      // subscribe to session updates
      unsub = window.crossShotApi.onDeviceSessionUpdate((s) => setSessions(s));
    } catch (e) {
      console.warn('onDeviceSessionUpdate unavailable', e);
    }

    // try to fetch current sessions if API available
    try {
      window.crossShotApi.getDeviceSessions().then((s) => setSessions(s)).catch(() => {});
    } catch (_) {}

    return () => {
      try {
        if (unsub) unsub();
      } catch (_) {}
    };
  }, []);

  const DeviceConnectionIndicator: React.FC = () => {
    const androidActive = !!sessions.android;
    const title = androidActive ? 'Android 已连接' : 'Android 未连接';
    const color = androidActive ? '#2ecc71' : '#bdc3c7';
    const deviceLabel = androidActive ? sessions.android ?? '已连接设备' : '未连接';
    return (
      <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: 6, background: color, boxShadow: androidActive ? '0 0 6px rgba(46, 204, 113, 0.6)' : 'none' }} />
        <div style={{ fontSize: 12, color: androidActive ? '#ffffff' : '#7f8c8d', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {deviceLabel}
        </div>
      </div>
    );
  };
  const platformLabel: Record<DevicePlatform, string> = {
    android: 'Android',
    ios: 'iOS',
  };

  const platformEmoji: Record<DevicePlatform, string> = {
    android: '🤖',
    ios: '🍎',
  };

  return (
    <div className="action-panel">
      <div className="device-status-grid">
        {platformSummaries.map((summary) => (
          <div key={summary.platform} className={`device-status-card platform-${summary.platform}`}>
            <div className="device-status-card__head">
              <span className="device-status-card__icon">{platformEmoji[summary.platform]}</span>
              <div>
                <strong>{platformLabel[summary.platform]}</strong>
              </div>
              {/* Online indicator for Android */}
              {summary.platform === 'android' && (
                <div style={{ marginLeft: 12 }}>
                  <DeviceConnectionIndicator />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      <header>
        <div>
          <h3>操作控制</h3>
          <p>设备实时监听已启用</p>
        </div>
        <span className="status-pill online">自动监听中</span>
      </header>

      {/* <div className="action-panel__section">
        <button type="button" className="ghost" onClick={onRefreshDevices}>
          🔄 刷新设备
        </button>
      </div> */}

      <div className="action-panel__section">
        <button type="button" className="ghost" onClick={onSaveComposite} disabled={!pairReady}>
          📁 保存合并图
        </button>
        <button type="button" className="ghost" onClick={onCopyComposite} disabled={!pairReady}>
          📋 复制到剪贴板
        </button>
      </div>

      <div className="action-panel__section">
        <button type="button" className="secondary" onClick={() => window.alert('设置面板开发中')}>
          ⚙️ 设置
        </button>
        <button
          type="button"
          className="danger"
          onClick={async () => {
            const ok = window.confirm('确定要删除所有接收的截图并清空元数据吗？此操作不可撤销。');
            if (!ok) return;
            try {
              const res = await window.crossShotApi.clearAllScreenshots();
              if (res && res.success) {
                window.alert('已清理所有截图');
              } else {
                window.alert('清理失败: ' + (res?.error ?? '未知错误'));
              }
            } catch (e) {
              console.error('clearAllScreenshots failed', e);
              window.alert('清理时发生错误，请查看控制台');
            }
          }}
        >
          🧹 一键清理
        </button>
      </div>

      <footer>
        <small>提示：设备实时同步中</small>
      </footer>
    </div>
  );
};

export default ActionPanel;
