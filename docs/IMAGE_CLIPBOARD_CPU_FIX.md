# 图片剪贴板 CPU 占用修复记录

**日期**: 2026-07-02
**提交**: `c68feca` (`Fix image clipboard polling CPU usage`)
**影响范围**: macOS 剪贴板图片监听

---

## 1. 问题现象

当系统剪贴板当前内容是图片时，应用会持续出现较高 CPU 占用。此前已经做过一次图片剪贴板优化，但问题没有完全解决。

这次重点排查的是：剪贴板内容没有变化时，应用是否仍在重复读取、落盘或哈希图片数据。

---

## 2. 排查过程

### 2.1 定位相关模块

先搜索剪贴板和图片处理相关代码，确认核心逻辑集中在：

- `src/main/services/clipboard-service.js`
- `src/native/pasteboard-monitor.swift`

当前架构是：

- macOS 优先启动 Swift 辅助进程，监听 `NSPasteboard.changeCount`
- 主进程收到变化后调用 `checkClipboard()`
- 图片内容通过 `--read-image` 从原生 pasteboard 读取到临时文件，再由 Node 读回、计算 hash、保存记录
- 如果原生监听不可用，会进入 fallback polling

### 2.2 发现高 CPU 路径

`ClipboardService.startFallbackPolling()` 之前每 3 秒都会调用一次 `checkClipboard()`。

当剪贴板是图片时，`checkClipboard()` 会进入图片路径：

1. `clipboard.availableFormats()`
2. `hasImageFormat()`
3. `readImageBuffer()`
4. `readNativeImageData()`
5. 启动 Swift 辅助程序 `--read-image`
6. 将图片写入临时文件
7. Node 读回图片文件
8. 对整张图片计算 MD5
9. 如果图片没变，再删除 pending 文件

也就是说，只要 fallback polling 生效，哪怕剪贴板完全没变，也会反复做一次完整的大图读取、落盘、读回和哈希。

这解释了为什么之前只靠 hash 去重仍然不够：hash 去重发生得太晚，昂贵操作已经做完了。

---

## 3. 修复思路

核心原则：先判断剪贴板是否变化，再决定是否读取图片 payload。

macOS 的 `NSPasteboard.changeCount` 是轻量变化计数，可以作为图片读取前的前置门禁：

- changeCount 未变化：直接跳过，不读取图片
- changeCount 变化：才进入 `checkClipboard()`
- 同一个 changeCount 已处理过：避免重复处理

---

## 4. 具体改动

### 4.1 Swift 辅助程序

文件：`src/native/pasteboard-monitor.swift`

新增 `--change-count` 命令：

```bash
src/native/bin/pasteboard-monitor --change-count
```

该命令只输出当前 `NSPasteboard.general.changeCount`，不读取任何图片数据。

同时给长期运行的监听循环加了 `autoreleasepool`，减少原生进程长期运行时的临时对象压力。

### 4.2 主进程剪贴板服务

文件：`src/main/services/clipboard-service.js`

新增状态：

- `lastFallbackChangeCount`: fallback polling 上次看到的 changeCount
- `lastProcessedChangeCount`: 已经处理过的 changeCount

调整后流程：

1. 启动时先用 `getNativeChangeCount()` 获取当前 changeCount
2. macOS fallback polling 每轮先调用 `--change-count`
3. 如果 changeCount 没变，直接 return
4. 如果 changeCount 变化，调用 `checkClipboard({ changeCount })`
5. `checkClipboard()` 内部避免重复处理同一个 changeCount

这样图片剪贴板不变化时，不再触发 `--read-image`，也不会重复产生临时图片文件和整图 MD5。

---

## 5. 验证结果

执行过的验证：

```bash
npm run build:native
src/native/bin/pasteboard-monitor --change-count
npm run build
```

结果：

- Swift 辅助程序构建通过
- `--change-count` 能输出可解析数字
- Webpack 生产构建通过

---

## 6. 后续注意事项

- 以后处理剪贴板图片时，不能把“hash 去重”作为第一道防线；图片 payload 读取本身就是高成本操作。
- fallback polling 必须先走轻量变化检测，再读取图片数据。
- 如果后续增加更多图片格式，也应保持同样原则：先判断 changeCount，再读取实际内容。
