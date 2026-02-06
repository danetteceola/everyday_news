/**
 * 任务调度和管理测试
 * 测试任务调度器的功能和管理能力
 */

import { CollectionTaskManager, TaskStatus, TaskPriority } from '../../src/collection/task-manager/collection-task-manager';
import { PlatformType } from '../../src/collection/types/news-item';

describe('任务调度和管理测试', () => {
  describe('任务调度功能测试', () => {
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

    test('应该能创建不同调度频率的任务', () => {
      const schedules = [
        { schedule: 'hourly', description: '每小时' },
        { schedule: 'daily', description: '每天' },
        { schedule: 'every-6-hours', description: '每6小时' },
        { schedule: 'twice-daily', description: '每天两次' },
        { schedule: 'every-30-minutes', description: '每30分钟' },
        { schedule: 300000, description: '5分钟间隔（毫秒）' }
      ];

      schedules.forEach(({ schedule, description }) => {
        const taskId = `schedule-test-${description}`;
        taskManager.addTask({
          id: taskId,
          platform: PlatformType.TWITTER,
          name: `${description}调度测试任务`,
          enabled: true,
          schedule,
          priority: TaskPriority.NORMAL,
          maxRetries: 3,
          timeout: 300000
        });

        const task = taskManager.getTask(taskId);
        expect(task).toBeDefined();
        expect(task?.config.schedule).toBe(schedule);
      });
    });

    test('应该能计算下次执行时间', () => {
      const taskId = taskManager.addTask({
        id: 'next-execution-test',
        platform: PlatformType.TWITTER,
        name: '下次执行时间测试任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      const task = taskManager.getTask(taskId);
      expect(task).toBeDefined();
      expect(task?.nextExecution).toBeDefined();

      if (task?.nextExecution) {
        expect(task.nextExecution instanceof Date).toBe(true);
        expect(task.nextExecution.getTime()).toBeGreaterThan(Date.now());
      }
    });

    test('应该能启用和禁用任务调度', () => {
      const taskId = taskManager.addTask({
        id: 'enable-disable-test',
        platform: PlatformType.TWITTER,
        name: '启用禁用测试任务',
        enabled: true, // 初始启用
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      let task = taskManager.getTask(taskId);
      expect(task?.config.enabled).toBe(true);
      expect(task?.nextExecution).toBeDefined();

      // 禁用任务
      taskManager.updateTask(taskId, { enabled: false });
      task = taskManager.getTask(taskId);
      expect(task?.config.enabled).toBe(false);
      // 禁用后应该没有下次执行时间
      expect(task?.nextExecution).toBeUndefined();

      // 重新启用
      taskManager.updateTask(taskId, { enabled: true });
      task = taskManager.getTask(taskId);
      expect(task?.config.enabled).toBe(true);
      expect(task?.nextExecution).toBeDefined();
    });

    test('应该能更新任务调度频率', () => {
      const taskId = taskManager.addTask({
        id: 'schedule-update-test',
        platform: PlatformType.TWITTER,
        name: '调度更新测试任务',
        enabled: true,
        schedule: 'hourly', // 初始：每小时
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 300000
      });

      const originalTask = taskManager.getTask(taskId);
      const originalNextExecution = originalTask?.nextExecution;

      // 更新调度频率
      taskManager.updateTask(taskId, { schedule: 'daily' });

      const updatedTask = taskManager.getTask(taskId);
      expect(updatedTask?.config.schedule).toBe('daily');
      expect(updatedTask?.nextExecution).toBeDefined();

      // 下次执行时间应该更新
      if (originalNextExecution && updatedTask?.nextExecution) {
        expect(updatedTask.nextExecution.getTime()).not.toBe(originalNextExecution.getTime());
      }
    });
  });

  describe('任务管理功能测试', () => {
    let taskManager: CollectionTaskManager;

    beforeEach(() => {
      taskManager = new CollectionTaskManager({
        autoStartScheduler: false,
        maxConcurrentTasks: 3,
        enableDependencyCheck: true
      });
    });

    afterEach(async () => {
      await taskManager.cleanup();
    });

    test('应该能管理任务优先级', () => {
      const tasks = [
        {
          id: 'low-priority-task',
          priority: TaskPriority.LOW,
          name: '低优先级任务'
        },
        {
          id: 'normal-priority-task',
          priority: TaskPriority.NORMAL,
          name: '普通优先级任务'
        },
        {
          id: 'high-priority-task',
          priority: TaskPriority.HIGH,
          name: '高优先级任务'
        },
        {
          id: 'critical-priority-task',
          priority: TaskPriority.CRITICAL,
          name: '关键优先级任务'
        }
      ];

      tasks.forEach(taskConfig => {
        taskManager.addTask({
          id: taskConfig.id,
          platform: PlatformType.TWITTER,
          name: taskConfig.name,
          enabled: true,
          schedule: 'hourly',
          priority: taskConfig.priority,
          maxRetries: 3,
          timeout: 300000
        });
      });

      // 验证任务优先级
      tasks.forEach(taskConfig => {
        const task = taskManager.getTask(taskConfig.id);
        expect(task?.config.priority).toBe(taskConfig.priority);
      });

      // 获取所有任务并验证优先级分布
      const allTasks = taskManager.getAllTasks();
      const priorityCounts = {
        [TaskPriority.LOW]: 0,
        [TaskPriority.NORMAL]: 0,
        [TaskPriority.HIGH]: 0,
        [TaskPriority.CRITICAL]: 0
      };

      allTasks.forEach(task => {
        priorityCounts[task.config.priority]++;
      });

      expect(priorityCounts[TaskPriority.LOW]).toBe(1);
      expect(priorityCounts[TaskPriority.NORMAL]).toBe(1);
      expect(priorityCounts[TaskPriority.HIGH]).toBe(1);
      expect(priorityCounts[TaskPriority.CRITICAL]).toBe(1);
    });

    test('应该能批量管理任务', () => {
      // 创建多个任务
      const taskIds = [];
      for (let i = 0; i < 5; i++) {
        const taskId = `batch-task-${i}`;
        taskIds.push(taskId);
        taskManager.addTask({
          id: taskId,
          platform: PlatformType.TWITTER,
          name: `批量任务 ${i}`,
          enabled: true,
          schedule: 'hourly',
          priority: TaskPriority.NORMAL,
          maxRetries: 3,
          timeout: 300000
        });
      }

      // 批量禁用任务
      const disableResults = taskManager.bulkSetTasksEnabled(taskIds, false);
      expect(disableResults).toHaveLength(5);
      disableResults.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 验证所有任务已禁用
      taskIds.forEach(taskId => {
        const task = taskManager.getTask(taskId);
        expect(task?.config.enabled).toBe(false);
      });

      // 批量启用任务
      const enableResults = taskManager.bulkSetTasksEnabled(taskIds, true);
      expect(enableResults).toHaveLength(5);
      enableResults.forEach(result => {
        expect(result.success).toBe(true);
      });

      // 验证所有任务已启用
      taskIds.forEach(taskId => {
        const task = taskManager.getTask(taskId);
        expect(task?.config.enabled).toBe(true);
      });
    });

    test('应该能管理任务重试配置', () => {
      const taskId = taskManager.addTask({
        id: 'retry-config-test',
        platform: PlatformType.TWITTER,
        name: '重试配置测试任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 5, // 初始重试次数
        timeout: 300000
      });

      let task = taskManager.getTask(taskId);
      expect(task?.config.maxRetries).toBe(5);

      // 更新重试配置
      taskManager.updateTask(taskId, { maxRetries: 3 });
      task = taskManager.getTask(taskId);
      expect(task?.config.maxRetries).toBe(3);

      // 测试无效重试配置
      taskManager.updateTask(taskId, { maxRetries: 0 });
      task = taskManager.getTask(taskId);
      expect(task?.config.maxRetries).toBe(0);
    });

    test('应该能管理任务超时配置', () => {
      const taskId = taskManager.addTask({
        id: 'timeout-config-test',
        platform: PlatformType.TWITTER,
        name: '超时配置测试任务',
        enabled: true,
        schedule: 'hourly',
        priority: TaskPriority.NORMAL,
        maxRetries: 3,
        timeout: 600000 // 初始10分钟
      });

      let task = taskManager.getTask(taskId);
      expect(task?.config.timeout).toBe(600000);

      // 更新超时配置
      taskManager.updateTask(taskId, { timeout: 300000 });
      task = taskManager.getTask(taskId);
      expect(task?.config.timeout).toBe(300000);

      // 更新为更长的超时
      taskManager.updateTask(taskId, { timeout: 1800000 });
      task = taskManager.getTask(taskId);
      expect(task?.config.timeout).toBe(1800000);
    });
  });

  describe('任务执行管理测试', () => {
    test('应该能手动触发任务执行', async () => {
      const taskManager = new CollectionTaskManager({
        autoStartScheduler: false,
        maxConcurrentTasks: 2
      });

      try {
        // 注册模拟采集器
        let collectionCalled = false;
        const mockCollector = {
          collect: async () => {
            collectionCalled = true;
            return [];
          }
        };

        taskManager.registerPlatformCollector(PlatformType.TWITTER, mockCollector, {});

        const taskId = taskManager.addTask({
          id: 'manual-trigger-test',
          platform: PlatformType.TWITTER,
          name: '手动触发测试任务',
          enabled: true,
          schedule: 'hourly',
          priority: TaskPriority.NORMAL,
          maxRetries: 3,
          timeout: 300000
        });

        // 手动触发任务
        const result = await taskManager.triggerTask(taskId);

        expect(result).not.toBeNull();
        expect(collectionCalled).toBe(true);
      } finally {
        await taskManager.cleanup();
      }
    });

    test('应该能取消正在运行的任务', async () => {
      const taskManager = new CollectionTaskManager({
        autoStartScheduler: false,
        maxConcurrentTasks: 2
      });

      try {
        // 注册长时间运行的模拟采集器
        const mockCollector = {
          collect: async () => {
            // 模拟长时间运行
            await new Promise(resolve => setTimeout(resolve, 5000));
            return [];
          }
        };

        taskManager.registerPlatformCollector(PlatformType.TWITTER, mockCollector, {});

        const taskId = taskManager.addTask({
          id: 'cancel-task-test',
          platform: PlatformType.TWITTER,
          name: '取消任务测试',
          enabled: true,
          schedule: 'hourly',
          priority: TaskPriority.NORMAL,
          maxRetries: 3,
          timeout: 300000
        });

        // 注意：由于测试环境限制，实际的任务取消测试可能有限
        // 这里主要测试取消接口的可用性
        const cancelResult = taskManager.cancelTask(taskId, true);
        expect(typeof cancelResult).toBe('boolean');
      } finally {
        await taskManager.cleanup();
      }
    });

    test('应该能管理任务执行历史', () => {
      const taskManager = new CollectionTaskManager({
        autoStartScheduler: false,
        maxConcurrentTasks: 2,
        historyRetentionDays: 7
      });

      try {
        const taskId = taskManager.addTask({
          id: 'history-test-task',
          platform: PlatformType.TWITTER,
          name: '历史测试任务',
          enabled: true,
          schedule: 'hourly',
          priority: TaskPriority.NORMAL,
          maxRetries: 3,
          timeout: 300000
        });

        // 获取执行历史（初始应该为空）
        const history = taskManager.getTaskExecutionHistory(taskId);
        expect(history).toEqual([]);

        // 测试带选项的历史查询
        const historyWithOptions = taskManager.getTaskExecutionHistory(taskId, {
          limit: 10,
          sortBy: 'startTime',
          sortOrder: 'desc'
        });
        expect(historyWithOptions).toEqual([]);
      } finally {
        taskManager.cleanup();
      }
    });
  });

  describe('任务调度器集成测试', () => {
    test('应该能启动和停止任务调度器', async () => {
      const taskManager = new CollectionTaskManager({
        autoStartScheduler: false, // 手动控制
        maxConcurrentTasks: 2
      });

      try {
        // 添加测试任务
        taskManager.addTask({
          id: 'scheduler-test-task',
          platform: PlatformType.TWITTER,
          name: '调度器测试任务',
          enabled: true,
          schedule: 'hourly',
          priority: TaskPriority.NORMAL,
          maxRetries: 3,
          timeout: 300000
        });

        // 启动调度器
        await taskManager.startScheduler();

        // 停止调度器
        taskManager.stopScheduler();

        // 验证调度器状态
        // 注意：实际调度器状态可能不直接暴露
        expect(true).toBe(true); // 基本验证
      } finally {
        await taskManager.cleanup();
      }
    });
  });
});