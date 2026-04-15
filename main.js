// main.js

const { app, screen, BrowserWindow, BrowserView, ipcMain, session, shell, dialog } = require('electron');

const path = require('path');
const fs = require('fs');
const os = require('os');
const Store = require('electron-store');
const config = require('./config');

// ✅ === Settings Persistence System (v2.0) ===
const settingsStore = new Store({
  name: 'user-settings',
  defaults: {
    apiList: [],
    dramaSites: [],
    windowBounds: null,
    lastPlatform: '',
    themeMode: 'parsing'
  },
  encryptionKey: 'bfv2-secure-key-2024'
});

console.log(`[Settings] ✅ Store initialized at: ${settingsStore.path}`);

// Settings IPC Handlers
ipcMain.handle('settings:get', (event, key) => {
  try {
    return { success: true, value: settingsStore.get(key) };
  } catch (error) {
    console.error('[Settings] ❌ Get error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('settings:set', (event, key, value) => {
  try {
    settingsStore.set(key, value);
    console.log(`[Settings] ✅ Saved ${key}:`, typeof value === 'object' ? `[${value.length} items]` : value);
    
    // Broadcast to all windows for real-time sync
    BrowserWindow.getAllWindows().forEach(win => {
      if (!win.isDestroyed()) {
        win.webContents.send('settings:changed', { key, value, timestamp: Date.now() });
      }
    });
    
    return { success: true };
  } catch (error) {
    console.error('[Settings] ❌ Set error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('settings:getAll', () => {
  try {
    const allSettings = {
      apiList: settingsStore.get('apiList') || [],
      dramaSites: settingsStore.get('dramaSites') || [],
      windowBounds: settingsStore.get('windowBounds'),
      lastPlatform: settingsStore.get('lastPlatform'),
      themeMode: settingsStore.get('themeMode')
    };
    return { success: true, data: allSettings };
  } catch (error) {
    console.error('[Settings] ❌ GetAll error:', error);
    return { success: false, error: error.message, data: { apiList: [], dramaSites: [] } };
  }
});

ipcMain.handle('settings:reset', (event, key) => {
    try {
        if (key) {
            // Delete specific key
            settingsStore.delete(key);
        } else {
            // Reset all to defaults
            settingsStore.set('apiList', []);
            settingsStore.set('dramaSites', []);
            settingsStore.set('windowBounds', null);
            settingsStore.set('lastPlatform', '');
            settingsStore.set('themeMode', 'parsing');
        }
        console.log(`[Settings] Reset: ${key || 'all'}`);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
});

ipcMain.handle('settings:export', async () => {
  try {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (!focusedWindow) {
      return { success: false, error: 'No active window' };
    }
    
    const filePath = dialog.showSaveDialogSync(focusedWindow, {
      title: '导出设置',
      defaultPath: 'audiovisual-settings.json',
      filters: [{ name: 'JSON', extensions: ['json'] }]
    });
    
    if (filePath) {
      fs.writeFileSync(filePath, JSON.stringify(settingsStore.store, null, 2));
      return { success: true, path: filePath };
    }
    return { success: false };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
// === End Settings System ===

// --- Debounce Utility ---
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// --- Environment & Security Configuration ---

// 1. Environment Detection
const isDev = false; // Forced to false to disable auto DevTools

// 2. Hardware Acceleration (Re-enabled for performance)
// app.disableHardwareAcceleration(); // Commented out to fix resize flickering issue.

// 3. Command Line Switches
app.commandLine.appendSwitch('disable-blink-features', 'AutomationControlled');
app.commandLine.appendSwitch('no-proxy-server');
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion'); // Fixes some white flashes on Windows

// Development-only switches
if (isDev) {
  console.log('Running in development mode. Applying insecure workarounds.');
  app.commandLine.appendSwitch('ignore-certificate-errors');
}

// 4. Certificate Error Handler
if (isDev) {
  app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
    console.log(`[DEV ONLY] Certificate error for ${url}: ${error}`);
    event.preventDefault();
    callback(true);
  });
}

// --- Application Setup ---
app.setPath('userData', path.join(__dirname, 'userData'));

// --- Widevine CDM Injection ---
function getWidevinePath() {
  const platform = os.platform();
  const arch = os.arch();
  let widevinePath = '';
  const paths = {
    'win32': `${os.homedir()}/AppData/Local/Google/Chrome/User Data/WidevineCdm`,
    'darwin': `${os.homedir()}/Library/Application Support/Google/Chrome/WidevineCdm`,
    'linux': `${os.homedir()}/.config/google-chrome/WidevineCdm`
  };
  if (paths[platform]) {
    if (!fs.existsSync(paths[platform])) return null;
    const versions = fs.readdirSync(paths[platform]).filter(f => fs.statSync(`${paths[platform]}/${f}`).isDirectory());
    if (versions.length > 0) {
      const latestVersion = versions.sort().pop();
      let cdmPath = '';
      if (platform === 'win32') cdmPath = `${paths[platform]}/${latestVersion}/_platform_specific/win_${arch === 'x64' ? 'x64' : 'x86'}/widevinecdm.dll`;
      else if (platform === 'darwin') cdmPath = `${paths[platform]}/${latestVersion}/_platform_specific/mac_${arch}/libwidevinecdm.dylib`;
      else if (platform === 'linux') cdmPath = `${paths[platform]}/${latestVersion}/_platform_specific/linux_${arch}/libwidevinecdm.so`;
      if (fs.existsSync(cdmPath)) return { path: cdmPath, version: latestVersion };
    }
  }
  return null;
}
const widevineInfo = getWidevinePath();
if (widevineInfo) {
  app.commandLine.appendSwitch('widevine-cdm-path', widevineInfo.path);
  app.commandLine.appendSwitch('widevine-cdm-version', widevineInfo.version);
} else {
  console.error('Widevine CDM not found.');
}

let mainWindow;
let view;
let isSidebarCollapsed = false;
let currentThemeCss = `:root { --av-primary-bg: #1e1e2f; --av-accent-color: #3a3d5b; --av-highlight-color: #ff6768; }`;
const scrollbarCss = fs.readFileSync(path.join(__dirname, 'assets', 'css', 'view-style.css'), 'utf8');

// ✅ === LRU BrowserView Pool (Memory Optimized v2.0) ===
const MAX_VIEW_POOL_SIZE = config.VIEW_POOL.MAX_SIZE;
const viewPool = new Map();
let lruOrder = [];

function getLRUKey() {
  return lruOrder.length > 0 ? lruOrder[0] : null;
}

function updateLRU(key) {
  lruOrder = lruOrder.filter(k => k !== key);
  lruOrder.push(key);
}

function evictLRU() {
  const oldestKey = getLRUKey();
  if (oldestKey && viewPool.has(oldestKey)) {
    const oldView = viewPool.get(oldestKey);
    
    if (oldView && oldView.webContents && typeof oldView.webContents.isDestroyed === 'function') {
      if (!oldView.webContents.isDestroyed()) {
        console.log(`[ViewPool] Evicting LRU: ${oldestKey}`);
        try {
          oldView.webContents.destroy();
        } catch (err) {
          console.error(`[ViewPool] Error destroying ${oldestKey}:`, err.message);
        }
      }
    } else {
      console.log(`[ViewPool] Skipping invalid view for: ${oldestKey}`);
    }
    
    viewPool.delete(oldestKey);
    lruOrder.shift();
  }
}

function addToPool(url, viewInstance) {
  // Auto-evict if at capacity
  while (viewPool.size >= MAX_VIEW_POOL_SIZE) {
    evictLRU();
  }
  
  if (viewPool.has(url)) {
    updateLRU(url);
    return viewPool.get(url);
  }
  
  viewPool.set(url, viewInstance);
  updateLRU(url);
  console.log(`[ViewPool] ➕ Added: ${url} (Size: ${viewPool.size}/${MAX_VIEW_POOL_SIZE})`);
  return viewInstance;
}

function getPoolStats() {
    return {
        size: viewPool.size,
        maxSize: MAX_VIEW_POOL_SIZE,
        keys: Array.from(viewPool.keys()),
        memoryEstimate: config.VIEW_POOL.ESTIMATED_MEMORY_PER_VIEW
    };
}
// === End View Pool ===

const platformHomePages = config.PLATFORM_HOME_PAGES;
const dramaSites = config.DRAMA_SITES;

let isPreloading = false;

async function preloadAllSites() {
    if (isPreloading) return;
    isPreloading = true;
    console.log('[Preload] ✨ Starting optimized pre-rendering (LRU mode)...');

    // ✅ Only preload top priority sites (not all)
    const prioritySites = [
        platformHomePages[0], // Tencent (default homepage)
        ...dramaSites.slice(0, config.PRELOAD_PRIORITY_COUNT - 1) // Top drama sites
    ].filter(Boolean);
  
  for (const url of prioritySites) {
    // Stop if pool is already full
    if (viewPool.size >= MAX_VIEW_POOL_SIZE) {
      console.log('[Preload] Pool at capacity, stopping early.');
      break;
    }
    
    if (viewPool.has(url)) continue;
    
    const siteConfig = dramaSites.find(s => s.url === url);
    const timeout = siteConfig ? siteConfig.timeout : 8000;
    const maxRetry = siteConfig ? siteConfig.retry : 1;
    
    let retryCount = 0;
    let loaded = false;
    
    while (retryCount < maxRetry && !loaded) {
      try {
        const ghostView = new BrowserView({
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'assets', 'js', 'preload-web.js'),
            plugins: true,
            webSecurity: false
          }
        });
        ghostView.setBackgroundColor('#1e1e2f');
        attachViewEvents(ghostView);
        
        loaded = await new Promise((resolve) => {
          const loadTimeout = setTimeout(() => {
            console.log(`[Preload] ⏰ Timeout (${timeout}ms) for ${url}, retry ${retryCount + 1}/${maxRetry}`);
            resolve(false);
          }, timeout);
          
          ghostView.webContents.on('did-finish-load', () => {
            clearTimeout(loadTimeout);
            console.log(`[Preload] Successfully loaded: ${url}`);
            resolve(true);
          });
          ghostView.webContents.on('did-fail-load', (event, code, desc) => {
            clearTimeout(loadTimeout);
            console.log(`[Preload] Failed to load ${url}: ${desc}`);
            resolve(false);
          });
          ghostView.webContents.loadURL(url);
        });
        
        if (loaded) {
          addToPool(url, ghostView); // ✅ Use LRU pool manager
        } else {
          if (!ghostView.webContents.isDestroyed()) {
            ghostView.webContents.destroy(); // Immediate cleanup on failure
          }
          retryCount++;
        }
      } catch (error) {
        console.error(`[Preload] Error loading ${url}:`, error.message);
        retryCount++;
      }
      
      if (!loaded && retryCount < maxRetry) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    if (!loaded) {
      console.log(`[Preload] Failed after ${maxRetry} retries: ${url}`);
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  isPreloading = false;
  console.log(`[Preload] ✅ Complete. ${getPoolStats().size}/${MAX_VIEW_POOL_SIZE} views cached.`);
  console.log(`[Preload] 📊 Stats:`, getPoolStats());
}

function injectThemeCss(targetView) {
  if (targetView && targetView.webContents && !targetView.webContents.isDestroyed()) {
    const nuisanceCss = `
      /* 强制隐藏已知顽固弹窗 */
      [class*="popwin_fullCover"], 
      [class*="shapedPopup_container"], 
      [class*="notSupportedDrm_drmTipsPopBox"],
      [class*="floatPage_floatPage"], 
      #tvgCashierPage,
      .browser-ver-tip, 
      .qy-dialog-container,
      .iqp-player-guide,
      .mgtv-player-layers, .mgtv-player-ad, .mgtv-player-overlay, #m-player-ad {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        width: 0 !important;
        height: 0 !important;
        z-index: -9999 !important;
      }
    `;
    const combinedCss = currentThemeCss + '\n' + scrollbarCss + '\n' + nuisanceCss;
    targetView.webContents.insertCSS(combinedCss).catch(console.error);
  }
}

function attachViewEvents(targetView) {
  if (!targetView || !targetView.webContents || targetView.webContents.isDestroyed()) {
    return;
  }

  targetView.webContents.on('dom-ready', () => {
    if (targetView && targetView.webContents && !targetView.webContents.isDestroyed()) {
      injectThemeCss(targetView);
      if (view === targetView) {
        updateViewBounds(true);
        updateZoomFactor(targetView); // Set initial zoom
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('load-finished');
        }
      }
    }
  });

  targetView.webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
    if (isMainFrame && mainWindow && !mainWindow.isDestroyed() && view === targetView) {
      mainWindow.webContents.send('url-updated', url);
      // 核心：页面加载的第一时间主动请求解析，解决“第一次注入慢”
      targetView.webContents.executeJavaScript(`
        (() => {
          const url = window.location.href;
          const isVideoPage = url.includes('iqiyi.com/v_') || url.includes('mgtv.com/b/') || url.includes('v.qq.com/x/cover/');
          if (isVideoPage) {
            ipcRenderer.send('proactive-parse-request', url);
          }
        })();
      `);
    }
  });

  targetView.webContents.on('did-navigate', (event, url) => {
    if (view !== targetView) return;
    console.log('Page navigated to:', url);
    if ((url.includes('iqiyi.com/v_') || url.includes('mgtv.com/b/') || url.includes('v.qq.com/x/cover/')) && mainWindow) {
      console.log('[Main] Auto-triggering fast-parse for navigation to video page:', url);
      mainWindow.webContents.send('fast-parse-url', url);
    }
    // 附加保障：did-navigate 时也补一次脉冲
    if ((url.includes('iqiyi.com/v_') || url.includes('mgtv.com/b/') || url.includes('v.qq.com/x/cover/')) && mainWindow) {
      mainWindow.webContents.send('fast-parse-url', url);
    }
    if (url.includes('iqiyi.com/v_') && url.includes('.html')) {
      console.log('iQiyi redirected to correct video page:', url);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('url-updated', url);
      }
    }
  });

  targetView.webContents.on('did-navigate-in-page', (event, url) => {
    if (view !== targetView) return;
    console.log('Page navigated in-page to:', url);
  });

  targetView.webContents.setWindowOpenHandler(({ url }) => {
    if (view !== targetView) return { action: 'deny' };
    if (targetView && targetView.webContents && !targetView.webContents.isDestroyed()) {
      console.log(`[WindowOpenHandler] Intercepted new window for URL: ${url}. Loading in current view and forcing re-parse.`);
      targetView.webContents.loadURL(url);
      updateViewBounds(true);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('fast-parse-url', url);
      }
    }
    return { action: 'deny' };
  });

  const updateNavigationState = () => {
    if (view !== targetView) return;
    if (mainWindow && !mainWindow.isDestroyed() && targetView && targetView.webContents && !targetView.webContents.isDestroyed()) {
      const navState = {
        canGoBack: targetView.webContents.canGoBack(),
        canGoForward: targetView.webContents.canGoForward()
      };
      mainWindow.webContents.send('nav-state-updated', navState);
    }
  };
  targetView.webContents.on('did-navigate', updateNavigationState);
  targetView.webContents.on('did-navigate-in-page', updateNavigationState);
}

function updateViewBounds(isVisible = true) {
    if (!mainWindow || !view) return;
    const isFullScreen = mainWindow.isFullScreen();
    if (isFullScreen) {
        const bounds = mainWindow.getBounds();
        view.setBounds({ x: 0, y: 0, width: bounds.width, height: bounds.height });
    } else {
        const contentBounds = mainWindow.getContentBounds();
        // Responsive layout calculation logic, consistent with style.css
        // Sidebar width: clamp(200px, 18vw, 280px)
        let sidebarWidth = Math.max(config.SIDEBAR.MIN_WIDTH, Math.min(Math.floor(contentBounds.width * config.SIDEBAR.WIDTH_PERCENT), config.SIDEBAR.MAX_WIDTH));
        if (isSidebarCollapsed) {
            sidebarWidth = 0;
        }
        console.log(`[Main] updateViewBounds. isCollapsed: ${isSidebarCollapsed}, sidebarWidth: ${sidebarWidth}`);

        // Top bar height: clamp(50px, 7vh, 65px)
        const topBarHeight = Math.max(config.TOP_BAR.MIN_HEIGHT, Math.min(Math.floor(contentBounds.height * config.TOP_BAR.HEIGHT_PERCENT), config.TOP_BAR.MAX_HEIGHT));

    if (isVisible) {
      view.setBounds({
        x: sidebarWidth,
        y: topBarHeight,
        width: contentBounds.width - sidebarWidth,
        height: contentBounds.height - topBarHeight
      });
    } else {
      view.setBounds({ x: sidebarWidth, y: topBarHeight, width: 0, height: 0 });
    }
  }
}

function updateZoomFactor(targetView) {
    if (!targetView || !targetView.webContents || targetView.webContents.isDestroyed()) {
        return;
    }
    const viewBounds = targetView.getBounds();
    const viewWidth = viewBounds.width;
    if (viewWidth > 0) {
        const idealWidth = config.ZOOM.IDEAL_WIDTH; // Assumed ideal width for video websites
        const zoomFactor = viewWidth / idealWidth;
        targetView.webContents.setZoomFactor(zoomFactor);
        console.log(`[Zoom] View width is ${viewWidth}, setting zoom to ${zoomFactor.toFixed(2)}`);
    }
}

function createNewBrowserView() {
  const newView = new BrowserView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'assets', 'js', 'preload-web.js'),
      plugins: true,
      webSecurity: false,
      backgroundThrottling: false
    }
  });
  attachViewEvents(newView);

  if (isDev) {
    newView.webContents.openDevTools({ mode: 'detach' });
  }

  newView.setBackgroundColor('#1e1e2f');
  return newView;
}

