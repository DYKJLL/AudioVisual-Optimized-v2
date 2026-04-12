// main.js

const { app, screen, BrowserWindow, BrowserView, ipcMain, session, shell, dialog } = require('electron');

const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');

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
const isDev = !app.isPackaged;

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

// --- Constants ---
const HEALTH_CHECK_DURATION = 5000;
const VIEW_REBUILD_THRESHOLD = 30000;
const MAX_POOL_SIZE = 15;
// --- Site Health Check ---
async function checkSiteHealth(url) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const req = https.request(url, { method: 'HEAD', timeout: HEALTH_CHECK_DURATION }, (res) => {
      const latency = Date.now() - startTime;
      resolve({ healthy: res.statusCode < 500, latency });
    });
    
    req.on('error', () => {
      resolve({ healthy: false, latency: HEALTH_CHECK_DURATION });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ healthy: false, latency: HEALTH_CHECK_DURATION });
    });
    
    req.end();
  });
}

// --- Pre-rendering Logic ---
const viewPool = new Map();
const platformHomePages = [
  'https://v.qq.com',
  'https://www.iqiyi.com',
  'https://www.youku.com',
  'https://www.bilibili.com',
  'https://www.mgtv.com'
];
const dramaSites = [
  { url: 'https://monkey-flix.com/', name: '猴影工坊', timeout: 15000, retry: 2 },
  { url: 'https://www.movie1080.xyz/', name: '影巢movie', timeout: 20000, retry: 3 },
  { url: 'https://www.letu.me/', name: '茉小影', timeout: 15000, retry: 2 },
  { url: 'https://www.ncat21.com/', name: '网飞猫', timeout: 15000, retry: 2 }
];

let isPreloading = false;

// --- View Pool Cleanup ---
function cleanupViewPool() {
  console.log('[ViewPool] Cleaning up stale views...');
  
  if (viewPool.size > MAX_POOL_SIZE) {
    const entries = Array.from(viewPool.entries());
    const toRemove = entries.slice(0, viewPool.size - MAX_POOL_SIZE);
    
    for (const [url, cachedView] of toRemove) {
      if (cachedView && cachedView.webContents && !cachedView.webContents.isDestroyed()) {
        cachedView.webContents.destroy();
      }
      viewPool.delete(url);
      console.log(`[ViewPool] Removed stale view: ${url}`);
    }
  }
}

setInterval(cleanupViewPool, 60000);

