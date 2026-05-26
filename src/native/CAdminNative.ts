import {NativeModules} from 'react-native';

type WifiNetwork = {
  ssid: string;
  bssid?: string;
  level?: number;
};

type CAdminNativeModule = {
  requestRequiredPermissions(): Promise<boolean>;
  getCurrentSsid(): Promise<string>;
  scanWifi(): Promise<WifiNetwork[]>;
  switchWifi(ssid: string, password?: string): Promise<boolean>;
  mediaHubRequest(method: string, url: string, body?: string, contentType?: string): Promise<{
    status: number;
    ok: boolean;
    contentType?: string;
    text: string;
  }>;
  openMobileData(): Promise<boolean>;
  getStorageRoots(): Promise<string[]>;
  pickSyncDirectory(): Promise<string | undefined>;
  isValidSyncDir(path: string): Promise<boolean>;
  startSyncServer(path: string): Promise<{host: string; port: number; root: string}>;
  stopSyncServer(): Promise<void>;
  startBackgroundFmaSync(): Promise<void>;
};

const fallback: CAdminNativeModule = {
  async requestRequiredPermissions() {
    return true;
  },
  async getCurrentSsid() {
    return '';
  },
  async scanWifi() {
    return [];
  },
  async switchWifi() {
    return false;
  },
  async mediaHubRequest() {
    throw new Error('Native media hub client is not available');
  },
  async openMobileData() {
    return false;
  },
  async getStorageRoots() {
    return [];
  },
  async pickSyncDirectory() {
    return undefined;
  },
  async isValidSyncDir() {
    return false;
  },
  async startSyncServer(path: string) {
    return {host: '127.0.0.1', port: 8080, root: path};
  },
  async stopSyncServer() {},
  async startBackgroundFmaSync() {}
};

export const CAdminNative: CAdminNativeModule = NativeModules.CAdminNative ?? fallback;


