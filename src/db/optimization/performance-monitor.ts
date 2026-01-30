/**
 * 数据库性能监控和优化框架
 */

import { Database } from 'sqlite';
import { connectionManager } from '../config/connection';

/**
 * 查询性能统计
 */
export interface QueryStats {
  query: string;
  executionCount: number;
  totalExecutionTime: number;
  avgExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  lastExecuted: Date;
}

/**
 * 索引使用统计
 */
export interface IndexStats {
  tableName: string;
  indexName: string;
  isUsed: boolean;
  scanCount: number;
  lookupCount: number;
  sizeBytes: number;
}

/**
 * 表统计信息
 */
export interface TableStats {
  tableName: string;
  rowCount: number;
  dataSize: number;
  indexSize: number;
  totalSize: number;
  lastAnalyzed: Date | null;
}

/**
 * 慢查询定义
 */
export interface SlowQuery {
  query: string;
  executionTime: number;
  executedAt: Date;
  parameters?: any[];
}

/**
 * 性能监控配置
 */
export interface PerformanceMonitorConfig {
  // 慢查询阈值（毫秒）
  slowQueryThreshold: number;

  // 监控间隔（秒）
  monitoringInterval: number;

  // 是否启用查询日志
  enableQueryLogging: boolean;

  // 最大保存查询统计数
  maxQueryStats: number;

  // 是否自动分析表
  autoAnalyze: boolean;

