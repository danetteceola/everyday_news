/**
 * 请求延迟和频率控制管理器
 * 扩展反爬系统基类，专门处理请求延迟和频率控制
 */

import { AntiCrawlingSystem, RequestOptions, AntiCrawlingConfig } from './anti-crawling-system';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';

export interface DelayStrategy {
  /** 策略名称 */
  name: string;

  /** 计算延迟的函数 */
  calculateDelay: (attempt: number, baseDelay: number, randomRange: number) => number;

  /** 是否启用随机延迟 */
  enableRandomDelay: boolean;
}

export interface FrequencyControlConfig {
  /** 时间窗口（毫秒） */
  timeWindow: number;

  /** 时间窗口内最大请求数 */
  maxRequestsPerWindow: number;

  /** 是否启用滑动窗口 */
  enableSlidingWindow: boolean;

  /** 请求历史记录保留时间（毫秒） */
  historyRetentionTime: number;
}

export class RequestDelayManager extends AntiCrawlingSystem {
  private axiosInstance: AxiosInstance;
  private requestHistory: Array<{ timestamp: Date; url: string }>;
  private frequencyConfig: FrequencyControlConfig;
  private delayStrategies: Map<string, DelayStrategy>;
  private currentDelayStrategy: string;
  private cleanupIntervalId: NodeJS.Timeout | null = null;

  constructor(
    config: Partial<AntiCrawlingConfig> = {},
    frequencyConfig: Partial<FrequencyControlConfig> = {}
  ) {
    super(config);

    this.frequencyConfig = {
      timeWindow: 60000, // 1分钟
      maxRequestsPerWindow: 30,
      enableSlidingWindow: true,
      historyRetentionTime: 300000, // 5分钟
      ...frequencyConfig
    };

    this.requestHistory = [];
    this.delayStrategies = new Map();
    this.currentDelayStrategy = 'default';

    // 初始化axios实例
    this.axiosInstance = axios.create({
      timeout: this.config.requestTimeout,
      headers: {
        'User-Agent': this.getNextUserAgent()
      }
    });

    // 设置拦截器
    this.setupInterceptors();

    // 注册默认延迟策略
    this.registerDefaultStrategies();

    // 启动历史记录清理定时器
    this.startHistoryCleanup();
  }

