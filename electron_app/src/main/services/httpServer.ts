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

  // Previously we normalized deviceInfo by guessing platform from freeform text.
  // Now we prefer to store the uploaded fields as-is (structured) and avoid guessing or modifying casing.

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

        // Build deviceInfo object directly from upload fields / payload. Do not perform platform casing normalization.
        let di: any = {};
        const rawPayload = req.body && req.body.deviceInfo !== undefined ? req.body.deviceInfo : undefined;
        if (rawPayload !== undefined && rawPayload !== null) {
          if (typeof rawPayload === 'object') {
            di = { ...rawPayload, raw: rawPayload };
          } else {
            const s = String(rawPayload).trim();
            if (s.startsWith('{')) {
              try {
                const parsed = JSON.parse(s);
                if (typeof parsed === 'object' && parsed !== null) di = { ...parsed, raw: parsed };
                else di.raw = s;
              } catch (_e) {
                di.raw = s;
              }
            } else {
              di.raw = s;
            }
          }
        }

        // If the upload form provided explicit device fields, copy them verbatim (no coercion of platform casing)
        const allowedFields = [
          'platform',
          'name',
          'model',
          'systemVersion',
          'identifierForVendor',
          'manufacturer',
          'version',
          'sdkInt',
          'brand',
          'device',
        ];
        for (const f of allowedFields) {
          if (req.body && Object.prototype.hasOwnProperty.call(req.body, f) && req.body[f] !== undefined && req.body[f] !== null) {
            if (f === 'sdkInt') {
              const n = Number(req.body[f]);
              if (!Number.isNaN(n)) di[f] = n;
            } else {
              di[f] = req.body[f];
            }
          }
        }

        // Guard: if client accidentally submitted a server health payload as deviceInfo (common when proxying),
        // remove it instead of storing it verbatim. We only strip obvious health responses that include
        // a CrossShot service marker or health token. Explicit device fields remain preserved.
        try {
          const raw = (di && (di.raw ?? undefined)) as any;
          if (raw) {
            if (typeof raw === 'object' && raw.service && raw.status) {
              delete di.raw;
            } else if (typeof raw === 'string' && raw.includes('service: CrossShot')) {
              delete di.raw;
            }
          }
        } catch (_) {
          // silently ignore any inspection errors
        }

        const screenshot: ScreenshotMeta = {
          id: Date.now().toString(),
          filename: file.filename,
          path: filePath,
          deviceInfo: di,
          timestamp: req.body.timestamp ?? new Date().toISOString(),
          size: file.size,
        };
        // Debug: if deviceInfo is empty, log form fields to help diagnose missing client payloads
        try {
          if (!di || (typeof di === 'object' && Object.keys(di).length === 0)) {
            console.warn('Upload: deviceInfo empty for file', file.filename, 'formKeys=', Object.keys(req.body));
            // also log common identifying headers
            console.debug('Upload headers:', {
              'x-forwarded-for': req.headers['x-forwarded-for'],
              'user-agent': req.headers['user-agent'],
            });
          }
        } catch (_) {}

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
            // normalize header.deviceInfo and merge explicit header fields if provided
            // Build deviceInfo from proxy header fields directly
            let diProxy: any = {};
            if (header && header.deviceInfo !== undefined && header.deviceInfo !== null) {
              const rawHeader = header.deviceInfo;
              if (typeof rawHeader === 'object') diProxy = { ...rawHeader, raw: rawHeader };
              else {
                try {
                  const parsed = JSON.parse(String(rawHeader));
                  if (typeof parsed === 'object' && parsed !== null) diProxy = { ...parsed, raw: parsed };
                  else diProxy.raw = String(rawHeader);
                } catch (_e) {
                  diProxy.raw = String(rawHeader);
                }
              }
            }
            const proxyAllowed = ['platform', 'name', 'model', 'systemVersion', 'identifierForVendor', 'manufacturer', 'version', 'sdkInt', 'brand', 'device'];
            for (const f of proxyAllowed) {
              if (header && Object.prototype.hasOwnProperty.call(header, f) && header[f] !== undefined && header[f] !== null) {
                if (f === 'sdkInt') {
                  const n = Number(header[f]);
                  if (!Number.isNaN(n)) diProxy[f] = n;
                } else {
                  diProxy[f] = header[f];
                }
              }
            }

            // Guard: strip obvious server health payloads from proxy deviceInfo.raw
            try {
              const rawp = (diProxy && (diProxy.raw ?? undefined)) as any;
              if (rawp) {
                if (typeof rawp === 'object' && rawp.service && rawp.status) {
                  delete diProxy.raw;
                } else if (typeof rawp === 'string' && rawp.includes('service: CrossShot')) {
                  delete diProxy.raw;
                }
              }
            } catch (_) {
              // ignore
            }

            const screenshot: ScreenshotMeta = {
              id: Date.now().toString(),
              filename,
              path: savePath,
              deviceInfo: diProxy,
              timestamp: new Date().toISOString(),
              size: stat.size,
            };
            // Debug: if proxy deviceInfo is empty, log header keys to aid diagnosis
            try {
              if (!diProxy || (typeof diProxy === 'object' && Object.keys(diProxy).length === 0)) {
                console.warn('Proxy upload: deviceInfo empty for file', filename, 'headerKeys=', Object.keys(header));
              }
            } catch (_) {}
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
