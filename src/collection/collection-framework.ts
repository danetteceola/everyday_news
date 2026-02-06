/**
 * 统一采集框架
 * 集成所有平台采集器，提供统一的采集接口
 */

import { CollectionLogger, createCollectorLogger } from './utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from './utils/error-handler';
import { PlatformType, NewsItem } from './types/news-item';
import { AntiCrawlingSystem } from './anti-crawling/anti-crawling-system';
import { DataCleaner } from './data-cleaner';
import { CollectionTaskManager } from './task-manager/collection-task-manager';
import { CollectionConfigManager } from './config-manager';
import { CompleteCollectionConfig } from '../../config/collection.config';
import { metricsCollector } from './monitoring/metrics-collector';
import { alertManager } from './monitoring/alert-manager';

// 采集器接口
export interface Collector {
  /** 采集器名称 */
  name: string;
  /** 平台类型 */
  platform: PlatformType;
  /** 初始化采集器 */
  initialize(): Promise<void>;
  /** 执行采集 */
  collect(options?: any): Promise<NewsItem[]>;
  /** 清理资源 */
  cleanup(): Promise<void>;
  /** 获取采集器状态 */
  getStatus(): {
    isInitialized: boolean;
    lastCollectionTime: Date | null;
    totalCollections: number;
    successRate: number;
  };
}

// 框架配置
export interface CollectionFrameworkConfig {
  /** 是否启用反爬系统 */
  enableAntiCrawling: boolean;
  /** 是否启用数据清洗 */
  enableDataCleaning: boolean;
  /** 是否启用任务管理 */
  enableTaskManagement: boolean;
  /** 最大并发采集数 */
  maxConcurrentCollections: number;
  /** 默认采集选项 */
  defaultCollectionOptions?: Record<string, any>;
  /** 平台特定配置 */
  platformConfigs?: Record<PlatformType, any>;
}

// 采集结果
export interface CollectionResult {
  /** 平台类型 */
  platform: PlatformType;
  /** 采集开始时间 */
  startTime: Date;
  /** 采集结束时间 */
  endTime: Date;
  /** 采集时长（毫秒） */
  duration: number;
  /** 采集到的新闻项数量 */
  itemsCollected: number;
  /** 清洗后的新闻项数量 */
  itemsAfterCleaning: number;
  /** 采集状态 */
  status: 'success' | 'partial_success' | 'failed';
  /** 错误信息 */
  error?: string;
  /** 采集的新闻项 */
  items: NewsItem[];
}

// 框架状态
export interface FrameworkStatus {
  /** 框架是否已初始化 */
  isInitialized: boolean;
  /** 注册的采集器数量 */
  totalCollectors: number;
  /** 按平台统计的采集器 */
  collectorsByPlatform: Record<PlatformType, number>;
  /** 反爬系统状态 */
  antiCrawlingStatus: {
    enabled: boolean;
    isInitialized: boolean;
  };
  /** 数据清洗状态 */
  dataCleaningStatus: {
    enabled: boolean;
    isInitialized: boolean;
  };
  /** 任务管理状态 */
  taskManagementStatus: {
    enabled: boolean;
    isInitialized: boolean;
  };
  /** 最近采集统计 */
  recentCollections: Array<{
    platform: PlatformType;
    timestamp: Date;
    itemsCollected: number;
    status: string;
  }>;
}

export class CollectionFramework {
  private config: CollectionFrameworkConfig;
  private logger: CollectionLogger;
  private errorHandler: CollectionErrorHandler;

  /** 配置管理器 */
  private configManager: CollectionConfigManager;

  /** 注册的采集器 */
  private collectors: Map<PlatformType, Collector[]> = new Map();

  /** 反爬系统 */
  private antiCrawlingSystem: AntiCrawlingSystem | null = null;

  /** 数据清洗器 */
  private dataCleaner: DataCleaner | null = null;

  /** 任务管理器 */
  private taskManager: CollectionTaskManager | null = null;

  /** 采集历史 */
  private collectionHistory: CollectionResult[] = [];

  /** 框架状态 */
  private isInitialized: boolean = false;

