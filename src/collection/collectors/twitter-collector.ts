/**
 * Twitter数据采集器
 * 支持API和网页两种采集方式，采集趋势话题和热门推文
 */

import { NewsItem, PlatformType, MediaType } from '../types/news-item';
import { AntiCrawlingSystem } from '../anti-crawling/anti-crawling-system';
import { RequestDelayManager } from '../anti-crawling/request-delay-manager';
import { CollectionLogger, createPlatformLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { TwitterApiClient, TwitterApiConfig } from './twitter-api-client';
import { TwitterWebScraper, TwitterWebScraperConfig } from './twitter-web-scraper';

export interface TwitterCollectorConfig {
  /** 是否启用Twitter API采集 */
  enableApiCollection: boolean;

  /** Twitter API配置 */
  apiConfig?: {
    /** API密钥 */
    apiKey: string;
    /** API密钥密钥 */
    apiSecret: string;
    /** 访问令牌 */
    accessToken: string;
    /** 访问令牌密钥 */
    accessTokenSecret: string;
    /** Bearer令牌（用于API v2） */
    bearerToken?: string;
  };

  /** 是否启用网页采集 */
  enableWebCollection: boolean;

  /** 网页采集配置 */
  webConfig?: {
    /** 是否使用无头浏览器 */
    headless: boolean;
    /** 浏览器超时时间（毫秒） */
    timeout: number;
    /** 是否启用JavaScript */
    enableJavaScript: boolean;
  };

  /** 采集目标 */
  collectionTargets: {
    /** 是否采集趋势话题 */
    collectTrendingTopics: boolean;
    /** 是否采集热门推文 */
    collectPopularTweets: boolean;
    /** 每个趋势话题采集的推文数量 */
    tweetsPerTopic: number;
    /** 采集的地理位置（趋势话题） */
    location?: string;
  };

  /** 反爬系统配置 */
  antiCrawlingConfig?: any;
}

export interface TrendingTopic {
  /** 话题名称 */
  name: string;
  /** 话题URL */
  url: string;
  /** 推文数量 */
  tweetVolume: number;
  /** 话题描述 */
  description?: string;
  /** 话题类别 */
  category?: string;
}

export interface TweetData {
  /** 推文ID */
  id: string;
  /** 作者信息 */
  author: {
    id: string;
    name: string;
    screenName: string;
    avatarUrl?: string;
    verified: boolean;
    followerCount?: number;
  };
  /** 推文内容 */
  content: string;
  /** 发布时间 */
  publishTime: Date;
  /** 互动数据 */
  engagement: {
    likeCount: number;
    retweetCount: number;
    replyCount: number;
    quoteCount?: number;
    viewCount?: number;
  };
  /** 媒体内容 */
  media: Array<{
    type: 'image' | 'video' | 'gif';
    url: string;
    thumbnailUrl?: string;
  }>;
  /** 推文URL */
  url: string;
  /** 语言 */
  language?: string;
  /** 是否包含敏感内容 */
  sensitive?: boolean;
  /** 地理位置 */
  geo?: {
    coordinates: [number, number];
    type: string;
  };
}

export class TwitterCollector {
  private config: TwitterCollectorConfig;
  private logger: CollectionLogger;
  private antiCrawlingSystem: AntiCrawlingSystem;
  private errorHandler: CollectionErrorHandler;

  /** API客户端 */
  private apiClient: TwitterApiClient | null = null;

  /** 网页爬虫 */
  private webScraper: TwitterWebScraper | null = null;

  /** API采集状态 */
  private apiAvailable: boolean = false;

  /** 网页采集状态 */
  private webAvailable: boolean = false;

  /**
   * 将Twitter采集器配置转换为反爬系统配置
   */
  private convertToAntiCrawlingConfig(twitterConfig: any): any {
    const config = twitterConfig || {
      baseDelay: 1000,
      randomDelayRange: 2000,
      maxConcurrentRequests: 3,
      userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      proxyConfig: {
        enabled: false,
        proxies: [],
        rotationStrategy: 'round-robin'
      },
      errorRetryConfig: {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2
      }
    };

    // 转换为AntiCrawlingConfig格式
    return {
      baseDelay: config.baseDelay,
      randomDelayRange: config.randomDelayRange,
      maxConcurrentRequests: config.maxConcurrentRequests,
      userAgents: config.userAgents,
      proxies: config.proxyConfig?.proxies || [],
      maxRetries: config.errorRetryConfig?.maxRetries || 3,
      retryBaseDelay: config.errorRetryConfig?.baseDelay || 1000,
      enableProxyRotation: config.proxyConfig?.enabled || false,
      enableUserAgentRotation: true,
      requestTimeout: 30000
    };
  }

  constructor(config: TwitterCollectorConfig) {
    this.config = config;
    this.logger = createPlatformLogger('twitter');
    this.errorHandler = new CollectionErrorHandler();

    // 初始化反爬系统
    const antiCrawlingConfig = this.convertToAntiCrawlingConfig(config.antiCrawlingConfig);
    this.antiCrawlingSystem = new RequestDelayManager(antiCrawlingConfig, {});

    // 验证配置
    this.validateConfig();
  }

  /**
   * 验证配置
   */
  private validateConfig(): void {
    if (!this.config.enableApiCollection && !this.config.enableWebCollection) {
      throw new CollectionError(
        'Twitter采集器配置错误：必须启用API采集或网页采集至少一种方式',
        CollectionErrorType.CONFIGURATION_ERROR,
        'twitter'
      );
    }

    if (this.config.enableApiCollection && !this.config.apiConfig) {
      throw new CollectionError(
        'Twitter采集器配置错误：启用API采集时必须提供API配置',
        CollectionErrorType.CONFIGURATION_ERROR,
        'twitter'
      );
    }

    if (this.config.enableWebCollection && !this.config.webConfig) {
      throw new CollectionError(
        'Twitter采集器配置错误：启用网页采集时必须提供网页配置',
        CollectionErrorType.CONFIGURATION_ERROR,
        'twitter'
      );
    }
  }

  /**
   * 初始化采集器
   */
  async initialize(): Promise<void> {
    this.logger.info('初始化Twitter采集器...');

    try {
      // 初始化反爬系统
      await this.antiCrawlingSystem.initialize();

      // 初始化API客户端
      if (this.config.enableApiCollection && this.config.apiConfig) {
        this.apiClient = await this.initializeApiClient();
        this.apiAvailable = this.apiClient !== null;
        this.logger.info(`Twitter API可用性: ${this.apiAvailable ? '可用' : '不可用'}`);
      }

      // 初始化网页爬虫
      if (this.config.enableWebCollection && this.config.webConfig) {
        this.webScraper = await this.initializeWebScraper();
        this.webAvailable = this.webScraper !== null;
        this.logger.info(`Twitter网页采集可用性: ${this.webAvailable ? '可用' : '不可用'}`);
      }

      if (!this.apiAvailable && !this.webAvailable) {
        throw new CollectionError(
          'Twitter采集器初始化失败：API和网页采集均不可用',
          CollectionErrorType.NETWORK_ERROR,
          'twitter'
        );
      }

      this.logger.info('Twitter采集器初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化', platform: 'twitter' });
      throw error;
    }
  }

  /**
   * 初始化API客户端
   */
  private async initializeApiClient(): Promise<TwitterApiClient | null> {
    if (!this.config.apiConfig) {
      return null;
    }

    try {
      const apiConfig: TwitterApiConfig = {
        apiKey: this.config.apiConfig.apiKey,
        apiSecret: this.config.apiConfig.apiSecret,
        accessToken: this.config.apiConfig.accessToken,
        accessTokenSecret: this.config.apiConfig.accessTokenSecret,
        bearerToken: this.config.apiConfig.bearerToken,
        apiVersion: '2',
        baseUrl: 'https://api.twitter.com',
        timeout: 30000,
        maxRetries: 3
      };

      const apiClient = new TwitterApiClient(apiConfig);
      await apiClient.initialize();

      // 测试API可用性
      const isAvailable = await apiClient.testAvailability();
      if (!isAvailable) {
        this.logger.warn('Twitter API客户端初始化成功但可用性测试失败');
        await apiClient.cleanup();
        return null;
      }

      return apiClient;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化API客户端', platform: 'twitter' });
      return null;
    }
  }


  /**
   * 初始化网页爬虫
   */
  private async initializeWebScraper(): Promise<TwitterWebScraper | null> {
    if (!this.config.webConfig) {
      return null;
    }

    try {
      const scraperConfig: TwitterWebScraperConfig = {
        headless: this.config.webConfig.headless,
        timeout: this.config.webConfig.timeout,
        enableJavaScript: this.config.webConfig.enableJavaScript,
        viewport: { width: 1280, height: 800 }
      };

      const webScraper = new TwitterWebScraper(scraperConfig);
      await webScraper.initialize();

      // 测试网页采集可用性
      const isAvailable = await webScraper.testAvailability();
      if (!isAvailable) {
        this.logger.warn('Twitter网页爬虫初始化成功但可用性测试失败');
        await webScraper.cleanup();
        return null;
      }

      return webScraper;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化网页爬虫', platform: 'twitter' });
      return null;
    }
  }


  /**
   * 执行数据采集
   */
  async collect(): Promise<NewsItem[]> {
    this.logger.info('开始Twitter数据采集...');
    const startTime = Date.now();

    try {
      const newsItems: NewsItem[] = [];

      // 采集趋势话题
      if (this.config.collectionTargets.collectTrendingTopics) {
        const trendingTopics = await this.collectTrendingTopics();
        this.logger.info(`采集到 ${trendingTopics.length} 个趋势话题`);

        // 为每个趋势话题采集热门推文
        if (this.config.collectionTargets.collectPopularTweets) {
          for (const topic of trendingTopics) {
            const tweets = await this.collectPopularTweetsForTopic(topic);
            const topicNewsItems = tweets.map(tweet => this.convertTweetToNewsItem(tweet, topic));
            newsItems.push(...topicNewsItems);

            this.logger.info(`话题 "${topic.name}" 采集到 ${tweets.length} 条推文`);
          }
        }
      }

      const duration = Date.now() - startTime;
      this.logger.info(`Twitter数据采集完成，共采集 ${newsItems.length} 条数据，耗时 ${duration}ms`);

      return newsItems;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '数据采集', platform: 'twitter' });
      throw error;
    }
  }

  /**
   * 采集趋势话题
   */
  private async collectTrendingTopics(): Promise<TrendingTopic[]> {
    this.logger.info('开始采集Twitter趋势话题...');

    try {
      // 优先使用API采集
      if (this.apiAvailable) {
        return await this.collectTrendingTopicsViaApi();
      }

      // API不可用时使用网页采集
      if (this.webAvailable) {
        return await this.collectTrendingTopicsViaWeb();
      }

      throw new CollectionError(
        '无法采集趋势话题：API和网页采集均不可用',
        CollectionErrorType.NETWORK_ERROR,
        'twitter'
      );
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '采集趋势话题', platform: 'twitter' });
      throw error;
    }
  }

  /**
   * 通过API采集趋势话题
   */
  private async collectTrendingTopicsViaApi(): Promise<TrendingTopic[]> {
    if (!this.apiClient) {
      this.logger.warn('Twitter API客户端未初始化，无法采集趋势话题');
      return [];
    }

    try {
      // 获取趋势位置（默认使用全球位置）
      const locationId = 1; // 全球位置

      // 获取趋势话题
      const trendingTopics = await this.apiClient.getTrendingTopics(locationId);

      // 过滤掉推文数量为0的话题
      const filteredTopics = trendingTopics.filter(topic => topic.tweetVolume > 0);

      this.logger.info(`通过API采集到 ${filteredTopics.length} 个趋势话题`);
      return filteredTopics;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: 'API采集趋势话题', platform: 'twitter' });
      return [];
    }
  }

  /**
   * 通过网页采集趋势话题
   */
  private async collectTrendingTopicsViaWeb(): Promise<TrendingTopic[]> {
    if (!this.webScraper) {
      this.logger.warn('Twitter网页爬虫未初始化，无法采集趋势话题');
      return [];
    }

    try {
      // 采集趋势话题
      const trendingTopics = await this.webScraper.getTrendingTopics();

      // 过滤掉推文数量为0的话题
      const filteredTopics = trendingTopics.filter(topic => topic.tweetVolume > 0);

      this.logger.info(`通过网页采集到 ${filteredTopics.length} 个趋势话题`);
      return filteredTopics;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '网页采集趋势话题', platform: 'twitter' });
      return [];
    }
  }

  /**
   * 为指定话题采集热门推文
   */
  private async collectPopularTweetsForTopic(topic: TrendingTopic): Promise<TweetData[]> {
    this.logger.info(`开始为话题 "${topic.name}" 采集热门推文...`);

    try {
      // 优先使用API采集
      if (this.apiAvailable) {
        return await this.collectTweetsViaApi(topic);
      }

      // API不可用时使用网页采集
      if (this.webAvailable) {
        return await this.collectTweetsViaWeb(topic);
      }

      throw new CollectionError(
        `无法为话题 "${topic.name}" 采集推文：API和网页采集均不可用`,
        CollectionErrorType.NETWORK_ERROR,
        'twitter'
      );
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '采集推文', platform: 'twitter', details: { topic: topic.name } });
      throw error;
    }
  }

  /**
   * 通过API采集推文
   */
  private async collectTweetsViaApi(topic: TrendingTopic): Promise<TweetData[]> {
    if (!this.apiClient) {
      this.logger.warn('Twitter API客户端未初始化，无法采集推文');
      return [];
    }

    try {
      // 构建搜索查询
      const query = this.buildTweetSearchQuery(topic);

      // 搜索推文
      const { tweets } = await this.apiClient.searchTweets(query, {
        maxResults: this.config.collectionTargets.tweetsPerTopic
      });

      // 过滤和排序推文
      const filteredTweets = this.filterAndSortTweets(tweets);

      this.logger.info(`通过API为话题 "${topic.name}" 采集到 ${filteredTweets.length} 条推文`);
      return filteredTweets;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: 'API采集推文', platform: 'twitter', details: { topic: topic.name } });
      return [];
    }
  }

  /**
   * 通过网页采集推文
   */
  private async collectTweetsViaWeb(topic: TrendingTopic): Promise<TweetData[]> {
    if (!this.webScraper) {
      this.logger.warn('Twitter网页爬虫未初始化，无法采集推文');
      return [];
    }

    try {
      // 构建搜索查询
      const query = this.buildTweetSearchQuery(topic);

      // 搜索推文
      const tweets = await this.webScraper.searchTweets(query, this.config.collectionTargets.tweetsPerTopic);

      // 过滤和排序推文
      const filteredTweets = this.filterAndSortTweets(tweets);

      this.logger.info(`通过网页为话题 "${topic.name}" 采集到 ${filteredTweets.length} 条推文`);
      return filteredTweets;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '网页采集推文', platform: 'twitter', details: { topic: topic.name } });
      return [];
    }
  }

  /**
   * 将推文数据转换为标准新闻数据模型
   */
  private convertTweetToNewsItem(tweet: TweetData, topic?: TrendingTopic): NewsItem {
    const now = new Date();

    // 分析内容分类
    const categories = this.analyzeContentCategories(tweet.content);

    // 检测投资相关内容
    const isInvestmentRelated = this.detectInvestmentContent(tweet.content);

    return {
      id: `twitter_${tweet.id}`,
      platform: PlatformType.TWITTER,
      title: this.generateTweetTitle(tweet, topic),
      content: tweet.content,
      url: tweet.url,
      publishTime: tweet.publishTime,
      author: {
        id: tweet.author.id,
        name: tweet.author.name,
        avatarUrl: tweet.author.avatarUrl,
        profileUrl: `https://twitter.com/${tweet.author.screenName}`,
        followerCount: tweet.author.followerCount,
        verified: tweet.author.verified
      },
      engagement: {
        likeCount: tweet.engagement.likeCount,
        shareCount: tweet.engagement.retweetCount,
        commentCount: tweet.engagement.replyCount,
        viewCount: tweet.engagement.viewCount
      },
      media: tweet.media.map(mediaItem => {
        let mediaType: MediaType;
        switch (mediaItem.type) {
          case 'image':
            mediaType = MediaType.IMAGE;
            break;
          case 'video':
            mediaType = MediaType.VIDEO;
            break;
          case 'gif':
            mediaType = MediaType.GIF;
            break;
          default:
            mediaType = MediaType.IMAGE;
        }
        return {
          type: mediaType,
          url: mediaItem.url,
          thumbnailUrl: mediaItem.thumbnailUrl
        };
      }),
      tags: this.generateTags(tweet, topic, categories, isInvestmentRelated),
      platformSpecific: {
        twitter: {
          tweetId: tweet.id,
          language: tweet.language,
          geo: tweet.geo
        }
      },
      collectedAt: now,
      qualityScore: this.calculateTweetQualityScore(tweet)
    };
  }

  /**
   * 生成推文标题
   */
  private generateTweetTitle(tweet: TweetData, topic?: TrendingTopic): string {
    const authorName = tweet.author.name;
    const contentPreview = tweet.content.length > 50
      ? tweet.content.substring(0, 50) + '...'
      : tweet.content;

    if (topic) {
      return `${authorName} 关于 "${topic.name}" 的推文：${contentPreview}`;
    }

    return `${authorName} 的推文：${contentPreview}`;
  }

  /**
   * 计算推文质量评分
   */
  private calculateTweetQualityScore(tweet: TweetData): number {
    let score = 0.5; // 基础分

    // 作者验证状态加分
    if (tweet.author.verified) {
      score += 0.1;
    }

    // 粉丝数量加分（如果有）
    if (tweet.author.followerCount && tweet.author.followerCount > 10000) {
      score += 0.1;
    }

    // 互动数据加分
    const totalEngagement = tweet.engagement.likeCount +
                           tweet.engagement.retweetCount +
                           tweet.engagement.replyCount;

    if (totalEngagement > 1000) {
      score += 0.2;
    } else if (totalEngagement > 100) {
      score += 0.1;
    }

    // 内容长度加分
    if (tweet.content.length > 50) {
      score += 0.1;
    }

    // 媒体内容加分
    if (tweet.media.length > 0) {
      score += 0.1;
    }

    // 确保分数在0-1之间
    return Math.min(Math.max(score, 0), 1);
  }

  /**
   * 构建推文搜索查询
   */
  private buildTweetSearchQuery(topic: TrendingTopic): string {
    // 移除话题中的#符号（如果存在）
    const topicName = topic.name.replace(/^#/, '');

    // 构建基础查询
    let query = `"${topicName}"`;

    // 添加排除条件
    query += ' -is:retweet -is:reply'; // 排除转推和回复

    // 添加语言限制（可选）
    // query += ' lang:en'; // 只采集英文推文

    return query;
  }

  /**
   * 过滤和排序推文
   */
  private filterAndSortTweets(tweets: TweetData[]): TweetData[] {
    // 过滤掉敏感内容
    const nonSensitiveTweets = tweets.filter(tweet => !tweet.sensitive);

    // 按互动数据排序（点赞+转发+回复）
    const sortedTweets = nonSensitiveTweets.sort((a, b) => {
      const engagementA = a.engagement.likeCount + a.engagement.retweetCount + a.engagement.replyCount;
      const engagementB = b.engagement.likeCount + b.engagement.retweetCount + b.engagement.replyCount;
      return engagementB - engagementA; // 降序排序
    });

    // 限制返回数量
    const maxTweets = this.config.collectionTargets.tweetsPerTopic;
    return sortedTweets.slice(0, maxTweets);
  }

  /**
   * 分析内容分类
   */
  private analyzeContentCategories(content: string): string[] {
    const categories: string[] = [];
    const contentLower = content.toLowerCase();

    // 定义分类关键词
    const categoryKeywords: Record<string, string[]> = {
      'politics': ['president', 'election', 'government', 'policy', 'vote', 'congress', 'senate', 'democrat', 'republican', 'trump', 'biden'],
      'entertainment': ['movie', 'film', 'celebrity', 'actor', 'actress', 'music', 'song', 'album', 'concert', 'tv', 'show', 'netflix'],
      'sports': ['game', 'team', 'player', 'score', 'win', 'lose', 'championship', 'tournament', 'nba', 'nfl', 'mlb', 'soccer', 'football'],
      'technology': ['tech', 'software', 'hardware', 'app', 'iphone', 'android', 'google', 'apple', 'microsoft', 'ai', 'artificial intelligence', 'machine learning'],
      'finance': ['stock', 'market', 'investment', 'bank', 'money', 'economy', 'financial', 'trading', 'crypto', 'bitcoin', 'ethereum'],
      'health': ['health', 'medical', 'doctor', 'hospital', 'vaccine', 'covid', 'disease', 'treatment', 'medicine'],
      'science': ['science', 'research', 'study', 'discovery', 'space', 'nasa', 'planet', 'climate', 'environment']
    };

    // 检查每个分类
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      for (const keyword of keywords) {
        if (contentLower.includes(keyword)) {
          if (!categories.includes(category)) {
            categories.push(category);
          }
          break; // 找到一个关键词就足够
        }
      }
    }

    // 如果没有匹配到任何分类，使用默认分类
    if (categories.length === 0) {
      categories.push('general');
    }

    return categories;
  }

  /**
   * 检测投资相关内容
   */
  private detectInvestmentContent(content: string): boolean {
    const contentLower = content.toLowerCase();

    // 投资相关关键词
    const investmentKeywords = [
      'stock', 'stocks', 'investment', 'invest', 'portfolio', 'trading', 'trade',
      'market', 'markets', 'financial', 'finance', 'economy', 'economic',
      'crypto', 'cryptocurrency', 'bitcoin', 'ethereum', 'blockchain',
      'bull', 'bear', 'rally', 'crash', 'dip', 'peak',
      'dividend', 'yield', 'return', 'profit', 'loss',
      'sec', 'regulation', 'compliance',
      'ipo', 'merger', 'acquisition', 'takeover',
      'analyst', 'rating', 'upgrade', 'downgrade',
      'earnings', 'revenue', 'profit', 'margin'
    ];

    // 检查是否包含投资关键词
    for (const keyword of investmentKeywords) {
      if (contentLower.includes(keyword)) {
        return true;
      }
    }

    // 检查是否有股票代码模式（如 $AAPL, $TSLA）
    const stockSymbolPattern = /\$[A-Z]{1,5}\b/g;
    if (stockSymbolPattern.test(content)) {
      return true;
    }

    // 检查是否有百分比变化模式（如 +5%, -3.2%）
    const percentagePattern = /[+-]?\d+(\.\d+)?%/g;
    if (percentagePattern.test(content)) {
      return true;
    }

    return false;
  }

  /**
   * 生成标签
   */
  private generateTags(
    tweet: TweetData,
    topic: TrendingTopic | undefined,
    categories: string[],
    isInvestmentRelated: boolean
  ): string[] {
    const tags: string[] = [];

    // 添加话题标签
    if (topic) {
      tags.push(topic.name);
    }

    // 添加内容分类标签
    tags.push(...categories);

    // 添加投资相关标签
    if (isInvestmentRelated) {
      tags.push('investment', 'finance');
    }

    // 添加作者相关标签
    if (tweet.author.verified) {
      tags.push('verified');
    }

    // 添加媒体类型标签
    if (tweet.media.length > 0) {
      const mediaTypes = tweet.media.map(m => m.type);
      if (mediaTypes.includes('video')) {
        tags.push('video');
      }
      if (mediaTypes.includes('image')) {
        tags.push('image');
      }
      if (mediaTypes.includes('gif')) {
        tags.push('gif');
      }
    }

    // 去重并返回
    return [...new Set(tags)];
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理Twitter采集器资源...');

    try {
      // 清理API客户端
      if (this.apiClient) {
        await this.apiClient.cleanup();
      }

      // 清理网页爬虫
      if (this.webScraper) {
        await this.webScraper.cleanup();
      }

      // 清理反爬系统
      await this.antiCrawlingSystem.cleanup();

      this.logger.info('Twitter采集器资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '资源清理', platform: 'twitter' });
      throw error;
    }
  }
}