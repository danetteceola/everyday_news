/**
 * 技能数据访问服务
 * 提供对收集的新闻数据的访问接口
 */

import { PlatformType } from '../../../collection/types/news-item';

/**
 * 新闻数据查询选项
 */
export interface NewsDataQueryOptions {
  date?: string | Date; // 日期或日期范围
  startDate?: string | Date;
  endDate?: string | Date;
  platforms?: PlatformType[]; // 平台列表
  keywords?: string[]; // 关键词
  limit?: number; // 限制数量
  offset?: number; // 偏移量
  sortBy?: 'date' | 'relevance' | 'popularity'; // 排序方式
  sortOrder?: 'asc' | 'desc'; // 排序顺序
}

/**
 * 新闻数据统计
 */
export interface NewsDataStatistics {
  totalItems: number;
  itemsByPlatform: Record<PlatformType, number>;
  itemsByHour: Record<number, number>;
  topKeywords: Array<{ keyword: string; count: number }>;
  sentimentDistribution: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

/**
 * 新闻趋势分析
 */
export interface NewsTrendAnalysis {
  trends: Array<{
    topic: string;
    count: number;
    growth: number; // 增长百分比
    platforms: PlatformType[];
    sentiment: 'positive' | 'neutral' | 'negative';
  }>;
  topTrends: Array<{
    topic: string;
    count: number;
    description: string;
  }>;
  trendingKeywords: string[];
}

/**
 * 数据访问服务接口
 */
export interface DataAccessService {
  /**
   * 查询新闻数据
   */
  queryNewsData(options: NewsDataQueryOptions): Promise<any>;

  /**
   * 获取新闻数据统计
   */
  getNewsStatistics(options: NewsDataQueryOptions): Promise<NewsDataStatistics>;

  /**
   * 获取趋势分析
   */
  getTrendAnalysis(options: NewsDataQueryOptions): Promise<NewsTrendAnalysis>;

  /**
   * 获取热门新闻
   */
  getTopNews(options: NewsDataQueryOptions): Promise<any[]>;

  /**
   * 检查数据可用性
   */
  checkDataAvailability(date: string | Date, platforms?: PlatformType[]): Promise<boolean>;

  /**
   * 获取数据质量指标
   */
  getDataQualityMetrics(date: string | Date): Promise<{
    completeness: number; // 完整度 0-100
    freshness: number; // 新鲜度 0-100
    diversity: number; // 多样性 0-100
    reliability: number; // 可靠性 0-100
  }>;
}

/**
 * 模拟数据访问服务
 * TODO: 替换为实际的数据访问实现
 */
export class MockDataAccessService implements DataAccessService {
  private mockData: any[] = [];

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData(): void {
    // 生成模拟数据
    const platforms: PlatformType[] = ['twitter', 'youtube', 'tiktok', 'weibo', 'douyin'];
    const topics = ['AI', '投资', '科技', '经济', '政治', '娱乐', '体育', '健康'];
    const sentiments = ['positive', 'neutral', 'negative'];

    for (let i = 0; i < 100; i++) {
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      const topic = topics[Math.floor(Math.random() * topics.length)];
      const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
      const date = new Date();
      date.setDate(date.getDate() - Math.floor(Math.random() * 7)); // 过去7天内

      this.mockData.push({
        id: `news-${i + 1}`,
        title: `${topic}相关新闻标题 ${i + 1}`,
        content: `这是关于${topic}的新闻内容。包含一些重要的信息和观点。`,
        platform,
        sourceUrl: `https://${platform}.com/news/${i + 1}`,
        publishedAt: date,
        author: `作者${i + 1}`,
        metadata: {
          likes: Math.floor(Math.random() * 1000),
          shares: Math.floor(Math.random() * 500),
          comments: Math.floor(Math.random() * 200),
          sentiment,
          keywords: [topic, platform],
          language: 'zh'
        }
      });
    }
  }

