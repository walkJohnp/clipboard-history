const { app, BrowserWindow, ipcMain, clipboard, globalShortcut, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const DatabaseService = require('./services/database-service');
const ClipboardService = require('./services/clipboard-service');
const CleanupService = require('./services/cleanup-service');

// electron-store 是 ESM 模块，需要动态导入
let store;

// 配置存储初始化
async function initStore() {
  const { default: Store } = await import('electron-store');
  store = new Store({
    defaults: {
      shortcuts: {
        toggleWindow: process.platform === 'darwin' ? 'Cmd+Shift+V' : 'Ctrl+Shift+V'
      },
      cleanup: {
        enabled: true,
        maxAgeDays: 30,
        maxItems: 10000,
        keepPinned: true
      },
      ui: {
        pageSize: 50,
        theme: 'light',
        showNotifications: true
      },
      window: {
        width: 1200,
        height: 800
      }
    }
  });
  return store;
}

// 全局状态
let mainWindow = null;
let db = null;
let clipboardService = null;
let cleanupService = null;

// 数据库初始化
function initDatabase() {
  const dbPath = path.join(app.getPath('userData'), 'clipboard.db');
  db = new DatabaseService(dbPath);
  return db;
}

// 创建窗口
function createWindow() {
  const windowConfig = store.get('window');

  mainWindow = new BrowserWindow({
    width: windowConfig.width,
    height: windowConfig.height,
    minWidth: 800,
    minHeight: 600,
    show: false, // 初始不显示，等加载完成
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // 禁用 sandbox 以支持触摸板滚动
      scrollBounce: true,
      enablePreferredSizeMode: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ///trafficLightPosition: { x: 12, y: 16 }, // 设置红绿灯按钮位置
  });

  // 加载页面
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3001');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  // 窗口加载完成后显示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 保存窗口大小
  mainWindow.on('resize', () => {
    const [width, height] = mainWindow.getSize();
    store.set('window', { width, height });
  });

  // 窗口关闭时只是隐藏（除非完全退出）
  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  return mainWindow;
}

// 注册全局快捷键
function registerGlobalShortcuts() {
  const shortcut = store.get('shortcuts.toggleWindow');

  const ret = globalShortcut.register(shortcut, () => {
    toggleWindow();
  });

  if (!ret) {
    console.error('Failed to register global shortcut:', shortcut);
  } else {
    console.log('Global shortcut registered:', shortcut);
  }
}

// 切换窗口显示/隐藏
function toggleWindow() {
  if (!mainWindow) {
    createWindow();
    return;
  }

  if (mainWindow.isVisible()) {
    if (mainWindow.isFocused()) {
      mainWindow.hide();
    } else {
      mainWindow.focus();
    }
  } else {
    mainWindow.show();
    mainWindow.focus();
  }
}

// 隐藏窗口
function hideWindow() {
  if (mainWindow) {
    mainWindow.hide();
  }
}

// 设置 IPC 处理器
function setupIpcHandlers() {
  // 获取剪贴板历史（分页）
  ipcMain.handle('clipboard:get-history', (event, page = 1, pageSize = 50, search = '') => {
    return db.getPage(page, pageSize, search);
  });

  // 获取图片文件 URL
  ipcMain.handle('clipboard:get-image-url', (event, filePath) => {
    if (!filePath || !fs.existsSync(filePath)) {
      return null;
    }
    // 读取图片为 base64
    const buffer = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  });

  // 获取总数
  ipcMain.handle('clipboard:get-count', () => {
    return db.getCount();
  });

  // 删除单条
  ipcMain.handle('clipboard:delete', (event, id) => {
    const result = db.deleteById(id);
    if (result.changes > 0) {
      // 通知所有窗口
      BrowserWindow.getAllWindows().forEach(win => {
        win.webContents.send('clipboard:deleted', id);
      });
    }
    return { success: result.changes > 0 };
  });

  // 更新内容
  ipcMain.handle('clipboard:update', (event, id, content) => {
    const result = db.update(id, content);
    return { success: result.changes > 0 };
  });

  // 置顶切换
  ipcMain.handle('clipboard:toggle-pin', (event, id) => {
    const result = db.togglePin(id);
    return { success: result.changes > 0, isPinned: result.isPinned };
  });

  // 清空历史
  ipcMain.handle('clipboard:clear-all', (event, keepPinned = true) => {
    const result = db.clearAll(keepPinned);
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('clipboard:cleared');
    });
    return { deleted: result.changes };
  });

  // 导出数据
  ipcMain.handle('clipboard:export', async () => {
    const data = db.exportAll();
    return {
      version: '1.0',
      exportDate: new Date().toISOString(),
      count: data.length,
      items: data
    };
  });

  // 导入数据
  ipcMain.handle('clipboard:import', async (event, data) => {
    if (!data.items || !Array.isArray(data.items)) {
      throw new Error('Invalid import format');
    }
    const result = db.importBatch(data.items);
    // 刷新剪贴板服务缓存
    if (clipboardService) {
      clipboardService.refreshCache();
    }
    return { imported: result.changes };
  });

  // 复制到剪贴板并跟踪
  ipcMain.on('clipboard:copy', (event, content) => {
    clipboard.writeText(content);
    if (clipboardService) {
      clipboardService.trackContent(content);
    }
  });

  // 隐藏窗口
  ipcMain.on('window:hide', () => {
    hideWindow();
  });

  // 获取设置
  ipcMain.handle('settings:get', () => store.store);

  // 更新设置
  ipcMain.handle('settings:update', (event, settings) => {
    store.set(settings);
    return store.store;
  });

  // 选择文件（用于导入）
  ipcMain.handle('dialog:open-file', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'JSON Files', extensions: ['json'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // 保存文件（用于导出）
  ipcMain.handle('dialog:save-file', async (event, defaultName) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [
        { name: 'JSON Files', extensions: ['json'] }
      ]
    });
    return result.canceled ? null : result.filePath;
  });
}

// 应用启动
async function main() {
  await app.whenReady();

  // 初始化配置存储
  await initStore();

  // 初始化数据库
  initDatabase();

  // 创建窗口
  createWindow();

  // 设置 IPC
  setupIpcHandlers();

  // 启动剪贴板服务
  clipboardService = new ClipboardService(db, app.getPath('userData'));
  clipboardService.on('new-content', (data) => {
    // 广播给所有渲染进程
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('clipboard:updated', data);
    });
  });
  clipboardService.start();

  // 启动自动清理服务
  if (store.get('cleanup.enabled')) {
    cleanupService = new CleanupService(db, store);
    cleanupService.start();
  }

  // 注册全局快捷键
  registerGlobalShortcuts();

  console.log('Application started successfully');
}

// macOS 激活处理
app.on('activate', () => {
  if (!mainWindow) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

// 所有窗口关闭时的处理
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 应用即将退出
app.on('before-quit', () => {
  app.isQuiting = true;
});

// 应用退出前清理
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (clipboardService) {
    clipboardService.stop();
  }
  if (cleanupService) {
    cleanupService.stop();
  }
  if (db) {
    db.close();
  }
});

// 启动
main().catch(err => {
  console.error('Application startup failed:', err);
  app.quit();
});
