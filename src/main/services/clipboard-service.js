const { EventEmitter } = require('events');
const { clipboard, nativeImage } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * 剪贴板服务类
 * 使用优化的轮询策略（500ms + 哈希比较）监听剪贴板变化
 */
class ClipboardService extends EventEmitter {
  constructor(databaseService, userDataPath) {
    super();
    this.db = databaseService;
    this.imagesDir = path.join(userDataPath, 'images');
    this.checkInterval = null;
    this.isRunning = false;

    // 确保图片目录存在
    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
    }

    // 状态
    this.lastContent = '';
    this.lastHash = '';
    this.lastCheckTime = 0;

    // 配置
    this.checkIntervalMs = 500; // 500ms 检查一次
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
        this.lastHash = this.hashContent(latest.content);
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

    // 立即检查一次
    this.checkClipboard();

    // 设置定时检查
    this.checkInterval = setInterval(() => {
      this.checkClipboard();
    }, this.checkIntervalMs);
  }

  /**
   * 停止剪贴板监听
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    console.log('[ClipboardService] Stopped monitoring');
  }

  /**
   * 检查剪贴板内容
   * 支持文本和图片类型
   */
  checkClipboard() {
    try {
      const now = Date.now();

      // 防止过于频繁的检查（防抖）
      if (now - this.lastCheckTime < this.checkIntervalMs) {
        return;
      }
      this.lastCheckTime = now;

      // 先检查是否有图片
      const image = clipboard.readImage();
      if (!image.isEmpty()) {
        this.handleImageContent(image);
        return;
      }

      // 读取剪贴板文本
      const content = clipboard.readText();

      // 过滤无效内容
      if (!this.isValidContent(content)) {
        return;
      }

      // 快速哈希比较（避免字符串全量比较）
      const hash = this.hashContent(content);
      if (hash === this.lastHash) {
        return;
      }

      // 检查数据库中是否已存在（使用哈希）
      if (this.db.exists(content)) {
        // 已存在，只更新本地状态
        this.lastContent = content;
        this.lastHash = hash;
        return;
      }

      // 新内容，保存到数据库
      this.handleNewContent(content, hash);

    } catch (err) {
      console.error('[ClipboardService] Check error:', err);
    }
  }

  /**
   * 处理图片内容
   * 保存图片到文件系统，数据库存储文件路径
   */
  handleImageContent(image) {
    try {
      // 获取图片 buffer
      const buffer = image.toPNG();
      const hash = this.hashContent(buffer.toString('base64'));

      if (hash === this.lastHash) {
        return;
      }

      // 检查是否已存在
      if (this.db.exists(`image:${hash}`)) {
        this.lastHash = hash;
        return;
      }

      // 保存图片到文件系统
      const fileName = `img_${Date.now()}_${hash.substring(0, 8)}.png`;
      const filePath = path.join(this.imagesDir, fileName);
      fs.writeFileSync(filePath, buffer);

      // 保存到数据库（存储文件路径和缩略图预览）
      const thumbnailUrl = image.toDataURL({ scaleFactor: 0.2 }); // 生成缩略图
      const result = this.db.insert(thumbnailUrl, 'image', 'image', filePath);

      if (result && result.id) {
        this.lastHash = hash;

        console.log('[ClipboardService] New image saved:', {
          id: result.id,
          filePath,
          size: buffer.length
        });

        // 触发事件
        this.emit('new-content', {
          id: result.id,
          content: thumbnailUrl,
          timestamp: result.timestamp,
          is_pinned: result.is_pinned || false,
          type: 'image',
          file_path: filePath
        });
      }
    } catch (err) {
      console.error('[ClipboardService] Failed to save image:', err);
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
      const result = this.db.insert(content);

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
    if (this.db.exists(content)) {
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
      checkInterval: this.checkIntervalMs,
      lastContentLength: this.lastContent.length,
      lastCheckTime: this.lastCheckTime
    };
  }
}

module.exports = ClipboardService;
