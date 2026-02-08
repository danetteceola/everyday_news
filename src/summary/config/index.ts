/**
 * 总结生成模块配置管理
 */

import dotenv from 'dotenv';
import { LLMConfig, TriggerConfig, QualityControlConfig, StorageConfig } from '../types';
import { apiKeyManager } from './api-keys';
import { SkillManagerConfig } from '../skills/skill-manager';

// 加载环境变量
dotenv.config();

// 默认配置
const DEFAULT_CONFIG = {
  // LLM配置
  llm: {
    provider: 'anthropic' as const,
    model: 'claude-3-5-sonnet-20241022',
    maxTokens: parseInt(process.env.SUMMARY_MAX_TOKENS || '4000'),
    temperature: parseFloat(process.env.SUMMARY_TEMPERATURE || '0.7'),
    timeout: parseInt(process.env.SUMMARY_TIMEOUT || '30000'),
    retryCount: parseInt(process.env.SUMMARY_RETRY_COUNT || '3'),
    retryDelay: parseInt(process.env.SUMMARY_RETRY_DELAY || '1000')
  },

  // 触发配置
  triggers: {
    daily: {
      type: 'scheduled' as const,
      schedule: process.env.DAILY_SUMMARY_SCHEDULE || '0 10,22 * * *',
      enabled: true,
      priority: 1
    },
    investment: {
      type: 'scheduled' as const,
      schedule: process.env.INVESTMENT_SUMMARY_SCHEDULE || '0 18 * * *',
      enabled: true,
      priority: 2
    },
    manual: {
      type: 'manual' as const,
      enabled: true,
      priority: 3
    },
    api: {
      type: 'api' as const,
      enabled: true,
      priority: 4
    }
  },

  // 质量控制配置
  qualityControl: {
    minLength: parseInt(process.env.MIN_SUMMARY_LENGTH || '500'),
    maxLength: parseInt(process.env.MAX_SUMMARY_LENGTH || '2000'),
    requiredTopics: ['国内热点', '国际热点', '投资相关'],
    forbiddenKeywords: ['暴力', '色情', '政治敏感', '违法'],
    qualityThreshold: parseFloat(process.env.QUALITY_THRESHOLD || '0.7'),
    fallbackTemplate: process.env.FALLBACK_TEMPLATE || 'default'
  },

  // 存储配置
  storage: {
    type: 'database' as const,
    database: {
      table: process.env.SUMMARY_TABLE || 'summaries',
      connection: {
        filename: process.env.DATABASE_PATH || './data/everyday-news.db'
      }
    },
    retentionDays: parseInt(process.env.SUMMARY_RETENTION_DAYS || '30'),
    maxSummaries: parseInt(process.env.SUMMARY_MAX_COUNT || '1000')
  },

  // 缓存配置
  cache: {
    enabled: process.env.ENABLE_CACHE === 'true',
    ttl: parseInt(process.env.CACHE_TTL || '3600')
  },

  // 监控配置
  monitoring: {
    enabled: process.env.ENABLE_METRICS === 'true',
    port: parseInt(process.env.METRICS_PORT || '9090')
  },

  // 日志配置
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: process.env.LOG_FILE || './logs/summary-generation.log'
  },

  // Skill配置
  skills: {
    timeout: parseInt(process.env.SKILL_TIMEOUT || '30000'),
    maxConcurrentExecutions: parseInt(process.env.SKILL_MAX_CONCURRENT || '10'),
    enableLogging: process.env.SKILL_ENABLE_LOGGING !== 'false',
    enableMetrics: process.env.SKILL_ENABLE_METRICS !== 'false',
    retryCount: parseInt(process.env.SKILL_RETRY_COUNT || '3'),
    enabledSkills: process.env.ENABLED_SKILLS?.split(',') || ['daily-summary'],
    disabledSkills: process.env.DISABLED_SKILLS?.split(',') || []
  }
};

