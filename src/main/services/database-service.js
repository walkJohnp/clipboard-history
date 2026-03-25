const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

/**
 * 数据库服务类
 * 封装所有数据库操作，使用 better-sqlite3 获得更好性能
 */
class DatabaseService {
  constructor(dbPath) {
    // 确保目录存在
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL'); // 启用 WAL 模式提高性能
    this.initTables();
    this.runMigrations();
  }

  /**
   * 初始化表结构
   */
  initTables() {
    // 先创建基础表（兼容旧版本）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS clipboard (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 基础索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_timestamp ON clipboard(timestamp DESC);
    `);
  }

  /**
   * 数据库迁移
   */
  runMigrations() {
    // 获取当前版本
    const version = this.db.pragma('user_version', { simple: true });

    // 迁移到版本 1
    if (version < 1) {
      console.log('Running migration v1...');
      try {
        // 添加新列（SQLite 需要单独执行每个 ALTER TABLE）
        try { this.db.exec('ALTER TABLE clipboard ADD COLUMN content_hash TEXT'); } catch (e) {}
        try { this.db.exec('ALTER TABLE clipboard ADD COLUMN is_pinned BOOLEAN DEFAULT 0'); } catch (e) {}
        try { this.db.exec('ALTER TABLE clipboard ADD COLUMN tags TEXT'); } catch (e) {}
        try { this.db.exec('ALTER TABLE clipboard ADD COLUMN source TEXT'); } catch (e) {}

        // 创建新索引
        try { this.db.exec('CREATE INDEX idx_content_hash ON clipboard(content_hash)'); } catch (e) {}
        try { this.db.exec('CREATE INDEX idx_is_pinned ON clipboard(is_pinned)'); } catch (e) {}
        try { this.db.exec('CREATE INDEX idx_content_search ON clipboard(content COLLATE NOCASE)'); } catch (e) {}

        // 为现有记录生成哈希
        const rows = this.db.prepare('SELECT id, content FROM clipboard WHERE content_hash IS NULL').all();
        if (rows.length > 0) {
          const stmt = this.db.prepare('UPDATE clipboard SET content_hash = ? WHERE id = ?');
          const updateMany = this.db.transaction((rows) => {
            for (const row of rows) {
              const hash = crypto.createHash('md5').update(row.content).digest('hex');
              stmt.run(hash, row.id);
            }
          });
          updateMany(rows);
          console.log(`Generated hashes for ${rows.length} existing records`);
        }

        this.db.pragma('user_version = 1');
        console.log('Migration v1 completed');
      } catch (err) {
        console.error('Migration v1 error:', err);
      }
    }

    // 迁移到版本 2 - 添加 type 和 file_path 列
    if (version < 2) {
      console.log('Running migration v2...');
      try {
        try { this.db.exec('ALTER TABLE clipboard ADD COLUMN type TEXT DEFAULT "text"'); } catch (e) {}
        try { this.db.exec('ALTER TABLE clipboard ADD COLUMN file_path TEXT'); } catch (e) {}
        try { this.db.exec('CREATE INDEX IF NOT EXISTS idx_type ON clipboard(type)'); } catch (e) {}

        this.db.pragma('user_version = 2');
        console.log('Migration v2 completed');
      } catch (err) {
        console.error('Migration v2 error:', err);
      }
    }
  }

  /**
   * 计算内容哈希
   */
  static hashContent(content) {
    return crypto.createHash('md5').update(content).digest('hex');
  }

  /**
   * 插入新记录
   * @param {string} content - 剪贴板内容
   * @param {string} source - 来源（可选）
   * @param {string} type - 类型（text/image）
   * @param {string} filePath - 文件路径（图片类型）
   * @returns {Object} - 插入结果
   */
  insert(content, source = null, type = 'text', filePath = null) {
    const hash = DatabaseService.hashContent(content);

    // 先检查是否已存在（使用哈希）
    const existing = this.db.prepare('SELECT id FROM clipboard WHERE content_hash = ?').get(hash);
    if (existing) {
      // 更新现有记录的时间戳
      this.db.prepare(`
        UPDATE clipboard SET timestamp = datetime('now') WHERE id = ?
      `).run(existing.id);
      return { id: existing.id, content, timestamp: new Date().toISOString(), is_pinned: 0, type, file_path: filePath };
    }

    // 插入新记录
    const stmt = this.db.prepare(`
      INSERT INTO clipboard (content, content_hash, source, type, file_path, timestamp)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);