  constructor(config: Partial<CollectionFrameworkConfig> = {}) {
    // 初始化配置管理器
    this.configManager = new CollectionConfigManager();

    // 加载配置
    this.configManager.loadConfig().catch(error => {
      console.warn('配置加载失败，使用默认配置:', error);
    });

    // 获取配置并合并用户提供的配置
    const systemConfig = this.configManager.getConfig();
    this.config = {
      enableAntiCrawling: systemConfig.antiCrawling.enabled,
      enableDataCleaning: systemConfig.dataCleaning.enabled,
      enableTaskManagement: systemConfig.taskScheduling.enabled,
      maxConcurrentCollections: systemConfig.system.maxConcurrentCollections || 3,
      defaultCollectionOptions: this.getDefaultCollectionOptions(systemConfig),
      platformConfigs: this.getPlatformConfigs(systemConfig),
      ...config
    };

    this.logger = createCollectorLogger('collection-framework');
    this.errorHandler = new CollectionErrorHandler();

    this.logger.info('统一采集框架初始化');
  }

  /**
   * 获取默认采集选项
   */
  private getDefaultCollectionOptions(systemConfig: CompleteCollectionConfig): Record<string, any> {
    return {
      maxItems: systemConfig.system.maxItemsPerCollection || 100,
      timeout: systemConfig.system.requestTimeout || 30000,
      retryAttempts: systemConfig.system.maxRetryAttempts || 3,
      enableAntiCrawling: systemConfig.antiCrawling.enabled,
      enableDataCleaning: systemConfig.dataCleaning.enabled
    };
  }

  /**
   * 获取平台配置
   */
  private getPlatformConfigs(systemConfig: CompleteCollectionConfig): Record<PlatformType, any> {
    const platformConfigs: Record<PlatformType, any> = {} as Record<PlatformType, any>;

    for (const platformConfig of systemConfig.platforms) {
      if (platformConfig.enabled) {
        platformConfigs[platformConfig.platform as PlatformType] = {
          enabled: platformConfig.enabled,
          ...platformConfig.platformSpecific
        };
      }
    }

    return platformConfigs;
  }

  /**
   * 初始化框架
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      this.logger.warn('采集框架已经初始化');
      return;
    }

    this.logger.info('初始化统一采集框架...');

    try {
      // 初始化反爬系统
      if (this.config.enableAntiCrawling) {
        this.antiCrawlingSystem = new AntiCrawlingSystem();
        await this.antiCrawlingSystem.initialize();
        this.logger.info('反爬系统初始化完成');
      }

      // 初始化数据清洗器
      if (this.config.enableDataCleaning) {
        this.dataCleaner = new DataCleaner();
        await this.dataCleaner.initialize();
        this.logger.info('数据清洗器初始化完成');
      }

      // 初始化任务管理器
      if (this.config.enableTaskManagement) {
        const systemConfig = this.configManager.getConfig();
        this.taskManager = new CollectionTaskManager({
          autoStartScheduler: systemConfig.taskScheduling.autoStart || true,
          maxConcurrentTasks: systemConfig.system.maxConcurrentCollections || this.config.maxConcurrentCollections,
          historyRetentionDays: systemConfig.taskScheduling.historyRetentionDays || 30,
          enableDependencyCheck: systemConfig.taskScheduling.enableDependencyCheck || true,
          enablePriorityQueue: systemConfig.taskScheduling.enablePriorityQueue || true,
          taskTimeout: systemConfig.system.requestTimeout || 30000
        });
        await this.taskManager.initialize();
        this.logger.info('任务管理器初始化完成');
      }

      // 初始化所有注册的采集器
      await this.initializeAllCollectors();

      this.isInitialized = true;
      this.logger.info('统一采集框架初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化', platform: 'framework' });
      throw error;
    }
  }

  /**
   * 注册采集器
   */
  registerCollector(collector: Collector): void {
    const platform = collector.platform;
    const platformCollectors = this.collectors.get(platform) || [];
    platformCollectors.push(collector);
    this.collectors.set(platform, platformCollectors);

    this.logger.info(`注册采集器: ${collector.name} (平台: ${platform})`);

    // 如果框架已初始化，初始化采集器
    if (this.isInitialized) {
      collector.initialize().catch(error => {
        this.logger.error(`采集器初始化失败: ${collector.name}`, error as Error);
      });
    }

    // 如果启用了任务管理，注册到任务管理器
    if (this.config.enableTaskManagement && this.taskManager) {
      this.registerCollectorWithTaskManager(collector);
    }
  }

