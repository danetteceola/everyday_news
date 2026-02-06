/**
 * TikTok数据采集器
 * 支持网页采集方式，采集趋势视频和热门内容
 */

import { NewsItem, PlatformType, MediaType } from '../types/news-item';
import { AntiCrawlingSystem } from '../anti-crawling/anti-crawling-system';
import { RequestDelayManager } from '../anti-crawling/request-delay-manager';
import { CollectionLogger, createPlatformLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { TikTokWebScraper, TikTokWebScraperConfig } from './tiktok-web-scraper';

export interface TikTokCollectorConfig {
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
    /** 区域设置（用于绕过地理限制） */
    region?: string;
    /** 语言设置 */
    language?: string;
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
    /** 是否采集音频信息 */
    collectAudioInfo?: boolean;
    /** 是否采集特效信息 */
    collectEffectInfo?: boolean;
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
  /** 作者名称 */
  authorName: string;
  /** 作者ID */
  authorId: string;
  /** 作者URL */
  authorUrl: string;
  /** 观看次数 */
  viewCount: number;
  /** 点赞数 */
  likeCount: number;
  /** 评论数 */
  commentCount: number;
  /** 分享数 */
  shareCount: number;
  /** 发布时间（相对时间字符串） */
  publishedTime: string;
  /** 视频时长（秒） */
  duration: number;
  /** 视频缩略图URL */
  thumbnailUrl: string;
  /** 视频描述（可选） */
  description?: string;
  /** 视频标签 */
  tags?: string[];
  /** 音频信息（可选） */
  audioInfo?: {
    title: string;
    author: string;
    url?: string;
  };
  /** 特效信息（可选） */
  effectInfo?: {
    name: string;
    id: string;
  };
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
    playCount?: number;
  };
  /** 视频元数据 */
  metadata: {
    duration: number; // 秒
    resolution?: string;
    aspectRatio?: string;
    tags: string[];
    language?: string;
    region?: string;
    category?: string;
    /** 是否包含音频 */
    hasAudio: boolean;
    /** 是否包含特效 */
    hasEffects: boolean;
    /** 音乐信息 */
    musicInfo?: {
      title: string;
      author: string;
      album?: string;
      duration?: number;
    };
    /** 特效信息 */
    effectInfo?: {
      name: string;
      id: string;
      type?: string;
    };
  };
  /** 媒体内容 */
  media: Array<{
    type: 'video' | 'thumbnail';
    url: string;
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    duration?: number;
    format?: string;
  }>;
  /** 视频URL */
  url: string;
}

export class TikTokCollector {
  private config: TikTokCollectorConfig;
  private logger: CollectionLogger;
  private errorHandler: CollectionErrorHandler;
  private antiCrawlingSystem: AntiCrawlingSystem;

  /** 网页爬虫实例 */
  private webScraper: TikTokWebScraper | null = null;

  /** 网页采集状态 */
  private webAvailable: boolean = false;

  /**
   * 将TikTok采集器配置转换为反爬系统配置
   */
  private convertToAntiCrawlingConfig(tiktokConfig: any): any {
    const config = tiktokConfig || {
      baseDelay: 3000, // TikTok需要更长的延迟
      randomDelayRange: 5000,
      maxConcurrentRequests: 1, // TikTok网页操作需要严格的并发控制
      userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        'Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
      ],
      proxyConfig: {
        enabled: true, // TikTok通常需要代理
        proxies: [],
        rotationStrategy: 'round-robin'
      },
      errorRetryConfig: {
        maxRetries: 5, // TikTok反爬较严，需要更多重试
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
      requestTimeout: 45000 // TikTok页面加载较慢
    };
  }