// --- Window State Persistence ---
function getWindowState() {
  try {
    const stateFile = path.join(app.getPath('userData'), 'window-state.json');
    if (fs.existsSync(stateFile)) {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    }
  } catch (e) {
    console.error('Failed to read window state:', e);
  }
  return null;
}

function saveWindowState() {
  if (mainWindow) {
    try {
      const stateFile = path.join(app.getPath('userData'), 'window-state.json');
      const state = {
        bounds: mainWindow.getBounds(),
        isMaximized: mainWindow.isMaximized(),
        isSidebarCollapsed: isSidebarCollapsed
      };
      fs.writeFileSync(stateFile, JSON.stringify(state));
    } catch (e) {
      console.error('Failed to save window state:', e);
    }
  }
}

function createWindow() {
    const windowState = getWindowState();
    if (windowState && windowState.isSidebarCollapsed !== undefined) {
        isSidebarCollapsed = windowState.isSidebarCollapsed;
    }
    const { workAreaSize } = screen.getPrimaryDisplay();
    const initialWidth = Math.min(config.UI.INITIAL_WIDTH_MAX, Math.round(workAreaSize.width * config.UI.INITIAL_WIDTH_PERCENT));
    const initialHeight = Math.min(config.UI.INITIAL_HEIGHT_MAX, Math.round(workAreaSize.height * config.UI.INITIAL_HEIGHT_PERCENT));

    let windowOptions = {
        width: windowState?.bounds?.width || initialWidth,
        height: windowState?.bounds?.height || initialHeight,
        x: windowState?.bounds?.x,
        y: windowState?.bounds?.y,
        minWidth: config.UI.MIN_WIDTH,
        minHeight: config.UI.MIN_HEIGHT,
        frame: false,
        titleBarStyle: 'hidden',
        backgroundColor: '#11111a', // Solid base color matching our CSS
        webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            preload: path.join(__dirname, 'assets', 'js', 'preload-ui.js')
        },
        title: "AudioVisual",
        icon: path.join(__dirname, 'assets', 'images', 'icon.png'),
        show: false
    };

  const { nativeTheme } = require('electron');
  // Removed forced dark mode to allow following system theme

  mainWindow = new BrowserWindow(windowOptions);

  if (windowState?.isMaximized) {
    mainWindow.maximize();
  }

    const saveStateDebounced = debounce(saveWindowState, config.INTERVALS.WINDOW_STATE_SAVE_DEBOUNCE);
  mainWindow.on('resize', saveStateDebounced);
  mainWindow.on('move', saveStateDebounced);
  mainWindow.on('close', saveWindowState);

  ipcMain.once('show-window', () => {
    mainWindow.show();
    mainWindow.webContents.send('init-sidebar-state', isSidebarCollapsed);

    // Attach view right away since we no longer have a manual fade-in
    if (view) {
      mainWindow.setBrowserView(view);
      updateViewBounds(true);
    }

    if (isDev) {
      mainWindow.webContents.openDevTools({ mode: 'detach' });
    }
  });

  mainWindow.loadFile('index.html');
  mainWindow.setMenu(null);

  view = createNewBrowserView();
  // mainWindow.setBrowserView(view); // Deferred to ready-to-show
  // updateViewBounds(false); // Deferred to ready-to-show

  ipcMain.on('minimize-window', () => mainWindow.minimize());
  ipcMain.on('maximize-window', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on('close-window', () => mainWindow.close());

  ipcMain.on('sidebar-toggle', (event, collapsed) => {
    isSidebarCollapsed = collapsed;
    updateViewBounds(true);
  });

  ipcMain.on('set-view-visibility', (event, visible) => {
    if (visible) {
      if (view && mainWindow) {
        mainWindow.setBrowserView(view);
        view.webContents.setAudioMuted(false);
        updateViewBounds(true);
      }
    } else {
      if (view && mainWindow) {
        console.log('[Visibility] Hiding view by detaching and muting it.');
        view.webContents.setAudioMuted(true);
        mainWindow.removeBrowserView(view);
      }
    }
  });

    // ✅ === Navigation Handler (Stable v2.5) ===
    ipcMain.on('navigate', async (event, { url, isPlatformSwitch, themeVars, clearHistory }) => {
        if (themeVars) {
            currentThemeCss = `:root { ${Object.entries(themeVars).map(([key, value]) => `${key}: ${value}`).join('; ')} }`;
        }
        console.log(`[Navigate] Received request for ${url}. Clear history: ${clearHistory}`);

        const siteConfig = dramaSites.find(s => s.url === url);
        const isDramaSite = siteConfig !== undefined;

        if (view) {
            view.webContents.stop();
            view.webContents.setAudioMuted(true);
            mainWindow.removeBrowserView(view);

            const currentUrl = view.webContents.getURL();
            if (currentUrl && !viewPool.has(currentUrl)) {
                addToPool(currentUrl, view);
            }
        }

        let isFromCache = false;
        if (viewPool.has(url)) {
            console.log(`[Navigate] Using cached view for ${url}.`);
            view = viewPool.get(url);
            isFromCache = true;
        } else {
            console.log(`[Navigate] Creating a fresh BrowserView for ${url}.`);
            view = createNewBrowserView();
            addToPool(url, view);
        }

        view.webContents.setAudioMuted(false);
        mainWindow.setBrowserView(view);
        updateViewBounds(true);

        if (clearHistory && view.webContents.clearHistory) {
            view.webContents.clearHistory();
            console.log(`[Navigate] History cleared for ${url}`);
        }

        if (!isFromCache) {
            const timeout = siteConfig ? siteConfig.timeout : config.TIMEOUTS.DRAMA_SITE_DEFAULT;
            let loadTimeoutId = null;

            loadTimeoutId = setTimeout(() => {
                console.log(`[Navigate] Load timeout for ${url}, sending load-finished anyway`);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('load-finished');
                }
            }, timeout);

            view.webContents.once('did-finish-load', () => {
                if (loadTimeoutId) clearTimeout(loadTimeoutId);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('load-finished');
                }
            });

            view.webContents.once('did-fail-load', (loadEvent, code, desc) => {
                if (loadTimeoutId) clearTimeout(loadTimeoutId);
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('load-finished');
                }
            });

            view.webContents.loadURL(url);
            console.log(`[Navigate] Loading URL: ${url} with timeout ${timeout}ms`);

            if ((url.includes('iqiyi.com/v_') || url.includes('mgtv.com/b/') || url.includes('v.qq.com/x/cover/')) && mainWindow) {
                console.log('[Navigate] Extreme Speed: Early pulse for initial load:', url);
                mainWindow.webContents.send('fast-parse-url', url);
            }
        } else {
            console.log(`[Navigate] Activating cached URL: ${url}`);
            injectThemeCss(view);
            updateZoomFactor(view);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('url-updated', url);
                mainWindow.webContents.send('load-finished');
            }
        }
    });

    // ✅ === Reset Module Handler (Stable v2.5) ===
    ipcMain.on('reset-module', (event, url) => {
        console.log(`[Reset Module] Resetting module to: ${url}`);

        const siteConfig = dramaSites.find(s => s.url === url);
        const isHeavySite = config.HEAVY_SITES.some(site => url.includes(site));

        if (view) {
            view.webContents.stop();
            view.webContents.setAudioMuted(true);

            if (view.webContents.clearHistory) {
                view.webContents.clearHistory();
            }

            mainWindow.removeBrowserView(view);

            const currentUrl = view.webContents.getURL();
            if (currentUrl && !viewPool.has(currentUrl)) {
                addToPool(currentUrl, view);
            }
        }

        let isFromCache = false;
        if (viewPool.has(url)) {
            view = viewPool.get(url);
            isFromCache = true;
        } else {
            view = createNewBrowserView();
            addToPool(url, view);
        }

        view.webContents.setAudioMuted(false);
        mainWindow.setBrowserView(view);
        updateViewBounds(true);

        if (!isFromCache) {
            const timeout = isHeavySite ? config.TIMEOUTS.HEAVY_SITE : (siteConfig ? siteConfig.timeout : config.TIMEOUTS.DRAMA_SITE_DEFAULT);
            let loadTimeoutId = null;
            let hasTimedOut = false;

            console.log(`[Reset Module] ⏱️ Timeout set to ${timeout/1000}s for: ${url} (heavy: ${isHeavySite})`);

            loadTimeoutId = setTimeout(() => {
                hasTimedOut = true;
                console.log(`[Reset Module] ⚠️ Load timeout reached (${timeout/1000}s) for ${url}`);

                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('load-finished');
                    mainWindow.webContents.send('module-loading-timeout', { url, timeout });
                }
            }, timeout);

            view.webContents.once('did-finish-load', (loadEvent) => {
                if (loadTimeoutId) clearTimeout(loadTimeoutId);

                console.log(`[Reset Module] ✅ Page loaded: ${url} (timeout=${hasTimedOut ? 'YES' : 'NO'})`);

                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('load-finished');
                    mainWindow.webContents.send('module-loading-complete', { url });
                }

                injectThemeCss(view);
                updateZoomFactor(view);
            });

            view.webContents.once('did-fail-load', (loadEvent, code, desc) => {
                if (loadTimeoutId) clearTimeout(loadTimeoutId);
                console.log(`[Reset Module] ❌ Failed to load: ${url} - ${desc}`);

                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('load-finished');
                    mainWindow.webContents.send('module-loading-error', { url, error: desc });
                }
            });

            console.log(`[Reset Module] 🚀 Loading URL: ${url} (timeout: ${timeout}ms, heavy: ${isHeavySite})`);
            view.webContents.loadURL(url);
        } else {
            console.log(`[Reset Module] ♻️ Using cached view for: ${url}`);
            injectThemeCss(view);
            updateZoomFactor(view);
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('url-updated', url);
                mainWindow.webContents.send('load-finished');
                mainWindow.webContents.send('module-loading-complete', { url, fromCache: true });
            }
        }

        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('nav-state-updated', { canGoBack: false, canGoForward: false });
        }
    });

  ipcMain.on('go-back', () => {
    if (view && view.webContents.canGoBack()) view.webContents.goBack();
  });
  ipcMain.on('go-forward', () => {
    if (view && view.webContents.canGoForward()) view.webContents.goForward();
  });

  ipcMain.on('proactive-parse-request', (event, url) => {
    console.log('[main.js] Received proactive parse request for:', url);
    updateViewBounds(true);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('fast-parse-url', url);
    }
  });

  ipcMain.on('embed-video', (event, url) => {
    if (view && view.webContents && !view.webContents.isDestroyed()) {
      console.log('[Main] Sending apply-embed-video to view for:', url);
      view.webContents.send('apply-embed-video', url);
    }
  });

    const debouncedUpdateZoom = debounce(updateZoomFactor, config.INTERVALS.ZOOM_UPDATE_DEBOUNCE);

  const handleResize = () => {
    const isVisible = view && view.getBounds().width > 0;
    updateViewBounds(isVisible); // Update bounds immediately
    if (isVisible) {
      debouncedUpdateZoom(view); // Debounce zoom factor updates
    }
  };

  mainWindow.on('resize', handleResize);
  mainWindow.on('enter-full-screen', handleResize);
  mainWindow.on('leave-full-screen', () => setTimeout(handleResize, config.INTERVALS.PRELOAD_DELAY));

  mainWindow.on('minimize', () => {
    if (view) {
      view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  });

    mainWindow.on('restore', () => {
        if (view) {
            updateViewBounds(true);
            setTimeout(() => {
                if (view && view.webContents) {
                    view.webContents.focus();
                }
            }, config.INTERVALS.SHOW_WINDOW_DELAY);
        }
    });

    mainWindow.on('show', () => {
        if (view) {
            updateViewBounds(true);
            setTimeout(() => {
                if (view && view.webContents) {
                    view.webContents.focus();
                }
            }, config.INTERVALS.SHOW_WINDOW_DELAY);
        }
    });
}

