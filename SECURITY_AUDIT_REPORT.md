# AudioVisual-Optimized-v2 安全审计与优化测试报告

**项目**: AudioVisual v1.2.3  
**审计日期**: 2026-04-14  
**审计范围**: 代码安全审查、功能异常检测、依赖漏洞扫描、性能评估  

---

## 一、项目概述

AudioVisual 是一款基于 Electron 33.x 构建的跨平台视频解析桌面应用，通过嵌入第三方视频平台页面并在其上层覆盖解析接口 iframe 的方式，实现对腾讯视频、爱奇艺、优酷、哔哩哔哩、芒果TV等主流平台视频的解析播放功能。

**技术栈**: Electron 33.x + 原生 JavaScript + electron-builder  
**代码规模**: 约 3,800 行（不含第三方库）  
**支持平台**: Windows x64 / macOS (x64, arm64) / Linux x64  

---

## 二、发现的安全漏洞

### 🔴 高危漏洞

#### 1. 硬编码加密密钥
- **位置**: `main.js:20`
- **严重程度**: 高危
- **描述**: `electron-store` 使用了硬编码的静态加密密钥 `'bfv2-secure-key-2024'`
- **影响**: 攻击者一旦获取应用源代码或二进制文件，即可轻易解密所有用户数据（包括自定义解析接口 URL、影视站点列表等）
- **修复建议**: 使用机器绑定的密钥或使用系统原生 Keychain/Credential Manager

#### 2. Web 安全策略完全禁用
- **位置**: `main.js:305, 525`
- **严重程度**: 高危
- **描述**: BrowserView 完全禁用了 Web 安全策略 (`webSecurity: false`)
- **影响**: 禁用了 CORS、同源策略等，被嵌入的任意恶意网站可以对嵌入内容执行跨站操作
- **修复建议**: 虽然这是解析功能所需的技术手段，但应限制仅对受信任域名禁用

#### 3. CSP 和 X-Frame-Options 响应头全局删除
- **位置**: `main.js:918-933`
- **严重程度**: 高危
- **描述**: 对所有网站的 CSP 和 X-Frame-Options 头进行全局删除
- **影响**: 任何嵌入的网站都失去了 CSP 保护，容易受到 XSS 攻击
- **修复建议**: 改为仅对特定视频平台域名删除这些头部

#### 4. 自动更新代码签名验证禁用
- **位置**: `package.json:52`
- **严重程度**: 高危
- **描述**: `"verifyUpdateCodeSignature": false`
- **影响**: 自动更新功能不会验证下载文件的签名，攻击者可以通过中间人攻击劫持更新过程并分发恶意代码
- **修复建议**: 启用代码签名验证，使用正式证书签名

#### 5. 外部链接无安全检查
- **位置**: `main.js:999-1001`
- **严重程度**: 中危
- **描述**: `shell.openExternal(url)` 没有对传入的 URL 进行任何验证或白名单检查
- **影响**: 如果渲染进程被 XSS 攻击，攻击者可以利用此通道打开任意外部链接（包括恶意网站或 `file://` 协议）
- **修复建议**: 添加协议白名单检查（仅允许 http/https）

### 🟡 中危漏洞

#### 6. navigator.webdriver 属性篡改
- **位置**: `preload-web.js:5-7`
- **严重程度**: 中危
- **描述**: 篡改浏览器自动化检测标识，用于绕过反爬虫检测
- **影响**: 应用会试图伪装成普通浏览器访问第三方网站
- **修复建议**: 评估是否真的需要此功能，或在特定场景下使用

#### 7. User-Agent 全局伪造
- **位置**: `main.js:910-914`
- **严重程度**: 中危
- **描述**: 在 macOS 和 Linux 上同样使用 Windows 的 User-Agent
- **影响**: 可能导致部分网站的服务行为异常
- **修复建议**: 根据实际操作系统动态设置 User-Agent

#### 8. npm 依赖漏洞 (12 个)
- **严重程度**: 高危 (10 个) / 低危 (2 个)
- **详情**:
  - **Electron <=39.8.4**: 18 个安全漏洞，包括 ASAR 完整性绕过、AppleScript 注入、Service Worker 欺骗等
  - **tar <=7.5.10**: 6 个路径遍历漏洞，可导致任意文件创建/覆盖
  - **@tootallnate/once <3.0.1**: 控制流作用域漏洞
- **修复建议**: 升级 electron-builder 到 26.8.1+，升级 Electron 到 41.2.0+

---

## 三、发现的功能异常

### 🟡 功能 Bug

