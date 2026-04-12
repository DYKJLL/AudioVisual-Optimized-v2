// preload-web.js - Optimized for Drama Sites Performance
const { ipcRenderer } = require('electron');

// --- Anti-Bot Detection ---
Object.defineProperty(navigator, 'webdriver', {
  get: () => false,
});

// --- Constants ---
const STYLE_ID = 'void-dynamic-styles';
const BASE_TAG_SELECTOR = 'base[target="_self"]';
const GUARDIAN_INITIAL_INTERVAL = 100;  // Changed from 50ms to 100ms
const GUARDIAN_SLOW_INTERVAL = 300;     // Changed from 250ms to 300ms
const GUARDIAN_SWITCH_THRESHOLD = 5000;

// --- Extended Blocked Domains for Drama Sites ---
const BLOCKED_DOMAINS = [
  'google-analytics', 'googletagmanager', 'facebook.com', 'doubleclick',
  'adservice', 'ads.', 'analytics.', 'tracking.', 'pixel.',
  'googlesyndication', 'ad.doubleclick', 'pagead2.googlesyndication',
  'adservice.google', 'ads.google', 'partner.googleadservices',
  'tpc.googlesyndication', 'stats.g.doubleclick', 'ads-twitter',
  'analytics.twitter', 'static.ads-twitter', 'connect.facebook',
  'platform.twitter', 'syndication.twitter', 'ads.pubmatic',
  'ads.yahoo', 'analytics.yandex', 'mc.yandex', 'adsserver.adsserver',
  'criteo', 'adnxs', 'adsrvr', 'openx', 'rubiconproject', 'pubmatic',
  'scorecardresearch', 'quantserve', 'newrelic', 'pingdom'
];

// --- Style Injection Module ---
function applyStyles(cssContent) {
  if (!document.head) return;

  if (!document.head.querySelector(BASE_TAG_SELECTOR)) {
    const base = document.createElement('base');
    base.target = '_self';
    document.head.prepend(base);
  }

  let styleElement = document.getElementById(STYLE_ID);
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = STYLE_ID;
    document.head.prepend(styleElement);
  }

  const fixedCssContent = cssContent + `
    /* Fix navigation click issues */
    .site-nav a, .nav-menu a, .header-nav a, .top-nav a, 
    .navigation a, .navbar a, .menu a, .header-menu a,
    .bili-header .nav-link, .bili-header .nav-item,
    .txp_nav a, .txp_header a, .qq-header a {
      pointer-events: auto !important;
      cursor: pointer !important;
    }
    
    .site-nav, .nav-menu, .header-nav, .top-nav, 
    .navigation, .navbar, .menu, .header-menu,
    .bili-header, .txp_nav, .txp_header, .qq-header {
      pointer-events: auto !important;
    }
    
    /* Hide popups and ads */
    #playerPopup, #vipCoversBox, div.iqp-player-vipmask, div.iqp-player-paymask,
    div.iqp-player-loginmask, div[class^=qy-header-login-pop], .covers_cloudCover__ILy8R,
    #videoContent > div.loading_loading__vzq4j, .iqp-player-guide, div.m-iqyGuide-layer,
    .loading_loading__vzq4j, [class*="XPlayer_defaultCover__"], .iqp-controller,
    .plugin_ctrl_txp_bottom, .txp_progress_bar_container, .txp_progress_list, .txp_progress,
    .plugin_ctrl_txp_shadow, .plugin_ctrl_txp_gradient_bottom,
    .txp_full_screen_pause-active, .txp_full_screen_pause-active-mask, .txp_full_screen_pause-active-player,
    .txp_center_controls, .txp-layer-above-control, .txp-layer-dynamic-above-control--on,
    .txp_btn_play, .txp_btn, .txp_popup-active, .txp_popup_content, .mod_player_vip_ads,
    .playlist-overlay-minipay,
    .browser-ver-tip, .videopcg-browser-tips, .qy-player-browser-tip, .iqp-browser-tip,
    .m-pc-down, .m-pc-client, .qy-dialog-container, .iqp-client-guide, .qy-dialog-wrap,
    [class*="shapedPopup_container"], [class*="notSupportedDrm_drmTipsPopBox"],
    [class*="floatPage_floatPage"], #tvgCashierPage, [class*="popwin_fullCover"],
    .bilibili-player-video-wrap, .bilibili-player-video-control, .bilibili-player-electric-panel {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      z-index: -9999 !important;
    }
    
    /* Movie1080.xyz (YingChao) - Fix footer link contrast */
    .friend-links, .friend-link, .links-footer, .footer-links, .site-links,
    footer a, .footer a, [class*="friend"], [class*="link-list"] a, [class*="links"] a {
      color: #ffffff !important;
      background-color: rgba(30, 30, 47, 0.9) !important;
      padding: 8px 12px !important;
      border-radius: 4px !important;
      text-shadow: none !important;
    }
    
    footer, .footer, [class*="footer"] {
      background-color: rgba(30, 30, 47, 0.95) !important;
    }
    
    footer *, .footer *, [class*="footer"] * {
      color: #dcdce4 !important;
    }
    
    /* Ensure high contrast for all text in drama sites */
    body, body * {
      text-shadow: none !important;
    }
  `;
  styleElement.textContent = fixedCssContent;
}

