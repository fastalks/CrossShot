import React, { useEffect, useState } from 'react';
import type { KeyboardEvent, SyntheticEvent } from 'react';
import './ScreenshotList.css';
import type { ScreenshotMeta } from '../../shared/types';

interface ScreenshotListProps {
  screenshots: ScreenshotMeta[];
  selectedIds: string[];
  onToggleSelection: (screenshot: ScreenshotMeta) => void;
  onDelete: (id: string) => void;
}

const formatDate = (timestamp: string): string => new Date(timestamp).toLocaleString('zh-CN');

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
};

const FALLBACK_IMAGE =
  'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%23ddd" width="200" height="200"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3E图片加载失败%3C/text%3E%3C/svg%3E';

interface ScreenshotCardProps {
  screenshot: ScreenshotMeta;
  isSelected: boolean;
  onToggleSelection: (screenshot: ScreenshotMeta) => void;
  onDelete: (id: string) => void;
}

const ScreenshotCard: React.FC<ScreenshotCardProps> = ({ screenshot, isSelected, onToggleSelection, onDelete }) => {
  const [imageSrc, setImageSrc] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    setImageSrc('');

    window.crossShotApi
      .loadScreenshotData(screenshot.path)
      .then((dataUrl) => {
        if (!cancelled) {
          setImageSrc(dataUrl);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setImageSrc(FALLBACK_IMAGE);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [screenshot.path]);

  const handleError = (event: SyntheticEvent<HTMLImageElement, Event>) => {
    event.currentTarget.src = FALLBACK_IMAGE;
  };

  return (
    <div
      className={`screenshot-card${isSelected ? ' selected' : ''}`}
      onClick={() => onToggleSelection(screenshot)}
      role="button"
      tabIndex={0}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          onToggleSelection(screenshot);
        }
      }}
    >
      <div className="screenshot-image">
        <img src={imageSrc || FALLBACK_IMAGE} alt={screenshot.filename} onError={handleError} />
        {isSelected && <div className="selected-badge">✓</div>}
      </div>

      <div className="screenshot-info">
        <div className="info-row">
          <span className="label">设备</span>
          <span className="value">{screenshot.deviceInfo}</span>
        </div>
        <div className="info-row">
          <span className="label">时间</span>
          <span className="value">{formatDate(screenshot.timestamp)}</span>
        </div>
        <div className="info-row">
          <span className="label">大小</span>
          <span className="value">{formatSize(screenshot.size)}</span>
        </div>
      </div>

      <div className="screenshot-actions">
        <button
          type="button"
          className="delete-button danger"
          onClick={(event) => {
            event.stopPropagation();
            if (window.confirm('确定要删除这张截图吗?')) {
              onDelete(screenshot.id);
            }
          }}
        >
          删除
        </button>
      </div>
    </div>
  );
};

const ScreenshotList: React.FC<ScreenshotListProps> = ({ screenshots, selectedIds, onToggleSelection, onDelete }: ScreenshotListProps) => {
  return (
    <div className="screenshot-list">
      <div className="list-header">
        <span>截图队列</span>
        <span>{screenshots.length} 张</span>
      </div>

      {screenshots.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📱</div>
          <h2>暂无截图</h2>
          <p>请在移动端应用中捕获并上传截图</p>
        </div>
      ) : (
        <div className="grid">
          {screenshots.map((screenshot) => (
            <ScreenshotCard
              key={screenshot.id}
              screenshot={screenshot}
              isSelected={selectedIds.includes(screenshot.id)}
              onToggleSelection={onToggleSelection}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ScreenshotList;
