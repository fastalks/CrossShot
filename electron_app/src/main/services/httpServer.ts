import { app } from 'electron';
import express, { Express, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { WebSocketServer } from 'ws';
import { ScreenshotMeta } from '../../shared/types';

type MulterUploadedFile = {
  originalname: string;
  filename: string;
  size: number;
  path?: string;
};

class HTTPServer {
  private readonly expressApp: Express;
  private server?: ReturnType<Express['listen']>;
  private wsServer?: WebSocketServer;
  private readonly upload: multer.Multer;
  private readonly storageDir: string;
  private readonly metaFile: string;
  private readonly healthToken = 'crossshot-health-v1';
  private readonly screenshots: ScreenshotMeta[] = [];
  private onNewScreenshot?: (screenshots: ScreenshotMeta[]) => void;
  private onDeviceAnnounce?: (platform: 'android' | 'ios', deviceId: string, deviceInfo?: any) => void;
  private onDeviceAnnounceStop?: (platform: 'android' | 'ios', deviceId: string) => void;
  constructor(private readonly port = 8080) {
    this.expressApp = express();
    this.storageDir = path.join(app.getPath('userData'), 'screenshots');
    this.metaFile = path.join(this.storageDir, 'screenshots.json');

    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
    }

    // load persisted metadata if present
    try {
      if (fs.existsSync(this.metaFile)) {
        const raw = fs.readFileSync(this.metaFile, 'utf8');
        const parsed = JSON.parse(raw) as ScreenshotMeta[];
        // only keep entries whose file still exists
        this.screenshots.push(...parsed.filter((s) => fs.existsSync(s.path)));
      }
    } catch (e) {
      console.warn('Failed to load screenshots metadata', e);
    }

    const storage = multer.diskStorage({
      destination: this.storageDir,
      filename: (_req: Request, file: MulterUploadedFile, cb: (error: Error | null, filename: string) => void) => {
        const timestamp = Date.now();
        const sanitized = file.originalname.replace(/\s+/g, '_');
        cb(null, `screenshot_${timestamp}_${sanitized}`);
      },
    });

    this.upload = multer({ storage });
    this.configureMiddleware();
    this.configureRoutes();
  }

  private configureMiddleware(): void {
    this.expressApp.use(express.json());
    this.expressApp.use(express.urlencoded({ extended: true }));
    this.expressApp.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      if (_req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });
  }

  private configureRoutes(): void {
    this.expressApp.post('/api/upload', this.upload.single('screenshot'), (req: Request, res: Response) => {
      try {
        const { file } = req as Request & { file?: MulterUploadedFile };

        if (!file) {
          res.status(400).json({ error: 'Screenshot file missing' });
          return;
        }

        const filePath = file.path ?? path.join(this.storageDir, file.filename);

        const screenshot: ScreenshotMeta = {
          id: Date.now().toString(),
          filename: file.filename,
          path: filePath,
          deviceInfo: req.body.deviceInfo ?? 'Unknown Device',
          timestamp: req.body.timestamp ?? new Date().toISOString(),
          size: file.size,
        };

        this.screenshots.push(screenshot);
        this.saveMetadata();
        console.log('Received new screenshot:', screenshot.filename);

        this.onNewScreenshot?.([...this.screenshots]);

        res.json({ success: true, data: screenshot });
      } catch (error) {
        console.error('Failed to handle upload:', error);
        res.status(500).json({ error: (error as Error).message });
      }
    });

    this.expressApp.get('/api/screenshots', (_req: Request, res: Response) => {
      res.json({ success: true, data: this.screenshots });
    });

    this.expressApp.delete('/api/screenshots/:id', (req: Request, res: Response) => {
      const { id } = req.params;
      const index = this.screenshots.findIndex((item) => item.id === id);

      if (index === -1) {
        res.status(404).json({ error: 'Screenshot not found' });
        return;
      }

      const [screenshot] = this.screenshots.splice(index, 1);

      if (fs.existsSync(screenshot.path)) {
        try {
          fs.unlinkSync(screenshot.path);
        } catch (e) {
          console.warn('Failed to unlink screenshot file', e);
        }
      }
      this.saveMetadata();

      res.json({ success: true });
    });

    this.expressApp.get('/health', (_req: Request, res: Response) => {
      try {
        const payload = {
          status: 'ok',
          service: 'CrossShot Desktop',
          version: app.getVersion ? app.getVersion() : 'unknown',
          timestamp: new Date().toISOString(),
          storageDir: this.storageDir,
          token: this.healthToken,
        };
        res.status(200).json(payload);
      } catch (e) {
        res.status(200).json({ status: 'ok', service: 'CrossShot Desktop' });
      }
    });

    // Device announce endpoint: mobile clients can POST when they start monitoring
    this.expressApp.post('/api/announce', (req: Request, res: Response) => {
      try {
        const { platform, deviceId, deviceInfo } = req.body as { platform?: string; deviceId?: string; deviceInfo?: any };
        if (!platform || !deviceId) {
          res.status(400).json({ success: false, error: 'platform and deviceId required' });
          return;
        }

        if (platform !== 'android' && platform !== 'ios') {
          res.status(400).json({ success: false, error: 'unsupported platform' });
          return;
        }

        console.log(`HTTP /api/announce from ${platform} ${deviceId}`);
        if (deviceInfo) console.log('deviceInfo:', deviceInfo);
        this.onDeviceAnnounce?.(platform as 'android' | 'ios', deviceId, deviceInfo);
        res.json({ success: true });
      } catch (e) {
        console.warn('Failed to handle announce:', e);
        res.status(500).json({ success: false, error: String(e) });
      }
    });

    // Heartbeat endpoint: mobile clients send periodic heartbeats to indicate liveness
    this.expressApp.post('/api/heartbeat', (req: Request, res: Response) => {
      try {
        const { platform, deviceId, deviceInfo } = req.body as { platform?: string; deviceId?: string; deviceInfo?: any };
        if (!platform || !deviceId) {
          res.status(400).json({ success: false, error: 'platform and deviceId required' });
          return;
        }

        if (platform !== 'android' && platform !== 'ios') {
          res.status(400).json({ success: false, error: 'unsupported platform' });
          return;
        }

        console.log(`HTTP /api/heartbeat from ${platform} ${deviceId}`);
        if (deviceInfo) console.log('deviceInfo:', deviceInfo);
        // Treat heartbeat as an announce to ensure main process marks device online
        this.onDeviceAnnounce?.(platform as 'android' | 'ios', deviceId, deviceInfo);
        res.json({ success: true });
      } catch (e) {
        console.warn('Failed to handle heartbeat:', e);
        res.status(500).json({ success: false, error: String(e) });
      }
    });

    // Device announce stop endpoint: mobile clients can POST when they stop monitoring
    this.expressApp.post('/api/announce/stop', (req: Request, res: Response) => {
      try {
        const { platform, deviceId } = req.body as { platform?: string; deviceId?: string };
        if (!platform || !deviceId) {
          res.status(400).json({ success: false, error: 'platform and deviceId required' });
          return;
        }

        if (platform !== 'android' && platform !== 'ios') {
          res.status(400).json({ success: false, error: 'unsupported platform' });
          return;
        }

        console.log(`HTTP /api/announce/stop from ${platform} ${deviceId}`);
        this.onDeviceAnnounceStop?.(platform as 'android' | 'ios', deviceId);
        res.json({ success: true });
      } catch (e) {
        console.warn('Failed to handle announce stop:', e);
        res.status(500).json({ success: false, error: String(e) });
      }
    });
  }

  start(
    onNewScreenshot: (screenshots: ScreenshotMeta[]) => void,
    onDeviceAnnounce?: (platform: 'android' | 'ios', deviceId: string, deviceInfo?: any) => void,
    onDeviceAnnounceStop?: (platform: 'android' | 'ios', deviceId: string) => void,
  ): void {
    this.onDeviceAnnounce = onDeviceAnnounce;
    this.onDeviceAnnounceStop = onDeviceAnnounceStop;
    this.onNewScreenshot = onNewScreenshot;
    // Bind to 0.0.0.0 so mobile devices on the LAN can reach the server
    this.server = this.expressApp.listen(this.port, '0.0.0.0', () => {
      console.log(`HTTP server listening on http://0.0.0.0:${this.port}`);
    });

    // attach WebSocket server for proxy uploads
    try {
      this.wsServer = new WebSocketServer({ server: this.server as any, path: '/proxy-upload' });
      this.wsServer.on('connection', (socket) => {
        socket.on('message', async (msg) => {
          try {
            const buffer = Buffer.isBuffer(msg) ? msg : Buffer.from(msg as ArrayBuffer);
            const idx = buffer.indexOf(0x0a);
            let header = {} as any;
            let payload = buffer;
            if (idx > 0 && idx < 8192) {
              try {
                header = JSON.parse(buffer.slice(0, idx).toString('utf8'));
                payload = buffer.slice(idx + 1);
              } catch (e) {
                header = {};
                payload = buffer;
              }
            }

            const filename = header.filename || `proxy_${Date.now()}.bin`;
            const savePath = path.join(this.storageDir, filename);
            fs.writeFileSync(savePath, payload);

            // add to local screenshots list
            const stat = fs.statSync(savePath);
            const screenshot: ScreenshotMeta = {
              id: Date.now().toString(),
              filename,
              path: savePath,
              deviceInfo: header.deviceInfo ?? 'Proxy Upload',
              timestamp: new Date().toISOString(),
              size: stat.size,
            };
            this.screenshots.push(screenshot);
            this.saveMetadata();
            this.onNewScreenshot?.([...this.screenshots]);
            socket.send(JSON.stringify({ success: true, saved: true }));
          } catch (err) {
            socket.send(JSON.stringify({ success: false, error: String(err) }));
          }
        });
      });
    } catch (e) {
      console.warn('WebSocket proxy not started', e);
    }
  }

  stop(): void {
    this.server?.close(() => {
      console.log('HTTP server stopped');
    });
    this.server = undefined;
  }

  getScreenshots(): ScreenshotMeta[] {
    return [...this.screenshots];
  }

  deleteScreenshot(id: string): boolean {
    const index = this.screenshots.findIndex((item) => item.id === id);
    if (index === -1) {
      return false;
    }

    const [screenshot] = this.screenshots.splice(index, 1);

    if (fs.existsSync(screenshot.path)) {
      fs.unlinkSync(screenshot.path);
    }

    return true;
  }

  private saveMetadata(): void {
    try {
      fs.writeFileSync(this.metaFile, JSON.stringify(this.screenshots, null, 2), { encoding: 'utf8' });
    } catch (e) {
      console.warn('Failed to save screenshots metadata', e);
    }
  }

  /**
   * Delete all screenshots files and clear metadata
   */
  clearAllScreenshots(): boolean {
    try {
      // attempt to remove files listed in metadata
      for (const s of [...this.screenshots]) {
        try {
          if (fs.existsSync(s.path)) fs.unlinkSync(s.path);
        } catch (e) {
          console.warn('Failed to delete screenshot file', s.path, e);
        }
      }
      this.screenshots.length = 0;
      // remove metadata file
      try {
        if (fs.existsSync(this.metaFile)) fs.unlinkSync(this.metaFile);
      } catch (e) {
        // ignore
      }
      this.onNewScreenshot?.([...this.screenshots]);
      return true;
    } catch (e) {
      console.warn('Failed to clear screenshots', e);
      return false;
    }
  }

  getStorageDir(): string {
    return this.storageDir;
  }
}

export default HTTPServer;