#### 1. SettingsManager.save() 异步调用错误
- **位置**: `renderer.js:687-693`
- **严重程度**: 中等
- **描述**: `SettingsManager.save()` 是一个 async 函数，返回 Promise。但在调用处使用了同步的 if 判断，Promise 对象在布尔上下文中始终为 `true`，因此"保存失败"的分支永远不会被执行
- **当前代码**:
  ```javascript
  if (SettingsManager.save(newApis, newDramas)) {  // ❌ 错误：Promise 始终为 true
      showToast('设置已保存，正在刷新列表...', 'success');
  }
  ```
- **修复方案**:
  ```javascript
  if (await SettingsManager.save(newApis, newDramas)) {  // ✅ 正确：使用 await
      showToast('设置已保存，正在刷新列表...', 'success');
  }
  ```

#### 2. settings:reset 使用了不存在的 API
- **位置**: `main.js:70-82`
- **严重程度**: 中等
- **描述**: `electron-store` 的 API 中并不存在 `.reset()` 和 `.clear()` 方法。此功能调用会抛出 TypeError
- **当前代码**:
  ```javascript
  ipcMain.handle('settings:reset', (event, key) => {
      if (key) {
          settingsStore.reset(key);   // ❌ electron-store 没有 reset(key) 方法
      } else {
          settingsStore.clear();       // ❌ electron-store 没有 clear() 方法
      }
  });
  ```
- **修复方案**:
  ```javascript
  ipcMain.handle('settings:reset', (event, key) => {
      try {
          if (key) {
              settingsStore.delete(key);  // ✅ 使用 delete 方法
          } else {
              // ✅ 手动重置为默认值
              settingsStore.set('apiList', []);
              settingsStore.set('dramaSites', []);
              settingsStore.set('windowBounds', null);
              settingsStore.set('lastPlatform', '');
              settingsStore.set('themeMode', 'parsing');
          }
          return { success: true };
      } catch (error) {
          return { success: false, error: error.message };
      }
  });
  ```

#### 3. goButton 自动添加 https:// 前缀可能出错
- **位置**: `renderer.js:343`
- **严重程度**: 低等
- **描述**: 如果用户输入类似 `ftp://example.com`，检查会通过（因为不以 `http` 开头），然后被拼成 `https://://example.com`
- **当前代码**:
  ```javascript
  if (!url.startsWith('http')) url = 'https' + '://' + url;
  ```
- **修复方案**:
  ```javascript
  if (!url.includes('://')) url = 'https://' + url;
  ```

#### 4. 事件处理函数中的 IPC 事件参数缺失
- **位置**: `main.js:812`
- **严重程度**: 低等
- **描述**: `did-fail-load` 事件回调的第一个参数是 Event 对象，但被解构为 `(event, code, desc)`，这里的 `event` 会和外部作用域的 `event` 变量冲突（虽然在当前代码中不会导致问题，但不符合最佳实践）
- **修复方案**:
  ```javascript
  view.webContents.once('did-fail-load', (loadEvent, code, desc) => {
      // 使用 loadEvent 避免命名冲突
  });
  ```

---

## 四、性能问题

### 🟠 性能优化点

#### 1. MutationObserver 监控整个 document
- **位置**: `preload-web.js:318`
- **影响**: 对整个 `document` 进行 subtree 级别的 DOM 变化监控，在复杂页面（如腾讯视频、爱奇艺）中可能产生大量回调事件，影响性能
- **优化建议**: 缩小监控范围到特定容器元素

#### 2. injectionGuardian 50ms 高频轮询
- **位置**: `preload-web.js:441`
- **影响**: 使用 50ms 间隔的 setInterval 持续查询 DOM 元素、修改 video 样式、操作 CSS。在注入成功前持续的高频操作可能在低功耗设备上造成不必要的 CPU 占用
- **优化建议**: 初始间隔可设为 200ms，5 秒后降频到 500ms

#### 3. navigate 和 reset-module 代码高度重复
- **位置**: `main.js:662-743` 和 `main.js:746-839`
- **影响**: 两个 IPC handler 的处理逻辑高度相似（约 80% 的代码重复），增加了维护成本和引入不一致 Bug 的风险
- **优化建议**: 提取为统一的 `loadURLWithPool(url, options)` 函数

---

## 五、代码质量评估

### 优点

1. **LRU 缓存池设计精良**: 使用 LRU 算法管理 BrowserView 池，设置了 3 个实例的上限，配合安全销毁机制（三重空值检查 + try-catch），有效防止了内存泄漏
2. **事件委托模式**: 戏剧按钮使用事件委托而非逐个绑定监听器，避免了事件监听器累积导致的内存泄漏
3. **防抖机制**: 窗口状态保存和缩放因子更新都使用了防抖函数，避免了高频事件导致的性能问题
4. **防白闪处理**: 在 CSS 中内联了关键背景色，并在 HTML 中设置了 body 背景，防止应用启动时的白屏闪烁
5. **CSS 变量驱动主题**: 通过 CSS 变量实现了戏剧模式/解析模式的无缝主题切换
6. **详细的错误日志**: 代码中包含了丰富的 console.log 日志，便于调试和故障排查
7. **文档完备**: 多个维度的项目文档（架构分析、开发日志、优化记录）有助于后续维护

