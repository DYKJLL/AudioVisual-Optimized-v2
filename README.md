# 🎬 AudioVisual

<div align="center">

**🔑 解锁所有媒体流的钥匙**

*一个功能强大的视频解析工具*

![Version](https://img.shields.io/badge/version-1.3.4-blue.svg?style=for-the-badge&logo=semantic-release)
![License](https://img.shields.io/badge/license-UNLICENSED-red.svg?style=for-the-badge)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg?style=for-the-badge)

</div>

---

## ⚠️ 重要声明

> **本项目仅供学习交流使用，严禁用于任何商业用途。**

---

## 📦 下载

**最新版本**: v1.3.4

| 系统 | 安装包 | 大小 |
|------|--------|------|
| Windows | AudioVisual-1.3.4-x64.zip | 118MB |

👉 [前往 Releases 页面下载](https://github.com/DYKJLL/AudioVisual-Optimized-v2/releases/latest)

---

## 🔄 自动更新机制

### 完整升级链路

```
用户点击"检查更新"
        ↓
Electron main.js fetch latest.yml
  URL: https://github.com/.../download/v{version}/latest.yml
        ↓
解析 latest.yml → 拿远程版本号
        ↓
本地版本 < 远程版本？
  → 是：推送 update-available 事件，前端显示"发现新版本"
  → 否：推送 update-not-available 事件，显示"已是最新版本"
        ↓
用户点击"下载更新" → Electron net.fetch 下载 zip
        ↓
下载完成 → 用户点击"安装更新"
        ↓
app.quit() → autoUpdater.quitAndInstall() → 启动新版本
```

### latest.yml 结构

```yaml
provider: generic
url: https://github.com/DYKJLL/AudioVisual-Optimized-v2/releases/download/v1.3.4/
updaterCacheDirName: audiovisual-update
---
version: 1.3.4
files:
  - path: AudioVisual-1.3.4-x64.zip
    sha512: <64位SHA512哈希>
    size: 123628410
sha512: <64位SHA512哈希>
releaseDate: '2026-05-24T00:20:00.000Z'
```

### 发版流程（CI/CD）

```
1. package.json version → +1
2. main.js GH_VERSION → 指向新tag
3. npm run dist:win -- --dir（生成 win-unpacked 目录）
4. 手动修复 asar（wine rcedit 失败，WSL打包缺陷）
5. python zip 打包 win-unpacked/ → AudioVisual-{version}-x64.zip
6. 计算 sha512，写入 latest.yml
7. git commit + git tag v{version}
8. git push origin master v{version}
9. GitHub API 创建 Release + 上传 assets（zip + latest.yml）
```

### 关键实现细节

**main.js 中的版本控制（核心常量）：**
```javascript
const GH_VERSION = 'v1.3.4';  // ← 发版时只需改这里
const GH_BASE = 'https://github.com/DYKJLL/AudioVisual-Optimized-v2/releases/download';
const GHPROXY_LATEST = `${GH_BASE}/${GH_VERSION}/latest.yml`;
```

**版本比对逻辑（语义化版本比较）：**
```javascript
function compareVersions(v1, v2) {
  const parts1 = v1.replace(/^v/, '').split('.').map(p => parseInt(p, 10) || 0);
  const parts2 = v2.replace(/^v/, '').split('.').map(p => parseInt(p, 10) || 0);
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}
```

**更新检查 IPC 通信：**
- 前端渲染进程 → `ipcRenderer.invoke('check-for-updates')`
- 主进程 → `net.fetch(GHPROXY_LATEST)` 获取 latest.yml
- 主进程 → `webContents.send('update-available' / 'update-not-available')` 回调

**下载地址生成逻辑：**
```javascript
// exe 下载地址 = GH_BASE + '/' + GH_VERSION + '/' + exe文件名
// latest.yml 下载地址 = GH_BASE + '/' + GH_VERSION + '/latest.yml'
```

---

## 🚀 使用方法

### 便携版（推荐）
1. 下载 `AudioVisual-1.3.4-x64.zip`
2. 解压到任意目录
3. 双击 `AudioVisual.exe` 运行

### 特点
- ✅ 解压即用，无需安装
- ✅ 所有资源打包在内
- ✅ 便携版，可放 U 盘随身携带
- ✅ 支持自动更新（检测 → 下载 → 安装全自动）

---

## ✨ 功能特性

- 🎬 多平台视频解析
- 🌍 剧迷模式（美韩剧/日剧）
- ⚡ 自动解析播放
- 🎨 侧边栏快速导航
- ⚙️ 支持自定义解析接口
- 🔧 主题切换
- 🔄 自动更新检测

---

## 📝 更新日志

### v1.3.4 (2026-05-24) — 自动升级机制重构
- 🔄 重构自动更新系统，采用 Electron 原生 `net.fetch` 获取 latest.yml
- 📦 发布格式从 NSIS 安装包改为便携 ZIP（绕过 wine rcedit 签名失败问题）
- 🏷️ `GH_VERSION` 常量控制所有版本相关 URL，实现一键发版
- ✅ 完整链路验证：检查更新 → 下载 → 安装 → 重启运行

### v1.3.3 (2026-05-23)
- 🔧 测试版本

### v1.3.1 (2026-05-22)
- ✅ 修复检查更新 URL 指向直连 GitHub

### v1.3.0 (2026-05-22)
- ✅ 初始优化版本
- ✅ 主题切换功能
- ✅ 解析接口自定义

---

## 💻 开发

```bash
# 安装依赖
npm install

# 启动开发
npm start

# 打包 Windows 便携版
npm run dist:win -- --win portable

# 打包 Windows + Mac
npm run dist:win && npm run dist:mac
```

### 环境要求
- Node.js >= 18
- Electron >= 33
- Windows 打包需在 Windows 环境（或 WSL2 + wine32）运行 electron-builder

### 目录结构
```
AudioVisual-Optimized-v2/
├── main.js              # Electron 主进程（含自动更新逻辑）
├── index.html           # 应用入口
├── package.json         # 版本和构建配置
├── latest.yml           # ⚠️ 不提交！由发版脚本自动生成
├── dist/                # ⚠️ 构建输出目录，不提交
│   └── AudioVisual-*-x64.zip  # 最新版本安装包
├── assets/
│   ├── css/style.css    # 主题样式
│   ├── js/renderer.js   # 渲染进程
│   └── images/          # 应用图标
└── build/
    └── installer.nsh    # NSIS 安装脚本
```

---

## 🔑 发版清单（必读）

每次发布新版本，修改以下 3 处：

| 文件 | 修改内容 |
|------|----------|
| `package.json` | `"version": "x.x.x"` |
| `main.js` | `const GH_VERSION = 'vx.x.x'` |
| `dist/latest.yml` | 手动生成或脚本写入（SHA512 + size） |

```bash
# 完整发版命令
npm run dist:win -- --dir
# 然后手动zip打包 win-unpacked/
# 然后 git tag vx.x.x && git push
# 然后 GitHub API 上传 assets
```

---

## 📄 许可证

仅供学习交流使用

---

## 👏 致谢

感谢所有为此项目贡献力量的开发者

---

<div align="center">

**今天最好的表现，是明天最低的要求**

Made with ❤️ by AudioVisual Team

</div>