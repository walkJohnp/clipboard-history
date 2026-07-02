const { EventEmitter } = require('events');
const { clipboard, app } = require('electron');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * 剪贴板服务类
 * macOS 使用 NSPasteboard.changeCount 监听变化，避免高频读取剪贴板内容。
 * 其他平台回退到低频轮询。
 */
class ClipboardService extends EventEmitter {
  constructor(databaseService, userDataPath) {
    super();
    this.db = databaseService;
    this.imagesDir = path.join(userDataPath, 'images');
    this.fallbackTimer = null;
    this.monitorProcess = null;
    this.isRunning = false;

    // 确保图片目录存在
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }

    // 状态
    this.lastContent = '';
    this.lastHash = '';
    this.lastChangeCount = null;
    this.lastFallbackChangeCount = null;
    this.lastProcessedChangeCount = null;

    // 配置
    this.fallbackIntervalMs = 3000;
    this.minContentLength = 1;  // 最小内容长度
    this.maxContentLength = 10 * 1024 * 1024; // 最大 10MB

    // 初始化最后内容
    this.restoreLastContent();
  }

  /**
   * 从数据库恢复最后一条记录
   */
  restoreLastContent() {
    try {
      const latest = this.db.getLatest();
      if (latest && latest.content) {
        this.lastContent = latest.content;
        this.lastHash = latest.type === 'image' && latest.content_hash?.startsWith('image:')
          ? latest.content_hash.slice('image:'.length)
          : this.hashContent(latest.content);
        console.log('[ClipboardService] Restored last content from database');
      }
    } catch (err) {
      console.error('[ClipboardService] Failed to restore last content:', err);
    }
  }

  /**
   * 计算内容哈希
   */
  hashContent(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 启动剪贴板监听
   */
  start() {
    if (this.isRunning) {
      console.log('[ClipboardService] Already running');
      return;
    }

    this.isRunning = true;
    console.log('[ClipboardService] Starting monitoring...');

    this.checkClipboard({ changeCount: this.getNativeChangeCount() });

    if (process.platform === 'darwin' && this.startPasteboardMonitor()) {
      return;
    }

    this.startFallbackPolling();
  }

  startPasteboardMonitor() {
    const monitorPath = this.getPasteboardMonitorPath();
    if (!monitorPath || !fs.existsSync(monitorPath)) {
      console.warn('[ClipboardService] Pasteboard monitor not found, using fallback polling');
      return false;
    }

    const child = spawn(monitorPath, [], {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    this.monitorProcess = child;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      for (const line of chunk.split(/\r?\n/)) {
        if (!line.trim()) continue;

        const changeCount = Number(line.trim());
        if (!Number.isFinite(changeCount)) continue;

        if (this.lastChangeCount === null) {
          this.lastChangeCount = changeCount;
          continue;
        }

        if (changeCount !== this.lastChangeCount) {
          this.lastChangeCount = changeCount;
          this.checkClipboard({ changeCount });
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      console.error('[ClipboardService] Pasteboard monitor error:', chunk.trim());
    });

    child.on('error', (err) => {
      console.error('[ClipboardService] Pasteboard monitor failed:', err);
      this.monitorProcess = null;
      this.startFallbackPolling();
    });

    child.on('exit', (code, signal) => {
      if (this.monitorProcess !== child) return;

      this.monitorProcess = null;
      if (this.isRunning) {
        console.warn('[ClipboardService] Pasteboard monitor exited, using fallback polling:', { code, signal });
        this.startFallbackPolling();
      }
    });

    console.log('[ClipboardService] Pasteboard monitor started');
    return true;
  }

  getPasteboardMonitorPath() {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'pasteboard-monitor');
    }

    const candidates = [
      path.join(app.getAppPath(), 'src/native/bin/pasteboard-monitor'),
      path.join(process.cwd(), 'src/native/bin/pasteboard-monitor'),
      path.join(__dirname, '../../native/bin/pasteboard-monitor')
    ];

    return candidates.find((candidate) => fs.existsSync(candidate)) || candidates[0];
  }

  startFallbackPolling() {
    if (this.fallbackTimer || !this.isRunning) return;

    this.fallbackTimer = setInterval(() => {
      // On macOS, avoid re-reading large image payloads while the pasteboard is unchanged.
      const changeCount = this.getNativeChangeCount();
      if (changeCount !== null) {
        if (this.lastFallbackChangeCount === null) {
          this.lastFallbackChangeCount = changeCount;
          return;
        }

        if (changeCount === this.lastFallbackChangeCount) {
          return;
        }

        this.lastFallbackChangeCount = changeCount;
        this.checkClipboard({ changeCount });
        return;
      }

      this.checkClipboard();
    }, this.fallbackIntervalMs);
  }

  /**
   * 停止剪贴板监听
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.fallbackTimer) {
      clearInterval(this.fallbackTimer);
      this.fallbackTimer = null;
    }

    if (this.monitorProcess) {
      const child = this.monitorProcess;
      this.monitorProcess = null;
      child.kill();
    }

    console.log('[ClipboardService] Stopped monitoring');
  }

  /**
   * 检查剪贴板内容
   * 支持文本和图片类型
   */
  checkClipboard(options = {}) {
    try {
      const changeCount = Number.isFinite(options.changeCount) ? options.changeCount : null;
      if (changeCount !== null && changeCount === this.lastProcessedChangeCount) {
        return false;
      }

      const formats = clipboard.availableFormats();

      if (this.hasImageFormat(formats)) {
        const imageData = this.readImageBuffer(formats);
        if (imageData) {
          const handled = this.handleImageContent(imageData);
          if (changeCount !== null) {
            this.lastProcessedChangeCount = changeCount;
          }
          return handled;
        }
      }

      // 先读取文本。readText 成本低，且很多图片剪贴板也会附带文件路径/URL 文本。
      const content = clipboard.readText();

      // 过滤无效内容
      if (this.isValidContent(content)) {
        // 快速哈希比较（避免字符串全量比较）
        const hash = this.hashContent(content);
        if (hash !== this.lastHash) {
          // 检查数据库中是否已存在（使用已计算出的哈希）
          if (this.db.existsHash(hash)) {
            // 已存在，只更新本地状态
            this.lastContent = content;
            this.lastHash = hash;
            if (changeCount !== null) {
              this.lastProcessedChangeCount = changeCount;
            }
            return false;
          }

          // 新内容，保存到数据库
          this.handleNewContent(content, hash);
          if (changeCount !== null) {
            this.lastProcessedChangeCount = changeCount;
          }
          return true;
        }
      }

      if (changeCount !== null) {
        this.lastProcessedChangeCount = changeCount;
      }
      return false;

    } catch (err) {
      console.error('[ClipboardService] Check error:', err);
      return false;
    }
  }

  hasImageFormat(formats = clipboard.availableFormats()) {
    return formats.some((format) => {
      const normalized = format.toLowerCase();
      return normalized.includes('image')
        || normalized.includes('png')
        || normalized.includes('tiff')
        || normalized.includes('bitmap');
    });
  }

  readImageBuffer(formats = clipboard.availableFormats()) {
    const nativeImageData = this.readNativeImageData();
    if (nativeImageData) {
      return nativeImageData;
    }

    const imageFormats = [
      { format: 'image/png', extension: 'png', mimeType: 'image/png' },
      { format: 'public.png', extension: 'png', mimeType: 'image/png' },
      { format: 'Apple PNG pasteboard type', extension: 'png', mimeType: 'image/png' },
      { format: 'public.tiff', extension: 'tiff', mimeType: 'image/tiff' },
      { format: 'NeXT TIFF v4.0 pasteboard type', extension: 'tiff', mimeType: 'image/tiff' }
    ];

    for (const imageFormat of imageFormats) {
      if (!formats.includes(imageFormat.format)) continue;

      const buffer = clipboard.readBuffer(imageFormat.format);
      if (buffer.length > 0) {
        return { ...imageFormat, buffer };
      }
    }

    return null;
  }

  readNativeImageData() {
    if (process.platform !== 'darwin') {
      return null;
    }

    const monitorPath = this.getPasteboardMonitorPath();
    if (!monitorPath || !fs.existsSync(monitorPath)) {
      return null;
    }

    const result = spawnSync(monitorPath, ['--read-image', this.imagesDir], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024
    });

    const output = result.stdout?.trim();
    if (!output) {
      if (result.error) {
        console.error('[ClipboardService] Native image read failed:', result.error);
      }
      return null;
    }

    try {
      const parsed = JSON.parse(output);
      if (parsed.success !== 'true' || !parsed.filePath) {
        console.warn('[ClipboardService] Native image read skipped:', parsed.error || 'No image data');
        return null;
      }

      const buffer = fs.readFileSync(parsed.filePath);
      if (buffer.length === 0) {
        fs.unlinkSync(parsed.filePath);
        return null;
      }

      return {
        buffer,
        extension: parsed.extension,
        mimeType: parsed.mimeType,
        pasteboardType: parsed.pasteboardType,
        pendingFilePath: parsed.filePath
      };
    } catch (err) {
      console.error('[ClipboardService] Failed to parse native image data:', err);
      return null;
    }
  }

  getNativeChangeCount() {
    if (process.platform !== 'darwin') {
      return null;
    }

    const monitorPath = this.getPasteboardMonitorPath();
    if (!monitorPath || !fs.existsSync(monitorPath)) {
      return null;
    }

    const result = spawnSync(monitorPath, ['--change-count'], {
      encoding: 'utf8',
      timeout: 1000,
      maxBuffer: 1024
    });

    if (result.error || result.status !== 0) {
      return null;
    }

    const changeCount = Number(result.stdout?.trim());
    return Number.isFinite(changeCount) ? changeCount : null;
  }

  /**
   * 处理图片内容
   * 保存图片到文件系统，数据库存储文件路径
   */
  handleImageContent(imageData) {
    try {
      const { buffer, extension, mimeType, pendingFilePath } = imageData;
      const hash = this.hashContent(buffer);
      const contentHash = `image:${hash}`;

      if (hash === this.lastHash) {
        this.removePendingImage(pendingFilePath);
        return false;
      }

      // 检查是否已存在
      if (this.db.existsHash(contentHash)) {
        this.lastHash = hash;
        this.removePendingImage(pendingFilePath);
        return false;
      }

      // 保存图片到文件系统
      const fileName = `img_${Date.now()}_${hash.substring(0, 8)}.${extension}`;
      const filePath = path.join(this.imagesDir, fileName);
      if (pendingFilePath) {
        fs.renameSync(pendingFilePath, filePath);
      } else {
        fs.writeFileSync(filePath, buffer);
      }

      // 保存到数据库：content 和 file_path 都存文件路径，不存 base64/data URL
      const result = this.db.insert(filePath, 'image', 'image', filePath, contentHash);

      if (result && result.id) {
        this.lastHash = hash;

        console.log('[ClipboardService] New image saved:', {
          id: result.id,
          filePath,
          mimeType,
          size: buffer.length
        });

        // 触发事件
        this.emit('new-content', {
          id: result.id,
          content: filePath,
          timestamp: result.timestamp,
          is_pinned: result.is_pinned || false,
          type: 'image',
          file_path: filePath
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error('[ClipboardService] Failed to save image:', err);
      return false;
    }
  }

  removePendingImage(filePath) {
    if (!filePath) return;

    try {
      if (fs.existsSync(filePath) && path.basename(filePath).startsWith('img_pending_')) {
        fs.unlinkSync(filePath);
      }
    } catch (err) {
      console.error('[ClipboardService] Failed to remove pending image:', err);
    }
  }

  /**
   * 验证内容是否有效
   */
  isValidContent(content) {
    if (!content) return false;

    // 检查长度
    if (content.length < this.minContentLength) return false;
    if (content.length > this.maxContentLength) {
      console.log('[ClipboardService] Content too large, skipping:', content.length);
      return false;
    }

    // 检查是否与上次相同（快速字符串比较）
    if (content === this.lastContent) return false;

    return true;
  }

  /**
   * 处理新内容
   */
  handleNewContent(content, hash) {
    try {
      // 保存到数据库
      const result = this.db.insert(content, null, 'text', null, hash);

      if (result && result.id) {
        // 更新本地状态
        this.lastContent = content;
        this.lastHash = hash;

        console.log('[ClipboardService] New content saved:', {
          id: result.id,
          length: content.length,
          preview: content.substring(0, 50).replace(/\n/g, '\\n')
        });

        // 触发事件
        this.emit('new-content', {
          id: result.id,
          content: content,
          timestamp: result.timestamp,
          is_pinned: result.is_pinned || false
        });
      }
    } catch (err) {
      console.error('[ClipboardService] Failed to save content:', err);
    }
  }

  /**
   * 手动跟踪内容（用于复制操作）
   * 当用户从应用中复制内容时调用，避免重复记录
   */
  trackContent(content) {
    if (!content) return;

    this.lastContent = content;
    this.lastHash = this.hashContent(content);

    console.log('[ClipboardService] Content tracked:', {
      length: content.length,
      preview: content.substring(0, 50).replace(/\n/g, '\\n')
    });
  }

  /**
   * 手动跟踪图片（用于从历史复制图片时避免重复记录）
   */
  trackImage(filePath) {
    if (!filePath || !fs.existsSync(filePath)) return;

    const buffer = fs.readFileSync(filePath);
    const hash = this.hashContent(buffer);

    this.lastContent = filePath;
    this.lastHash = hash;

    console.log('[ClipboardService] Image tracked:', {
      filePath,
      size: buffer.length
    });
  }

  /**
   * 写入剪贴板并跟踪
   */
  writeAndTrack(content) {
    clipboard.writeText(content);
    this.trackContent(content);
  }

  /**
   * 获取当前剪贴板内容
   */
  getCurrentContent() {
    return clipboard.readText();
  }

  /**
   * 手动保存内容（用于外部调用）
   */
  saveContent(content, source = null) {
    if (!this.isValidContent(content)) {
      return null;
    }

    const hash = this.hashContent(content);
    if (this.db.existsHash(hash)) {
      this.trackContent(content);
      return null;
    }

    const result = this.db.insert(content, source);
    if (result) {
      this.trackContent(content);
      this.emit('new-content', result);
    }
    return result;
  }

  /**
   * 刷新缓存（用于导入数据后）
   */
  refreshCache() {
    this.restoreLastContent();
    console.log('[ClipboardService] Cache refreshed');
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      monitor: this.monitorProcess ? 'pasteboard-change-count' : 'fallback-polling',
      fallbackInterval: this.fallbackIntervalMs,
      lastContentLength: this.lastContent.length,
      lastChangeCount: this.lastChangeCount
    };
  }
}

module.exports = ClipboardService;
