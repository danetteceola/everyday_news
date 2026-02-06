/**
 * 集成测试运行器
 */

console.log('=== 数据采集系统端到端集成测试 ===\n');

async function runIntegrationTests() {
  let passed = 0;
  let failed = 0;

  // 测试1: 采集框架基本功能
  console.log('测试1: 采集框架基本功能');
  try {
    const { CollectionFramework } = await import('../../../src/collection/collection-framework');
    const { PlatformType } = await import('../../../src/collection/types/news-item');

    // 模拟采集器
    class TestCollector {
      name = '测试采集器';
      platform = PlatformType.TWITTER;
      async initialize() {}
      async collect() {
        return [{
          id: 'test-item-1',
          platform: PlatformType.TWITTER,
          title: '测试新闻',
          content: '测试内容',
          url: 'https://example.com/test',
          publishedAt: new Date()
        }];
      }
      async cleanup() {}
      getStatus() {
        return {
          isInitialized: true,
          lastCollectionTime: null,
          totalCollections: 1,
          successRate: 100
        };
      }
    }

    const framework = new CollectionFramework({
      enableAntiCrawling: false,
      enableDataCleaning: false,
      enableTaskManagement: false
    });

    const collector = new TestCollector();
    framework.registerCollector(collector as any);

    await framework.initialize();

    const status = framework.getStatus();
    if (status.isInitialized && status.totalCollectors === 1) {
      console.log('✓ 采集框架基本功能测试通过');
      passed++;
    } else {
      console.log('✗ 采集框架基本功能测试失败');
      failed++;
    }

    await framework.cleanup();

  } catch (error) {
    console.log('✗ 采集框架基本功能测试失败:', error);
    failed++;
  }

  // 测试2: 任务管理器基本功能
  console.log('\n测试2: 任务管理器基本功能');
  try {
    const { CollectionTaskManager, TaskPriority } = await import('../../../src/collection/task-manager/collection-task-manager');
    const { PlatformType } = await import('../../../src/collection/types/news-item');

    const taskManager = new CollectionTaskManager({
      autoStartScheduler: false
    });

    const taskId = taskManager.addTask({
      id: 'integration-test-task',
      platform: PlatformType.TWITTER,
      name: '集成测试任务',
      enabled: true,
      schedule: 'hourly',
      priority: TaskPriority.NORMAL,
      maxRetries: 3,
      timeout: 300000
    });

    const task = taskManager.getTask(taskId);
    if (task && task.config.id === taskId) {
      console.log('✓ 任务管理器基本功能测试通过');
      passed++;
    } else {
      console.log('✗ 任务管理器基本功能测试失败');
      failed++;
    }

    await taskManager.cleanup();

  } catch (error) {
    console.log('✗ 任务管理器基本功能测试失败:', error);
    failed++;
  }

  // 测试3: 框架和任务管理器集成
  console.log('\n测试3: 框架和任务管理器集成');
  try {
    const { CollectionFramework } = await import('../../../src/collection/collection-framework');
    const { PlatformType } = await import('../../../src/collection/types/news-item');

    const framework = new CollectionFramework({
      enableAntiCrawling: false,
      enableDataCleaning: false,
      enableTaskManagement: true
    });

    // 模拟采集器
    class TestCollector2 {
      name = '集成测试采集器';
      platform = PlatformType.TWITTER;
      async initialize() {}
      async collect() { return []; }
      async cleanup() {}
      getStatus() {
        return {
          isInitialized: true,
          lastCollectionTime: null,
          totalCollections: 0,
          successRate: 0
        };
      }
    }

    const collector = new TestCollector2();
    framework.registerCollector(collector as any);

    await framework.initialize();

    const taskManager = framework.getTaskManager();
    if (taskManager) {
      console.log('✓ 框架和任务管理器集成测试通过');
      passed++;
    } else {
      console.log('✗ 框架和任务管理器集成测试失败');
      failed++;
    }

    await framework.cleanup();

  } catch (error) {
    console.log('✗ 框架和任务管理器集成测试失败:', error);
    failed++;
  }

  // 测试4: 采集执行流程
  console.log('\n测试4: 采集执行流程');
  try {
    const { CollectionFramework } = await import('../../../src/collection/collection-framework');
    const { PlatformType } = await import('../../../src/collection/types/news-item');

    const framework = new CollectionFramework({
      enableAntiCrawling: false,
      enableDataCleaning: false,
      enableTaskManagement: false
    });

    let collectionCalled = false;

    // 模拟采集器
    class TestCollector3 {
      name = '流程测试采集器';
      platform = PlatformType.TWITTER;
      async initialize() {}
      async collect() {
        collectionCalled = true;
        return [{
          id: 'flow-test-item',
          platform: PlatformType.TWITTER,
          title: '流程测试新闻',
          content: '流程测试内容',
          url: 'https://example.com/flow-test',
          publishedAt: new Date()
        }];
      }
      async cleanup() {}
      getStatus() {
        return {
          isInitialized: true,
          lastCollectionTime: null,
          totalCollections: 1,
          successRate: 100
        };
      }
    }

    const collector = new TestCollector3();
    framework.registerCollector(collector as any);

    await framework.initialize();

    const results = await framework.collect({
      platforms: [PlatformType.TWITTER]
    });

    if (collectionCalled && results.length === 1 && results[0].status === 'success') {
      console.log('✓ 采集执行流程测试通过');
      passed++;
    } else {
      console.log('✗ 采集执行流程测试失败');
      failed++;
    }

    await framework.cleanup();

  } catch (error) {
    console.log('✗ 采集执行流程测试失败:', error);
    failed++;
  }

  // 输出测试结果
  console.log('\n=== 集成测试结果 ===');
  console.log(`总计: ${passed + failed} 个测试`);
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 所有集成测试通过！');
    process.exit(0);
  } else {
    console.log('\n❌ 有集成测试失败');
    process.exit(1);
  }
}

// 运行测试
runIntegrationTests().catch(error => {
  console.error('集成测试运行器错误:', error);
  process.exit(1);
});