  /**
   * 注册采集器到任务管理器
   */
  private registerCollectorWithTaskManager(collector: Collector): void {
    if (!this.taskManager) {
      return;
    }

    // 获取平台配置
    const platformConfig = this.configManager.getPlatformConfig(collector.platform);

    // 获取平台默认配置
    const defaultConfig = this.taskManager.getDefaultTaskConfig(collector.platform);

    // 创建任务配置，优先使用平台配置中的调度设置
    const taskConfig = {
      id: `task_${collector.platform}_${collector.name}`,
      platform: collector.platform,
      name: `${collector.platform}采集任务: ${collector.name}`,
      description: `自动采集任务: ${collector.name}`,
      enabled: platformConfig?.enabled || true,
      schedule: platformConfig?.platformSpecific?.schedule || defaultConfig.schedule || 'hourly',
      priority: platformConfig?.platformSpecific?.priority || defaultConfig.priority || 'normal',
      maxRetries: platformConfig?.platformSpecific?.maxRetries || defaultConfig.maxRetries || 3,
      timeout: platformConfig?.platformSpecific?.timeout || defaultConfig.timeout || 300000,
      platformConfig: this.config.platformConfigs?.[collector.platform]
    };

    // 注册采集器到任务管理器
    this.taskManager.registerPlatformCollector(collector.platform, collector, taskConfig.platformConfig);

    // 添加任务
    this.taskManager.addTask(taskConfig);

    this.logger.debug(`采集器注册到任务管理器: ${collector.name}`);
  }

  /**
   * 初始化所有采集器
   */
  private async initializeAllCollectors(): Promise<void> {
    const initializationPromises: Promise<void>[] = [];

    for (const [platform, collectors] of this.collectors.entries()) {
      for (const collector of collectors) {
        initializationPromises.push(
          collector.initialize().catch(error => {
            this.logger.error(`采集器初始化失败: ${collector.name} (平台: ${platform})`, error as Error);
          })
        );
      }
    }

    await Promise.all(initializationPromises);
    this.logger.info(`所有采集器初始化完成，共 ${initializationPromises.length} 个采集器`);
  }

