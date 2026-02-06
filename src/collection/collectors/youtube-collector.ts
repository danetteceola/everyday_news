/**
 * YouTube数据采集器
 * 支持网页采集方式，采集趋势视频和热门内容
 */

import { NewsItem, PlatformType, MediaType } from '../types/news-item';
import { AntiCrawlingSystem } from '../anti-crawling/anti-crawling-system';
import { RequestDelayManager } from '../anti-crawling/request-delay-manager';
import { CollectionLogger, createPlatformLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { YouTubeWebScraper, YouTubeWebScraperConfig } from './youtube-web-scraper';

export interface YouTubeCollectorConfig {
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
  };

  /** 采集目标 */
  collectionTargets: {
    /** 是否采集趋势视频 */
    collectTrendingVideos: boolean;
    /** 是否采集热门内容 */
    collectPopularContent: boolean;
    /** 每个类别采集的视频数量 */
    videosPerCategory: number;
    /** 采集的地理位置 */
    location?: string;
    /** 采集的语言 */
    language?: string;
  };

  /** 反爬系统配置 */
  antiCrawlingConfig?: any;
}

export interface TrendingVideo {
  /** 视频ID */
  id: string;
  /** 视频标题 */
  title: string;
  /** 视频URL */
  url: string;
  /** 频道名称 */
  channelName: string;
  /** 频道URL */
  channelUrl: string;
  /** 观看次数 */
  viewCount: number;
  /** 发布时间（相对时间字符串） */
  publishedTime: string;
  /** 视频时长（秒） */
  duration: number;
  /** 视频缩略图URL */
  thumbnailUrl: string;
  /** 视频描述（可选） */
  description?: string;
  /** 视频分类 */
  category?: string;
  /** 视频标签 */
  tags?: string[];
}

export interface VideoData {
  /** 视频ID */
  id: string;
  /** 视频标题 */
  title: string;
  /** 视频描述 */
  description: string;
  /** 频道信息 */
  channel: {
    id: string;
    name: string;
    url: string;
    avatarUrl?: string;
    subscriberCount?: number;
    verified: boolean;
  };
  /** 发布时间 */
  publishTime: Date;
  /** 视频统计信息 */
  statistics: {
    viewCount: number;
    likeCount: number;
    commentCount: number;
    shareCount?: number;
  };
  /** 视频元数据 */
  metadata: {
    duration: number; // 秒
    category: string;
    tags: string[];
    language?: string;
    license?: string;
    allowRatings?: boolean;
    ageRestricted?: boolean;
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

export class YouTubeCollector {
  private config: YouTubeCollectorConfig;
  private logger: CollectionLogger;
  private errorHandler: CollectionErrorHandler;
  private antiCrawlingSystem: AntiCrawlingSystem;

  /** 网页爬虫实例 */
  private webScraper: YouTubeWebScraper | null = null;

  /** 网页采集状态 */
  private webAvailable: boolean = false;

  /**
   * 将YouTube采集器配置转换为反爬系统配置
   */
  private convertToAntiCrawlingConfig(youtubeConfig: any): any {
    const config = youtubeConfig || {
      baseDelay: 2000,
      randomDelayRange: 3000,
      maxConcurrentRequests: 1, // YouTube网页操作需要更严格的并发控制
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
        baseDelay: 2000,
        maxDelay: 15000,
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
      requestTimeout: 30000
    };
  }

  constructor(config: YouTubeCollectorConfig) {
    this.config = config;
    this.logger = createPlatformLogger('youtube');
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
        'YouTube采集器配置错误：必须启用网页采集',
        CollectionErrorType.CONFIGURATION_ERROR,
        'youtube'
      );
    }

    if (this.config.enableWebCollection && !this.config.webConfig) {
      throw new CollectionError(
        'YouTube采集器配置错误：启用网页采集时必须提供网页配置',
        CollectionErrorType.CONFIGURATION_ERROR,
        'youtube'
      );
    }
  }

