/**
 * 基础采集器类
 * 提供反爬系统集成和通用功能
 */

import { CollectionLogger, createPlatformLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { AntiCrawlingSystem } from '../anti-crawling/anti-crawling-system';
import { PlatformType, NewsItem } from '../types/news-item';

// 基础采集器配置
export interface BaseCollectorConfig {
  /** 平台类型 */
  platform: PlatformType;
  /** 采集器名称 */
  name: string;
  /** 是否启用反爬系统 */
  enableAntiCrawling: boolean;
  /** 反爬系统配置 */
  antiCrawlingConfig?: any;
  /** 最大重试次数 */
  maxRetries: number;
  /** 请求超时时间（毫秒） */
  requestTimeout: number;
}

// 采集选项
export interface CollectionOptions {
  /** 是否启用反爬策略 */
  enableAntiCrawling?: boolean;
  /** 采集目标 */
  targets?: string[];
  /** 最大采集数量 */
  maxItems?: number;
  /** 其他选项 */
  [key: string]: any;
}

export abstract class BaseCollector {
  protected config: BaseCollectorConfig;
  protected logger: CollectionLogger;
  protected errorHandler: CollectionErrorHandler;
  protected antiCrawlingSystem: AntiCrawlingSystem | null = null;
  protected isInitialized: boolean = false;

  /** 采集器状态 */
  protected status = {
    isInitialized: false,
    lastCollectionTime: null as Date | null,
    totalCollections: 0,
    successfulCollections: 0,
    failedCollections: 0,
    totalItemsCollected: 0
  };

  constructor(config: BaseCollectorConfig) {
    this.config = {
      enableAntiCrawling: true,
      maxRetries: 3,
      requestTimeout: 30000,
      ...config
    };

    this.logger = createPlatformLogger(this.config.platform, this.config.name);
    this.errorHandler = new CollectionErrorHandler();

    // 初始化反爬系统
    if (this.config.enableAntiCrawling) {
      this.antiCrawlingSystem = new AntiCrawlingSystem();
    }

    this.logger.info(`采集器创建: ${this.config.name} (平台: ${this.config.platform})`);
  }

  /**
   * 初始化采集器
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.logger.info('初始化采集器...');

    try {
      // 初始化反爬系统
      if (this.antiCrawlingSystem) {
        await this.antiCrawlingSystem.initialize();
        this.logger.debug('反爬系统初始化完成');
      }

      // 调用子类的初始化逻辑
      await this.onInitialize();

      this.isInitialized = true;
      this.status.isInitialized = true;
      this.logger.info('采集器初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        operation: '初始化',
        platform: this.config.platform
      });
      throw error;
    }
  }

  /**
   * 执行采集
   */
  async collect(options: CollectionOptions = {}): Promise<NewsItem[]> {
    if (!this.isInitialized) {
      throw new CollectionError(
        '采集器未初始化',
        CollectionErrorType.INITIALIZATION_ERROR,
        this.config.platform
      );
    }

    const startTime = Date.now();
    this.logger.info('开始数据采集...');

    try {
      // 应用反爬策略
      if (options.enableAntiCrawling !== false && this.antiCrawlingSystem) {
        await this.applyAntiCrawlingStrategy();
      }

      // 执行采集
      const items = await this.executeCollection(options);

      // 更新状态
      this.status.lastCollectionTime = new Date();
      this.status.totalCollections++;
      this.status.successfulCollections++;
      this.status.totalItemsCollected += items.length;

      const elapsedTime = Date.now() - startTime;
      this.logger.info(`数据采集完成，采集到 ${items.length} 个新闻项，耗时 ${elapsedTime}ms`);

      return items;
    } catch (error) {
      // 更新失败状态
      this.status.totalCollections++;
      this.status.failedCollections++;

      this.errorHandler.handleError(error as Error, {
        operation: '采集',
        platform: this.config.platform
      });

      // 根据配置决定是否重试
      if (this.config.maxRetries > 0) {
        return await this.retryCollection(options, error as Error);
      }

      throw error;
    }
  }

  /**
   * 应用反爬策略
   */
  protected async applyAntiCrawlingStrategy(): Promise<void> {
    if (!this.antiCrawlingSystem) {
      return;
    }

    try {
      await this.antiCrawlingSystem.applyAntiCrawlingStrategy(this.config.platform);
      this.logger.debug('反爬策略应用完成');
    } catch (error) {
      this.logger.warn('反爬策略应用失败', error as Error);
      // 不阻止采集继续执行
    }
  }

  /**
   * 重试采集
   */
  private async retryCollection(options: CollectionOptions, originalError: Error): Promise<NewsItem[]> {
    for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
      this.logger.info(`采集失败，正在重试 (${attempt}/${this.config.maxRetries})...`);

      try {
        // 重试前等待一段时间（指数退避）
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        await new Promise(resolve => setTimeout(resolve, delay));

        // 应用反爬策略
        if (options.enableAntiCrawling !== false && this.antiCrawlingSystem) {
          await this.applyAntiCrawlingStrategy();
        }

        // 重新执行采集
        const items = await this.executeCollection(options);

        // 更新状态
        this.status.successfulCollections++;
        this.status.failedCollections--;
        this.status.totalItemsCollected += items.length;

        this.logger.info(`重试成功，采集到 ${items.length} 个新闻项`);
        return items;
      } catch (retryError) {
        this.logger.warn(`重试失败 (${attempt}/${this.config.maxRetries})`, retryError as Error);

        if (attempt === this.config.maxRetries) {
          this.logger.error('所有重试尝试均失败');
          throw originalError;
        }
      }
    }

    throw originalError;
  }

  /**
   * 获取采集器状态
   */
  getStatus() {
    return {
      isInitialized: this.status.isInitialized,
      lastCollectionTime: this.status.lastCollectionTime,
      totalCollections: this.status.totalCollections,
      successfulCollections: this.status.successfulCollections,
      failedCollections: this.status.failedCollections,
      successRate: this.status.totalCollections > 0
        ? (this.status.successfulCollections / this.status.totalCollections) * 100
        : 0,
      totalItemsCollected: this.status.totalItemsCollected
    };
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理采集器资源...');

    try {
      // 清理反爬系统
      if (this.antiCrawlingSystem) {
        await this.antiCrawlingSystem.cleanup();
      }

      // 调用子类的清理逻辑
      await this.onCleanup();

      this.isInitialized = false;
      this.status.isInitialized = false;

      this.logger.info('采集器资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, {
        operation: '资源清理',
        platform: this.config.platform
      });
      throw error;
    }
  }

  /**
   * 获取平台类型
   */
  get platform(): PlatformType {
    return this.config.platform;
  }

  /**
   * 获取采集器名称
   */
  get name(): string {
    return this.config.name;
  }

  /**
   * 子类需要实现的抽象方法
   */

  /**
   * 子类初始化逻辑
   */
  protected abstract onInitialize(): Promise<void>;

  /**
   * 执行采集逻辑
   */
  protected abstract executeCollection(options: CollectionOptions): Promise<NewsItem[]>;

  /**
   * 子类清理逻辑
   */
  protected abstract onCleanup(): Promise<void>;
}