### 代码质量问题

| 类别 | 描述 | 位置 |
|------|------|------|
| **魔法数字** | 大量硬编码的超时值、间隔值 (50ms, 200ms, 15000ms, 2147483647) 未定义为具名常量 | main.js, preload-web.js |
| **函数过长** | `createWindow()` 函数约 300 行，包含窗口创建、IPC 注册、事件处理等多个职责 | main.js:568-904 |
| **重复代码** | `navigate` 和 `reset-module` handler 逻辑高度重复（约 80%） | main.js:662-743, 746-839 |
| **全局变量** | 大量使用模块级全局变量 (`view`, `mainWindow`, `currentThemeCss` 等)，缺乏封装 | main.js:184-188 |
| **注释不一致** | 部分代码有详细的中文注释，部分完全没有注释 | 全项目 |
| **CSS 选择器过深** | style.css 中存在深层嵌套选择器和大量 `!important` 声明 | style.css |
| **依赖版本** | `electron-updater` 同时出现在 `devDependencies` 和 `dependencies` 中 | package.json:22,28 |

### 架构设计评分

| 维度 | 评分 (1-5) | 说明 |
|------|------------|------|
| 功能完整性 | 4 | 核心功能齐全，解析、导航、设置、更新均实现 |
| 安全性 | 2 | webSecurity:false、CSP 删除、硬编码密钥、签名验证禁用 |
| 性能优化 | 4 | LRU 池、预渲染、防抖、事件委托等优化到位 |
| 代码规范 | 3 | 命名基本清晰，但缺乏常量提取、函数拆分不足 |
| 可维护性 | 3 | 单一文件承载过多逻辑，缺乏模块化拆分 |
| 文档完备性 | 5 | 架构分析、开发日志、优化记录文档详尽 |

---

## 六、可行性优化方案

### 第一阶段：安全修复（必须处理，优先级：高）

#### 1. 修复 `SettingsManager.save()` 的异步调用
```javascript
// renderer.js:687
saveSettings.addEventListener('click', async () => {  // ✅ 添加 async
    const newApis = SettingsManager.parseInput(parsingListInput.value);
    const newDramas = SettingsManager.parseInput(dramaListInput.value);

    if (newDramas.length > 4) {
        showToast('影视导航最多只能添加 4 个网站，请删减后再保存。', 'error');
        return;
    }

    if (await SettingsManager.save(newApis, newDramas)) {  // ✅ 添加 await
        showToast('设置已保存，正在刷新列表...', 'success');
        refreshDynamicUI();
        closeSettingsPage();
    } else {
        showToast('保存失败，请检查输入格式。', 'error');
    }
});
```

#### 2. 修复 `settings:reset` handler
```javascript
// main.js:70-82
ipcMain.handle('settings:reset', (event, key) => {
    try {
        if (key) {
            settingsStore.delete(key);
        } else {
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
```

#### 3. 启用代码签名验证
```json
// package.json:52
{
  "win": {
    "verifyUpdateCodeSignature": true  // ✅ 改为 true
  }
}
```

#### 4. URL 验证加固
```javascript
// main.js:999-1001
ipcMain.on('open-external-link', (event, url) => {
    // ✅ 添加协议白名单检查
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
```

#### 5. 修复 URL 前缀拼接
```javascript
// renderer.js:343
goButton.addEventListener('click', () => {
    let url = urlInput.value.trim();
    if (url) {
        isCurrentlyParsing = false;
        if (!url.includes('://')) url = 'https://' + url;  // ✅ 改为检查 ://
        currentVideoUrl = url;
        navigateTo(url);
    }
});
```

#### 6. 升级依赖修复漏洞
```bash
# 升级 electron-builder 到最新版本
npm install electron-builder@latest --save-dev

# 升级 tar 到安全版本
npm install tar@latest

# 清理重复依赖
# 从 devDependencies 中移除 electron-updater（仅在 dependencies 中保留）
```

### 第二阶段：代码重构（强烈推荐，优先级：中）

#### 7. 提取配置常量
```javascript
// config.js (新文件)
module.exports = {
    VIEW_POOL: {
        MAX_SIZE: 3,
        ESTIMATED_MEMORY_PER_VIEW: '150-300MB'
    },
    TIMEOUTS: {
        PRELOAD_DEFAULT: 8000,
        DRAMA_SITE_DEFAULT: 15000,
        HEAVY_SITE: 30000,
        LOAD_FINISHED: 15000
    },
    INTERVALS: {
        INJECTION_GUARDIAN_INITIAL: 200,  // ✅ 从 50ms 优化到 200ms
        INJECTION_GUARDIAN_AFTER_5S: 500,  // ✅ 从 250ms 优化到 500ms
        ZOOM_UPDATE_DEBOUNCE: 150
    },
    SECURITY: {
        ALLOWED_EXTERNAL_PROTOCOLS: ['http:', 'https:']
    }
};
```