  /**
   * 设置axios拦截器
   */
  private setupInterceptors(): void {
    // 请求拦截器
    this.axiosInstance.interceptors.request.use(
      (config) => {
        // 添加用户代理
        if (!config.headers['User-Agent']) {
          config.headers['User-Agent'] = this.getNextUserAgent();
        }

        // 检查频率限制
        this.checkFrequencyLimit(config.url || '');

        this.logger.debug(`Preparing request: ${config.url}`, {
          method: config.method,
          headers: config.headers
        }, 'setupInterceptors');

        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error', error, undefined, 'setupInterceptors');
        return Promise.reject(error);
      }
    );

    // 响应拦截器
    this.axiosInstance.interceptors.response.use(
      (response) => {
        this.logger.debug(`Request successful: ${response.config.url}`, {
          status: response.status,
          statusText: response.statusText
        }, 'setupInterceptors');

        // 记录请求历史
        this.recordRequest(response.config.url || '');

        return response;
      },
      (error) => {
        this.logger.error('Request failed', error, {
          url: error.config?.url,
          method: error.config?.method
        }, 'setupInterceptors');

        // 记录请求历史（即使失败）
        if (error.config?.url) {
          this.recordRequest(error.config.url);
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * 注册默认延迟策略
   */
  private registerDefaultStrategies(): void {
    // 默认策略：固定基础延迟 + 随机延迟
    this.registerDelayStrategy('default', {
      name: 'default',
      calculateDelay: (_attempt, baseDelay, randomRange) => {
        return baseDelay + (Math.random() * randomRange);
      },
      enableRandomDelay: true
    });

    // 线性递增策略：每次重试增加延迟
    this.registerDelayStrategy('linear', {
      name: 'linear',
      calculateDelay: (attempt, baseDelay, randomRange) => {
        const multiplier = attempt;
        return (baseDelay * multiplier) + (Math.random() * randomRange);
      },
      enableRandomDelay: true
    });

    // 指数退避策略：用于重试
    this.registerDelayStrategy('exponential', {
      name: 'exponential',
      calculateDelay: (attempt, baseDelay, randomRange) => {
        const multiplier = Math.pow(2, attempt - 1);
        return (baseDelay * multiplier) + (Math.random() * randomRange);
      },
      enableRandomDelay: true
    });

    // 无延迟策略（用于测试）
    this.registerDelayStrategy('none', {
      name: 'none',
      calculateDelay: () => 0,
      enableRandomDelay: false
    });
  }

  /**
   * 注册延迟策略
   */
  registerDelayStrategy(name: string, strategy: DelayStrategy): void {
    this.delayStrategies.set(name, strategy);
    this.logger.info(`Delay strategy registered: ${name}`, {
      strategyName: strategy.name
    });
  }

  /**
   * 设置当前延迟策略
   */
  setDelayStrategy(name: string): boolean {
    if (this.delayStrategies.has(name)) {
      this.currentDelayStrategy = name;
      this.logger.info(`Delay strategy set to: ${name}`);
      return true;
    }

    this.logger.warn(`Delay strategy not found: ${name}`, {
      availableStrategies: Array.from(this.delayStrategies.keys())
    });
    return false;
  }

  /**
   * 获取当前延迟策略
   */
  getCurrentDelayStrategy(): DelayStrategy | undefined {
    return this.delayStrategies.get(this.currentDelayStrategy);
  }

  /**
   * 计算延迟（使用当前策略）
   */
  protected calculateDelay(): number {
    const strategy = this.getCurrentDelayStrategy();
    if (!strategy) {
      return super.calculateDelay();
    }

    const baseDelay = this.config.baseDelay;
    const randomRange = strategy.enableRandomDelay ? this.config.randomDelayRange : 0;

    return strategy.calculateDelay(1, baseDelay, randomRange);
  }

  /**
   * 计算重试延迟
   */
  calculateRetryDelay(attempt: number): number {
    const strategy = this.delayStrategies.get('exponential') || this.getCurrentDelayStrategy();
    if (!strategy) {
      return this.config.retryBaseDelay * Math.pow(2, attempt - 1);
    }

    const baseDelay = this.config.retryBaseDelay;
    const randomRange = strategy.enableRandomDelay ? this.config.randomDelayRange : 0;

    return strategy.calculateDelay(attempt, baseDelay, randomRange);
  }

  /**
   * 检查频率限制
   */
  private checkFrequencyLimit(url: string): void {
    this.cleanupOldHistory();

    const now = new Date();
    const windowStart = new Date(now.getTime() - this.frequencyConfig.timeWindow);

    // 计算时间窗口内的请求数
    const requestsInWindow = this.requestHistory.filter(
      record => record.timestamp >= windowStart
    ).length;

    if (requestsInWindow >= this.frequencyConfig.maxRequestsPerWindow) {
      const oldestInWindow = this.requestHistory
        .filter(record => record.timestamp >= windowStart)
        .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())[0];

      if (oldestInWindow) {
        const waitTime = windowStart.getTime() + this.frequencyConfig.timeWindow - now.getTime();
        if (waitTime > 0) {
          this.logger.warn(`Frequency limit reached, waiting ${waitTime}ms`, {
            requestsInWindow,
            maxRequestsPerWindow: this.frequencyConfig.maxRequestsPerWindow,
            waitTime,
            url
          }, 'checkFrequencyLimit');

          throw new Error(`Frequency limit exceeded. Wait ${Math.ceil(waitTime / 1000)} seconds before next request.`);
        }
      }
    }
  }

  /**
   * 记录请求历史
   */
  private recordRequest(url: string): void {
    this.requestHistory.push({
      timestamp: new Date(),
      url
    });

    // 限制历史记录大小
    if (this.requestHistory.length > 1000) {
      this.requestHistory = this.requestHistory.slice(-500);
    }
  }

  /**
   * 清理旧的历史记录
   */
  private cleanupOldHistory(): void {
    const cutoffTime = new Date(Date.now() - this.frequencyConfig.historyRetentionTime);
    const initialLength = this.requestHistory.length;

    this.requestHistory = this.requestHistory.filter(
      record => record.timestamp >= cutoffTime
    );

    if (initialLength !== this.requestHistory.length) {
      this.logger.debug(`Cleaned up ${initialLength - this.requestHistory.length} old history records`, {
        remainingRecords: this.requestHistory.length
      }, 'cleanupOldHistory');
    }
  }

  /**
   * 启动历史记录清理定时器
   */
  private startHistoryCleanup(): void {
    this.cleanupIntervalId = setInterval(() => {
      this.cleanupOldHistory();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 获取请求历史统计
   */
  getRequestHistoryStats(): {
    totalRequests: number;
    requestsLastMinute: number;
    requestsLast5Minutes: number;
    averageRequestsPerMinute: number;
  } {
    this.cleanupOldHistory();

    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    const fiveMinutesAgo = new Date(now.getTime() - 300000);

    const requestsLastMinute = this.requestHistory.filter(
      record => record.timestamp >= oneMinuteAgo
    ).length;

    const requestsLast5Minutes = this.requestHistory.filter(
      record => record.timestamp >= fiveMinutesAgo
    ).length;

    // 计算每分钟平均请求数（基于最近5分钟）
    const fiveMinuteWindow = this.requestHistory.filter(
      record => record.timestamp >= fiveMinutesAgo
    );
    const timeSpan = fiveMinutesAgo.getTime() - (fiveMinuteWindow[0]?.timestamp.getTime() || fiveMinutesAgo.getTime());
    const averageRequestsPerMinute = timeSpan > 0
      ? (fiveMinuteWindow.length / (timeSpan / 60000))
      : 0;

    return {
      totalRequests: this.requestHistory.length,
      requestsLastMinute,
      requestsLast5Minutes,
      averageRequestsPerMinute
    };
  }

  /**
   * 实现抽象方法：执行HTTP请求
   */
  async executeRequest(options: RequestOptions): Promise<any> {
    const axiosConfig: AxiosRequestConfig = {
      url: options.url,
      method: options.method || 'GET',
      headers: {
        ...options.headers,
        'User-Agent': options.userAgent || this.getNextUserAgent()
      },
      data: options.body,
      timeout: options.timeout || this.config.requestTimeout
    };

    // 配置代理
    const proxy = options.useProxy ? this.getNextProxy() : null;
    if (proxy) {
      axiosConfig.proxy = {
        host: proxy.host,
        port: proxy.port,
        protocol: proxy.protocol
      };

      if (proxy.username && proxy.password) {
        axiosConfig.auth = {
          username: proxy.username,
          password: proxy.password
        };
      }
    }

    try {
      const response = await this.axiosInstance.request(axiosConfig);
      return response.data;
    } catch (error) {
      // 如果是代理错误，标记代理失败
      if (proxy && this.isProxyError(error)) {
        this.markProxyFailure(proxy);
      }

      throw error;
    }
  }

  /**
   * 检查是否是代理错误
   */
  private isProxyError(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    const proxyErrorIndicators = [
      'proxy',
      'connect',
      'econnrefused',
      'econnreset',
      'etimedout'
    ];

    return proxyErrorIndicators.some(indicator => errorMessage.includes(indicator));
  }

  /**
   * 获取频率控制配置
   */
  getFrequencyConfig(): FrequencyControlConfig {
    return { ...this.frequencyConfig };
  }

  /**
   * 更新频率控制配置
   */
  updateFrequencyConfig(newConfig: Partial<FrequencyControlConfig>): void {
    this.frequencyConfig = { ...this.frequencyConfig, ...newConfig };
    this.logger.info('Frequency control configuration updated', {
      changes: Object.keys(newConfig)
    });
  }

  /**
   * 重置请求历史
   */
  resetRequestHistory(): void {
    this.requestHistory = [];
    this.logger.info('Request history reset');
  }

  /**
   * 初始化（兼容接口）
   */
  async initialize(): Promise<void> {
    this.logger.debug('RequestDelayManager initialized');
  }

  /**
   * 应用延迟（兼容接口）
   */
  async applyDelay(): Promise<void> {
    await this.waitForDelay();
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理RequestDelayManager资源...');

    // 清除定时器
    if (this.cleanupIntervalId) {
      clearInterval(this.cleanupIntervalId);
      this.cleanupIntervalId = null;
    }

    // 清除请求历史
    this.requestHistory = [];

    this.logger.info('RequestDelayManager资源清理完成');
  }
}