// --- Drama Site Optimizer ---
const DramaSiteOptimizer = {
  isDramaSite() {
    const hostname = window.location.hostname;
    return hostname.includes('movie1080') || hostname.includes('monkey-flix') || 
           hostname.includes('letu') || hostname.includes('ncat21');
  },
  
  // Enhanced resource blocking
  blockUnnecessaryResources() {
    // Block scripts
    const originalAppendChild = Element.prototype.appendChild;
    Element.prototype.appendChild = function(child) {
      if (child.tagName === 'SCRIPT' && child.src) {
        const isBlocked = BLOCKED_DOMAINS.some(d => child.src.includes(d));
        if (isBlocked) {
          console.log('[DramaOptimizer] Blocked script:', child.src);
          return child;
        }
      }
      if (child.tagName === 'LINK' && child.href) {
        const isBlocked = BLOCKED_DOMAINS.some(d => child.href.includes(d));
        if (isBlocked) {
          console.log('[DramaOptimizer] Blocked link:', child.href);
          return child;
        }
      }
      return originalAppendChild.call(this, child);
    };
    
    // Block iframes and lazy load images
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.tagName === 'IFRAME' && node.src) {
            const isBlocked = BLOCKED_DOMAINS.some(d => node.src.includes(d));
            if (isBlocked) {
              node.style.display = 'none';
              node.src = 'about:blank';
              console.log('[DramaOptimizer] Blocked iframe');
            }
          }
          if (node.tagName === 'IMG' && !node.dataset.src) {
            node.dataset.src = node.src;
            node.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
          }
          if (node.tagName === 'SCRIPT' && node.src) {
            const isBlocked = BLOCKED_DOMAINS.some(d => node.src.includes(d));
            if (isBlocked) {
              node.remove();
              console.log('[DramaOptimizer] Removed blocked script');
            }
          }
        }
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  },
  
  // Show enhanced loading overlay
  showLoadingOverlay() {
    if (document.getElementById('drama-loading-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'drama-loading-overlay';
    overlay.innerHTML = `
      <div style="
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        z-index: 2147483646; font-family: 'Microsoft YaHei', sans-serif;
      ">
        <div style="
          width: 60px; height: 60px; border: 4px solid #3a3d5b;
          border-top: 4px solid #ff6768; border-radius: 50%;
          animation: drama-spin 1s linear infinite;
        "></div>
        <div style="margin-top: 20px; color: #dcdce4; font-size: 16px;">正在加载，请稍候...</div>
        <style>
          @keyframes drama-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        </style>
      </div>
    `;
    document.body.appendChild(overlay);
  },
  
  hideLoadingOverlay() {
    const overlay = document.getElementById('drama-loading-overlay');
    if (overlay) {
      overlay.style.opacity = '0';
      overlay.style.transition = 'opacity 0.3s';
      setTimeout(() => overlay.remove(), 300);
    }
  },
  
  // Prefetch links on hover
  prefetchLinks() {
    document.addEventListener('mouseover', (event) => {
      const anchor = event.target.closest('a');
      if (anchor && anchor.href && anchor.href.startsWith('http') && !anchor.dataset.prefetched) {
        anchor.dataset.prefetched = 'true';
        // Use link prefetch instead of fetch
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = anchor.href;
        document.head.appendChild(link);
      }
    }, { passive: true });
  },
  
  init() {
    if (!this.isDramaSite()) return;
    
    this.blockUnnecessaryResources();
    this.prefetchLinks();
    
    // Wait for body to be available before showing overlay
    if (document.body) {
      this.showLoadingOverlay();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        this.showLoadingOverlay();
      });
    }
    
    window.addEventListener('load', () => {
      setTimeout(() => this.hideLoadingOverlay(), 300);
    });
    
    document.addEventListener('click', (event) => {
      const anchor = event.target.closest('a');
      if (anchor && anchor.href && anchor.href.startsWith('http')) {
        console.log('[DramaOptimizer] Link clicked:', anchor.href);
        this.showLoadingOverlay();
        setTimeout(() => this.hideLoadingOverlay(), 8000);
      }
    }, true);
  }
};

// Initialize drama site optimizer
DramaSiteOptimizer.init();

// --- Event Listeners ---
ipcRenderer.on('update-styles', (event, cssContent) => {
  applyStyles(cssContent);
});

// --- Proactive Parse Logic ---
document.addEventListener('click', (event) => {
  if (window.location.hostname.includes('iqiyi.com')) {
    const anchor = event.target.closest('a');
    if (anchor && anchor.href && anchor.href.includes('iqiyi.com/v_')) {
      console.log('[preload-web] Detected iQiyi episode click:', anchor.href);
      ipcRenderer.send('proactive-parse-request', anchor.href);
    }
  }
  if (window.location.hostname.includes('mgtv.com')) {
    const anchor = event.target.closest('a');
    if (anchor && anchor.href && anchor.href.includes('mgtv.com/b/')) {
      console.log('[preload-web] Detected Mango TV episode click:', anchor.href);
      ipcRenderer.send('proactive-parse-request', anchor.href);
    }
  }
}, true);

