// preload-ui.js

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('voidAPI', {
  // Updated to accept themeVars and clearHistory
  navigate: (url, isPlatformSwitch = false, themeVars = null, clearHistory = false) => 
    ipcRenderer.send('navigate', { url, isPlatformSwitch, themeVars, clearHistory }),

  resetModule: (url) => ipcRenderer.send('reset-module', url),

  embedVideo: (url) => ipcRenderer.send('embed-video', url),

  goBack: () => ipcRenderer.send('go-back'),
  goForward: () => ipcRenderer.send('go-forward'),
  setViewVisibility: (visible) => ipcRenderer.send('set-view-visibility', visible),

  onUrlUpdate: (callback) => ipcRenderer.on('url-updated', (event, ...args) => callback(...args)),

  onNavStateUpdate: (callback) => ipcRenderer.on('nav-state-updated', (event, ...args) => callback(...args)),

  // Channel for the main process to notify when content is ready
  onLoadFinished: (callback) => ipcRenderer.on('load-finished', () => callback()),

  // Used to sync sidebar state on startup from memory
  onInitSidebarState: (callback) => ipcRenderer.on('init-sidebar-state', (event, ...args) => callback(...args)),

  // Proactive parse bridge
  onFastParseUrl: (callback) => ipcRenderer.on('fast-parse-url', (event, ...args) => callback(...args)),

  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  openExternalLink: (url) => ipcRenderer.send('open-external-link', url),

  checkForUpdates: () => ipcRenderer.send('check-for-updates'),
  downloadUpdate: () => ipcRenderer.send('download-update'),
  quitAndInstall: () => ipcRenderer.send('quit-and-install'),
  onUpdateChecking: (callback) => ipcRenderer.on('update-checking', (event, ...args) => callback(...args)),
  onUpdateAvailable: (callback) => ipcRenderer.on('update-available', (event, ...args) => callback(...args)),
  onUpdateNotAvailable: (callback) => ipcRenderer.on('update-not-available', (event, ...args) => callback(...args)),
  onUpdateDownloadProgress: (callback) => ipcRenderer.on('update-download-progress', (event, ...args) => callback(...args)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update-downloaded', (event, ...args) => callback(...args)),
  onUpdateError: (callback) => ipcRenderer.on('update-error', (event, ...args) => callback(...args)),
  onUpdateDevMode: (callback) => ipcRenderer.on('update-dev-mode', (event, ...args) => callback(...args)),
  closeWindow: () => ipcRenderer.send('close-window'),
  toggleSidebar: (isCollapsed) => ipcRenderer.send('sidebar-toggle', isCollapsed),
  showWindow: () => ipcRenderer.send('show-window'),
  
  // ✅ Settings API (v2.0 - Persistent Storage)
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),
  resetSettings: (key) => ipcRenderer.invoke('settings:reset', key),
  exportSettings: () => ipcRenderer.invoke('settings:export'),
  
  // Settings change listener
  onSettingsChanged: (callback) => ipcRenderer.on('settings:changed', (event, data) => callback(data)),
  
  // ✅ Module Loading State Events (v2.1)
  onModuleLoadingStart: (callback) => ipcRenderer.on('module-loading-start', (event, data) => callback(data)),
  onModuleLoadingComplete: (callback) => ipcRenderer.on('module-loading-complete', (event, data) => callback(data)),
  onModuleLoadingTimeout: (callback) => ipcRenderer.on('module-loading-timeout', (event, data) => callback(data)),
  onModuleLoadingError: (callback) => ipcRenderer.on('module-loading-error', (event, data) => callback(data))
});
