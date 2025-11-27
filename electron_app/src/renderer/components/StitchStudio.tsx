import React, {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';
import type { ScreenshotMeta } from '../../shared/types';
import './StitchStudio.css';

const FALLBACK_IMAGE =
    'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Crect fill="%231f2937" width="200" height="200"/%3E%3Ctext fill="%236b7280" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="Inter" font-size="14"%3ENO DATA%3C/text%3E%3C/svg%3E';

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const formatBytes = (bytes: number): string => {
    if (bytes <= 0) {
        return '0 B';
    }
    const units = ['B', 'KB', 'MB', 'GB'];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const size = bytes / 1024 ** index;
    return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
};

const loadImage = (src: string, fallback?: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => {
            if (fallback && fallback !== src) {
                loadImage(fallback).then(resolve).catch(reject);
                return;
            }
            reject(new Error(`Failed to load image: ${src}`));
        };
        image.src = src;
    });

const buildFilename = (template: string, count: number): string =>
    template
        .replace('{timestamp}', new Date().toISOString().replace(/[:.]/g, '-'))
        .replace('{count}', String(count));

type ShotPlatform = 'android' | 'ios';

const normalizeDeviceInfo = (raw: string): string => {
    if (!raw) {
        return '';
    }
    const trimmed = raw.trim();
    if (!trimmed) {
        return '';
    }
    if (trimmed.startsWith('{')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (typeof parsed === 'string') {
                return parsed;
            }
            if (typeof parsed === 'object' && parsed !== null) {
                if (typeof parsed.platform === 'string') {
                    return parsed.platform;
                }
                if (typeof parsed.os === 'string') {
                    return parsed.os;
                }
                if (typeof parsed.systemVersion === 'string') {
                    return parsed.systemVersion;
                }
                if (typeof parsed.osVersion === 'string') {
                    return parsed.osVersion;
                }
                const brand = typeof parsed.brand === 'string' ? parsed.brand : '';
                const model = typeof parsed.model === 'string' ? parsed.model : '';
                if (brand || model) {
                    return `${brand} ${model}`.trim();
                }
            }
        } catch (error) {
            console.debug('Failed to parse deviceInfo:', error);
        }
    }
    return trimmed;
};

const detectPlatform = (meta: ScreenshotMeta): ShotPlatform => {
    const infoText = normalizeDeviceInfo(meta.deviceInfo).toLowerCase();
    if (infoText.includes('ios') || infoText.includes('iphone') || infoText.includes('ipad') || infoText.includes('apple')) {
        return 'ios';
    }
    return 'android';
};

const parseTimestamp = (value: string): number => {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? 0 : parsed;
};

export interface StitchStudioHandle {
    exportComposite: () => Promise<void>;
    copyComposite: () => Promise<void>;
    focusCanvas: () => void;
}

interface StitchStudioProps {
    screenshots: ScreenshotMeta[];
    selectedIds: string[];
    onToggleSelection: (screenshot: ScreenshotMeta) => void;
    onDelete: (id: string) => void;
}

type Direction = 'vertical' | 'horizontal';
type Alignment = 'start' | 'center' | 'end' | 'stretch';
type ExportFormat = 'png' | 'jpg' | 'webp';

