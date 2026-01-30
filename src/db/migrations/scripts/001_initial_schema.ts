/**
 * 迁移: 创建初始数据库Schema
 * 版本: 1
 * 创建时间: 2026-01-29T06:07:00.000Z
 */

import { Database } from 'sqlite';

export default {
  version: 1,
  description: '创建初始数据库Schema',

  /**
   * 升级操作
   */
  async up(db: Database): Promise<void> {
    // platforms表: 存储新闻平台信息
    await db.run(`
      CREATE TABLE IF NOT EXISTS platforms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        icon TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // news_items表: 存储新闻数据
    await db.run(`
      CREATE TABLE IF NOT EXISTS news_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform_id INTEGER NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        url TEXT NOT NULL,
        author TEXT,
        publish_time DATETIME NOT NULL,
        views INTEGER DEFAULT 0,
        likes INTEGER DEFAULT 0,
        shares INTEGER DEFAULT 0,
        comments INTEGER DEFAULT 0,
        tags TEXT, -- JSON数组存储
        category TEXT,
        is_investment_related BOOLEAN DEFAULT FALSE,
        summary TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

        -- 约束
        FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE,
        UNIQUE(platform_id, external_id)
      )
    `);

    // daily_summaries表: 存储每日总结
    await db.run(`
      CREATE TABLE IF NOT EXISTS daily_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE NOT NULL UNIQUE,
        domestic_hotspots TEXT, -- JSON数组存储
        international_hotspots TEXT, -- JSON数组存储
        investment_hotspots TEXT, -- JSON数组存储
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // crawl_logs表: 存储采集日志
    await db.run(`
      CREATE TABLE IF NOT EXISTS crawl_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        platform_id INTEGER NOT NULL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
        items_collected INTEGER DEFAULT 0,
        status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
        error_message TEXT,

        -- 约束
        FOREIGN KEY (platform_id) REFERENCES platforms(id) ON DELETE CASCADE
      )
    `);

    // 创建索引优化查询性能

    // platforms表索引
    await db.run(`CREATE INDEX IF NOT EXISTS idx_platforms_name ON platforms(name)`);

    // news_items表索引
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_platform_id ON news_items(platform_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_publish_time ON news_items(publish_time)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_category ON news_items(category)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_is_investment_related ON news_items(is_investment_related)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_platform_date ON news_items(platform_id, DATE(publish_time))`);

    // daily_summaries表索引
    await db.run(`CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(date)`);

    // crawl_logs表索引
    await db.run(`CREATE INDEX IF NOT EXISTS idx_crawl_logs_platform_id ON crawl_logs(platform_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_crawl_logs_started_at ON crawl_logs(started_at)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_crawl_logs_status ON crawl_logs(status)`);

    // 插入默认平台数据
    await db.run(`
      INSERT OR IGNORE INTO platforms (name, icon) VALUES
        ('weibo', '📱'),
        ('zhihu', '📚'),
        ('toutiao', '📰'),
        ('baidu', '🔍'),
        ('wechat', '💬')
    `);
  },

  /**
   * 降级操作
   */
  async down(db: Database): Promise<void> {
    // 删除索引
    await db.run(`DROP INDEX IF EXISTS idx_crawl_logs_status`);
    await db.run(`DROP INDEX IF EXISTS idx_crawl_logs_started_at`);
    await db.run(`DROP INDEX IF EXISTS idx_crawl_logs_platform_id`);
    await db.run(`DROP INDEX IF EXISTS idx_daily_summaries_date`);
    await db.run(`DROP INDEX IF EXISTS idx_news_items_platform_date`);
    await db.run(`DROP INDEX IF EXISTS idx_news_items_is_investment_related`);
    await db.run(`DROP INDEX IF EXISTS idx_news_items_category`);
    await db.run(`DROP INDEX IF EXISTS idx_news_items_publish_time`);
    await db.run(`DROP INDEX IF EXISTS idx_news_items_platform_id`);
    await db.run(`DROP INDEX IF EXISTS idx_platforms_name`);

    // 删除表（按依赖关系逆序）
    await db.run(`DROP TABLE IF EXISTS crawl_logs`);
    await db.run(`DROP TABLE IF EXISTS daily_summaries`);
    await db.run(`DROP TABLE IF EXISTS news_items`);
    await db.run(`DROP TABLE IF EXISTS platforms`);
  },

  /**
   * 迁移依赖（可选）
   */
  dependencies: [] as number[]
};