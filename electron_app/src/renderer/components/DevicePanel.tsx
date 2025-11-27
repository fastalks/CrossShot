import React, { useEffect, useMemo, useState } from 'react';
import './DevicePanel.css';

export type DevicePlatform = 'android' | 'ios';
export type DeviceStatus = 'online' | 'offline' | 'busy';
export type DeviceAction = 'details' | 'capture' | 'clear' | 'disconnect';

export interface DeviceInfo {
  id: string;
  name: string;
  brand: string;
  osVersion: string;
  platform: DevicePlatform;
  status: DeviceStatus;
  lastSeen?: string;
}

interface DevicePanelProps {
  devices: DeviceInfo[];
  selectedIds: string[];
  onSelectionChange: (deviceId: string, multi: boolean) => void;
  onAction: (deviceId: string, action: DeviceAction) => void;
}

interface ContextMenuState {
  x: number;
  y: number;
  device: DeviceInfo;
}

const platformLabels: Record<DevicePlatform, string> = {
  android: 'Android',
  ios: 'iOS',
};

const statusColors: Record<DeviceStatus, string> = {
  online: '#52c41a',
  busy: '#faad14',
  offline: '#f5222d',
};

const DevicePanel: React.FC<DevicePanelProps> = ({ devices, selectedIds, onSelectionChange, onAction }: DevicePanelProps) => {
  const [search, setSearch] = useState<string>('');
  const [expandedGroups, setExpandedGroups] = useState<Record<DevicePlatform, boolean>>({ android: true, ios: true });
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const keyword = search.trim().toLowerCase();

  const filteredDevices = useMemo(() => {
    if (!keyword) {
      return devices;
    }
    return devices.filter((device) => `${device.name} ${device.brand}`.toLowerCase().includes(keyword));
  }, [devices, keyword]);

  const groupedDevices = useMemo(() => ({
    android: filteredDevices.filter((device) => device.platform === 'android'),
    ios: filteredDevices.filter((device) => device.platform === 'ios'),
  }), [filteredDevices]);

  const stats = useMemo(() => ({
    total: devices.length,
    online: devices.filter((device) => device.status === 'online').length,
    android: devices.filter((device) => device.platform === 'android').length,
    ios: devices.filter((device) => device.platform === 'ios').length,
  }), [devices]);

  useEffect(() => {
    const handleGlobalClick = () => setContextMenu(null);
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setContextMenu(null);
      }
    };

    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, []);

  const toggleGroup = (platform: DevicePlatform) => {
    setExpandedGroups((previous) => ({ ...previous, [platform]: !previous[platform] }));
  };

  const handleContextMenu = (event: React.MouseEvent, device: DeviceInfo) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY, device });
  };

  const handleActionClick = (action: DeviceAction) => {
    if (contextMenu) {
      onAction(contextMenu.device.id, action);
      setContextMenu(null);
    }
  };

  const renderDevice = (device: DeviceInfo) => {
    const selected = selectedIds.includes(device.id);
    return (
      <button
        key={device.id}
        type="button"
        className={`device-panel__item${selected ? ' selected' : ''}`}
        onClick={(event) => onSelectionChange(device.id, event.metaKey || event.ctrlKey)}
        onContextMenu={(event) => handleContextMenu(event, device)}
      >
        <div className={`device-panel__avatar ${device.platform}`}>
          {device.platform === 'android' ? '🤖' : '🍏'}
        </div>
        <div className="device-panel__meta">
          <div className="device-panel__name">{device.name}</div>
          <div className="device-panel__meta-extra">
            <span>{device.osVersion}</span>
            {device.lastSeen && <span className="device-panel__last-seen">· {device.lastSeen}</span>}
          </div>
        </div>
        <div className="device-panel__status">
          <span className="status-dot" style={{ backgroundColor: statusColors[device.status] }} />
        </div>
      </button>
    );
  };

  const renderGroup = (platform: DevicePlatform) => {
    const items = groupedDevices[platform];
    return (
      <div className="device-panel__group" key={platform}>
        <div className="device-panel__group-header">
          <button type="button" onClick={() => toggleGroup(platform)} className="device-panel__group-toggle" aria-expanded={expandedGroups[platform]}>
            <span className={`chevron${expandedGroups[platform] ? ' open' : ''}`} aria-hidden />
            <span>{platformLabels[platform]}</span>
            <span className="device-panel__badge">{items.length}</span>
          </button>
        </div>
        {expandedGroups[platform] && (
          <div className="device-panel__group-body">
            {items.length === 0 ? (
              <div className="device-panel__empty">暂无匹配设备</div>
            ) : (
              items.map(renderDevice)
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="device-panel">
      <div className="device-panel__search">
        <input
          type="search"
          placeholder="搜索设备 / 品牌"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="device-panel__list">
        {(['android', 'ios'] as DevicePlatform[]).map(renderGroup)}
      </div>
      <div className="device-panel__footer">
        <div>
          <span className="label">总数</span>
          <strong>{stats.total}</strong>
        </div>
        <div>
          <span className="label">在线</span>
          <strong>{stats.online}</strong>
        </div>
        <div>
          <span className="label">Android</span>
          <strong>{stats.android}</strong>
        </div>
        <div>
          <span className="label">iOS</span>
          <strong>{stats.ios}</strong>
        </div>
      </div>
      {contextMenu && (
        <div className="device-panel__context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
          <button type="button" onClick={() => handleActionClick('details')}>查看详情</button>
          <button type="button" onClick={() => handleActionClick('capture')}>截图测试</button>
          <button type="button" onClick={() => handleActionClick('clear')}>清除数据</button>
          <button type="button" onClick={() => handleActionClick('disconnect')}>断开连接</button>
        </div>
      )}
    </div>
  );
};

export default DevicePanel;
