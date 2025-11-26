import { app, BrowserWindow, ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import MDNSService from './main/services/mdnsService';
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
    width: 1200,
    height: 800,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
    },
  });

  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const startServices = (): void => {
  httpServer = new HTTPServer(SERVER_PORT);
  httpServer.start((screenshots: ScreenshotMeta[]) => {
    if (mainWindow?.webContents) {
      mainWindow.webContents.send('new-screenshot', screenshots);
    }
  });

  mdnsService = new MDNSService();
  mdnsService.start(SERVER_PORT);
};

const stopServices = (): void => {
  mdnsService?.stop();
  mdnsService = null;

  httpServer?.stop();
  httpServer = null;
};

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
});

ipcMain.handle('get-screenshots', async () => {
  return httpServer?.getScreenshots() ?? [];
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
