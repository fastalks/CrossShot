import React, { useEffect, useState } from 'react';
import qrcode from 'qrcode';
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
  const [sessions, setSessions] = useState<any>({ android: null, ios: null });
  const [lastLabels, setLastLabels] = useState<{ android: string; ios: string }>({ android: '', ios: '' });
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

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

    // generate pairing QR once (used when no device connected)
    try {
      window.crossShotApi.getServerUrl().then((url) => {
        if (!url) return;
        qrcode
          .toDataURL(url)
          .then((data: string) => setQrDataUrl(data))
          .catch((e: any) => {
            console.error('生成 QR 失败', e);
            setQrDataUrl(null);
          });
      }).catch(() => {});
    } catch (_) {}

    return () => {
      try {
        if (unsub) unsub();
      } catch (_) {}
    };
  }, []);

  // Helper utilities for device label resolution
  const isUuid = (v: any) => typeof v === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(v);
  const getPlatformInfo = (platform: 'android' | 'ios') => {
    const payload = (sessions as any)[platform];
    if (payload && typeof payload === 'object') return payload.deviceInfo ?? payload;
    return null;
  };

  const buildLabelForPlatform = (platform: 'android' | 'ios') => {
    const generic = platform === 'android' ? '已连接设备' : '已连接 iOS';
    let info = getPlatformInfo(platform);
    if (!info && sessions.deviceInfo && typeof sessions.deviceInfo === 'object') {
      const globalPlatform = (sessions.deviceInfo.platform ?? '').toString().toLowerCase();
      if (globalPlatform === platform) info = sessions.deviceInfo;
    }

    if (info && typeof info === 'object') {
      if (info.name && !isUuid(info.name)) return info.name;
      if (platform === 'android' && info.model) return `${info.manufacturer ?? ''} ${info.model ?? ''}`.trim();
      if (platform === 'ios' && info.model) return info.model;
    }

    return generic;
  };

  // Keep last-seen meaningful labels to avoid flicker when transient/invalid payloads arrive
  useEffect(() => {
    try {
      const a = buildLabelForPlatform('android');
      const i = buildLabelForPlatform('ios');
      setLastLabels((prev) => ({
        android: a !== '已连接设备' ? a : prev.android,
        ios: i !== '已连接 iOS' ? i : prev.ios,
      }));
    } catch (_) {}
  }, [sessions]);

  const DeviceConnectionIndicator: React.FC = () => {
    const androidActive = !!sessions.android;
    if (!androidActive) return null;
    const title = 'Android 已连接';
    const color = '#2ecc71';
    const candidate = buildLabelForPlatform('android');
    const deviceLabel = candidate === '已连接设备' ? (lastLabels.android || candidate) : candidate;

    return (
      <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: 6, background: color, boxShadow: '0 0 6px rgba(46, 204, 113, 0.6)' }} />
        <div style={{ fontSize: 12, color: '#ffffff', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {deviceLabel}
        </div>
      </div>
    );
  };

  const IOSConnectionIndicator: React.FC = () => {
    const iosActive = !!sessions.ios;
    if (!iosActive) return null;
    const title = 'iOS 已连接';
    const color = '#2ecc71';
    const candidate = buildLabelForPlatform('ios');
    const deviceLabel = candidate === '已连接 iOS' ? (lastLabels.ios || candidate) : candidate;
    return (
      <div title={title} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 10, height: 10, borderRadius: 6, background: color, boxShadow: '0 0 6px rgba(46, 204, 113, 0.6)' }} />
        <div style={{ fontSize: 12, color: '#ffffff', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
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
              {summary.platform === 'android' && sessions.android ? (
                <span className="device-status-card__icon">{platformEmoji[summary.platform]}</span>
              ) : null}
              {summary.platform === 'ios' && sessions.ios ? (
                <span className="device-status-card__icon">{platformEmoji[summary.platform]}</span>
              ) : null}
              <div>
                <strong>{platformLabel[summary.platform]}</strong>
              </div>

              {/* show connection indicator when connected, otherwise show QR pairing hint */}
              {summary.platform === 'android' && (
                <div style={{ marginLeft: 12 }}>
                  {sessions.android ? (
                    <DeviceConnectionIndicator />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="pair-qr-android" style={{ width: 84, height: 84, borderRadius: 6, background: '#fff' }} />
                      ) : (
                        <div style={{ width: 84, height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f8', borderRadius: 6, color: '#7f8c8d' }}>QR</div>
                      )}
                    </div>
                  )}
                </div>
              )}
              {summary.platform === 'ios' && (
                <div style={{ marginLeft: 12 }}>
                  {sessions.ios ? (
                    <IOSConnectionIndicator />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {qrDataUrl ? (
                        <img src={qrDataUrl} alt="pair-qr-ios" style={{ width: 84, height: 84, borderRadius: 6, background: '#fff' }} />
                      ) : (
                        <div style={{ width: 84, height: 84, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f6f8', borderRadius: 6, color: '#7f8c8d' }}>QR</div>
                      )}
                    </div>
                  )}
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
      {/* QR modal removed; QR shown inline when no device connected */}
    </div>
  );
};

export default ActionPanel;

// QR modal removed; QR is shown inline in the panel when no device connected