  // 分析间隔（小时）
  analyzeInterval: number;
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private config: PerformanceMonitorConfig;
  private queryStats: Map<string, QueryStats> = new Map();
  private slowQueries: SlowQuery[] = [];
  private monitoringTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<PerformanceMonitorConfig>) {
    this.config = {
      slowQueryThreshold: parseInt(process.env.DB_SLOW_QUERY_THRESHOLD || '100'),
      monitoringInterval: parseInt(process.env.DB_MONITORING_INTERVAL || '60'),
      enableQueryLogging: process.env.DB_ENABLE_QUERY_LOGGING === 'true',
      maxQueryStats: parseInt(process.env.DB_MAX_QUERY_STATS || '1000'),
      autoAnalyze: process.env.DB_AUTO_ANALYZE !== 'false',
      analyzeInterval: parseInt(process.env.DB_ANALYZE_INTERVAL || '24'),
      ...config
    };
  }

  /**
   * 初始化性能监控
   */
  public async initialize(): Promise<void> {
    // 创建监控表
    await this.createMonitoringTables();

    // 加载历史统计
    await this.loadHistoricalStats();

    // 启动监控
    if (this.config.monitoringInterval > 0) {
      this.startMonitoring();
    }
  }

  /**
   * 创建监控表
   */
  private async createMonitoringTables(): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      // 查询统计表
      await db.run(`
        CREATE TABLE IF NOT EXISTS query_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query_hash TEXT NOT NULL,
          query_text TEXT NOT NULL,
          execution_count INTEGER NOT NULL DEFAULT 0,
          total_execution_time INTEGER NOT NULL DEFAULT 0,
          avg_execution_time REAL NOT NULL DEFAULT 0,
          min_execution_time INTEGER NOT NULL DEFAULT 0,
          max_execution_time INTEGER NOT NULL DEFAULT 0,
          last_executed DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(query_hash)
        )
      `);

      // 慢查询日志表
      await db.run(`
        CREATE TABLE IF NOT EXISTS slow_query_log (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          query_text TEXT NOT NULL,
          execution_time INTEGER NOT NULL,
          parameters TEXT,
          executed_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 索引使用统计表
      await db.run(`
        CREATE TABLE IF NOT EXISTS index_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          table_name TEXT NOT NULL,
          index_name TEXT NOT NULL,
          is_used BOOLEAN NOT NULL DEFAULT FALSE,
          scan_count INTEGER NOT NULL DEFAULT 0,
          lookup_count INTEGER NOT NULL DEFAULT 0,
          size_bytes INTEGER NOT NULL DEFAULT 0,
          collected_at DATETIME NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(table_name, index_name, collected_at)
        )
      `);

      // 创建索引
      await db.run(`CREATE INDEX IF NOT EXISTS idx_query_stats_query_hash ON query_stats(query_hash)`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_slow_query_log_executed_at ON slow_query_log(executed_at)`);
      await db.run(`CREATE INDEX IF NOT EXISTS idx_index_stats_collected_at ON index_stats(collected_at)`);
    } finally {
      await db.close();
    }
  }

  /**
   * 加载历史统计
   */
  private async loadHistoricalStats(): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      const stats = await db.all(`SELECT * FROM query_stats`);

      for (const stat of stats) {
        this.queryStats.set(stat.query_hash, {
          query: stat.query_text,
          executionCount: stat.execution_count,
          totalExecutionTime: stat.total_execution_time,
          avgExecutionTime: stat.avg_execution_time,
          minExecutionTime: stat.min_execution_time,
          maxExecutionTime: stat.max_execution_time,
          lastExecuted: new Date(stat.last_executed)
        });
      }
    } finally {
      await db.close();
    }
  }

  /**
   * 记录查询执行
   */
  public async recordQuery(
    query: string,
    executionTime: number,
    parameters?: any[]
  ): Promise<void> {
    const queryHash = this.hashQuery(query);
    const now = new Date();

    // 更新内存统计
    const existingStat = this.queryStats.get(queryHash);

    if (existingStat) {
      existingStat.executionCount++;
      existingStat.totalExecutionTime += executionTime;
      existingStat.avgExecutionTime = existingStat.totalExecutionTime / existingStat.executionCount;
      existingStat.minExecutionTime = Math.min(existingStat.minExecutionTime, executionTime);
      existingStat.maxExecutionTime = Math.max(existingStat.maxExecutionTime, executionTime);
      existingStat.lastExecuted = now;
    } else {
      this.queryStats.set(queryHash, {
        query,
        executionCount: 1,
        totalExecutionTime: executionTime,
        avgExecutionTime: executionTime,
        minExecutionTime: executionTime,
        maxExecutionTime: executionTime,
        lastExecuted: now
      });
    }

    // 保存到数据库
    await this.saveQueryStats(queryHash, query, executionTime, now);

    // 检查是否为慢查询
    if (executionTime >= this.config.slowQueryThreshold) {
      const slowQuery: SlowQuery = {
        query,
        executionTime,
        executedAt: now,
        parameters
      };

      this.slowQueries.push(slowQuery);
      await this.logSlowQuery(slowQuery);

      // 限制慢查询列表大小
      if (this.slowQueries.length > this.config.maxQueryStats) {
        this.slowQueries = this.slowQueries.slice(-this.config.maxQueryStats);
      }
    }

    // 限制查询统计大小
    if (this.queryStats.size > this.config.maxQueryStats) {
      const entries = Array.from(this.queryStats.entries());
      entries.sort((a, b) => a[1].lastExecuted.getTime() - b[1].lastExecuted.getTime());
      const toRemove = entries.slice(0, entries.length - this.config.maxQueryStats);
      for (const [hash] of toRemove) {
        this.queryStats.delete(hash);
      }
    }
  }

  /**
   * 保存查询统计到数据库
   */
  private async saveQueryStats(
    queryHash: string,
    query: string,
    executionTime: number,
    executedAt: Date
  ): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      // 使用UPSERT更新统计
      await db.run(`
        INSERT INTO query_stats (query_hash, query_text, execution_count, total_execution_time,
          avg_execution_time, min_execution_time, max_execution_time, last_executed, updated_at)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(query_hash) DO UPDATE SET
          execution_count = execution_count + 1,
          total_execution_time = total_execution_time + ?,
          avg_execution_time = (total_execution_time + ?) / (execution_count + 1),
          min_execution_time = MIN(min_execution_time, ?),
          max_execution_time = MAX(max_execution_time, ?),
          last_executed = ?,
          updated_at = CURRENT_TIMESTAMP
      `,
        queryHash, query, executionTime, executionTime, executionTime, executionTime,
        executionTime, executionTime, executionTime, executionTime, executedAt.toISOString()
      );
    } finally {
      await db.close();
    }
  }

  /**
   * 记录慢查询
   */
  private async logSlowQuery(slowQuery: SlowQuery): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      await db.run(`
        INSERT INTO slow_query_log (query_text, execution_time, parameters, executed_at)
        VALUES (?, ?, ?, ?)
      `,
        slowQuery.query,
        slowQuery.executionTime,
        slowQuery.parameters ? JSON.stringify(slowQuery.parameters) : null,
        slowQuery.executedAt.toISOString()
      );
    } finally {
      await db.close();
    }
  }

  /**
   * 获取查询统计
   */
  public getQueryStats(): QueryStats[] {
    return Array.from(this.queryStats.values())
      .sort((a, b) => b.executionCount - a.executionCount);
  }

  /**
   * 获取慢查询
   */
  public getSlowQueries(limit: number = 50): SlowQuery[] {
    return this.slowQueries
      .sort((a, b) => b.executionTime - a.executionTime)
      .slice(0, limit);
  }

  /**
   * 分析索引使用情况
   */
  public async analyzeIndexUsage(): Promise<IndexStats[]> {
    const db = await connectionManager.getConnection();
    const indexStats: IndexStats[] = [];
    const now = new Date();

    try {
      // 获取所有索引
      const indexes = await db.all(`
        SELECT
          m.tbl_name as table_name,
          il.name as index_name,
          il."unique" as is_unique
        FROM sqlite_master m
        JOIN pragma_index_list(m.tbl_name) il
        WHERE m.type = 'table'
          AND m.tbl_name NOT LIKE 'sqlite_%'
      `);

      for (const index of indexes) {
        // 获取索引统计信息（SQLite的统计信息有限）
        const indexInfo = await db.all(`
          SELECT * FROM pragma_index_info('${index.index_name}')
        `);

        const sizeResult = await db.get(`
          SELECT SUM(pgsize) as size_bytes
          FROM dbstat
          WHERE name = '${index.table_name}'
            AND path LIKE '${index.index_name}/%'
        `);

        indexStats.push({
          tableName: index.table_name,
          indexName: index.index_name,
          isUsed: indexInfo.length > 0, // 简化判断
          scanCount: 0, // SQLite不提供扫描计数
          lookupCount: 0, // SQLite不提供查找计数
          sizeBytes: sizeResult?.size_bytes || 0
        });

        // 保存到数据库
        await db.run(`
          INSERT INTO index_stats (table_name, index_name, is_used, scan_count, lookup_count, size_bytes, collected_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
          index.table_name,
          index.index_name,
          indexInfo.length > 0,
          0,
          0,
          sizeResult?.size_bytes || 0,
          now.toISOString()
        );
      }

      return indexStats;
    } finally {
      await db.close();
    }
  }

  /**
   * 获取表统计信息
   */
  public async getTableStats(): Promise<TableStats[]> {
    const db = await connectionManager.getConnection();
    const tableStats: TableStats[] = [];

    try {
      // 获取所有表
      const tables = await db.all(`
        SELECT name as table_name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
      `);

      for (const table of tables) {
        // 获取行数
        const countResult = await db.get(`SELECT COUNT(*) as row_count FROM ${table.table_name}`);

        // 获取表大小
        const sizeResult = await db.get(`
          SELECT
            SUM(pgsize) as total_size,
            SUM(CASE WHEN path LIKE '%.rowid' THEN pgsize ELSE 0 END) as data_size,
            SUM(CASE WHEN path NOT LIKE '%.rowid' THEN pgsize ELSE 0 END) as index_size
          FROM dbstat
          WHERE name = '${table.table_name}'
        `);

        // 获取最后分析时间
        const analyzeResult = await db.get(`
          SELECT last_analyzed FROM pragma_stats
          WHERE table_name = '${table.table_name}'
        `);

        tableStats.push({
          tableName: table.table_name,
          rowCount: countResult?.row_count || 0,
          dataSize: sizeResult?.data_size || 0,
          indexSize: sizeResult?.index_size || 0,
          totalSize: sizeResult?.total_size || 0,
          lastAnalyzed: analyzeResult?.last_analyzed ? new Date(analyzeResult.last_analyzed) : null
        });
      }

      return tableStats;
    } finally {
      await db.close();
    }
  }

  /**
   * 执行数据库维护
   */
  public async performMaintenance(): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      // VACUUM - 重建数据库文件，减少碎片
      await db.run('VACUUM');

      // ANALYZE - 更新查询优化器的统计信息
      await db.run('ANALYZE');

      // 清理旧数据
      const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30天前
      await db.run(`DELETE FROM slow_query_log WHERE executed_at < ?`, cutoffDate.toISOString());
      await db.run(`DELETE FROM index_stats WHERE collected_at < ?`, cutoffDate.toISOString());

      console.log('数据库维护完成: VACUUM, ANALYZE, 数据清理');
    } finally {
      await db.close();
    }
  }

  /**
   * 获取性能报告
   */
  public async getPerformanceReport(): Promise<{
    queryStats: QueryStats[];
    slowQueries: SlowQuery[];
    indexStats: IndexStats[];
    tableStats: TableStats[];
    recommendations: string[];
  }> {
    const queryStats = this.getQueryStats();
    const slowQueries = this.getSlowQueries(20);
    const indexStats = await this.analyzeIndexUsage();
    const tableStats = await this.getTableStats();
    const recommendations = this.generateRecommendations(queryStats, slowQueries, indexStats, tableStats);

    return {
      queryStats,
      slowQueries,
      indexStats,
      tableStats,
      recommendations
    };
  }

  /**
   * 生成优化建议
   */
  private generateRecommendations(
    queryStats: QueryStats[],
    slowQueries: SlowQuery[],
    indexStats: IndexStats[],
    tableStats: TableStats[]
  ): string[] {
    const recommendations: string[] = [];

    // 分析慢查询
    for (const slowQuery of slowQueries.slice(0, 10)) {
      recommendations.push(`慢查询检测: "${slowQuery.query.substring(0, 100)}..." (${slowQuery.executionTime}ms)`);
    }

    // 分析未使用的索引
    const unusedIndexes = indexStats.filter(stat => !stat.isUsed && stat.sizeBytes > 0);
    if (unusedIndexes.length > 0) {
      recommendations.push(`发现 ${unusedIndexes.length} 个未使用的索引，考虑删除以节省空间`);
      unusedIndexes.slice(0, 5).forEach(index => {
        recommendations.push(`  - ${index.tableName}.${index.indexName} (${this.formatBytes(index.sizeBytes)})`);
      });
    }

    // 分析大表
    const largeTables = tableStats.filter(stat => stat.totalSize > 1024 * 1024 * 100); // 大于100MB
    if (largeTables.length > 0) {
      recommendations.push(`发现 ${largeTables.length} 个大表，考虑分区或归档`);
      largeTables.slice(0, 5).forEach(table => {
        recommendations.push(`  - ${table.tableName}: ${this.formatBytes(table.totalSize)}`);
      });
    }

    // 分析频繁查询
    const frequentQueries = queryStats.filter(stat => stat.executionCount > 1000);
    if (frequentQueries.length > 0) {
      recommendations.push(`发现 ${frequentQueries.length} 个高频查询，考虑优化或缓存`);
    }

    // 建议定期维护
    if (tableStats.some(stat => !stat.lastAnalyzed || Date.now() - stat.lastAnalyzed.getTime() > 7 * 24 * 60 * 60 * 1000)) {
      recommendations.push('建议执行 ANALYZE 更新统计信息');
    }

    return recommendations;
  }

  /**
   * 启动性能监控
   */
  private startMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
    }

    this.monitoringTimer = setInterval(async () => {
      try {
        // 收集索引使用统计
        await this.analyzeIndexUsage();

        // 收集表统计
        await this.getTableStats();

        // 自动分析表
        if (this.config.autoAnalyze) {
          const now = new Date();
          const lastAnalyze = await this.getLastAnalyzeTime();
          const hoursSinceLastAnalyze = lastAnalyze
            ? (now.getTime() - lastAnalyze.getTime()) / (1000 * 60 * 60)
            : Infinity;

          if (hoursSinceLastAnalyze >= this.config.analyzeInterval) {
            await this.performMaintenance();
          }
        }
      } catch (error) {
        console.error('性能监控出错:', error);
      }
    }, this.config.monitoringInterval * 1000);
  }

  /**
   * 获取最后分析时间
   */
  private async getLastAnalyzeTime(): Promise<Date | null> {
    const db = await connectionManager.getConnection();

    try {
      const result = await db.get(`SELECT MAX(last_analyzed) as last_analyzed FROM pragma_stats`);
      return result?.last_analyzed ? new Date(result.last_analyzed) : null;
    } finally {
      await db.close();
    }
  }

  /**
   * 停止性能监控
   */
  public stopMonitoring(): void {
    if (this.monitoringTimer) {
      clearInterval(this.monitoringTimer);
      this.monitoringTimer = null;
    }
  }

  /**
   * 哈希查询字符串
   */
  private hashQuery(query: string): string {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(query).digest('hex');
  }

  /**
   * 格式化字节大小
   */
  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// 导出默认性能监控器实例
export const performanceMonitor = new PerformanceMonitor();