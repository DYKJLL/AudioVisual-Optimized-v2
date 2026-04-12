// preload-web.js - 幽灵的职责：只催眠网站
const { ipcRenderer } = require('electron');
// --- Anti-Bot Detection ---
// Overwrite the navigator.webdriver property to prevent detection by services like Cloudflare
Object.defineProperty(navigator, 'webdriver', {
  get: () => false,
});

// --- 样式注入模块 ---

const STYLE_ID = 'void-dynamic-styles';
const BASE_TAG_SELECTOR = 'base[target="_self"]';

/**
 * 在文档头部注入或更新一个<style>标签，并确保<base>标签存在。
 * @param {string} cssContent - 要注入的CSS字符串。
 */
function applyStyles(cssContent) {
  if (!document.head) {
    return; // 如果<head>不存在则提前退出
  }

  // 1. 确保 <base target="_self"> 存在，修正链接跳转行为
  if (!document.head.querySelector(BASE_TAG_SELECTOR)) {
    const base = document.createElement('base');
    base.target = '_self';
    document.head.prepend(base);
  }

  // 2. 查找或创建用于动态样式的<style>标签
  let styleElement = document.getElementById(STYLE_ID);
  if (!styleElement) {
    styleElement = document.createElement('style');
    styleElement.id = STYLE_ID;
    // 插入到<head>的最前面，以确保我们的样式优先级最高
    document.head.prepend(styleElement);
  }

  // 3. 更新样式内容 - 添加修复导航点击的样式和爱奇艺会员弹窗处理
  const fixedCssContent = cssContent + `
    /* 修复腾讯视频和哔哩哔哩导航点击问题 */
    .site-nav a, .nav-menu a, .header-nav a, .top-nav a, 
    .navigation a, .navbar a, .menu a, .header-menu a,
    .bili-header .nav-link, .bili-header .nav-item,
    .txp_nav a, .txp_header a, .qq-header a {
      pointer-events: auto !important;
      cursor: pointer !important;
    }
    
    /* 确保导航容器不阻止点击事件 */
    .site-nav, .nav-menu, .header-nav, .top-nav, 
    .navigation, .navbar, .menu, .header-menu,
    .bili-header, .txp_nav, .txp_header, .qq-header {
      pointer-events: auto !important;
    }
    
    /* 隐藏所有已知视频网站的牛皮癣弹窗、广告和干扰图层 (通杀黑名单) */
    #playerPopup, 
    #vipCoversBox, 
    div.iqp-player-vipmask, 
    div.iqp-player-paymask,
    div.iqp-player-loginmask, 
    div[class^=qy-header-login-pop],
    .covers_cloudCover__ILy8R,
    #videoContent > div.loading_loading__vzq4j,
    .iqp-player-guide,
    div.m-iqyGuide-layer,
    .loading_loading__vzq4j,
    [class*="XPlayer_defaultCover__"],
    .iqp-controller,
    /* 腾讯视频 */
    .plugin_ctrl_txp_bottom, .txp_progress_bar_container, .txp_progress_list, .txp_progress, 
    .plugin_ctrl_txp_shadow, .plugin_ctrl_txp_gradient_bottom, 
    .txp_full_screen_pause-active, .txp_full_screen_pause-active-mask, .txp_full_screen_pause-active-player, 
    .txp_center_controls, .txp-layer-above-control, .txp-layer-dynamic-above-control--on,
    .txp_btn_play, .txp_btn, .txp_popup-active, .txp_popup_content, .mod_player_vip_ads,
    .playlist-overlay-minipay,
    /* 爱奇艺及通用弹窗拦截 */
    .browser-ver-tip, .videopcg-browser-tips, .qy-player-browser-tip, .iqp-browser-tip, 
    .m-pc-down, .m-pc-client, .qy-dialog-container, .iqp-client-guide, .qy-dialog-wrap,
    [class*="shapedPopup_container"], [class*="notSupportedDrm_drmTipsPopBox"],
    [class*="floatPage_floatPage"], #tvgCashierPage, [class*="popwin_fullCover"],
    /* 其他 */
    .bilibili-player-video-wrap, .bilibili-player-video-control, .bilibili-player-electric-panel
    /* 注意：已移除芒果 TV 容器隐藏，防止 0 宽度无法注入 */
    /* .mgtv-player-wrap, .mgtv-player-control-bar, .mgtv-player-data-panel, .mgtv-player-layers, .mgtv-player-ad, .mgtv-player-overlay, #m-player-ad */
    {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
      width: 0 !important;
      height: 0 !important;
      z-index: -9999 !important;
    }
  `;
  styleElement.textContent = fixedCssContent;
}