async function preloadAllSites() {
  if (isPreloading) return;
  isPreloading = true;
  console.log('[Preload] Starting background pre-rendering...');
  
  const allSiteUrls = [...platformHomePages, ...dramaSites.map(s => s.url)];
  
  for (let i = 0; i < allSiteUrls.length; i++) {
    const url = allSiteUrls[i];
    if (viewPool.has(url)) continue;
    
    const siteConfig = dramaSites.find(s => s.url === url);
    const timeout = siteConfig ? siteConfig.timeout : 8000;
    const maxRetry = siteConfig ? siteConfig.retry : 1;
    
    // Health check before preloading
    const health = await checkSiteHealth(url);
    if (!health.healthy) {
      console.log(`[Preload] Site ${url} not reachable (latency: ${health.latency}ms), skipping preload`);
      continue;
    }
    console.log(`[Preload] Site ${url} reachable, latency: ${health.latency}ms`);
    
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
            console.log(`[Preload] Timeout (${timeout}ms) for ${url}, retry ${retryCount + 1}/${maxRetry}`);
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
          viewPool.set(url, ghostView);
          console.log(`[Preload] Cached: ${url}`);
        } else {
          if (!ghostView.webContents.isDestroyed()) {
            ghostView.webContents.destroy();
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
    
    // Increased delay between preloads to reduce resource contention
    await new Promise(r => setTimeout(r, 500));
  }
  
  isPreloading = false;
  console.log('[Preload] Background pre-rendering complete.');
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

// Helper function to detect video pages
function isVideoPage(url) {
  return url.includes('iqiyi.com/v_') || url.includes('mgtv.com/b/') || url.includes('v.qq.com/x/cover/');
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
        updateZoomFactor(targetView);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('load-finished');
        }
      }
    }
  });

  targetView.webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame) => {
    if (isMainFrame && mainWindow && !mainWindow.isDestroyed() && view === targetView) {
      mainWindow.webContents.send('url-updated', url);
      if (isVideoPage(url)) {
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
    }
  });

  targetView.webContents.on('did-navigate', (event, url) => {
    if (view !== targetView) return;
    console.log('Page navigated to:', url);
    if (isVideoPage(url) && mainWindow) {
      console.log('[Main] Auto-triggering fast-parse for navigation to video page:', url);
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
    let sidebarWidth = Math.max(200, Math.min(Math.floor(contentBounds.width * 0.18), 280));
    if (isSidebarCollapsed) {
      sidebarWidth = 0;
    }
    console.log(`[Main] updateViewBounds. isCollapsed: ${isSidebarCollapsed}, sidebarWidth: ${sidebarWidth}`);

    const topBarHeight = Math.max(50, Math.min(Math.floor(contentBounds.height * 0.07), 65));

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
    const idealWidth = 1400;
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

// --- Load URL with Health Check and Timeout Protection ---
async function loadUrlWithProtection(targetView, url, siteConfig) {
  const timeout = siteConfig ? siteConfig.timeout : 15000;
  let loadTimeoutId = null;
  let isResolved = false;
  
  // Health check for drama sites
  if (siteConfig) {
    const health = await checkSiteHealth(url);
    if (!health.healthy) {
      console.log(`[Load] Site ${url} health check failed, may have connection issues`);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('load-finished');
      }
      return false;
    }
    console.log(`[Load] Site ${url} health check passed, latency: ${health.latency}ms`);
  }
  
  return new Promise((resolve) => {
    loadTimeoutId = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        console.log(`[Load] Timeout for ${url}, sending load-finished`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('load-finished');
        }
        resolve(false);
      }
    }, timeout);
    
    targetView.webContents.once('did-finish-load', () => {
      if (!isResolved) {
        isResolved = true;
        if (loadTimeoutId) clearTimeout(loadTimeoutId);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('load-finished');
        }
        resolve(true);
      }
    });
    
    targetView.webContents.once('did-fail-load', (event, code, desc) => {
      if (!isResolved) {
        isResolved = true;
        if (loadTimeoutId) clearTimeout(loadTimeoutId);
        console.log(`[Load] Failed to load ${url}: ${desc}`);
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('load-finished');
        }
        resolve(false);
      }
    });
    
    targetView.webContents.loadURL(url);
    console.log(`[Load] Loading URL: ${url} with timeout ${timeout}ms`);
  });
}

