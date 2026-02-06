/**
 * 数据采集系统配置文件
 * 定义采集系统的配置参数
 */

import { PlatformType } from '../src/collection/types/news-item';

// 采集系统基础配置
export interface CollectionSystemConfig {
  /** 系统版本 */
  version: string;
  /** 是否启用调试模式 */
  debug: boolean;
  /** 日志级别 */
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  /** 数据存储路径 */
  dataStoragePath: string;
  /** 临时文件路径 */
  tempStoragePath: string;
}

// 反爬系统配置
export interface AntiCrawlingConfig {
  /** 是否启用反爬系统 */
  enabled: boolean;
  /** 请求延迟配置 */
  requestDelay: {
    /** 是否启用延迟 */
    enabled: boolean;
    /** 最小延迟时间（毫秒） */
    minDelay: number;
    /** 最大延迟时间（毫秒） */
    maxDelay: number;
    /** 是否启用随机化 */
    randomize: boolean;
  };
  /** 代理配置 */
  proxy: {
    /** 是否启用代理 */
    enabled: boolean;
    /** 代理服务器列表 */
    servers: string[];
    /** 代理轮换策略 */
    rotationStrategy: 'round-robin' | 'random' | 'weighted';
  };
  /** 用户代理配置 */
  userAgent: {
    /** 是否启用用户代理轮换 */
    enabled: boolean;
    /** 用户代理列表 */
    agents: string[];
    /** 轮换频率（请求次数） */
    rotationFrequency: number;
  };
  /** 错误重试配置 */
  errorRetry: {
    /** 最大重试次数 */
    maxRetries: number;
    /** 重试延迟基数（毫秒） */
    retryDelayBase: number;
    /** 是否启用指数退避 */
    exponentialBackoff: boolean;
  };
}

// 数据清洗配置
export interface DataCleaningConfig {
  /** 是否启用数据清洗 */
  enabled: boolean;
  /** 去重配置 */
  deduplication: {
    /** 是否启用URL去重 */
    urlDeduplication: boolean;
    /** 是否启用内容相似度去重 */
    contentDeduplication: boolean;
    /** 相似度阈值 (0-1) */
    similarityThreshold: number;
    /** 是否启用跨平台去重 */
    crossPlatformDeduplication: boolean;
  };
  /** 数据验证配置 */
  validation: {
    /** 是否验证必填字段 */
    validateRequiredFields: boolean;
    /** 必填字段列表 */
    requiredFields: string[];
    /** 字段验证规则 */
    fieldRules: Record<string, any>;
  };
  /** 数据标准化配置 */
  normalization: {
    /** 是否标准化日期格式 */
    normalizeDates: boolean;
    /** 日期格式 */
    dateFormat: string;
    /** 是否标准化文本编码 */
    normalizeEncoding: boolean;
    /** 目标编码 */
    targetEncoding: string;
  };
  /** 内容处理配置 */
  contentProcessing: {
    /** 是否提取关键词 */
    extractKeywords: boolean;
    /** 关键词数量限制 */
    maxKeywords: number;
    /** 是否执行情感分析 */
    performSentimentAnalysis: boolean;
    /** 情感分析模型 */
    sentimentModel: string;
  };
}

// 任务调度配置
export interface TaskSchedulingConfig {
  /** 是否启用任务调度 */
  enabled: boolean;
  /** 最大并发任务数 */
  maxConcurrentTasks: number;
  /** 任务执行历史保留天数 */
  historyRetentionDays: number;
  /** 默认任务配置 */
  defaultTaskConfig: {
    /** 默认最大重试次数 */
    maxRetries: number;
    /** 默认超时时间（毫秒） */
    timeout: number;
    /** 默认优先级 */
    defaultPriority: 'low' | 'normal' | 'high' | 'critical';
  };
}

// 平台特定配置
export interface PlatformConfig {
  /** 平台类型 */
  platform: PlatformType;
  /** 是否启用该平台采集 */
  enabled: boolean;
  /** 采集频率 */
  collectionFrequency: string;
  /** 采集优先级 */
  priority: 'low' | 'normal' | 'high' | 'critical';
  /** 平台特定参数 */
  platformSpecific: Record<string, any>;
}

// 监控和告警配置
export interface MonitoringConfig {
  /** 是否启用监控 */
  enabled: boolean;
  /** 监控指标收集间隔（秒） */
  collectionInterval: number;
  /** 性能阈值 */
  performanceThresholds: {
    /** 最大采集时间（毫秒） */
    maxCollectionTime: number;
    /** 最小成功率 */
    minSuccessRate: number;
    /** 最大内存使用（MB） */
    maxMemoryUsage: number;
  };
  /** 告警配置 */
  alerts: {
    /** 是否启用告警 */
    enabled: boolean;
    /** 告警渠道 */
    channels: string[];
    /** 告警阈值 */
    thresholds: Record<string, number>;
  };
}

