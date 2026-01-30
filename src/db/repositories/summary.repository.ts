import { Database } from 'sqlite';
import { DailySummary } from '../types';
import { DailySummaryRepository as DailySummaryRepositoryInterface, PaginatedResult } from '../types/repository';
import { connectionManager } from '../config/connection';

/**
 * 每日总结查询参数
 */
export interface SummaryQueryParams {
  startDate?: string; // YYYY-MM-DD格式
  endDate?: string; // YYYY-MM-DD格式
  limit?: number;
  offset?: number;
  orderBy?: 'date' | 'generated_at';
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * 热点统计
 */
export interface HotspotStats {
  date: string;
  domesticCount: number;
  internationalCount: number;
  investmentCount: number;
  totalHotspots: number;
}

/**
 * 每日总结数据访问仓库
 */
export class DailySummaryRepository implements DailySummaryRepositoryInterface {
  /**
   * 创建每日总结
   */
  public async create(summary: Omit<DailySummary, 'id' | 'generated_at'>): Promise<DailySummary> {
    const db = await connectionManager.getConnection();

    try {
      const result = await db.run(
        `INSERT INTO daily_summaries (date, domestic_hotspots, international_hotspots, investment_hotspots)
         VALUES (?, ?, ?, ?)`,
        summary.date,
        summary.domestic_hotspots ? JSON.stringify(summary.domestic_hotspots) : null,
        summary.international_hotspots ? JSON.stringify(summary.international_hotspots) : null,
        summary.investment_hotspots ? JSON.stringify(summary.investment_hotspots) : null
      );

      const createdSummary = await this.findById(result.lastID!);
      return createdSummary!;
    } finally {
      await db.close();
    }
  }

  /**
   * 根据ID查找每日总结
   */
  public async findById(id: number): Promise<DailySummary | null> {
    const db = await connectionManager.getConnection();

    try {
      const summary = await db.get(
        `SELECT * FROM daily_summaries WHERE id = ?`,
        id
      );

      if (!summary) {
        return null;
      }

      return this.mapToDailySummary(summary);
    } finally {
      await db.close();
    }
  }

  /**
   * 根据日期查找每日总结
   */
  public async findByDate(date: string): Promise<DailySummary | null> {
    const db = await connectionManager.getConnection();

    try {
      const summary = await db.get(
        `SELECT * FROM daily_summaries WHERE date = ?`,
        date
      );

      if (!summary) {
        return null;
      }

      return this.mapToDailySummary(summary);
    } finally {
      await db.close();
    }
  }

