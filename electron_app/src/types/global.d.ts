import type { CrossShotApi } from '../preload';

declare global {
  interface Window {
    crossShotApi: CrossShotApi;
  }
}

export {};
