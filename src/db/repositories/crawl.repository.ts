import { Database } from 'sqlite';
import { CrawlLog } from '../types';
import { CrawlLogRepository as CrawlLogRepositoryInterface, PaginatedResult } from '../types/repository';
import { connectionManager } from '../config/connection';

/**
 * 采集日志查询参数
 */
export interface CrawlQueryParams {
  platformId?: number;
  status?: 'running' | 'completed' | 'failed';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
  orderBy?: 'started_at' | 'completed_at' | 'items_collected';
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * 采集统计信息
 */
export interface CrawlStats {
  totalCrawls: number;
  successfulCrawls: number;
  failedCrawls: number;
  runningCrawls: number;
  totalItemsCollected: number;
  averageItemsPerCrawl: number;
  successRate: number;
}

/**
 * 平台采集统计
 */
export interface PlatformCrawlStats {
  platformId: number;
  platformName?: string;
  totalCrawls: number;
  successfulCrawls: number;
  failedCrawls: number;
  totalItemsCollected: number;
  averageItemsPerCrawl: number;
  successRate: number;
  lastCrawlTime: Date | null;
}

/**
 * 采集日志数据访问仓库
 */
export class CrawlLogRepository implements CrawlLogRepositoryInterface {
  /**
   * 创建采集日志
   */
  public async create(log: Omit<CrawlLog, 'id' | 'started_at'>): Promise<CrawlLog> {
    const db = await connectionManager.getConnection();

    try {
      const result = await db.run(
        `INSERT INTO crawl_logs (platform_id, completed_at, items_collected, status, error_message)
         VALUES (?, ?, ?, ?, ?)`,
        log.platform_id,
        log.completed_at ? log.completed_at.toISOString() : null,
        log.items_collected,
        log.status,
        log.error_message
      );

      const createdLog = await this.findById(result.lastID!);
      return createdLog!;
    } finally {
      await db.close();
    }
  }

  /**
   * 开始采集
   */
  public async startCrawl(platformId: number): Promise<CrawlLog> {
    const db = await connectionManager.getConnection();

    try {
      const result = await db.run(
        `INSERT INTO crawl_logs (platform_id, status) VALUES (?, 'running')`,
        platformId
      );

      const createdLog = await this.findById(result.lastID!);
      return createdLog!;
    } finally {
      await db.close();
    }
  }

  /**
   * 完成采集
   */
  public async completeCrawl(id: number, itemsCollected: number): Promise<CrawlLog | null> {
    const db = await connectionManager.getConnection();

    try {
      const result = await db.run(
        `UPDATE crawl_logs SET
          completed_at = CURRENT_TIMESTAMP,
          items_collected = ?,
          status = 'completed'
        WHERE id = ? AND status = 'running'`,
        itemsCollected,
        id
      );

      if (result.changes === 0) {
        return null;
      }

      return this.findById(id);
    } finally {
      await db.close();
    }
  }

  /**
   * 标记采集失败
   */
  public async failCrawl(id: number, errorMessage: string): Promise<CrawlLog | null> {
    const db = await connectionManager.getConnection();

    try {
      const result = await db.run(
        `UPDATE crawl_logs SET
          completed_at = CURRENT_TIMESTAMP,
          status = 'failed',
          error_message = ?
        WHERE id = ? AND status = 'running'`,
        errorMessage,
        id
      );

      if (result.changes === 0) {
        return null;
      }

      return this.findById(id);
    } finally {
      await db.close();
    }
  }

  /**
   * 根据ID查找采集日志
   */
  public async findById(id: number): Promise<CrawlLog | null> {
    const db = await connectionManager.getConnection();

    try {
      const log = await db.get(
        `SELECT * FROM crawl_logs WHERE id = ?`,
        id
      );

      if (!log) {
        return null;
      }

      return this.mapToCrawlLog(log);
    } finally {
      await db.close();
    }
  }