  /**
   * 查询每日总结
   */
  public async query(params: SummaryQueryParams): Promise<PaginatedResult<DailySummary>> {
    const db = await connectionManager.getConnection();

    try {
      const { whereClause, params: queryParams } = this.buildWhereClause(params);
      const orderClause = this.buildOrderClause(params);

      // 获取总数
      const countResult = await db.get(
        `SELECT COUNT(*) as total FROM daily_summaries ${whereClause}`,
        ...queryParams
      );

      // 获取数据
      const limit = params.limit || 30;
      const offset = params.offset || 0;

      const summaries = await db.all(
        `SELECT * FROM daily_summaries ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
        ...queryParams,
        limit,
        offset
      );

      const total = countResult?.total || 0;
      const hasMore = total > offset + limit;

      return {
        items: summaries.map(this.mapToDailySummary),
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
   * 更新每日总结
   */
  public async update(id: number, updates: Partial<Omit<DailySummary, 'id' | 'generated_at'>>): Promise<DailySummary | null> {
    const db = await connectionManager.getConnection();

    try {
      const existingSummary = await this.findById(id);
      if (!existingSummary) {
        return null;
      }

      const updatedSummary = { ...existingSummary, ...updates };

      await db.run(
        `UPDATE daily_summaries SET
          date = ?, domestic_hotspots = ?, international_hotspots = ?, investment_hotspots = ?
        WHERE id = ?`,
        updatedSummary.date,
        updatedSummary.domestic_hotspots ? JSON.stringify(updatedSummary.domestic_hotspots) : null,
        updatedSummary.international_hotspots ? JSON.stringify(updatedSummary.international_hotspots) : null,
        updatedSummary.investment_hotspots ? JSON.stringify(updatedSummary.investment_hotspots) : null,
        id
      );

      return this.findById(id);
    } finally {
      await db.close();
    }
  }

  /**
   * 删除每日总结
   */
  public async delete(id: number): Promise<boolean> {
    const db = await connectionManager.getConnection();

    try {
      const result = await db.run(`DELETE FROM daily_summaries WHERE id = ?`, id);
      return result.changes! > 0;
    } finally {
      await db.close();
    }
  }

  /**
   * 批量创建每日总结
   */
  public async batchCreate(summaries: Omit<DailySummary, 'id' | 'generated_at'>[]): Promise<DailySummary[]> {
    return connectionManager.withTransaction(async (db) => {
      const createdSummaries: DailySummary[] = [];

      for (const summary of summaries) {
        try {
          const result = await db.run(
            `INSERT INTO daily_summaries (date, domestic_hotspots, international_hotspots, investment_hotspots)
             VALUES (?, ?, ?, ?)`,
            summary.date,
            summary.domestic_hotspots ? JSON.stringify(summary.domestic_hotspots) : null,
            summary.international_hotspots ? JSON.stringify(summary.international_hotspots) : null,
            summary.investment_hotspots ? JSON.stringify(summary.investment_hotspots) : null
          );

          const createdSummary = await db.get(
            `SELECT * FROM daily_summaries WHERE id = ?`,
            result.lastID
          );

          if (createdSummary) {
            createdSummaries.push(this.mapToDailySummary(createdSummary));
          }
        } catch (error) {
          // 忽略重复项错误，继续插入其他项
          if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
            console.warn(`Duplicate daily summary skipped: ${summary.date}`);
            continue;
          }
          throw error;
        }
      }

      return createdSummaries;
    });
  }

  /**
   * 批量更新每日总结
   */
  public async batchUpdate(ids: number[], updates: Partial<Omit<DailySummary, 'id' | 'generated_at'>>): Promise<number> {
    return connectionManager.withTransaction(async (db) => {
      let updatedCount = 0;

      for (const id of ids) {
        try {
          const existingSummary = await this.findById(id);
          if (!existingSummary) {
            continue;
          }

          const updatedSummary = { ...existingSummary, ...updates };

          const result = await db.run(
            `UPDATE daily_summaries SET
              date = ?, domestic_hotspots = ?, international_hotspots = ?, investment_hotspots = ?
            WHERE id = ?`,
            updatedSummary.date,
            updatedSummary.domestic_hotspots ? JSON.stringify(updatedSummary.domestic_hotspots) : null,
            updatedSummary.international_hotspots ? JSON.stringify(updatedSummary.international_hotspots) : null,
            updatedSummary.investment_hotspots ? JSON.stringify(updatedSummary.investment_hotspots) : null,
            id
          );

          if (result.changes && result.changes > 0) {
            updatedCount++;
          }
        } catch (error) {
          console.warn(`Failed to update summary ${id}:`, error);
          // 继续处理其他更新
        }
      }

      return updatedCount;
    });
  }

  /**
   * 批量删除每日总结
   */
  public async batchDelete(ids: number[]): Promise<number> {
    return connectionManager.withTransaction(async (db) => {
      let deletedCount = 0;

      for (const id of ids) {
        try {
          const result = await db.run(`DELETE FROM daily_summaries WHERE id = ?`, id);
          if (result.changes && result.changes > 0) {
            deletedCount++;
          }
        } catch (error) {
          console.warn(`Failed to delete summary ${id}:`, error);
          // 继续处理其他删除
        }
      }

      return deletedCount;
    });
  }

  /**
   * 获取最新每日总结
   */
  public async getLatest(limit: number = 7): Promise<DailySummary[]> {
    const db = await connectionManager.getConnection();

    try {
      const summaries = await db.all(`
        SELECT * FROM daily_summaries
        ORDER BY date DESC
        LIMIT ?
      `, limit);

      return summaries.map(this.mapToDailySummary);
    } finally {
      await db.close();
    }
  }

  /**
   * 获取热点统计
   */
  public async getHotspotStats(startDate?: string, endDate?: string): Promise<HotspotStats[]> {
    const db = await connectionManager.getConnection();

    try {
      let whereClause = '';
      const params: any[] = [];

      if (startDate && endDate) {
        whereClause = 'WHERE date BETWEEN ? AND ?';
        params.push(startDate, endDate);
      } else if (startDate) {
        whereClause = 'WHERE date >= ?';
        params.push(startDate);
      } else if (endDate) {
        whereClause = 'WHERE date <= ?';
        params.push(endDate);
      }

      const stats = await db.all(`
        SELECT
          date,
          CASE WHEN domestic_hotspots IS NOT NULL THEN json_array_length(domestic_hotspots) ELSE 0 END as domestic_count,
          CASE WHEN international_hotspots IS NOT NULL THEN json_array_length(international_hotspots) ELSE 0 END as international_count,
          CASE WHEN investment_hotspots IS NOT NULL THEN json_array_length(investment_hotspots) ELSE 0 END as investment_count
        FROM daily_summaries
        ${whereClause}
        ORDER BY date DESC
      `, ...params);

      return stats.map(stat => ({
        date: stat.date,
        domesticCount: stat.domestic_count,
        internationalCount: stat.international_count,
        investmentCount: stat.investment_count,
        totalHotspots: stat.domestic_count + stat.international_count + stat.investment_count
      }));
    } finally {
      await db.close();
    }
  }

  /**
   * 获取热点趋势
   */
  public async getHotspotTrends(days: number = 30): Promise<{
    dates: string[];
    domesticTrend: number[];
    internationalTrend: number[];
    investmentTrend: number[];
  }> {
    const db = await connectionManager.getConnection();

    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const stats = await this.getHotspotStats(startDate, endDate);

      const dates = stats.map(stat => stat.date);
      const domesticTrend = stats.map(stat => stat.domesticCount);
      const internationalTrend = stats.map(stat => stat.internationalCount);
      const investmentTrend = stats.map(stat => stat.investmentCount);

      return {
        dates,
        domesticTrend,
        internationalTrend,
        investmentTrend
      };
    } finally {
      await db.close();
    }
  }

  /**
   * 获取最常见的国内热点
   */
  public async getTopDomesticHotspots(limit: number = 10): Promise<Array<{ hotspot: string; count: number }>> {
    return this.getTopHotspots('domestic_hotspots', limit);
  }

  /**
   * 获取最常见的国际热点
   */
  public async getTopInternationalHotspots(limit: number = 10): Promise<Array<{ hotspot: string; count: number }>> {
    return this.getTopHotspots('international_hotspots', limit);
  }

  /**
   * 获取最常见的投资热点
   */
  public async getTopInvestmentHotspots(limit: number = 10): Promise<Array<{ hotspot: string; count: number }>> {
    return this.getTopHotspots('investment_hotspots', limit);
  }

  /**
   * 获取总结统计信息
   */
  public async getStats(): Promise<{
    totalSummaries: number;
    earliestDate: string | null;
    latestDate: string | null;
    daysWithSummaries: number;
    averageHotspotsPerDay: number;
  }> {
    const db = await connectionManager.getConnection();

    try {
      const totalResult = await db.get(`SELECT COUNT(*) as count FROM daily_summaries`);
      const dateRangeResult = await db.get(`SELECT MIN(date) as min_date, MAX(date) as max_date FROM daily_summaries`);
      const hotspotStats = await db.get(`
        SELECT
          AVG(
            CASE WHEN domestic_hotspots IS NOT NULL THEN json_array_length(domestic_hotspots) ELSE 0 END +
            CASE WHEN international_hotspots IS NOT NULL THEN json_array_length(international_hotspots) ELSE 0 END +
            CASE WHEN investment_hotspots IS NOT NULL THEN json_array_length(investment_hotspots) ELSE 0 END
          ) as avg_hotspots
        FROM daily_summaries
      `);

      const totalSummaries = totalResult?.count || 0;
      const earliestDate = dateRangeResult?.min_date || null;
      const latestDate = dateRangeResult?.max_date || null;

      // 计算有总结的天数
      let daysWithSummaries = 0;
      if (earliestDate && latestDate) {
        const start = new Date(earliestDate);
        const end = new Date(latestDate);
        const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
        daysWithSummaries = Math.min(totalSummaries, daysDiff);
      }

      return {
        totalSummaries,
        earliestDate,
        latestDate,
        daysWithSummaries,
        averageHotspotsPerDay: hotspotStats?.avg_hotspots || 0
      };
    } finally {
      await db.close();
    }
  }

  /**
   * 构建WHERE子句
   */
  private buildWhereClause(params: SummaryQueryParams): { whereClause: string; params: any[] } {
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (params.startDate) {
      conditions.push('date >= ?');
      queryParams.push(params.startDate);
    }

    if (params.endDate) {
      conditions.push('date <= ?');
      queryParams.push(params.endDate);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params: queryParams };
  }

  /**
   * 构建ORDER BY子句
   */
  private buildOrderClause(params: SummaryQueryParams): string {
    const orderBy = params.orderBy || 'date';
    const orderDirection = params.orderDirection || 'DESC';
    return `ORDER BY ${orderBy} ${orderDirection}`;
  }

  /**
   * 获取最常见的热点
   */
  private async getTopHotspots(column: string, limit: number): Promise<Array<{ hotspot: string; count: number }>> {
    const db = await connectionManager.getConnection();

    try {
      // 由于SQLite的JSON支持有限，我们需要提取所有热点并手动统计
      const summaries = await db.all(`SELECT ${column} FROM daily_summaries WHERE ${column} IS NOT NULL`);

      const hotspotCounts = new Map<string, number>();

      for (const summary of summaries) {
        const hotspots = JSON.parse(summary[column]);
        if (Array.isArray(hotspots)) {
          for (const hotspot of hotspots) {
            hotspotCounts.set(hotspot, (hotspotCounts.get(hotspot) || 0) + 1);
          }
        }
      }

      // 转换为数组并排序
      const hotspotsArray = Array.from(hotspotCounts.entries())
        .map(([hotspot, count]) => ({ hotspot, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, limit);

      return hotspotsArray;
    } finally {
      await db.close();
    }
  }

  /**
   * 映射数据库行到DailySummary对象
   */
  private mapToDailySummary(row: any): DailySummary {
    return {
      id: row.id,
      date: row.date,
      domestic_hotspots: row.domestic_hotspots ? JSON.parse(row.domestic_hotspots) : null,
      international_hotspots: row.international_hotspots ? JSON.parse(row.international_hotspots) : null,
      investment_hotspots: row.investment_hotspots ? JSON.parse(row.investment_hotspots) : null,
      generated_at: new Date(row.generated_at)
    };
  }
}

// 导出默认每日总结仓库实例
export const dailySummaryRepository = new DailySummaryRepository();