export interface ScreenshotMeta {
  id: string;
  filename: string;
  path: string;
  deviceInfo: string;
  timestamp: string;
  size: number;
}

export interface CompareResult {
  success: boolean;
  diffPixels?: number;
  totalPixels?: number;
  diffPercentage?: number;
  diffImagePath?: string;
  isSame?: boolean;
  error?: string;
  dimensions?: {
    img1: { width: number; height: number };
    img2: { width: number; height: number };
  };
}