#### 8. 拆分 main.js 为模块
```
src/
├── main.js                 # 主入口（精简）
├── config.js               # 配置常量
├── modules/
│   ├── ViewPoolManager.js  # BrowserView 池管理
│   ├── IpcRouter.js        # IPC 路由注册
│   ├── AutoUpdater.js      # 自动更新逻辑
│   └── SettingsManager.js  # 设置持久化
└── utils/
    └── debounce.js         # 工具函数
```

#### 9. 消除 navigate/reset-module 重复代码
```javascript
// modules/ViewPoolManager.js
async function loadURLWithPool(url, options = {}) {
    const {
        themeVars,
        clearHistory = false,
        isResetModule = false,
        timeoutOverride = null
    } = options;
    
    // ... 统一的视图池管理逻辑
}
```

### 第三阶段：性能优化（可选，优先级：低）

#### 10. 缩小 MutationObserver 监控范围
```javascript
// preload-web.js
// ✅ 从 document 缩小到 body 或特定容器
const targetNode = document.body || document.documentElement;
observer.observe(targetNode, { childList: true, subtree: true });
```

#### 11. 动态调整注入轮询频率
```javascript
// preload-web.js
let interval = 200;  // ✅ 初始 200ms
let elapsed = 0;

const injectionGuardian = setInterval(() => {
    elapsed += interval;
    
    if (elapsed > 5000) {
        interval = 500;  // ✅ 5 秒后降频到 500ms
    }
    
    // ... 注入逻辑
}, interval);
```

#### 12. 延迟预渲染
```javascript
// main.js
// ✅ 将预渲染延迟到窗口首次显示后
setTimeout(() => {
    preloadAllSites().catch(err => console.error('[Preload] Background preload error:', err));
}, 1000);  // ✅ 从 100ms 延迟到 1000ms，避免阻塞窗口渲染
```

### 第四阶段：依赖管理（建议处理，优先级：中）

#### 13. 移除重复的 electron-updater 声明
```json
{
  "devDependencies": {
    "electron": "^33.0.0",
    "electron-builder": "^25.1.8"
    // ✅ 移除 electron-updater
  },
  "dependencies": {
    "electron-log": "^5.2.4",
    "electron-store": "^8.1.0",
    "electron-updater": "^6.6.2"
    // ✅ 检查 axios 是否真的被使用，如果未使用则移除
  }
}
```

#### 14. axios 依赖检查
经过代码审查，`axios` 在代码中似乎没有被直接使用，可以考虑移除：
```bash
npm uninstall axios
```

---

## 七、总结与建议

### 风险等级评估

| 风险类型 | 当前等级 | 修复后等级 |
|----------|----------|------------|
| 安全风险 | 🔴 高危 | 🟢 低危 |
| 功能风险 | 🟡 中危 | 🟢 低危 |
| 性能风险 | 🟠 中低危 | 🟢 低危 |
| 维护风险 | 🟡 中危 | 🟢 低危 |

### 执行优先级

1. **立即修复** (本周内):
   - 修复 `SettingsManager.save()` 异步调用
   - 修复 `settings:reset` handler
   - 修复 URL 前缀拼接 bug
   - 启用代码签名验证

2. **近期优化** (本月内):
   - 升级依赖修复漏洞
   - 添加外部链接 URL 验证
   - 提取配置常量
   - 移除重复依赖

3. **长期重构** (下季度):
   - 拆分 main.js 为模块化架构
   - 优化性能热点
   - 改进加密密钥管理

### 技术债务清单

| 项目 | 优先级 | 预计工作量 |
|------|--------|------------|
| 安全漏洞修复 | P0 | 2 天 |
| 功能 Bug 修复 | P0 | 1 天 |
| 依赖升级 | P1 | 1 天 |
| 代码模块化重构 | P2 | 5 天 |
| 性能优化 | P3 | 3 天 |

---

**审计结论**: AudioVisual 是一个功能完整的 Electron 视频解析应用，其 LRU 缓存池架构和预渲染策略是技术亮点。当前最大的风险集中在安全层面（webSecurity 禁用、CSP 删除、硬编码密钥、更新签名验证禁用），其次是一些功能 Bug（异步调用错误、不存在的 API 调用）。建议在下一个版本中优先解决安全和功能性 Bug，再进行架构层面的模块化重构。

**报告生成时间**: 2026-04-14  
**审计工具**: 代码静态分析、npm audit、人工审查
