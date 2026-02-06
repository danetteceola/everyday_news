/**
 * 微博数据采集器
 * 支持网页采集方式，采集热搜话题和热门微博
 */

import { NewsItem, PlatformType, MediaType } from '../types/news-item';
import { AntiCrawlingSystem } from '../anti-crawling/anti-crawling-system';
import { RequestDelayManager } from '../anti-crawling/request-delay-manager';
import { CollectionLogger, createPlatformLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { WeiboWebScraper, WeiboWebScraperConfig } from './weibo-web-scraper';

export interface WeiboCollectorConfig {
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
    /** 是否启用代理 */
    useProxy?: boolean;
    /** 用户代理 */
    userAgent?: string;
    /** 微博登录Cookie（可选） */
    cookies?: string;
  };

  /** 采集目标 */
  collectionTargets: {
    /** 是否采集热搜话题 */
    collectHotTopics: boolean;
    /** 是否采集热门微博 */
    collectPopularPosts: boolean;
    /** 每个话题采集的微博数量 */
    postsPerTopic: number;
    /** 采集的热搜分类 */
    hotCategories?: string[];
  };

  /** 反爬系统配置 */
  antiCrawlingConfig?: any;
}

export interface HotTopic {
  /** 话题ID */
  id: string;
  /** 话题标题 */
  title: string;
  /** 话题URL */
  url: string;
  /** 热度值 */
  hotValue: number;
  /** 话题分类 */
  category: string;
  /** 排名 */
  rank: number;
  /** 话题描述 */
  description?: string;
  /** 讨论数量 */
  discussionCount?: number;
  /** 阅读数量 */
  readCount?: number;
}

export interface WeiboPost {
  /** 微博ID */
  id: string;
  /** 微博内容 */
  content: string;
  /** 作者信息 */
  author: {
    id: string;
    name: string;
    screenName: string;
    url: string;
    avatarUrl?: string;
    verified: boolean;
    verificationType?: string;
    followerCount?: number;
    followingCount?: number;
    postsCount?: number;
  };
  /** 发布时间 */
  publishTime: Date;
  /** 互动数据 */
  engagement: {
    repostCount: number;
    commentCount: number;
    likeCount: number;
    viewCount?: number;
  };
  /** 微博元数据 */
  metadata: {
    source?: string; // 发布来源（如"微博 weibo.com"）
    location?: string;
    isOriginal: boolean; // 是否原创
    containsVideo: boolean;
    containsImage: boolean;
    containsLink: boolean;
    imageCount?: number;
    videoInfo?: {
      url: string;
      thumbnailUrl: string;
      duration?: number;
      width?: number;
      height?: number;
    };
    linkInfo?: {
      url: string;
      title?: string;
      description?: string;
      imageUrl?: string;
    };
    topics?: string[]; // 话题标签
    atUsers?: string[]; // @的用户
  };
  /** 媒体内容 */
  media: Array<{
    type: 'image' | 'video' | 'thumbnail';
    url: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
  }>;
  /** 微博URL */
  url: string;
}

export class WeiboCollector {
  private config: WeiboCollectorConfig;
  private logger: CollectionLogger;
  private errorHandler: CollectionErrorHandler;
  private antiCrawlingSystem: AntiCrawlingSystem;

  /** 网页爬虫实例 */
  private webScraper: WeiboWebScraper | null = null;

  /** 网页采集状态 */
  private webAvailable: boolean = false;

