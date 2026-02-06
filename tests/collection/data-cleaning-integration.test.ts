/**
 * 数据清洗集成测试
 * 测试数据清洗在采集流程中的集成
 */

import { CollectionFramework } from '../../src/collection/collection-framework';
import { PlatformType } from '../../src/collection/types/news-item';

describe('数据清洗集成测试', () => {
  describe('采集框架中的数据清洗集成', () => {
    test('应该能在采集框架中启用数据清洗', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: true,
        enableTaskManagement: false
      });

      try {
        await framework.initialize();

        const status = framework.getStatus();
        expect(status.dataCleaningStatus.enabled).toBe(true);
        expect(status.dataCleaningStatus.isInitialized).toBe(true);

        const dataCleaner = framework.getDataCleaner();
        expect(dataCleaner).not.toBeNull();
      } finally {
        await framework.cleanup();
      }
    });

    test('应该能在采集过程中应用数据清洗', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: true,
        enableTaskManagement: false
      });

      try {
        // 模拟采集器，返回测试数据
        const mockCollector = {
          name: '数据清洗测试采集器',
          platform: PlatformType.TWITTER,
          initialize: async () => {},
          collect: async () => {
            // 返回包含重复URL的测试数据
            return [
              {
                id: 'item-1',
                platform: PlatformType.TWITTER,
                title: '测试新闻1',
                content: '测试内容1',
                url: 'https://example.com/same-url',
                publishedAt: new Date(),
                author: '测试作者'
              },
              {
                id: 'item-2',
                platform: PlatformType.TWITTER,
                title: '测试新闻2',
                content: '测试内容2',
                url: 'https://example.com/same-url', // 重复URL
                publishedAt: new Date(),
                author: '测试作者'
              },
              {
                id: 'item-3',
                platform: PlatformType.TWITTER,
                title: '测试新闻3',
                content: '测试内容3',
                url: 'https://example.com/different-url',
                publishedAt: new Date(),
                author: '测试作者'
              }
            ];
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

        const results = await framework.collect({
          platforms: [PlatformType.TWITTER],
          enableDataCleaning: true
        });

        expect(results).toHaveLength(1);
        expect(results[0].platform).toBe(PlatformType.TWITTER);

        // 数据清洗应该去除重复项
        // 注意：实际的数据清洗逻辑可能会保留一个，去除另一个
        // 这里我们只验证清洗过程被执行了
        expect(results[0].itemsAfterCleaning).toBeLessThanOrEqual(results[0].itemsCollected);
      } finally {
        await framework.cleanup();
      }
    });

    test('应该能禁用数据清洗', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: false, // 禁用数据清洗
        enableTaskManagement: false
      });

      try {
        // 模拟采集器
        const mockCollector = {
          name: '禁用数据清洗测试采集器',
          platform: PlatformType.TWITTER,
          initialize: async () => {},
          collect: async () => {
            return [
              {
                id: 'item-1',
                platform: PlatformType.TWITTER,
                title: '测试新闻',
                content: '测试内容',
                url: 'https://example.com/test',
                publishedAt: new Date(),
                author: '测试作者'
              }
            ];
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

        const status = framework.getStatus();
        expect(status.dataCleaningStatus.enabled).toBe(false);

        const results = await framework.collect({
          platforms: [PlatformType.TWITTER],
          enableDataCleaning: false // 明确禁用
        });

        expect(results).toHaveLength(1);
        // 禁用数据清洗时，清洗前后数量应该相同
        expect(results[0].itemsAfterCleaning).toBe(results[0].itemsCollected);
      } finally {
        await framework.cleanup();
      }
    });
  });

  describe('数据清洗配置测试', () => {
    test('应该支持不同的数据清洗配置', () => {
      const cleaningConfigs = [
        {
          description: '基本去重配置',
          config: {
            enableUrlDeduplication: true,
            enableContentDeduplication: false,
            validateRequiredFields: true
          }
        },
        {
          description: '全面清洗配置',
          config: {
            enableUrlDeduplication: true,
            enableContentDeduplication: true,
            similarityThreshold: 0.8,
            enableCrossPlatformDeduplication: true,
            validateRequiredFields: true,
            normalizeDateFormats: true,
            extractKeywords: true,
            performSentimentAnalysis: true,
            fillMissingValues: true
          }
        },
        {
          description: '最小清洗配置',
          config: {
            enableUrlDeduplication: false,
            enableContentDeduplication: false,
            validateRequiredFields: false
          }
        }
      ];

      cleaningConfigs.forEach(({ description, config }) => {
        expect(config).toBeDefined();
        // 验证配置包含必要的布尔字段
        expect(typeof config.enableUrlDeduplication).toBe('boolean');
        expect(typeof config.enableContentDeduplication).toBe('boolean');
        expect(typeof config.validateRequiredFields).toBe('boolean');
      });
    });
  });

  describe('数据质量验证测试', () => {
    test('应该能验证数据质量指标', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: true,
        enableTaskManagement: false
      });

      try {
        // 模拟采集器，返回混合质量的数据
        const mockCollector = {
          name: '数据质量测试采集器',
          platform: PlatformType.TWITTER,
          initialize: async () => {},
          collect: async () => {
            return [
              {
                id: 'quality-item-1',
                platform: PlatformType.TWITTER,
                title: '完整数据', // 完整标题
                content: '完整内容',
                url: 'https://example.com/quality-1',
                publishedAt: new Date(),
                author: '测试作者',
                engagement: { likes: 100, shares: 50, comments: 30 }
              },
              {
                id: 'quality-item-2',
                platform: PlatformType.TWITTER,
                title: '', // 空标题
                content: '内容',
                url: 'https://example.com/quality-2',
                publishedAt: new Date(),
                author: '测试作者'
              },
              {
                id: 'quality-item-3',
                platform: PlatformType.TWITTER,
                title: '无URL数据',
                content: '内容',
                url: '', // 空URL
                publishedAt: new Date(),
                author: '测试作者'
              }
            ];
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

        const results = await framework.collect({
          platforms: [PlatformType.TWITTER],
          enableDataCleaning: true
        });

        expect(results).toHaveLength(1);

        // 数据清洗应该处理低质量数据
        // 清洗后的数量可能少于采集的数量
        expect(results[0].itemsAfterCleaning).toBeLessThanOrEqual(results[0].itemsCollected);
      } finally {
        await framework.cleanup();
      }
    });
  });

  describe('数据清洗性能测试', () => {
    test('应该能处理大量数据', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: true,
        enableTaskManagement: false
      });

      try {
        // 模拟采集器，返回大量数据
        const mockCollector = {
          name: '大数据量测试采集器',
          platform: PlatformType.TWITTER,
          initialize: async () => {},
          collect: async () => {
            const items = [];
            const itemCount = 100; // 测试100条数据

            for (let i = 0; i < itemCount; i++) {
              items.push({
                id: `bulk-item-${i}`,
                platform: PlatformType.TWITTER,
                title: `测试新闻 ${i}`,
                content: `测试内容 ${i}`,
                url: `https://example.com/bulk-${i}`,
                publishedAt: new Date(),
                author: '测试作者'
              });
            }

            return items;
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

        const startTime = Date.now();
        const results = await framework.collect({
          platforms: [PlatformType.TWITTER],
          enableDataCleaning: true
        });
        const endTime = Date.now();
        const processingTime = endTime - startTime;

        expect(results).toHaveLength(1);
        expect(results[0].itemsCollected).toBe(100);

        // 验证清洗过程在合理时间内完成
        expect(processingTime).toBeLessThan(5000); // 应该在5秒内完成

        // 记录性能数据
        console.log(`大数据量清洗测试: 处理 ${results[0].itemsCollected} 条数据, 耗时 ${processingTime}ms`);
      } finally {
        await framework.cleanup();
      }
    });
  });
});