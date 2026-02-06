/**
 * 抖音数据采集器
 * 支持网页采集方式，采集热搜话题和趋势视频
 * 基于TikTok采集器，但针对抖音中文环境优化
 */

import { NewsItem, PlatformType, MediaType } from '../types/news-item';
import { AntiCrawlingSystem } from '../anti-crawling/anti-crawling-system';
import { RequestDelayManager } from '../anti-crawling/request-delay-manager';
import { CollectionLogger, createPlatformLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { DouyinWebScraper, DouyinWebScraperConfig } from './douyin-web-scraper';

export interface DouyinCollectorConfig {
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
    /** 区域设置 */
    region?: string;
  };

  /** 采集目标 */
  collectionTargets: {
    /** 是否采集热搜话题 */
    collectHotTopics: boolean;
    /** 是否采集趋势视频 */
    collectTrendingVideos: boolean;
    /** 每个类别采集的视频数量 */
    videosPerCategory: number;
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
  /** 视频数量 */
  videoCount?: number;
}

export interface VideoData {
  /** 视频ID */
  id: string;
  /** 视频标题 */
  title: string;
  /** 视频描述 */
  description: string;
  /** 作者信息 */
  author: {
    id: string;
    name: string;
    screenName: string;
    url: string;
    avatarUrl?: string;
    followerCount?: number;
    followingCount?: number;
    verified: boolean;
    verificationType?: string;
    bio?: string;
  };
  /** 发布时间 */
  publishTime: Date;
  /** 视频统计信息 */
  statistics: {
    viewCount: number;
    likeCount: number;
    commentCount: number;
    shareCount: number;
    saveCount?: number;
  };
  /** 视频元数据 */
  metadata: {
    duration: number; // 秒
    tags: string[];
    category?: string;
    hasAudio: boolean;
    hasEffects: boolean;
    musicInfo?: {
      title: string;
      author: string;
      duration?: number;
    };
    effectInfo?: {
      name: string;
      id: string;
    };
    location?: string;
  };
  /** 媒体内容 */
  media: Array<{
    type: 'video' | 'thumbnail';
    url: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
  }>;
  /** 视频URL */
  url: string;
}

export class DouyinCollector {
  private config: DouyinCollectorConfig;
  private logger: CollectionLogger;
  private errorHandler: CollectionErrorHandler;
  private antiCrawlingSystem: AntiCrawlingSystem;

  /** 网页爬虫实例 */
  private webScraper: DouyinWebScraper | null = null;

  /** 网页采集状态 */
  private webAvailable: boolean = false;

  /**
   * 将抖音采集器配置转换为反爬系统配置
   */
  private convertToAntiCrawlingConfig(douyinConfig: any): any {
    const config = douyinConfig || {
      baseDelay: 3500,
      randomDelayRange: 5000,
      maxConcurrentRequests: 1,
      userAgents: [
        // 中文移动端用户代理
        'Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
      ],
      proxyConfig: {
        enabled: true,
        proxies: [],
        rotationStrategy: 'round-robin'
      },
      errorRetryConfig: {
        maxRetries: 5,
        baseDelay: 5000,
        maxDelay: 30000,
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
      requestTimeout: 60000
    };
  }

  constructor(config: DouyinCollectorConfig) {
    this.config = config;
    this.logger = createPlatformLogger('douyin');
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
        '抖音采集器配置错误：必须启用网页采集',
        CollectionErrorType.CONFIGURATION_ERROR,
        'douyin'
      );
    }

    if (this.config.enableWebCollection && !this.config.webConfig) {
      throw new CollectionError(
        '抖音采集器配置错误：启用网页采集时必须提供网页配置',
        CollectionErrorType.CONFIGURATION_ERROR,
        'douyin'
      );
    }
  }

  /**
   * 初始化采集器
   */
  async initialize(): Promise<void> {
    this.logger.info('初始化抖音采集器...');

    try {
      // 初始化反爬系统
      await this.antiCrawlingSystem.initialize();

      // 初始化网页爬虫
      if (this.config.enableWebCollection && this.config.webConfig) {
        this.webScraper = await this.initializeWebScraper();
        this.webAvailable = this.webScraper !== null;
        this.logger.info(`抖音网页采集可用性: ${this.webAvailable ? '可用' : '不可用'}`);
      }

      if (!this.webAvailable) {
        throw new CollectionError(
          '抖音采集器初始化失败：网页采集不可用',
          CollectionErrorType.NETWORK_ERROR,
          'douyin'
        );
      }

      this.logger.info('抖音采集器初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化', platform: 'douyin' });
      throw error;
    }
  }

  /**
   * 初始化网页爬虫
   */
  private async initializeWebScraper(): Promise<DouyinWebScraper | null> {
    if (!this.config.webConfig) {
      return null;
    }

    try {
      const scraperConfig: DouyinWebScraperConfig = {
        headless: this.config.webConfig.headless,
        timeout: this.config.webConfig.timeout,
        enableJavaScript: this.config.webConfig.enableJavaScript,
        useProxy: this.config.webConfig.useProxy || false,
        region: this.config.webConfig.region,
        viewport: { width: 375, height: 812 }
      };

      const webScraper = new DouyinWebScraper(scraperConfig);
      await webScraper.initialize();

      // 测试网页采集可用性
      const isAvailable = await webScraper.testAvailability();
      if (!isAvailable) {
        this.logger.warn('抖音网页爬虫初始化成功但可用性测试失败');
        await webScraper.cleanup();
        return null;
      }

      return webScraper;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化网页爬虫', platform: 'douyin' });
      return null;
    }
  }

  /**
   * 执行数据采集
   */
  async collect(): Promise<NewsItem[]> {
    this.logger.info('开始抖音数据采集...');
    const startTime = Date.now();

    try {
      const newsItems: NewsItem[] = [];

      // 采集热搜话题
      if (this.config.collectionTargets.collectHotTopics) {
        const hotTopics = await this.collectHotTopics();
        const topicNewsItems = hotTopics.map(topic => this.convertHotTopicToNewsItem(topic));
        newsItems.push(...topicNewsItems);
      }

      // 采集趋势视频
      if (this.config.collectionTargets.collectTrendingVideos) {
        const trendingVideos = await this.collectTrendingVideos();
        const videoNewsItems = trendingVideos.map(video => this.convertVideoToNewsItem(video));
        newsItems.push(...videoNewsItems);
      }

      const elapsedTime = Date.now() - startTime;
      this.logger.info(`抖音数据采集完成，采集到 ${newsItems.length} 个新闻项，耗时 ${elapsedTime}ms`);

      return newsItems;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '数据采集', platform: 'douyin' });
      throw error;
    }
  }

  /**
   * 采集热搜话题
   */
  private async collectHotTopics(): Promise<HotTopic[]> {
    this.logger.info('开始采集抖音热搜话题...');

    if (!this.webScraper) {
      throw new CollectionError(
        '抖音网页爬虫未初始化',
        CollectionErrorType.CONFIGURATION_ERROR,
        'douyin'
      );
    }

    try {
      const hotTopics = await this.webScraper.getHotTopics();
      this.logger.info(`采集到 ${hotTopics.length} 个热搜话题`);
      return hotTopics;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '采集热搜话题', platform: 'douyin' });
      throw error;
    }
  }

  /**
   * 采集趋势视频
   */
  private async collectTrendingVideos(): Promise<VideoData[]> {
    this.logger.info('开始采集抖音趋势视频...');

    if (!this.webScraper) {
      throw new CollectionError(
        '抖音网页爬虫未初始化',
        CollectionErrorType.CONFIGURATION_ERROR,
        'douyin'
      );
    }

    try {
      const trendingVideos = await this.webScraper.getTrendingVideos(
        this.config.collectionTargets.videosPerCategory
      );
      this.logger.info(`采集到 ${trendingVideos.length} 个趋势视频`);
      return trendingVideos;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '采集趋势视频', platform: 'douyin' });
      throw error;
    }
  }

  /**
   * 分析内容分类（中文关键词）
   */
  private analyzeContentCategories(content: string): string[] {
    const categories: string[] = [];

    // 娱乐相关关键词
    const entertainmentKeywords = [
      '娱乐', '搞笑', '舞蹈', '音乐', '挑战', '剧情', '短剧',
      'entertainment', 'funny', 'dance', 'music', 'challenge'
    ];
    if (entertainmentKeywords.some(keyword => content.includes(keyword))) {
      categories.push('entertainment');
    }

    // 美食相关关键词
    const foodKeywords = [
      '美食', '吃播', '烹饪', '食谱', '探店', '零食',
      'food', 'cooking', 'recipe', 'restaurant'
    ];
    if (foodKeywords.some(keyword => content.includes(keyword))) {
      categories.push('food');
    }

    // 时尚相关关键词
    const fashionKeywords = [
      '时尚', '穿搭', '美妆', '护肤', '发型', '造型',
      'fashion', 'style', 'makeup', 'beauty'
    ];
    if (fashionKeywords.some(keyword => content.includes(keyword))) {
      categories.push('fashion');
    }

    // 知识相关关键词
    const knowledgeKeywords = [
      '知识', '科普', '教育', '学习', '技巧', '教程',
      'knowledge', 'education', 'learn', 'tutorial'
    ];
    if (knowledgeKeywords.some(keyword => content.includes(keyword))) {
      categories.push('knowledge');
    }

    // 旅游相关关键词
    const travelKeywords = [
      '旅游', '旅行', '风景', '景点', '攻略', '打卡',
      'travel', 'tourism', 'scenery', 'attraction'
    ];
    if (travelKeywords.some(keyword => content.includes(keyword))) {
      categories.push('travel');
    }

    // 如果没有匹配到任何分类，返回通用分类
    if (categories.length === 0) {
      categories.push('general');
    }

    return categories;
  }

  /**
   * 检测投资相关内容（中文）
   */
  private detectInvestmentContent(content: string): boolean {
    // 投资相关关键词（中文）
    const investmentKeywords = [
      '股票', '投资', '理财', '基金', '财经', '赚钱', '经济',
      'stock', 'investment', 'finance', 'money'
    ];

    // 股票代码模式
    const stockSymbolPattern = /\$[A-Z]{1,5}|\b[A-Z]{1,5}\b(?=\s+stock)/i;

    // 百分比变化模式
    const percentagePattern = /[+-]?\d+(\.\d+)?%/;

    return investmentKeywords.some(keyword => content.includes(keyword)) ||
           stockSymbolPattern.test(content) ||
           percentagePattern.test(content);
  }

  /**
   * 生成标签
   */
  private generateTags(video: VideoData, categories: string[], isInvestmentRelated: boolean): string[] {
    const tags: string[] = [];

    // 添加内容分类
    tags.push(...categories);

    // 添加投资相关标签
    if (isInvestmentRelated) {
      tags.push('investment');
    }

    // 添加作者验证状态
    if (video.author.verified) {
      tags.push('verified');
      if (video.author.verificationType) {
        tags.push(`verified-${video.author.verificationType}`);
      }
    }

    // 添加媒体类型标签
    if (video.media.some(m => m.type === 'video')) {
      tags.push('video');
    }

    // 添加时长标签
    if (video.metadata.duration < 30) {
      tags.push('short');
    } else if (video.metadata.duration < 120) {
      tags.push('medium');
    } else {
      tags.push('long');
    }

    // 添加观看量标签
    if (video.statistics.viewCount > 1000000) {
      tags.push('viral');
    } else if (video.statistics.viewCount > 100000) {
      tags.push('popular');
    }

    // 添加音频标签
    if (video.metadata.hasAudio) {
      tags.push('has-music');
    }

    // 添加特效标签
    if (video.metadata.hasEffects) {
      tags.push('has-effects');
    }

    // 添加视频分类
    if (video.metadata.category) {
      tags.push(video.metadata.category);
    }

    return Array.from(new Set(tags)); // 去重
  }

  /**
   * 转换热搜话题为新闻项
   */
  private convertHotTopicToNewsItem(topic: HotTopic): NewsItem {
    const content = `抖音热搜：${topic.title}\n\n${topic.description || ''}\n\n热度值：${topic.hotValue}`;
    const categories = this.analyzeContentCategories(content);
    const isInvestmentRelated = this.detectInvestmentContent(content);
    const tags = this.generateTopicTags(topic, categories, isInvestmentRelated);

    return {
      id: `douyin_topic_${topic.id}`,
      platform: PlatformType.DOUYIN,
      title: `抖音热搜：${topic.title}`,
      content,
      url: topic.url,
      author: {
        id: 'douyin_trending',
        name: '抖音热搜',
        avatarUrl: undefined,
        verified: true
      },
      publishTime: new Date(),
      engagement: {
        likeCount: 0,
        shareCount: 0,
        commentCount: 0,
        viewCount: topic.hotValue
      },
      media: [],
      tags,
      platformSpecific: {
        douyin: {
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
   * 转换视频为新闻项
   */
  private convertVideoToNewsItem(video: VideoData): NewsItem {
    const content = `${video.title}\n\n${video.description}`;
    const categories = this.analyzeContentCategories(content);
    const isInvestmentRelated = this.detectInvestmentContent(content);
    const tags = this.generateTags(video, categories, isInvestmentRelated);

    // 生成标题
    const title = video.title.length > 100 ? `${video.title.substring(0, 97)}...` : video.title;

    // 转换媒体类型
    const media = video.media.map(m => ({
      type: m.type === 'video' ? MediaType.VIDEO : MediaType.IMAGE,
      url: m.url,
      thumbnailUrl: m.thumbnailUrl || m.url,
      width: m.width,
      height: m.height
    }));

    return {
      id: `douyin_${video.id}`,
      platform: PlatformType.DOUYIN,
      title,
      content: video.description,
      url: video.url,
      author: {
        id: video.author.id,
        name: video.author.name,
        avatarUrl: video.author.avatarUrl,
        verified: video.author.verified
      },
      publishTime: video.publishTime,
      engagement: {
        likeCount: video.statistics.likeCount,
        shareCount: video.statistics.shareCount,
        commentCount: video.statistics.commentCount,
        viewCount: video.statistics.viewCount
      },
      media,
      tags,
      platformSpecific: {
        douyin: {
          videoId: video.id,
          authorId: video.author.id,
          duration: video.metadata.duration,
          tags: video.metadata.tags,
          hasAudio: video.metadata.hasAudio,
          hasEffects: video.metadata.hasEffects,
          category: video.metadata.category
        }
      },
      collectedAt: new Date()
    };
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理抖音采集器资源...');

    try {
      // 清理网页爬虫
      if (this.webScraper) {
        await this.webScraper.cleanup();
      }

      // 清理反爬系统
      await this.antiCrawlingSystem.cleanup();

      this.logger.info('抖音采集器资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '资源清理', platform: 'douyin' });
      throw error;
    }
  }
}