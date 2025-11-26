import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { CompareResult, ScreenshotMeta } from './shared/types';

type NewScreenshotHandler = (screenshots: ScreenshotMeta[]) => void;

const api = {
	getScreenshots: (): Promise<ScreenshotMeta[]> => ipcRenderer.invoke('get-screenshots'),
	compareScreenshots: (img1Path: string, img2Path: string): Promise<CompareResult> =>
		ipcRenderer.invoke('compare-screenshots', img1Path, img2Path),
	deleteScreenshot: (id: string): Promise<boolean> =>
		ipcRenderer.invoke('delete-screenshot', id),
	loadScreenshotData: (filePath: string): Promise<string> =>
		ipcRenderer.invoke('read-screenshot', filePath),
	onNewScreenshot: (handler: NewScreenshotHandler): (() => void) => {
		const listener = (_event: IpcRendererEvent, screenshots: ScreenshotMeta[]) => {
			handler(screenshots);
		};

		ipcRenderer.on('new-screenshot', listener);

		return () => {
			ipcRenderer.removeListener('new-screenshot', listener);
		};
	},
};

contextBridge.exposeInMainWorld('crossShotApi', api);

export type CrossShotApi = typeof api;
