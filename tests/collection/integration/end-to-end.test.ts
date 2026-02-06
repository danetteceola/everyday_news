/**
 * 端到端集成测试
 * 测试整个数据采集系统的集成功能
 */

import { CollectionFramework } from '../../../src/collection/collection-framework';
import { CollectionTaskManager, TaskStatus, TaskPriority } from '../../../src/collection/task-manager/collection-task-manager';
import { PlatformType } from '../../../src/collection/types/news-item';
import { Collector } from '../../../src/collection/collection-framework';

// 模拟采集器用于测试
class MockCollector implements Collector {
  name: string;
  platform: PlatformType;
  private isInitialized: boolean = false;
  private collectionCount: number = 0;

  constructor(name: string, platform: PlatformType) {
    this.name = name;
    this.platform = platform;
  }

  async initialize(): Promise<void> {
    this.isInitialized = true;
  }

  async collect(options?: any): Promise<any[]> {
    this.collectionCount++;

    // 模拟采集数据
    return [
      {
        id: `test-item-${this.collectionCount}`,
        platform: this.platform,
        title: `测试新闻 ${this.collectionCount}`,
        content: `测试内容 ${this.collectionCount}`,
        url: `https://example.com/test-${this.collectionCount}`,
        publishedAt: new Date(),
        author: '测试作者',
        source: '测试来源'
      }
    ];
  }

  async cleanup(): Promise<void> {
    this.isInitialized = false;
  }

  getStatus() {
    return {
      isInitialized: this.isInitialized,
      lastCollectionTime: null,
      totalCollections: this.collectionCount,
      successRate: 100
    };
  }
}