const StitchStudio = forwardRef<StitchStudioHandle, StitchStudioProps>(({ screenshots, selectedIds, onToggleSelection, onDelete }, ref) => {
    // 标注状态：按图片 id 存储，坐标为归一化 [0..1] 相对于该图片在预览中的显示框
    const [annotations, setAnnotations] = useState<Record<string, Array<{ x: number; y: number; w: number; h: number }>>>({});
    const [drawing, setDrawing] = useState<boolean>(false);
    const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
    const [drawingTarget, setDrawingTarget] = useState<string | null>(null);
    const [previewImageRects, setPreviewImageRects] = useState<Record<string, { left: number; top: number; width: number; height: number }>>({});
    const [stitchOrder, setStitchOrder] = useState<string[]>(selectedIds);
    const [direction] = useState<Direction>('horizontal');
    const [alignment] = useState<Alignment>('center');
    const spacing = 32;
    const [background, setBackground] = useState<string>('#030712');
    const [zoom, setZoom] = useState<number>(0.8);
    const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    const stageRef = useRef<HTMLDivElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const [isPanning, setIsPanning] = useState<boolean>(false);
    const [panOrigin, setPanOrigin] = useState<{ x: number; y: number } | null>(null);
    const [imageSources, setImageSources] = useState<Record<string, string>>({});
    const [dimensions, setDimensions] = useState<Record<string, { width: number; height: number }>>({});
    const [format] = useState<ExportFormat>('png');
    const quality = 92;
    const filenameTemplate = 'CrossShot_{timestamp}_{count}';
    const watermarkEnabled = false;
    const watermarkText = 'CrossShot';
    const annotationEnabled = true;
    const cropEnabled = false;

    const lookup = useMemo(() => Object.fromEntries(screenshots.map((item) => [item.id, item])), [screenshots]);
    const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
    const previewShots = useMemo(() => stitchOrder.map((id) => lookup[id]).filter(Boolean) as ScreenshotMeta[], [stitchOrder, lookup]);
    const sortedScreens = useMemo(
        () => [...screenshots].sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp)),
        [screenshots],
    );
    const { android: androidShots, ios: iosShots } = useMemo(() => {
        const android: ScreenshotMeta[] = [];
        const ios: ScreenshotMeta[] = [];
        sortedScreens.forEach((shot) => {
            if (detectPlatform(shot) === 'ios') {
                ios.push(shot);
            } else {
                android.push(shot);
            }
        });
        return { android, ios };
    }, [sortedScreens]);

    useEffect(() => {
        setStitchOrder((previous) => {
            const retained = previous.filter((id) => selectedIds.includes(id));
            const appended = selectedIds.filter((id) => !retained.includes(id));
            return [...retained, ...appended];
        });
    }, [selectedIds]);

    useEffect(() => {
        sortedScreens.forEach((shot) => {
            if (imageSources[shot.id]) {
                return;
            }
            window.crossShotApi
                .loadScreenshotData(shot.path)
                .then((dataUrl) => {
                    setImageSources((previous) => ({ ...previous, [shot.id]: dataUrl }));
                })
                .catch(() => {
                    setImageSources((previous) => ({ ...previous, [shot.id]: FALLBACK_IMAGE }));
                });
        });
    }, [sortedScreens, imageSources]);

    useEffect(() => {
        previewShots.forEach((shot) => {
            if (dimensions[shot.id]) {
                return;
            }
            const image = new Image();
            image.onload = () => {
                setDimensions((previous) => ({ ...previous, [shot.id]: { width: image.naturalWidth, height: image.naturalHeight } }));
            };
            image.src = `file://${shot.path}`;
        });
    }, [previewShots, dimensions]);

    useEffect(() => {
        const stageElement = stageRef.current;
        if (!stageElement) {
            return undefined;
        }
        const handleWheel = (event: WheelEvent) => {
            event.preventDefault();
            const delta = event.deltaY > 0 ? -0.05 : 0.05;
            setZoom((previous) => clamp(previous + delta, 0.3, 2));
        };
        stageElement.addEventListener('wheel', handleWheel, { passive: false });
        return () => {
            stageElement.removeEventListener('wheel', handleWheel);
        };
    }, []);

    const getContentRect = () => {
        const content = contentRef.current;
        if (!content) return { left: 0, top: 0, scrollLeft: 0, scrollTop: 0 } as const;
        const rect = content.getBoundingClientRect();
        return {
            left: rect.left,
            top: rect.top,
            scrollLeft: content.scrollLeft,
            scrollTop: content.scrollTop,
        } as const;
    };

    const updatePreviewImageRects = () => {
        const content = contentRef.current;
        if (!content) return;
        const imgs = Array.from(content.querySelectorAll<HTMLImageElement>('img'));
        const contentRect = content.getBoundingClientRect();
        const map: Record<string, { left: number; top: number; width: number; height: number }> = {};
        imgs.forEach((img, idx) => {
            const shot = previewShots[idx];
            if (!shot) return;
            const r = img.getBoundingClientRect();
            map[shot.id] = { left: r.left - contentRect.left, top: r.top - contentRect.top, width: r.width, height: r.height };
        });
        setPreviewImageRects(map);
    };

    useEffect(() => {
        updatePreviewImageRects();
        const onResize = () => updatePreviewImageRects();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, [previewShots, zoom, offset, imageSources]);

    const handleCanvasPointerDown: React.PointerEventHandler<HTMLDivElement> = (event) => {
        if (event.button !== 0) return;
        // 按住 Shift 进入标注模式：需要找到落在哪张图片上
        if (event.shiftKey) {
            const content = contentRef.current;
            if (!content) return;
            const imgs = Array.from(content.querySelectorAll<HTMLImageElement>('img'));
            for (let i = 0; i < imgs.length; i++) {
                const img = imgs[i];
                const rect = img.getBoundingClientRect();
                if (event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom) {
                    const shot = previewShots[i];
                    if (!shot) return;
                    const xNorm = (event.clientX - rect.left) / rect.width;
                    const yNorm = (event.clientY - rect.top) / rect.height;
                    setDrawing(true);
                    setDrawingTarget(shot.id);
                    setDrawStart({ x: xNorm, y: yNorm });
                    setAnnotations((prev) => ({ ...prev, [shot.id]: [...(prev[shot.id] ?? []), { x: xNorm, y: yNorm, w: 0, h: 0 }] }));
                    return;
                }
            }
        }
        setIsPanning(true);
        setPanOrigin({ x: event.clientX - offset.x, y: event.clientY - offset.y });
        stageRef.current?.setPointerCapture(event.pointerId);
    };

    const handleCanvasPointerMove: React.PointerEventHandler<HTMLDivElement> = (event) => {
        if (drawing && drawStart && drawingTarget) {
            const content = contentRef.current;
            if (!content) return;
            const imgs = Array.from(content.querySelectorAll<HTMLImageElement>('img')) as HTMLImageElement[];
            const idx = previewShots.findIndex((s) => s.id === drawingTarget);
            const img = imgs[idx];
            if (!img) return;
            const rect = img.getBoundingClientRect();
            const xNorm = (event.clientX - rect.left) / rect.width;
            const yNorm = (event.clientY - rect.top) / rect.height;
            const x0 = drawStart.x;
            const y0 = drawStart.y;
            const nx = Math.min(x0, xNorm);
            const ny = Math.min(y0, yNorm);
            const nw = Math.abs(xNorm - x0);
            const nh = Math.abs(yNorm - y0);
            setAnnotations((prev) => {
                const copy = { ...prev };
                const arr = copy[drawingTarget] ?? [];
                arr[arr.length - 1] = { x: nx, y: ny, w: nw, h: nh };
                copy[drawingTarget] = arr;
                return copy;
            });
            return;
        }
        if (!isPanning || !panOrigin) return;
        setOffset({ x: event.clientX - panOrigin.x, y: event.clientY - panOrigin.y });
        event.preventDefault();
    };

    const handleCanvasPointerUp: React.PointerEventHandler<HTMLDivElement> = (event) => {
        if (drawing && drawStart && drawingTarget) {
            const content = contentRef.current;
            if (!content) return;
            const imgs = Array.from(content.querySelectorAll<HTMLImageElement>('img')) as HTMLImageElement[];
            const idx = previewShots.findIndex((s) => s.id === drawingTarget);
            const img = imgs[idx];
            if (img) {
                const rect = img.getBoundingClientRect();
                const xNorm = (event.clientX - rect.left) / rect.width;
                const yNorm = (event.clientY - rect.top) / rect.height;
                const x0 = drawStart.x;
                const y0 = drawStart.y;
                const nx = Math.min(x0, xNorm);
                const ny = Math.min(y0, yNorm);
                const nw = Math.abs(xNorm - x0);
                const nh = Math.abs(yNorm - y0);
                setAnnotations((prev) => {
                    const copy = { ...prev };
                    const arr = copy[drawingTarget] ?? [];
                    arr[arr.length - 1] = { x: nx, y: ny, w: nw, h: nh };
                    copy[drawingTarget] = arr;
                    return copy;
                });
            }
            setDrawing(false);
            setDrawStart(null);
            setDrawingTarget(null);
            return;
        }
        if (stageRef.current?.hasPointerCapture(event.pointerId)) {
            stageRef.current.releasePointerCapture(event.pointerId);
        }
        setIsPanning(false);
        setPanOrigin(null);
    };

    const previewDimensions = useMemo(() => {
        if (previewShots.length === 0) {
            return { width: 0, height: 0 };
        }
        const fallbacks = previewShots.map((shot) => dimensions[shot.id] ?? { width: 1080, height: 2400 });
        if (direction === 'horizontal') {
            const height = Math.max(...fallbacks.map((item) => item.height));
            const width = fallbacks.reduce((acc, current) => acc + Math.round((current.width / current.height) * height), 0) + spacing * (fallbacks.length - 1);
            return { width: Math.max(width, 10), height: Math.max(height, 10) };
        }
        if (direction === 'vertical') {
            const width = Math.max(...fallbacks.map((item) => item.width));
            const height = fallbacks.reduce((acc, current) => acc + Math.round((current.height / current.width) * width), 0) + spacing * (fallbacks.length - 1);
            return { width: Math.max(width, 10), height: Math.max(height, 10) };
        }
        return { width: 10, height: 10 };
    }, [previewShots, dimensions, direction, spacing]);

    const estimatedBytes = useMemo(() => {
        const baseSize = previewShots.reduce((total, shot) => total + shot.size, 0);
        const multiplier = format === 'jpg' ? 0.85 : format === 'webp' ? 0.6 : 1;
        return baseSize * (quality / 100) * multiplier;
    }, [previewShots, quality, format]);

    const filenamePreview = buildFilename(filenameTemplate, previewShots.length || 1);

    const renderPlatformPanel = (platformShots: ScreenshotMeta[], label: string, emptyText: string) => (
        <section className="platform-panel">
            <div className="selection-headline">
                <h3>{label}</h3>
                <span>{platformShots.length ? `${platformShots.length} 张` : '暂无数据'}</span>
            </div>
            <div className="platform-strip">
                {platformShots.length === 0 ? (
                    <div className="selection-empty">{emptyText}</div>
                ) : (
                    platformShots.map((shot) => {
                        const src = imageSources[shot.id] ?? FALLBACK_IMAGE;
                        const active = selectedSet.has(shot.id);
                        return (
                            <button
                                key={shot.id}
                                type="button"
                                className={`platform-card${active ? ' active' : ''}`}
                                onClick={() => onToggleSelection(shot)}
                            >
                                <div className="platform-card__preview">
                                    <img src={src} alt={shot.filename} draggable={false} />
                                </div>
                                {/* <div className="platform-card__meta">
                                    <span>{shot.filename}</span>
                                    <small>{new Date(shot.timestamp).toLocaleString()}</small>
                                </div> */}
                            </button>
                        );
                    })
                )}
            </div>
        </section>
    );

    const renderPreviewNodes = () => {
        if (previewShots.length === 0) {
            return (
                <div className="stitch-canvas__empty">
                    <h3>请选择需要拼接的截图</h3>
                    <p>从下方素材库添加图片，我们会自动计算拼接尺寸。</p>
                </div>
            );
        }
        return (
            <div
                className={`stitch-preview track-${direction}`}
                style={{ gap: `${spacing}px`, alignItems: direction === 'horizontal' ? alignment : 'stretch', position: 'relative' }}
            >
                {previewShots.map((shot, index) => {
                    const src = imageSources[shot.id] ?? FALLBACK_IMAGE;
                    const selected = selectedSet.has(shot.id);
                    const rects = annotations[shot.id] ?? [];
                    return (
                        <div
                            key={shot.id}
                            className={`preview-card${selected ? ' active' : ''}`}
                            style={{ position: 'relative' }}
                        >
                            <div className="preview-card__actions">
                                <span className="badge">#{index + 1}</span>
                                <button type="button" onClick={() => onDelete(shot.id)}>
                                    删除
                                </button>
                            </div>
                            <div style={{ position: 'relative', display: 'inline-block' }} className="preview-card__image-wrapper">
                                <img src={src} alt={shot.filename} draggable={false} style={{ display: 'block', width: '100%', height: 'auto' }} />
                                {rects.map((r, idx) => (
                                    <div
                                        key={`${shot.id}-${idx}`}
                                        style={{
                                            position: 'absolute',
                                            left: `${r.x * 100}%`,
                                            top: `${r.y * 100}%`,
                                            width: `${r.w * 100}%`,
                                            height: `${r.h * 100}%`,
                                            border: '2px solid red',
                                            boxSizing: 'border-box',
                                            pointerEvents: 'none',
                                            transform: 'translate(0, 0)'
                                        }}
                                    />
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const buildCompositeCanvas = async (): Promise<HTMLCanvasElement | null> => {
        if (previewShots.length === 0) {
            window.alert('请先选择至少一张截图。');
            return null;
        }

        const images = await Promise.all(
            previewShots.map((shot) => {
                const source = imageSources[shot.id] ?? `file://${shot.path}`;
                return loadImage(source, FALLBACK_IMAGE);
            }),
        );

        let canvasWidth = 0;
        let canvasHeight = 0;

        if (direction === 'horizontal') {
            const targetHeight = Math.max(...images.map((img) => img.naturalHeight));
            const scaledWidths = images.map((img) => Math.round((img.naturalWidth / img.naturalHeight) * targetHeight));
            canvasWidth = scaledWidths.reduce((acc, value) => acc + value, 0) + spacing * (images.length - 1);
            canvasHeight = targetHeight;
        } else if (direction === 'vertical') {
            const targetWidth = Math.max(...images.map((img) => img.naturalWidth));
            const scaledHeights = images.map((img) => Math.round((img.naturalHeight / img.naturalWidth) * targetWidth));
            canvasHeight = scaledHeights.reduce((acc, value) => acc + value, 0) + spacing * (images.length - 1);
            canvasWidth = targetWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(canvasWidth));
        canvas.height = Math.max(1, Math.round(canvasHeight));
        const ctx = canvas.getContext('2d');

        if (!ctx) {
            throw new Error('Canvas API unavailable');
        }

        ctx.fillStyle = background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        let cursor = 0;
        // 记录每张图片的实际位置和缩放，便于标注映射
        const imageRects: Array<{ dx: number; dy: number; drawWidth: number; drawHeight: number }> = [];
        images.forEach((img, index) => {
            let drawWidth = Math.max(img.naturalWidth, 10);
            let drawHeight = Math.max(img.naturalHeight, 10);
            let dx = 0;
            let dy = 0;

            if (direction === 'vertical') {
                const targetWidth = canvas.width;
                const scale = targetWidth / img.naturalWidth;
                drawWidth = targetWidth;
                drawHeight = img.naturalHeight * scale;
                dx = 0;
                dy = cursor;
                cursor += drawHeight + spacing;
            } else if (direction === 'horizontal') {
                const targetHeight = canvas.height;
                const scale = targetHeight / img.naturalHeight;
                drawHeight = targetHeight;
                drawWidth = img.naturalWidth * scale;
                dy = 0;
                dx = cursor;
                cursor += drawWidth + spacing;
                if (alignment === 'center') {
                    dy = (canvas.height - drawHeight) / 2;
                } else if (alignment === 'end') {
                    dy = canvas.height - drawHeight;
                }
            }

            ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
            imageRects.push({ dx, dy, drawWidth, drawHeight });

            if (annotationEnabled) {
                ctx.fillStyle = 'rgba(15, 23, 42, 0.8)';
                ctx.fillRect(dx + 16, dy + 16, 40, 28);
                ctx.fillStyle = '#f8fafc';
                ctx.font = 'bold 18px "Inter", sans-serif';
                ctx.fillText(String(index + 1), dx + 28, dy + 36);
            }
        });

        // 绘制所有标注方框：遍历每张图片，将该图的归一化标注映射到合成画布的图块上
        if (previewDimensions.width > 0 && previewDimensions.height > 0) {
            ctx.save();
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            previewShots.forEach((shot, idx) => {
                const arr = annotations[shot.id] ?? [];
                if (!arr.length) return;
                const rectInfo = imageRects[idx];
                if (!rectInfo) return;
                const { dx, dy, drawWidth, drawHeight } = rectInfo;
                // 计算线宽：基于预览中 2px 的视觉厚度映射到合成画布
                const previewRect = previewImageRects[shot.id];
                let scaleFactor = 1;
                if (previewRect && previewRect.width > 0) {
                    scaleFactor = drawWidth / previewRect.width;
                } else if (previewDimensions.width > 0) {
                    scaleFactor = canvas.width / previewDimensions.width;
                }
                const desiredPreviewPx = 2; // 预览中边框为 2px
                ctx.lineWidth = Math.max(1, Math.round(desiredPreviewPx * scaleFactor));
                arr.forEach((r) => {
                    const sx = dx + r.x * drawWidth;
                    const sy = dy + r.y * drawHeight;
                    const sw = r.w * drawWidth;
                    const sh = r.h * drawHeight;
                    ctx.strokeRect(sx, sy, sw, sh);
                });
            });
            ctx.restore();
        }

        if (watermarkEnabled) {
            ctx.save();
            ctx.globalAlpha = 0.6;
            ctx.fillStyle = '#f8fafc';
            ctx.font = '24px "Inter", sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(watermarkText, canvas.width - 32, canvas.height - 32);
            ctx.restore();
        }

        if (cropEnabled) {
            const margin = 20;
            const cropped = document.createElement('canvas');
            cropped.width = Math.max(1, canvas.width - margin * 2);
            cropped.height = Math.max(1, canvas.height - margin * 2);
            const croppedCtx = cropped.getContext('2d');
            if (!croppedCtx) {
                return canvas;
            }
            croppedCtx.drawImage(canvas, margin, margin, cropped.width, cropped.height, 0, 0, cropped.width, cropped.height);
            return cropped;
        }

        return canvas;
    };

    useImperativeHandle(ref, () => ({
        exportComposite: async () => {
            const canvas = await buildCompositeCanvas();
            if (!canvas) {
                return;
            }
            await new Promise<void>((resolve, reject) => {
                canvas.toBlob(
                    (blob) => {
                        if (!blob) {
                            reject(new Error('导出失败'));
                            return;
                        }
                        const url = URL.createObjectURL(blob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = `${buildFilename(filenameTemplate, previewShots.length || 1)}.${format}`;
                        link.click();
                        URL.revokeObjectURL(url);
                        resolve();
                    },
                    format === 'png' ? 'image/png' : format === 'jpg' ? 'image/jpeg' : 'image/webp',
                    format === 'png' ? undefined : clamp(quality / 100, 0.1, 1),
                );
            });
        },
        copyComposite: async () => {
            const canvas = await buildCompositeCanvas();
            if (!canvas) {
                return;
            }
            if (!navigator.clipboard || !('ClipboardItem' in window)) {
                window.alert('当前环境不支持复制图片，请尝试导出文件。');
                return;
            }
            await new Promise<void>((resolve, reject) => {
                canvas.toBlob(
                    async (blob) => {
                        if (!blob) {
                            reject(new Error('复制失败'));
                            return;
                        }
                        try {
                            await navigator.clipboard.write([new ClipboardItem({ [format === 'png' ? 'image/png' : `image/${format}`]: blob })]);
                            resolve();
                        } catch (error) {
                            reject(error instanceof Error ? error : new Error('复制失败'));
                        }
                    },
                    format === 'png' ? 'image/png' : format === 'jpg' ? 'image/jpeg' : 'image/webp',
                    format === 'png' ? undefined : clamp(quality / 100, 0.1, 1),
                );
            });
        },
        focusCanvas: () => {
            stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            stageRef.current?.focus();
        },
    }));

    return (
        <div className="stitch-studio">

            {renderPlatformPanel(androidShots, 'Android 图片列表', '暂无 Android 截图，请先在安卓设备上采集。')}

            {renderPlatformPanel(iosShots, 'iOS 图片列表', '暂无 iOS 截图，请先在苹果设备上采集。')}

            <section className="stitch-workspace">
                <div className="stitch-canvas">
                    <div className="stitch-canvas__toolbar">
                        <label>
                            缩放
                            <input type="range" min={0.3} max={2} step={0.05} value={zoom} onChange={(event) => setZoom(Number(event.target.value))} />
                            <span>{Math.round(zoom * 100)}%</span>
                        </label>
                    </div>
                    <div
                        ref={stageRef}
                        className="stitch-canvas__stage"
                        onPointerDown={handleCanvasPointerDown}
                        onPointerMove={handleCanvasPointerMove}
                        onPointerUp={handleCanvasPointerUp}
                        onPointerLeave={handleCanvasPointerUp}
                        tabIndex={0}
                    >
                        <div
                            ref={contentRef}
                            className="stitch-canvas__content"
                            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}
                        >
                            {renderPreviewNodes()}
                        </div>
                    </div>
                </div>

            </section>

            <footer className="stitch-footer">
                <div>
                    <span className="label">最终尺寸</span>
                    <strong>
                        {previewDimensions.width || 0} × {previewDimensions.height || 0} px
                    </strong>
                </div>
                <div>
                    <span className="label">预计大小</span>
                    <strong>{formatBytes(estimatedBytes)}</strong>
                </div>
                <div>
                    <span className="label">文件名预览</span>
                    <strong>{filenamePreview}</strong>
                </div>
            </footer>
        </div>
    );
});

StitchStudio.displayName = 'StitchStudio';

export default StitchStudio;