  /**
   * 将微博采集器配置转换为反爬系统配置
   */
  private convertToAntiCrawlingConfig(weiboConfig: any): any {
    const config = weiboConfig || {
      baseDelay: 3000, // 微博需要较长的延迟
      randomDelayRange: 4000,
      maxConcurrentRequests: 1, // 微博网页操作需要严格的并发控制
      userAgents: [
        // PC端用户代理
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        // 移动端用户代理
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
      ],
      proxyConfig: {
        enabled: true, // 微博通常需要代理
        proxies: [],
        rotationStrategy: 'round-robin'
      },
      errorRetryConfig: {
        maxRetries: 4,
        baseDelay: 4000,
        maxDelay: 20000,
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
      retryBaseDelay: config.errorRetryConfig?.baseDelay || 2000,
      enableProxyRotation: config.proxyConfig?.enabled || false,
      enableUserAgentRotation: true,
      requestTimeout: 45000
    };
  }

  constructor(config: WeiboCollectorConfig) {
    this.config = config;
    this.logger = createPlatformLogger('weibo');
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
    if (!this.config.enableWebCollection) {
      throw new CollectionError(
        '微博采集器配置错误：必须启用网页采集',
        CollectionErrorType.CONFIGURATION_ERROR,
        'weibo'
      );
    }

    if (this.config.enableWebCollection && !this.config.webConfig) {
      throw new CollectionError(
        '微博采集器配置错误：启用网页采集时必须提供网页配置',
        CollectionErrorType.CONFIGURATION_ERROR,
        'weibo'
      );
    }

    // 微博反爬措施严格，建议使用代理
    if (this.config.enableWebCollection && this.config.webConfig?.useProxy === false) {
      this.logger.warn('微博采集器警告：未启用代理可能无法正常访问微博内容');
    }
  }

  /**
   * 初始化采集器
   */
  async initialize(): Promise<void> {
    this.logger.info('初始化微博采集器...');

    try {
      // 初始化反爬系统
      await this.antiCrawlingSystem.initialize();

      // 初始化网页爬虫
      if (this.config.enableWebCollection && this.config.webConfig) {
        this.webScraper = await this.initializeWebScraper();
        this.webAvailable = this.webScraper !== null;
        this.logger.info(`微博网页采集可用性: ${this.webAvailable ? '可用' : '不可用'}`);
      }

      if (!this.webAvailable) {
        throw new CollectionError(
          '微博采集器初始化失败：网页采集不可用',
          CollectionErrorType.NETWORK_ERROR,
          'weibo'
        );
      }

      this.logger.info('微博采集器初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化', platform: 'weibo' });
      throw error;
    }
  }

  /**
   * 初始化网页爬虫
   */
  private async initializeWebScraper(): Promise<WeiboWebScraper | null> {
    if (!this.config.webConfig) {
      return null;
    }

    try {
      const scraperConfig: WeiboWebScraperConfig = {
        headless: this.config.webConfig.headless,
        timeout: this.config.webConfig.timeout,
        enableJavaScript: this.config.webConfig.enableJavaScript,
        useProxy: this.config.webConfig.useProxy || false,
        userAgent: this.config.webConfig.userAgent,
        cookies: this.config.webConfig.cookies,
        viewport: { width: 1280, height: 800 }
      };

      const webScraper = new WeiboWebScraper(scraperConfig);
      await webScraper.initialize();

      // 测试网页采集可用性
      const isAvailable = await webScraper.testAvailability();
      if (!isAvailable) {
        this.logger.warn('微博网页爬虫初始化成功但可用性测试失败');
        await webScraper.cleanup();
        return null;
      }

      return webScraper;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化网页爬虫', platform: 'weibo' });
      return null;
    }
  }

