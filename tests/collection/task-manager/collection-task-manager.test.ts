/**
 * 采集任务管理器单元测试
 */

import { CollectionTaskManager, TaskStatus, TaskPriority } from '../../../src/collection/task-manager/collection-task-manager';
import { PlatformType } from '../../../src/collection/types/news-item';

describe('CollectionTaskManager', () => {
  let taskManager: CollectionTaskManager;

  beforeEach(() => {
    taskManager = new CollectionTaskManager({
      autoStartScheduler: false, // 测试中不自动启动调度器
      maxConcurrentTasks: 2,
      historyRetentionDays: 1,
      enableDependencyCheck: true
    });
  });

  afterEach(async () => {
    await taskManager.cleanup();
  });

  describe('初始化', () => {
    test('应该正确初始化任务管理器', () => {
      expect(taskManager).toBeDefined();
    });

    test('应该正确设置默认配置', () => {
      const tasks = taskManager.getAllTasks();
      expect(tasks).toHaveLength(0);
    });
  });

  describe('任务管理', () => {
    const testTaskConfig = {
      id: 'test-task-1',
      platform: PlatformType.TWITTER,
      name: '测试Twitter采集任务',
      description: '测试任务描述',
      enabled: true,
      schedule: 'hourly',
      priority: TaskPriority.HIGH,
      maxRetries: 3,
      timeout: 300000
    };

    test('应该能添加任务', () => {
      const taskId = taskManager.addTask(testTaskConfig);
      expect(taskId).toBe(testTaskConfig.id);

      const task = taskManager.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.config.id).toBe(testTaskConfig.id);
      expect(task?.config.name).toBe(testTaskConfig.name);
      expect(task?.status).toBe(TaskStatus.PENDING);
    });

    test('添加任务时应该验证配置', () => {
      expect(() => {
        taskManager.addTask({
          ...testTaskConfig,
          id: '' // 空ID应该抛出错误
        });
      }).toThrow();

      expect(() => {
        taskManager.addTask({
          ...testTaskConfig,
          name: '' // 空名称应该抛出错误
        });
      }).toThrow();
    });

    test('应该能获取任务', () => {
      taskManager.addTask(testTaskConfig);
      const task = taskManager.getTask(testTaskConfig.id);
      expect(task).toBeDefined();
      expect(task?.config.id).toBe(testTaskConfig.id);
    });

    test('应该能获取所有任务', () => {
      taskManager.addTask(testTaskConfig);
      taskManager.addTask({
        ...testTaskConfig,
        id: 'test-task-2',
        platform: PlatformType.YOUTUBE
      });

      const tasks = taskManager.getAllTasks();
      expect(tasks).toHaveLength(2);
    });

    test('应该能按状态筛选任务', () => {
      taskManager.addTask(testTaskConfig);
      taskManager.addTask({
        ...testTaskConfig,
        id: 'test-task-2'
      });

      const pendingTasks = taskManager.getTasksByStatus(TaskStatus.PENDING);
      expect(pendingTasks).toHaveLength(2);
    });

    test('应该能按平台筛选任务', () => {
      taskManager.addTask(testTaskConfig);
      taskManager.addTask({
        ...testTaskConfig,
        id: 'test-task-2',
        platform: PlatformType.YOUTUBE
      });

      const twitterTasks = taskManager.getTasksByPlatform(PlatformType.TWITTER);
      expect(twitterTasks).toHaveLength(1);
      expect(twitterTasks[0].config.platform).toBe(PlatformType.TWITTER);
    });
  });

  describe('任务更新和删除', () => {
    const testTaskConfig = {
      id: 'test-task-update',
      platform: PlatformType.TWITTER,
      name: '测试更新任务',
      enabled: true,
      schedule: 'hourly',
      priority: TaskPriority.NORMAL,
      maxRetries: 3,
      timeout: 300000
    };

    beforeEach(() => {
      taskManager.addTask(testTaskConfig);
    });

    test('应该能更新任务', () => {
      const updates = {
        name: '更新后的任务名称',
        priority: TaskPriority.HIGH,
        enabled: false
      };

      const success = taskManager.updateTask(testTaskConfig.id, updates);
      expect(success).toBe(true);

      const updatedTask = taskManager.getTask(testTaskConfig.id);
      expect(updatedTask?.config.name).toBe(updates.name);
      expect(updatedTask?.config.priority).toBe(updates.priority);
      expect(updatedTask?.config.enabled).toBe(updates.enabled);
    });

    test('更新不存在的任务应该返回false', () => {
      const success = taskManager.updateTask('non-existent-task', { name: '新名称' });
      expect(success).toBe(false);
    });

    test('应该能删除任务', () => {
      const success = taskManager.deleteTask(testTaskConfig.id);
      expect(success).toBe(true);

      const task = taskManager.getTask(testTaskConfig.id);
      expect(task).toBeUndefined();
    });

    test('删除不存在的任务应该返回false', () => {
      const success = taskManager.deleteTask('non-existent-task');
      expect(success).toBe(false);
    });
  });

  describe('任务依赖管理', () => {
    test('应该能设置和检查任务依赖', () => {
      // 创建主任务
      taskManager.addTask({
        id: 'main-task',
        platform: PlatformType.TWITTER,
        name: '主任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000,
        dependencies: ['dep-task-1', 'dep-task-2']
      });

      // 创建依赖任务1
      taskManager.addTask({
        id: 'dep-task-1',
        platform: PlatformType.TWITTER,
        name: '依赖任务1',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      // 创建依赖任务2
      taskManager.addTask({
        id: 'dep-task-2',
        platform: PlatformType.TWITTER,
        name: '依赖任务2',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      // 获取依赖关系
      const dependencies = taskManager.getTaskDependencies('main-task');
      expect(dependencies.dependsOn).toContain('dep-task-1');
      expect(dependencies.dependsOn).toContain('dep-task-2');
    });

    test('应该能更新任务依赖', () => {
      taskManager.addTask({
        id: 'task-with-deps',
        platform: PlatformType.TWITTER,
        name: '有依赖的任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000,
        dependencies: ['old-dep']
      });

      taskManager.addTask({
        id: 'new-dep',
        platform: PlatformType.TWITTER,
        name: '新依赖',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      const success = taskManager.updateTaskDependencies('task-with-deps', ['new-dep']);
      expect(success).toBe(true);

      const dependencies = taskManager.getTaskDependencies('task-with-deps');
      expect(dependencies.dependsOn).toEqual(['new-dep']);
    });
  });

  describe('任务统计和监控', () => {
    beforeEach(() => {
      // 添加一些测试任务
      taskManager.addTask({
        id: 'task-1',
        platform: PlatformType.TWITTER,
        name: 'Twitter任务',
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
    });

    test('应该能获取任务统计信息', () => {
      const statistics = taskManager.getTaskStatistics();
      expect(statistics.totalTasks).toBe(2);
      expect(statistics.byStatus[TaskStatus.PENDING]).toBe(2);
      expect(statistics.byPlatform[PlatformType.TWITTER]).toBe(1);
      expect(statistics.byPlatform[PlatformType.YOUTUBE]).toBe(1);
    });

    test('应该能获取任务监控详情', () => {
      const monitoringDetails = taskManager.getTaskMonitoringDetails('task-1');
      expect(monitoringDetails.taskInfo).toBeDefined();
      expect(monitoringDetails.taskInfo?.config.id).toBe('task-1');
      expect(monitoringDetails.healthStatus).toBeDefined();
      expect(monitoringDetails.nextExecution).toBeDefined();
    });

    test('应该能获取系统健康状态', () => {
      const healthStatus = taskManager.getSystemHealthStatus();
      expect(healthStatus.overallStatus).toBeDefined();
      expect(healthStatus.tasks).toHaveLength(2);
      expect(healthStatus.statistics).toBeDefined();
      expect(Array.isArray(healthStatus.issues)).toBe(true);
    });
  });

  describe('任务执行历史', () => {
    test('应该能获取任务执行历史', () => {
      taskManager.addTask({
        id: 'history-task',
        platform: PlatformType.TWITTER,
        name: '历史任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      const history = taskManager.getTaskExecutionHistory('history-task');
      expect(history).toEqual([]); // 初始应该为空

      const historyWithOptions = taskManager.getTaskExecutionHistory('history-task', {
        limit: 10,
        sortBy: 'startTime',
        sortOrder: 'desc'
      });
      expect(historyWithOptions).toEqual([]);
    });

    test('应该能获取任务执行统计', () => {
      taskManager.addTask({
        id: 'stats-task',
        platform: PlatformType.TWITTER,
        name: '统计任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      const stats = taskManager.getTaskExecutionStatistics('stats-task');
      expect(stats.totalExecutions).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.executionTrend).toEqual([]);
    });

    test('应该能获取所有任务执行历史', () => {
      taskManager.addTask({
        id: 'task-1',
        platform: PlatformType.TWITTER,
        name: '任务1',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      taskManager.addTask({
        id: 'task-2',
        platform: PlatformType.YOUTUBE,
        name: '任务2',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      const allHistory = taskManager.getAllTasksExecutionHistory({ limit: 10 });
      expect(allHistory).toHaveLength(0); // 初始没有执行历史
    });
  });

  describe('配置管理', () => {
    test('应该能获取任务默认配置', () => {
      const twitterConfig = taskManager.getDefaultTaskConfig(PlatformType.TWITTER);
      expect(twitterConfig.priority).toBe(TaskPriority.HIGH);
      expect(twitterConfig.schedule).toBe('hourly');

      const youtubeConfig = taskManager.getDefaultTaskConfig(PlatformType.YOUTUBE);
      expect(youtubeConfig.priority).toBe(TaskPriority.HIGH);
      expect(youtubeConfig.schedule).toBe('every-6-hours');
    });

    test('应该能验证配置更改', () => {
      taskManager.addTask({
        id: 'config-task',
        platform: PlatformType.TWITTER,
        name: '配置任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      const validation = taskManager.validateConfigurationChange('config-task', {
        schedule: 'every-30-minutes',
        timeout: 10000
      });

      expect(validation.valid).toBe(true);
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);
    });

    test('应该能批量更新任务', () => {
      taskManager.addTask({
        id: 'task-1',
        platform: PlatformType.TWITTER,
        name: '任务1',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      taskManager.addTask({
        id: 'task-2',
        platform: PlatformType.YOUTUBE,
        name: '任务2',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      const updates = [
        { taskId: 'task-1', updates: { priority: TaskPriority.HIGH } },
        { taskId: 'task-2', updates: { enabled: false } }
      ];

      const results = taskManager.bulkUpdateTasks(updates);
      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);

      const task1 = taskManager.getTask('task-1');
      const task2 = taskManager.getTask('task-2');
      expect(task1?.config.priority).toBe(TaskPriority.HIGH);
      expect(task2?.config.enabled).toBe(false);
    });
  });
});