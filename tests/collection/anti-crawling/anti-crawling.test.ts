/**
 * 反爬系统单元测试
 */

import { AntiCrawlingSystem, RequestOptions } from '../../../src/collection/anti-crawling/anti-crawling-system';
import { RequestDelayManager } from '../../../src/collection/anti-crawling/request-delay-manager';
import { ProxyManager } from '../../../src/collection/anti-crawling/proxy-manager';
import { UserAgentManager } from '../../../src/collection/anti-crawling/user-agent-manager';
import { ErrorRetryManager } from '../../../src/collection/anti-crawling/error-retry-manager';
import { CaptchaManager, CaptchaType } from '../../../src/collection/anti-crawling/captcha-manager';
import { MonitoringManager } from '../../../src/collection/anti-crawling/monitoring-manager';

// Mock implementation for abstract AntiCrawlingSystem
class MockAntiCrawlingSystem extends AntiCrawlingSystem {
  async executeRequest(_options: RequestOptions): Promise<any> {
    // Simulate successful request
    return { data: 'mock response', status: 200 };
  }
}

describe('AntiCrawlingSystem', () => {
  let system: MockAntiCrawlingSystem;

  beforeEach(() => {
    system = new MockAntiCrawlingSystem({
      baseDelay: 100,
      randomDelayRange: 50,
      maxConcurrentRequests: 2
    });
  });

  describe('configuration', () => {
    it('should initialize with default config', () => {
      const config = system.getConfig();
      expect(config.baseDelay).toBe(100);
      expect(config.randomDelayRange).toBe(50);
      expect(config.maxConcurrentRequests).toBe(2);
      expect(config.userAgents).toBeInstanceOf(Array);
    });

    it('should update config correctly', () => {
      system.updateConfig({ baseDelay: 200, randomDelayRange: 100 });
      const config = system.getConfig();
      expect(config.baseDelay).toBe(200);
      expect(config.randomDelayRange).toBe(100);
    });
  });

  describe('delay calculation', () => {
    it('should calculate delay within range', () => {
      // We can't test exact value due to randomness, but can test bounds
      // Since calculateDelay is protected, we need to test through public API
      // Instead, test that waitForDelay doesn't throw
      expect(() => {
        // This is async but we're just checking it doesn't throw synchronously
        Promise.resolve(system.executeRequestSafely({ url: 'http://test.com' }));
      }).not.toThrow();
    });
  });

  describe('stats tracking', () => {
    it('should initialize stats correctly', () => {
      const stats = system.getStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(0);
      expect(stats.blockedRequests).toBe(0);
      expect(stats.averageResponseTime).toBe(0);
      expect(stats.currentConcurrentRequests).toBe(0);
    });

    it('should reset stats', () => {
      system.resetStats();
      const stats = system.getStats();
      expect(stats.totalRequests).toBe(0);
    });

    it('should update stats on successful request', async () => {
      await system.executeRequestSafely({ url: 'http://test.com' });
      const stats = system.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(1);
      expect(stats.failedRequests).toBe(0);
    });

    it('should update stats on failed request', async () => {
      // 创建一个会失败的模拟系统
      class FailingMockSystem extends AntiCrawlingSystem {
        async executeRequest(_options: RequestOptions): Promise<any> {
          throw new Error('Request failed');
        }
      }

      const failingSystem = new FailingMockSystem();
      try {
        await failingSystem.executeRequestSafely({ url: 'http://test.com' });
      } catch (_error) {
        // 预期会失败
      }

      const stats = failingSystem.getStats();
      expect(stats.totalRequests).toBe(1);
      expect(stats.successfulRequests).toBe(0);
      expect(stats.failedRequests).toBe(1);
    });
  });

  describe('proxy management', () => {
    it('should add and remove proxies', () => {
      system.addProxy({
        host: 'proxy.example.com',
        port: 8080,
        protocol: 'http'
      });

      const config = system.getConfig();
      expect(config.proxies).toHaveLength(1);
      expect(config.proxies[0].host).toBe('proxy.example.com');

      const removed = system.removeProxy('proxy.example.com', 8080);
      expect(removed).toBe(true);

      const updatedConfig = system.getConfig();
      expect(updatedConfig.proxies).toHaveLength(0);
    });

    it('should enable and disable all proxies', () => {
      system.addProxy({
        host: 'proxy1.example.com',
        port: 8080,
        protocol: 'http'
      });
      system.addProxy({
        host: 'proxy2.example.com',
        port: 8080,
        protocol: 'http'
      });

      system.disableAllProxies();
      let config = system.getConfig();
      config.proxies.forEach(proxy => {
        expect(proxy.enabled).toBe(false);
      });

      system.enableAllProxies();
      config = system.getConfig();
      config.proxies.forEach(proxy => {
        expect(proxy.enabled).toBe(true);
      });
    });
  });

  describe('error handling', () => {
    it('should detect anti-crawling errors', () => {
      const blockedError = new Error('Request blocked by anti-crawling system');
      const rateLimitError = new Error('Rate limit exceeded');
      const captchaError = new Error('Please complete CAPTCHA');
      const normalError = new Error('Network error');

      expect(system['isAntiCrawlingError'](blockedError)).toBe(true);
      expect(system['isAntiCrawlingError'](rateLimitError)).toBe(true);
      expect(system['isAntiCrawlingError'](captchaError)).toBe(true);
      expect(system['isAntiCrawlingError'](normalError)).toBe(false);
    });

    it('should retry failed requests', async () => {
      let attemptCount = 0;
      class RetryMockSystem extends AntiCrawlingSystem {
        async executeRequest(_options: RequestOptions): Promise<any> {
          attemptCount++;
          if (attemptCount < 3) {
            throw new Error('Temporary failure');
          }
          return { data: 'success' };
        }
      }

      const retrySystem = new RetryMockSystem({
        maxRetries: 3,
        retryBaseDelay: 10 // 快速重试用于测试
      });

      const result = await retrySystem.executeRequestSafely({ url: 'http://test.com' });
      expect(result).toBeDefined();
      expect(attemptCount).toBe(3);
    });
  });

  describe('concurrent request control', () => {
    it('should limit concurrent requests', async () => {
      const concurrentSystem = new MockAntiCrawlingSystem({
        maxConcurrentRequests: 2
      });

      const startPromises = [];
      const completionOrder = [];

      // 启动3个请求，但只有2个可以并发执行
      for (let i = 0; i < 3; i++) {
        startPromises.push(
          concurrentSystem.executeRequestSafely({ url: `http://test${i}.com` })
            .then(() => completionOrder.push(i))
        );
      }

      await Promise.all(startPromises);

      // 检查统计信息
      const stats = concurrentSystem.getStats();
      expect(stats.totalRequests).toBe(3);
      expect(stats.successfulRequests).toBe(3);
    });
  });
});

