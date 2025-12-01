
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import MDNSService from './main/services/mdnsService';
import os from 'os';
import { app as electronApp } from 'electron';
import HTTPServer from './main/services/httpServer';
import CompareService from './main/services/compareService';
import { ScreenshotMeta } from './shared/types';

declare const MAIN_WINDOW_WEBPACK_ENTRY: string;
declare const MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

if (require('electron-squirrel-startup')) {
  app.quit();
}

const SERVER_PORT = 8080;
let mainWindow: BrowserWindow | null = null;
let mdnsService: MDNSService | null = null;
let httpServer: HTTPServer | null = null;
// map of last heartbeat time keyed by `${platform}:${deviceId}`
const lastHeartbeat: Map<string, number> = new Map();
let heartbeatCheckTimer: NodeJS.Timeout | null = null;
const PROXIES_FILE = path.join((electronApp || app).getPath('userData'), 'proxies.json');
let proxies: Array<{ id?: string; host: string; port: number; name?: string }> = [];

function loadProxies() {
  try {
    if (fs.existsSync(PROXIES_FILE)) {
      const raw = fs.readFileSync(PROXIES_FILE, 'utf8');
      proxies = JSON.parse(raw);
    }
  } catch (e) {
    console.error('Failed to load proxies', e);
    proxies = [];
  }
}

function saveProxies() {
  try {
    fs.writeFileSync(PROXIES_FILE, JSON.stringify(proxies || []), { encoding: 'utf8' });
  } catch (e) {
    console.error('Failed to save proxies', e);
  }
}
const compareService = new CompareService();
const MIME_MAP: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic',
  heif: 'image/heif',
  webp: 'image/webp',
};

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1280,
    minHeight: 720,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  // 发送当前设备状态给渲染进程以便初始渲染
  mainWindow.webContents.once('did-finish-load', () => {
    if (mainWindow?.webContents) {
      mainWindow.webContents.send('device-session-update', { ...deviceSessions });
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const startServices = (): void => {
  httpServer = new HTTPServer(SERVER_PORT);
  httpServer.start(
    (screenshots: ScreenshotMeta[]) => {
      if (mainWindow?.webContents) {
        mainWindow.webContents.send('new-screenshot', screenshots);
      }
    },
    (platform: 'android' | 'ios', deviceId: string, deviceInfo?: any) => {
      // Update device session and notify renderer
      console.log(`Main: device announce callback platform=${platform} deviceId=${deviceId}`);
      if (deviceInfo) console.log('Main: deviceInfo', deviceInfo);
      if (!deviceSessions[platform]) {
        deviceSessions[platform] = deviceId;
      } else if (deviceSessions[platform] !== deviceId) {
        // replace current device id
        deviceSessions[platform] = deviceId;
      }
      // record heartbeat timestamp
      try {
        lastHeartbeat.set(`${platform}:${deviceId}`, Date.now());
      } catch (_) {}
      if (mainWindow?.webContents) {
        mainWindow.webContents.send('device-session-update', { ...deviceSessions, deviceInfo });
      }
    },
    (platform: 'android' | 'ios', deviceId: string) => {
      console.log(`Main: device announce stop platform=${platform} deviceId=${deviceId}`);
      // only clear if matching deviceId to avoid clobbering another device
      if (deviceSessions[platform] && deviceSessions[platform] === deviceId) {
        deviceSessions[platform] = null;
      }
      if (mainWindow?.webContents) {
        mainWindow.webContents.send('device-session-update', { ...deviceSessions });
      }
    },
  );

  mdnsService = new MDNSService();
  mdnsService.start(SERVER_PORT);

  // start heartbeat cleanup timer: clear sessions if no heartbeat seen within timeout
  const HEARTBEAT_CHECK_INTERVAL_MS = 5000;
  const HEARTBEAT_TIMEOUT_MS = 15000;
  heartbeatCheckTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of Array.from(lastHeartbeat.entries())) {
      if (now - ts > HEARTBEAT_TIMEOUT_MS) {
        // key format: platform:deviceId
        const [platform, ...rest] = key.split(':');
        const deviceId = rest.join(':');
        if (deviceSessions[platform as 'android' | 'ios'] === deviceId) {
          console.log(`Heartbeat timeout: clearing session for ${platform} ${deviceId}`);
          deviceSessions[platform as 'android' | 'ios'] = null;
          if (mainWindow?.webContents) mainWindow.webContents.send('device-session-update', { ...deviceSessions });
        }
        lastHeartbeat.delete(key);
      }
    }
  }, HEARTBEAT_CHECK_INTERVAL_MS);

  loadProxies();
};