  /**
   * 执行采集
   */
  async collect(options: {
    platforms?: PlatformType[];
    collectorNames?: string[];
    collectionOptions?: Record<string, any>;
    enableAntiCrawling?: boolean;
    enableDataCleaning?: boolean;
  } = {}): Promise<CollectionResult[]> {
    if (!this.isInitialized) {
      throw new CollectionError('采集框架未初始化', CollectionErrorType.INITIALIZATION_ERROR, 'framework');
    }

    const {
      platforms,
      collectorNames,
      collectionOptions = {},
      enableAntiCrawling = this.config.enableAntiCrawling,
      enableDataCleaning = this.config.enableDataCleaning
    } = options;

    this.logger.info(`开始采集, 平台: ${platforms?.join(', ') || '全部'}, 采集器: ${collectorNames?.join(', ') || '全部'}`);

    // 确定要执行的采集器
    const collectorsToExecute = this.getCollectorsToExecute(platforms, collectorNames);

    if (collectorsToExecute.length === 0) {
      this.logger.warn('没有找到匹配的采集器');
      return [];
    }

    // 执行采集
    const results: CollectionResult[] = [];
    const executingPromises: Promise<CollectionResult>[] = [];

    // 控制并发数
    const maxConcurrent = this.config.maxConcurrentCollections;
    const batches: Collector[][] = [];

    for (let i = 0; i < collectorsToExecute.length; i += maxConcurrent) {
      batches.push(collectorsToExecute.slice(i, i + maxConcurrent));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(collector =>
        this.executeSingleCollection(collector, {
          ...collectionOptions,
          enableAntiCrawling,
          enableDataCleaning
        })
      );

      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          results.push(result.value);
          this.collectionHistory.push(result.value);
        } else {
          this.logger.error('采集执行失败', result.reason as Error);
        }
      }
    }

    this.logger.info(`采集完成, 共执行 ${collectorsToExecute.length} 个采集器, 成功 ${results.length} 个`);
    return results;
  }

  /**
   * 获取要执行的采集器
   */
  private getCollectorsToExecute(platforms?: PlatformType[], collectorNames?: string[]): Collector[] {
    const collectorsToExecute: Collector[] = [];

    for (const [platform, collectors] of this.collectors.entries()) {
      // 按平台过滤
      if (platforms && platforms.length > 0 && !platforms.includes(platform)) {
        continue;
      }

      for (const collector of collectors) {
        // 按采集器名称过滤
        if (collectorNames && collectorNames.length > 0 && !collectorNames.includes(collector.name)) {
          continue;
        }

        collectorsToExecute.push(collector);
      }
    }

    return collectorsToExecute;
  }

  /**
   * 执行单个采集器
   */
  private async executeSingleCollection(
    collector: Collector,
    options: {
      enableAntiCrawling: boolean;
      enableDataCleaning: boolean;
      [key: string]: any;
    }
  ): Promise<CollectionResult> {
    const startTime = new Date();
    const result: CollectionResult = {
      platform: collector.platform,
      startTime,
      endTime: startTime,
      duration: 0,
      itemsCollected: 0,
      itemsAfterCleaning: 0,
      status: 'success',
      items: []
    };

    // 记录采集开始指标
    const collectionId = metricsCollector.recordCollectionStart(collector.platform);

    try {
      this.logger.info(`开始采集: ${collector.name} (平台: ${collector.platform})`);

      // 应用反爬策略
      if (options.enableAntiCrawling && this.antiCrawlingSystem) {
        await this.antiCrawlingSystem.applyAntiCrawlingStrategy(collector.platform);
      }

      // 执行采集
      const collectedItems = await collector.collect(options);

      // 数据清洗
      let cleanedItems = collectedItems;
      if (options.enableDataCleaning && this.dataCleaner) {
        cleanedItems = await this.dataCleaner.clean(collectedItems);
      }

      result.endTime = new Date();
      result.duration = result.endTime.getTime() - startTime.getTime();
      result.itemsCollected = collectedItems.length;
      result.itemsAfterCleaning = cleanedItems.length;
      result.items = cleanedItems;

      // 记录采集成功指标
      metricsCollector.recordCollectionEnd(
        collectionId,
        collector.platform,
        true,
        result.duration,
        collectedItems.length
      );

      this.logger.info(`采集完成: ${collector.name}, 采集到 ${collectedItems.length} 个项, 清洗后 ${cleanedItems.length} 个项`);

    } catch (error) {
      result.endTime = new Date();
      result.duration = result.endTime.getTime() - startTime.getTime();
      result.status = 'failed';
      result.error = (error as Error).message;

      // 记录采集失败指标
      metricsCollector.recordCollectionEnd(
        collectionId,
        collector.platform,
        false,
        result.duration,
        0
      );

      // 记录错误指标
      metricsCollector.recordError('collection_failed', collector.platform);

      this.logger.error(`采集失败: ${collector.name}`, error as Error);
    }

    return result;
  }

  /**
   * 获取框架状态
   */
  getStatus(): FrameworkStatus {
    const collectorsByPlatform: Record<PlatformType, number> = {};
    let totalCollectors = 0;

    for (const [platform, collectors] of this.collectors.entries()) {
      collectorsByPlatform[platform] = collectors.length;
      totalCollectors += collectors.length;
    }

    // 获取最近采集记录
    const recentCollections = this.collectionHistory
      .slice(-10)
      .map(collection => ({
        platform: collection.platform,
        timestamp: collection.endTime,
        itemsCollected: collection.itemsCollected,
        status: collection.status
      }))
      .reverse();

    return {
      isInitialized: this.isInitialized,
      totalCollectors,
      collectorsByPlatform,
      antiCrawlingStatus: {
        enabled: this.config.enableAntiCrawling,
        isInitialized: !!this.antiCrawlingSystem
      },
      dataCleaningStatus: {
        enabled: this.config.enableDataCleaning,
        isInitialized: !!this.dataCleaner
      },
      taskManagementStatus: {
        enabled: this.config.enableTaskManagement,
        isInitialized: !!this.taskManager
      },
      recentCollections
    };
  }

  /**
   * 获取采集历史
   */
  getCollectionHistory(options: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
    platforms?: PlatformType[];
    status?: 'success' | 'partial_success' | 'failed';
  } = {}): CollectionResult[] {
    const {
      limit = 50,
      startDate,
      endDate,
      platforms,
      status
    } = options;

    let filteredHistory = this.collectionHistory;

    // 按时间过滤
    if (startDate) {
      filteredHistory = filteredHistory.filter(collection => collection.endTime >= startDate);
    }
    if (endDate) {
      filteredHistory = filteredHistory.filter(collection => collection.endTime <= endDate);
    }

    // 按平台过滤
    if (platforms && platforms.length > 0) {
      filteredHistory = filteredHistory.filter(collection => platforms.includes(collection.platform));
    }

    // 按状态过滤
    if (status) {
      filteredHistory = filteredHistory.filter(collection => collection.status === status);
    }

    // 按时间排序（最新的在前）
    filteredHistory.sort((a, b) => b.endTime.getTime() - a.endTime.getTime());

    // 限制数量
    return filteredHistory.slice(0, limit);
  }

  /**
   * 获取任务管理器
   */
  getTaskManager(): CollectionTaskManager | null {
    return this.taskManager;
  }

  /**
   * 获取反爬系统
   */
  getAntiCrawlingSystem(): AntiCrawlingSystem | null {
    return this.antiCrawlingSystem;
  }

  /**
   * 获取数据清洗器
   */
  getDataCleaner(): DataCleaner | null {
    return this.dataCleaner;
  }

  /**
   * 获取配置管理器
   */
  getConfigManager(): CollectionConfigManager {
    return this.configManager;
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<CollectionFrameworkConfig>): void {
    this.logger.info('更新框架配置');
    this.config = { ...this.config, ...updates };
  }

  /**
   * 重新加载配置
   */
  async reloadConfig(): Promise<void> {
    this.logger.info('重新加载配置');
    await this.configManager.loadConfig();
    const systemConfig = this.configManager.getConfig();

    // 更新框架配置
    this.config = {
      ...this.config,
      enableAntiCrawling: systemConfig.antiCrawling.enabled,
      enableDataCleaning: systemConfig.dataCleaning.enabled,
      enableTaskManagement: systemConfig.taskScheduling.enabled,
      maxConcurrentCollections: systemConfig.system.maxConcurrentCollections || 3,
      defaultCollectionOptions: this.getDefaultCollectionOptions(systemConfig),
      platformConfigs: this.getPlatformConfigs(systemConfig)
    };

    this.logger.info('配置重新加载完成');
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理采集框架资源...');

    try {
      // 清理所有采集器
      const cleanupPromises: Promise<void>[] = [];
      for (const collectors of this.collectors.values()) {
        for (const collector of collectors) {
          cleanupPromises.push(
            collector.cleanup().catch(error => {
              this.logger.warn(`采集器清理失败: ${collector.name}`, error as Error);
            })
          );
        }
      }

      await Promise.all(cleanupPromises);

      // 清理反爬系统
      if (this.antiCrawlingSystem) {
        await this.antiCrawlingSystem.cleanup();
      }

      // 清理数据清洗器
      if (this.dataCleaner) {
        await this.dataCleaner.cleanup();
      }

      // 清理任务管理器
      if (this.taskManager) {
        await this.taskManager.cleanup();
      }

      // 清空数据结构
      this.collectors.clear();
      this.collectionHistory = [];
      this.isInitialized = false;

      this.logger.info('采集框架资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '资源清理', platform: 'framework' });
      throw error;
    }
  }
}

// 默认框架实例
export const collectionFramework = new CollectionFramework();