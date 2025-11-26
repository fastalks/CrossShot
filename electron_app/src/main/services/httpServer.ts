import { app } from 'electron';
import express, { Express, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
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
  private readonly upload: multer.Multer;
  private readonly storageDir: string;
  private readonly screenshots: ScreenshotMeta[] = [];
  private onNewScreenshot?: (screenshots: ScreenshotMeta[]) => void;

  constructor(private readonly port = 8080) {
    this.expressApp = express();
    this.storageDir = path.join(app.getPath('userData'), 'screenshots');

    if (!fs.existsSync(this.storageDir)) {
      fs.mkdirSync(this.storageDir, { recursive: true });
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
        fs.unlinkSync(screenshot.path);
      }

      res.json({ success: true });
    });

    this.expressApp.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', service: 'CrossShot Desktop' });
    });
  }

  start(onNewScreenshot: (screenshots: ScreenshotMeta[]) => void): void {
    this.onNewScreenshot = onNewScreenshot;
    this.server = this.expressApp.listen(this.port, () => {
      console.log(`HTTP server listening on http://localhost:${this.port}`);
    });
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
}

export default HTTPServer;