  async queryNewsData(options: NewsDataQueryOptions): Promise<any> {
    let filteredData = [...this.mockData];

    // 按日期过滤
    if (options.date) {
      const targetDate = typeof options.date === 'string' ? new Date(options.date) : options.date;
      filteredData = filteredData.filter(item => {
        const itemDate = new Date(item.publishedAt);
        return itemDate.toDateString() === targetDate.toDateString();
      });
    } else if (options.startDate || options.endDate) {
      const startDate = options.startDate ?
        (typeof options.startDate === 'string' ? new Date(options.startDate) : options.startDate) :
        new Date('1970-01-01');
      const endDate = options.endDate ?
        (typeof options.endDate === 'string' ? new Date(options.endDate) : options.endDate) :
        new Date();

      filteredData = filteredData.filter(item => {
        const itemDate = new Date(item.publishedAt);
        return itemDate >= startDate && itemDate <= endDate;
      });
    }

    // 按平台过滤
    if (options.platforms && options.platforms.length > 0) {
      filteredData = filteredData.filter(item => options.platforms!.includes(item.platform));
    }

    // 按关键词过滤
    if (options.keywords && options.keywords.length > 0) {
      filteredData = filteredData.filter(item => {
        const content = `${item.title} ${item.content}`.toLowerCase();
        return options.keywords!.some(keyword =>
          content.includes(keyword.toLowerCase())
        );
      });
    }

    // 排序
    if (options.sortBy) {
      filteredData.sort((a, b) => {
        let aValue: any, bValue: any;

        switch (options.sortBy) {
          case 'date':
            aValue = new Date(a.publishedAt).getTime();
            bValue = new Date(b.publishedAt).getTime();
            break;
          case 'relevance':
            aValue = a.metadata?.likes || 0;
            bValue = b.metadata?.likes || 0;
            break;
          case 'popularity':
            aValue = (a.metadata?.likes || 0) + (a.metadata?.shares || 0) * 2 + (a.metadata?.comments || 0) * 3;
            bValue = (b.metadata?.likes || 0) + (b.metadata?.shares || 0) * 2 + (b.metadata?.comments || 0) * 3;
            break;
          default:
            return 0;
        }

        const order = options.sortOrder === 'desc' ? -1 : 1;
        return (aValue - bValue) * order;
      });
    }

    // 分页
    const offset = options.offset || 0;
    const limit = options.limit || filteredData.length;
    const paginatedData = filteredData.slice(offset, offset + limit);

    return {
      items: paginatedData,
      total: filteredData.length,
      offset,
      limit,
      hasMore: offset + limit < filteredData.length
    };
  }

  async getNewsStatistics(options: NewsDataQueryOptions): Promise<NewsDataStatistics> {
    const queryResult = await this.queryNewsData({ ...options, limit: 1000 });
    const items = queryResult.items;

    // 按平台统计
    const itemsByPlatform: Record<PlatformType, number> = {
      twitter: 0,
      youtube: 0,
      tiktok: 0,
      weibo: 0,
      douyin: 0
    };

    // 按小时统计
    const itemsByHour: Record<number, number> = {};
    for (let i = 0; i < 24; i++) {
      itemsByHour[i] = 0;
    }

    // 情感分布
    const sentimentDistribution = {
      positive: 0,
      neutral: 0,
      negative: 0
    };

    // 关键词统计
    const keywordCounts: Record<string, number> = {};

    items.forEach((item: any) => {
      // 平台统计
      itemsByPlatform[item.platform] = (itemsByPlatform[item.platform] || 0) + 1;

      // 小时统计
      const hour = new Date(item.publishedAt).getHours();
      itemsByHour[hour] = (itemsByHour[hour] || 0) + 1;

      // 情感统计
      const sentiment = item.metadata?.sentiment;
      if (sentiment === 'positive') sentimentDistribution.positive++;
      else if (sentiment === 'negative') sentimentDistribution.negative++;
      else sentimentDistribution.neutral++;

      // 关键词统计
      const keywords = item.metadata?.keywords || [];
      keywords.forEach((keyword: string) => {
        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
      });
    });

    // 获取热门关键词
    const topKeywords = Object.entries(keywordCounts)
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalItems: items.length,
      itemsByPlatform,
      itemsByHour,
      topKeywords,
      sentimentDistribution
    };
  }

