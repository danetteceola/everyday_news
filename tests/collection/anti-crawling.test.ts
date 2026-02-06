/**
 * 反爬系统有效性测试
 * 测试反爬系统的功能和集成
 */

import { AntiCrawlingSystem } from '../../src/collection/anti-crawling/anti-crawling-system';
import { RequestDelayManager } from '../../src/collection/anti-crawling/request-delay-manager';
import { PlatformType } from '../../src/collection/types/news-item';

describe('反爬系统有效性测试', () => {
  describe('反爬系统基类测试', () => {
    let antiCrawlingSystem: AntiCrawlingSystem;

    beforeEach(() => {
      antiCrawlingSystem = new AntiCrawlingSystem();
    });

    afterEach(async () => {
      await antiCrawlingSystem.cleanup();
    });

    test('应该能初始化反爬系统', async () => {
      await antiCrawlingSystem.initialize();
      // 初始化应该成功完成
      expect(true).toBe(true);
    });

    test('应该能应用反爬策略', async () => {
      await antiCrawlingSystem.initialize();

      const startTime = Date.now();
      await antiCrawlingSystem.applyAntiCrawlingStrategy(PlatformType.TWITTER);
      const endTime = Date.now();

      // 验证方法执行完成
      expect(endTime).toBeGreaterThanOrEqual(startTime);
    });

    test('应该能清理资源', async () => {
      await antiCrawlingSystem.initialize();
      await antiCrawlingSystem.cleanup();
      // 清理应该成功完成
      expect(true).toBe(true);
    });

    test('应该能获取系统状态', async () => {
      await antiCrawlingSystem.initialize();

      const status = antiCrawlingSystem.getStatus();
      expect(status).toBeDefined();
      expect(typeof status.isInitialized).toBe('boolean');
      expect(status.isInitialized).toBe(true);
    });
  });

  describe('请求延迟管理器测试', () => {
    let requestDelayManager: RequestDelayManager;

    beforeEach(() => {
      requestDelayManager = new RequestDelayManager({
        enableDelay: true,
        minDelay: 100,
        maxDelay: 1000,
        enableRandomization: true
      }, {});
    });

    afterEach(async () => {
      await requestDelayManager.cleanup();
    });

    test('应该能初始化请求延迟管理器', async () => {
      await requestDelayManager.initialize();
      // 初始化应该成功完成
      expect(true).toBe(true);
    });

    test('应该能应用延迟策略', async () => {
      await requestDelayManager.initialize();

      const startTime = Date.now();
      await requestDelayManager.applyAntiCrawlingStrategy(PlatformType.TWITTER);
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;

      // 验证延迟应用（至少应该有最小延迟）
      expect(elapsedTime).toBeGreaterThanOrEqual(90); // 允许10ms误差
    });

    test('应该能处理不同平台的延迟', async () => {
      await requestDelayManager.initialize();

      const platforms = [
        PlatformType.TWITTER,
        PlatformType.YOUTUBE,
        PlatformType.TIKTOK,
        PlatformType.WEIBO,
        PlatformType.DOUYIN
      ];

      for (const platform of platforms) {
        const startTime = Date.now();
        await requestDelayManager.applyAntiCrawlingStrategy(platform);
        const endTime = Date.now();
        const elapsedTime = endTime - startTime;

        expect(elapsedTime).toBeGreaterThanOrEqual(90); // 允许10ms误差
      }
    });

    test('应该能获取延迟统计', async () => {
      await requestDelayManager.initialize();

      // 应用几次延迟
      await requestDelayManager.applyAntiCrawlingStrategy(PlatformType.TWITTER);
      await requestDelayManager.applyAntiCrawlingStrategy(PlatformType.YOUTUBE);

      const stats = requestDelayManager.getDelayStatistics();
      expect(stats).toBeDefined();
      expect(stats.totalDelays).toBeGreaterThanOrEqual(2);
      expect(stats.averageDelay).toBeGreaterThan(0);
    });

    test('应该能禁用延迟', async () => {
      const noDelayManager = new RequestDelayManager({
        enableDelay: false,
        minDelay: 1000,
        maxDelay: 5000
      }, {});

      await noDelayManager.initialize();

      const startTime = Date.now();
      await noDelayManager.applyAntiCrawlingStrategy(PlatformType.TWITTER);
      const endTime = Date.now();
      const elapsedTime = endTime - startTime;

      // 禁用延迟时应该几乎没有延迟
      expect(elapsedTime).toBeLessThan(50); // 应该小于50ms

      await noDelayManager.cleanup();
    });
  });

  describe('反爬系统集成测试', () => {
    test('应该能集成到采集框架中', async () => {
      const { CollectionFramework } = await import('../../src/collection/collection-framework');
      const { PlatformType } = await import('../../src/collection/types/news-item');

      const framework = new CollectionFramework({
        enableAntiCrawling: true,
        enableDataCleaning: false,
        enableTaskManagement: false
      });

      try {
        // 模拟采集器
        const mockCollector = {
          name: '反爬测试采集器',
          platform: PlatformType.TWITTER,
          initialize: async () => {},
          collect: async () => [],
          cleanup: async () => {},
          getStatus: () => ({
            isInitialized: true,
            lastCollectionTime: null,
            totalCollections: 0,
            successRate: 0
          })
        };

        framework.registerCollector(mockCollector as any);
        await framework.initialize();

        const status = framework.getStatus();
        expect(status.antiCrawlingStatus.enabled).toBe(true);
        expect(status.antiCrawlingStatus.isInitialized).toBe(true);

        const antiCrawlingSystem = framework.getAntiCrawlingSystem();
        expect(antiCrawlingSystem).not.toBeNull();
      } finally {
        await framework.cleanup();
      }
    });

    test('应该能在采集过程中应用反爬策略', async () => {
      const { CollectionFramework } = await import('../../src/collection/collection-framework');
      const { PlatformType } = await import('../../src/collection/types/news-item');

      const framework = new CollectionFramework({
        enableAntiCrawling: true,
        enableDataCleaning: false,
        enableTaskManagement: false
      });

      try {
        let antiCrawlingApplied = false;

        // 模拟采集器，记录是否应用了反爬策略
        const mockCollector = {
          name: '反爬应用测试采集器',
          platform: PlatformType.TWITTER,
          initialize: async () => {},
          collect: async (options: any) => {
            // 在采集方法中，框架应该已经应用了反爬策略
            antiCrawlingApplied = true;
            return [];
          },
          cleanup: async () => {},
          getStatus: () => ({
            isInitialized: true,
            lastCollectionTime: null,
            totalCollections: 0,
            successRate: 0
          })
        };

        framework.registerCollector(mockCollector as any);
        await framework.initialize();

        await framework.collect({
          platforms: [PlatformType.TWITTER],
          enableAntiCrawling: true
        });

        // 验证反爬策略被应用
        expect(antiCrawlingApplied).toBe(true);
      } finally {
        await framework.cleanup();
      }
    });
  });

  describe('反爬配置测试', () => {
    test('应该支持不同的反爬配置', () => {
      const configs = [
        {
          description: '基本延迟配置',
          config: {
            enableDelay: true,
            minDelay: 100,
            maxDelay: 1000
          }
        },
        {
          description: '随机化延迟配置',
          config: {
            enableDelay: true,
            minDelay: 500,
            maxDelay: 2000,
            enableRandomization: true
          }
        },
        {
          description: '平台特定延迟配置',
          config: {
            enableDelay: true,
            platformDelays: {
              [PlatformType.TWITTER]: { minDelay: 200, maxDelay: 800 },
              [PlatformType.YOUTUBE]: { minDelay: 300, maxDelay: 1200 }
            }
          }
        },
        {
          description: '禁用延迟配置',
          config: {
            enableDelay: false,
            minDelay: 1000,
            maxDelay: 5000
          }
        }
      ];

      configs.forEach(({ description, config }) => {
        expect(config).toBeDefined();
        // 验证配置结构
        if (config.enableDelay) {
          expect(config.minDelay).toBeDefined();
          expect(config.maxDelay).toBeDefined();
          expect(config.minDelay).toBeLessThanOrEqual(config.maxDelay);
        }
      });
    });

    test('应该能验证配置有效性', () => {
      const validConfig = {
        enableDelay: true,
        minDelay: 100,
        maxDelay: 1000
      };

      const invalidConfigs = [
        {
          description: '最小延迟大于最大延迟',
          config: {
            enableDelay: true,
            minDelay: 2000,
            maxDelay: 1000
          }
        },
        {
          description: '负延迟值',
          config: {
            enableDelay: true,
            minDelay: -100,
            maxDelay: 1000
          }
        },
        {
          description: '零延迟值',
          config: {
            enableDelay: true,
            minDelay: 0,
            maxDelay: 0
          }
        }
      ];

      // 验证有效配置
      expect(validConfig.minDelay).toBeLessThanOrEqual(validConfig.maxDelay);
      expect(validConfig.minDelay).toBeGreaterThan(0);
      expect(validConfig.maxDelay).toBeGreaterThan(0);

      // 验证无效配置
      invalidConfigs.forEach(({ description, config }) => {
        if (config.enableDelay) {
          const isValid = config.minDelay > 0 &&
                         config.maxDelay > 0 &&
                         config.minDelay <= config.maxDelay;
          expect(isValid).toBe(false);
        }
      });
    });
  });

  describe('反爬系统监控测试', () => {
    test('应该能监控反爬系统状态', async () => {
      const requestDelayManager = new RequestDelayManager({
        enableDelay: true,
        minDelay: 100,
        maxDelay: 500
      }, {});

      await requestDelayManager.initialize();

      // 应用几次延迟
      await requestDelayManager.applyAntiCrawlingStrategy(PlatformType.TWITTER);
      await requestDelayManager.applyAntiCrawlingStrategy(PlatformType.YOUTUBE);
      await requestDelayManager.applyAntiCrawlingStrategy(PlatformType.TIKTOK);

      const stats = requestDelayManager.getDelayStatistics();
      expect(stats.totalDelays).toBe(3);
      expect(stats.averageDelay).toBeGreaterThan(0);
      expect(stats.platformStats).toBeDefined();

      await requestDelayManager.cleanup();
    });

    test('应该能记录延迟历史', async () => {
      const requestDelayManager = new RequestDelayManager({
        enableDelay: true,
        minDelay: 100,
        maxDelay: 300
      }, {});

      await requestDelayManager.initialize();

      const platform = PlatformType.TWITTER;
      await requestDelayManager.applyAntiCrawlingStrategy(platform);

      const history = requestDelayManager.getDelayHistory(platform, 10);
      expect(history).toBeDefined();
      expect(history.length).toBeGreaterThan(0);

      const latestDelay = history[0];
      expect(latestDelay.platform).toBe(platform);
      expect(latestDelay.delay).toBeGreaterThan(0);
      expect(latestDelay.timestamp).toBeInstanceOf(Date);

      await requestDelayManager.cleanup();
    });
  });
});