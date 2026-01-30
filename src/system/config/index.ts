/**
 * Configuration Management Module
 *
 * Provides unified configuration management for all system modules.
 * Supports environment variables, configuration files, and default values.
 */

export interface SchedulerConfig {
  maxConcurrentTasks: number;
  taskTimeout: number; // milliseconds
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  tasks: Array<{
    id: string;
    name: string;
    cronExpression: string;
    command: string;
    enabled: boolean;
  }>;
}

export interface NotificationConfig {
  telegram?: {
    botToken: string;
    chatId: string;
    enabled: boolean;
  };
  email?: {
    smtpHost: string;
    smtpPort: number;
    smtpSecure: boolean;
    smtpUser: string;
    smtpPass: string;
    recipient: string;
    enabled: boolean;
  };
  webhook?: {
    url: string;
    enabled: boolean;
  };
  defaultPriority: 'low' | 'medium' | 'high' | 'critical';
}

export interface MonitoringConfig {
  collectionInterval: number; // milliseconds
  retentionPeriod: number; // days
  alertThresholds: {
    collectionSuccessRate: number; // percentage
    dataIntegrityScore: number; // 0-100
    summaryGenerationTime: number; // milliseconds
  };
  healthCheckInterval: number; // milliseconds
}

export interface LLMConfig {
  defaultModel: string;
  defaultTemperature: number;
  cacheEnabled: boolean;
  cacheTTL: number; // milliseconds
  maxRetries: number;
  retryDelay: number; // milliseconds
  apiKey?: string;
}

export interface SystemConfig {
  scheduler: SchedulerConfig;
  notification: NotificationConfig;
  monitoring: MonitoringConfig;
  llm: LLMConfig;
  environment: 'development' | 'staging' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class ConfigManager {
  private config: SystemConfig;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || './config/system-config.yaml';
    this.config = this.loadDefaultConfig();
    this.loadConfig();
  }

  /**
   * Get the complete configuration
   */
  getConfig(): SystemConfig {
    return { ...this.config };
  }

  /**
   * Get scheduler configuration
   */
  getSchedulerConfig(): SchedulerConfig {
    return { ...this.config.scheduler };
  }

  /**
   * Get notification configuration
   */
  getNotificationConfig(): NotificationConfig {
    return { ...this.config.notification };
  }

  /**
   * Get monitoring configuration
   */
  getMonitoringConfig(): MonitoringConfig {
    return { ...this.config.monitoring };
  }

  /**
   * Get LLM configuration
   */
  getLLMConfig(): LLMConfig {
    return { ...this.config.llm };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SystemConfig>): void {
    this.config = {
      ...this.config,
      ...updates
    };
  }

  /**
   * Reload configuration from file
   */
  reload(): void {
    this.loadConfig();
  }

  /**
   * Load configuration from file and environment variables
   */
  private loadConfig(): void {
    try {
      // Try to load from YAML file
      const fileConfig = this.loadFileConfig();
      if (fileConfig) {
        this.config = { ...this.config, ...fileConfig };
      }
    } catch (error) {
      console.warn('Failed to load configuration file:', error);
    }

    // Override with environment variables
    this.applyEnvironmentOverrides();
  }

  /**
   * Load configuration from YAML file
   */
  private loadFileConfig(): Partial<SystemConfig> | null {
    // TODO: Implement YAML file loading using js-yaml
    // For now, return empty object
    return null;
  }

  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(): void {
    // Environment
    if (process.env.NODE_ENV) {
      const env = process.env.NODE_ENV as 'development' | 'staging' | 'production';
      if (['development', 'staging', 'production'].includes(env)) {
        this.config.environment = env;
      }
    }

    // Log level
    if (process.env.LOG_LEVEL) {
      const level = process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error';
      if (['debug', 'info', 'warn', 'error'].includes(level)) {
        this.config.logLevel = level;
        this.config.scheduler.logLevel = level;
      }
    }

    // Telegram configuration
    if (process.env.TELEGRAM_BOT_TOKEN) {
      this.config.notification.telegram = {
        ...this.config.notification.telegram!,
        botToken: process.env.TELEGRAM_BOT_TOKEN
      };
    }
    if (process.env.TELEGRAM_CHAT_ID) {
      this.config.notification.telegram = {
        ...this.config.notification.telegram!,
        chatId: process.env.TELEGRAM_CHAT_ID
      };
    }

    // Email configuration
    if (process.env.SMTP_HOST) {
      this.config.notification.email = {
        ...this.config.notification.email!,
        smtpHost: process.env.SMTP_HOST
      };
    }
    if (process.env.SMTP_PORT) {
      this.config.notification.email = {
        ...this.config.notification.email!,
        smtpPort: parseInt(process.env.SMTP_PORT)
      };
    }
    if (process.env.SMTP_USER) {
      this.config.notification.email = {
        ...this.config.notification.email!,
        smtpUser: process.env.SMTP_USER
      };
    }

    // LLM configuration
    if (process.env.LLM_MODEL) {
      this.config.llm.defaultModel = process.env.LLM_MODEL;
    }
    if (process.env.LLM_TEMPERATURE) {
      this.config.llm.defaultTemperature = parseFloat(process.env.LLM_TEMPERATURE);
    }
    if (process.env.LLM_API_KEY) {
      this.config.llm.apiKey = process.env.LLM_API_KEY;
    }
  }