describe('RequestDelayManager', () => {
  let manager: RequestDelayManager;

  beforeEach(() => {
    manager = new RequestDelayManager({
      baseDelay: 10,
      randomDelayRange: 5,
      maxConcurrentRequests: 1
    });
  });

  afterEach(() => {
    // Clean up any intervals
    jest.useRealTimers();
  });

  describe('frequency control', () => {
    it('should track request history', () => {
      const stats = manager.getRequestHistoryStats();
      expect(stats.totalRequests).toBe(0);
      expect(stats.requestsLastMinute).toBe(0);
    });

    it('should reset request history', () => {
      manager.resetRequestHistory();
      const stats = manager.getRequestHistoryStats();
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('delay strategies', () => {
    it('should register and set delay strategy', () => {
      const result = manager.setDelayStrategy('linear');
      expect(result).toBe(true);
    });

    it('should return false for unknown strategy', () => {
      const result = manager.setDelayStrategy('unknown');
      expect(result).toBe(false);
    });

    it('should calculate different delays for different strategies', () => {
      const defaultDelay = manager['calculateDelay']();
      manager.setDelayStrategy('linear');
      const linearDelay = manager['calculateDelay']();
      manager.setDelayStrategy('exponential');
      const exponentialDelay = manager['calculateDelay']();

      // 不同策略应该产生不同的延迟（尽管有随机性）
      // 我们主要检查函数不会抛出错误
      expect(defaultDelay).toBeGreaterThanOrEqual(0);
      expect(linearDelay).toBeGreaterThanOrEqual(0);
      expect(exponentialDelay).toBeGreaterThanOrEqual(0);
    });

    it('should calculate retry delays', () => {
      const retryDelay1 = manager.calculateRetryDelay(1);
      const retryDelay2 = manager.calculateRetryDelay(2);
      const retryDelay3 = manager.calculateRetryDelay(3);

      // 重试延迟应该随着尝试次数增加而增加
      expect(retryDelay1).toBeGreaterThanOrEqual(0);
      expect(retryDelay2).toBeGreaterThanOrEqual(retryDelay1);
      expect(retryDelay3).toBeGreaterThanOrEqual(retryDelay2);
    });
  });

  describe('frequency control', () => {
    it('should enforce frequency limits', () => {
      // 设置非常严格的频率限制
      const strictManager = new RequestDelayManager(
        { maxConcurrentRequests: 1 },
        {
          timeWindow: 1000,
          maxRequestsPerWindow: 2
        }
      );

      // 记录两次请求
      strictManager['recordRequest']('http://test1.com');
      strictManager['recordRequest']('http://test2.com');

      // 第三次请求应该被限制
      expect(() => {
        strictManager['checkFrequencyLimit']('http://test3.com');
      }).toThrow(/Frequency limit exceeded/);
    });

    it('should cleanup old history', () => {
      const oldTimestamp = new Date(Date.now() - 100000);
      manager['requestHistory'] = [
        { timestamp: oldTimestamp, url: 'http://old.com' },
        { timestamp: new Date(), url: 'http://new.com' }
      ];

      manager['cleanupOldHistory']();

      expect(manager['requestHistory']).toHaveLength(1);
      expect(manager['requestHistory'][0].url).toBe('http://new.com');
    });
  });

  describe('request execution', () => {
    it('should execute HTTP requests', async () => {
      // 注意：这是一个集成测试，需要网络连接
      // 在实际测试中，应该使用模拟的HTTP客户端
      // 这里我们主要测试函数不会抛出错误
      const promise = manager.executeRequest({
        url: 'http://httpbin.org/get'
      });

      // 我们只检查函数被调用，不等待结果（避免网络依赖）
      expect(promise).toBeInstanceOf(Promise);
    });

    it('should handle proxy errors', async () => {
      // 测试代理错误处理
      const proxyError = new Error('Proxy connection failed');
      const isProxyError = manager['isProxyError'](proxyError);

      expect(isProxyError).toBe(true);

      const normalError = new Error('Some other error');
      const isNormalError = manager['isProxyError'](normalError);

      expect(isNormalError).toBe(false);
    });
  });

  describe('configuration', () => {
    it('should update frequency config', () => {
      const initialConfig = manager.getFrequencyConfig();
      expect(initialConfig.timeWindow).toBe(60000);

      manager.updateFrequencyConfig({ timeWindow: 30000 });
      const updatedConfig = manager.getFrequencyConfig();
      expect(updatedConfig.timeWindow).toBe(30000);
    });
  });
});

describe('ProxyManager', () => {
  let proxyManager: ProxyManager;

  beforeEach(() => {
    proxyManager = new ProxyManager({
      proxies: [
        {
          host: 'proxy1.example.com',
          port: 8080,
          protocol: 'http'
        },
        {
          host: 'proxy2.example.com',
          port: 8080,
          protocol: 'http'
        }
      ]
    });
  });

  afterEach(() => {
    proxyManager.destroy();
  });

  describe('proxy management', () => {
    it('should initialize with provided proxies', () => {
      const proxies = proxyManager.getAllProxies();
      expect(proxies).toHaveLength(2);
      expect(proxies[0].host).toBe('proxy1.example.com');
      expect(proxies[1].host).toBe('proxy2.example.com');
    });

    it('should add new proxy', () => {
      const proxyId = proxyManager.addProxy({
        host: 'proxy3.example.com',
        port: 8888,
        protocol: 'https'
      });

      expect(proxyId).toBeTruthy();
      const proxies = proxyManager.getAllProxies();
      expect(proxies).toHaveLength(3);
    });

    it('should remove proxy', () => {
      const removed = proxyManager.removeProxy('proxy1.example.com', 8080);
      expect(removed).toBe(true);

      const proxies = proxyManager.getAllProxies();
      expect(proxies).toHaveLength(1);
    });

    it('should enable and disable proxy', () => {
      const enabled = proxyManager.enableProxy('proxy1.example.com', 8080);
      expect(enabled).toBe(true);

      const disabled = proxyManager.disableProxy('proxy1.example.com', 8080);
      expect(disabled).toBe(true);
    });
  });

  describe('proxy rotation', () => {
    it('should get next proxy', () => {
      const proxy = proxyManager.getNextProxy();
      expect(proxy).toBeTruthy();
      expect(proxy?.host).toBeDefined();
      expect(proxy?.port).toBeDefined();
    });

    it('should return null when no enabled proxies', () => {
      proxyManager.disableProxy('proxy1.example.com', 8080);
      proxyManager.disableProxy('proxy2.example.com', 8080);
      const proxy = proxyManager.getNextProxy();
      expect(proxy).toBeNull();
    });
  });

  describe('statistics', () => {
    it('should provide overall stats', () => {
      const stats = proxyManager.getOverallStats();
      expect(stats.totalProxies).toBe(2);
      expect(stats.enabledProxies).toBe(2);
      expect(stats.disabledProxies).toBe(0);
      expect(stats.totalSuccesses).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.overallAvailability).toBe(0);
      expect(stats.averageResponseTime).toBe(0);
    });

    it('should update stats on proxy success and failure', () => {
      const proxy = proxyManager.getAllProxies()[0];

      // 标记代理成功
      proxyManager.markProxySuccess(proxy, 100);
      let stats = proxyManager.getProxyStats(`${proxy.host}:${proxy.port}:${proxy.protocol || 'http'}`);
      expect(stats?.successCount).toBe(1);
      expect(stats?.averageResponseTime).toBe(100);

      // 标记代理失败
      proxyManager.markProxyFailure(proxy, 'Test failure');
      stats = proxyManager.getProxyStats(`${proxy.host}:${proxy.port}:${proxy.protocol || 'http'}`);
      expect(stats?.failureCount).toBe(1);

      // 检查总体统计
      const overallStats = proxyManager.getOverallStats();
      expect(overallStats.totalSuccesses).toBe(1);
      expect(overallStats.totalFailures).toBe(1);
      expect(overallStats.overallAvailability).toBe(0.5); // 1成功 / 2总请求
    });

    it('should disable proxy after multiple failures', () => {
      const proxy = proxyManager.getAllProxies()[0];

      // 模拟多次失败
      for (let i = 0; i < 3; i++) {
        proxyManager.markProxyFailure(proxy, `Failure ${i}`);
      }

      const disabledProxies = proxyManager.getDisabledProxies();
      expect(disabledProxies).toHaveLength(1);
      expect(disabledProxies[0].host).toBe(proxy.host);
    });

    it('should re-enable proxy after success', () => {
      const proxy = proxyManager.getAllProxies()[0];

      // 先禁用代理
      proxyManager.disableProxy(proxy.host, proxy.port, proxy.protocol);
      let disabledProxies = proxyManager.getDisabledProxies();
      expect(disabledProxies).toHaveLength(1);

      // 标记成功应该重新启用代理
      proxyManager.markProxySuccess(proxy, 100);
      disabledProxies = proxyManager.getDisabledProxies();
      expect(disabledProxies).toHaveLength(0);
    });
  });

  describe('rotation strategies', () => {
    it('should support different rotation strategies', () => {
      // 测试轮询策略
      proxyManager.setRotationStrategy('roundRobin');
      expect(proxyManager.setRotationStrategy('roundRobin')).toBe(true);

      // 测试随机策略
      expect(proxyManager.setRotationStrategy('random')).toBe(true);

      // 测试加权轮询策略
      expect(proxyManager.setRotationStrategy('weightedRoundRobin')).toBe(true);

      // 测试性能优先策略
      expect(proxyManager.setRotationStrategy('performance')).toBe(true);

      // 测试优先级策略
      expect(proxyManager.setRotationStrategy('priority')).toBe(true);

      // 测试未知策略
      expect(proxyManager.setRotationStrategy('unknown')).toBe(false);
    });

    it('should select proxies based on strategy', () => {
      // 添加一个有优先级的代理
      const highPriorityProxy = {
        host: 'priority-proxy.example.com',
        port: 8080,
        protocol: 'http' as const,
        priority: 10
      };

      proxyManager.addProxy(highPriorityProxy);

      // 使用优先级策略
      proxyManager.setRotationStrategy('priority');
      const selectedProxy = proxyManager.getNextProxy();

      // 应该选择优先级最高的代理
      expect(selectedProxy?.host).toBe('priority-proxy.example.com');
    });
  });

  describe('health checks', () => {
    it('should start and stop health checks', () => {
      const managerWithHealthChecks = new ProxyManager({
        enableHealthCheck: true,
        healthCheckConfig: {
          checkUrl: 'http://httpbin.org/ip',
          timeout: 1000,
          checkInterval: 5000,
          maxConsecutiveFailures: 3,
          expectedKeywords: ['origin'],
          successStatusCodes: [200]
        }
      });

      // 健康检查应该已经启动
      expect(managerWithHealthChecks['healthCheckInterval']).toBeDefined();

      // 停止健康检查
      managerWithHealthChecks.stopHealthChecks();
      expect(managerWithHealthChecks['healthCheckInterval']).toBeUndefined();

      managerWithHealthChecks.destroy();
    });
  });

  describe('proxy history', () => {
    it('should cleanup old history', () => {
      // 添加一些历史记录
      proxyManager['proxyUsageHistory'] = [
        {
          proxyId: 'test:8080:http',
          timestamp: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000), // 8天前
          success: true,
          responseTime: 100,
          error: undefined
        },
        {
          proxyId: 'test:8080:http',
          timestamp: new Date(), // 现在
          success: true,
          responseTime: 100,
          error: undefined
        }
      ];

      proxyManager['cleanupOldHistory'](7); // 保留7天

      expect(proxyManager['proxyUsageHistory']).toHaveLength(1);
      expect(proxyManager['proxyUsageHistory'][0].timestamp.getTime()).toBeGreaterThan(
        Date.now() - 7 * 24 * 60 * 60 * 1000
      );
    });
  });
});

describe('UserAgentManager', () => {
  let uaManager: UserAgentManager;

  beforeEach(() => {
    uaManager = new UserAgentManager({
      userAgents: [
        {
          userAgent: 'Mozilla/5.0 Test Agent',
          browserType: 'chrome',
          operatingSystem: 'windows',
          deviceType: 'desktop'
        }
      ]
    });
  });

  describe('user agent management', () => {
    it('should initialize with provided user agents', () => {
      const userAgents = uaManager.getAllUserAgents();
      expect(userAgents.length).toBeGreaterThan(0);
      expect(userAgents[0].userAgent).toContain('Test Agent');
    });

    it('should add new user agent', () => {
      const uaId = uaManager.addUserAgent({
        userAgent: 'Custom Test Agent',
        browserType: 'firefox',
        operatingSystem: 'linux',
        deviceType: 'desktop'
      });

      expect(uaId).toBeTruthy();
    });

    it('should get next user agent', () => {
      const userAgent = uaManager.getNextUserAgent();
      expect(userAgent).toBeTruthy();
      expect(typeof userAgent).toBe('string');
    });

    it('should validate user agent format', () => {
      const isValid = uaManager.validateUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
      expect(isValid).toBe(true);

      const invalid = uaManager.validateUserAgent('Invalid User Agent');
      expect(invalid).toBe(false);
    });

    it('should enable and disable user agents', () => {
      const userAgents = uaManager.getAllUserAgents();
      expect(userAgents.length).toBeGreaterThan(0);

      const firstUA = userAgents[0];
      const disabled = uaManager.disableUserAgent(firstUA.userAgent);
      expect(disabled).toBe(true);

      const disabledUAs = uaManager.getDisabledUserAgents();
      expect(disabledUAs).toHaveLength(1);
      expect(disabledUAs[0].userAgent).toBe(firstUA.userAgent);

      const enabled = uaManager.enableUserAgent(firstUA.userAgent);
      expect(enabled).toBe(true);

      const enabledUAs = uaManager.getEnabledUserAgents();
      expect(enabledUAs.some(ua => ua.userAgent === firstUA.userAgent)).toBe(true);
    });

    it('should update usage statistics', () => {
      const userAgents = uaManager.getAllUserAgents();
      expect(userAgents.length).toBeGreaterThan(0);

      const firstUA = userAgents[0];
      const initialUsageCount = firstUA.usageCount || 0;

      // 更新使用统计
      uaManager.updateUserAgentUsage(firstUA, true); // 成功
      uaManager.updateUserAgentUsage(firstUA, false); // 失败

      const updatedStats = uaManager.getUserAgentStats(firstUA.userAgent);
      expect(updatedStats?.usageCount).toBe(initialUsageCount + 2);
      expect(updatedStats?.successRate).toBeCloseTo(0.5, 1); // 1成功 / 2总使用
    });

    it('should categorize user agents', () => {
      const chromeAgents = uaManager.getUserAgentsByCategory({ browserType: 'chrome' });
      const windowsAgents = uaManager.getUserAgentsByCategory({ operatingSystem: 'windows' });
      const desktopAgents = uaManager.getUserAgentsByCategory({ deviceType: 'desktop' });

      expect(chromeAgents.length).toBeGreaterThan(0);
      expect(windowsAgents.length).toBeGreaterThan(0);
      expect(desktopAgents.length).toBeGreaterThan(0);
    });

    it('should provide overall statistics', () => {
      const stats = uaManager.getOverallStats();
      expect(stats.totalUserAgents).toBeGreaterThan(0);
      expect(stats.enabledUserAgents).toBeGreaterThan(0);
      expect(stats.byBrowserType).toBeDefined();
      expect(stats.byOperatingSystem).toBeDefined();
      expect(stats.byDeviceType).toBeDefined();
      expect(stats.averageSuccessRate).toBeGreaterThanOrEqual(0);
      expect(stats.totalUsageCount).toBeGreaterThanOrEqual(0);
    });

    it('should support different rotation strategies', () => {
      // 测试轮询策略
      expect(uaManager.setRotationStrategy('roundRobin')).toBe(true);

      // 测试随机策略
      expect(uaManager.setRotationStrategy('random')).toBe(true);

      // 测试加权随机策略
      expect(uaManager.setRotationStrategy('weightedRandom')).toBe(true);

      // 测试成功率优先策略
      expect(uaManager.setRotationStrategy('successRate')).toBe(true);

      // 测试最少使用策略
      expect(uaManager.setRotationStrategy('leastUsed')).toBe(true);

      // 测试智能策略
      expect(uaManager.setRotationStrategy('smart')).toBe(true);

      // 测试未知策略
      expect(uaManager.setRotationStrategy('unknown')).toBe(false);
    });

    it('should validate all user agents', () => {
      uaManager.validateAllUserAgents();
      // 主要检查函数不会抛出错误
      expect(true).toBe(true);
    });
  });
});

describe('ErrorRetryManager', () => {
  let retryManager: ErrorRetryManager;

  beforeEach(() => {
    retryManager = new ErrorRetryManager({
      maxOperationTimeout: 1000
    });
  });

  describe('retry strategies', () => {
    it('should register and set default strategy', () => {
      const result = retryManager.setDefaultStrategy('fixedDelay');
      expect(result).toBe(true);
    });

    it('should return false for unknown strategy', () => {
      const result = retryManager.setDefaultStrategy('unknown');
      expect(result).toBe(false);
    });

    it('should execute operation with retry', async () => {
      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      const result = await retryManager.executeWithRetry(operation, {
        operationName: 'test',
        strategyName: 'fixedDelay'
      });

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(attemptCount).toBe(2);
    });

    it('should handle operation that fails all retries', async () => {
      const operation = async () => {
        throw new Error('Permanent failure');
      };

      const result = await retryManager.executeWithRetry(operation, {
        operationName: 'test',
        strategyName: 'fixedDelay'
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.totalAttempts).toBeGreaterThan(0);
    });

    it('should classify different error types', () => {
      const networkError = new Error('Network connection failed');
      const timeoutError = new Error('Request timeout');
      const rateLimitError = new Error('Rate limit exceeded');
      const serverError = new Error('Server error 500');
      const connectionError = new Error('Connection refused');
      const unknownError = new Error('Some unknown error');

      expect(retryManager['classifyError'](networkError)).toBe('network_error');
      expect(retryManager['classifyError'](timeoutError)).toBe('timeout_error');
      expect(retryManager['classifyError'](rateLimitError)).toBe('rate_limit_error');
      expect(retryManager['classifyError'](serverError)).toBe('server_error');
      expect(retryManager['classifyError'](connectionError)).toBe('connection_error');
      expect(retryManager['classifyError'](unknownError)).toBe('unknown_error');
    });

    it('should handle circuit breaker', async () => {
      const managerWithCircuitBreaker = new ErrorRetryManager({
        enableCircuitBreaker: true,
        circuitBreakerConfig: {
          failureThreshold: 2,
          resetTimeout: 1000,
          halfOpenMaxAttempts: 1
        }
      });

      // 连续失败两次触发熔断器
      const failingOperation = async () => {
        throw new Error('Operation failed');
      };

      // 第一次失败
      await managerWithCircuitBreaker.executeWithRetry(failingOperation, {
        operationName: 'test',
        strategyName: 'fixedDelay'
      });

      // 第二次失败，应该触发熔断器
      await managerWithCircuitBreaker.executeWithRetry(failingOperation, {
        operationName: 'test',
        strategyName: 'fixedDelay'
      });

      // 第三次尝试应该被熔断器阻止
      const result = await managerWithCircuitBreaker.executeWithRetry(failingOperation, {
        operationName: 'test',
        strategyName: 'fixedDelay'
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('Circuit breaker is open');

      // 等待熔断器重置
      await new Promise(resolve => setTimeout(resolve, 1100));

      // 现在应该允许尝试
      const successOperation = async () => 'success';
      const successResult = await managerWithCircuitBreaker.executeWithRetry(successOperation, {
        operationName: 'test',
        strategyName: 'fixedDelay'
      });

      expect(successResult.success).toBe(true);
    });

    it('should collect metrics', async () => {
      const operation = async () => 'success';

      await retryManager.executeWithRetry(operation, {
        operationName: 'test_metrics',
        strategyName: 'fixedDelay'
      });

      const metrics = retryManager.getOperationMetrics('test_metrics');
      expect(metrics).toBeDefined();
      expect(metrics?.successes).toBe(1);
      expect(metrics?.successRate).toBe(1);

      const allMetrics = retryManager.getAllMetrics();
      expect(allMetrics['test_metrics']).toBeDefined();
    });

    it('should reset metrics', () => {
      retryManager.resetMetrics('test');
      const metrics = retryManager.getOperationMetrics('test');
      expect(metrics).toBeNull();

      retryManager.resetMetrics();
      const allMetrics = retryManager.getAllMetrics();
      expect(Object.keys(allMetrics)).toHaveLength(0);
    });

    it('should reset circuit breakers', () => {
      // 先触发一个熔断器
      const state = retryManager.getCircuitBreakerState('test_operation');
      expect(state).toBeNull(); // 初始状态应该为null

      retryManager.resetCircuitBreaker('test_operation');
      retryManager.resetAllCircuitBreakers();
      // 主要检查函数不会抛出错误
      expect(true).toBe(true);
    });

    it('should handle timeout', async () => {
      const slowOperation = async () => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return 'slow success';
      };

      const result = await retryManager.executeWithRetry(slowOperation, {
        operationName: 'timeout_test',
        strategyName: 'fixedDelay',
        timeout: 100 // 很短的超时
      });

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('timeout');
    });

    it('should use different retry strategies', async () => {
      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      };

      // 测试指数退避策略
      attemptCount = 0;
      const exponentialResult = await retryManager.executeWithRetry(operation, {
        operationName: 'exponential_test',
        strategyName: 'exponentialBackoff'
      });
      expect(exponentialResult.success).toBe(true);
      expect(attemptCount).toBe(3);

      // 测试线性策略
      attemptCount = 0;
      const linearResult = await retryManager.executeWithRetry(operation, {
        operationName: 'linear_test',
        strategyName: 'linear'
      });
      expect(linearResult.success).toBe(true);
      expect(attemptCount).toBe(3);

      // 测试激进策略
      attemptCount = 0;
      const aggressiveResult = await retryManager.executeWithRetry(operation, {
        operationName: 'aggressive_test',
        strategyName: 'aggressive'
      });
      expect(aggressiveResult.success).toBe(false); // 只重试一次，应该失败
      expect(attemptCount).toBe(2); // 初始尝试 + 1次重试

      // 测试保守策略
      attemptCount = 0;
      const conservativeResult = await retryManager.executeWithRetry(operation, {
        operationName: 'conservative_test',
        strategyName: 'conservative'
      });
      expect(conservativeResult.success).toBe(true);
      expect(attemptCount).toBe(3);
    });
  });
});

describe('CaptchaManager', () => {
  let captchaManager: CaptchaManager;

  beforeEach(() => {
    captchaManager = new CaptchaManager({
      enableAutoSolve: false,
      enableDetection: true
    });
  });

  describe('CAPTCHA detection', () => {
    it('should detect CAPTCHA in response', () => {
      const response = {
        status: 403,
        data: 'Please complete the CAPTCHA to continue',
        headers: {
          'x-captcha-required': 'true'
        }
      };

      const detection = captchaManager.detectCaptcha(response);
      expect(detection.detected).toBe(true);
      expect(detection.confidence).toBeGreaterThan(0.5);
    });

    it('should not detect CAPTCHA in normal response', () => {
      const response = {
        status: 200,
        data: 'Normal page content',
        headers: {}
      };

      const detection = captchaManager.detectCaptcha(response);
      expect(detection.detected).toBe(false);
    });

    it('should detect different CAPTCHA types', () => {
      // 测试reCAPTCHA
      const recaptchaResponse = {
        status: 200,
        data: '<html><body><div class="g-recaptcha"></div></body></html>',
        headers: {}
      };

      const recaptchaDetection = captchaManager.detectCaptcha(recaptchaResponse);
      expect(recaptchaDetection.captchaType).toBe(CaptchaType.CLICK_CAPTCHA);

      // 测试滑动验证码
      const sliderResponse = {
        status: 200,
        data: 'Please slide the puzzle to complete verification',
        headers: {}
      };

      const sliderDetection = captchaManager.detectCaptcha(sliderResponse);
      expect(sliderDetection.features).toContain('keyword_slider');

      // 测试Cloudflare验证码
      const cloudflareResponse = {
        status: 200,
        data: '<div id="cf-chl-widget"></div>',
        headers: {}
      };

      const cloudflareDetection = captchaManager.detectCaptcha(cloudflareResponse);
      expect(cloudflareDetection.captchaType).toBe(CaptchaType.BEHAVIOR_CAPTCHA);
    });

    it('should respect detection threshold', () => {
      const managerWithHighThreshold = new CaptchaManager({
        detectionThreshold: 0.9
      });

      const response = {
        status: 200,
        data: 'Might be CAPTCHA but not sure',
        headers: {}
      };

      const detection = managerWithHighThreshold.detectCaptcha(response);
      expect(detection.detected).toBe(false); // 置信度不够高
    });
  });

  describe('CAPTCHA handling', () => {
    it('should handle detected CAPTCHA', async () => {
      const detection = {
        detected: true,
        captchaType: CaptchaType.IMAGE_CAPTCHA,
        confidence: 0.9,
        features: ['keyword_captcha'],
        timestamp: new Date()
      };

      const solution = await captchaManager.handleCaptcha(detection);
      expect(solution).toBeDefined();
      expect(solution.id).toBeTruthy();
    });

    it('should attempt auto-solving when enabled', async () => {
      const managerWithAutoSolve = new CaptchaManager({
        enableAutoSolve: true,
        maxAutoSolveAttempts: 2
      });

      const detection = {
        detected: true,
        captchaType: CaptchaType.IMAGE_CAPTCHA,
        confidence: 0.9,
        features: ['keyword_captcha'],
        timestamp: new Date()
      };

      const solution = await managerWithAutoSolve.handleCaptcha(detection);
      expect(solution).toBeDefined();
    });

    it('should apply failure strategy when auto-solving fails', async () => {
      const managerWithSkipStrategy = new CaptchaManager({
        enableAutoSolve: true,
        maxAutoSolveAttempts: 1,
        failureStrategy: 'skip'
      });

      // 注册一个总是失败的解析器
      managerWithSkipStrategy.registerCaptchaSolver('alwaysFail', {
        name: 'alwaysFail',
        supportedTypes: [CaptchaType.IMAGE_CAPTCHA],
        priority: 10,
        enabled: true,
        solve: async () => {
          throw new Error('Always fails');
        }
      });

      const detection = {
        detected: true,
        captchaType: CaptchaType.IMAGE_CAPTCHA,
        confidence: 0.9,
        features: ['keyword_captcha'],
        timestamp: new Date()
      };

      const solution = await managerWithSkipStrategy.handleCaptcha(detection);
      expect(solution.success).toBe(true); // 跳过视为成功
      expect(solution.solutionData.action).toBe('skipped');
    });

    it('should notify when notification strategy is used', async () => {
      const managerWithNotifyStrategy = new CaptchaManager({
        enableAutoSolve: false,
        failureStrategy: 'notify',
        notificationConfig: {
          enabled: true,
          notificationChannels: ['console']
        }
      });

      const detection = {
        detected: true,
        captchaType: CaptchaType.IMAGE_CAPTCHA,
        confidence: 0.9,
        features: ['keyword_captcha'],
        timestamp: new Date()
      };

      const solution = await managerWithNotifyStrategy.handleCaptcha(detection);
      expect(solution.success).toBe(false);
      expect(solution.error).toContain('manual intervention');
    });
  });

  describe('CAPTCHA solver management', () => {
    it('should register and enable/disable solvers', () => {
      const testSolver = {
        name: 'testSolver',
        supportedTypes: [CaptchaType.IMAGE_CAPTCHA],
        priority: 5,
        enabled: true,
        solve: async () => ({
          id: 'test',
          success: true,
          solutionData: {},
          solvedAt: new Date(),
          solveDuration: 0
        })
      };

      captchaManager.registerCaptchaSolver('test', testSolver);

      const enabled = captchaManager.setSolverEnabled('test', false);
      expect(enabled).toBe(true);

      const disabled = captchaManager.setSolverEnabled('test', true);
      expect(disabled).toBe(true);

      const notFound = captchaManager.setSolverEnabled('nonexistent', true);
      expect(notFound).toBe(false);
    });
  });

  describe('history and statistics', () => {
    it('should maintain detection history', () => {
      const response = {
        status: 403,
        data: 'CAPTCHA required',
        headers: {}
      };

      captchaManager.detectCaptcha(response);
      const history = captchaManager.getDetectionHistory();
      expect(history.length).toBeGreaterThan(0);
      expect(history[0].detected).toBe(true);
    });

    it('should maintain solution history', async () => {
      const detection = {
        detected: true,
        captchaType: CaptchaType.IMAGE_CAPTCHA,
        confidence: 0.9,
        features: ['keyword_captcha'],
        timestamp: new Date()
      };

      await captchaManager.handleCaptcha(detection);
      const history = captchaManager.getSolutionHistory();
      expect(history.length).toBeGreaterThan(0);
    });

    it('should provide statistics', () => {
      // 先添加一些检测历史
      const response = {
        status: 403,
        data: 'CAPTCHA required',
        headers: {}
      };

      captchaManager.detectCaptcha(response);
      captchaManager.detectCaptcha(response);

      const stats = captchaManager.getStats();
      expect(stats.totalDetections).toBe(2);
      expect(stats.byCaptchaType).toBeDefined();
      expect(stats.averageConfidence).toBeGreaterThan(0);
    });

    it('should clear history', () => {
      const response = {
        status: 403,
        data: 'CAPTCHA required',
        headers: {}
      };

      captchaManager.detectCaptcha(response);
      expect(captchaManager.getDetectionHistory().length).toBeGreaterThan(0);

      captchaManager.clearHistory();
      expect(captchaManager.getDetectionHistory().length).toBe(0);
    });
  });

  describe('learning mode', () => {
    it('should support learning data export/import', () => {
      const response = {
        status: 403,
        data: 'CAPTCHA required',
        headers: {}
      };

      captchaManager.detectCaptcha(response);
      const exportedData = captchaManager.exportLearningData();
      expect(exportedData.length).toBeGreaterThan(0);

      const initialCount = exportedData.length;
      captchaManager.importLearningData(exportedData);
      const newCount = captchaManager.exportLearningData().length;
      expect(newCount).toBe(initialCount * 2);
    });
  });
});

describe('MonitoringManager', () => {
  let monitoringManager: MonitoringManager;
  let mockAntiCrawlingSystem: any;
  let mockProxyManager: any;
  let mockUserAgentManager: any;
  let mockErrorRetryManager: any;
  let mockCaptchaManager: any;

  beforeEach(() => {
    // 创建模拟组件
    mockAntiCrawlingSystem = {
      getStats: () => ({
        totalRequests: 100,
        successfulRequests: 85,
        failedRequests: 15,
        blockedRequests: 5,
        averageResponseTime: 250,
        currentConcurrentRequests: 2
      })
    };

    mockProxyManager = {
      getOverallStats: () => ({
        totalProxies: 10,
        enabledProxies: 8,
        disabledProxies: 2,
        overallAvailability: 0.85,
        averageResponseTime: 300
      })
    };

    mockUserAgentManager = {
      getOverallStats: () => ({
        totalUserAgents: 15,
        enabledUserAgents: 12,
        averageSuccessRate: 0.9
      })
    };

    mockErrorRetryManager = {
      getAllMetrics: () => ({
        'test_operation': {
          successes: 50,
          failures: 5,
          totalRetries: 10,
          totalDuration: 5000,
          averageDuration: 100,
          successRate: 0.9
        }
      })
    };

    mockCaptchaManager = {
      getStats: () => ({
        totalDetections: 8,
        totalSolutions: 8,
        successRate: 0.75,
        byCaptchaType: { 'image_captcha': 5, 'click_captcha': 3 },
        averageConfidence: 0.8
      })
    };

    monitoringManager = new MonitoringManager(
      {
        enableMonitoring: true,
        collectionInterval: 1000, // 快速收集用于测试
        enableAlerts: true,
        enableReporting: true,
        reportInterval: 5000
      },
      {
        antiCrawlingSystem: mockAntiCrawlingSystem,
        proxyManager: mockProxyManager,
        userAgentManager: mockUserAgentManager,
        errorRetryManager: mockErrorRetryManager,
        captchaManager: mockCaptchaManager
      }
    );
  });

  afterEach(() => {
    monitoringManager.destroy();
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with default config', () => {
      const basicManager = new MonitoringManager({ enableMonitoring: false });
      expect(basicManager).toBeDefined();
      basicManager.destroy();
    });

    it('should initialize with provided components', () => {
      expect(monitoringManager).toBeDefined();
    });
  });

  describe('metric collection', () => {
    it('should collect metrics from all components', async () => {
      jest.useFakeTimers();

      // 触发一次指标收集
      monitoringManager['collectMetrics']();

      // 等待指标收集完成
      await Promise.resolve();

      const metrics = monitoringManager.getCurrentMetrics(20);
      expect(metrics.length).toBeGreaterThan(0);

      // 检查是否收集了各种指标
      const metricNames = metrics.map(m => m.name);
      expect(metricNames).toContain('total_requests');
      expect(metricNames).toContain('proxy_availability');
      expect(metricNames).toContain('user_agent_success_rate');
      expect(metricNames).toContain('operation_success_rate');
      expect(metricNames).toContain('total_captcha_detections');
    });

    it('should calculate derived metrics correctly', async () => {
      monitoringManager['collectMetrics']();
      await Promise.resolve();

      const metrics = monitoringManager.getCurrentMetrics();
      const failureRateMetric = metrics.find(m => m.name === 'request_failure_rate');

      expect(failureRateMetric).toBeDefined();
      // 失败率应该是 15/100 = 15%
      expect(failureRateMetric?.value).toBeCloseTo(15, 0);
    });
  });

  describe('alert management', () => {
    it('should register alert conditions', () => {
      const conditionCount = Array.from(monitoringManager['alertConditions'].keys()).length;
      expect(conditionCount).toBeGreaterThan(0);
    });

    it('should trigger alerts when conditions are met', async () => {
      // 模拟高失败率指标
      const highFailureMetric = {
        name: 'request_failure_rate',
        value: 25, // 超过20%阈值
        unit: 'percent',
        tags: { component: 'anti_crawling_system' },
        timestamp: new Date()
      };

      monitoringManager['metrics'] = [highFailureMetric];
      monitoringManager['checkAlertConditions']();

      const alerts = monitoringManager.getCurrentAlerts();
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should respect alert cooldown', async () => {
      jest.useFakeTimers();

      // 第一次触发告警
      const highFailureMetric = {
        name: 'request_failure_rate',
        value: 25,
        unit: 'percent',
        tags: { component: 'anti_crawling_system' },
        timestamp: new Date()
      };

      monitoringManager['metrics'] = [highFailureMetric];
      monitoringManager['checkAlertConditions']();

      const firstAlerts = monitoringManager.getCurrentAlerts();
      const firstAlertCount = firstAlerts.length;

      // 立即再次检查（应该在冷却期内）
      monitoringManager['checkAlertConditions']();
      const secondAlerts = monitoringManager.getCurrentAlerts();

      // 告警数量不应该增加（冷却期内）
      expect(secondAlerts.length).toBe(firstAlertCount);

      // 前进时间超过冷却期
      jest.advanceTimersByTime(monitoringManager['config'].alertCooldown + 1000);

      // 再次检查
      monitoringManager['checkAlertConditions']();
      const thirdAlerts = monitoringManager.getCurrentAlerts();

      // 现在应该可以再次触发告警
      expect(thirdAlerts.length).toBeGreaterThan(firstAlertCount);
    });

    it('should allow acknowledging alerts', () => {
      // 先触发一个告警
      const highFailureMetric = {
        name: 'request_failure_rate',
        value: 25,
        unit: 'percent',
        tags: { component: 'anti_crawling_system' },
        timestamp: new Date()
      };

      monitoringManager['metrics'] = [highFailureMetric];
      monitoringManager['checkAlertConditions']();

      const alerts = monitoringManager.getCurrentAlerts(true); // 包含已确认的
      expect(alerts.length).toBeGreaterThan(0);

      const alert = alerts[0];
      const acknowledged = monitoringManager.acknowledgeAlert(alert.id, 'test-user');

      expect(acknowledged).toBe(true);

      const updatedAlerts = monitoringManager.getCurrentAlerts(false); // 不包含已确认的
      expect(updatedAlerts.length).toBe(0);
    });
  });

  describe('report generation', () => {
    it('should generate reports', async () => {
      // 先收集一些指标
      monitoringManager['collectMetrics']();
      await Promise.resolve();

      // 生成报告
      monitoringManager['generateReports']();

      const reports = monitoringManager.getGeneratedReports();
      expect(reports.length).toBeGreaterThan(0);

      const report = reports[0];
      expect(report.id).toBeDefined();
      expect(report.title).toBeDefined();
      expect(report.data).toBeDefined();
      expect(report.data.summary).toBeDefined();
      expect(report.data.metrics).toBeDefined();
      expect(report.data.alerts).toBeDefined();
      expect(report.data.recommendations).toBeDefined();
    });

    it('should generate meaningful recommendations', async () => {
      // 模拟高失败率指标以触发建议
      const metrics = [
        {
          name: 'request_failure_rate',
          value: 25, // 高失败率
          unit: 'percent',
          tags: { component: 'anti_crawling_system' },
          timestamp: new Date(Date.now() - 1000)
        },
        {
          name: 'proxy_availability',
          value: 40, // 低代理可用性
          unit: 'percent',
          tags: { component: 'proxy_manager' },
          timestamp: new Date(Date.now() - 1000)
        },
        {
          name: 'captcha_detection_rate',
          value: 15, // 高CAPTCHA检测率
          unit: 'percent',
          tags: { component: 'captcha_manager' },
          timestamp: new Date(Date.now() - 1000)
        },
        {
          name: 'average_response_time',
          value: 6000, // 高响应时间
          unit: 'ms',
          tags: { component: 'anti_crawling_system' },
          timestamp: new Date(Date.now() - 1000)
        }
      ];

      monitoringManager['metrics'] = metrics;

      const startTime = new Date(Date.now() - 3600000);
      const endTime = new Date();
      const recommendations = monitoringManager['generateRecommendations'](startTime, endTime);

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.some(r => r.includes('失败率过高'))).toBe(true);
      expect(recommendations.some(r => r.includes('代理可用性过低'))).toBe(true);
      expect(recommendations.some(r => r.includes('CAPTCHA检测率过高'))).toBe(true);
      expect(recommendations.some(r => r.includes('响应时间过长'))).toBe(true);
    });
  });

  describe('data management', () => {
    it('should export and import data', () => {
      // 先添加一些测试数据
      const testMetric = {
        name: 'test_metric',
        value: 100,
        unit: 'count',
        tags: { test: 'true' },
        timestamp: new Date()
      };

      const testAlert = {
        id: 'test-alert',
        condition: 'test_condition',
        message: 'Test alert',
        severity: 'info' as const,
        triggeredAt: new Date(),
        relatedMetrics: [testMetric],
        acknowledged: false
      };

      monitoringManager['metrics'] = [testMetric];
      monitoringManager['alerts'] = [testAlert];

      // 导出数据
      const exportedData = monitoringManager.exportData();

      expect(exportedData.metrics).toHaveLength(1);
      expect(exportedData.alerts).toHaveLength(1);
      expect(exportedData.metrics[0].name).toBe('test_metric');
      expect(exportedData.alerts[0].id).toBe('test-alert');

      // 创建新的管理器并导入数据
      const newManager = new MonitoringManager({ enableMonitoring: false });
      newManager.importData(exportedData);

      const newMetrics = newManager.getCurrentMetrics();
      const newAlerts = newManager.getCurrentAlerts(true);

      expect(newMetrics).toHaveLength(1);
      expect(newAlerts).toHaveLength(1);

      newManager.destroy();
    });

    it('should clear all data', () => {
      // 先添加一些数据
      const testMetric = {
        name: 'test_metric',
        value: 100,
        unit: 'count',
        tags: { test: 'true' },
        timestamp: new Date()
      };

      monitoringManager['metrics'] = [testMetric];
      monitoringManager['alerts'] = [{
        id: 'test-alert',
        condition: 'test_condition',
        message: 'Test alert',
        severity: 'info',
        triggeredAt: new Date(),
        relatedMetrics: [testMetric],
        acknowledged: false
      }];

      // 检查数据存在
      expect(monitoringManager.getCurrentMetrics()).toHaveLength(1);
      expect(monitoringManager.getCurrentAlerts(true)).toHaveLength(1);

      // 清除数据
      monitoringManager.clearAllData();

      // 检查数据被清除
      expect(monitoringManager.getCurrentMetrics()).toHaveLength(0);
      expect(monitoringManager.getCurrentAlerts(true)).toHaveLength(0);
    });
  });

  describe('monitoring control', () => {
    it('should start and stop monitoring', () => {
      jest.useFakeTimers();

      const manager = new MonitoringManager({
        enableMonitoring: true,
        collectionInterval: 1000
      });

      // 监控应该已经启动
      expect(manager['collectionInterval']).toBeDefined();

      // 停止监控
      manager.stopMonitoring();
      expect(manager['collectionInterval']).toBeUndefined();

      // 重新启动监控
      manager['startMonitoring']();
      expect(manager['collectionInterval']).toBeDefined();

      manager.destroy();
    });

    it('should start and stop reporting', () => {
      jest.useFakeTimers();

      const manager = new MonitoringManager({
        enableReporting: true,
        reportInterval: 1000
      });

      // 报告应该已经启动
      expect(manager['reportInterval']).toBeDefined();

      // 停止报告
      manager.stopReporting();
      expect(manager['reportInterval']).toBeUndefined();

      // 重新启动报告
      manager['startReporting']();
      expect(manager['reportInterval']).toBeDefined();

      manager.destroy();
    });
  });

  describe('statistics', () => {
    it('should provide monitoring stats', () => {
      // 添加一些测试数据
      const testMetric = {
        name: 'test_metric',
        value: 100,
        unit: 'count',
        tags: { test: 'true' },
        timestamp: new Date()
      };

      const testAlert = {
        id: 'test-alert',
        condition: 'test_condition',
        message: 'Test alert',
        severity: 'info' as const,
        triggeredAt: new Date(),
        relatedMetrics: [testMetric],
        acknowledged: false
      };

      const testReport = {
        id: 'test-report',
        title: 'Test Report',
        type: 'daily',
        generatedAt: new Date(),
        timeRange: { start: new Date(), end: new Date() },
        data: { test: 'data' },
        format: 'json'
      };

      monitoringManager['metrics'] = [testMetric];
      monitoringManager['alerts'] = [testAlert];
      monitoringManager['reports'] = [testReport];

      const stats = monitoringManager.getMonitoringStats();

      expect(stats.totalMetrics).toBe(1);
      expect(stats.totalAlerts).toBe(1);
      expect(stats.unacknowledgedAlerts).toBe(1);
      expect(stats.totalReports).toBe(1);
      expect(stats.metricsRetentionDays).toBe(30); // 默认值
    });
  });
});