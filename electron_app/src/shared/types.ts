export interface DeviceInfo {
  // Common
  platform?: 'android' | 'ios' | string;
  name?: string;
  model?: string;
  brand?: string;
  manufacturer?: string;
  raw?: any;
  // iOS-specific
  systemVersion?: string;
  identifierForVendor?: string;
  // Android-specific
  version?: string;
  sdkInt?: number;
  device?: string;
  // catch-all for additional fields
  [key: string]: any;
}

export interface ScreenshotMeta {
  id: string;
  filename: string;
  path: string;
  deviceInfo: DeviceInfo;
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