app.whenReady().then(async () => {
  await session.defaultSession.clearStorageData();
  await session.defaultSession.clearCache();

  const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    details.requestHeaders['User-Agent'] = userAgent;
    callback({ requestHeaders: details.requestHeaders });
  });

  const filter = { urls: ['*://*/*'] };
  session.defaultSession.webRequest.onHeadersReceived(filter, (details, callback) => {
    if (details.responseHeaders) {
      const headersToLower = Object.keys(details.responseHeaders).reduce((acc, key) => {
        acc[key.toLowerCase()] = key;
        return acc;
      }, {});

      if (headersToLower['content-security-policy']) {
        delete details.responseHeaders[headersToLower['content-security-policy']];
      }
      if (headersToLower['x-frame-options']) {
        delete details.responseHeaders[headersToLower['x-frame-options']];
      }
    }
    callback({ responseHeaders: details.responseHeaders });
  });

    const cacheInfoPath = path.join(app.getPath('userData'), 'cache_info.json');
    const twentyFourHours = config.CACHE.VALID_DURATION;
    let cacheIsValid = false;

  if (fs.existsSync(cacheInfoPath)) {
    try {
      const cacheInfo = JSON.parse(fs.readFileSync(cacheInfoPath, 'utf8'));
      if (cacheInfo.lastPreloadTimestamp && (Date.now() - cacheInfo.lastPreloadTimestamp < twentyFourHours)) {
        cacheIsValid = true;
        console.log('Pre-rendering cache is still valid.');
      }
    } catch (error) {
      console.error('Error reading cache info file:', error);
    }
  }

  createWindow();

  if (!cacheIsValid) {
    console.log('Cache is missing or stale. Clearing session cache...');
    await session.defaultSession.clearCache();
    try {
      fs.writeFileSync(cacheInfoPath, JSON.stringify({ lastPreloadTimestamp: Date.now() }));
      console.log('Updated session cache timestamp.');
    } catch (error) {
      console.error('Error writing cache info file:', error);
    }
  }

    // Unconditionally preload sites on startup, regardless of session cache validity
    // Run preloading in background without blocking
    setTimeout(() => {
        preloadAllSites().catch(err => console.error('[Preload] Background preload error:', err));
    }, config.INTERVALS.PRELOAD_DELAY);

  // Initialize auto updater after window is ready
  initializeAutoUpdater();
});