    const result = stmt.run(content, hash, source, type, filePath);
    return {
      id: result.lastInsertRowid,
      content,
      timestamp: new Date().toISOString(),
      is_pinned: 0,
      type,
      file_path: filePath
    };
  }

  /**
   * 分页查询
   * @param {number} page - 页码（从1开始）
   * @param {number} pageSize - 每页大小
   * @param {string} search - 搜索关键词
   * @returns {Object} - { items, total, page, pageSize }
   */
  getPage(page = 1, pageSize = 50, search = '') {
    const offset = (page - 1) * pageSize;
    let whereClause = '';
    let countWhere = '';
    let params = [];

    if (search && search.trim()) {
      whereClause = 'WHERE content LIKE ?';
      countWhere = 'WHERE content LIKE ?';
      params.push(`%${search.trim()}%`);
    }

    const query = `
      SELECT id, content, timestamp, is_pinned, type, file_path
      FROM clipboard
      ${whereClause}
      ORDER BY is_pinned DESC, timestamp DESC
      LIMIT ? OFFSET ?
    `;

    const countQuery = `SELECT COUNT(*) as total FROM clipboard ${countWhere}`;

    const items = this.db.prepare(query).all(...params, pageSize, offset);
    const { total } = this.db.prepare(countQuery).get(...params);

    return { items, total, page, pageSize };
  }

  /**
   * 获取总数
   */
  getCount() {
    return this.db.prepare('SELECT COUNT(*) as count FROM clipboard').pluck().get();
  }

  /**
   * 根据ID获取单条
   */
  getById(id) {
    return this.db.prepare('SELECT * FROM clipboard WHERE id = ?').get(id);
  }

  /**
   * 根据内容哈希查询
   */
  getByHash(hash) {
    return this.db.prepare('SELECT id FROM clipboard WHERE content_hash = ?').get(hash);
  }

  /**
   * 检查内容是否已存在
   */
  exists(content) {
    const hash = DatabaseService.hashContent(content);
    const row = this.getByHash(hash);
    return !!row;
  }

  /**
   * 删除单条
   */
  deleteById(id) {
    return this.db.prepare('DELETE FROM clipboard WHERE id = ?').run(id);
  }

  /**
   * 更新内容
   */
  update(id, content) {
    const hash = DatabaseService.hashContent(content);
    return this.db.prepare(`
      UPDATE clipboard
      SET content = ?, content_hash = ?, timestamp = datetime('now')
      WHERE id = ?
    `).run(content, hash, id);
  }

  /**
   * 置顶切换
   */
  togglePin(id) {
    const row = this.getById(id);
    if (!row) return { changes: 0 };

    const newPinState = row.is_pinned ? 0 : 1;
    const result = this.db.prepare(
      'UPDATE clipboard SET is_pinned = ? WHERE id = ?'
    ).run(newPinState, id);

    return { ...result, isPinned: !!newPinState };
  }

  /**
   * 清空历史
   * @param {boolean} keepPinned - 是否保留置顶项
   */
  clearAll(keepPinned = true) {
    if (keepPinned) {
      return this.db.prepare('DELETE FROM clipboard WHERE is_pinned = 0').run();
    }
    return this.db.prepare('DELETE FROM clipboard').run();
  }

  /**
   * 按时间清理
   */
  cleanupBefore(date) {
    return this.db.prepare(
      'DELETE FROM clipboard WHERE timestamp < ? AND is_pinned = 0'
    ).run(date);
  }

  /**
   * 按数量清理（保留最新的）
   */
  cleanupByCount(maxItems, keepPinned = true) {
    const pinnedClause = keepPinned ? 'AND is_pinned = 0' : '';
    const sql = `
      DELETE FROM clipboard
      WHERE id IN (
        SELECT id FROM clipboard
        WHERE 1=1 ${pinnedClause}
        ORDER BY timestamp DESC
        LIMIT -1 OFFSET ?
      )
    `;
    return this.db.prepare(sql).run(maxItems);
  }

  /**
   * 获取数据库统计
   */
  getStats() {
    return this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN is_pinned = 1 THEN 1 ELSE 0 END) as pinned,
        MIN(timestamp) as oldest,
        MAX(timestamp) as newest,
        SUM(LENGTH(content)) as totalContentSize
      FROM clipboard
    `).get();
  }

  /**
   * 导出所有数据
   */
  exportAll() {
    return this.db.prepare(`
      SELECT id, content, timestamp, is_pinned, tags, source
      FROM clipboard
      ORDER BY timestamp DESC
    `).all();
  }

  /**
   * 批量导入
   */
  importBatch(items) {
    const insert = this.db.prepare(`
      INSERT OR IGNORE INTO clipboard (content, timestamp, is_pinned, tags, source, content_hash)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertMany = this.db.transaction((items) => {
      for (const item of items) {
        const hash = DatabaseService.hashContent(item.content);
        insert.run(
          item.content,
          item.timestamp,
          item.is_pinned || 0,
          item.tags || null,
          item.source || null,
          hash
        );
      }
    });

    return insertMany(items);
  }

  /**
   * 获取最近的一条记录
   */
  getLatest() {
    return this.db.prepare(
      'SELECT content FROM clipboard ORDER BY timestamp DESC LIMIT 1'
    ).get();
  }

  /**
   * 搜索内容
   */
  search(query, limit = 100) {
    return this.db.prepare(`
      SELECT id, content, timestamp, is_pinned
      FROM clipboard
      WHERE content LIKE ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).all(`%${query}%`, limit);
  }

  /**
   * 添加标签
   */
  addTags(id, tags) {
    const row = this.getById(id);
    if (!row) return { changes: 0 };

    const currentTags = row.tags ? JSON.parse(row.tags) : [];
    const newTags = [...new Set([...currentTags, ...tags])];

    return this.db.prepare(
      'UPDATE clipboard SET tags = ? WHERE id = ?'
    ).run(JSON.stringify(newTags), id);
  }

  /**
   * 关闭数据库
   */
  close() {
    this.db.close();
  }
}

module.exports = DatabaseService;