// 完整的采集系统配置
export interface CompleteCollectionConfig {
  /** 系统配置 */
  system: CollectionSystemConfig;
  /** 反爬配置 */
  antiCrawling: AntiCrawlingConfig;
  /** 数据清洗配置 */
  dataCleaning: DataCleaningConfig;
  /** 任务调度配置 */
  taskScheduling: TaskSchedulingConfig;
  /** 平台配置列表 */
  platforms: PlatformConfig[];
  /** 监控配置 */
  monitoring: MonitoringConfig;
}

// 默认配置
export const defaultConfig: CompleteCollectionConfig = {
  system: {
    version: '1.0.0',
    debug: false,
    logLevel: 'info',
    dataStoragePath: './data/collections',
    tempStoragePath: './temp'
  },
  antiCrawling: {
    enabled: true,
    requestDelay: {
      enabled: true,
      minDelay: 1000,
      maxDelay: 5000,
      randomize: true
    },
    proxy: {
      enabled: false,
      servers: [],
      rotationStrategy: 'round-robin'
    },
    userAgent: {
      enabled: true,
      agents: [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ],
      rotationFrequency: 10
    },
    errorRetry: {
      maxRetries: 3,
      retryDelayBase: 1000,
      exponentialBackoff: true
    }
  },
  dataCleaning: {
    enabled: true,
    deduplication: {
      urlDeduplication: true,
      contentDeduplication: true,
      similarityThreshold: 0.8,
      crossPlatformDeduplication: true
    },
    validation: {
      validateRequiredFields: true,
      requiredFields: ['id', 'platform', 'title', 'content', 'url', 'publishedAt'],
      fieldRules: {
        title: { minLength: 5, maxLength: 200 },
        content: { minLength: 10 },
        url: { pattern: '^https?://' }
      }
    },
    normalization: {
      normalizeDates: true,
      dateFormat: 'YYYY-MM-DDTHH:mm:ssZ',
      normalizeEncoding: true,
      targetEncoding: 'UTF-8'
    },
    contentProcessing: {
      extractKeywords: true,
      maxKeywords: 10,
      performSentimentAnalysis: true,
      sentimentModel: 'default'
    }
  },
  taskScheduling: {
    enabled: true,
    maxConcurrentTasks: 3,
    historyRetentionDays: 30,
    defaultTaskConfig: {
      maxRetries: 3,
      timeout: 300000,
      defaultPriority: 'normal'
    }
  },
  platforms: [
    {
      platform: PlatformType.TWITTER,
      enabled: true,
      collectionFrequency: 'hourly',
      priority: 'high',
      platformSpecific: {
        enableApiCollection: true,
        enableWebCollection: true,
        collectionTargets: {
          collectTrendingTopics: true,
          collectPopularTweets: true,
          maxTweetsPerCollection: 100
        }
      }
    },
    {
      platform: PlatformType.YOUTUBE,
      enabled: true,
      collectionFrequency: 'every-6-hours',
      priority: 'high',
      platformSpecific: {
        enableWebCollection: true,
        collectionTargets: {
          collectTrendingVideos: true,
          collectPopularChannels: true,
          maxVideosPerCollection: 50
        }
      }
    },
    {
      platform: PlatformType.TIKTOK,
      enabled: true,
      collectionFrequency: 'twice-daily',
      priority: 'normal',
      platformSpecific: {
        enableWebCollection: true,
        collectionTargets: {
          collectTrendingVideos: true,
          collectHashtags: true,
          maxVideosPerCollection: 30
        }
      }
    },
    {
      platform: PlatformType.WEIBO,
      enabled: true,
      collectionFrequency: 'hourly',
      priority: 'high',
      platformSpecific: {
        enableWebCollection: true,
        collectionTargets: {
          collectHotTopics: true,
          collectPopularWeibos: true,
          maxWeibosPerCollection: 100
        }
      }
    },
    {
      platform: PlatformType.DOUYIN,
      enabled: true,
      collectionFrequency: 'twice-daily',
      priority: 'normal',
      platformSpecific: {
        enableWebCollection: true,
        collectionTargets: {
          collectTrendingVideos: true,
          collectHotTopics: true,
          maxVideosPerCollection: 30
        }
      }
    }
  ],
  monitoring: {
    enabled: true,
    collectionInterval: 60,
    performanceThresholds: {
      maxCollectionTime: 300000,
      minSuccessRate: 80,
      maxMemoryUsage: 1024
    },
    alerts: {
      enabled: true,
      channels: ['console', 'log'],
      thresholds: {
        collectionFailureRate: 20,
        highMemoryUsage: 80,
        longCollectionTime: 180000
      }
    }
  }
};

