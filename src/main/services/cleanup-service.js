/**
 * 自动清理服务类
 * 定期清理过期的剪贴板历史数据
 */
class CleanupService {
  constructor(databaseService, store) {
    this.db = databaseService;
    this.store = store;
    this.cleanupInterval = null;
    this.isRunning = false;

    // 默认配置
    this.defaultIntervalMs = 24 * 60 * 60 * 1000; // 每天执行一次
    this.minIntervalMs = 60 * 60 * 1000; // 最小间隔 1 小时
  }

  /**
   * 启动自动清理服务
   */
  start() {
    if (this.isRunning) {
      console.log('[CleanupService] Already running');
      return;
    }

    const config = this.store.get('cleanup');
    if (!config.enabled) {
      console.log('[CleanupService] Cleanup is disabled');
      return;
    }

    this.isRunning = true;
    console.log('[CleanupService] Starting with config:', config);

    // 立即执行一次清理
    this.performCleanup();

    // 设置定时清理
    const intervalMs = Math.max(this.defaultIntervalMs, this.minIntervalMs);
    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, intervalMs);

    console.log(`[CleanupService] Scheduled cleanup every ${intervalMs / (60 * 60 * 1000)} hours`);
  }

  /**
   * 停止自动清理服务
   */
  stop() {
    if (!this.isRunning) return;

    this.isRunning = false;

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    console.log('[CleanupService] Stopped');
  }

  /**
   * 执行清理操作
   */
  performCleanup() {
    const config = this.store.get('cleanup');
    if (!config.enabled) {
      console.log('[CleanupService] Cleanup is disabled, skipping');
      return;
    }

    console.log('[CleanupService] Running cleanup...');
    const startTime = Date.now();
    let totalRemoved = 0;

    try {
      // 1. 按时间清理
      if (config.maxAgeDays > 0) {
        const removed = this.cleanupByAge(config.maxAgeDays);
        totalRemoved += removed;
        console.log(`[CleanupService] Removed ${removed} items older than ${config.maxAgeDays} days`);
      }

      // 2. 按数量清理
      if (config.maxItems > 0) {
        const removed = this.cleanupByCount(config.maxItems, config.keepPinned);
        totalRemoved += removed;
        console.log(`[CleanupService] Removed ${removed} excess items (keeping ${config.maxItems})`);
      }

      // 3. 获取清理后的统计
      const stats = this.db.getStats();
      const duration = Date.now() - startTime;

      console.log('[CleanupService] Cleanup completed:', {
        duration: `${duration}ms`,
        totalRemoved,
        currentTotal: stats.total,
        pinned: stats.pinned
      });

      // 发送清理完成事件（可选）
      this.emit('cleanup-completed', {
        removed: totalRemoved,
        stats,
        duration
      });

    } catch (err) {
      console.error('[CleanupService] Cleanup failed:', err);
    }
  }

  /**
   * 按时间清理
   * @param {number} maxAgeDays - 最大保留天数
   * @returns {number} - 删除的记录数
   */
  cleanupByAge(maxAgeDays) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
    const cutoffString = cutoffDate.toISOString();

    const result = this.db.cleanupBefore(cutoffString);
    return result.changes;
  }

  /**
   * 按数量清理
   * @param {number} maxItems - 最大保留数量
   * @param {boolean} keepPinned - 是否保留置顶项
   * @returns {number} - 删除的记录数
   */
  cleanupByCount(maxItems, keepPinned) {
    const stats = this.db.getStats();

    // 计算需要删除的数量
    let itemsToDelete = stats.total - maxItems;

    if (keepPinned) {
      // 如果保留置顶项，需要计算非置顶项数量
      const unpinnedCount = stats.total - stats.pinned;
      itemsToDelete = Math.min(itemsToDelete, unpinnedCount);
    }

    if (itemsToDelete <= 0) {
      return 0;
    }

    const result = this.db.cleanupByCount(maxItems, keepPinned);
    return result.changes;
  }

  /**
   * 手动触发清理
   */
  runNow() {
    console.log('[CleanupService] Manual cleanup triggered');
    this.performCleanup();
  }

  /**
   * 获取清理统计信息
   */
  getStats() {
    const config = this.store.get('cleanup');
    const stats = this.db.getStats();

    return {
      config,
      isRunning: this.isRunning,
      database: stats
    };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    this.store.set('cleanup', { ...this.store.get('cleanup'), ...newConfig });

    // 如果正在运行，重启服务以应用新配置
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }

  // 简单的 EventEmitter 实现
  emit(event, data) {
    // 可以通过 ipc 发送给渲染进程
    const { BrowserWindow } = require('electron');
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('cleanup:' + event, data);
    });
  }
}

module.exports = CleanupService;