  /**
   * 执行数据采集
   */
  async collect(): Promise<NewsItem[]> {
    this.logger.info('开始微博数据采集...');
    const startTime = Date.now();

    try {
      const newsItems: NewsItem[] = [];

      // 采集热搜话题
      if (this.config.collectionTargets.collectHotTopics) {
        const hotTopics = await this.collectHotTopics();
        const topicNewsItems = hotTopics.map(topic => this.convertHotTopicToNewsItem(topic));
        newsItems.push(...topicNewsItems);
      }

      // 采集热门微博
      if (this.config.collectionTargets.collectPopularPosts) {
        const popularPosts = await this.collectPopularPosts();
        const postNewsItems = popularPosts.map(post => this.convertPostToNewsItem(post));
        newsItems.push(...postNewsItems);
      }

      const elapsedTime = Date.now() - startTime;
      this.logger.info(`微博数据采集完成，采集到 ${newsItems.length} 个新闻项，耗时 ${elapsedTime}ms`);

      return newsItems;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '数据采集', platform: 'weibo' });
      throw error;
    }
  }

  /**
   * 采集热搜话题
   */
  private async collectHotTopics(): Promise<HotTopic[]> {
    this.logger.info('开始采集微博热搜话题...');

    if (!this.webScraper) {
      throw new CollectionError(
        '微博网页爬虫未初始化',
        CollectionErrorType.CONFIGURATION_ERROR,
        'weibo'
      );
    }

    try {
      const hotTopics = await this.webScraper.getHotTopics();
      this.logger.info(`采集到 ${hotTopics.length} 个热搜话题`);
      return hotTopics;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '采集热搜话题', platform: 'weibo' });
      throw error;
    }
  }

  /**
   * 采集热门微博
   */
  private async collectPopularPosts(): Promise<WeiboPost[]> {
    this.logger.info('开始采集热门微博...');

    if (!this.webScraper) {
      throw new CollectionError(
        '微博网页爬虫未初始化',
        CollectionErrorType.CONFIGURATION_ERROR,
        'weibo'
      );
    }

    try {
      const popularPosts = await this.webScraper.getPopularPosts(
        this.config.collectionTargets.postsPerTopic
      );
      this.logger.info(`采集到 ${popularPosts.length} 条热门微博`);
      return popularPosts;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '采集热门微博', platform: 'weibo' });
      throw error;
    }
  }

  /**
   * 分析内容分类（中文关键词）
   */
  private analyzeContentCategories(content: string): string[] {
    const categories: string[] = [];

    // 新闻相关关键词（中文）
    const newsKeywords = [
      '新闻', '最新', '报道', '突发', '头条', '独家', '发布会', '记者会',
      'news', 'breaking', 'update', 'report', 'announcement'
    ];
    if (newsKeywords.some(keyword => content.includes(keyword))) {
      categories.push('news');
    }

    // 娱乐相关关键词
    const entertainmentKeywords = [
      '娱乐', '明星', '电影', '音乐', '综艺', '演唱会', '电视剧', '八卦',
      'entertainment', 'celebrity', 'movie', 'music', 'show'
    ];
    if (entertainmentKeywords.some(keyword => content.includes(keyword))) {
      categories.push('entertainment');
    }

    // 科技相关关键词
    const techKeywords = [
      '科技', '技术', '数码', '手机', '电脑', 'AI', '人工智能', '互联网',
      'tech', 'technology', 'gadget', 'computer', 'software'
    ];
    if (techKeywords.some(keyword => content.includes(keyword))) {
      categories.push('technology');
    }

    // 财经相关关键词
    const financeKeywords = [
      '财经', '股票', '投资', '经济', '金融', '股市', '基金', '理财',
      'finance', 'stock', 'investment', 'economy', 'market'
    ];
    if (financeKeywords.some(keyword => content.includes(keyword))) {
      categories.push('finance');
    }

    // 体育相关关键词
    const sportsKeywords = [
      '体育', '足球', '篮球', '比赛', '运动员', '奥运', '世界杯',
      'sports', 'football', 'basketball', 'game', 'athlete'
    ];
    if (sportsKeywords.some(keyword => content.includes(keyword))) {
      categories.push('sports');
    }

    // 如果没有匹配到任何分类，返回通用分类
    if (categories.length === 0) {
      categories.push('general');
    }

    return categories;
  }

  /**
   * 检测投资相关内容（支持中文）
   */
  private detectInvestmentContent(content: string): boolean {
    // 投资相关关键词（中文）
    const investmentKeywords = [
      '股票', '股份', '投资', '投资组合', '市场', '交易', '牛市', '熊市', '股息', '收益',
      'stock', 'stocks', 'share', 'shares', 'investment', 'invest', 'portfolio',
      'market', 'trading', 'trade', 'bull', 'bear', 'dividend', 'earnings'
    ];

    // 股票代码模式（如$AAPL, TSLA等）
    const stockSymbolPattern = /\$[A-Z]{1,5}|\b[A-Z]{1,5}\b(?=\s+stock|\s+shares?)/i;

    // 百分比变化模式
    const percentagePattern = /[+-]?\d+(\.\d+)?%/;

    // 中文百分比模式（如上涨5%、下跌3%）
    const chinesePercentagePattern = /(上涨|下跌|涨|跌)\s*[+-]?\d+(\.\d+)?%/;

    return investmentKeywords.some(keyword => content.includes(keyword)) ||
           stockSymbolPattern.test(content) ||
           percentagePattern.test(content) ||
           chinesePercentagePattern.test(content);
  }

  /**
   * 生成标签
   */
  private generateTags(post: WeiboPost, categories: string[], isInvestmentRelated: boolean): string[] {
    const tags: string[] = [];

    // 添加内容分类
    tags.push(...categories);

    // 添加投资相关标签
    if (isInvestmentRelated) {
      tags.push('investment');
    }

    // 添加作者验证状态
    if (post.author.verified) {
      tags.push('verified');
      if (post.author.verificationType) {
        tags.push(`verified-${post.author.verificationType}`);
      }
    }

    // 添加媒体类型标签
    if (post.metadata.containsVideo) {
      tags.push('video');
    }
    if (post.metadata.containsImage) {
      tags.push('image');
      if (post.metadata.imageCount && post.metadata.imageCount > 1) {
        tags.push(`images-${post.metadata.imageCount}`);
      }
    }
    if (post.metadata.containsLink) {
      tags.push('link');
    }

    // 添加原创标签
    if (post.metadata.isOriginal) {
      tags.push('original');
    }

    // 添加互动标签
    if (post.engagement.repostCount > 10000) {
      tags.push('high-repost');
    }
    if (post.engagement.commentCount > 10000) {
      tags.push('high-comment');
    }
    if (post.engagement.likeCount > 50000) {
      tags.push('high-like');
    }

    // 添加话题标签
    if (post.metadata.topics && post.metadata.topics.length > 0) {
      tags.push(...post.metadata.topics.map(t => t.replace('#', '')));
    }

    return Array.from(new Set(tags)); // 去重
  }

  /**
   * 转换热搜话题为新闻项
   */
  private convertHotTopicToNewsItem(topic: HotTopic): NewsItem {
    const content = `热搜话题：${topic.title}\n\n${topic.description || ''}\n\n热度值：${topic.hotValue}`;
    const categories = this.analyzeContentCategories(content);
    const isInvestmentRelated = this.detectInvestmentContent(content);
    const tags = this.generateTopicTags(topic, categories, isInvestmentRelated);

    return {
      id: `weibo_topic_${topic.id}`,
      platform: PlatformType.WEIBO,
      title: `热搜：${topic.title}`,
      content,
      url: topic.url,
      author: {
        id: 'weibo_trending',
        name: '微博热搜',
        avatarUrl: undefined,
        verified: true
      },
      publishTime: new Date(), // 热搜时间使用当前时间
      engagement: {
        likeCount: 0,
        shareCount: 0,
        commentCount: topic.discussionCount || 0,
        viewCount: topic.readCount || topic.hotValue
      },
      media: [],
      tags,
      platformSpecific: {
        weibo: {
          topicId: topic.id,
          hotValue: topic.hotValue,
          rank: topic.rank,
          category: topic.category
        }
      },
      collectedAt: new Date()
    };
  }

  /**
   * 生成热搜话题标签
   */
  private generateTopicTags(topic: HotTopic, categories: string[], isInvestmentRelated: boolean): string[] {
    const tags: string[] = [];

    // 添加内容分类
    tags.push(...categories);

    // 添加投资相关标签
    if (isInvestmentRelated) {
      tags.push('investment');
    }

    // 添加热搜分类
    tags.push(topic.category);
    tags.push(`rank-${topic.rank}`);

    // 添加热度标签
    if (topic.hotValue > 1000000) {
      tags.push('super-hot');
    } else if (topic.hotValue > 500000) {
      tags.push('very-hot');
    } else if (topic.hotValue > 100000) {
      tags.push('hot');
    }

    return Array.from(new Set(tags));
  }

  /**
   * 转换微博帖子为新闻项
   */
  private convertPostToNewsItem(post: WeiboPost): NewsItem {
    const content = post.content;
    const categories = this.analyzeContentCategories(content);
    const isInvestmentRelated = this.detectInvestmentContent(content);
    const tags = this.generateTags(post, categories, isInvestmentRelated);

    // 生成标题（截取前部分内容）
    const title = post.content.length > 50
      ? `${post.content.substring(0, 47)}...`
      : post.content;

    // 转换媒体类型
    const media = post.media.map(m => ({
      type: m.type === 'video' ? MediaType.VIDEO : MediaType.IMAGE,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl || m.url,
      width: m.width,
      height: m.height
    }));

    return {
      id: `weibo_${post.id}`,
      platform: PlatformType.WEIBO,
      title,
      content,
      url: post.url,
      author: {
        id: post.author.id,
        name: post.author.name,
        avatarUrl: post.author.avatarUrl,
        verified: post.author.verified
      },
      publishTime: post.publishTime,
      engagement: {
        likeCount: post.engagement.likeCount,
        shareCount: post.engagement.repostCount,
        commentCount: post.engagement.commentCount,
        viewCount: post.engagement.viewCount || 0
      },
      media,
      tags,
      platformSpecific: {
        weibo: {
          weiboId: post.id,
          isOriginal: post.metadata.isOriginal,
          source: post.metadata.source,
          topics: post.metadata.topics
        }
      },
      collectedAt: new Date()
    };
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理微博采集器资源...');

    try {
      // 清理网页爬虫
      if (this.webScraper) {
        await this.webScraper.cleanup();
      }

      // 清理反爬系统
      await this.antiCrawlingSystem.cleanup();

      this.logger.info('微博采集器资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '资源清理', platform: 'weibo' });
      throw error;
    }
  }
}