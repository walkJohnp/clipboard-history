# Changelog

所有 notable 变更都将记录在此文件。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

## [2.0.0] - 2026-03-06

### 🚀 重构架构
- 完整模块化重构，分离主进程和渲染进程代码
- 新增 `src/` 目录结构，按功能组织代码
- 数据库服务、剪贴板服务、清理服务独立封装

### ⚡ 性能优化
- **剪贴板监听**: 5秒轮询 → 500ms + MD5哈希比较（10倍提升）
- **列表渲染**: 全量渲染 → react-window 虚拟滚动（支持万级数据）
- **数据库**: 使用 better-sqlite3，启用 WAL 模式
- **搜索**: 添加 300ms 防抖优化

### ✨ 新增功能
- **全局快捷键**: `Cmd/Ctrl+Shift+V` 快速唤起应用
- **单条删除**: 支持删除任意历史记录
- **内容编辑**: 可直接修改历史记录内容
- **置顶功能**: 重要内容置顶显示
- **数据导出**: 导出为 JSON 文件备份
- **数据导入**: 从 JSON 文件恢复数据
- **自动清理**: 按时间/数量限制，防止数据库无限增长
- **内容类型检测**: 自动识别链接/代码/日期
- **相对时间显示**: 显示"2分钟前"等友好格式
- **窗口记忆**: 记住窗口大小

### 🔧 改进功能
- **复制操作**: 复制后自动隐藏窗口
- **窗口行为**: 关闭按钮改为隐藏（托盘化）
- **错误处理**: 使用通知替代 console.log
- **数据查询**: 全量查询 → 分页查询

### 📦 依赖变更

#### 新增
- `better-sqlite3@12.6.2` - 同步 SQLite，性能更好
- `electron-store@11.0.2` - 配置持久化
- `dayjs@1.11.19` - 日期处理
- `react-window@2.2.7` - 虚拟滚动
- `react-window-infinite-loader@2.0.1` - 无限加载
- `react-virtualized-auto-sizer@2.0.3` - 自动尺寸
- `lodash.debounce@4.0.8` - 防抖
- `lodash.throttle@4.1.1` - 节流

#### 保留
- `antd@5.26.0`
- `react@19.1.0`
- `electron@36.4.0`

### 🗄️ 数据库变更
- 新增字段: `content_hash`, `is_pinned`, `tags`, `source`
- 新增索引: `idx_timestamp`, `idx_content_hash`, `idx_is_pinned`
- 自动迁移: 旧数据平滑迁移，保留原有内容

### 📁 文件变更
```
删除:
  - main.js (423行)
  - app.jsx (223行)
  - preload.js (18行)
  - logger.js (78行)

新增:
  - src/main/index.js
  - src/main/services/database-service.js
  - src/main/services/clipboard-service.js
  - src/main/services/cleanup-service.js
  - src/preload/index.js
  - src/renderer/components/ClipboardManager.jsx
  - src/renderer/components/ClipboardList.jsx
  - src/renderer/components/ClipboardItem.jsx
  - src/renderer/components/DetailPanel.jsx
  - src/renderer/components/Toolbar.jsx
  - src/renderer/components/SearchBar.jsx
  - src/renderer/hooks/useDebounce.js
  - src/renderer/index.js
  - docs/REFACTORING.md (重构文档)
  - CHANGELOG.md (本文件)
```

### 📝 文档
- 更新 `readme.md`，添加详细使用说明
- 新增 `docs/REFACTORING.md`，记录重构详情
- 新增 `CHANGELOG.md`，记录版本变更

---

## [1.0.0] - 2025-07-11

### ✨ 初始版本
- 基础剪贴板历史记录功能
- 5秒轮询监听剪贴板
- 简单的列表显示
- SQLite 数据库存储
- 基础搜索功能