  /**
   * 查询采集日志
   */
  public async query(params: CrawlQueryParams): Promise<PaginatedResult<CrawlLog>> {
    const db = await connectionManager.getConnection();

    try {
      const { whereClause, params: queryParams } = this.buildWhereClause(params);
      const orderClause = this.buildOrderClause(params);

      // 获取总数
      const countResult = await db.get(
        `SELECT COUNT(*) as total FROM crawl_logs ${whereClause}`,
        ...queryParams
      );

      // 获取数据
      const limit = params.limit || 100;
      const offset = params.offset || 0;

      const logs = await db.all(
        `SELECT * FROM crawl_logs ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
        ...queryParams,
        limit,
        offset
      );

      const total = countResult?.total || 0;
      const hasMore = total > offset + limit;

      return {
        items: logs.map(this.mapToCrawlLog),
        total,
        limit,
        offset,
        hasMore
      };
    } finally {
      await db.close();
    }
  }

  /**
   * 获取运行中的采集任务
   */
  public async getRunningCrawls(): Promise<CrawlLog[]> {
    const db = await connectionManager.getConnection();

    try {
      const logs = await db.all(
        `SELECT * FROM crawl_logs WHERE status = 'running' ORDER BY started_at DESC`
      );

      return logs.map(this.mapToCrawlLog);
    } finally {
      await db.close();
    }
  }

  /**
   * 获取最近的采集日志
   */
  public async getRecentCrawls(limit: number = 50): Promise<CrawlLog[]> {
    const db = await connectionManager.getConnection();

    try {
      const logs = await db.all(`
        SELECT * FROM crawl_logs
        ORDER BY started_at DESC
        LIMIT ?
      `, limit);

      return logs.map(this.mapToCrawlLog);
    } finally {
      await db.close();
    }
  }

  /**
   * 获取平台最近的采集日志
   */
  public async getRecentCrawlsByPlatform(platformId: number, limit: number = 20): Promise<CrawlLog[]> {
    const db = await connectionManager.getConnection();

    try {
      const logs = await db.all(`
        SELECT * FROM crawl_logs
        WHERE platform_id = ?
        ORDER BY started_at DESC
        LIMIT ?
      `, platformId, limit);

      return logs.map(this.mapToCrawlLog);
    } finally {
      await db.close();
    }
  }

  /**
   * 获取采集统计信息
   */
  public async getStats(params?: {
    platformId?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<CrawlStats> {
    const db = await connectionManager.getConnection();

    try {
      const { whereClause, params: queryParams } = this.buildWhereClause(params || {});

      const statsResult = await db.get(`
        SELECT
          COUNT(*) as total_crawls,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_crawls,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_crawls,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running_crawls,
          SUM(items_collected) as total_items_collected,
          AVG(items_collected) as avg_items_per_crawl
        FROM crawl_logs
        ${whereClause}
      `, ...queryParams);

      const totalCrawls = statsResult?.total_crawls || 0;
      const successfulCrawls = statsResult?.successful_crawls || 0;
      const failedCrawls = statsResult?.failed_crawls || 0;
      const runningCrawls = statsResult?.running_crawls || 0;
      const totalItemsCollected = statsResult?.total_items_collected || 0;
      const averageItemsPerCrawl = statsResult?.avg_items_per_crawl || 0;

      const successRate = totalCrawls > 0 ? (successfulCrawls / totalCrawls) * 100 : 0;

      return {
        totalCrawls,
        successfulCrawls,
        failedCrawls,
        runningCrawls,
        totalItemsCollected,
        averageItemsPerCrawl,
        successRate
      };
    } finally {
      await db.close();
    }
  }

  /**
   * 获取平台采集统计
   */
  public async getPlatformCrawlStats(): Promise<PlatformCrawlStats[]> {
    const db = await connectionManager.getConnection();

    try {
      const stats = await db.all(`
        SELECT
          platform_id,
          COUNT(*) as total_crawls,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as successful_crawls,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed_crawls,
          SUM(items_collected) as total_items_collected,
          AVG(items_collected) as avg_items_per_crawl,
          MAX(started_at) as last_crawl_time
        FROM crawl_logs
        GROUP BY platform_id
        ORDER BY total_items_collected DESC
      `);

      return stats.map(stat => ({
        platformId: stat.platform_id,
        totalCrawls: stat.total_crawls,
        successfulCrawls: stat.successful_crawls,
        failedCrawls: stat.failed_crawls,
        totalItemsCollected: stat.total_items_collected,
        averageItemsPerCrawl: stat.avg_items_per_crawl,
        successRate: stat.total_crawls > 0 ? (stat.successful_crawls / stat.total_crawls) * 100 : 0,
        lastCrawlTime: stat.last_crawl_time ? new Date(stat.last_crawl_time) : null
      }));
    } finally {
      await db.close();
    }
  }

  /**
   * 获取采集趋势
   */
  public async getCrawlTrends(days: number = 30): Promise<{
    dates: string[];
    crawlCounts: number[];
    itemCounts: number[];
    successRates: number[];
  }> {
    const db = await connectionManager.getConnection();

    try {
      const endDate = new Date();
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const trends = await db.all(`
        SELECT
          DATE(started_at) as crawl_date,
          COUNT(*) as crawl_count,
          SUM(items_collected) as item_count,
          AVG(CASE WHEN status = 'completed' THEN 1.0 ELSE 0.0 END) * 100 as success_rate
        FROM crawl_logs
        WHERE started_at >= ? AND started_at <= ?
        GROUP BY DATE(started_at)
        ORDER BY crawl_date
      `, startDate.toISOString(), endDate.toISOString());

      const dates = trends.map(trend => trend.crawl_date);
      const crawlCounts = trends.map(trend => trend.crawl_count);
      const itemCounts = trends.map(trend => trend.item_count);
      const successRates = trends.map(trend => trend.success_rate);

      return {
        dates,
        crawlCounts,
        itemCounts,
        successRates
      };
    } finally {
      await db.close();
    }
  }

  /**
   * 清理旧的采集日志
   */
  public async cleanupOldLogs(retentionDays: number = 30): Promise<number> {
    const db = await connectionManager.getConnection();

    try {
      const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

      const result = await db.run(
        `DELETE FROM crawl_logs WHERE started_at < ?`,
        cutoffDate.toISOString()
      );

      return result.changes!;
    } finally {
      await db.close();
    }
  }

  /**
   * 获取错误统计
   */
  public async getErrorStats(limit: number = 20): Promise<Array<{
    errorMessage: string;
    count: number;
    lastOccurred: Date;
  }>> {
    const db = await connectionManager.getConnection();

    try {
      const errors = await db.all(`
        SELECT
          error_message,
          COUNT(*) as count,
          MAX(started_at) as last_occurred
        FROM crawl_logs
        WHERE status = 'failed' AND error_message IS NOT NULL
        GROUP BY error_message
        ORDER BY count DESC
        LIMIT ?
      `, limit);

      return errors.map(error => ({
        errorMessage: error.error_message,
        count: error.count,
        lastOccurred: new Date(error.last_occurred)
      }));
    } finally {
      await db.close();
    }
  }

  /**
   * 构建WHERE子句
   */
  private buildWhereClause(params: CrawlQueryParams): { whereClause: string; params: any[] } {
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (params.platformId) {
      conditions.push('platform_id = ?');
      queryParams.push(params.platformId);
    }

    if (params.status) {
      conditions.push('status = ?');
      queryParams.push(params.status);
    }

    if (params.startDate) {
      conditions.push('started_at >= ?');
      queryParams.push(params.startDate.toISOString());
    }

    if (params.endDate) {
      conditions.push('started_at <= ?');
      queryParams.push(params.endDate.toISOString());
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params: queryParams };
  }

  /**
   * 构建ORDER BY子句
   */
  private buildOrderClause(params: CrawlQueryParams): string {
    const orderBy = params.orderBy || 'started_at';
    const orderDirection = params.orderDirection || 'DESC';
    return `ORDER BY ${orderBy} ${orderDirection}`;
  }

  /**
   * 映射数据库行到CrawlLog对象
   */
  private mapToCrawlLog(row: any): CrawlLog {
    return {
      id: row.id,
      platform_id: row.platform_id,
      started_at: new Date(row.started_at),
      completed_at: row.completed_at ? new Date(row.completed_at) : null,
      items_collected: row.items_collected,
      status: row.status as 'running' | 'completed' | 'failed',
      error_message: row.error_message
    };
  }
}

// 导出默认采集日志仓库实例
export const crawlLogRepository = new CrawlLogRepository();