function createWindow() {
  const windowState = getWindowState();
  if (windowState && windowState.isSidebarCollapsed !== undefined) {
    isSidebarCollapsed = windowState.isSidebarCollapsed;
  }
  const { workAreaSize } = screen.getPrimaryDisplay();
  const initialWidth = Math.min(1440, Math.round(workAreaSize.width * 0.8));
  const initialHeight = Math.min(1000, Math.round(workAreaSize.height * 0.85));

  let windowOptions = {
    width: windowState?.bounds?.width || initialWidth,
    height: windowState?.bounds?.height || initialHeight,
    x: windowState?.bounds?.x,
    y: windowState?.bounds?.y,
    minWidth: 940,
    minHeight: 620,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#11111a',
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

  mainWindow = new BrowserWindow(windowOptions);

  if (windowState?.isMaximized) {
    mainWindow.maximize();
  }

  const saveStateDebounced = debounce(saveWindowState, 500);
  mainWindow.on('resize', saveStateDebounced);
  mainWindow.on('move', saveStateDebounced);
  mainWindow.on('close', saveWindowState);

  ipcMain.once('show-window', () => {
    mainWindow.show();
    mainWindow.webContents.send('init-sidebar-state', isSidebarCollapsed);

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

  ipcMain.on('navigate', async (event, { url, isPlatformSwitch, themeVars, clearHistory }) => {
    if (themeVars) {
      currentThemeCss = `:root { ${Object.entries(themeVars).map(([key, value]) => `${key}: ${value}`).join('; ')} }`;
    }
    console.log(`[Navigate] Received request for ${url}. Clear history: ${clearHistory}`);
    
    const siteConfig = dramaSites.find(s => s.url === url);
    
    if (view) {
      view.webContents.stop();
      view.webContents.setAudioMuted(true);
      mainWindow.removeBrowserView(view);
      
      const currentUrl = view.webContents.getURL();
      if (currentUrl && !viewPool.has(currentUrl)) {
        viewPool.set(currentUrl, view);
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
      viewPool.set(url, view);
    }

    view.webContents.setAudioMuted(false);
    mainWindow.setBrowserView(view);
    updateViewBounds(true);

    if (clearHistory && view.webContents.clearHistory) {
      view.webContents.clearHistory();
      console.log(`[Navigate] History cleared for ${url}`);
    }

    if (!isFromCache) {
      await loadUrlWithProtection(view, url, siteConfig);
      
      if (isVideoPage(url) && mainWindow) {
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

  ipcMain.on('reset-module', (event, url) => {
    console.log(`[Reset Module] Resetting module to: ${url}`);
    
    const siteConfig = dramaSites.find(s => s.url === url);
    
    if (view) {
      view.webContents.stop();
      view.webContents.setAudioMuted(true);
      
      if (view.webContents.clearHistory) {
        view.webContents.clearHistory();
      }
      
      mainWindow.removeBrowserView(view);
      
      const currentUrl = view.webContents.getURL();
      if (currentUrl && !viewPool.has(currentUrl)) {
        viewPool.set(currentUrl, view);
      }
    }
    
    let isFromCache = false;
    if (viewPool.has(url)) {
      view = viewPool.get(url);
      isFromCache = true;
    } else {
      view = createNewBrowserView();
      viewPool.set(url, view);
    }
    
    view.webContents.setAudioMuted(false);
    mainWindow.setBrowserView(view);
    updateViewBounds(true);
    
    if (!isFromCache) {
      loadUrlWithProtection(view, url, siteConfig);
    } else {
      injectThemeCss(view);
      updateZoomFactor(view);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('url-updated', url);
        mainWindow.webContents.send('load-finished');
      }
    }
    
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('url-updated', url);
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

  const debouncedUpdateZoom = debounce(updateZoomFactor, 150);

  const handleResize = () => {
    const isVisible = view && view.getBounds().width > 0;
    updateViewBounds(isVisible);
    if (isVisible) {
      debouncedUpdateZoom(view);
    }
  };

  mainWindow.on('resize', handleResize);
  mainWindow.on('enter-full-screen', handleResize);
  mainWindow.on('leave-full-screen', () => setTimeout(handleResize, 50));

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
      }, 100);
    }
  });

  mainWindow.on('show', () => {
    if (view) {
      updateViewBounds(true);
      setTimeout(() => {
        if (view && view.webContents) {
          view.webContents.focus();
        }
      }, 100);
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
  const twentyFourHours = 24 * 60 * 60 * 1000;
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

  setTimeout(() => {
    preloadAllSites().catch(err => console.error('[Preload] Background preload error:', err));
  }, 100);

  initializeAutoUpdater();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

ipcMain.on('open-external-link', (event, url) => {
  shell.openExternal(url);
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

const isAppPacked = app.isPackaged;

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = false;

try {
  autoUpdater.logger = require('electron-log');
  autoUpdater.logger.transports.file.level = 'info';
} catch (e) {
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

  if (updateCheckTimeout) {
    clearTimeout(updateCheckTimeout);
    updateCheckTimeout = null;
  }

  console.log('[AutoUpdater] Manually checking for updates...');
  console.log('[AutoUpdater] App is packed:', isAppPacked);

  if (!isAppPacked) {
    console.log('[AutoUpdater] Running in development mode, update check is disabled.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      setTimeout(() => {
        mainWindow.webContents.send('update-dev-mode', {
          message: '开发模式下无法检查更新。\n请使用打包后的应用程序进行更新检查。',
          version: app.getVersion()
        });
      }, 500);
    }
    return;
  }

  updateCheckTimeout = setTimeout(() => {
    console.error('[AutoUpdater] Check timeout after 30 seconds');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: '检查更新超时，请检查网络连接或稍后重试。',
        code: 'TIMEOUT'
      });
    }
  }, 30000);
  
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
