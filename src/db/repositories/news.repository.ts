import { Database } from 'sqlite';
import { NewsItem } from '../types';
import { NewsItemRepository as NewsItemRepositoryInterface, PaginatedResult } from '../types/repository';
import { connectionManager } from '../config/connection';

/**
 * 新闻数据查询参数
 */
export interface NewsQueryParams {
  platformId?: number;
  startDate?: Date;
  endDate?: Date;
  category?: string;
  isInvestmentRelated?: boolean;
  searchText?: string;
  limit?: number;
  offset?: number;
  orderBy?: 'publish_time' | 'created_at' | 'views' | 'likes';
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * 新闻统计数据
 */
export interface NewsStats {
  totalNews: number;
  totalViews: number;
  totalLikes: number;
  totalShares: number;
  totalComments: number;
  averageEngagement: number;
}

/**
 * 新闻数据访问仓库
 */
export class NewsRepository implements NewsItemRepositoryInterface {
  /**
   * 创建新闻
   */
  public async create(news: Omit<NewsItem, 'id' | 'created_at'>): Promise<NewsItem> {
    const db = await connectionManager.getConnection();

    try {
      const result = await db.run(
        `INSERT INTO news_items (
          platform_id, external_id, title, content, url, author, publish_time,
          views, likes, shares, comments, tags, category, is_investment_related, summary
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        news.platform_id,
        news.external_id,
        news.title,
        news.content,
        news.url,
        news.author,
        news.publish_time.toISOString(),
        news.views,
        news.likes,
        news.shares,
        news.comments,
        news.tags ? JSON.stringify(news.tags) : null,
        news.category,
        news.is_investment_related ? 1 : 0,
        news.summary
      );

      const createdNews = await this.findById(result.lastID!);
      return createdNews!;
    } finally {
      await db.close();
    }
  }

  /**
   * 根据ID查找新闻
   */
  public async findById(id: number): Promise<NewsItem | null> {
    const db = await connectionManager.getConnection();

    try {
      const news = await db.get(
        `SELECT * FROM news_items WHERE id = ?`,
        id
      );

      if (!news) {
        return null;
      }

      return this.mapToNewsItem(news);
    } finally {
      await db.close();
    }
  }

  /**
   * 根据平台ID和外部ID查找新闻
   */
  public async findByPlatformAndExternalId(platformId: number, externalId: string): Promise<NewsItem | null> {
    const db = await connectionManager.getConnection();

    try {
      const news = await db.get(
        `SELECT * FROM news_items WHERE platform_id = ? AND external_id = ?`,
        platformId,
        externalId
      );

      if (!news) {
        return null;
      }

      return this.mapToNewsItem(news);
    } finally {
      await db.close();
    }
  }

  /**
   * 查询新闻
   */
  public async query(params: NewsQueryParams): Promise<PaginatedResult<NewsItem>> {
    const db = await connectionManager.getConnection();

    try {
      const { whereClause, params: queryParams } = this.buildWhereClause(params);
      const orderClause = this.buildOrderClause(params);

      // 获取总数
      const countResult = await db.get(
        `SELECT COUNT(*) as total FROM news_items ${whereClause}`,
        ...queryParams
      );

      // 获取数据
      const limit = params.limit || 50;
      const offset = params.offset || 0;

      const newsItems = await db.all(
        `SELECT * FROM news_items ${whereClause} ${orderClause} LIMIT ? OFFSET ?`,
        ...queryParams,
        limit,
        offset
      );

      const total = countResult?.total || 0;
      const hasMore = total > offset + limit;

      return {
        items: newsItems.map(this.mapToNewsItem),
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
   * 搜索新闻
   */
  public async search(query: string, params?: { limit?: number; offset?: number; orderBy?: string; orderDirection?: 'ASC' | 'DESC' }): Promise<PaginatedResult<NewsItem>> {
    const searchParams: NewsQueryParams = {
      searchText: query,
      limit: params?.limit,
      offset: params?.offset,
      orderBy: params?.orderBy as 'publish_time' | 'created_at' | 'views' | 'likes' | undefined,
      orderDirection: params?.orderDirection
    };
    return this.query(searchParams);
  }

  /**
   * 更新新闻
   */
  public async update(id: number, updates: Partial<Omit<NewsItem, 'id' | 'created_at'>>): Promise<NewsItem | null> {
    const db = await connectionManager.getConnection();

    try {
      const existingNews = await this.findById(id);
      if (!existingNews) {
        return null;
      }

      const updatedNews = { ...existingNews, ...updates };

      await db.run(
        `UPDATE news_items SET
          title = ?, content = ?, url = ?, author = ?, publish_time = ?,
          views = ?, likes = ?, shares = ?, comments = ?,
          tags = ?, category = ?, is_investment_related = ?, summary = ?
        WHERE id = ?`,
        updatedNews.title,
        updatedNews.content,
        updatedNews.url,
        updatedNews.author,
        updatedNews.publish_time.toISOString(),
        updatedNews.views,
        updatedNews.likes,
        updatedNews.shares,
        updatedNews.comments,
        updatedNews.tags ? JSON.stringify(updatedNews.tags) : null,
        updatedNews.category,
        updatedNews.is_investment_related ? 1 : 0,
        updatedNews.summary,
        id
      );

      return this.findById(id);
    } finally {
      await db.close();
    }
  }

  /**
   * 删除新闻
   */
  public async delete(id: number): Promise<boolean> {
    const db = await connectionManager.getConnection();

    try {
      const result = await db.run(`DELETE FROM news_items WHERE id = ?`, id);
      return result.changes! > 0;
    } finally {
      await db.close();
    }
  }

  /**
   * 批量创建新闻
   */
  public async batchCreate(newsItems: Omit<NewsItem, 'id' | 'created_at'>[]): Promise<NewsItem[]> {
    return connectionManager.withTransaction(async (db) => {
      const createdItems: NewsItem[] = [];

      for (const news of newsItems) {
        try {
          const result = await db.run(
            `INSERT INTO news_items (
              platform_id, external_id, title, content, url, author, publish_time,
              views, likes, shares, comments, tags, category, is_investment_related, summary
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            news.platform_id,
            news.external_id,
            news.title,
            news.content,
            news.url,
            news.author,
            news.publish_time.toISOString(),
            news.views,
            news.likes,
            news.shares,
            news.comments,
            news.tags ? JSON.stringify(news.tags) : null,
            news.category,
            news.is_investment_related ? 1 : 0,
            news.summary
          );

          const createdNews = await db.get(
            `SELECT * FROM news_items WHERE id = ?`,
            result.lastID
          );

          if (createdNews) {
            createdItems.push(this.mapToNewsItem(createdNews));
          }
        } catch (error) {
          // 忽略重复项错误，继续插入其他项
          if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
            console.warn(`Duplicate news item skipped: ${news.platform_id}-${news.external_id}`);
            continue;
          }
          throw error;
        }
      }