describe('端到端集成测试', () => {
  describe('采集框架集成测试', () => {
    let framework: CollectionFramework;

    beforeEach(() => {
      framework = new CollectionFramework({
        enableAntiCrawling: false, // 测试中禁用反爬系统
        enableDataCleaning: false, // 测试中禁用数据清洗
        enableTaskManagement: false, // 测试中禁用任务管理
        maxConcurrentCollections: 2
      });
    });

    afterEach(async () => {
      await framework.cleanup();
    });

    test('应该能初始化采集框架', async () => {
      await framework.initialize();

      const status = framework.getStatus();
      expect(status.isInitialized).toBe(true);
    });

    test('应该能注册和初始化采集器', async () => {
      const mockCollector = new MockCollector('测试采集器', PlatformType.TWITTER);
      framework.registerCollector(mockCollector);

      await framework.initialize();

      const status = framework.getStatus();
      expect(status.totalCollectors).toBe(1);
      expect(status.collectorsByPlatform[PlatformType.TWITTER]).toBe(1);
    });

    test('应该能执行采集', async () => {
      const mockCollector = new MockCollector('测试采集器', PlatformType.TWITTER);
      framework.registerCollector(mockCollector);

      await framework.initialize();

      const results = await framework.collect({
        platforms: [PlatformType.TWITTER]
      });

      expect(results).toHaveLength(1);
      expect(results[0].platform).toBe(PlatformType.TWITTER);
      expect(results[0].itemsCollected).toBe(1);
      expect(results[0].status).toBe('success');
    });

    test('应该能处理多个采集器并发采集', async () => {
      // 注册多个采集器
      framework.registerCollector(new MockCollector('Twitter采集器1', PlatformType.TWITTER));
      framework.registerCollector(new MockCollector('Twitter采集器2', PlatformType.TWITTER));
      framework.registerCollector(new MockCollector('YouTube采集器', PlatformType.YOUTUBE));

      await framework.initialize();

      const results = await framework.collect({
        platforms: [PlatformType.TWITTER, PlatformType.YOUTUBE]
      });

      expect(results).toHaveLength(3);

      const twitterResults = results.filter(r => r.platform === PlatformType.TWITTER);
      const youtubeResults = results.filter(r => r.platform === PlatformType.YOUTUBE);

      expect(twitterResults).toHaveLength(2);
      expect(youtubeResults).toHaveLength(1);
    });

    test('应该能获取采集历史', async () => {
      const mockCollector = new MockCollector('测试采集器', PlatformType.TWITTER);
      framework.registerCollector(mockCollector);

      await framework.initialize();

      // 执行多次采集
      await framework.collect({ platforms: [PlatformType.TWITTER] });
      await framework.collect({ platforms: [PlatformType.TWITTER] });

      const history = framework.getCollectionHistory({ limit: 10 });
      expect(history).toHaveLength(2);

      // 检查历史记录按时间排序（最新的在前）
      expect(history[0].itemsCollected).toBe(1);
      expect(history[1].itemsCollected).toBe(1);
    });
  });

  describe('任务管理器集成测试', () => {
    let taskManager: CollectionTaskManager;

    beforeEach(() => {
      taskManager = new CollectionTaskManager({
        autoStartScheduler: false, // 测试中不自动启动调度器
        maxConcurrentTasks: 2,
        enableDependencyCheck: true
      });
    });

    afterEach(async () => {
      await taskManager.cleanup();
    });

    test('应该能创建和管理采集任务', async () => {
      // 创建测试任务
      const taskId = taskManager.addTask({
        id: 'test-task-1',
        platform: PlatformType.TWITTER,
        name: 'Twitter采集测试任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      expect(taskId).toBe('test-task-1');

      const task = taskManager.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.config.name).toBe('Twitter采集测试任务');
      expect(task?.status).toBe(TaskStatus.PENDING);
    });

    test('应该能注册采集器到任务管理器', () => {
      const mockCollector = new MockCollector('测试采集器', PlatformType.TWITTER);

      taskManager.registerPlatformCollector(PlatformType.TWITTER, mockCollector, {});

      // 添加任务
      const taskId = taskManager.addTask({
        id: 'test-task-2',
        platform: PlatformType.TWITTER,
        name: '测试任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      const task = taskManager.getTask(taskId);
      expect(task).toBeDefined();
    });

    test('应该能获取任务统计信息', () => {
      // 添加多个任务
      taskManager.addTask({
        id: 'task-1',
        platform: PlatformType.TWITTER,
        name: 'Twitter任务1',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.HIGH,
        maxRetries: 3,
        timeout: 300000
      });

      taskManager.addTask({
        id: 'task-2',
        platform: PlatformType.YOUTUBE,
        name: 'YouTube任务',
        enabled: false,
        schedule: 'every-6-hours',
        priority: TaskPriority.NORMAL,
        maxRetries: 2,
        timeout: 600000
      });

      const statistics = taskManager.getTaskStatistics();
      expect(statistics.totalTasks).toBe(2);
      expect(statistics.byPlatform[PlatformType.TWITTER]).toBe(1);
      expect(statistics.byPlatform[PlatformType.YOUTUBE]).toBe(1);
      expect(statistics.byStatus[TaskStatus.PENDING]).toBe(2);
    });

    test('应该能管理任务依赖', () => {
      // 创建依赖任务
      taskManager.addTask({
        id: 'dep-task',
        platform: PlatformType.TWITTER,
        name: '依赖任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      // 创建主任务（依赖上面的任务）
      taskManager.addTask({
        id: 'main-task',
        platform: PlatformType.TWITTER,
        name: '主任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000,
        dependencies: ['dep-task']
      });

      const dependencies = taskManager.getTaskDependencies('main-task');
      expect(dependencies.dependsOn).toContain('dep-task');
      expect(dependencies.dependedBy).toHaveLength(0);

      const depDependencies = taskManager.getTaskDependencies('dep-task');
      expect(depDependencies.dependedBy).toContain('main-task');
    });
  });

  describe('完整系统集成测试', () => {
    test('应该能集成所有组件并正常工作', async () => {
      // 创建完整的采集框架
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: false,
        enableTaskManagement: true,
        maxConcurrentCollections: 2
      });

      try {
        // 注册测试采集器
        const mockCollector = new MockCollector('集成测试采集器', PlatformType.TWITTER);
        framework.registerCollector(mockCollector);

        // 初始化框架
        await framework.initialize();

        // 获取任务管理器
        const taskManager = framework.getTaskManager();
        expect(taskManager).not.toBeNull();

        if (taskManager) {
          // 检查任务是否已创建
          const tasks = taskManager.getAllTasks();
          expect(tasks.length).toBeGreaterThan(0);

          // 检查任务状态
          const twitterTasks = taskManager.getTasksByPlatform(PlatformType.TWITTER);
          expect(twitterTasks.length).toBeGreaterThan(0);

          // 执行手动采集
          const results = await framework.collect({
            platforms: [PlatformType.TWITTER]
          });

          expect(results).toHaveLength(1);
          expect(results[0].platform).toBe(PlatformType.TWITTER);
          expect(results[0].status).toBe('success');

          // 检查框架状态
          const status = framework.getStatus();
          expect(status.isInitialized).toBe(true);
          expect(status.totalCollectors).toBe(1);
          expect(status.recentCollections).toHaveLength(1);
        }
      } finally {
        await framework.cleanup();
      }
    });

    test('应该能处理采集失败场景', async () => {
      // 创建会失败的模拟采集器
      class FailingCollector extends MockCollector {
        async collect(options?: any): Promise<any[]> {
          throw new Error('模拟采集失败');
        }
      }

      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: false,
        enableTaskManagement: false,
        maxConcurrentCollections: 1
      });

      try {
        const failingCollector = new FailingCollector('失败测试采集器', PlatformType.TWITTER);
        framework.registerCollector(failingCollector);

        await framework.initialize();

        const results = await framework.collect({
          platforms: [PlatformType.TWITTER]
        });

        expect(results).toHaveLength(1);
        expect(results[0].status).toBe('failed');
        expect(results[0].error).toBe('模拟采集失败');
        expect(results[0].itemsCollected).toBe(0);
      } finally {
        await framework.cleanup();
      }
    });
  });

  describe('配置管理集成测试', () => {
    test('应该能管理采集器配置', async () => {
      const framework = new CollectionFramework({
        enableAntiCrawling: false,
        enableDataCleaning: false,
        enableTaskManagement: true,
        maxConcurrentCollections: 2,
        platformConfigs: {
          [PlatformType.TWITTER]: {
            apiEnabled: true,
            webEnabled: false
          },
          [PlatformType.YOUTUBE]: {
            apiEnabled: false,
            webEnabled: true
          }
        }
      });

      try {
        // 注册多个采集器
        framework.registerCollector(new MockCollector('Twitter采集器', PlatformType.TWITTER));
        framework.registerCollector(new MockCollector('YouTube采集器', PlatformType.YOUTUBE));

        await framework.initialize();

        const status = framework.getStatus();
        expect(status.collectorsByPlatform[PlatformType.TWITTER]).toBe(1);
        expect(status.collectorsByPlatform[PlatformType.YOUTUBE]).toBe(1);
        expect(status.taskManagementStatus.enabled).toBe(true);
      } finally {
        await framework.cleanup();
      }
    });
  });
});