// 开发环境配置
export const developmentConfig: Partial<CompleteCollectionConfig> = {
  system: {
    debug: true,
    logLevel: 'debug'
  },
  antiCrawling: {
    requestDelay: {
      minDelay: 500,
      maxDelay: 2000
    }
  },
  platforms: defaultConfig.platforms.map(platform => ({
    ...platform,
    platformSpecific: {
      ...platform.platformSpecific,
      // 开发环境中减少采集数量
      collectionTargets: {
        ...platform.platformSpecific.collectionTargets,
        maxTweetsPerCollection: platform.platform === PlatformType.TWITTER ? 20 : undefined,
        maxVideosPerCollection: [PlatformType.YOUTUBE, PlatformType.TIKTOK, PlatformType.DOUYIN].includes(platform.platform) ? 10 : undefined,
        maxWeibosPerCollection: platform.platform === PlatformType.WEIBO ? 20 : undefined
      }
    }
  }))
};

// 生产环境配置
export const productionConfig: Partial<CompleteCollectionConfig> = {
  system: {
    debug: false,
    logLevel: 'info'
  },
  monitoring: {
    alerts: {
      channels: ['console', 'log', 'email', 'slack']
    }
  }
};

// 测试环境配置
export const testConfig: Partial<CompleteCollectionConfig> = {
  system: {
    debug: true,
    logLevel: 'debug'
  },
  antiCrawling: {
    enabled: false
  },
  platforms: defaultConfig.platforms.map(platform => ({
    ...platform,
    enabled: false // 测试环境中禁用所有平台
  }))
};

// 配置工具函数
export class ConfigManager {
  private config: CompleteCollectionConfig;

  constructor(config: Partial<CompleteCollectionConfig> = {}) {
    this.config = {
      ...defaultConfig,
      ...config
    };
  }

  /**
   * 获取完整配置
   */
  getConfig(): CompleteCollectionConfig {
    return this.config;
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<CompleteCollectionConfig>): void {
    this.config = {
      ...this.config,
      ...updates
    };
  }

  /**
   * 获取平台配置
   */
  getPlatformConfig(platform: PlatformType): PlatformConfig | undefined {
    return this.config.platforms.find(p => p.platform === platform);
  }

  /**
   * 更新平台配置
   */
  updatePlatformConfig(platform: PlatformType, updates: Partial<PlatformConfig>): boolean {
    const index = this.config.platforms.findIndex(p => p.platform === platform);
    if (index === -1) {
      return false;
    }

    this.config.platforms[index] = {
      ...this.config.platforms[index],
      ...updates
    };

    return true;
  }

  /**
   * 验证配置
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证系统配置
    if (!this.config.system.dataStoragePath) {
      errors.push('数据存储路径不能为空');
    }

    // 验证平台配置
    this.config.platforms.forEach((platform, index) => {
      if (!platform.platform) {
        errors.push(`平台配置 ${index}: 平台类型不能为空`);
      }
      if (!platform.collectionFrequency) {
        errors.push(`平台配置 ${platform.platform}: 采集频率不能为空`);
      }
    });

    // 验证反爬配置
    if (this.config.antiCrawling.requestDelay.enabled) {
      if (this.config.antiCrawling.requestDelay.minDelay >= this.config.antiCrawling.requestDelay.maxDelay) {
        errors.push('反爬延迟配置: 最小延迟必须小于最大延迟');
      }
      if (this.config.antiCrawling.requestDelay.minDelay < 0) {
        errors.push('反爬延迟配置: 最小延迟不能为负数');
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 导出配置为JSON
   */
  toJSON(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 从JSON导入配置
   */
  static fromJSON(json: string): ConfigManager {
    const config = JSON.parse(json);
    return new ConfigManager(config);
  }
}

// 默认配置管理器实例
export const configManager = new ConfigManager();

// 环境特定的配置管理器
export function getConfigForEnvironment(environment: 'development' | 'production' | 'test'): ConfigManager {
  const envConfigs = {
    development: developmentConfig,
    production: productionConfig,
    test: testConfig
  };

  return new ConfigManager(envConfigs[environment]);
}