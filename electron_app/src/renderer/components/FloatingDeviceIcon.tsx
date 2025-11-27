import React, { useEffect, useState, useRef } from 'react';
import './FloatingDeviceIcon.css';

type Sessions = { android: string | null; ios: string | null };

const LS_KEY = 'floatingDeviceIconPos';

const loadPos = () => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { x: 20, y: 80 };
    return JSON.parse(raw);
  } catch {
    return { x: 20, y: 80 };
  }
};

const savePos = (pos: { x: number; y: number }) => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(pos));
  } catch {}
};

const FloatingDeviceIcon: React.FC = () => {
  const [sessions, setSessions] = useState<Sessions>({ android: null, ios: null });
  const [pos, setPos] = useState<{ x: number; y: number }>(loadPos());
  const dragging = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const off = window.crossShotApi.onDeviceSessionUpdate((s) => setSessions(s));
    return off;
  }, []);

  useEffect(() => savePos(pos), [pos]);

  const handlePointerDown = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragging.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
  };
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const d = dragging.current;
    const nx = d.origX + (e.clientX - d.startX);
    const ny = d.origY + (e.clientY - d.startY);
    setPos({ x: nx, y: ny });
  };
  const handlePointerUp = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    try { el.releasePointerCapture(e.pointerId); } catch {}
    dragging.current = null;
  };

  const androidActive = !!sessions.android;
  const iosActive = !!sessions.ios;

  const toggleListen = async (platform: 'android' | 'ios') => {
    try {
      if (platform === 'android') {
        if (androidActive) {
          await window.crossShotApi.stopListen('android', sessions.android ?? 'auto');
        } else {
          await window.crossShotApi.startListen('android', 'auto');
        }
      } else {
        if (iosActive) {
          await window.crossShotApi.stopListen('ios', sessions.ios ?? 'auto');
        } else {
          await window.crossShotApi.startListen('ios', 'auto');
        }
      }
    } catch (err) {
      console.error('toggleListen error', err);
    }
  };

  return (
    <div
      ref={ref}
      className="floating-device-icon"
      style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      <div className="icon-row">
        <div onClick={() => toggleListen('android')} className={`icon android ${androidActive ? 'connected' : 'disconnected'}`} title={androidActive ? 'Android 已连接（点击断开）' : 'Android 未连接（点击监听）'}>
          🤖
        </div>
        <div onClick={() => toggleListen('ios')} className={`icon ios ${iosActive ? 'connected' : 'disconnected'}`} title={iosActive ? 'iOS 已连接（点击断开）' : 'iOS 未连接（点击监听）'}>
          🍎
        </div>
      </div>
    </div>
  );
};

export default FloatingDeviceIcon;