app.on('window-all-closed', () => {
  // ✅ Clean up all cached BrowserViews to prevent memory leaks
  console.log('[ViewPool] 🧹 Cleaning up all cached views on exit...');
  viewPool.forEach((viewInstance, url) => {
    // ✅ 安全检查：确保 viewInstance 和 webContents 都有效
    if (viewInstance && viewInstance.webContents && typeof viewInstance.webContents.isDestroyed === 'function') {
      if (!viewInstance.webContents.isDestroyed()) {
        console.log(`[ViewPool] Destroying: ${url}`);
        try {
          viewInstance.webContents.destroy();
        } catch (err) {
          console.error(`[ViewPool] ⚠️ Error destroying ${url}:`, err.message);
        }
      }
    } else {
      console.log(`[ViewPool] Skipping invalid view: ${url}`);
    }
  });
  viewPool.clear();
  lruOrder = [];
  console.log('[ViewPool] ✅ Cleanup complete.');
  
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.on('open-external-link', (event, url) => {
    // Security: Validate URL protocol whitelist
    try {
        const parsedUrl = new URL(url);
        if (['http:', 'https:'].includes(parsedUrl.protocol)) {
            shell.openExternal(url);
        } else {
            console.warn('[Security] Blocked non-HTTP(S) URL:', url);
        }
    } catch (err) {
        console.error('[Security] Invalid URL:', url);
    }
});
ipcMain.on('check-for-updates', () => {
  checkUpdate();
});

ipcMain.on('download-update', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.on('quit-and-install', () => {
  autoUpdater.quitAndInstall();
});

// --- Auto Updater ---
const { autoUpdater } = require('electron-updater');

// 检测是否为开发模式（应用未打包）
const isAppPacked = app.isPackaged;

// 配置 autoUpdater
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

// 添加日志以便调试（如果 electron-log 可用）
try {
  autoUpdater.logger = require('electron-log');
  autoUpdater.logger.transports.file.level = 'info';
} catch (e) {
  // electron-log 不可用，使用 console
  autoUpdater.logger = console;
}

let isUpdaterInitialized = false;
let updateCheckTimeout = null;

function initializeAutoUpdater() {
  if (isUpdaterInitialized) {
    return;
  }

  console.log('[AutoUpdater] Initializing auto updater...');
  console.log('[AutoUpdater] Current version:', app.getVersion());
  console.log('[AutoUpdater] Update feed URL:', `https://github.com/${autoUpdater.getFeedURL?.() || 'RemotePinee/AudioVisual'}`);

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Checking for updates...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-checking');
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Update available:', info.version);
    if (updateCheckTimeout) {
      clearTimeout(updateCheckTimeout);
      updateCheckTimeout = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', info);
    }
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('[AutoUpdater] Update not available. Current version:', info.version);
    if (updateCheckTimeout) {
      clearTimeout(updateCheckTimeout);
      updateCheckTimeout = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available');
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const logMessage = `Downloaded ${Math.floor(progressObj.percent)}% (${Math.floor(progressObj.transferred / 1024 / 1024)}MB / ${Math.floor(progressObj.total / 1024 / 1024)}MB)`;
    console.log('[AutoUpdater]', logMessage);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', progressObj);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Update downloaded:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded');
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[AutoUpdater] Error:', err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      // 提供更友好的错误信息
      const errorMessage = err.message || err.toString();
      mainWindow.webContents.send('update-error', {
        message: errorMessage,
        code: err.code,
        stack: err.stack
      });
    }
  });

  isUpdaterInitialized = true;
  console.log('[AutoUpdater] Initialization complete.');
}

