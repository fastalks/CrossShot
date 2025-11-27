import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { CompareResult, ScreenshotMeta } from './shared/types';

type NewScreenshotHandler = (screenshots: ScreenshotMeta[]) => void;
type DeviceSessionHandler = (sessions: { android: string | null; ios: string | null }) => void;

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
	startListen: (platform: 'android' | 'ios', deviceId: string): Promise<{ success: boolean; reason?: string }> =>
		ipcRenderer.invoke('startListen', platform, deviceId),
	stopListen: (platform: 'android' | 'ios', deviceId: string): Promise<{ success: boolean }> =>
		ipcRenderer.invoke('stopListen', platform, deviceId),
	onDeviceSessionUpdate: (handler: DeviceSessionHandler): (() => void) => {
		const listener = (_event: IpcRendererEvent, sessions: { android: string | null; ios: string | null }) => {
			handler(sessions);
		};

		ipcRenderer.on('device-session-update', listener);

		return () => {
			ipcRenderer.removeListener('device-session-update', listener);
		};
	},
	getDeviceSessions: (): Promise<{ android: string | null; ios: string | null }> =>
		ipcRenderer.invoke('getDeviceSessions'),

	// proxy list management
	getProxies: (): Promise<Array<{ host: string; port: number; name?: string }>> => ipcRenderer.invoke('get-proxies'),
	addProxy: (proxy: { host: string; port: number; name?: string }) => ipcRenderer.invoke('add-proxy', proxy),
	removeProxy: (index: number) => ipcRenderer.invoke('remove-proxy', index),

	// screenshot management
	clearAllScreenshots: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('clear-screenshots'),
	openScreenshotsFolder: (): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('open-screenshots-folder'),

};

contextBridge.exposeInMainWorld('crossShotApi', api);

export type CrossShotApi = typeof api;
