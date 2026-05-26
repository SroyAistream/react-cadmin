# Android native module notes

Implement `CAdminNative` as a React Native native module and map it to the existing Android code:

- `requestRequiredPermissions`: request storage and location permissions currently handled by `LoginActivity`
- `scanWifi`, `getCurrentSsid`, `switchWifi`, `openMobileData`: port behavior from `WifiUtils`
- `getStorageRoots`, `pickSyncDirectory`, `isValidSyncDir`: port behavior from `CAdminApplication` and `FileManagerActivity`
- `startSyncServer`, `stopSyncServer`: port `FileServer` / NanoHTTPD behavior
- `startBackgroundFmaSync`: port `SyncFMADataService`

Android can preserve the broadest feature parity because the existing app already depends on Android-only Wi-Fi and storage APIs.
