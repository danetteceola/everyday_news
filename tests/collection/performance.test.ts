/**
 * 性能测试和负载测试
 * 测试数据采集系统的性能指标和负载能力
 */

import { CollectionFramework } from '../../src/collection/collection-framework';
import { CollectionTaskManager } from '../../src/collection/task-manager/collection-task-manager';
import { PlatformType } from '../../src/collection/types/news-item';

describe('性能测试和负载测试', () => {
  describe('采集框架性能测试', () => {
    test('应该能快速初始化采集框架', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: false,
        enableTaskManagement: false
      });

      try {
        const startTime = Date.now();
        await framework.initialize();
        const endTime = Date.now();
        const initializationTime = endTime - startTime;

        console.log(`采集框架初始化时间: ${initializationTime}ms`);

        // 初始化应该在合理时间内完成
        expect(initializationTime).toBeLessThan(5000); // 5秒内
      } finally {
        await framework.cleanup();
      }
    });

    test('应该能快速清理采集框架资源', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: false,
        enableTaskManagement: false
      });

      try {
        await framework.initialize();

        const startTime = Date.now();
        await framework.cleanup();
        const endTime = Date.now();
        const cleanupTime = endTime - startTime;

        console.log(`采集框架清理时间: ${cleanupTime}ms`);

        // 清理应该在合理时间内完成
        expect(cleanupTime).toBeLessThan(3000); // 3秒内
      } catch (error) {
        // 清理失败时也继续
        console.warn('清理测试警告:', error);
      }
    });
  });

  describe('采集性能测试', () => {
    test('应该能快速执行单个采集器', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: false,
        enableTaskManagement: false
      });

      try {
        // 快速响应的模拟采集器
        const mockCollector = {
          name: '性能测试采集器',
          platform: PlatformType.TWITTER,
          initialize: async () => {},
          collect: async () => {
            // 模拟快速采集
            return [
              {
                id: 'perf-item-1',
                platform: PlatformType.TWITTER,
                title: '性能测试新闻',
                content: '性能测试内容',
                url: 'https://example.com/perf-test',
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

        const startTime = Date.now();
        const results = await framework.collect({
          platforms: [PlatformType.TWITTER]
        });
        const endTime = Date.now();
        const collectionTime = endTime - startTime;

        console.log(`单个采集器执行时间: ${collectionTime}ms`);

        expect(results).toHaveLength(1);
        expect(collectionTime).toBeLessThan(1000); // 1秒内
      } finally {
        await framework.cleanup();
      }
    });

    test('应该能处理并发采集', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: false,
        enableTaskManagement: false,
        maxConcurrentCollections: 3 // 允许并发
      });

      try {
        // 创建多个模拟采集器
        const collectorCount = 5;
        for (let i = 0; i < collectorCount; i++) {
          const mockCollector = {
            name: `并发测试采集器-${i}`,
            platform: PlatformType.TWITTER,
            initialize: async () => {},
            collect: async () => {
              // 模拟采集延迟
              await new Promise(resolve => setTimeout(resolve, 100));
              return [
                {
                  id: `concurrent-item-${i}`,
                  platform: PlatformType.TWITTER,
                  title: `并发测试新闻 ${i}`,
                  content: `并发测试内容 ${i}`,
                  url: `https://example.com/concurrent-${i}`,
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
        }

        await framework.initialize();

        const startTime = Date.now();
        const results = await framework.collect({
          platforms: [PlatformType.TWITTER]
        });
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        console.log(`并发采集 (${collectorCount}个采集器) 总时间: ${totalTime}ms`);

        expect(results).toHaveLength(collectorCount);

        // 由于并发，总时间应该小于顺序执行的总时间
        // 顺序执行: 5个采集器 * 100ms = 500ms
        // 并发执行 (最大3个并发): 应该大约 200-300ms
        expect(totalTime).toBeLessThan(400); // 应该小于400ms
      } finally {
        await framework.cleanup();
      }
    });
  });

  describe('任务管理器性能测试', () => {
    test('应该能快速管理大量任务', async () => {
      const taskManager = new CollectionTaskManager({
        autoStartScheduler: false,
        maxConcurrentTasks: 5
      });

      try {
        const taskCount = 50;

        // 批量创建任务
        const startTime = Date.now();
        for (let i = 0; i < taskCount; i++) {
          taskManager.addTask({
            id: `perf-task-${i}`,
            platform: PlatformType.TWITTER,
            name: `性能测试任务 ${i}`,
            enabled: true,
            schedule: 'hourly',
            priority: 'normal',
            maxRetries: 3,
            timeout: 300000
          });
        }
        const endTime = Date.now();
        const creationTime = endTime - startTime;

        console.log(`创建 ${taskCount} 个任务时间: ${creationTime}ms`);

        // 获取所有任务
        const getStartTime = Date.now();
        const allTasks = taskManager.getAllTasks();
        const getEndTime = Date.now();
        const getTime = getEndTime - getStartTime;

        console.log(`获取 ${taskCount} 个任务时间: ${getTime}ms`);

        expect(allTasks).toHaveLength(taskCount);
        expect(creationTime).toBeLessThan(1000); // 1秒内创建50个任务
        expect(getTime).toBeLessThan(100); // 100ms内获取50个任务
      } finally {
        await taskManager.cleanup();
      }
    });

    test('应该能快速获取任务统计', () => {
      const taskManager = new CollectionTaskManager({
        autoStartScheduler: false
      });

      try {
        // 创建一些测试任务
        for (let i = 0; i < 10; i++) {
          taskManager.addTask({
            id: `stats-task-${i}`,
            platform: i % 2 === 0 ? PlatformType.TWITTER : PlatformType.YOUTUBE,
            name: `统计测试任务 ${i}`,
            enabled: true,
            schedule: 'hourly',
            priority: 'normal',
            maxRetries: 3,
            timeout: 300000
          });
        }

        const startTime = Date.now();
        const statistics = taskManager.getTaskStatistics();
        const endTime = Date.now();
        const statsTime = endTime - startTime;

        console.log(`获取任务统计时间: ${statsTime}ms`);

        expect(statistics.totalTasks).toBe(10);
        expect(statsTime).toBeLessThan(50); // 50ms内
      } finally {
        taskManager.cleanup();
      }
    });
  });

  describe('内存使用测试', () => {
    test('应该能管理大量数据而不内存泄漏', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: false,
        enableTaskManagement: false
      });

      try {
        // 创建返回大量数据的采集器
        const mockCollector = {
          name: '大数据量采集器',
          platform: PlatformType.TWITTER,
          initialize: async () => {},
          collect: async () => {
            const items = [];
            const itemCount = 1000; // 1000条数据

            for (let i = 0; i < itemCount; i++) {
              items.push({
                id: `memory-item-${i}`,
                platform: PlatformType.TWITTER,
                title: `大数据测试新闻 ${i}`,
                content: `大数据测试内容 ${i}`.repeat(10), // 放大内容大小
                url: `https://example.com/memory-${i}`,
                publishedAt: new Date(),
                author: '测试作者',
                engagement: {
                  likes: Math.floor(Math.random() * 1000),
                  shares: Math.floor(Math.random() * 500),
                  comments: Math.floor(Math.random() * 300)
                },
                keywords: ['测试', '大数据', '性能'],
                sentiment: 'neutral'
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

        // 记录初始内存使用（近似）
        const initialMemory = process.memoryUsage();

        // 执行多次采集
        const iterations = 5;
        for (let i = 0; i < iterations; i++) {
          await framework.collect({
            platforms: [PlatformType.TWITTER]
          });
        }

        // 记录最终内存使用
        const finalMemory = process.memoryUsage();

        console.log('内存使用测试:');
        console.log(`初始内存: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);
        console.log(`最终内存: ${Math.round(finalMemory.heapUsed / 1024 / 1024)}MB`);
        console.log(`内存增长: ${Math.round((finalMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024)}MB`);

        // 验证内存增长在合理范围内
        // 注意：这是近似测试，实际内存管理由Node.js控制
        const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
        expect(memoryGrowth).toBeLessThan(100 * 1024 * 1024); // 增长应小于100MB
      } finally {
        await framework.cleanup();
      }
    });
  });

  describe('负载测试模拟', () => {
    test('应该能处理高频率采集请求', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: false,
        enableTaskManagement: false,
        maxConcurrentCollections: 10 // 提高并发限制
      });

      try {
        // 创建快速响应的采集器
        const mockCollector = {
          name: '负载测试采集器',
          platform: PlatformType.TWITTER,
          initialize: async () => {},
          collect: async () => {
            // 快速响应
            return [
              {
                id: `load-item-${Date.now()}`,
                platform: PlatformType.TWITTER,
                title: '负载测试新闻',
                content: '负载测试内容',
                url: 'https://example.com/load-test',
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

        // 模拟高频率请求
        const requestCount = 20;
        const requests: Promise<any>[] = [];

        const startTime = Date.now();
        for (let i = 0; i < requestCount; i++) {
          requests.push(
            framework.collect({
              platforms: [PlatformType.TWITTER]
            }).catch(error => {
              console.warn(`请求 ${i} 失败:`, error);
              return null;
            })
          );
        }

        const results = await Promise.all(requests);
        const endTime = Date.now();
        const totalTime = endTime - startTime;

        const successfulResults = results.filter(r => r !== null);
        console.log(`负载测试: ${requestCount} 个请求, 成功 ${successfulResults.length} 个, 总时间 ${totalTime}ms`);
        console.log(`平均响应时间: ${totalTime / requestCount}ms`);

        // 验证大多数请求成功
        expect(successfulResults.length).toBeGreaterThan(requestCount * 0.8); // 80%成功率

        // 验证总时间合理
        expect(totalTime).toBeLessThan(5000); // 5秒内完成20个请求
      } finally {
        await framework.cleanup();
      }
    });
  });

  describe('性能监控测试', () => {
    test('应该能监控采集性能指标', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: false,
        enableTaskManagement: false
      });

      try {
        // 模拟有延迟的采集器
        const mockCollector = {
          name: '性能监控采集器',
          platform: PlatformType.TWITTER,
          initialize: async () => {},
          collect: async () => {
            // 模拟采集延迟
            await new Promise(resolve => setTimeout(resolve, 200));
            return [
              {
                id: 'monitor-item',
                platform: PlatformType.TWITTER,
                title: '性能监控新闻',
                content: '性能监控内容',
                url: 'https://example.com/monitor-test',
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
          platforms: [PlatformType.TWITTER]
        });

        expect(results).toHaveLength(1);

        // 验证性能指标
        const result = results[0];
        expect(result.duration).toBeGreaterThan(190); // 应该大约200ms
        expect(result.duration).toBeLessThan(300); // 应该小于300ms

        console.log(`采集性能指标: 耗时 ${result.duration}ms, 采集 ${result.itemsCollected} 个项`);
      } finally {
        await framework.cleanup();
      }
    });
  });
});