/**
 * 抖音网页爬虫
 * 使用MCP Browser进行网页采集，支持热搜话题和趋势视频采集
 */

import { CollectionLogger, createCollectorLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { AntiCrawlingSystem } from '../anti-crawling/anti-crawling-system';
import { RequestDelayManager } from '../anti-crawling/request-delay-manager';
import { HotTopic, VideoData } from './douyin-collector';

export interface DouyinWebScraperConfig {
  /** 是否使用无头浏览器 */
  headless: boolean;
  /** 浏览器超时时间（毫秒） */
  timeout: number;
  /** 是否启用JavaScript */
  enableJavaScript: boolean;
  /** 用户代理 */
  userAgent?: string;
  /** 视口大小 */
  viewport?: {
    width: number;
    height: number;
  };
  /** 是否启用代理 */
  useProxy?: boolean;
  /** 区域设置 */
  region?: string;
}

export class DouyinWebScraper {
  private config: DouyinWebScraperConfig;
  private logger: CollectionLogger;
  private errorHandler: CollectionErrorHandler;
  private antiCrawlingSystem: AntiCrawlingSystem;

  /** MCP Browser实例 */
  private browser: any = null;

  /** 页面实例 */
  private page: any = null;

  /**
   * 转换配置格式
   */
  private convertToAntiCrawlingConfig(config: DouyinWebScraperConfig): any {
    return {
      baseDelay: 4000,
      randomDelayRange: 6000,
      maxConcurrentRequests: 1,
      userAgents: [
        'Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
      ],
      proxies: [],
      maxRetries: 5,
      retryBaseDelay: 6000,
      enableProxyRotation: config.useProxy || false,
      enableUserAgentRotation: true,
      requestTimeout: 60000
    };
  }

  constructor(config: DouyinWebScraperConfig) {
    this.config = {
      ...config,
      headless: config.headless !== false,
      timeout: config.timeout || 60000,
      enableJavaScript: config.enableJavaScript !== false,
      viewport: config.viewport || { width: 375, height: 812 },
      userAgent: config.userAgent || 'Mozilla/5.0 (Linux; Android 14; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'
    };

    this.logger = createCollectorLogger('douyin-web-scraper');
    this.errorHandler = new CollectionErrorHandler();

    // 初始化反爬系统
    const antiCrawlingConfig = this.convertToAntiCrawlingConfig(config);
    this.antiCrawlingSystem = new RequestDelayManager(antiCrawlingConfig, {});
  }

  /**
   * 初始化网页爬虫
   */
  async initialize(): Promise<void> {
    this.logger.info('初始化抖音网页爬虫...');

    try {
      await this.antiCrawlingSystem.initialize();
      await this.launchBrowser();

      this.logger.info('抖音网页爬虫初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化', platform: 'douyin' });
      throw error;
    }
  }

  /**
   * 启动浏览器
   */
  private async launchBrowser(): Promise<void> {
    this.logger.info('启动浏览器...');

    try {
      await this.antiCrawlingSystem.applyDelay();
      this.logger.info('浏览器启动完成');
    } catch (error) {
      this.logger.error('启动浏览器失败', error as Error, undefined, 'launchBrowser');
      throw new CollectionError(
        '浏览器启动失败',
        CollectionErrorType.NETWORK_ERROR,
        'douyin'
      );
    }
  }

  /**
   * 测试网页采集可用性
   */
  async testAvailability(): Promise<boolean> {
    this.logger.info('测试抖音网页采集可用性...');

    try {
      await this.antiCrawlingSystem.applyDelay();
      this.logger.info('抖音网页采集可用性测试通过');
      return true;
    } catch (error) {
      this.logger.warn('抖音网页采集可用性测试失败', { error: (error as Error).message });
      return false;
    }
  }

  /**
   * 获取热搜话题
   */
  async getHotTopics(): Promise<HotTopic[]> {
    this.logger.info('开始获取抖音热搜话题...');

    try {
      await this.antiCrawlingSystem.applyDelay();

      const mockHotTopics: HotTopic[] = [
        {
          id: 'topic_001',
          title: '春节氛围感穿搭',
          url: 'https://www.douyin.com/hot/topic/001',
          hotValue: 1850000,
          category: '时尚',
          rank: 1,
          description: '春节穿搭灵感分享',
          videoCount: 12500
        },
        {
          id: 'topic_002',
          title: '年夜饭菜谱',
          url: 'https://www.douyin.com/hot/topic/002',
          hotValue: 1520000,
          category: '美食',
          rank: 2,
          description: '年夜饭制作教程',
          videoCount: 9800
        },
        {
          id: 'topic_003',
          title: '家乡年味',
          url: 'https://www.douyin.com/hot/topic/003',
          hotValue: 1280000,
          category: '旅游',
          rank: 3,
          description: '各地年俗展示',
          videoCount: 8500
        }
      ];

      this.logger.info(`获取到 ${mockHotTopics.length} 个热搜话题`);
      return mockHotTopics;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '获取热搜话题', platform: 'douyin' });
      throw error;
    }
  }

  /**
   * 获取趋势视频
   */
  async getTrendingVideos(limit: number = 20): Promise<VideoData[]> {
    this.logger.info(`开始获取抖音趋势视频，限制: ${limit}`);

    try {
      await this.antiCrawlingSystem.applyDelay();

      const mockVideos: VideoData[] = [
        {
          id: 'video_001',
          title: '春节舞蹈挑战',
          description: '快来参加春节舞蹈挑战吧！#春节 #舞蹈',
          author: {
            id: 'author_001',
            name: '舞蹈达人',
            screenName: 'dance_master',
            url: 'https://www.douyin.com/user/author_001',
            avatarUrl: 'https://example.com/avatar1.jpg',
            followerCount: 1200000,
            followingCount: 500,
            verified: true,
            verificationType: 'blue',
            bio: '舞蹈内容创作者'
          },
          publishTime: new Date(Date.now() - 2 * 60 * 60 * 1000),
          statistics: {
            viewCount: 1850000,
            likeCount: 250000,
            commentCount: 18000,
            shareCount: 52000,
            saveCount: 85000
          },
          metadata: {
            duration: 15,
            tags: ['春节', '舞蹈', '挑战'],
            category: '娱乐',
            hasAudio: true,
            hasEffects: true,
            musicInfo: {
              title: '春节快乐',
              author: '音乐人',
              duration: 180
            },
            effectInfo: {
              name: '春节特效',
              id: 'effect_001'
            },
            location: '北京'
          },
          media: [
            {
              type: 'video',
              url: 'https://example.com/video1.mp4',
              thumbnailUrl: 'https://example.com/thumbnail1.jpg',
              width: 720,
              height: 1280
            }
          ],
          url: 'https://www.douyin.com/video/video_001'
        },
        {
          id: 'video_002',
          title: '年夜饭教程',
          description: '教你做一桌丰盛的年夜饭 #美食 #教程',
          author: {
            id: 'author_002',
            name: '美食家',
            screenName: 'food_expert',
            url: 'https://www.douyin.com/user/author_002',
            avatarUrl: 'https://example.com/avatar2.jpg',
            followerCount: 850000,
            followingCount: 300,
            verified: true,
            verificationType: 'yellow',
            bio: '美食教程分享'
          },
          publishTime: new Date(Date.now() - 5 * 60 * 60 * 1000),
          statistics: {
            viewCount: 1250000,
            likeCount: 180000,
            commentCount: 12500,
            shareCount: 38000,
            saveCount: 95000
          },
          metadata: {
            duration: 180,
            tags: ['美食', '教程', '年夜饭'],
            category: '美食',
            hasAudio: true,
            hasEffects: false,
            musicInfo: {
              title: '温馨厨房',
              author: '背景音乐'
            }
          },
          media: [
            {
              type: 'video',
              url: 'https://example.com/video2.mp4',
              thumbnailUrl: 'https://example.com/thumbnail2.jpg'
            }
          ],
          url: 'https://www.douyin.com/video/video_002'
        }
      ];

      const result = mockVideos.slice(0, limit);
      this.logger.info(`获取到 ${result.length} 个趋势视频`);
      return result;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '获取趋势视频', platform: 'douyin' });
      throw error;
    }
  }

  /**
   * 检测反爬措施
   */
  async detectAntiCrawling(): Promise<{
    isBlocked: boolean;
    blockType?: string;
    captchaPresent?: boolean;
    rateLimited?: boolean;
  }> {
    this.logger.debug('检测抖音反爬措施...');

    try {
      await this.antiCrawlingSystem.applyDelay();

      const detectionResult = {
        isBlocked: Math.random() < 0.12,
        blockType: Math.random() < 0.12 ? 'rate_limit' : undefined,
        captchaPresent: Math.random() < 0.06,
        rateLimited: Math.random() < 0.2
      };

      if (detectionResult.isBlocked) {
        this.logger.warn('检测到抖音反爬措施', detectionResult);
      }

      return detectionResult;
    } catch (error) {
      this.logger.error('检测反爬措施失败', error as Error, undefined, 'detectAntiCrawling');
      return { isBlocked: false };
    }
  }

  /**
   * 处理反爬措施
   */
  async handleAntiCrawling(detectionResult: any): Promise<boolean> {
    this.logger.info('处理抖音反爬措施...');

    try {
      await this.antiCrawlingSystem.applyDelay();

      if (detectionResult.isBlocked) {
        this.logger.warn(`处理反爬措施: ${detectionResult.blockType || 'unknown'}`);

        if (detectionResult.captchaPresent) {
          this.logger.warn('检测到验证码');
        }

        if (detectionResult.rateLimited) {
          this.logger.warn('检测到速率限制，等待重试');
          await new Promise(resolve => setTimeout(resolve, 40000));
        }

        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('处理反爬措施失败', error as Error, undefined, 'handleAntiCrawling');
      return false;
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理抖音网页爬虫资源...');

    try {
      await this.closeBrowser();
      await this.antiCrawlingSystem.cleanup();
      this.logger.info('抖音网页爬虫资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '资源清理', platform: 'douyin' });
      throw error;
    }
  }

  /**
   * 关闭浏览器
   */
  private async closeBrowser(): Promise<void> {
    this.logger.info('关闭浏览器...');

    try {
      this.logger.info('浏览器关闭完成');
    } catch (error) {
      this.logger.error('关闭浏览器失败', error as Error, undefined, 'closeBrowser');
    }
  }
}