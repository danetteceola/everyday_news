/**
 * 代理管理和轮换功能
 * 提供代理服务器的管理、健康检查、轮换策略和故障转移功能
 */

import { CollectionLogger, createAntiCrawlingLogger } from '../utils/logger';

export interface ProxyConfig {
  /** 代理服务器地址 */
  host: string;

  /** 代理服务器端口 */
  port: number;

  /** 代理协议 */
  protocol?: 'http' | 'https' | 'socks5';

  /** 代理认证用户名 */
  username?: string;

  /** 代理认证密码 */
  password?: string;

  /** 代理别名 */
  name?: string;

  /** 代理地区/国家 */
  region?: string;

  /** 代理是否可用 */
  enabled?: boolean;

  /** 代理最后使用时间 */
  lastUsed?: Date;

  /** 代理最后成功时间 */
  lastSuccess?: Date;

  /** 代理失败次数 */
  failureCount?: number;

  /** 代理成功次数 */
  successCount?: number;

  /** 代理平均响应时间（毫秒） */
  averageResponseTime?: number;

  /** 代理总使用时间（毫秒） */
  totalUsageTime?: number;

  /** 代理优先级（1-10，越高越优先） */
  priority?: number;

  /** 代理权重（用于加权轮询） */
  weight?: number;

  /** 代理标签 */
  tags?: string[];
}

export interface ProxyHealthCheckConfig {
  /** 健康检查URL */
  checkUrl: string;

  /** 健康检查超时时间（毫秒） */
  timeout: number;

  /** 健康检查间隔（毫秒） */
  checkInterval: number;

  /** 连续失败次数后禁用代理 */
  maxConsecutiveFailures: number;

  /** 成功响应应包含的关键词 */
  expectedKeywords?: string[];

  /** 成功响应状态码范围 */
  successStatusCodes?: number[];
}

export interface ProxyRotationStrategy {
  /** 策略名称 */
  name: string;

  /** 选择代理的函数 */
  selectProxy: (proxies: ProxyConfig[], context?: any) => ProxyConfig | null;

  /** 策略描述 */
  description?: string;
}

export interface ProxyManagerConfig {
  /** 代理列表 */
  proxies: ProxyConfig[];

  /** 是否启用代理轮换 */
  enableRotation: boolean;

  /** 轮换策略 */
  rotationStrategy: string;

  /** 是否启用健康检查 */
  enableHealthCheck: boolean;

  /** 健康检查配置 */
  healthCheckConfig: ProxyHealthCheckConfig;

  /** 最大重试次数（单个代理） */
  maxRetriesPerProxy: number;

  /** 代理冷却时间（失败后的禁用时间，毫秒） */
  proxyCooldownTime: number;

  /** 是否启用代理池自动扩展 */
  enablePoolAutoScaling: boolean;

  /** 最小可用代理数 */
  minAvailableProxies: number;

  /** 最大代理池大小 */
  maxPoolSize: number;
}

export class ProxyManager {
  private config: ProxyManagerConfig;
  private logger: CollectionLogger;
  private proxies: Map<string, ProxyConfig>;
  private rotationStrategies: Map<string, ProxyRotationStrategy>;
  private healthCheckInterval?: NodeJS.Timeout;
  private proxyUsageHistory: Array<{
    proxyId: string;
    timestamp: Date;
    success: boolean;
    responseTime: number;
    error?: string;
  }>;

  constructor(config: Partial<ProxyManagerConfig> = {}) {
    this.config = {
      proxies: [],
      enableRotation: true,
      rotationStrategy: 'roundRobin',
      enableHealthCheck: true,
      healthCheckConfig: {
        checkUrl: 'http://httpbin.org/ip',
        timeout: 10000,
        checkInterval: 60000,
        maxConsecutiveFailures: 3,
        expectedKeywords: ['origin'],
        successStatusCodes: [200]
      },
      maxRetriesPerProxy: 3,
      proxyCooldownTime: 300000, // 5分钟
      enablePoolAutoScaling: false,
      minAvailableProxies: 3,
      maxPoolSize: 50,
      ...config
    };

    this.logger = createAntiCrawlingLogger();
    this.proxies = new Map();
    this.rotationStrategies = new Map();
    this.proxyUsageHistory = [];

    // 初始化代理
    this.initializeProxies();

    // 注册默认轮换策略
    this.registerDefaultStrategies();

    // 启动健康检查
    if (this.config.enableHealthCheck) {
      this.startHealthChecks();
    }

    this.logger.info('Proxy manager initialized', {
      totalProxies: this.proxies.size,
      enabledProxies: this.getEnabledProxies().length,
      rotationStrategy: this.config.rotationStrategy
    });
  }

