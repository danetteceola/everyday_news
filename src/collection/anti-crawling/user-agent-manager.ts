/**
 * 用户代理旋转功能
 * 提供用户代理的管理、轮换、验证和分类功能
 */

import { CollectionLogger, createAntiCrawlingLogger } from '../utils/logger';

export interface UserAgentConfig {
  /** 用户代理字符串 */
  userAgent: string;

  /** 用户代理名称 */
  name?: string;

  /** 浏览器类型 */
  browserType: 'chrome' | 'firefox' | 'safari' | 'edge' | 'opera' | 'other';

  /** 浏览器版本 */
  browserVersion?: string;

  /** 操作系统 */
  operatingSystem: 'windows' | 'macos' | 'linux' | 'android' | 'ios' | 'other';

  /** 操作系统版本 */
  osVersion?: string;

  /** 设备类型 */
  deviceType: 'desktop' | 'mobile' | 'tablet' | 'other';

  /** 是否启用 */
  enabled?: boolean;

  /** 使用次数 */
  usageCount?: number;

  /** 最后使用时间 */
  lastUsed?: Date;

  /** 成功率 */
  successRate?: number;

  /** 权重（用于加权选择） */
  weight?: number;

  /** 标签 */
  tags?: string[];

  /** 备注 */
  notes?: string;
}

export interface UserAgentRotationStrategy {
  /** 策略名称 */
  name: string;

  /** 选择用户代理的函数 */
  selectUserAgent: (userAgents: UserAgentConfig[], context?: any) => UserAgentConfig | null;

  /** 策略描述 */
  description?: string;
}

export interface UserAgentManagerConfig {
  /** 用户代理列表 */
  userAgents: UserAgentConfig[];

  /** 是否启用用户代理轮换 */
  enableRotation: boolean;

  /** 轮换策略 */
  rotationStrategy: string;

  /** 是否验证用户代理格式 */
  validateUserAgents: boolean;

  /** 是否启用使用统计 */
  enableUsageStats: boolean;

  /** 最大用户代理池大小 */
  maxPoolSize: number;

  /** 是否自动添加常见用户代理 */
  autoAddCommonUserAgents: boolean;

  /** 用户代理分类配置 */
  categorization: {
    /** 是否按浏览器类型分类 */
    byBrowserType: boolean;
    /** 是否按操作系统分类 */
    byOperatingSystem: boolean;
    /** 是否按设备类型分类 */
    byDeviceType: boolean;
  };
}

export class UserAgentManager {
  private config: UserAgentManagerConfig;
  private logger: CollectionLogger;
  private userAgents: Map<string, UserAgentConfig>;
  private rotationStrategies: Map<string, UserAgentRotationStrategy>;
  private usageStatistics: Map<string, { successes: number; failures: number; lastUsed: Date }>;

  constructor(config: Partial<UserAgentManagerConfig> = {}) {
    this.config = {
      userAgents: [],
      enableRotation: true,
      rotationStrategy: 'roundRobin',
      validateUserAgents: true,
      enableUsageStats: true,
      maxPoolSize: 100,
      autoAddCommonUserAgents: true,
      categorization: {
        byBrowserType: true,
        byOperatingSystem: true,
        byDeviceType: true
      },
      ...config
    };

    this.logger = createAntiCrawlingLogger();
    this.userAgents = new Map();
    this.rotationStrategies = new Map();
    this.usageStatistics = new Map();

    // 初始化用户代理
    this.initializeUserAgents();

    // 自动添加常见用户代理
    if (this.config.autoAddCommonUserAgents) {
      this.addCommonUserAgents();
    }

    // 注册默认轮换策略
    this.registerDefaultStrategies();

    // 验证用户代理
    if (this.config.validateUserAgents) {
      this.validateAllUserAgents();
    }

    this.logger.info('User agent manager initialized', {
      totalUserAgents: this.userAgents.size,
      enabledUserAgents: this.getEnabledUserAgents().length,
      rotationStrategy: this.config.rotationStrategy
    });
  }