// --- DOM Observer ---
const domObserver = new MutationObserver(() => {
  if (document.head && !document.head.querySelector(BASE_TAG_SELECTOR)) {
    const base = document.createElement('base');
    base.target = '_self';
    document.head.prepend(base);
  }
});
domObserver.observe(document, { childList: true, subtree: true });

applyStyles('');

// --- Optimized Injection Guardian ---
let currentGuardianInterval = null;
let guardianStartTime = 0;
let injectionSuccessful = false;

function startInjectionGuardian(url) {
  if (currentGuardianInterval) {
    clearInterval(currentGuardianInterval);
    console.log('[Guardian] Cleared previous guardian interval.');
  }

  const iframeId = 'void-player-iframe';
  guardianStartTime = Date.now();
  injectionSuccessful = false;

  currentGuardianInterval = setInterval(() => {
    const elapsed = Date.now() - guardianStartTime;

    // Mute and hide native videos
    document.querySelectorAll('video').forEach(el => {
      try {
        el.muted = true;
        if (!el.paused) el.pause();
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      } catch (e) { }
    });

    // Clean nuisance elements
    const nuisanceSelectors = [
      '#playerPopup', '#vipCoversBox', 'div.iqp-player-vipmask',
      'div.iqp-player-paymask', 'div.iqp-player-loginmask',
      'div[class^=qy-header-login-pop]', '.covers_cloudCover__ILy8R',
      '.iqp-player-guide', 'div.m-iqyGuide-layer',
      '[class*="XPlayer_defaultCover__"]', '.iqp-controller',
      '.plugin_ctrl_txp_bottom', '.txp_progress_bar_container',
      '.txp_full_screen_pause-active', '.txp_center_controls',
      '.mod_player_vip_ads', '.playlist-overlay-minipay',
      '.qy-dialog-container', '.iqp-client-guide',
      '[class*="shapedPopup_container"]', '[class*="floatPage_floatPage"]'
    ];
    document.querySelectorAll(nuisanceSelectors.join(',')).forEach(el => {
      el.style.display = 'none';
      el.style.zIndex = '-9999';
    });

    // Find injection target
    let targetRef = document.querySelector('#mod_player') ||
      document.querySelector('.txp_player') ||
      document.querySelector('.txp_video_container');

    if (!targetRef) {
      const searchList = [
        '#m-player-video-container', '.mgtv-video-container', '.mgtv-player-container',
        '.mgtv-player-wrap', '#mgtv-player', '.mgtv-player',
        '.iqp-player', '#flashbox', '.txp_player_video_wrap',
        '#bilibili-player', '.player-wrap', '#player-container', '#player',
        '.player-container', '.player-view', '.video-wrapper', 'video'
      ];
      for (let s of searchList) {
        const el = document.querySelector(s);
        if (el && el.getBoundingClientRect().width > 10) {
          targetRef = el;
          break;
        }
      }
    }

    if (targetRef) {
      const rect = targetRef.getBoundingClientRect();

      if (rect.width > 50 && rect.height > 50) {
        let iframe = document.getElementById(iframeId);
        if (!iframe || iframe.getAttribute('data-src') !== url) {
          if (iframe) iframe.remove();
          iframe = document.createElement('iframe');
          iframe.id = iframeId;
          iframe.src = url;
          iframe.setAttribute('data-src', url);
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
          iframe.allowFullscreen = true;
          document.body.appendChild(iframe);
          injectionSuccessful = true;
          console.log('[Guardian] Injection successful');
        }

        Object.assign(iframe.style, {
          position: 'fixed',
          top: rect.top + 'px',
          left: rect.left + 'px',
          width: rect.width + 'px',
          height: rect.height + 'px',
          border: 'none',
          zIndex: '2147483647',
          background: '#000'
        });

        // Switch to slower interval after threshold
        if (elapsed > GUARDIAN_SWITCH_THRESHOLD && !injectionSuccessful) {
          clearInterval(currentGuardianInterval);
          currentGuardianInterval = setInterval(() => {
            startInjectionGuardian(url);
          }, GUARDIAN_SLOW_INTERVAL);
        }
      }
    }
  }, GUARDIAN_INITIAL_INTERVAL);
}

// Handle embed video command
ipcRenderer.on('apply-embed-video', (event, url) => {
  console.log('[preload-web] >>> RECEIVED apply-embed-video signal:', url);

  const oldIframe = document.getElementById('void-player-iframe');
  if (oldIframe) {
    oldIframe.remove();
    console.log('[preload-web] Force-cleared old iframe to allow re-parse.');
  }

  startInjectionGuardian(url);
});

// Proactive parse on video page load
(() => {
  const url = window.location.href;
  const isVideoPage = url.includes('iqiyi.com/v_') || url.includes('mgtv.com/b/') || url.includes('v.qq.com/x/cover/');
  if (isVideoPage) {
    ipcRenderer.send('proactive-parse-request', url);
  }
})();