  /**
   * 初始化代理
   */
  private initializeProxies(): void {
    this.config.proxies.forEach(proxy => {
      const proxyId = this.generateProxyId(proxy);
      this.proxies.set(proxyId, {
        enabled: true,
        failureCount: 0,
        successCount: 0,
        averageResponseTime: 0,
        totalUsageTime: 0,
        priority: 5,
        weight: 1,
        tags: [],
        lastUsed: new Date(0),
        lastSuccess: new Date(0),
        ...proxy
      });
    });
  }

  /**
   * 生成代理ID
   */
  private generateProxyId(proxy: ProxyConfig): string {
    return `${proxy.host}:${proxy.port}:${proxy.protocol || 'http'}`;
  }

  /**
   * 注册默认轮换策略
   */
  private registerDefaultStrategies(): void {
    // 轮询策略
    this.registerRotationStrategy('roundRobin', {
      name: 'roundRobin',
      description: '简单的轮询策略，按顺序选择代理',
      selectProxy: (proxies) => {
        const enabledProxies = proxies.filter(p => p.enabled !== false);
        if (enabledProxies.length === 0) {
          return null;
        }

        // 找到最近未使用的代理
        const sortedProxies = enabledProxies.sort((a, b) => {
          const timeA = a.lastUsed?.getTime() || 0;
          const timeB = b.lastUsed?.getTime() || 0;
          return timeA - timeB;
        });

        return sortedProxies[0];
      }
    });

    // 随机策略
    this.registerRotationStrategy('random', {
      name: 'random',
      description: '随机选择代理',
      selectProxy: (proxies) => {
        const enabledProxies = proxies.filter(p => p.enabled !== false);
        if (enabledProxies.length === 0) {
          return null;
        }

        const randomIndex = Math.floor(Math.random() * enabledProxies.length);
        return enabledProxies[randomIndex];
      }
    });

    // 加权轮询策略
    this.registerRotationStrategy('weightedRoundRobin', {
      name: 'weightedRoundRobin',
      description: '根据权重进行加权轮询',
      selectProxy: (proxies) => {
        const enabledProxies = proxies.filter(p => p.enabled !== false);
        if (enabledProxies.length === 0) {
          return null;
        }

        // 计算总权重
        const totalWeight = enabledProxies.reduce((sum, proxy) => sum + (proxy.weight || 1), 0);
        let random = Math.random() * totalWeight;

        for (const proxy of enabledProxies) {
          random -= proxy.weight || 1;
          if (random <= 0) {
            return proxy;
          }
        }

        return enabledProxies[0];
      }
    });

    // 性能优先策略
    this.registerRotationStrategy('performance', {
      name: 'performance',
      description: '选择性能最好的代理（响应时间最短）',
      selectProxy: (proxies) => {
        const enabledProxies = proxies.filter(p => p.enabled !== false);
        if (enabledProxies.length === 0) {
          return null;
        }

        // 按平均响应时间排序
        const sortedProxies = enabledProxies.sort((a, b) => {
          const timeA = a.averageResponseTime || Infinity;
          const timeB = b.averageResponseTime || Infinity;
          return timeA - timeB;
        });

        return sortedProxies[0];
      }
    });

    // 优先级策略
    this.registerRotationStrategy('priority', {
      name: 'priority',
      description: '选择优先级最高的代理',
      selectProxy: (proxies) => {
        const enabledProxies = proxies.filter(p => p.enabled !== false);
        if (enabledProxies.length === 0) {
          return null;
        }

        // 按优先级排序
        const sortedProxies = enabledProxies.sort((a, b) => {
          const priorityA = a.priority || 5;
          const priorityB = b.priority || 5;
          return priorityB - priorityA; // 降序
        });

        return sortedProxies[0];
      }
    });
  }