// --- 戏剧网站优化模块 ---
const DramaSiteOptimizer = {
  originalAppendChild: null,
  observer: null,
  
  isDramaSite() {
    const hostname = window.location.hostname;
    return hostname === 'movie1080.xyz' || hostname.endsWith('.movie1080.xyz') ||
           hostname === 'monkey-flix.com' || hostname.endsWith('.monkey-flix.com') ||
           hostname === 'letu.me' || hostname.endsWith('.letu.me') ||
           hostname === 'ncat21.com' || hostname.endsWith('.ncat21.com');
  },
  
  blockUnnecessaryResources() {
    if (!this.isDramaSite()) return;
    
    const blockedDomains = [
      'google-analytics', 'googletagmanager', 'facebook.com', 'doubleclick',
      'adservice', 'ads.', 'analytics.', 'tracking.', 'pixel.'
    ];
    
    // 保存原始方法以便恢复
    this.originalAppendChild = Element.prototype.appendChild;
    const self = this;
    
    Element.prototype.appendChild = function(child) {
      if (child.tagName === 'SCRIPT' && child.src) {
        const isBlocked = blockedDomains.some(d => child.src.includes(d));
        if (isBlocked) {
          console.log('[DramaOptimizer] Blocked script:', child.src);
          return child;
        }
      }
      return self.originalAppendChild.call(this, child);
    };
    
    // 创建 observer 并保存引用
    this.observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.tagName === 'IFRAME' && node.src) {
            const isBlocked = blockedDomains.some(d => node.src.includes(d));
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
        });
      });
    });
    this.observer.observe(document.documentElement, { childList: true, subtree: true });
  },
  
  cleanup() {
    // 恢复原始 appendChild
    if (this.originalAppendChild) {
      Element.prototype.appendChild = this.originalAppendChild;
      this.originalAppendChild = null;
    }
    // 断开 observer
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  },
  
  showLoadingOverlay() {
    if (document.getElementById('drama-loading-overlay')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'drama-loading-overlay';
    overlay.innerHTML = `
      <div style="
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: #0a0a0f;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        z-index: 2147483646; font-family: 'Microsoft YaHei', sans-serif;
      ">
        <div style="
          width: 60px; height: 60px; border: 4px solid #3a3d5b;
          border-top: 4px solid #ff6768; border-radius: 50%;
          animation: drama-spin 1s linear infinite;
        "></div>
        <div style="margin-top: 20px; color: #dcdce4; font-size: 16px;">正在加载...</div>
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
  
  prefetchLinks() {
    if (!this.isDramaSite()) return;
    
    document.addEventListener('mouseover', (event) => {
      const anchor = event.target.closest('a');
      if (anchor && anchor.href && anchor.href.startsWith('http') && !anchor.dataset.prefetched) {
        anchor.dataset.prefetched = 'true';
        fetch(anchor.href, { method: 'HEAD', mode: 'no-cors' }).catch(() => {});
      }
    }, { passive: true });
  },
  
  init() {
    if (this.isDramaSite()) {
      this.blockUnnecessaryResources();
      this.prefetchLinks();
    }
    
    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
    
    window.addEventListener('load', () => {
      setTimeout(() => this.hideLoadingOverlay(), 500);
    });
    
    document.addEventListener('click', (event) => {
      if (!this.isDramaSite()) return;
      
      const anchor = event.target.closest('a');
      if (anchor && anchor.href && anchor.href.startsWith('http')) {
        console.log('[DramaOptimizer] Link clicked:', anchor.href);
        this.showLoadingOverlay();
        setTimeout(() => this.hideLoadingOverlay(), 10000);
      }
    }, true);
  }
};

// 初始化戏剧网站优化
DramaSiteOptimizer.init();

// --- 事件监听 ---

// 监听主进程推送的样式更新
ipcRenderer.on('update-styles', (event, cssContent) => {
  applyStyles(cssContent);
});

// --- 主动式解析逻辑 ---
// 监听点击事件，主动发现换集行为
document.addEventListener('click', (event) => {
  // 爱奇艺换集检测
  if (window.location.hostname.includes('iqiyi.com')) {
    const anchor = event.target.closest('a');
    if (anchor && anchor.href && anchor.href.includes('iqiyi.com/v_')) {
      console.log('[preload-web] Detected iQiyi episode click:', anchor.href);
      ipcRenderer.send('proactive-parse-request', anchor.href);
    }
  }
  // 芒果 TV 换集检测
  if (window.location.hostname.includes('mgtv.com')) {
    const anchor = event.target.closest('a');
    if (anchor && anchor.href && anchor.href.includes('mgtv.com/b/')) {
      console.log('[preload-web] Detected Mango TV episode click:', anchor.href);
      ipcRenderer.send('proactive-parse-request', anchor.href);
    }
  }
}, true);


// --- DOM 监控 ---

// 使用MutationObserver作为备用方案，确保在DOM动态变化时也能应用样式
const observer = new MutationObserver(() => {
  // 当DOM变化时，我们不主动请求CSS，而是依赖主进程在'dom-ready'时推送。
  // 此处仅用于确保<base>标签在极端情况下也能被添加。
  if (document.head && !document.head.querySelector(BASE_TAG_SELECTOR)) {
    const base = document.createElement('base');
    base.target = '_self';
    document.head.prepend(base);
  }
});

// 启动对整个文档结构的监控
observer.observe(document, { childList: true, subtree: true });

// 页面初始加载时也尝试运行一次，以防万一
applyStyles(''); // 传入空字符串以确保<base>标签被处理

// --- 注入引擎 (优化版：自适应轮询 + MutationObserver) ---

let currentGuardianInterval = null;
let guardianStartTime = 0;
let injectionSuccessful = false;
let domObserver = null;

function stopGuardian() {
  if (currentGuardianInterval) {
    clearInterval(currentGuardianInterval);
    currentGuardianInterval = null;
    console.log('[Guardian] Stopped interval polling');
  }
  if (domObserver) {
    domObserver.disconnect();
    domObserver = null;
    console.log('[Guardian] Stopped MutationObserver');
  }
}

function startInjectionGuardian(url) {
  stopGuardian();
  injectionSuccessful = false;
  
  const iframeId = 'void-player-iframe';
  const iframeSrc = url;
  guardianStartTime = Date.now();
  
  const tryInject = () => {
    if (injectionSuccessful) return true;
    
    document.querySelectorAll('video').forEach(el => {
      try {
        el.muted = true;
        if (!el.paused) el.pause();
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      } catch (e) { }
    });
    
    const nuisanceSelectors = [
      '#playerPopup', '#vipCoversBox', 'div.iqp-player-vipmask',
      'div.iqp-player-paymask', 'div.iqp-player-loginmask',
      '[class*="popwin_fullCover"]', '[class*="shapedPopup_container"]',
      '.mod_player_vip_ads', '.iqp-player-guide'
    ];
    document.querySelectorAll(nuisanceSelectors.join(',')).forEach(el => {
      el.style.display = 'none';
      el.style.zIndex = '-9999';
    });
    
    let targetRef = document.querySelector('#mod_player') ||
      document.querySelector('.txp_player') ||
      document.querySelector('.txp_video_container');
    
    if (!targetRef) {
      const searchList = [
        '#m-player-video-container', '.mgtv-player-container', '.mgtv-player-wrap',
        '.iqp-player', '#flashbox', '#bilibili-player', '.player-wrap',
        '#player-container', '#player', '.player-container', 'video'
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
        if (!iframe || iframe.getAttribute('data-src') !== iframeSrc) {
          if (iframe) iframe.remove();
          iframe = document.createElement('iframe');
          iframe.id = iframeId;
          iframe.src = iframeSrc;
          iframe.setAttribute('data-src', iframeSrc);
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
          iframe.allowFullscreen = true;
          document.body.appendChild(iframe);
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
        
        injectionSuccessful = true;
        console.log('[Guardian] Injection successful, stopping polling');
        return true;
      }
    }
    return false;
  };
  
  // 初始快速轮询 (50ms)，成功后立即停止
  const fastInterval = setInterval(() => {
    const elapsed = Date.now() - guardianStartTime;
    
    if (tryInject()) {
      clearInterval(fastInterval);
      currentGuardianInterval = null;
      return;
    }
    
    // 3秒后降低频率到 200ms
    if (elapsed > 3000) {
      clearInterval(fastInterval);
      currentGuardianInterval = setInterval(() => {
        if (tryInject()) {
          stopGuardian();
        }
      }, 200);
    }
  }, 50);
  
  currentGuardianInterval = fastInterval;
  
  // 使用 MutationObserver 监听 DOM 变化
  domObserver = new MutationObserver(() => {
    if (!injectionSuccessful) {
      tryInject();
    }
  });
  domObserver.observe(document.body, { childList: true, subtree: true });
}

// 核心：处理来自主进程的解析指令
ipcRenderer.on('apply-embed-video', (event, url) => {
  console.log('[preload-web] >>> RECEIVED apply-embed-video signal:', url);
  
  const oldIframe = document.getElementById('void-player-iframe');
  if (oldIframe) {
    oldIframe.remove();
    console.log('[preload-web] Force-cleared old iframe');
  }
  
  startInjectionGuardian(url);
});

// 核心：页面加载的第一时间主动请求解析
(() => {
  const url = window.location.href;
  const isVideoPage = url.includes('iqiyi.com/v_') || url.includes('mgtv.com/b/') || url.includes('v.qq.com/x/cover/');
  if (isVideoPage) {
    ipcRenderer.send('proactive-parse-request', url);
  }
})();
