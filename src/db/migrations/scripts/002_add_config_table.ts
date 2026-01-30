/**
 * 迁移: 添加系统配置表
 * 版本: 2
 * 创建时间: 2026-01-29T06:08:00.000Z
 */

import { Database } from 'sqlite';

export default {
  version: 2,
  description: '添加系统配置表',

  /**
   * 升级操作
   */
  async up(db: Database): Promise<void> {
    // 创建系统配置表
    await db.run(`
      CREATE TABLE IF NOT EXISTS system_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        config_key TEXT NOT NULL UNIQUE,
        config_value TEXT,
        description TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建配置表索引
    await db.run(`CREATE INDEX IF NOT EXISTS idx_system_config_key ON system_config(config_key)`);

    // 插入默认配置
    await db.run(`
      INSERT OR IGNORE INTO system_config (config_key, config_value, description) VALUES
        ('crawl.enabled', 'true', '是否启用采集功能'),
        ('crawl.interval', '3600', '采集间隔（秒）'),
        ('crawl.max_concurrent', '3', '最大并发采集数'),
        ('summary.enabled', 'true', '是否启用每日总结生成'),
        ('summary.generation_time', '06:00', '每日总结生成时间'),
        ('retention.days', '30', '数据保留天数'),
        ('backup.enabled', 'true', '是否启用自动备份'),
        ('backup.interval', '86400', '备份间隔（秒）')
    `);
  },

  /**
   * 降级操作
   */
  async down(db: Database): Promise<void> {
    // 删除索引
    await db.run(`DROP INDEX IF EXISTS idx_system_config_key`);

    // 删除表
    await db.run(`DROP TABLE IF EXISTS system_config`);
  },

  /**
   * 迁移依赖（可选）
   */
  dependencies: [1] as number[] // 依赖于初始schema
};