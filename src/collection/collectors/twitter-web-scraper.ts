/**
 * Twitter网页爬虫
 * 使用MCP Browser进行网页采集，支持趋势话题和推文采集
 */

import { CollectionLogger, createCollectorLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { AntiCrawlingSystem } from '../anti-crawling/anti-crawling-system';
import { RequestDelayManager } from '../anti-crawling/request-delay-manager';
import { TrendingTopic, TweetData } from './twitter-collector';

export interface TwitterWebScraperConfig {
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
}

export class TwitterWebScraper {
  private config: TwitterWebScraperConfig;
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
  private convertToAntiCrawlingConfig(config: TwitterWebScraperConfig): any {
    return {
      baseDelay: 2000,
      randomDelayRange: 3000,
      maxConcurrentRequests: 1,
      userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      proxies: [],
      maxRetries: 3,
      retryBaseDelay: 2000,
      enableProxyRotation: config.useProxy || false,
      enableUserAgentRotation: true,
      requestTimeout: 30000
    };
  }

  constructor(config: TwitterWebScraperConfig) {
    this.config = {
      ...config,
      headless: config.headless !== false,
      timeout: config.timeout || 30000,
      enableJavaScript: config.enableJavaScript !== false,
      viewport: config.viewport || { width: 1280, height: 800 }
    };

    this.logger = createCollectorLogger('twitter-web-scraper');
    this.errorHandler = new CollectionErrorHandler();

    // 初始化反爬系统
    const antiCrawlingConfig = this.convertToAntiCrawlingConfig(config);
    this.antiCrawlingSystem = new RequestDelayManager(antiCrawlingConfig, {});
  }

  /**
   * 初始化网页爬虫
   */
  async initialize(): Promise<void> {
    this.logger.info('初始化Twitter网页爬虫...');

    try {
      await this.antiCrawlingSystem.initialize();
      await this.launchBrowser();

      this.logger.info('Twitter网页爬虫初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error, 'Twitter网页爬虫初始化失败');
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
          '--window-size=1280,800'
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

      // 启用JavaScript（如果需要）
      if (this.config.enableJavaScript) {
        await this.page.setJavaScriptEnabled(true);
      }

      this.logger.info('浏览器启动成功');
    } catch (error) {
      throw new CollectionError(
        CollectionErrorType.BROWSER_ERROR,
        `启动浏览器失败: ${error.message}`
      );
    }
  }

  /**
   * 测试网页采集可用性
   */
  async testAvailability(): Promise<boolean> {
    this.logger.info('测试Twitter网页采集可用性...');

    try {
      // 尝试访问Twitter首页
      const success = await this.navigateToUrl('https://twitter.com', 10000);

      if (success) {
        // 检查页面是否加载成功
        const pageTitle = await this.page.title();
        this.logger.info(`Twitter页面标题: ${pageTitle}`);

        // 检查是否有反爬检测
        const hasAntiCrawling = await this.detectAntiCrawling();
        if (hasAntiCrawling) {
          this.logger.warn('检测到Twitter反爬措施');
          return false;
        }

        return true;
      }

      return false;
    } catch (error) {
      this.logger.warn(`Twitter网页采集可用性测试失败: ${error.message}`);
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
      await this.page.waitForTimeout(1000);

      return true;
    } catch (error) {
      this.logger.warn(`导航到 ${url} 失败: ${error.message}`);
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
        return document.querySelector('input[name="captcha"], #captcha, .captcha') !== null;
      });

      // 检查是否有访问限制提示
      const hasAccessRestriction = await this.page.evaluate(() => {
        const text = document.body.textContent || '';
        return text.includes('rate limit') ||
               text.includes('too many requests') ||
               text.includes('access denied') ||
               text.includes('please try again later');
      });

      return hasCaptcha || hasAccessRestriction;
    } catch (error) {
      this.logger.warn(`检测反爬措施失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 采集趋势话题
   */
  async getTrendingTopics(): Promise<TrendingTopic[]> {
    this.logger.info('开始采集Twitter趋势话题...');

    try {
      // 导航到Twitter趋势页面
      const success = await this.navigateToUrl('https://twitter.com/explore/tabs/trending');
      if (!success) {
        throw new CollectionError(
          CollectionErrorType.NETWORK_ERROR,
          '无法访问Twitter趋势页面'
        );
      }

      // 等待趋势内容加载
      await this.page.waitForTimeout(2000);

      // 提取趋势话题
      const trendingTopics = await this.extractTrendingTopics();

      this.logger.info(`采集到 ${trendingTopics.length} 个趋势话题`);
      return trendingTopics;
    } catch (error) {
      this.errorHandler.handleError(error, '采集趋势话题失败');
      throw error;
    }
  }

  /**
   * 提取趋势话题
   */
  private async extractTrendingTopics(): Promise<TrendingTopic[]> {
    try {
      return await this.page.evaluate(() => {
        const topics: TrendingTopic[] = [];

        // 尝试多种选择器来定位趋势话题
        const selectors = [
          'div[data-testid="trend"]',
          'div[role="listitem"] div[dir="ltr"]',
          'section[aria-labelledby*="trend"] div[dir="ltr"]',
          '.css-1dbjc4n.r-1habvwh.r-18u37iz.r-1w6e6rj'
        ];

        for (const selector of selectors) {
          const elements = document.querySelectorAll(selector);
          if (elements.length > 0) {
            elements.forEach(element => {
              const text = element.textContent || '';
              if (text.trim() && !text.includes('·') && text.length < 100) {
                // 提取话题名称
                const name = text.trim();

                // 尝试提取推文数量
                let tweetVolume = 0;
                const volumeMatch = text.match(/(\d+(?:,\d+)*)\s*推文/);
                if (volumeMatch) {
                  tweetVolume = parseInt(volumeMatch[1].replace(/,/g, ''));
                }

                // 构建URL
                const url = `https://twitter.com/search?q=${encodeURIComponent(name)}&src=trend_click`;

                topics.push({
                  name,
                  url,
                  tweetVolume
                });
              }
            });
            break;
          }
        }

        return topics;
      });
    } catch (error) {
      this.logger.warn(`提取趋势话题失败: ${error.message}`);
      return [];
    }
  }

  /**
   * 搜索推文
   */
  async searchTweets(query: string, maxResults: number = 10): Promise<TweetData[]> {
    this.logger.info(`搜索推文: ${query}`);

    try {
      // 构建搜索URL
      const searchUrl = `https://twitter.com/search?q=${encodeURIComponent(query)}&src=typed_query&f=live`;

      // 导航到搜索页面
      const success = await this.navigateToUrl(searchUrl);
      if (!success) {
        throw new CollectionError(
          CollectionErrorType.NETWORK_ERROR,
          '无法访问Twitter搜索页面'
        );
      }

      // 等待搜索结果加载
      await this.page.waitForTimeout(3000);

      // 滚动加载更多结果
      await this.scrollForMoreResults(maxResults);

      // 提取推文
      const tweets = await this.extractTweets(maxResults);

      this.logger.info(`采集到 ${tweets.length} 条推文`);
      return tweets;
    } catch (error) {
      this.errorHandler.handleError(error, '搜索推文失败');
      throw error;
    }
  }

  /**
   * 滚动加载更多结果
   */
  private async scrollForMoreResults(maxResults: number): Promise<void> {
    const scrollAttempts = Math.ceil(maxResults / 5); // 每滚动一次大约加载5条推文

    for (let i = 0; i < scrollAttempts; i++) {
      // 应用反爬延迟
      await this.antiCrawlingSystem.applyDelay();

      // 滚动页面
      await this.page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2);
      });

      // 等待新内容加载
      await this.page.waitForTimeout(1000);

      // 检查是否已加载足够的结果
      const currentCount = await this.page.evaluate(() => {
        return document.querySelectorAll('article[data-testid="tweet"]').length;
      });

      if (currentCount >= maxResults) {
        break;
      }
    }
  }

  /**
   * 提取推文
   */
  private async extractTweets(maxResults: number): Promise<TweetData[]> {
    try {
      return await this.page.evaluate((maxResults: number) => {
        const tweets: TweetData[] = [];
        const tweetElements = document.querySelectorAll('article[data-testid="tweet"]');

        for (let i = 0; i < Math.min(tweetElements.length, maxResults); i++) {
          const element = tweetElements[i];

          try {
            // 提取推文ID
            const tweetId = element.getAttribute('data-tweet-id') ||
                           element.querySelector('a[href*="/status/"]')?.getAttribute('href')?.split('/').pop() ||
                           `tweet_${i}`;

            // 提取作者信息
            const authorElement = element.querySelector('a[role="link"][tabindex="-1"]');
            const authorName = authorElement?.querySelector('div[dir="ltr"] span')?.textContent || 'Unknown';
            const authorScreenName = authorElement?.getAttribute('href')?.replace('/', '') || 'unknown';
            const authorAvatar = element.querySelector('img[alt*="profile"]')?.getAttribute('src') || '';

            // 提取推文内容
            const contentElement = element.querySelector('div[data-testid="tweetText"]');
            const content = contentElement?.textContent || '';

            // 提取发布时间
            const timeElement = element.querySelector('time');
            const publishTime = timeElement ? new Date(timeElement.getAttribute('datetime') || Date.now()) : new Date();

            // 提取互动数据
            const engagement = {
              likeCount: 0,
              retweetCount: 0,
              replyCount: 0,
              viewCount: 0
            };

            // 查找互动按钮
            const buttons = element.querySelectorAll('[data-testid]');
            buttons.forEach(button => {
              const testId = button.getAttribute('data-testid');
              const text = button.textContent || '';

              if (testId?.includes('like')) {
                const match = text.match(/(\d+(?:,\d+)*)/);
                if (match) {
                  engagement.likeCount = parseInt(match[1].replace(/,/g, '')) || 0;
                }
              } else if (testId?.includes('retweet')) {
                const match = text.match(/(\d+(?:,\d+)*)/);
                if (match) {
                  engagement.retweetCount = parseInt(match[1].replace(/,/g, '')) || 0;
                }
              } else if (testId?.includes('reply')) {
                const match = text.match(/(\d+(?:,\d+)*)/);
                if (match) {
                  engagement.replyCount = parseInt(match[1].replace(/,/g, '')) || 0;
                }
              } else if (testId?.includes('view')) {
                const match = text.match(/(\d+(?:,\d+)*)/);
                if (match) {
                  engagement.viewCount = parseInt(match[1].replace(/,/g, '')) || 0;
                }
              }
            });

            // 提取媒体内容
            const media: TweetData['media'] = [];
            const mediaElements = element.querySelectorAll('img[alt*="Image"], video');
            mediaElements.forEach(mediaElement => {
              if (mediaElement.tagName === 'IMG') {
                const src = mediaElement.getAttribute('src') || '';
                if (src && !src.includes('profile_images')) {
                  media.push({
                    type: 'image',
                    url: src,
                    thumbnailUrl: src
                  });
                }
              } else if (mediaElement.tagName === 'VIDEO') {
                const src = mediaElement.getAttribute('src') || '';
                const poster = mediaElement.getAttribute('poster') || '';
                if (src) {
                  media.push({
                    type: 'video',
                    url: src,
                    thumbnailUrl: poster || src
                  });
                }
              }
            });

            // 构建推文URL
            const tweetUrl = `https://twitter.com/${authorScreenName}/status/${tweetId}`;

            tweets.push({
              id: tweetId,
              author: {
                id: authorScreenName,
                name: authorName,
                screenName: authorScreenName,
                avatarUrl: authorAvatar,
                verified: element.querySelector('[data-testid="icon-verified"]') !== null,
                followerCount: 0 // 网页版难以获取粉丝数
              },
              content,
              publishTime,
              engagement,
              media,
              url: tweetUrl
            });
          } catch (error) {
            console.warn(`提取推文失败: ${error}`);
          }
        }

        return tweets;
      }, maxResults);
    } catch (error) {
      this.logger.warn(`提取推文失败: ${error.message}`);
      return [];
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
        await this.page.waitForTimeout(2000);

        // 检查是否仍然有反爬措施
        const stillHasAntiCrawling = await this.detectAntiCrawling();

        if (stillHasAntiCrawling) {
          this.logger.error('无法绕过反爬措施');
          return false;
        }
      }

      return true;
    } catch (error) {
      this.logger.warn(`处理反爬检测失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理Twitter网页爬虫资源...');

    try {
      // 关闭浏览器
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }

      // 清理反爬系统
      await this.antiCrawlingSystem.cleanup();

      this.logger.info('Twitter网页爬虫资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error, 'Twitter网页爬虫资源清理失败');
      throw error;
    }
  }
}