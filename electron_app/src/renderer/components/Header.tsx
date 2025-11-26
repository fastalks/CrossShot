import React from 'react';
import './Header.css';

interface HeaderProps {
  total: number;
  selectedCount: number;
  canExport: boolean;
  onExport: () => void;
  onClearAnnotations: () => void;
}

const Header: React.FC<HeaderProps> = ({ total, selectedCount, canExport, onExport, onClearAnnotations }: HeaderProps) => {
  return (
    <header className="header">
      <div className="brand">
        <h1>CrossShot Studio</h1>
        <p>跨端截图 · 并排对比 · 快速标注</p>
      </div>

      <div className="header-insights">
        <div>
          <span className="label">已接收</span>
          <span className="value">{total}</span>
        </div>
        <div>
          <span className="label">已选择</span>
          <span className="value">{selectedCount}/2</span>
        </div>
      </div>

      <div className="header-actions">
        <button type="button" className="ghost" onClick={onClearAnnotations} disabled={selectedCount === 0}>
          清除标注
        </button>
        <button type="button" className="primary" onClick={onExport} disabled={!canExport}>
          导出合成图
        </button>
      </div>
    </header>
  );
};

export default Header;
