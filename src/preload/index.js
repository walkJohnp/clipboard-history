const { contextBridge, ipcRenderer } = require('electron');

/**
 * 预加载脚本
 * 提供安全的 IPC 通信桥接
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // ==================== 剪贴板相关 ====================

  /**
   * 获取剪贴板历史（分页）
   * @param {number} page - 页码（从1开始）
   * @param {number} pageSize - 每页大小
   * @param {string} search - 搜索关键词
   * @returns {Promise<{items, total, page, pageSize}>}
   */
  getClipboardHistory: async (page = 1, pageSize = 50, search = '') => {
    console.log('[Preload] Getting clipboard history:', { page, pageSize, search });
    const result = await ipcRenderer.invoke('clipboard:get-history', page, pageSize, search);
    console.log('[Preload] Got clipboard history:', result);
    return result;
  },

  /**
   * 获取总数
   * @returns {Promise<number>}
   */
  getTotalCount: () => ipcRenderer.invoke('clipboard:get-count'),

  /**
   * 删除单条记录
   * @param {number} id - 记录ID
   * @returns {Promise<{success: boolean}>}
   */
  deleteItem: (id) => ipcRenderer.invoke('clipboard:delete', id),

  /**
   * 更新内容
   * @param {number} id - 记录ID
   * @param {string} content - 新内容
   * @returns {Promise<{success: boolean}>}
   */
  updateItem: (id, content) => ipcRenderer.invoke('clipboard:update', id, content),

  /**
   * 置顶/取消置顶
   * @param {number} id - 记录ID
   * @returns {Promise<{success: boolean, isPinned: boolean}>}
   */
  togglePin: (id) => ipcRenderer.invoke('clipboard:toggle-pin', id),

  /**
   * 清空历史
   * @param {boolean} keepPinned - 是否保留置顶项
   * @returns {Promise<{deleted: number}>}
   */
  clearAll: (keepPinned = true) => ipcRenderer.invoke('clipboard:clear-all', keepPinned),

  /**
   * 导出数据
   * @returns {Promise<{version, exportDate, count, items}>}
   */
  exportData: () => ipcRenderer.invoke('clipboard:export'),

  /**
   * 导入数据
   * @param {Object} data - 导入数据
   * @returns {Promise<{imported: number}>}
   */
  importData: (data) => ipcRenderer.invoke('clipboard:import', data),

  /**
   * 复制到剪贴板
   * @param {string} content - 要复制的内容
   */
  copyToClipboard: (content) => ipcRenderer.send('clipboard:copy', content),

  /**
   * 获取图片文件 URL
   * @param {string} filePath - 图片文件路径
   * @returns {Promise<string>} - file:// URL
   */
  getImageUrl: (filePath) => ipcRenderer.invoke('clipboard:get-image-url', filePath),

  // ==================== 事件监听 ====================

  /**
   * 监听剪贴板更新
   * @param {Function} callback - 回调函数 (data) => void
   * @returns {Function} - 取消监听函数
   */
  onClipboardUpdated: (callback) => {
    const wrapped = (event, data) => callback(data);
    ipcRenderer.on('clipboard:updated', wrapped);
    return () => ipcRenderer.removeListener('clipboard:updated', wrapped);
  },

  /**
   * 监听剪贴板删除
   * @param {Function} callback - 回调函数 (id) => void
   * @returns {Function} - 取消监听函数
   */
  onClipboardDeleted: (callback) => {
    const wrapped = (event, id) => callback(id);
    ipcRenderer.on('clipboard:deleted', wrapped);
    return () => ipcRenderer.removeListener('clipboard:deleted', wrapped);
  },

  /**
   * 监听剪贴板清空
   * @param {Function} callback - 回调函数 () => void
   * @returns {Function} - 取消监听函数
   */
  onClipboardCleared: (callback) => {
    const wrapped = () => callback();
    ipcRenderer.on('clipboard:cleared', wrapped);
    return () => ipcRenderer.removeListener('clipboard:cleared', wrapped);
  },

  // ==================== 窗口控制 ====================

  /**
   * 隐藏窗口
   */
  hideWindow: () => ipcRenderer.send('window:hide'),

  // ==================== 设置 ====================

  /**
   * 获取设置
   * @returns {Promise<Object>}
   */
  getSettings: () => ipcRenderer.invoke('settings:get'),

  /**
   * 更新设置
   * @param {Object} settings - 设置对象
   * @returns {Promise<Object>}
   */
  updateSettings: (settings) => ipcRenderer.invoke('settings:update', settings),

  // ==================== 对话框 ====================

  /**
   * 打开文件选择对话框
   * @returns {Promise<string|null>} - 选择的文件路径
   */
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),

  /**
   * 打开保存文件对话框
   * @param {string} defaultName - 默认文件名
   * @returns {Promise<string|null>} - 保存的文件路径
   */
  saveFileDialog: (defaultName) => ipcRenderer.invoke('dialog:save-file', defaultName),
});