  /**
   * Load default configuration
   */
  private loadDefaultConfig(): SystemConfig {
    return {
      scheduler: {
        maxConcurrentTasks: 5,
        taskTimeout: 300000, // 5 minutes
        logLevel: 'info',
        tasks: [
          {
            id: 'twitter-collection',
            name: 'Twitter Collection',
            cronExpression: '0,6,12,18 * * * *', // Every 6 hours
            command: 'npm run collect:twitter',
            enabled: true
          },
          {
            id: 'youtube-collection',
            name: 'YouTube Collection',
            cronExpression: '6,18 * * * *', // Every 12 hours
            command: 'npm run collect:youtube',
            enabled: true
          },
          {
            id: 'summary-generation',
            name: 'Daily Summary Generation',
            cronExpression: '2,14 * * * *', // Twice daily
            command: 'npm run generate:summary',
            enabled: true
          }
        ]
      },
      notification: {
        telegram: {
          botToken: '',
          chatId: '',
          enabled: false
        },
        email: {
          smtpHost: '',
          smtpPort: 587,
          smtpSecure: false,
          smtpUser: '',
          smtpPass: '',
          recipient: 'admin@example.com',
          enabled: false
        },
        webhook: {
          url: '',
          enabled: false
        },
        defaultPriority: 'medium'
      },
      monitoring: {
        collectionInterval: 60000, // 1 minute
        retentionPeriod: 7, // 7 days
        alertThresholds: {
          collectionSuccessRate: 80, // 80%
          dataIntegrityScore: 90, // 90%
          summaryGenerationTime: 300000 // 5 minutes
        },
        healthCheckInterval: 300000 // 5 minutes
      },
      llm: {
        defaultModel: 'claude-3-5-sonnet-20241022',
        defaultTemperature: 0.7,
        cacheEnabled: true,
        cacheTTL: 3600000, // 1 hour
        maxRetries: 3,
        retryDelay: 1000 // 1 second
      },
      environment: 'development',
      logLevel: 'info'
    };
  }

  /**
   * Validate configuration
   */
  validate(): string[] {
    const errors: string[] = [];

    // Validate scheduler tasks
    for (const task of this.config.scheduler.tasks) {
      if (!task.id || !task.name || !task.cronExpression || !task.command) {
        errors.push(`Scheduler task ${task.id} is missing required fields`);
      }
    }

    // Validate notification configurations if enabled
    if (this.config.notification.telegram?.enabled) {
      if (!this.config.notification.telegram.botToken) {
        errors.push('Telegram bot token is required when Telegram notifications are enabled');
      }
      if (!this.config.notification.telegram.chatId) {
        errors.push('Telegram chat ID is required when Telegram notifications are enabled');
      }
    }

    if (this.config.notification.email?.enabled) {
      if (!this.config.notification.email.smtpHost) {
        errors.push('SMTP host is required when email notifications are enabled');
      }
      if (!this.config.notification.email.smtpUser) {
        errors.push('SMTP user is required when email notifications are enabled');
      }
    }

    // Validate LLM configuration
    if (this.config.llm.defaultTemperature < 0 || this.config.llm.defaultTemperature > 1) {
      errors.push('LLM temperature must be between 0 and 1');
    }

    return errors;
  }
}

// Default configuration manager instance
export const configManager = new ConfigManager();