  /**
   * 初始化采集器
   */
  async initialize(): Promise<void> {
    this.logger.info('初始化YouTube采集器...');

    try {
      // 初始化反爬系统
      await this.antiCrawlingSystem.initialize();

      // 初始化网页爬虫
      if (this.config.enableWebCollection && this.config.webConfig) {
        this.webScraper = await this.initializeWebScraper();
        this.webAvailable = this.webScraper !== null;
        this.logger.info(`YouTube网页采集可用性: ${this.webAvailable ? '可用' : '不可用'}`);
      }

      if (!this.webAvailable) {
        throw new CollectionError(
          'YouTube采集器初始化失败：网页采集不可用',
          CollectionErrorType.NETWORK_ERROR,
          'youtube'
        );
      }

      this.logger.info('YouTube采集器初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化', platform: 'youtube' });
      throw error;
    }
  }

  /**
   * 初始化网页爬虫
   */
  private async initializeWebScraper(): Promise<YouTubeWebScraper | null> {
    if (!this.config.webConfig) {
      return null;
    }

    try {
      const scraperConfig: YouTubeWebScraperConfig = {
        headless: this.config.webConfig.headless,
        timeout: this.config.webConfig.timeout,
        enableJavaScript: this.config.webConfig.enableJavaScript,
        useProxy: this.config.webConfig.useProxy || false,
        viewport: { width: 1280, height: 800 }
      };

      const webScraper = new YouTubeWebScraper(scraperConfig);
      await webScraper.initialize();

      // 测试网页采集可用性
      const isAvailable = await webScraper.testAvailability();
      if (!isAvailable) {
        this.logger.warn('YouTube网页爬虫初始化成功但可用性测试失败');
        await webScraper.cleanup();
        return null;
      }

      return webScraper;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化网页爬虫', platform: 'youtube' });
      return null;
    }
  }

  /**
   * 执行数据采集
   */
  async collect(): Promise<NewsItem[]> {
    this.logger.info('开始YouTube数据采集...');
    const startTime = Date.now();

    try {
      const newsItems: NewsItem[] = [];

      // 采集趋势视频
      if (this.config.collectionTargets.collectTrendingVideos) {
        const trendingVideos = await this.collectTrendingVideos();
        const videoNewsItems = trendingVideos.map(video => this.convertVideoToNewsItem(video));
        newsItems.push(...videoNewsItems);
      }

      // 采集热门内容（如果有其他采集目标）
      if (this.config.collectionTargets.collectPopularContent) {
        // 这里可以扩展其他采集逻辑
      }

      const elapsedTime = Date.now() - startTime;
      this.logger.info(`YouTube数据采集完成，采集到 ${newsItems.length} 个新闻项，耗时 ${elapsedTime}ms`);

      return newsItems;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '数据采集', platform: 'youtube' });
      throw error;
    }
  }

  /**
   * 采集趋势视频
   */
  private async collectTrendingVideos(): Promise<VideoData[]> {
    this.logger.info('开始采集YouTube趋势视频...');

    if (!this.webScraper) {
      throw new CollectionError(
        'YouTube网页爬虫未初始化',
        CollectionErrorType.CONFIGURATION_ERROR,
        'youtube'
      );
    }

    try {
      // 获取趋势视频列表
      const trendingVideos = await this.webScraper.getTrendingVideos(
        this.config.collectionTargets.videosPerCategory
      );

      // 获取视频详细信息
      const videoDetails: VideoData[] = [];
      for (const video of trendingVideos) {
        try {
          const videoDetail = await this.webScraper.getVideoDetails(video.id);
          videoDetails.push(videoDetail);
        } catch (error) {
          this.logger.warn(`获取视频详情失败: ${video.id}`, { error: (error as Error).message });
          // 使用基础信息创建视频数据
          const basicVideoData = this.createBasicVideoData(video);
          videoDetails.push(basicVideoData);
        }
      }

      this.logger.info(`采集到 ${videoDetails.length} 个趋势视频详情`);
      return videoDetails;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '采集趋势视频', platform: 'youtube' });
      throw error;
    }
  }

  /**
   * 创建基础视频数据
   */
  private createBasicVideoData(video: TrendingVideo): VideoData {
    return {
      id: video.id,
      title: video.title,
      description: video.description || '',
      channel: {
        id: this.extractChannelId(video.channelUrl),
        name: video.channelName,
        url: video.channelUrl,
        verified: false
      },
      publishTime: this.parsePublishedTime(video.publishedTime),
      statistics: {
        viewCount: video.viewCount,
        likeCount: 0,
        commentCount: 0
      },
      metadata: {
        duration: video.duration,
        category: video.category || '未知',
        tags: video.tags || []
      },
      media: [
        {
          type: 'thumbnail',
          url: video.thumbnailUrl,
          thumbnailUrl: video.thumbnailUrl
        }
      ],
      url: video.url
    };
  }

  /**
   * 从频道URL提取频道ID
   */
  private extractChannelId(channelUrl: string): string {
    try {
      const url = new URL(channelUrl);
      const pathParts = url.pathname.split('/').filter(part => part);
      return pathParts[pathParts.length - 1] || `channel_${Date.now()}`;
    } catch {
      return `channel_${Date.now()}`;
    }
  }

  /**
   * 解析发布时间字符串
   */
  private parsePublishedTime(publishedTime: string): Date {
    // 尝试解析相对时间字符串（如"2小时前"、"3天前"等）
    const now = new Date();

    if (publishedTime.includes('小时前')) {
      const hours = parseInt(publishedTime.replace('小时前', '').trim());
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    } else if (publishedTime.includes('天前')) {
      const days = parseInt(publishedTime.replace('天前', '').trim());
      return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    } else if (publishedTime.includes('周前')) {
      const weeks = parseInt(publishedTime.replace('周前', '').trim());
      return new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
    } else if (publishedTime.includes('月前')) {
      const months = parseInt(publishedTime.replace('月前', '').trim());
      return new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000);
    } else if (publishedTime.includes('年前')) {
      const years = parseInt(publishedTime.replace('年前', '').trim());
      return new Date(now.getTime() - years * 365 * 24 * 60 * 60 * 1000);
    }

    // 如果无法解析，返回当前时间
    return now;
  }

  /**
   * 分析内容分类
   */
  private analyzeContentCategories(content: string): string[] {
    const categories: string[] = [];
    const contentLower = content.toLowerCase();

    // 新闻相关关键词
    const newsKeywords = [
      'news', 'breaking', 'update', 'report', 'announcement', 'headline', 'coverage',
      'latest', 'developing', 'exclusive', 'interview', 'press conference',
      '最新', '新闻', '报道', '更新', '头条', '突发', '独家', '发布会', '记者会'
    ];
    if (newsKeywords.some(keyword => contentLower.includes(keyword))) {
      categories.push('news');
    }

    // 科技相关关键词
    const techKeywords = ['tech', 'technology', 'ai', 'artificial intelligence', 'machine learning', 'software', 'hardware', '科技', '人工智能', '软件', '硬件'];
    if (techKeywords.some(keyword => contentLower.includes(keyword))) {
      categories.push('technology');
    }

    // 金融相关关键词
    const financeKeywords = ['finance', 'stock', 'market', 'investment', 'economy', '金融', '股票', '市场', '投资', '经济'];
    if (financeKeywords.some(keyword => contentLower.includes(keyword))) {
      categories.push('finance');
    }

    // 娱乐相关关键词
    const entertainmentKeywords = ['entertainment', 'music', 'movie', 'celebrity', 'show', '娱乐', '音乐', '电影', '明星', '节目'];
    if (entertainmentKeywords.some(keyword => contentLower.includes(keyword))) {
      categories.push('entertainment');
    }

    // 教育相关关键词
    const educationKeywords = ['education', 'tutorial', 'learn', 'course', 'study', '教育', '教程', '学习', '课程'];
    if (educationKeywords.some(keyword => contentLower.includes(keyword))) {
      categories.push('education');
    }

    // 如果没有匹配到任何分类，返回通用分类
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
      'stock', 'stocks', 'share', 'shares', 'investment', 'invest', 'portfolio',
      'market', 'trading', 'trade', 'bull', 'bear', 'dividend', 'earnings',
      '股票', '股份', '投资', '投资组合', '市场', '交易', '牛市', '熊市', '股息', '收益'
    ];

    // 股票代码模式（如$AAPL, TSLA等）
    const stockSymbolPattern = /\$[A-Z]{1,5}|\b[A-Z]{1,5}\b(?=\s+stock|\s+shares?)/i;

    // 百分比变化模式
    const percentagePattern = /[+-]?\d+(\.\d+)?%/;

    return investmentKeywords.some(keyword => contentLower.includes(keyword)) ||
           stockSymbolPattern.test(content) ||
           percentagePattern.test(content);
  }

  /**
   * 生成标签
   */
  private generateTags(video: VideoData, categories: string[], isInvestmentRelated: boolean): string[] {
    const tags: string[] = [];

    // 添加视频分类
    tags.push(video.metadata.category);

    // 添加内容分类
    tags.push(...categories);

    // 添加投资相关标签
    if (isInvestmentRelated) {
      tags.push('investment');
    }

    // 添加频道验证状态
    if (video.channel.verified) {
      tags.push('verified');
    }

    // 添加媒体类型标签
    if (video.media.some(m => m.type === 'video')) {
      tags.push('video');
    }

    // 添加时长标签
    if (video.metadata.duration < 60) {
      tags.push('short');
    } else if (video.metadata.duration < 300) {
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

    return Array.from(new Set(tags)); // 去重
  }

  /**
   * 转换视频为新闻项
   */
  private convertVideoToNewsItem(video: VideoData): NewsItem {
    const content = `${video.title}\n\n${video.description}`;
    const categories = this.analyzeContentCategories(content);
    const isInvestmentRelated = this.detectInvestmentContent(content);
    const tags = this.generateTags(video, categories, isInvestmentRelated);

    // 生成标题（如果描述太长，截取前部分）
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
      id: `youtube_${video.id}`,
      platform: PlatformType.YOUTUBE,
      title,
      content: video.description,
      url: video.url,
      author: {
        id: video.channel.id,
        name: video.channel.name,
        avatarUrl: video.channel.avatarUrl,
        verified: video.channel.verified
      },
      publishTime: video.publishTime,
      engagement: {
        likeCount: video.statistics.likeCount,
        shareCount: video.statistics.shareCount || 0,
        commentCount: video.statistics.commentCount,
        viewCount: video.statistics.viewCount
      },
      media,
      tags,
      platformSpecific: {
        youtube: {
          videoId: video.id,
          channelId: video.channel.id,
          duration: video.metadata.duration,
          category: video.metadata.category,
          tags: video.metadata.tags,
          ageRestricted: video.metadata.ageRestricted || false
        }
      },
      categories,
      isInvestmentRelated
    };
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理YouTube采集器资源...');

    try {
      // 清理网页爬虫
      if (this.webScraper) {
        await this.webScraper.cleanup();
      }

      // 清理反爬系统
      await this.antiCrawlingSystem.cleanup();

      this.logger.info('YouTube采集器资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '资源清理', platform: 'youtube' });
      throw error;
    }
  }
}