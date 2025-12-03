import React, {
  forwardRef,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import './CompareView.css';
import type { ScreenshotMeta } from '../../shared/types';

export interface Annotation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  note?: string;
}

interface CompareViewProps {
  screenshots: ScreenshotMeta[];
  annotations: Annotation[];
  onCreateAnnotation: (annotation: Omit<Annotation, 'id'>) => void;
  onUpdateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  onDeleteAnnotation: (id: string) => void;
}

export interface CompareViewHandle {
  exportComposite: () => Promise<void>;
  copyComposite: () => Promise<void>;
}

const clamp = (value: number): number => Math.min(1, Math.max(0, value));

const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
    image.crossOrigin = 'anonymous';
  });

const CompareView = forwardRef<CompareViewHandle, CompareViewProps>(
  ({
    screenshots,
    annotations,
    onCreateAnnotation,
    onUpdateAnnotation,
    onDeleteAnnotation,
  }, ref) => {
    const stageRef = useRef<HTMLDivElement | null>(null);
    const [draft, setDraft] = useState<Omit<Annotation, 'id'> | null>(null);
    const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
    const pair = useMemo(() => (screenshots.length === 2 ? [screenshots[0], screenshots[1]] : []), [screenshots]);
    const isReady = pair.length === 2;

    const buildCompositeCanvas = async (): Promise<HTMLCanvasElement | null> => {
      if (!isReady) {
        window.alert('请选择两张截图后再执行该操作。');
        return null;
      }

      const [first, second] = pair;
      const [imgA, imgB] = await Promise.all([
        loadImage(`file://${first.path}`),
        loadImage(`file://${second.path}`),
      ]);

      const targetHeight = Math.max(imgA.naturalHeight, imgB.naturalHeight);
      const scaleA = targetHeight / imgA.naturalHeight;
      const scaleB = targetHeight / imgB.naturalHeight;
      const widthA = Math.round(imgA.naturalWidth * scaleA);
      const widthB = Math.round(imgB.naturalWidth * scaleB);

      const canvas = document.createElement('canvas');
      canvas.width = widthA + widthB;
      canvas.height = targetHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        throw new Error('Canvas API is not available');
      }

      ctx.fillStyle = '#0b1120';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(imgA, 0, 0, widthA, targetHeight);
      ctx.drawImage(imgB, widthA, 0, widthB, targetHeight);

      annotations.forEach((annotation, index) => {
        const x = annotation.x * canvas.width;
        const y = annotation.y * canvas.height;
        const w = annotation.width * canvas.width;
        const h = annotation.height * canvas.height;

        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 4;
        ctx.setLineDash([16, 12]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);

        const label = `${index + 1}`;
        ctx.fillStyle = 'rgba(251, 146, 60, 0.92)';
        ctx.fillRect(x, y - 32, Math.max(48, ctx.measureText(label).width + 24), 28);
        ctx.fillStyle = '#0b1120';
        ctx.font = '16px "Inter", sans-serif';
        ctx.fillText(label, x + 12, y - 12);

        if (annotation.note) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(x, y + h + 6, Math.min(canvas.width - x - 8, 320), 34);
          ctx.fillStyle = '#f8fafc';
          ctx.font = '15px "Inter", sans-serif';
          ctx.fillText(annotation.note, x + 10, y + h + 30);
        }
      });

      return canvas;
    };

    useImperativeHandle(ref, () => ({
      exportComposite: async () => {
        const canvas = await buildCompositeCanvas();
        if (!canvas) {
          return;
        }

        await new Promise<void>((resolve, reject) => {
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('导出失败，请重试'));
              return;
            }

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `CrossShot_${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
            link.click();
            URL.revokeObjectURL(url);
            resolve();
          }, 'image/png');
        });
      },
      copyComposite: async () => {
        const canvas = await buildCompositeCanvas();
        if (!canvas) {
          return;
        }

        if (!navigator.clipboard || !('ClipboardItem' in window)) {
          window.alert('当前环境不支持复制图片，请尝试保存后手动粘贴。');
          return;
        }

        await new Promise<void>((resolve, reject) => {
          canvas.toBlob(async (blob) => {
            if (!blob) {
              reject(new Error('复制失败，请重试'));
              return;
            }

            try {
              await navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob }),
              ]);
              resolve();
            } catch (error) {
              reject(error instanceof Error ? error : new Error('复制失败'));
            }
          }, 'image/png');
        });
      },
    }));

    const handlePointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
      if (!isReady || !stageRef.current) {
        return;
      }

      const rect = stageRef.current.getBoundingClientRect();
      const relativeX = clamp((event.clientX - rect.left) / rect.width);
      const relativeY = clamp((event.clientY - rect.top) / rect.height);

      setStartPoint({ x: relativeX, y: relativeY });
      setDraft({ x: relativeX, y: relativeY, width: 0, height: 0 });
      stageRef.current.setPointerCapture(event.pointerId);
      event.preventDefault();
    };

    const handlePointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
      if (!startPoint || !stageRef.current) {
        return;
      }

      const rect = stageRef.current.getBoundingClientRect();
      const currentX = clamp((event.clientX - rect.left) / rect.width);
      const currentY = clamp((event.clientY - rect.top) / rect.height);

      const x = Math.min(startPoint.x, currentX);
      const y = Math.min(startPoint.y, currentY);
      const width = Math.abs(currentX - startPoint.x);
      const height = Math.abs(currentY - startPoint.y);

      setDraft({ x, y, width, height });
      event.preventDefault();
    };

    const finalizeAnnotation = () => {
      if (!draft) {
        return;
      }

      const isValid = draft.width > 0.015 && draft.height > 0.015;
      if (isValid) {
        const note = window.prompt('为该标注添加备注（可选）', '')?.trim();
        onCreateAnnotation({ ...draft, note: note || undefined });
      }

      setDraft(null);
      setStartPoint(null);
    };

    const handlePointerUp: React.PointerEventHandler<HTMLDivElement> = (event) => {
      if (stageRef.current && stageRef.current.hasPointerCapture(event.pointerId)) {
        stageRef.current.releasePointerCapture(event.pointerId);
      }
      finalizeAnnotation();
      event.preventDefault();
    };

    const handlePointerCancel: React.PointerEventHandler<HTMLDivElement> = (event) => {
      if (stageRef.current && stageRef.current.hasPointerCapture(event.pointerId)) {
        stageRef.current.releasePointerCapture(event.pointerId);
      }
      setDraft(null);
      setStartPoint(null);
      event.preventDefault();
    };

    const handleAnnotationClick = (id: string) => {
      const current = annotations.find((annotation) => annotation.id === id);
      const next = window.prompt('编辑标注备注（留空则清除）', current?.note ?? '')?.trim();
      if (next === null) {
        return;
      }
      onUpdateAnnotation(id, { note: next || undefined });
    };

    const drawableAnnotations = useMemo(() => {
      const collected = [...annotations];
      if (draft) {
        collected.push({ ...draft, id: '__draft__' });
      }
      return collected;
    }, [annotations, draft]);

    if (!isReady) {
      return (
        <div className="compare-view">
          <div className="compare-empty">
            <h2>选择两张截图开始排查</h2>
            <p>在左侧选择一张 Android 和一张 iOS 截图，我们会在这里并排呈现。</p>
          </div>
        </div>
      );
    }

    const [first, second] = pair;

    return (
      <div className="compare-view">
        <header className="compare-header">
          <div className="compare-title">
            <h2>批注画布</h2>
            <p>拖动鼠标绘制高亮框，单击编号可更新说明，右键删除。</p>
          </div>
          <div className="compare-meta">
            <span>{typeof first.deviceInfo === 'object' ? (first.deviceInfo.name ?? JSON.stringify(first.deviceInfo)) : String(first.deviceInfo)}</span>
            <span className="separator" />
            <span>{typeof second.deviceInfo === 'object' ? (second.deviceInfo.name ?? JSON.stringify(second.deviceInfo)) : String(second.deviceInfo)}</span>
          </div>
        </header>

        <div
          ref={stageRef}
          className="canvas-stage"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        >
          <div className="canvas-images">
            <img src={`file://${first.path}`} alt={first.filename} />
            <img src={`file://${second.path}`} alt={second.filename} />
          </div>

          <svg className="canvas-overlay">
            {drawableAnnotations.map((annotation) => {
              const isDraft = annotation.id === '__draft__';
              const left = `${(annotation.x * 100).toFixed(4)}%`;
              const top = `${(annotation.y * 100).toFixed(4)}%`;
              const width = `${(annotation.width * 100).toFixed(4)}%`;
              const height = `${(annotation.height * 100).toFixed(4)}%`;
              const index = annotations.findIndex((item) => item.id === annotation.id);

              return (
              <g
                  key={annotation.id}
                  className={`annotation${isDraft ? ' draft' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                    if (!isDraft) {
                      handleAnnotationClick(annotation.id);
                  }
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                    if (!isDraft) {
                      onDeleteAnnotation(annotation.id);
                  }
                }}
              >
                <rect
                    x={left}
                    y={top}
                    width={width}
                    height={height}
                  rx="8"
                />
                {!isDraft && (
                  <g className="annotation-label" transform={`translate(${annotation.x * 100}%, ${annotation.y * 100 - 3}%)`}>
                      <rect />
                      <text>{index + 1}</text>
                  </g>
                )}
                </g>
              );
            })}
          </svg>
        </div>

        {annotations.length > 0 && (
          <aside className="annotation-panel">
            <h3>标注列表</h3>
            <ul>
              {annotations.map((annotation, index) => (
                <li key={annotation.id}>
                  <button type="button" onClick={() => handleAnnotationClick(annotation.id)}>
                    <span className="badge">{index + 1}</span>
                    <span className="label">{annotation.note ?? '点击添加备注'}</span>
                  </button>
                  <div className="note-meta">
                    <span>{(annotation.width * 100).toFixed(1)}% × {(annotation.height * 100).toFixed(1)}%</span>
                    <button type="button" onClick={() => onDeleteAnnotation(annotation.id)}>删除</button>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        )}
      </div>
    );
  },
);

CompareView.displayName = 'CompareView';

export default CompareView;