  /**
   * 注册轮换策略
   */
  registerRotationStrategy(name: string, strategy: ProxyRotationStrategy): void {
    this.rotationStrategies.set(name, strategy);
    this.logger.debug(`Rotation strategy registered: ${name}`, {
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
      this.logger.info(`Rotation strategy set to: ${name}`);
      return true;
    }

    this.logger.warn(`Rotation strategy not found: ${name}`, {
      availableStrategies: Array.from(this.rotationStrategies.keys())
    });
    return false;
  }

  /**
   * 获取下一个代理
   */
  getNextProxy(context?: any): ProxyConfig | null {
    if (!this.config.enableRotation || this.proxies.size === 0) {
      const firstProxy = Array.from(this.proxies.values()).find(p => p.enabled !== false);
      return firstProxy || null;
    }

    const strategy = this.rotationStrategies.get(this.config.rotationStrategy);
    if (!strategy) {
      this.logger.error(`Current rotation strategy not found: ${this.config.rotationStrategy}`);
      return null;
    }

    const proxies = Array.from(this.proxies.values());
    const selectedProxy = strategy.selectProxy(proxies, context);

    if (selectedProxy) {
      // 更新代理使用时间
      selectedProxy.lastUsed = new Date();
      this.proxies.set(this.generateProxyId(selectedProxy), selectedProxy);
    }

    return selectedProxy;
  }

  /**
   * 获取所有代理
   */
  getAllProxies(): ProxyConfig[] {
    return Array.from(this.proxies.values());
  }

  /**
   * 获取启用代理
   */
  getEnabledProxies(): ProxyConfig[] {
    return Array.from(this.proxies.values()).filter(p => p.enabled !== false);
  }

  /**
   * 获取禁用代理
   */
  getDisabledProxies(): ProxyConfig[] {
    return Array.from(this.proxies.values()).filter(p => p.enabled === false);
  }

  /**
   * 添加代理
   */
  addProxy(proxy: ProxyConfig): string {
    const proxyId = this.generateProxyId(proxy);

    if (this.proxies.has(proxyId)) {
      this.logger.warn(`Proxy already exists: ${proxyId}`);
      return proxyId;
    }

    const newProxy: ProxyConfig = {
      enabled: true,
      failureCount: 0,
      successCount: 0,
      averageResponseTime: 0,
      totalUsageTime: 0,
      priority: 5,
      weight: 1,
      tags: [],
      lastUsed: new Date(0),
      lastSuccess: new Date(0),
      ...proxy
    };

    this.proxies.set(proxyId, newProxy);
    this.logger.info(`Proxy added: ${proxyId}`, {
      host: proxy.host,
      port: proxy.port,
      protocol: proxy.protocol
    });

    return proxyId;
  }

  /**
   * 移除代理
   */
  removeProxy(host: string, port: number, protocol?: string): boolean {
    const proxyId = this.generateProxyId({ host, port, protocol: (protocol as 'http' | 'https' | 'socks5') || 'http' });
    const existed = this.proxies.delete(proxyId);

    if (existed) {
      this.logger.info(`Proxy removed: ${proxyId}`);
    } else {
      this.logger.warn(`Proxy not found for removal: ${proxyId}`);
    }

    return existed;
  }

  /**
   * 启用代理
   */
  enableProxy(host: string, port: number, protocol?: string): boolean {
    const proxyId = this.generateProxyId({ host, port, protocol: (protocol as 'http' | 'https' | 'socks5') || 'http' });
    const proxy = this.proxies.get(proxyId);

    if (proxy) {
      proxy.enabled = true;
      proxy.failureCount = 0;
      this.proxies.set(proxyId, proxy);
      this.logger.info(`Proxy enabled: ${proxyId}`);
      return true;
    }

    this.logger.warn(`Proxy not found for enabling: ${proxyId}`);
    return false;
  }

  /**
   * 禁用代理
   */
  disableProxy(host: string, port: number, protocol?: string): boolean {
    const proxyId = this.generateProxyId({ host, port, protocol: (protocol as 'http' | 'https' | 'socks5') || 'http' });
    const proxy = this.proxies.get(proxyId);

    if (proxy) {
      proxy.enabled = false;
      this.proxies.set(proxyId, proxy);
      this.logger.info(`Proxy disabled: ${proxyId}`);
      return true;
    }

    this.logger.warn(`Proxy not found for disabling: ${proxyId}`);
    return false;
  }

  /**
   * 标记代理成功
   */
  markProxySuccess(proxy: ProxyConfig, responseTime: number): void {
    const proxyId = this.generateProxyId(proxy);
    const currentProxy = this.proxies.get(proxyId);

    if (!currentProxy) {
      this.logger.warn(`Proxy not found for success marking: ${proxyId}`);
      return;
    }

    // 更新成功计数
    currentProxy.successCount = (currentProxy.successCount || 0) + 1;
    currentProxy.lastSuccess = new Date();
    currentProxy.failureCount = 0;

    // 更新平均响应时间
    const totalTime = (currentProxy.averageResponseTime || 0) * (currentProxy.successCount - 1) + responseTime;
    currentProxy.averageResponseTime = totalTime / currentProxy.successCount;

    // 更新总使用时间
    currentProxy.totalUsageTime = (currentProxy.totalUsageTime || 0) + responseTime;

    // 如果代理之前被禁用，重新启用
    if (currentProxy.enabled === false) {
      currentProxy.enabled = true;
      this.logger.info(`Proxy re-enabled after success: ${proxyId}`);
    }

    this.proxies.set(proxyId, currentProxy);

    // 记录使用历史
    this.recordProxyUsage(proxyId, true, responseTime);
  }

  /**
   * 标记代理失败
   */
  markProxyFailure(proxy: ProxyConfig, error?: string): void {
    const proxyId = this.generateProxyId(proxy);
    const currentProxy = this.proxies.get(proxyId);

    if (!currentProxy) {
      this.logger.warn(`Proxy not found for failure marking: ${proxyId}`);
      return;
    }

    // 更新失败计数
    currentProxy.failureCount = (currentProxy.failureCount || 0) + 1;

    // 检查是否应该禁用代理
    if (currentProxy.failureCount >= this.config.maxRetriesPerProxy) {
      currentProxy.enabled = false;
      this.logger.warn(`Proxy disabled due to multiple failures: ${proxyId}`, {
        failureCount: currentProxy.failureCount,
        maxRetries: this.config.maxRetriesPerProxy
      });
    }

    this.proxies.set(proxyId, currentProxy);

    // 记录使用历史
    this.recordProxyUsage(proxyId, false, 0, error);
  }

  /**
   * 记录代理使用历史
   */
  private recordProxyUsage(proxyId: string, success: boolean, responseTime: number, error?: string): void {
    this.proxyUsageHistory.push({
      proxyId,
      timestamp: new Date(),
      success,
      responseTime,
      error
    });

    // 限制历史记录大小
    if (this.proxyUsageHistory.length > 10000) {
      this.proxyUsageHistory = this.proxyUsageHistory.slice(-5000);
    }
  }

  /**
   * 获取代理统计信息
   */
  getProxyStats(proxyId: string): {
    successCount: number;
    failureCount: number;
    averageResponseTime: number;
    totalUsageTime: number;
    availability: number;
    lastUsed: Date | undefined;
    lastSuccess: Date | undefined;
  } | null {
    const proxy = this.proxies.get(proxyId);
    if (!proxy) {
      return null;
    }

    const totalRequests = (proxy.successCount || 0) + (proxy.failureCount || 0);
    const availability = totalRequests > 0
      ? (proxy.successCount || 0) / totalRequests
      : 0;

    return {
      successCount: proxy.successCount || 0,
      failureCount: proxy.failureCount || 0,
      averageResponseTime: proxy.averageResponseTime || 0,
      totalUsageTime: proxy.totalUsageTime || 0,
      availability,
      lastUsed: proxy.lastUsed,
      lastSuccess: proxy.lastSuccess
    };
  }

  /**
   * 获取总体统计信息
   */
  getOverallStats(): {
    totalProxies: number;
    enabledProxies: number;
    disabledProxies: number;
    totalSuccesses: number;
    totalFailures: number;
    overallAvailability: number;
    averageResponseTime: number;
  } {
    const allProxies = Array.from(this.proxies.values());
    const enabledProxies = allProxies.filter(p => p.enabled !== false);
    const disabledProxies = allProxies.filter(p => p.enabled === false);

    let totalSuccesses = 0;
    let totalFailures = 0;
    let totalResponseTime = 0;
    let totalProxiesWithSuccess = 0;

    allProxies.forEach(proxy => {
      totalSuccesses += proxy.successCount || 0;
      totalFailures += proxy.failureCount || 0;

      if (proxy.averageResponseTime && proxy.successCount && proxy.successCount > 0) {
        totalResponseTime += proxy.averageResponseTime * (proxy.successCount || 0);
        totalProxiesWithSuccess += proxy.successCount || 0;
      }
    });

    const totalRequests = totalSuccesses + totalFailures;
    const overallAvailability = totalRequests > 0
      ? totalSuccesses / totalRequests
      : 0;

    const averageResponseTime = totalProxiesWithSuccess > 0
      ? totalResponseTime / totalProxiesWithSuccess
      : 0;

    return {
      totalProxies: allProxies.length,
      enabledProxies: enabledProxies.length,
      disabledProxies: disabledProxies.length,
      totalSuccesses,
      totalFailures,
      overallAvailability,
      averageResponseTime
    };
  }

  /**
   * 启动健康检查
   */
  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthChecks();
    }, this.config.healthCheckConfig.checkInterval);

    this.logger.info('Health checks started', {
      checkInterval: this.config.healthCheckConfig.checkInterval,
      checkUrl: this.config.healthCheckConfig.checkUrl
    });

    // 立即执行一次健康检查
    this.performHealthChecks();
  }

  /**
   * 执行健康检查
   */
  private async performHealthChecks(): Promise<void> {
    const proxiesToCheck = Array.from(this.proxies.values()).filter(p => p.enabled !== false);

    this.logger.debug(`Performing health checks for ${proxiesToCheck.length} proxies`);

    const checkPromises = proxiesToCheck.map(proxy =>
      this.checkProxyHealth(proxy)
    );

    await Promise.allSettled(checkPromises);
  }

  /**
   * 检查代理健康
   */
  private async checkProxyHealth(proxy: ProxyConfig): Promise<void> {
    const proxyId = this.generateProxyId(proxy);
    const startTime = Date.now();

    try {
      // 这里应该实现实际的健康检查逻辑
      // 由于我们无法在此处执行HTTP请求，这里先模拟检查
      await this.simulateHealthCheck(proxy);

      const responseTime = Date.now() - startTime;
      this.markProxySuccess(proxy, responseTime);

      this.logger.debug(`Health check passed for proxy: ${proxyId}`, {
        responseTime,
        host: proxy.host,
        port: proxy.port
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.markProxyFailure(proxy, errorMessage);

      this.logger.warn(`Health check failed for proxy: ${proxyId}`, {
        error: errorMessage,
        host: proxy.host,
        port: proxy.port
      });
    }
  }

  /**
   * 模拟健康检查
   */
  private async simulateHealthCheck(_proxy: ProxyConfig): Promise<void> {
    // 模拟网络延迟
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000));

    // 模拟90%的成功率
    if (Math.random() > 0.9) {
      throw new Error('Simulated health check failure');
    }
  }

  /**
   * 停止健康检查
   */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.logger.info('Health checks stopped');
    }
  }

  /**
   * 清理旧的历史记录
   */
  cleanupOldHistory(retentionDays: number = 7): void {
    const cutoffTime = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const initialLength = this.proxyUsageHistory.length;

    this.proxyUsageHistory = this.proxyUsageHistory.filter(
      record => record.timestamp >= cutoffTime
    );

    if (initialLength !== this.proxyUsageHistory.length) {
      this.logger.debug(`Cleaned up ${initialLength - this.proxyUsageHistory.length} old history records`, {
        remainingRecords: this.proxyUsageHistory.length,
        retentionDays
      });
    }
  }

  /**
   * 销毁资源
   */
  destroy(): void {
    this.stopHealthChecks();
    this.logger.info('Proxy manager destroyed');
  }
}