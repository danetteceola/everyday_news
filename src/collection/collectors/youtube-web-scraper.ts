/**
 * YouTube网页爬虫
 * 使用MCP Browser进行网页采集，支持趋势视频和视频详情采集
 */

import { CollectionLogger, createCollectorLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { AntiCrawlingSystem } from '../anti-crawling/anti-crawling-system';
import { RequestDelayManager } from '../anti-crawling/request-delay-manager';
import { TrendingVideo, VideoData } from './youtube-collector';

export interface YouTubeWebScraperConfig {
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
  /** YouTube语言设置 */
  language?: string;
  /** 地理位置设置 */
  location?: string;
}

export class YouTubeWebScraper {
  private config: YouTubeWebScraperConfig;
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
  private convertToAntiCrawlingConfig(config: YouTubeWebScraperConfig): any {
    return {
      baseDelay: 3000, // YouTube需要更长的基础延迟
      randomDelayRange: 5000,
      maxConcurrentRequests: 1, // YouTube网页操作需要更严格的并发控制
      userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      proxies: [],
      maxRetries: 3,
      retryBaseDelay: 3000,
      enableProxyRotation: config.useProxy || false,
      enableUserAgentRotation: true,
      requestTimeout: 45000 // YouTube页面加载较慢
    };
  }

  constructor(config: YouTubeWebScraperConfig) {
    this.config = {
      ...config,
      headless: config.headless !== false,
      timeout: config.timeout || 45000,
      enableJavaScript: config.enableJavaScript !== false,
      viewport: config.viewport || { width: 1280, height: 800 }
    };

    this.logger = createCollectorLogger('youtube-web-scraper');
    this.errorHandler = new CollectionErrorHandler();

    // 初始化反爬系统
    const antiCrawlingConfig = this.convertToAntiCrawlingConfig(config);
    this.antiCrawlingSystem = new RequestDelayManager(antiCrawlingConfig, {});
  }

  /**
   * 初始化网页爬虫
   */
  async initialize(): Promise<void> {
    this.logger.info('初始化YouTube网页爬虫...');

    try {
      await this.antiCrawlingSystem.initialize();
      await this.launchBrowser();

      this.logger.info('YouTube网页爬虫初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化', platform: 'youtube' });
      throw error;
    }
  }

  /**
   * 启动浏览器
   */
  private async launchBrowser(): Promise<void> {
    try {
      // 动态导入MCP Browser
      const { McpBrowser } = await import('hyper-mcp-browser');

      // 创建浏览器实例
      this.browser = new McpBrowser({
        headless: this.config.headless,
        timeout: this.config.timeout,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--window-size=1280,800',
          '--lang=en-US' // 设置语言
        ]
      });

      // 启动浏览器
      await this.browser.launch();

      // 创建新页面
      this.page = await this.browser.newPage();

      // 设置视口
      await this.page.setViewport(this.config.viewport);

      // 设置用户代理
      if (this.config.userAgent) {
        await this.page.setUserAgent(this.config.userAgent);
      } else {
        // 使用反爬系统的用户代理
        const userAgent = await this.antiCrawlingSystem.getUserAgent();
        await this.page.setUserAgent(userAgent);
      }

      // 设置语言偏好
      await this.page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'language', {
          get: function() { return 'en-US'; }
        });
        Object.defineProperty(navigator, 'languages', {
          get: function() { return ['en-US', 'en']; }
        });
      });

      // 启用JavaScript（如果需要）
      if (this.config.enableJavaScript) {
        await this.page.setJavaScriptEnabled(true);
      }

      this.logger.info('浏览器启动成功');
    } catch (error) {
      throw new CollectionError(
        `启动浏览器失败: ${(error as Error).message}`,
        CollectionErrorType.NETWORK_ERROR,
        'youtube'
      );
    }
  }

  /**
   * 测试网页采集可用性
   */
  async testAvailability(): Promise<boolean> {
    this.logger.info('测试YouTube网页采集可用性...');

    try {
      // 尝试访问YouTube首页
      const success = await this.navigateToUrl('https://www.youtube.com', 15000);

      if (success) {
        // 检查页面是否加载成功
        const pageTitle = await this.page.title();
        this.logger.info(`YouTube页面标题: ${pageTitle}`);

        // 检查是否有反爬检测
        const hasAntiCrawling = await this.detectAntiCrawling();
        if (hasAntiCrawling) {
          this.logger.warn('检测到YouTube反爬措施');
          return false;
        }

        // 检查是否有年龄验证
        const hasAgeVerification = await this.page.evaluate(() => {
          return document.querySelector('*[aria-label*=\"age\"], *[aria-label*=\"年龄\"], #contentWrapper') !== null;
        });

        if (hasAgeVerification) {
          this.logger.warn('检测到年龄验证页面');
          return false;
        }

        return true;
      }

      return false;
    } catch (error) {
      this.logger.warn(`YouTube网页采集可用性测试失败: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 导航到URL
   */
  private async navigateToUrl(url: string, timeout?: number): Promise<boolean> {
    try {
      // 应用反爬延迟
      await this.antiCrawlingSystem.applyDelay();

      await this.page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: timeout || this.config.timeout
      });

      // 等待页面完全加载
      await this.page.waitForTimeout(2000);

      return true;
    } catch (error) {
      this.logger.warn(`导航到 ${url} 失败: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 检测反爬措施
   */
  private async detectAntiCrawling(): Promise<boolean> {
    try {
      // 检查是否有验证码
      const hasCaptcha = await this.page.evaluate(() => {
        return document.querySelector('input[name=\"captcha\"], #captcha, .captcha, iframe[src*=\"captcha\"]') !== null;
      });

      // 检查是否有访问限制提示
      const hasAccessRestriction = await this.page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('rate limit') ||
               text.includes('too many requests') ||
               text.includes('access denied') ||
               text.includes('please try again later') ||
               text.includes('验证码') ||
               text.includes('请稍后再试');
      });

      // 检查是否有机器人检测
      const hasBotDetection = await this.page.evaluate(() => {
        return document.querySelector('[aria-label*=\"bot\"], [aria-label*=\"robot\"], [aria-label*=\"机器人\"]') !== null;
      });

      return hasCaptcha || hasAccessRestriction || hasBotDetection;
    } catch (error) {
      this.logger.warn(`检测反爬措施失败: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 采集趋势视频
   */
  async getTrendingVideos(maxResults: number = 10): Promise<TrendingVideo[]> {
    this.logger.info('开始采集YouTube趋势视频...');

    try {
      // 导航到YouTube趋势页面
      const success = await this.navigateToUrl('https://www.youtube.com/feed/trending');
      if (!success) {
        throw new CollectionError(
          CollectionErrorType.NETWORK_ERROR,
          '无法访问YouTube趋势页面',
          'youtube'
        );
      }

      // 等待趋势内容加载
      await this.page.waitForTimeout(3000);

      // 滚动加载更多视频
      await this.scrollForMoreVideos(maxResults);

      // 提取趋势视频
      const trendingVideos = await this.extractTrendingVideos(maxResults);

      this.logger.info(`采集到 ${trendingVideos.length} 个趋势视频`);
      return trendingVideos;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '采集趋势视频', platform: 'youtube' });
      throw error;
    }
  }

  /**
   * 滚动加载更多视频
   */
  private async scrollForMoreVideos(maxResults: number): Promise<void> {
    const scrollAttempts = Math.ceil(maxResults / 5); // 每滚动一次大约加载5个视频

    for (let i = 0; i < scrollAttempts; i++) {
      // 应用反爬延迟
      await this.antiCrawlingSystem.applyDelay();

      // 滚动页面
      await this.page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2);
      });

      // 等待新内容加载
      await this.page.waitForTimeout(2000);

      // 检查是否已加载足够的结果
      const currentCount = await this.page.evaluate(() => {
        return document.querySelectorAll('ytd-video-renderer, ytd-rich-item-renderer').length;
      });

      if (currentCount >= maxResults) {
        break;
      }
    }
  }

  /**
   * 提取趋势视频
   */
  private async extractTrendingVideos(maxResults: number): Promise<TrendingVideo[]> {
    try {
      return await this.page.evaluate((maxResults: number) => {
        const videos: TrendingVideo[] = [];

        // 尝试多种选择器来定位视频元素
        const videoSelectors = [
          'ytd-video-renderer',
          'ytd-rich-item-renderer',
          'div#contents ytd-video-renderer',
          '#contents ytd-video-renderer'
        ];

        let videoElements: Element[] = [];

        for (const selector of videoSelectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            videoElements = Array.from(elements);
            break;
          }
        }

        for (let i = 0; i < Math.min(videoElements.length, maxResults); i++) {
          const element = videoElements[i];

          try {
            // 提取视频ID
            const videoLink = element.querySelector('a#thumbnail, a[href*=\"/watch?\"]');
            const videoHref = videoLink?.getAttribute('href') || '';
            const videoIdMatch = videoHref.match(/v=([^&]+)/);
            const videoId = videoIdMatch ? videoIdMatch[1] : `video_${i}`;

            // 提取视频标题
            const titleElement = element.querySelector('#video-title, h3');
            const title = titleElement?.textContent?.trim() || 'Unknown Title';

            // 提取频道信息
            const channelElement = element.querySelector('#channel-name a, ytd-channel-name a');
            const channelName = channelElement?.textContent?.trim() || 'Unknown Channel';
            const channelHref = channelElement?.getAttribute('href') || '';
            const channelUrl = channelHref ? `https://www.youtube.com${channelHref}` : '';

            // 提取观看次数和发布时间
            const metadataElement = element.querySelector('#metadata-line span, .ytd-video-meta-block');
            const metadataText = metadataElement?.textContent || '';

            let viewCount = 0;
            let publishedTime = '';

            // 解析观看次数（如"100万次观看"）
            const viewMatch = metadataText.match(/([\d.,]+)\s*(万|亿|k|K|m|M)?\s*次?观看/);
            if (viewMatch) {
              let count = parseFloat(viewMatch[1].replace(/,/g, ''));
              if (viewMatch[2]) {
                const multiplier = viewMatch[2];
                if (multiplier === '万' || multiplier === 'k' || multiplier === 'K') {
                  count *= 10000;
                } else if (multiplier === '亿' || multiplier === 'm' || multiplier === 'M') {
                  count *= 100000000;
                }
              }
              viewCount = Math.round(count);
            }

            // 解析发布时间（如"2小时前"）
            const timeMatch = metadataText.match(/(\d+)\s*(秒|分钟|小时|天|周|月|年)前/);
            if (timeMatch) {
              const num = parseInt(timeMatch[1]);
              const unit = timeMatch[2];
              publishedTime = `${num}${unit}前`;
            }

            // 提取视频时长
            let duration = 0;
            const durationElement = element.querySelector('span#text, .ytd-thumbnail-overlay-time-status-renderer');
            if (durationElement) {
              const durationText = durationElement.textContent?.trim() || '';
              const durationParts = durationText.split(':').reverse();
              duration = durationParts.reduce((total, part, index) => {
                return total + parseInt(part) * Math.pow(60, index);
              }, 0);
            }

            // 提取缩略图
            const thumbnailElement = element.querySelector('img, yt-image img');
            const thumbnailUrl = thumbnailElement?.getAttribute('src') || '';

            // 构建视频URL
            const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;

            videos.push({
              id: videoId,
              title,
              url: videoUrl,
              channelName,
              channelUrl,
              viewCount,
              publishedTime: publishedTime || '刚刚',
              duration,
              thumbnailUrl
            });
          } catch (error) {
            console.warn(`提取视频失败: ${error}`);
          }
        }

        return videos;
      }, maxResults);
    } catch (error) {
      this.logger.warn(`提取趋势视频失败: ${(error as Error).message}`);
      return [];
    }
  }

  /**
   * 获取视频详情
   */
  async getVideoDetails(videoId: string): Promise<VideoData> {
    this.logger.info(`获取视频详情: ${videoId}`);

    try {
      // 导航到视频页面
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const success = await this.navigateToUrl(videoUrl);
      if (!success) {
        throw new CollectionError(
          CollectionErrorType.NETWORK_ERROR,
          `无法访问视频页面: ${videoId}`,
          'youtube'
        );
      }

      // 等待视频页面加载
      await this.page.waitForTimeout(3000);

      // 提取视频详情
      const videoDetails = await this.extractVideoDetails(videoId);

      this.logger.info(`视频详情提取完成: ${videoId}`);
      return videoDetails;
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '获取视频详情', platform: 'youtube' });
      throw error;
    }
  }

  /**
   * 提取视频详情
   */
  private async extractVideoDetails(videoId: string): Promise<VideoData> {
    try {
      return await this.page.evaluate((videoId: string) => {
        // 提取视频标题
        const titleElement = document.querySelector('h1.ytd-watch-metadata, h1.title');
        const title = titleElement?.textContent?.trim() || '';

        // 提取视频描述
        const descriptionElement = document.querySelector('#description, ytd-text-inline-expander');
        const description = descriptionElement?.textContent?.trim() || '';

        // 提取频道信息
        const channelElement = document.querySelector('#owner #channel-name a, ytd-video-owner-renderer a');
        const channelName = channelElement?.textContent?.trim() || '';
        const channelHref = channelElement?.getAttribute('href') || '';
        const channelId = channelHref.replace('/@', '').replace('/channel/', '') || `channel_${Date.now()}`;
        const channelUrl = channelHref ? `https://www.youtube.com${channelHref}` : '';

        // 提取频道头像
        const channelAvatarElement = document.querySelector('#owner img, ytd-video-owner-renderer img');
        const channelAvatar = channelAvatarElement?.getAttribute('src') || '';

        // 提取订阅者数量
        let subscriberCount = 0;
        const subscriberElement = document.querySelector('#owner-sub-count, ytd-video-owner-renderer #subscriber-count');
        const subscriberText = subscriberElement?.textContent || '';
        const subscriberMatch = subscriberText.match(/([\d.,]+)\s*(万|亿|k|K|m|M)?\s*订阅者?/);
        if (subscriberMatch) {
          let count = parseFloat(subscriberMatch[1].replace(/,/g, ''));
          if (subscriberMatch[2]) {
            const multiplier = subscriberMatch[2];
            if (multiplier === '万' || multiplier === 'k' || multiplier === 'K') {
              count *= 10000;
            } else if (multiplier === '亿' || multiplier === 'm' || multiplier === 'M') {
              count *= 100000000;
            }
          }
          subscriberCount = Math.round(count);
        }

        // 提取验证状态
        const verified = document.querySelector('#owner ytd-badge-supported-renderer, [aria-label*=\"验证\"], [title*=\"Verified\"]') !== null;

        // 提取统计信息
        const stats: VideoData['statistics'] = {
          viewCount: 0,
          likeCount: 0,
          commentCount: 0
        };

        // 提取观看次数
        const viewElement = document.querySelector('#info #count span, ytd-watch-info-text span');
        if (viewElement) {
          const viewText = viewElement.textContent || '';
          const viewMatch = viewText.match(/([\d.,]+)\s*(万|亿|k|K|m|M)?\s*次?观看/);
          if (viewMatch) {
            let count = parseFloat(viewMatch[1].replace(/,/g, ''));
            if (viewMatch[2]) {
              const multiplier = viewMatch[2];
              if (multiplier === '万' || multiplier === 'k' || multiplier === 'K') {
                count *= 10000;
              } else if (multiplier === '亿' || multiplier === 'm' || multiplier === 'M') {
                count *= 100000000;
              }
            }
            stats.viewCount = Math.round(count);
          }
        }

        // 提取点赞数
        const likeButton = document.querySelector('#segmented-like-button button, ytd-toggle-button-renderer[aria-label*=\"like\"]');
        if (likeButton) {
          const likeText = likeButton.getAttribute('aria-label') || '';
          const likeMatch = likeText.match(/(\d+)/);
          if (likeMatch) {
            stats.likeCount = parseInt(likeMatch[1]);
          }
        }

        // 提取评论数
        const commentElement = document.querySelector('#count yt-formatted-string, h2#count');
        if (commentElement) {
          const commentText = commentElement.textContent || '';
          const commentMatch = commentText.match(/([\d.,]+)/);
          if (commentMatch) {
            stats.commentCount = parseInt(commentMatch[1].replace(/,/g, ''));
          }
        }

        // 提取视频时长
        let duration = 0;
        const durationElement = document.querySelector('span.ytp-time-duration');
        if (durationElement) {
          const durationText = durationElement.textContent || '';
          const durationParts = durationText.split(':').reverse();
          duration = durationParts.reduce((total: number, part: string, index: number) => {
            return total + parseInt(part) * Math.pow(60, index);
          }, 0);
        }

        // 提取视频分类
        const categoryElement = document.querySelector('#info yt-formatted-string a');
        const category = categoryElement?.textContent?.trim() || '未知';

        // 提取标签
        const tags: string[] = [];
        const tagElements = document.querySelectorAll('ytd-chip-cloud-chip-renderer, .badge-style-type-simple');
        tagElements.forEach(tagElement => {
          const tagText = tagElement.textContent?.trim();
          if (tagText && tagText.length > 0) {
            tags.push(tagText);
          }
        });

        // 提取发布时间
        const publishElement = document.querySelector('#info-line span:last-child, ytd-watch-info-text span:nth-child(3)');
        const publishTimeText = publishElement?.textContent || '';
        const publishTime = new Date(); // 默认使用当前时间

        // 提取缩略图
        const thumbnailElement = document.querySelector('meta[property=\"og:image\"], link[rel=\"image_src\"]');
        const thumbnailUrl = thumbnailElement?.getAttribute('content') || thumbnailElement?.getAttribute('href') || '';

        // 构建视频数据
        return {
          id: videoId,
          title,
          description,
          channel: {
            id: channelId,
            name: channelName,
            url: channelUrl,
            avatarUrl: channelAvatar,
            subscriberCount,
            verified
          },
          publishTime,
          statistics: stats,
          metadata: {
            duration,
            category,
            tags,
            language: '未知',
            license: '标准YouTube许可',
            allowRatings: true,
            ageRestricted: false
          },
          media: [
            {
              type: 'thumbnail',
              url: thumbnailUrl,
              thumbnailUrl
            }
          ],
          url: `https://www.youtube.com/watch?v=${videoId}`
        };
      }, videoId);
    } catch (error) {
      this.logger.warn(`提取视频详情失败: ${(error as Error).message}`);

      // 返回基础视频数据
      return {
        id: videoId,
        title: '未知标题',
        description: '未知描述',
        channel: {
          id: `channel_${Date.now()}`,
          name: '未知频道',
          url: 'https://www.youtube.com',
          verified: false
        },
        publishTime: new Date(),
        statistics: {
          viewCount: 0,
          likeCount: 0,
          commentCount: 0
        },
        metadata: {
          duration: 0,
          category: '未知',
          tags: [],
          language: '未知',
          license: '未知',
          allowRatings: false,
          ageRestricted: false
        },
        media: [],
        url: `https://www.youtube.com/watch?v=${videoId}`
      };
    }
  }

  /**
   * 处理反爬检测
   */
  async handleAntiCrawlingDetection(): Promise<boolean> {
    this.logger.info('检查反爬检测...');

    try {
      const hasAntiCrawling = await this.detectAntiCrawling();

      if (hasAntiCrawling) {
        this.logger.warn('检测到反爬措施，尝试处理...');

        // 尝试刷新页面
        await this.page.reload();
        await this.page.waitForTimeout(3000);

        // 检查是否仍然有反爬措施
        const stillHasAntiCrawling = await this.detectAntiCrawling();

        if (stillHasAntiCrawling) {
          this.logger.error('无法绕过反爬措施');
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.warn(`处理反爬检测失败: ${(error as Error).message}`);
      return false;
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理YouTube网页爬虫资源...');

    try {
      // 关闭浏览器
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }

      // 清理反爬系统
      await this.antiCrawlingSystem.cleanup();

      this.logger.info('YouTube网页爬虫资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '资源清理', platform: 'youtube' });
      throw error;
    }
  }
}