const stopServices = (): void => {
  mdnsService?.stop();
  mdnsService = null;

  httpServer?.stop();
  httpServer = null;
};

ipcMain.handle('get-proxies', async () => {
  loadProxies();
  return proxies;
});

ipcMain.handle('add-proxy', async (_event, proxy: { host: string; port: number; name?: string }) => {
  proxies.push(proxy);
  saveProxies();
  return { success: true };
});

ipcMain.handle('remove-proxy', async (_event, index: number) => {
  if (index >= 0 && index < proxies.length) {
    proxies.splice(index, 1);
    saveProxies();
    return { success: true };
  }
  return { success: false };
});

app.whenReady().then(() => {
  createWindow();
  startServices();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  stopServices();
  if (heartbeatCheckTimer) {
    clearInterval(heartbeatCheckTimer);
    heartbeatCheckTimer = null;
  }
});

ipcMain.handle('get-screenshots', async () => {
  return httpServer?.getScreenshots() ?? [];
});

ipcMain.handle('clear-screenshots', async () => {
  try {
    const ok = httpServer?.clearAllScreenshots() ?? false;
    return { success: ok };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('open-screenshots-folder', async () => {
  try {
    const dir = httpServer?.getStorageDir();
    if (!dir) return { success: false };
    await shell.openPath(dir);
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
});

ipcMain.handle('compare-screenshots', async (_event, img1Path: string, img2Path: string) => {
  return compareService.compareImages(img1Path, img2Path);
});

ipcMain.handle('delete-screenshot', async (_event, id: string) => {
  return httpServer?.deleteScreenshot(id) ?? false;
});

ipcMain.handle('read-screenshot', async (_event, filePath: string) => {
  try {
    const buffer = await fs.promises.readFile(filePath);
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mime = MIME_MAP[ext] ?? 'application/octet-stream';
    return `data:${mime};base64,${buffer.toString('base64')}`;
  } catch (error) {
    console.error('Failed to read screenshot:', error);
    throw error;
  }
});

// 设备连接状态管理
type DeviceSession = { android: string | null; ios: string | null };
const deviceSessions: DeviceSession = { android: null, ios: null };

// 监听请求处理

ipcMain.handle('startListen', (event, platform: 'android' | 'ios', deviceId: string) => {
  if (!deviceSessions[platform]) {
    deviceSessions[platform] = deviceId;
    // 通知渲染进程设备连接状态
    if (mainWindow?.webContents) {
      mainWindow.webContents.send('device-session-update', { ...deviceSessions });
    }
    return { success: true };
  } else if (deviceSessions[platform] === deviceId) {
    return { success: true };
  } else {
    return { success: false, reason: '已有设备连接' };
  }
});


ipcMain.handle('stopListen', (event, platform: 'android' | 'ios', deviceId: string) => {
  if (deviceSessions[platform] === deviceId) {
    deviceSessions[platform] = null;
    // 通知渲染进程设备连接状态
    if (mainWindow?.webContents) {
      mainWindow.webContents.send('device-session-update', { ...deviceSessions });
    }
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('getDeviceSessions', async () => {
  return { ...deviceSessions };
});

// 返回本机可用于访问服务的 URL（首选局域网 IPv4）
ipcMain.handle('get-server-url', async () => {
  try {
    const ifaces = os.networkInterfaces();
    let address: string | null = null;
    for (const name of Object.keys(ifaces)) {
      const nets = ifaces[name] || [];
      for (const net of nets) {
        if (net.family === 'IPv4' && !net.internal) {
          address = net.address;
          break;
        }
      }
      if (address) break;
    }
    if (!address) address = '127.0.0.1';
    return `http://${address}:${SERVER_PORT}`;
  } catch (e) {
    return `http://127.0.0.1:${SERVER_PORT}`;
  }
});