      return createdItems;
    });
  }

  /**
   * 获取新闻统计信息
   */
  public async getStats(params?: {
    platformId?: number;
    startDate?: Date;
    endDate?: Date;
  }): Promise<NewsStats> {
    const db = await connectionManager.getConnection();

    try {
      const { whereClause, params: queryParams } = this.buildWhereClause(params || {});

      const statsResult = await db.get(
        `SELECT
          COUNT(*) as total_news,
          SUM(views) as total_views,
          SUM(likes) as total_likes,
          SUM(shares) as total_shares,
          SUM(comments) as total_comments
        FROM news_items ${whereClause}`,
        ...queryParams
      );

      const totalNews = statsResult?.total_news || 0;
      const totalViews = statsResult?.total_views || 0;
      const totalLikes = statsResult?.total_likes || 0;
      const totalShares = statsResult?.total_shares || 0;
      const totalComments = statsResult?.total_comments || 0;

      const averageEngagement = totalNews > 0 ?
        (totalViews + totalLikes + totalShares + totalComments) / totalNews : 0;

      return {
        totalNews,
        totalViews,
        totalLikes,
        totalShares,
        totalComments,
        averageEngagement
      };
    } finally {
      await db.close();
    }
  }

  /**
   * 获取分类统计
   */
  public async getCategoryStats(): Promise<Array<{
    category: string;
    count: number;
    totalViews: number;
    avgEngagement: number;
  }>> {
    const db = await connectionManager.getConnection();

    try {
      const stats = await db.all(`
        SELECT
          category,
          COUNT(*) as count,
          SUM(views) as total_views,
          AVG(views + likes + shares + comments) as avg_engagement
        FROM news_items
        WHERE category IS NOT NULL
        GROUP BY category
        ORDER BY count DESC
      `);

      return stats.map(stat => ({
        category: stat.category,
        count: stat.count,
        totalViews: stat.total_views,
        avgEngagement: stat.avg_engagement
      }));
    } finally {
      await db.close();
    }
  }

  /**
   * 获取热门新闻
   */
  public async getTopNews(limit: number = 10): Promise<NewsItem[]> {
    const db = await connectionManager.getConnection();

    try {
      const newsItems = await db.all(`
        SELECT * FROM news_items
        ORDER BY (views + likes * 10 + shares * 5 + comments * 3) DESC
        LIMIT ?
      `, limit);

      return newsItems.map(this.mapToNewsItem);
    } finally {
      await db.close();
    }
  }

  /**
   * 获取投资相关新闻
   */
  public async getInvestmentNews(limit: number = 50): Promise<NewsItem[]> {
    const db = await connectionManager.getConnection();

    try {
      const newsItems = await db.all(`
        SELECT * FROM news_items
        WHERE is_investment_related = 1
        ORDER BY publish_time DESC
        LIMIT ?
      `, limit);

      return newsItems.map(this.mapToNewsItem);
    } finally {
      await db.close();
    }
  }

  /**
   * 构建WHERE子句
   */
  private buildWhereClause(params: NewsQueryParams): { whereClause: string; params: any[] } {
    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (params.platformId) {
      conditions.push('platform_id = ?');
      queryParams.push(params.platformId);
    }

    if (params.startDate) {
      conditions.push('publish_time >= ?');
      queryParams.push(params.startDate.toISOString());
    }

    if (params.endDate) {
      conditions.push('publish_time <= ?');
      queryParams.push(params.endDate.toISOString());
    }

    if (params.category) {
      conditions.push('category = ?');
      queryParams.push(params.category);
    }

    if (params.isInvestmentRelated !== undefined) {
      conditions.push('is_investment_related = ?');
      queryParams.push(params.isInvestmentRelated ? 1 : 0);
    }

    if (params.searchText) {
      conditions.push('(title LIKE ? OR content LIKE ?)');
      queryParams.push(`%${params.searchText}%`, `%${params.searchText}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params: queryParams };
  }

  /**
   * 构建ORDER BY子句
   */
  private buildOrderClause(params: NewsQueryParams): string {
    const orderBy = params.orderBy || 'publish_time';
    const orderDirection = params.orderDirection || 'DESC';
    return `ORDER BY ${orderBy} ${orderDirection}`;
  }

  /**
   * 映射数据库行到NewsItem对象
   */
  private mapToNewsItem(row: any): NewsItem {
    return {
      id: row.id,
      platform_id: row.platform_id,
      external_id: row.external_id,
      title: row.title,
      content: row.content,
      url: row.url,
      author: row.author,
      publish_time: new Date(row.publish_time),
      views: row.views,
      likes: row.likes,
      shares: row.shares,
      comments: row.comments,
      tags: row.tags ? JSON.parse(row.tags) : null,
      category: row.category,
      is_investment_related: row.is_investment_related === 1,
      summary: row.summary,
      created_at: new Date(row.created_at)
    };
  }
}

// 导出默认新闻仓库实例
export const newsRepository = new NewsRepository();