/**
 * 配置管理器
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: typeof DEFAULT_CONFIG;

  private constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.applyEnvironmentOverrides();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 应用环境变量覆盖
   */
  private applyEnvironmentOverrides(): void {
    // 根据可用的API密钥调整LLM提供商
    const preferredProvider = apiKeyManager.getPreferredProvider();
    if (preferredProvider) {
      this.config.llm.provider = preferredProvider;
    }

    // 根据提供商设置默认模型
    switch (this.config.llm.provider) {
      case 'anthropic':
        this.config.llm.model = 'claude-3-5-sonnet-20241022';
        break;
      case 'openai':
        this.config.llm.model = 'gpt-4-turbo-preview';
        break;
      case 'openrouter':
        this.config.llm.model = 'anthropic/claude-3-5-sonnet';
        break;
      case 'deepseek':
        this.config.llm.model = 'deepseek-chat';
        break;
    }
  }

  /**
   * 获取LLM配置
   */
  public getLLMConfig(): LLMConfig {
    const apiKey = apiKeyManager.getKey(this.config.llm.provider);

    return {
      provider: this.config.llm.provider,
      model: this.config.llm.model,
      apiKey: apiKey || '',
      maxTokens: this.config.llm.maxTokens,
      temperature: this.config.llm.temperature,
      timeout: this.config.llm.timeout,
      retryCount: this.config.llm.retryCount,
      retryDelay: this.config.llm.retryDelay
    };
  }

  /**
   * 获取触发配置
   */
  public getTriggerConfig(type: string): TriggerConfig | undefined {
    return this.config.triggers[type as keyof typeof this.config.triggers];
  }

  /**
   * 获取所有触发配置
   */
  public getAllTriggerConfigs(): Record<string, TriggerConfig> {
    return { ...this.config.triggers };
  }

  /**
   * 获取质量控制配置
   */
  public getQualityControlConfig(): QualityControlConfig {
    return { ...this.config.qualityControl };
  }

  /**
   * 获取存储配置
   */
  public getStorageConfig(): StorageConfig {
    return { ...this.config.storage };
  }

  /**
   * 获取缓存配置
   */
  public getCacheConfig(): { enabled: boolean; ttl: number } {
    return { ...this.config.cache };
  }

  /**
   * 获取监控配置
   */
  public getMonitoringConfig(): { enabled: boolean; port: number } {
    return { ...this.config.monitoring };
  }

  /**
   * 获取日志配置
   */
  public getLoggingConfig(): { level: string; file: string } {
    return { ...this.config.logging };
  }

  /**
   * 获取Skill配置
   */
  public getSkillConfig(): SkillManagerConfig {
    return { ...this.config.skills };
  }

  /**
   * 获取总结生成配置
   */
  public getSummaryConfig(): {
    llmConfig: LLMConfig;
    dailyBudget: number;
    monthlyBudget: number;
    tokenLimit: number;
    qualityThreshold: number;
  } {
    return {
      llmConfig: this.getLLMConfig(),
      dailyBudget: parseInt(process.env.DAILY_BUDGET || '100'),
      monthlyBudget: parseInt(process.env.MONTHLY_BUDGET || '3000'),
      tokenLimit: parseInt(process.env.TOKEN_LIMIT || '100000'),
      qualityThreshold: this.config.qualityControl.qualityThreshold
    };
  }

  /**
   * 更新配置
   */
  public updateConfig(updates: Partial<typeof DEFAULT_CONFIG>): void {
    this.config = {
      ...this.config,
      ...updates
    };
  }

  /**
   * 获取完整配置
   */
  public getFullConfig(): typeof DEFAULT_CONFIG {
    return { ...this.config };
  }

  /**
   * 验证配置
   */
  public validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 验证LLM配置
    if (this.config.llm.maxTokens <= 0) {
      errors.push('maxTokens must be positive');
    }
    if (this.config.llm.temperature < 0 || this.config.llm.temperature > 1) {
      errors.push('temperature must be between 0 and 1');
    }
    if (this.config.llm.timeout <= 0) {
      errors.push('timeout must be positive');
    }
    if (this.config.llm.retryCount < 0) {
      errors.push('retryCount must be non-negative');
    }

    // 验证质量控制配置
    if (this.config.qualityControl.minLength <= 0) {
      errors.push('minLength must be positive');
    }
    if (this.config.qualityControl.maxLength <= this.config.qualityControl.minLength) {
      errors.push('maxLength must be greater than minLength');
    }
    if (this.config.qualityControl.qualityThreshold < 0 || this.config.qualityControl.qualityThreshold > 1) {
      errors.push('qualityThreshold must be between 0 and 1');
    }

    // 验证存储配置
    if (this.config.storage.retentionDays <= 0) {
      errors.push('retentionDays must be positive');
    }
    if (this.config.storage.maxSummaries <= 0) {
      errors.push('maxSummaries must be positive');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取配置摘要
   */
  public getConfigSummary(): {
    llm: { provider: string; model: string };
    triggers: string[];
    qualityControl: { minLength: number; maxLength: number };
    storage: { type: string; retentionDays: number };
    cache: { enabled: boolean };
    monitoring: { enabled: boolean };
    skills: { enabledSkills: string[]; disabledSkills: string[] };
  } {
    return {
      llm: {
        provider: this.config.llm.provider,
        model: this.config.llm.model
      },
      triggers: Object.keys(this.config.triggers).filter(
        key => this.config.triggers[key as keyof typeof this.config.triggers].enabled
      ),
      qualityControl: {
        minLength: this.config.qualityControl.minLength,
        maxLength: this.config.qualityControl.maxLength
      },
      storage: {
        type: this.config.storage.type,
        retentionDays: this.config.storage.retentionDays
      },
      cache: {
        enabled: this.config.cache.enabled
      },
      monitoring: {
        enabled: this.config.monitoring.enabled
      },
      skills: {
        enabledSkills: this.config.skills.enabledSkills,
        disabledSkills: this.config.skills.disabledSkills
      }
    };
  }
}

// 导出单例实例
export const configManager = ConfigManager.getInstance();

// 辅助函数：获取配置
export function getConfig() {
  return configManager.getFullConfig();
}

// 辅助函数：获取LLM配置
export function getLLMConfig(): LLMConfig {
  return configManager.getLLMConfig();
}

// 辅助函数：验证配置
export function validateConfig(): { valid: boolean; errors: string[] } {
  return configManager.validate();
}