  constructor(config: TikTokCollectorConfig) {
    this.config = config;
    this.logger = createPlatformLogger('tiktok');
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
        'TikTok采集器配置错误：必须启用网页采集',
        CollectionErrorType.CONFIGURATION_ERROR,
        'tiktok'
      );
    }

    if (this.config.enableWebCollection && !this.config.webConfig) {
      throw new CollectionError(
        'TikTok采集器配置错误：启用网页采集时必须提供网页配置',
        CollectionErrorType.CONFIGURATION_ERROR,
        'tiktok'
      );
    }

    // TikTok通常需要代理来绕过区域限制
    if (this.config.enableWebCollection && this.config.webConfig?.useProxy === false) {
      this.logger.warn('TikTok采集器警告：未启用代理可能无法访问TikTok内容');
    }
  }

  /**
   * 初始化采集器
   */
  async initialize(): Promise<void> {
    this.logger.info('初始化TikTok采集器...');

    try {
      // 初始化反爬系统
      await this.antiCrawlingSystem.initialize();

      // 初始化网页爬虫
      if (this.config.enableWebCollection && this.config.webConfig) {
        this.webScraper = await this.initializeWebScraper();
        this.webAvailable = this.webScraper !== null;
        this.logger.info(`TikTok网页采集可用性: ${this.webAvailable ? '可用' : '不可用'}`);
      }

      if (!this.webAvailable) {
        throw new CollectionError(
          'TikTok采集器初始化失败：网页采集不可用',
          CollectionErrorType.NETWORK_ERROR,
          'tiktok'
        );
      }

      this.logger.info('TikTok采集器初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化', platform: 'tiktok' });
      throw error;
    }
  }

  /**
   * 初始化网页爬虫
   */
  private async initializeWebScraper(): Promise<TikTokWebScraper | null> {
    if (!this.config.webConfig) {
      return null;
    }

    try {
      const scraperConfig: TikTokWebScraperConfig = {
        headless: this.config.webConfig.headless,
        timeout: this.config.webConfig.timeout,
        enableJavaScript: this.config.webConfig.enableJavaScript,
        useProxy: this.config.webConfig.useProxy || false,
        region: this.config.webConfig.region,
        language: this.config.webConfig.language,
        viewport: { width: 375, height: 812 } // 移动端视口
      };

      const webScraper = new TikTokWebScraper(scraperConfig);
      await webScraper.initialize();

      // 测试网页采集可用性
      const isAvailable = await webScraper.testAvailability();
      if (!isAvailable) {
        this.logger.warn('TikTok网页爬虫初始化成功但可用性测试失败');
        await webScraper.cleanup();
        return null;
      }

      return webScraper;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化网页爬虫', platform: 'tiktok' });
      return null;
    }
  }

  /**
   * 执行数据采集
   */
  async collect(): Promise<NewsItem[]> {
    this.logger.info('开始TikTok数据采集...');
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
      this.logger.info(`TikTok数据采集完成，采集到 ${newsItems.length} 个新闻项，耗时 ${elapsedTime}ms`);

      return newsItems;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '数据采集', platform: 'tiktok' });
      throw error;
    }
  }

  /**
   * 采集趋势视频
   */
  private async collectTrendingVideos(): Promise<VideoData[]> {
    this.logger.info('开始采集TikTok趋势视频...');

    if (!this.webScraper) {
      throw new CollectionError(
        'TikTok网页爬虫未初始化',
        CollectionErrorType.CONFIGURATION_ERROR,
        'tiktok'
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
      this.errorHandler.handleError(error as Error, { operation: '采集趋势视频', platform: 'tiktok' });
      throw error;
    }
  }

  /**
   * 创建基础视频数据
   */
  private createBasicVideoData(video: TrendingVideo): VideoData {
    return {
      id: video.id,
      title: video.title || '',
      description: video.description || '',
      author: {
        id: video.authorId,
        name: video.authorName,
        screenName: video.authorName,
        url: video.authorUrl,
        verified: false
      },
      publishTime: this.parsePublishedTime(video.publishedTime),
      statistics: {
        viewCount: video.viewCount,
        likeCount: video.likeCount,
        commentCount: video.commentCount,
        shareCount: video.shareCount
      },
      metadata: {
        duration: video.duration,
        tags: video.tags || [],
        hasAudio: !!video.audioInfo,
        hasEffects: !!video.effectInfo,
        musicInfo: video.audioInfo ? {
          title: video.audioInfo.title,
          author: video.audioInfo.author
        } : undefined,
        effectInfo: video.effectInfo
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

    // 娱乐相关关键词
    const entertainmentKeywords = [
      'entertainment', 'music', 'dance', 'comedy', 'funny', 'challenge', 'trend',
      '娱乐', '音乐', '舞蹈', '搞笑', '喜剧', '挑战', '潮流'
    ];
    if (entertainmentKeywords.some(keyword => contentLower.includes(keyword))) {
      categories.push('entertainment');
    }

    // 科技相关关键词
    const techKeywords = [
      'tech', 'technology', 'ai', 'artificial intelligence', 'gadget', 'innovation',
      '科技', '技术', '人工智能', '创新', '数码'
    ];
    if (techKeywords.some(keyword => contentLower.includes(keyword))) {
      categories.push('technology');
    }

    // 教育相关关键词
    const educationKeywords = [
      'education', 'tutorial', 'learn', 'how to', 'tips', 'life hack',
      '教育', '教程', '学习', '技巧', '生活小窍门'
    ];
    if (educationKeywords.some(keyword => contentLower.includes(keyword))) {
      categories.push('education');
    }

    // 美食相关关键词
    const foodKeywords = [
      'food', 'cooking', 'recipe', 'delicious', 'meal', 'restaurant',
      '美食', '烹饪', '食谱', '美味', '餐馆'
    ];
    if (foodKeywords.some(keyword => contentLower.includes(keyword))) {
      categories.push('food');
    }

    // 时尚相关关键词
    const fashionKeywords = [
      'fashion', 'style', 'outfit', 'beauty', 'makeup', 'clothing',
      '时尚', '风格', '穿搭', '美容', '化妆', '服装'
    ];
    if (fashionKeywords.some(keyword => contentLower.includes(keyword))) {
      categories.push('fashion');
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
    if (video.metadata.category) {
      tags.push(video.metadata.category);
    }

    // 添加内容分类
    tags.push(...categories);

    // 添加投资相关标签
    if (isInvestmentRelated) {
      tags.push('investment');
    }

    // 添加作者验证状态
    if (video.author.verified) {
      tags.push('verified');
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

    // 添加互动标签
    if (video.statistics.likeCount > 100000) {
      tags.push('high-engagement');
    }

    // 添加音频标签
    if (video.metadata.hasAudio && video.metadata.musicInfo) {
      tags.push('has-music');
    }

    // 添加特效标签
    if (video.metadata.hasEffects) {
      tags.push('has-effects');
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
      id: `tiktok_${video.id}`,
      platform: PlatformType.TIKTOK,
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
        tiktok: {
          videoId: video.id,
          authorId: video.author.id,
          duration: video.metadata.duration,
          tags: video.metadata.tags,
          hasAudio: video.metadata.hasAudio,
          hasEffects: video.metadata.hasEffects,
          musicInfo: video.metadata.musicInfo,
          effectInfo: video.metadata.effectInfo
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
    this.logger.info('清理TikTok采集器资源...');

    try {
      // 清理网页爬虫
      if (this.webScraper) {
        await this.webScraper.cleanup();
      }

      // 清理反爬系统
      await this.antiCrawlingSystem.cleanup();

      this.logger.info('TikTok采集器资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '资源清理', platform: 'tiktok' });
      throw error;
    }
  }
}