function checkUpdate() {
  if (!isUpdaterInitialized) {
    initializeAutoUpdater();
  }

  // 清除之前的超时定时器
  if (updateCheckTimeout) {
    clearTimeout(updateCheckTimeout);
    updateCheckTimeout = null;
  }

  console.log('[AutoUpdater] Manually checking for updates...');
  console.log('[AutoUpdater] App is packed:', isAppPacked);

  // 开发模式下的特殊处理
  if (!isAppPacked) {
    console.log('[AutoUpdater] Running in development mode, update check is disabled.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      // 延迟一下让用户看到"检查中"状态
      setTimeout(() => {
        mainWindow.webContents.send('update-dev-mode', {
          message: '开发模式下无法检查更新。\n请使用打包后的应用程序进行更新检查。',
          version: app.getVersion()
        });
      }, 500);
    }
    return;
  }

  // 设置30秒超时，防止一直卡住
  updateCheckTimeout = setTimeout(() => {
    console.error('[AutoUpdater] Check timeout after 30 seconds');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: '检查更新超时，请检查网络连接或稍后重试。',
        code: 'TIMEOUT'
      });
    }
  }, config.TIMEOUTS.UPDATE_CHECK);
  
  try {
    autoUpdater.checkForUpdates()
      .then(result => {
        console.log('[AutoUpdater] Check result:', result);
      })
      .catch(err => {
        console.error('[AutoUpdater] Check failed:', err);
        if (updateCheckTimeout) {
          clearTimeout(updateCheckTimeout);
          updateCheckTimeout = null;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-error', {
            message: err.message || '检查更新失败，请检查网络连接或稍后重试。',
            code: err.code
          });
        }
      });
  } catch (err) {
    console.error('[AutoUpdater] Check failed (sync error):', err);
    if (updateCheckTimeout) {
      clearTimeout(updateCheckTimeout);
      updateCheckTimeout = null;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: err.message || '检查更新失败，请检查网络连接或稍后重试。',
        code: err.code
      });
    }
  }
}
