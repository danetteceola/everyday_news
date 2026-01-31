/**
 * 反爬对策系统基类
 * 提供通用的反爬对策功能，包括延迟控制、代理管理、错误重试等
 */

import { CollectionLogger, createAntiCrawlingLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { ProxyConfig } from './proxy-manager';

export interface RequestOptions {
  /** 请求URL */
  url: string;

  /** 请求方法 */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';

  /** 请求头 */
  headers?: Record<string, string>;

  /** 请求体 */
  body?: any;

  /** 超时时间（毫秒） */
  timeout?: number;

  /** 是否使用代理 */
  useProxy?: boolean;

  /** 自定义用户代理 */
  userAgent?: string;

  /** 是否启用重试 */
  enableRetry?: boolean;

  /** 最大重试次数 */
  maxRetries?: number;
}


export interface AntiCrawlingConfig {
  /** 基础延迟（毫秒） */
  baseDelay: number;

  /** 随机延迟范围（毫秒） */
  randomDelayRange: number;

  /** 最大并发请求数 */
  maxConcurrentRequests: number;

  /** 用户代理列表 */
  userAgents: string[];

  /** 代理服务器列表 */
  proxies: ProxyConfig[];

  /** 最大重试次数 */
  maxRetries: number;

  /** 重试基础延迟（毫秒） */
  retryBaseDelay: number;

  /** 是否启用代理轮换 */
  enableProxyRotation: boolean;

  /** 是否启用用户代理轮换 */
  enableUserAgentRotation: boolean;

  /** 请求超时时间（毫秒） */
  requestTimeout: number;
}

export interface RequestStats {
  /** 总请求数 */
  totalRequests: number;

  /** 成功请求数 */
  successfulRequests: number;

  /** 失败请求数 */
  failedRequests: number;

  /** 被阻止的请求数 */
  blockedRequests: number;

  /** 平均响应时间（毫秒） */
  averageResponseTime: number;

  /** 最后请求时间 */
  lastRequestTime: Date;

  /** 当前并发请求数 */
  currentConcurrentRequests: number;
}

export abstract class AntiCrawlingSystem {
  protected config: AntiCrawlingConfig;
  protected logger: CollectionLogger;
  protected errorHandler: CollectionErrorHandler;
  protected stats: RequestStats;
  protected currentUserAgentIndex: number;
  protected currentProxyIndex: number;
  protected concurrentRequests: number;
  protected requestQueue: Array<() => Promise<any>>;

  constructor(config: Partial<AntiCrawlingConfig> = {}) {
    this.config = {
      baseDelay: 1000,
      randomDelayRange: 2000,
      maxConcurrentRequests: 3,
      userAgents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      proxies: [],
      maxRetries: 3,
      retryBaseDelay: 5000,
      enableProxyRotation: false,
      enableUserAgentRotation: true,
      requestTimeout: 30000,
      ...config
    };

    this.logger = createAntiCrawlingLogger();
    this.errorHandler = new CollectionErrorHandler(this.logger);
    this.stats = this.initializeStats();
    this.currentUserAgentIndex = 0;
    this.currentProxyIndex = 0;
    this.concurrentRequests = 0;
    this.requestQueue = [];
  }

  /**
   * 初始化统计数据
   */
  private initializeStats(): RequestStats {
    return {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      blockedRequests: 0,
      averageResponseTime: 0,
      lastRequestTime: new Date(),
      currentConcurrentRequests: 0
    };
  }

  /**
   * 执行HTTP请求
   */
  abstract executeRequest(options: RequestOptions): Promise<any>;

  /**
   * 获取下一个用户代理
   */
  protected getNextUserAgent(): string {
    if (!this.config.enableUserAgentRotation || this.config.userAgents.length === 0) {
      return this.config.userAgents[0] || '';
    }

    const userAgent = this.config.userAgents[this.currentUserAgentIndex];
    this.currentUserAgentIndex = (this.currentUserAgentIndex + 1) % this.config.userAgents.length;
    return userAgent;
  }

  /**
   * 获取下一个代理
   */
  protected getNextProxy(): ProxyConfig | null {
    if (!this.config.enableProxyRotation || this.config.proxies.length === 0) {
      return null;
    }

    // 过滤可用的代理
    const availableProxies = this.config.proxies.filter(proxy => proxy.enabled !== false);
    if (availableProxies.length === 0) {
      return null;
    }

    // 使用轮询策略选择代理
    const proxy = availableProxies[this.currentProxyIndex % availableProxies.length];
    this.currentProxyIndex = (this.currentProxyIndex + 1) % availableProxies.length;

    // 更新代理最后使用时间
    proxy.lastUsed = new Date();
    return proxy;
  }

  /**
   * 标记代理失败
   */
  protected markProxyFailure(proxy: ProxyConfig): void {
    proxy.failureCount = (proxy.failureCount || 0) + 1;

    // 如果失败次数过多，暂时禁用代理
    if (proxy.failureCount >= 3) {
      proxy.enabled = false;
      this.logger.warn(`Proxy disabled due to multiple failures: ${proxy.host}:${proxy.port}`, {
        proxy: `${proxy.host}:${proxy.port}`,
        failureCount: proxy.failureCount
      });
    }
  }

  /**
   * 标记代理成功
   */
  protected markProxySuccess(proxy: ProxyConfig): void {
    proxy.failureCount = 0;
    if (proxy.enabled === false) {
      proxy.enabled = true;
      this.logger.info(`Proxy re-enabled: ${proxy.host}:${proxy.port}`);
    }
  }

  /**
   * 计算随机延迟
   */
  protected calculateDelay(): number {
    const randomFactor = Math.random() * this.config.randomDelayRange;
    return this.config.baseDelay + randomFactor;
  }

  /**
   * 等待延迟
   */
  protected async waitForDelay(): Promise<void> {
    const delay = this.calculateDelay();
    this.logger.debug(`Waiting ${delay}ms before next request`);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 检查并发限制
   */
  protected async checkConcurrentLimit(): Promise<void> {
    while (this.concurrentRequests >= this.config.maxConcurrentRequests) {
      this.logger.debug(`Concurrent limit reached (${this.concurrentRequests}/${this.config.maxConcurrentRequests}), waiting...`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * 更新统计数据
   */
  protected updateStats(success: boolean, responseTime: number, blocked: boolean = false): void {
    this.stats.totalRequests++;

    if (success) {
      this.stats.successfulRequests++;
    } else {
      this.stats.failedRequests++;
    }

    if (blocked) {
      this.stats.blockedRequests++;
    }

    // 更新平均响应时间
    const totalTime = this.stats.averageResponseTime * (this.stats.totalRequests - 1) + responseTime;
    this.stats.averageResponseTime = totalTime / this.stats.totalRequests;

    this.stats.lastRequestTime = new Date();
  }

  /**
   * 获取当前统计数据
   */
  getStats(): RequestStats {
    return { ...this.stats, currentConcurrentRequests: this.concurrentRequests };
  }

  /**
   * 重置统计数据
   */
  resetStats(): void {
    this.stats = this.initializeStats();
    this.logger.info('Request statistics reset');
  }

  /**
   * 添加代理
   */
  addProxy(proxy: ProxyConfig): void {
    this.config.proxies.push({
      enabled: true,
      failureCount: 0,
      ...proxy
    });
    this.logger.info(`Proxy added: ${proxy.host}:${proxy.port}`);
  }

  /**
   * 移除代理
   */
  removeProxy(host: string, port: number): boolean {
    const initialLength = this.config.proxies.length;
    this.config.proxies = this.config.proxies.filter(
      proxy => !(proxy.host === host && proxy.port === port)
    );

    const removed = initialLength > this.config.proxies.length;
    if (removed) {
      this.logger.info(`Proxy removed: ${host}:${port}`);
    }

    return removed;
  }

  /**
   * 启用所有代理
   */
  enableAllProxies(): void {
    this.config.proxies.forEach(proxy => {
      proxy.enabled = true;
      proxy.failureCount = 0;
    });
    this.logger.info('All proxies enabled');
  }

  /**
   * 禁用所有代理
   */
  disableAllProxies(): void {
    this.config.proxies.forEach(proxy => {
      proxy.enabled = false;
    });
    this.logger.info('All proxies disabled');
  }

  /**
   * 安全执行请求（带重试和错误处理）
   */
  async executeRequestSafely(options: RequestOptions): Promise<any> {
    const maxRetries = options.maxRetries || this.config.maxRetries;
    const enableRetry = options.enableRetry !== false;
    let lastError: Error = new Error('Unknown error');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      let startTime: number = 0;
      try {
        // 检查并发限制
        await this.checkConcurrentLimit();

        // 增加并发计数
        this.concurrentRequests++;
        startTime = Date.now();

        try {
          // 执行请求
          const result = await this.executeRequest(options);
          const responseTime = Date.now() - startTime;

          // 更新统计数据
          this.updateStats(true, responseTime);

          this.logger.debug(`Request successful: ${options.url}`, {
            attempt,
            responseTime,
            url: options.url
          }, 'executeRequestSafely');

          return result;
        } finally {
          // 减少并发计数
          this.concurrentRequests--;
        }
      } catch (error) {
        const responseTime = startTime !== 0 ? Date.now() - startTime : 0;
        lastError = error instanceof Error ? error : new Error(String(error));

        // 更新统计数据
        this.updateStats(false, responseTime);

        // 检查是否被反爬
        const isBlocked = this.isAntiCrawlingError(lastError);
        if (isBlocked) {
          this.updateStats(false, responseTime, true);
          this.logger.warn(`Request blocked by anti-crawling: ${options.url}`, {
            attempt,
            error: lastError.message,
            url: options.url
          }, 'executeRequestSafely');
        } else {
          this.logger.error(`Request failed: ${options.url}`, lastError, {
            attempt,
            responseTime,
            url: options.url
          }, 'executeRequestSafely');
        }

        if (attempt === maxRetries || !enableRetry) {
          break;
        }

        // 计算重试延迟
        const retryDelay = this.config.retryBaseDelay * Math.pow(2, attempt - 1);
        this.logger.info(`Retrying in ${retryDelay}ms (attempt ${attempt + 1}/${maxRetries})`, {
          error: lastError.message,
          retryDelay,
          nextAttempt: attempt + 1
        }, 'executeRequestSafely');

        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }

    // 所有重试都失败
    throw new CollectionError(
      `Failed to execute request after ${maxRetries} attempts: ${lastError?.message}`,
      CollectionErrorType.ANTI_CRAWLING_ERROR,
      undefined,
      'executeRequestSafely',
      { url: options.url, maxRetries }
    );
  }

  /**
   * 检查错误是否是反爬错误
   */
  protected isAntiCrawlingError(error: Error): boolean {
    const errorMessage = error.message.toLowerCase();
    const antiCrawlingIndicators = [
      'blocked',
      'forbidden',
      'access denied',
      'rate limit',
      'too many requests',
      'captcha',
      'robot',
      'bot',
      'crawler',
      'scraper'
    ];

    return antiCrawlingIndicators.some(indicator => errorMessage.includes(indicator));
  }

  /**
   * 获取配置
   */
  getConfig(): AntiCrawlingConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<AntiCrawlingConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Anti-crawling configuration updated', {
      changes: Object.keys(newConfig)
    });
  }
}