  async getTrendAnalysis(options: NewsDataQueryOptions): Promise<NewsTrendAnalysis> {
    const queryResult = await this.queryNewsData({ ...options, limit: 1000 });
    const items = queryResult.items;

    // 简单的趋势分析
    const topicCounts: Record<string, number> = {};
    const topicPlatforms: Record<string, Set<PlatformType>> = {};
    const topicSentiments: Record<string, Record<string, number>> = {};

    items.forEach((item: any) => {
      const topics = item.metadata?.keywords || [];
      const platform = item.platform;
      const sentiment = item.metadata?.sentiment || 'neutral';

      topics.forEach((topic: string) => {
        topicCounts[topic] = (topicCounts[topic] || 0) + 1;

        if (!topicPlatforms[topic]) {
          topicPlatforms[topic] = new Set();
        }
        topicPlatforms[topic].add(platform);

        if (!topicSentiments[topic]) {
          topicSentiments[topic] = { positive: 0, neutral: 0, negative: 0 };
        }
        topicSentiments[topic][sentiment]++;
      });
    });

    // 计算趋势
    const trends = Object.entries(topicCounts)
      .map(([topic, count]) => {
        const platforms = Array.from(topicPlatforms[topic] || new Set());
        const sentiments = topicSentiments[topic] || { positive: 0, neutral: 0, negative: 0 };
        const dominantSentiment = Object.entries(sentiments).sort((a, b) => b[1] - a[1])[0][0] as 'positive' | 'neutral' | 'negative';

        return {
          topic,
          count,
          growth: Math.floor(Math.random() * 100), // 模拟增长数据
          platforms,
          sentiment: dominantSentiment
        };
      })
      .sort((a, b) => b.count - a.count)
      .slice(0, 20);

    // 获取顶级趋势
    const topTrends = trends.slice(0, 5).map(trend => ({
      topic: trend.topic,
      count: trend.count,
      description: `关于${trend.topic}的讨论在${trend.platforms.join(', ')}等平台上有${trend.count}条相关新闻`
    }));

    // 热门关键词
    const trendingKeywords = trends.slice(0, 10).map(trend => trend.topic);

    return {
      trends,
      topTrends,
      trendingKeywords
    };
  }

  async getTopNews(options: NewsDataQueryOptions): Promise<any[]> {
    const queryResult = await this.queryNewsData({
      ...options,
      sortBy: 'popularity',
      sortOrder: 'desc',
      limit: options.limit || 10
    });

    return queryResult.items;
  }

  async checkDataAvailability(date: string | Date, platforms?: PlatformType[]): Promise<boolean> {
    const queryOptions: NewsDataQueryOptions = {
      date: typeof date === 'string' ? new Date(date) : date
    };

    if (platforms && platforms.length > 0) {
      queryOptions.platforms = platforms;
    }

    const queryResult = await this.queryNewsData(queryOptions);
    return queryResult.total > 0;
  }

  async getDataQualityMetrics(date: string | Date): Promise<{
    completeness: number;
    freshness: number;
    diversity: number;
    reliability: number;
  }> {
    const queryResult = await this.queryNewsData({ date });
    const items = queryResult.items;

    if (items.length === 0) {
      return {
        completeness: 0,
        freshness: 0,
        diversity: 0,
        reliability: 0
      };
    }

    // 模拟计算质量指标
    const now = new Date();
    const targetDate = typeof date === 'string' ? new Date(date) : date;

    // 完整度：基于数据数量
    const completeness = Math.min(100, items.length * 10);

    // 新鲜度：基于发布时间
    const avgFreshness = items.reduce((sum: number, item: any) => {
      const publishTime = new Date(item.publishedAt).getTime();
      const timeDiff = now.getTime() - publishTime;
      const hoursDiff = timeDiff / (1000 * 60 * 60);
      return sum + Math.max(0, 100 - hoursDiff * 2);
    }, 0) / items.length;

    const freshness = Math.min(100, Math.max(0, avgFreshness));

    // 多样性：基于平台分布
    const platformCount = new Set(items.map((item: any) => item.platform)).size;
    const diversity = (platformCount / 5) * 100; // 5个平台

    // 可靠性：基于数据完整性
    const reliabilityScores = items.map((item: any) => {
      let score = 0;
      if (item.title) score += 25;
      if (item.content && item.content.length > 50) score += 25;
      if (item.author) score += 25;
      if (item.metadata) score += 25;
      return score;
    });

    const reliability = reliabilityScores.reduce((sum: number, score: number) => sum + score, 0) / items.length;

    return {
      completeness,
      freshness,
      diversity,
      reliability
    };
  }
}

/**
 * 数据访问服务工厂
 */
export class DataAccessServiceFactory {
  private static instance: DataAccessService | null = null;

  /**
   * 获取数据访问服务实例
   */
  static getInstance(): DataAccessService {
    if (!this.instance) {
      // TODO: 根据配置选择实际的数据访问服务
      this.instance = new MockDataAccessService();
    }
    return this.instance;
  }

  /**
   * 设置数据访问服务实例
   */
  static setInstance(instance: DataAccessService): void {
    this.instance = instance;
  }

  /**
   * 重置实例
   */
  static resetInstance(): void {
    this.instance = null;
  }
}

// 导出默认实例
export const dataAccessService = DataAccessServiceFactory.getInstance();