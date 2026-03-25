# Clipboard History

基于 Electron 的剪贴板历史记录桌面应用。

## 功能特性

### 核心功能
- **剪贴板监听**: 自动记录剪贴板文本历史
- **全局快捷键**: `Cmd/Ctrl+Shift+V` 快速唤起应用
- **虚拟滚动**: 大数据量下流畅显示
- **搜索过滤**: 支持内容搜索

### 数据管理
- **单条删除**: 删除不需要的历史记录
- **清空历史**: 一键清空（保留置顶项）
- **数据导出**: 导出为 JSON 文件备份
- **数据导入**: 从 JSON 文件恢复数据
- **自动清理**: 限制数据库大小，自动清理旧数据

### 内容操作
- **复制**: 快速复制历史内容到剪贴板
- **编辑**: 修改历史记录内容
- **置顶**: 重要内容置顶显示

## 项目结构

```
clipboard-history/
├── src/
│   ├── main/                    # 主进程代码
│   │   ├── index.js             # 主入口
│   │   ├── services/
│   │   │   ├── database-service.js    # 数据库服务
│   │   │   ├── clipboard-service.js   # 剪贴板监听服务
│   │   │   └── cleanup-service.js     # 自动清理服务
│   │   └── preload/
│   │       └── index.js         # 预加载脚本
│   │
│   └── renderer/                # 渲染进程代码
│       ├── components/
│       │   ├── ClipboardManager.jsx   # 主容器
│       │   ├── ClipboardList.jsx      # 虚拟滚动列表
│       │   ├── ClipboardItem.jsx      # 单项组件
│       │   ├── DetailPanel.jsx        # 详情面板
│       │   ├── Toolbar.jsx            # 工具栏
│       │   └── SearchBar.jsx          # 搜索栏
│       ├── hooks/
│       │   └── useDebounce.js         # 防抖 Hook
│       └── index.js             # 渲染进程入口
│
├── dist/                        # 构建输出
├── config/                      # 配置文件
└── assets/                      # 静态资源
```

## 技术栈

- **Electron**: 36.4.0
- **React**: 19.1.0
- **Ant Design**: 5.26.0
- **better-sqlite3**: 同步 SQLite 数据库
- **electron-store**: 配置持久化
- **react-window**: 虚拟滚动

## 安装依赖

```bash
npm install
```

## 开发运行

```bash
# 开发模式
npm run dev

# 或
npm start
```

## 构建打包

```bash
# 构建前端
npm run build

# 打包应用
npm run make
```

## 配置说明

配置文件存储在用户数据目录，可通过以下方式修改：

```javascript
// 默认配置
{
  shortcuts: {
    toggleWindow: 'CmdOrCtrl+Shift+V'  // 唤起窗口快捷键
  },
  cleanup: {
    enabled: true,          // 启用自动清理
    maxAgeDays: 30,         // 保留30天
    maxItems: 10000,        // 最多10000条
    keepPinned: true        // 保留置顶项
  },
  ui: {
    pageSize: 50,           // 每页显示数量
    theme: 'light'          // 主题
  }
}
```

## 性能优化

- **剪贴板监听**: 500ms 轮询 + MD5 哈希比较，避免频繁数据库查询
- **虚拟滚动**: 只渲染可视区域，支持海量数据
- **WAL 模式**: SQLite 写入前向日志，提高并发性能
- **防抖搜索**: 300ms 防抖，减少搜索频率

## 数据库

- **位置**: `~/Library/Application Support/clipboard-history/clipboard.db` (macOS)
- **表结构**:
  ```sql
  CREATE TABLE clipboard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT NOT NULL,
    content_hash TEXT UNIQUE,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_pinned BOOLEAN DEFAULT 0,
    tags TEXT,
    source TEXT
  );
  ```

## 许可证

ISC
