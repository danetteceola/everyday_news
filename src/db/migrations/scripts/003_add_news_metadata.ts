/**
 * 迁移: 为新闻表添加元数据字段
 * 版本: 3
 * 创建时间: 2026-01-29T06:09:00.000Z
 */

import { Database } from 'sqlite';

export default {
  version: 3,
  description: '为新闻表添加元数据字段',

  /**
   * 升级操作
   */
  async up(db: Database): Promise<void> {
    // 为news_items表添加新的元数据字段
    await db.run(`ALTER TABLE news_items ADD COLUMN language TEXT DEFAULT 'zh-CN'`);
    await db.run(`ALTER TABLE news_items ADD COLUMN sentiment_score REAL`);
    await db.run(`ALTER TABLE news_items ADD COLUMN is_verified BOOLEAN DEFAULT FALSE`);
    await db.run(`ALTER TABLE news_items ADD COLUMN thumbnail_url TEXT`);
    await db.run(`ALTER TABLE news_items ADD COLUMN read_time INTEGER DEFAULT 0`);

    // 创建新的索引
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_language ON news_items(language)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_sentiment ON news_items(sentiment_score)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_verified ON news_items(is_verified)`);

    // 更新现有的新闻项，设置默认语言
    await db.run(`UPDATE news_items SET language = 'zh-CN' WHERE language IS NULL`);

    // 为crawl_logs表添加额外字段
    await db.run(`ALTER TABLE crawl_logs ADD COLUMN duration INTEGER`);
    await db.run(`ALTER TABLE crawl_logs ADD COLUMN memory_usage INTEGER`);
    await db.run(`ALTER TABLE crawl_logs ADD COLUMN user_agent TEXT`);
  },

  /**
   * 降级操作
   */
  async down(db: Database): Promise<void> {
    // 删除新增的索引
    await db.run(`DROP INDEX IF EXISTS idx_news_items_verified`);
    await db.run(`DROP INDEX IF EXISTS idx_news_items_sentiment`);
    await db.run(`DROP INDEX IF EXISTS idx_news_items_language`);

    // SQLite不支持直接删除列，需要创建新表并复制数据
    // 这是简化的降级操作 - 在实际生产环境中需要更复杂的迁移

    // 记录降级操作，实际实现可能需要更复杂的数据迁移
    console.warn('SQLite不支持直接删除列，降级操作需要手动数据迁移');

    // 创建临时表并复制数据（简化版本）
    await db.run(`
      CREATE TABLE IF NOT EXISTS news_items_backup AS
      SELECT
        id, platform_id, external_id, title, content, url, author,
        publish_time, views, likes, shares, comments, tags, category,
        is_investment_related, summary, created_at
      FROM news_items
    `);

    await db.run(`DROP TABLE news_items`);
    await db.run(`ALTER TABLE news_items_backup RENAME TO news_items`);

    // 重新创建索引
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_platform_id ON news_items(platform_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_publish_time ON news_items(publish_time)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_category ON news_items(category)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_is_investment_related ON news_items(is_investment_related)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_news_items_platform_date ON news_items(platform_id, DATE(publish_time))`);

    // 恢复crawl_logs表（同样需要处理）
    await db.run(`
      CREATE TABLE IF NOT EXISTS crawl_logs_backup AS
      SELECT
        id, platform_id, started_at, completed_at, items_collected,
        status, error_message
      FROM crawl_logs
    `);

    await db.run(`DROP TABLE crawl_logs`);
    await db.run(`ALTER TABLE crawl_logs_backup RENAME TO crawl_logs`);

    // 重新创建索引
    await db.run(`CREATE INDEX IF NOT EXISTS idx_crawl_logs_platform_id ON crawl_logs(platform_id)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_crawl_logs_started_at ON crawl_logs(started_at)`);
    await db.run(`CREATE INDEX IF NOT EXISTS idx_crawl_logs_status ON crawl_logs(status)`);
  },

  /**
   * 迁移依赖（可选）
   */
  dependencies: [1] as number[] // 依赖于初始schema
};