  /**
   * 初始化用户代理
   */
  private initializeUserAgents(): void {
    this.config.userAgents.forEach(ua => {
      const uaId = this.generateUserAgentId(ua);
      this.userAgents.set(uaId, {
        enabled: true,
        usageCount: 0,
        successRate: 1.0,
        weight: 1,
        tags: [],
        lastUsed: new Date(0),
        ...ua
      });
    });
  }

  /**
   * 生成用户代理ID
   */
  private generateUserAgentId(ua: UserAgentConfig): string {
    return `${ua.browserType}-${ua.operatingSystem}-${ua.deviceType}-${ua.userAgent.substring(0, 20)}`;
  }

  /**
   * 添加常见用户代理
   */
  private addCommonUserAgents(): void {
    const commonUserAgents: UserAgentConfig[] = [
      // Chrome on Windows
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        browserType: 'chrome',
        operatingSystem: 'windows',
        deviceType: 'desktop',
        browserVersion: '120.0.0.0',
        osVersion: '10.0',
        name: 'Chrome Windows Desktop'
      },
      // Chrome on macOS
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        browserType: 'chrome',
        operatingSystem: 'macos',
        deviceType: 'desktop',
        browserVersion: '120.0.0.0',
        osVersion: '10.15.7',
        name: 'Chrome macOS Desktop'
      },
      // Firefox on Windows
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        browserType: 'firefox',
        operatingSystem: 'windows',
        deviceType: 'desktop',
        browserVersion: '121.0',
        osVersion: '10.0',
        name: 'Firefox Windows Desktop'
      },
      // Safari on macOS
      {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        browserType: 'safari',
        operatingSystem: 'macos',
        deviceType: 'desktop',
        browserVersion: '17.2',
        osVersion: '10.15.7',
        name: 'Safari macOS Desktop'
      },
      // Edge on Windows
      {
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
        browserType: 'edge',
        operatingSystem: 'windows',
        deviceType: 'desktop',
        browserVersion: '120.0.0.0',
        osVersion: '10.0',
        name: 'Edge Windows Desktop'
      },
      // Chrome on Android
      {
        userAgent: 'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        browserType: 'chrome',
        operatingSystem: 'android',
        deviceType: 'mobile',
        browserVersion: '120.0.0.0',
        osVersion: '13',
        name: 'Chrome Android Mobile'
      },
      // Safari on iOS
      {
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
        browserType: 'safari',
        operatingSystem: 'ios',
        deviceType: 'mobile',
        browserVersion: '17.2',
        osVersion: '17.2',
        name: 'Safari iOS Mobile'
      },
      // Chrome on Linux
      {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        browserType: 'chrome',
        operatingSystem: 'linux',
        deviceType: 'desktop',
        browserVersion: '120.0.0.0',
        osVersion: 'x86_64',
        name: 'Chrome Linux Desktop'
      }
    ];

    commonUserAgents.forEach(ua => {
      const uaId = this.generateUserAgentId(ua);
      if (!this.userAgents.has(uaId)) {
        this.userAgents.set(uaId, {
          enabled: true,
          usageCount: 0,
          successRate: 1.0,
          weight: 1,
          tags: [],
          lastUsed: new Date(0),
          ...ua
        });
      }
    });

    this.logger.info(`Added ${commonUserAgents.length} common user agents`);
  }

  /**
   * 注册默认轮换策略
   */
  private registerDefaultStrategies(): void {
    // 轮询策略
    this.registerRotationStrategy('roundRobin', {
      name: 'roundRobin',
      description: '简单的轮询策略，按顺序选择用户代理',
      selectUserAgent: (userAgents) => {
        const enabledUserAgents = userAgents.filter(ua => ua.enabled !== false);
        if (enabledUserAgents.length === 0) {
          return null;
        }

        const sortedUserAgents = enabledUserAgents.sort((a, b) => {
          const timeA = a.lastUsed?.getTime() || 0;
          const timeB = b.lastUsed?.getTime() || 0;
          return timeA - timeB;
        });

        return sortedUserAgents[0];
      }
    });

    // 随机策略
    this.registerRotationStrategy('random', {
      name: 'random',
      description: '随机选择用户代理',
      selectUserAgent: (userAgents) => {
        const enabledUserAgents = userAgents.filter(ua => ua.enabled !== false);
        if (enabledUserAgents.length === 0) {
          return null;
        }

        const randomIndex = Math.floor(Math.random() * enabledUserAgents.length);
        return enabledUserAgents[randomIndex];
      }
    });

    // 加权随机策略
    this.registerRotationStrategy('weightedRandom', {
      name: 'weightedRandom',
      description: '根据权重进行加权随机选择',
      selectUserAgent: (userAgents) => {
        const enabledUserAgents = userAgents.filter(ua => ua.enabled !== false);
        if (enabledUserAgents.length === 0) {
          return null;
        }

        // 计算总权重
        const totalWeight = enabledUserAgents.reduce((sum, ua) => sum + (ua.weight || 1), 0);
        let random = Math.random() * totalWeight;

        for (const ua of enabledUserAgents) {
          random -= ua.weight || 1;
          if (random <= 0) {
            return ua;
          }
        }

        return enabledUserAgents[0];
      }
    });

    // 成功率优先策略
    this.registerRotationStrategy('successRate', {
      name: 'successRate',
      description: '选择成功率最高的用户代理',
      selectUserAgent: (userAgents) => {
        const enabledUserAgents = userAgents.filter(ua => ua.enabled !== false);
        if (enabledUserAgents.length === 0) {
          return null;
        }

        // 按成功率排序
        const sortedUserAgents = enabledUserAgents.sort((a, b) => {
          const rateA = a.successRate || 0;
          const rateB = b.successRate || 0;
          return rateB - rateA; // 降序
        });

        return sortedUserAgents[0];
      }
    });

    // 最少使用策略
    this.registerRotationStrategy('leastUsed', {
      name: 'leastUsed',
      description: '选择使用次数最少的用户代理',
      selectUserAgent: (userAgents) => {
        const enabledUserAgents = userAgents.filter(ua => ua.enabled !== false);
        if (enabledUserAgents.length === 0) {
          return null;
        }

        // 按使用次数排序
        const sortedUserAgents = enabledUserAgents.sort((a, b) => {
          const countA = a.usageCount || 0;
          const countB = b.usageCount || 0;
          return countA - countB;
        });

        return sortedUserAgents[0];
      }
    });

    // 智能轮换策略（考虑多个因素）
    this.registerRotationStrategy('smart', {
      name: 'smart',
      description: '智能轮换策略，综合考虑成功率、使用次数和最后使用时间',
      selectUserAgent: (userAgents) => {
        const enabledUserAgents = userAgents.filter(ua => ua.enabled !== false);
        if (enabledUserAgents.length === 0) {
          return null;
        }

        // 计算每个用户代理的得分
        const scoredUserAgents = enabledUserAgents.map(ua => {
          let score = 0;

          // 成功率权重：40%
          const successRate = ua.successRate || 0.5;
          score += successRate * 40;

          // 使用次数权重：30%（使用次数越少得分越高）
          const usageCount = ua.usageCount || 0;
          const usageScore = Math.max(0, 30 - (usageCount * 0.1));
          score += usageScore;

          // 最后使用时间权重：30%（最后使用时间越早得分越高）
          const lastUsed = ua.lastUsed?.getTime() || 0;
          const hoursSinceLastUse = (Date.now() - lastUsed) / (1000 * 60 * 60);
          const recencyScore = Math.min(30, hoursSinceLastUse * 2);
          score += recencyScore;

          return { ua, score };
        });

        // 选择得分最高的用户代理
        const sorted = scoredUserAgents.sort((a, b) => b.score - a.score);
        return sorted[0]?.ua || null;
      }
    });
  }

  /**
   * 注册轮换策略
   */
  registerRotationStrategy(name: string, strategy: UserAgentRotationStrategy): void {
    this.rotationStrategies.set(name, strategy);
    this.logger.debug(`User agent rotation strategy registered: ${name}`, {
      strategyName: strategy.name,
      description: strategy.description
    });
  }

  /**
   * 设置轮换策略
   */
  setRotationStrategy(name: string): boolean {
    if (this.rotationStrategies.has(name)) {
      this.config.rotationStrategy = name;
      this.logger.info(`User agent rotation strategy set to: ${name}`);
      return true;
    }

    this.logger.warn(`User agent rotation strategy not found: ${name}`, {
      availableStrategies: Array.from(this.rotationStrategies.keys())
    });
    return false;
  }

  /**
   * 获取下一个用户代理
   */
  getNextUserAgent(context?: any): string {
    if (!this.config.enableRotation || this.userAgents.size === 0) {
      const firstUA = Array.from(this.userAgents.values()).find(ua => ua.enabled !== false);
      return firstUA?.userAgent || '';
    }

    const strategy = this.rotationStrategies.get(this.config.rotationStrategy);
    if (!strategy) {
      this.logger.error(`Current rotation strategy not found: ${this.config.rotationStrategy}`);
      return '';
    }

    const userAgents = Array.from(this.userAgents.values());
    const selectedUA = strategy.selectUserAgent(userAgents, context);

    if (selectedUA) {
      // 更新用户代理使用信息
      this.updateUserAgentUsage(selectedUA, true);

      return selectedUA.userAgent;
    }

    return '';
  }

  /**
   * 获取下一个用户代理配置
   */
  getNextUserAgentConfig(context?: any): UserAgentConfig | null {
    if (!this.config.enableRotation || this.userAgents.size === 0) {
      const firstUA = Array.from(this.userAgents.values()).find(ua => ua.enabled !== false);
      return firstUA || null;
    }

    const strategy = this.rotationStrategies.get(this.config.rotationStrategy);
    if (!strategy) {
      this.logger.error(`Current rotation strategy not found: ${this.config.rotationStrategy}`);
      return null;
    }

    const userAgents = Array.from(this.userAgents.values());
    const selectedUA = strategy.selectUserAgent(userAgents, context);

    if (selectedUA) {
      // 更新用户代理使用信息
      this.updateUserAgentUsage(selectedUA, true);

      return selectedUA;
    }

    return null;
  }

  /**
   * 更新用户代理使用信息
   */
  updateUserAgentUsage(userAgent: UserAgentConfig, success: boolean): void {
    const uaId = this.generateUserAgentId(userAgent);
    const currentUA = this.userAgents.get(uaId);

    if (!currentUA) {
      this.logger.warn(`User agent not found for usage update: ${uaId}`);
      return;
    }

    // 更新使用次数
    currentUA.usageCount = (currentUA.usageCount || 0) + 1;
    currentUA.lastUsed = new Date();

    // 更新成功率
    if (this.config.enableUsageStats) {
      const stats = this.usageStatistics.get(uaId) || { successes: 0, failures: 0, lastUsed: new Date() };

      if (success) {
        stats.successes++;
      } else {
        stats.failures++;
      }

      stats.lastUsed = new Date();
      this.usageStatistics.set(uaId, stats);

      const totalUses = stats.successes + stats.failures;
      currentUA.successRate = totalUses > 0 ? stats.successes / totalUses : 1.0;
    }

    this.userAgents.set(uaId, currentUA);
  }

  /**
   * 获取所有用户代理
   */
  getAllUserAgents(): UserAgentConfig[] {
    return Array.from(this.userAgents.values());
  }

  /**
   * 获取启用用户代理
   */
  getEnabledUserAgents(): UserAgentConfig[] {
    return Array.from(this.userAgents.values()).filter(ua => ua.enabled !== false);
  }

  /**
   * 获取禁用用户代理
   */
  getDisabledUserAgents(): UserAgentConfig[] {
    return Array.from(this.userAgents.values()).filter(ua => ua.enabled === false);
  }

  /**
   * 添加用户代理
   */
  addUserAgent(userAgent: UserAgentConfig): string {
    const uaId = this.generateUserAgentId(userAgent);

    if (this.userAgents.has(uaId)) {
      this.logger.warn(`User agent already exists: ${uaId}`);
      return uaId;
    }

    const newUA: UserAgentConfig = {
      enabled: true,
      usageCount: 0,
      successRate: 1.0,
      weight: 1,
      tags: [],
      lastUsed: new Date(0),
      ...userAgent
    };

    this.userAgents.set(uaId, newUA);
    this.logger.info(`User agent added: ${uaId}`, {
      browserType: userAgent.browserType,
      operatingSystem: userAgent.operatingSystem,
      deviceType: userAgent.deviceType
    });

    return uaId;
  }

  /**
   * 移除用户代理
   */
  removeUserAgent(userAgentString: string): boolean {
    let removed = false;

    for (const [id, ua] of this.userAgents) {
      if (ua.userAgent === userAgentString) {
        this.userAgents.delete(id);
        this.usageStatistics.delete(id);
        removed = true;
        this.logger.info(`User agent removed: ${id}`);
        break;
      }
    }

    if (!removed) {
      this.logger.warn(`User agent not found for removal: ${userAgentString}`);
    }

    return removed;
  }

  /**
   * 启用用户代理
   */
  enableUserAgent(userAgentString: string): boolean {
    for (const [id, ua] of this.userAgents) {
      if (ua.userAgent === userAgentString) {
        ua.enabled = true;
        this.userAgents.set(id, ua);
        this.logger.info(`User agent enabled: ${id}`);
        return true;
      }
    }

    this.logger.warn(`User agent not found for enabling: ${userAgentString}`);
    return false;
  }

  /**
   * 禁用用户代理
   */
  disableUserAgent(userAgentString: string): boolean {
    for (const [id, ua] of this.userAgents) {
      if (ua.userAgent === userAgentString) {
        ua.enabled = false;
        this.userAgents.set(id, ua);
        this.logger.info(`User agent disabled: ${id}`);
        return true;
      }
    }

    this.logger.warn(`User agent not found for disabling: ${userAgentString}`);
    return false;
  }

  /**
   * 验证用户代理格式
   */
  validateUserAgent(userAgent: string): boolean {
    // 基本格式验证
    if (!userAgent || typeof userAgent !== 'string') {
      return false;
    }

    // 长度验证
    if (userAgent.length < 10 || userAgent.length > 500) {
      return false;
    }

    // 常见浏览器标识验证
    const browserPatterns = [
      /Mozilla\/\d+\.\d+/,
      /AppleWebKit\/\d+\.\d+/,
      /Chrome\/\d+\.\d+/,
      /Safari\/\d+\.\d+/,
      /Firefox\/\d+\.\d+/,
      /Edge\/\d+\.\d+/
    ];

    // 至少匹配一个浏览器模式
    const hasValidPattern = browserPatterns.some(pattern => pattern.test(userAgent));

    // 操作系统标识验证
    const osPatterns = [
      /Windows NT/,
      /Macintosh/,
      /Linux/,
      /Android/,
      /iPhone/,
      /iPad/
    ];

    const hasOSPattern = osPatterns.some(pattern => pattern.test(userAgent));

    return hasValidPattern && hasOSPattern;
  }

  /**
   * 验证所有用户代理
   */
  validateAllUserAgents(): void {
    let validCount = 0;
    let invalidCount = 0;

    for (const [id, ua] of this.userAgents) {
      const isValid = this.validateUserAgent(ua.userAgent);

      if (!isValid) {
        this.logger.warn(`Invalid user agent format: ${id}`, {
          userAgent: ua.userAgent.substring(0, 50) + '...'
        });
        invalidCount++;
      } else {
        validCount++;
      }
    }

    this.logger.info(`User agent validation completed`, {
      validCount,
      invalidCount,
      totalCount: this.userAgents.size
    });
  }

  /**
   * 获取用户代理统计信息
   */
  getUserAgentStats(userAgentString: string): {
    usageCount: number;
    successRate: number;
    lastUsed: Date | undefined;
    enabled: boolean;
  } | null {
    for (const [id, ua] of this.userAgents) {
      if (ua.userAgent === userAgentString) {
        this.usageStatistics.get(id); // unused
        return {
          usageCount: ua.usageCount || 0,
          successRate: ua.successRate || 0,
          lastUsed: ua.lastUsed,
          enabled: ua.enabled !== false
        };
      }
    }

    return null;
  }

  /**
   * 获取总体统计信息
   */
  getOverallStats(): {
    totalUserAgents: number;
    enabledUserAgents: number;
    disabledUserAgents: number;
    byBrowserType: Record<string, number>;
    byOperatingSystem: Record<string, number>;
    byDeviceType: Record<string, number>;
    averageSuccessRate: number;
    totalUsageCount: number;
  } {
    const allUserAgents = Array.from(this.userAgents.values());
    const enabledUserAgents = allUserAgents.filter(ua => ua.enabled !== false);
    const disabledUserAgents = allUserAgents.filter(ua => ua.enabled === false);

    // 分类统计
    const byBrowserType: Record<string, number> = {};
    const byOperatingSystem: Record<string, number> = {};
    const byDeviceType: Record<string, number> = {};

    let totalSuccessRate = 0;
    let totalUsageCount = 0;
    let userAgentsWithSuccessRate = 0;

    allUserAgents.forEach(ua => {
      // 浏览器类型统计
      const browserType = ua.browserType;
      byBrowserType[browserType] = (byBrowserType[browserType] || 0) + 1;

      // 操作系统统计
      const os = ua.operatingSystem;
      byOperatingSystem[os] = (byOperatingSystem[os] || 0) + 1;

      // 设备类型统计
      const deviceType = ua.deviceType;
      byDeviceType[deviceType] = (byDeviceType[deviceType] || 0) + 1;

      // 成功率统计
      if (ua.successRate !== undefined) {
        totalSuccessRate += ua.successRate;
        userAgentsWithSuccessRate++;
      }

      // 使用次数统计
      totalUsageCount += ua.usageCount || 0;
    });

    const averageSuccessRate = userAgentsWithSuccessRate > 0
      ? totalSuccessRate / userAgentsWithSuccessRate
      : 0;

    return {
      totalUserAgents: allUserAgents.length,
      enabledUserAgents: enabledUserAgents.length,
      disabledUserAgents: disabledUserAgents.length,
      byBrowserType,
      byOperatingSystem,
      byDeviceType,
      averageSuccessRate,
      totalUsageCount
    };
  }

  /**
   * 根据分类获取用户代理
   */
  getUserAgentsByCategory(criteria: {
    browserType?: string;
    operatingSystem?: string;
    deviceType?: string;
  }): UserAgentConfig[] {
    return Array.from(this.userAgents.values()).filter(ua => {
      if (criteria.browserType && ua.browserType !== criteria.browserType) {
        return false;
      }
      if (criteria.operatingSystem && ua.operatingSystem !== criteria.operatingSystem) {
        return false;
      }
      if (criteria.deviceType && ua.deviceType !== criteria.deviceType) {
        return false;
      }
      return true;
    });
  }

  /**
   * 清理旧的使用统计
   */
  cleanupOldStats(retentionDays: number = 30): void {
    // 这里可以实现清理旧的统计信息
    // 目前使用统计存储在内存中，可以根据需要扩展
    this.logger.debug(`User agent stats cleanup requested (retention: ${retentionDays} days)`);
  }
}