/**
 * 采集任务管理器
 * 负责管理各平台采集任务的调度、执行和监控
 */

import { CollectionLogger, createCollectorLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { PlatformType } from '../types/news-item';
import { scheduler, TaskConfig as SystemTaskConfig, TaskExecutionResult as SystemTaskExecutionResult } from '../../system/scheduler';

// 任务状态
export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

// 任务优先级
export enum TaskPriority {
  LOW = 'low',
  NORMAL = 'normal',
  HIGH = 'high',
  CRITICAL = 'critical'
}

// 平台类型映射到采集器
export interface PlatformCollector {
  platform: PlatformType;
  collector: any; // 实际采集器实例
  config: any; // 采集器配置
}

// 任务配置
export interface TaskConfig {
  /** 任务ID */
  id: string;
  /** 平台类型 */
  platform: PlatformType;
  /** 任务名称 */
  name: string;
  /** 任务描述 */
  description?: string;
  /** 是否启用 */
  enabled: boolean;
  /** 执行频率（cron表达式或毫秒数） */
  schedule: string | number;
  /** 任务优先级 */
  priority: TaskPriority;
  /** 最大重试次数 */
  maxRetries: number;
  /** 超时时间（毫秒） */
  timeout: number;
  /** 依赖的任务ID列表 */
  dependencies?: string[];
  /** 平台特定配置 */
  platformConfig?: any;
}

// 任务执行结果
export interface TaskExecutionResult {
  /** 任务ID */
  taskId: string;
  /** 执行状态 */
  status: TaskStatus;
  /** 开始时间 */
  startTime: Date;
  /** 结束时间 */
  endTime?: Date;
  /** 执行时长（毫秒） */
  duration?: number;
  /** 采集到的新闻项数量 */
  itemsCollected?: number;
  /** 错误信息 */
  error?: string;
  /** 重试次数 */
  retryCount: number;
}

// 任务实例
export interface TaskInstance {
  /** 任务配置 */
  config: TaskConfig;
  /** 当前状态 */
  status: TaskStatus;
  /** 上次执行结果 */
  lastExecution?: TaskExecutionResult;
  /** 执行历史 */
  executionHistory: TaskExecutionResult[];
  /** 下次执行时间 */
  nextExecution?: Date;
  /** 重试次数 */
  retryCount: number;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

// 管理器配置
export interface CollectionTaskManagerConfig {
  /** 是否自动启动调度器 */
  autoStartScheduler: boolean;
  /** 最大并发任务数 */
  maxConcurrentTasks: number;
  /** 任务执行历史保留天数 */
  historyRetentionDays: number;
  /** 是否启用任务依赖检查 */
  enableDependencyCheck: boolean;
  /** 默认任务配置 */
  defaultTaskConfig?: Partial<TaskConfig>;
}

export class CollectionTaskManager {
  private config: CollectionTaskManagerConfig;
  private logger: CollectionLogger;
  private errorHandler: CollectionErrorHandler;

  /** 任务映射表 */
  private tasks: Map<string, TaskInstance> = new Map();

  /** 平台采集器映射 */
  private platformCollectors: Map<PlatformType, PlatformCollector> = new Map();

  /** 系统调度器集成 */
  private systemScheduler = scheduler;
  private systemTaskIds: Map<string, string> = new Map(); // 映射: collectionTaskId -> systemTaskId

  /** 正在运行的任务 */
  private runningTasks: Map<string, Promise<any>> = new Map();

  /** 任务队列（按优先级排序） */
  private taskQueue: Array<{ taskId: string; priority: TaskPriority; scheduledTime: Date }> = [];

  constructor(config: Partial<CollectionTaskManagerConfig> = {}) {
    this.config = {
      autoStartScheduler: true,
      maxConcurrentTasks: 3,
      historyRetentionDays: 30,
      enableDependencyCheck: true,
      ...config
    };

    this.logger = createCollectorLogger('task-manager');
    this.errorHandler = new CollectionErrorHandler();

    this.logger.info('采集任务管理器初始化');
  }

  /**
   * 初始化管理器
   */
  async initialize(): Promise<void> {
    this.logger.info('初始化采集任务管理器...');

    try {
      // 清理过期的执行历史
      await this.cleanupOldHistory();

      // 初始化调度器
      if (this.config.autoStartScheduler) {
        await this.startScheduler();
      }

      this.logger.info('采集任务管理器初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '初始化', platform: 'task-manager' });
      throw error;
    }
  }

  /**
   * 注册平台采集器
   */
  registerPlatformCollector(platform: PlatformType, collector: any, config: any): void {
    this.platformCollectors.set(platform, {
      platform,
      collector,
      config
    });

    this.logger.info(`注册平台采集器: ${platform}`);
  }

  /**
   * 添加任务
   */
  addTask(taskConfig: TaskConfig): string {
    // 验证任务配置
    this.validateTaskConfig(taskConfig);

    const taskInstance: TaskInstance = {
      config: taskConfig,
      status: TaskStatus.PENDING,
      executionHistory: [],
      retryCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.tasks.set(taskConfig.id, taskInstance);

    // 如果任务启用，安排执行
    if (taskConfig.enabled) {
      this.scheduleTask(taskConfig.id);
    }

    this.logger.info(`添加任务: ${taskConfig.name} (${taskConfig.id})`);
    return taskConfig.id;
  }

  /**
   * 更新任务
   */
  updateTask(taskId: string, updates: Partial<TaskConfig>): boolean {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      this.logger.warn(`任务不存在: ${taskId}`);
      return false;
    }

    // 验证更新配置
    try {
      const newConfig = { ...taskInstance.config, ...updates };
      this.validateTaskConfig(newConfig);
    } catch (error) {
      this.logger.error(`更新任务配置验证失败: ${taskId}`, error as Error);
      return false;
    }

    // 记录旧配置用于比较
    const oldConfig = { ...taskInstance.config };

    // 合并更新
    taskInstance.config = { ...oldConfig, ...updates };
    taskInstance.updatedAt = new Date();

    // 检查需要重新安排的变化
    let needsReschedule = false;

    // 如果启用状态改变，重新安排或取消安排
    if (oldConfig.enabled !== taskInstance.config.enabled) {
      if (taskInstance.config.enabled) {
        this.scheduleTask(taskId);
      } else {
        this.unscheduleTask(taskId);
      }
      needsReschedule = true;
    }

    // 如果调度频率改变，重新安排
    if (oldConfig.schedule !== taskInstance.config.schedule) {
      needsReschedule = true;
    }

    // 如果优先级改变，更新任务队列排序
    if (oldConfig.priority !== taskInstance.config.priority) {
      // 优先级改变会影响任务队列排序，但不需要立即重新安排
      this.logger.debug(`任务优先级更新: ${taskId}, 从 ${oldConfig.priority} 改为 ${taskInstance.config.priority}`);
    }

    // 如果最大重试次数改变，更新重试逻辑
    if (oldConfig.maxRetries !== taskInstance.config.maxRetries) {
      this.logger.debug(`任务最大重试次数更新: ${taskId}, 从 ${oldConfig.maxRetries} 改为 ${taskInstance.config.maxRetries}`);
    }

    // 如果超时时间改变，更新执行逻辑
    if (oldConfig.timeout !== taskInstance.config.timeout) {
      this.logger.debug(`任务超时时间更新: ${taskId}, 从 ${oldConfig.timeout} 改为 ${taskInstance.config.timeout}`);
    }

    // 如果平台配置改变，可能需要更新采集器
    if (JSON.stringify(oldConfig.platformConfig) !== JSON.stringify(taskInstance.config.platformConfig)) {
      this.logger.debug(`任务平台配置更新: ${taskId}`);
    }

    // 如果需要重新安排，更新调度
    if (needsReschedule && taskInstance.config.enabled) {
      this.scheduleTask(taskId);
    }

    this.logger.info(`更新任务: ${taskId}, 更新字段: ${Object.keys(updates).join(', ')}`);
    return true;
  }

  /**
   * 删除任务
   */
  deleteTask(taskId: string): boolean {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      return false;
    }

    // 取消安排任务
    this.unscheduleTask(taskId);

    // 从任务映射中移除
    this.tasks.delete(taskId);

    this.logger.info(`删除任务: ${taskId}`);
    return true;
  }

  /**
   * 获取任务
   */
  getTask(taskId: string): TaskInstance | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * 获取所有任务
   */
  getAllTasks(): TaskInstance[] {
    return Array.from(this.tasks.values());
  }

  /**
   * 获取按状态筛选的任务
   */
  getTasksByStatus(status: TaskStatus): TaskInstance[] {
    return Array.from(this.tasks.values()).filter(task => task.status === status);
  }

  /**
   * 获取按平台筛选的任务
   */
  getTasksByPlatform(platform: PlatformType): TaskInstance[] {
    return Array.from(this.tasks.values()).filter(task => task.config.platform === platform);
  }

  /**
   * 手动触发任务
   */
  async triggerTask(taskId: string, options: {
    force?: boolean;
    skipDependencies?: boolean;
    priority?: TaskPriority;
  } = {}): Promise<TaskExecutionResult | null> {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      this.logger.warn(`手动触发任务失败: 任务不存在 ${taskId}`);
      return null;
    }

    // 检查任务是否启用（除非强制触发）
    if (!taskInstance.config.enabled && !options.force) {
      this.logger.warn(`手动触发任务失败: 任务未启用 ${taskId}`);
      return null;
    }

    // 检查任务是否正在运行（除非强制触发）
    if (taskInstance.status === TaskStatus.RUNNING && !options.force) {
      this.logger.warn(`手动触发任务失败: 任务正在运行 ${taskId}`);
      return null;
    }

    // 检查任务依赖（除非跳过依赖检查）
    if (this.config.enableDependencyCheck && !options.skipDependencies) {
      const dependenciesSatisfied = await this.checkDependencies(taskId);
      if (!dependenciesSatisfied && !options.force) {
        this.logger.warn(`手动触发任务失败: 依赖任务未完成 ${taskId}`);
        return null;
      }
    }

    // 如果任务正在运行且强制触发，先取消任务
    if (taskInstance.status === TaskStatus.RUNNING && options.force) {
      this.logger.info(`强制触发任务: 先取消正在运行的任务 ${taskId}`);
      this.cancelTask(taskId);
      // 等待一小段时间让任务取消
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.logger.info(`手动触发任务: ${taskId}, 选项: ${JSON.stringify(options)}`);

    // 使用指定的优先级或任务配置的优先级
    const originalPriority = taskInstance.config.priority;
    if (options.priority) {
      taskInstance.config.priority = options.priority;
    }

    try {
      return await this.executeTask(taskId);
    } finally {
      // 恢复原始优先级
      if (options.priority) {
        taskInstance.config.priority = originalPriority;
      }
    }
  }

  /**
   * 取消任务
   */
  cancelTask(taskId: string, force: boolean = false): boolean {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      this.logger.warn(`取消任务失败: 任务不存在 ${taskId}`);
      return false;
    }

    if (taskInstance.status !== TaskStatus.RUNNING && !force) {
      this.logger.warn(`取消任务失败: 任务未在运行 ${taskId}, 状态: ${taskInstance.status}`);
      return false;
    }

    // 获取正在运行的任务Promise
    const runningPromise = this.runningTasks.get(taskId);
    if (runningPromise && force) {
      // 尝试中止Promise（注意：这不会真正中止异步操作）
      // 实际的任务取消需要采集器支持取消机制
      this.logger.debug(`尝试强制取消任务Promise: ${taskId}`);
    }

    // 标记任务为取消中
    taskInstance.status = TaskStatus.CANCELLED;
    taskInstance.updatedAt = new Date();

    // 从运行任务列表中移除
    this.runningTasks.delete(taskId);

    // 记录取消的执行结果
    const cancellationResult: TaskExecutionResult = {
      taskId,
      status: TaskStatus.CANCELLED,
      startTime: taskInstance.lastExecution?.startTime || new Date(),
      endTime: new Date(),
      duration: taskInstance.lastExecution?.duration || 0,
      retryCount: taskInstance.retryCount,
      error: '任务被手动取消'
    };

    taskInstance.lastExecution = cancellationResult;
    taskInstance.executionHistory.push(cancellationResult);

    this.logger.info(`取消任务: ${taskId}, 强制模式: ${force}`);
    return true;
  }

  /**
   * 手动触发所有任务
   */
  async triggerAllTasks(options: {
    platform?: PlatformType;
    priority?: TaskPriority;
    concurrent?: boolean;
    skipDependencies?: boolean;
  } = {}): Promise<Array<{ taskId: string; result: TaskExecutionResult | null }>> {
    this.logger.info(`手动触发所有任务, 选项: ${JSON.stringify(options)}`);

    let tasksToTrigger = Array.from(this.tasks.values());

    // 按平台过滤
    if (options.platform) {
      tasksToTrigger = tasksToTrigger.filter(task => task.config.platform === options.platform);
    }

    // 按优先级过滤
    if (options.priority) {
      tasksToTrigger = tasksToTrigger.filter(task => task.config.priority === options.priority);
    }

    // 按启用状态过滤
    tasksToTrigger = tasksToTrigger.filter(task => task.config.enabled);

    // 按优先级排序
    tasksToTrigger.sort((a, b) => {
      const priorityOrder = {
        [TaskPriority.CRITICAL]: 4,
        [TaskPriority.HIGH]: 3,
        [TaskPriority.NORMAL]: 2,
        [TaskPriority.LOW]: 1
      };
      return priorityOrder[b.config.priority] - priorityOrder[a.config.priority];
    });

    const results: Array<{ taskId: string; result: TaskExecutionResult | null }> = [];

    if (options.concurrent) {
      // 并发执行
      const promises = tasksToTrigger.map(async task => {
        try {
          const result = await this.triggerTask(task.config.id, {
            skipDependencies: options.skipDependencies,
            priority: options.priority
          });
          return { taskId: task.config.id, result };
        } catch (error) {
          this.logger.error(`并发触发任务失败: ${task.config.id}`, error as Error);
          return { taskId: task.config.id, result: null };
        }
      });

      const concurrentResults = await Promise.all(promises);
      results.push(...concurrentResults);
    } else {
      // 顺序执行
      for (const task of tasksToTrigger) {
        try {
          const result = await this.triggerTask(task.config.id, {
            skipDependencies: options.skipDependencies,
            priority: options.priority
          });
          results.push({ taskId: task.config.id, result });
        } catch (error) {
          this.logger.error(`顺序触发任务失败: ${task.config.id}`, error as Error);
          results.push({ taskId: task.config.id, result: null });
        }
      }
    }

    this.logger.info(`手动触发所有任务完成, 共触发 ${results.length} 个任务`);
    return results;
  }

  /**
   * 取消所有正在运行的任务
   */
  cancelAllRunningTasks(force: boolean = false): Array<{ taskId: string; success: boolean }> {
    const runningTasks = Array.from(this.tasks.values()).filter(task => task.status === TaskStatus.RUNNING);
    const results: Array<{ taskId: string; success: boolean }> = [];

    this.logger.info(`取消所有正在运行的任务, 共 ${runningTasks.length} 个, 强制模式: ${force}`);

    for (const task of runningTasks) {
      const success = this.cancelTask(task.config.id, force);
      results.push({ taskId: task.config.id, success });
    }

    return results;
  }

  /**
   * 启动调度器
   */
  async startScheduler(): Promise<void> {
    this.logger.info('启动任务调度器...');

    try {
      // 使用系统调度器
      this.systemScheduler.start();

      // 注册所有启用的任务到系统调度器
      for (const taskInstance of this.tasks.values()) {
        if (taskInstance.config.enabled) {
          this.registerTaskWithSystemScheduler(taskInstance.config.id);
        }
      }

      this.logger.info('任务调度器启动完成，已集成到系统调度器');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '启动调度器', platform: 'task-manager' });
      throw error;
    }
  }

  /**
   * 停止调度器
   */
  stopScheduler(): void {
    this.logger.info('停止任务调度器...');

    // 从系统调度器中移除所有任务
    for (const systemTaskId of this.systemTaskIds.values()) {
      try {
        this.systemScheduler.removeTask(systemTaskId);
      } catch (error) {
        this.logger.warn(`从系统调度器移除任务失败: ${systemTaskId}`, error as Error);
      }
    }
    this.systemTaskIds.clear();

    // 停止系统调度器
    this.systemScheduler.stop();

    this.logger.info('任务调度器已停止');
  }

  /**
   * 处理任务队列（由系统调度器调用）
   * 注意：这个方法现在由系统调度器直接调用，不再需要定时检查
   */
  private async processTaskQueue(): Promise<void> {
    // 这个方法保留用于向后兼容，但实际任务执行由系统调度器直接触发
    this.logger.debug('processTaskQueue called, but tasks are now handled by system scheduler');
  }

  /**
   * 执行任务
   */
  private async executeTask(taskId: string): Promise<TaskExecutionResult> {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      throw new CollectionError(`任务不存在: ${taskId}`, CollectionErrorType.CONFIGURATION_ERROR, 'task-manager');
    }

    // 更新任务状态
    taskInstance.status = TaskStatus.RUNNING;
    taskInstance.updatedAt = new Date();

    const executionResult: TaskExecutionResult = {
      taskId,
      status: TaskStatus.RUNNING,
      startTime: new Date(),
      retryCount: taskInstance.retryCount
    };

    try {
      this.logger.info(`开始执行任务: ${taskInstance.config.name}`);

      // 获取平台采集器
      const platformCollector = this.platformCollectors.get(taskInstance.config.platform);
      if (!platformCollector) {
        throw new CollectionError(
          `平台采集器未注册: ${taskInstance.config.platform}`,
          CollectionErrorType.CONFIGURATION_ERROR,
          'task-manager'
        );
      }

      // 执行采集
      const items = await platformCollector.collector.collect();

      // 更新执行结果
      executionResult.status = TaskStatus.COMPLETED;
      executionResult.endTime = new Date();
      executionResult.duration = executionResult.endTime.getTime() - executionResult.startTime.getTime();
      executionResult.itemsCollected = items.length;

      // 更新任务状态
      taskInstance.status = TaskStatus.COMPLETED;
      taskInstance.retryCount = 0;

      this.logger.info(`任务执行完成: ${taskInstance.config.name}, 采集到 ${items.length} 个新闻项`);
    } catch (error) {
      // 处理错误
      executionResult.status = TaskStatus.FAILED;
      executionResult.endTime = new Date();
      executionResult.duration = executionResult.endTime.getTime() - executionResult.startTime.getTime();
      executionResult.error = (error as Error).message;

      // 更新任务状态
      taskInstance.status = TaskStatus.FAILED;
      taskInstance.retryCount++;

      this.logger.error(`任务执行失败: ${taskInstance.config.name}`, error as Error, undefined, 'executeTask');

      // 检查是否需要重试
      if (taskInstance.retryCount < taskInstance.config.maxRetries) {
        this.logger.info(`任务将重试: ${taskInstance.config.name}, 重试次数: ${taskInstance.retryCount}`);
        this.scheduleRetry(taskId);
      }
    } finally {
      // 记录执行历史
      executionResult.retryCount = taskInstance.retryCount;
      taskInstance.lastExecution = executionResult;
      taskInstance.executionHistory.push(executionResult);
      taskInstance.updatedAt = new Date();

      // 从运行任务列表中移除
      this.runningTasks.delete(taskId);

      // 安排下次执行
      if (taskInstance.config.enabled && taskInstance.status !== TaskStatus.FAILED) {
        this.scheduleTask(taskId);
      }
    }

    return executionResult;
  }

  /**
   * 注册任务到系统调度器
   */
  private registerTaskWithSystemScheduler(taskId: string): void {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance || !taskInstance.config.enabled) {
      return;
    }

    // 如果任务已注册，先取消注册
    const existingSystemTaskId = this.systemTaskIds.get(taskId);
    if (existingSystemTaskId) {
      try {
        this.systemScheduler.removeTask(existingSystemTaskId);
      } catch (error) {
        this.logger.warn(`取消注册系统任务失败: ${existingSystemTaskId}`, error as Error);
      }
      this.systemTaskIds.delete(taskId);
    }

    // 将调度配置转换为cron表达式
    const cronExpression = this.convertScheduleToCron(taskInstance.config.schedule);
    if (!cronExpression) {
      this.logger.warn(`无法将调度配置转换为cron表达式: ${taskInstance.config.schedule}, 任务: ${taskId}`);
      return;
    }

    // 创建系统任务配置
    const systemTaskId = `collection_${taskId}_${Date.now()}`;
    const systemTaskConfig: SystemTaskConfig = {
      id: systemTaskId,
      name: `采集任务: ${taskInstance.config.name}`,
      cronExpression,
      command: this.createTaskCommand(taskId),
      enabled: true,
      description: `平台: ${taskInstance.config.platform}, 优先级: ${taskInstance.config.priority}`,
      timeout: taskInstance.config.timeout
    };

    try {
      // 注册到系统调度器
      this.systemScheduler.addTask(systemTaskConfig);
      this.systemTaskIds.set(taskId, systemTaskId);

      // 监听系统调度器事件
      this.setupSystemSchedulerListeners(systemTaskId, taskId);

      this.logger.debug(`任务注册到系统调度器: ${taskId} -> ${systemTaskId}, cron: ${cronExpression}`);
    } catch (error) {
      this.logger.error(`注册任务到系统调度器失败: ${taskId}`, error as Error);
    }
  }

  /**
   * 将调度配置转换为cron表达式
   */
  private convertScheduleToCron(schedule: string | number): string | null {
    if (typeof schedule === 'number') {
      // 毫秒间隔转换为cron（简单实现：每分钟执行）
      // 实际应该根据间隔计算合适的cron表达式
      return '*/1 * * * *'; // 每分钟
    }

    // 预定义调度到cron映射
    const scheduleToCron: Record<string, string> = {
      'hourly': '0 * * * *', // 每小时
      'daily': '0 0 * * *', // 每天午夜
      'every-6-hours': '0 */6 * * *', // 每6小时
      'every-12-hours': '0 */12 * * *', // 每12小时
      'twice-daily': '0 0,12 * * *', // 每天两次（0点和12点）
      'every-30-minutes': '*/30 * * * *', // 每30分钟
      'every-2-hours': '0 */2 * * *', // 每2小时
      'every-4-hours': '0 */4 * * *', // 每4小时
      'weekly': '0 0 * * 0' // 每周日
    };

    // 检查是否是cron表达式
    if (schedule.includes('*') || schedule.includes('/') || schedule.includes(',')) {
      // 可能是cron表达式，验证格式
      const cronParts = schedule.split(' ');
      if (cronParts.length === 5) {
        return schedule;
      }
    }

    return scheduleToCron[schedule] || '0 * * * *'; // 默认每小时
  }

  /**
   * 创建任务执行命令
   */
  private createTaskCommand(taskId: string): string {
    // 创建一个命令来执行采集任务
    // 这里假设有一个CLI命令或API端点来执行任务
    const scriptPath = process.argv[1] || 'src/cli/collection-cli.ts';
    return `node ${scriptPath} execute-task ${taskId}`;
  }

  /**
   * 设置系统调度器监听器
   */
  private setupSystemSchedulerListeners(systemTaskId: string, collectionTaskId: string): void {
    // 监听任务开始事件
    this.systemScheduler.on('taskStarted', (taskId: string) => {
      if (taskId === systemTaskId) {
        this.logger.debug(`系统调度器开始执行任务: ${collectionTaskId}`);
      }
    });

    // 监听任务完成事件
    this.systemScheduler.on('taskCompleted', (taskId: string, result: SystemTaskExecutionResult) => {
      if (taskId === systemTaskId) {
        this.logger.debug(`系统调度器任务完成: ${collectionTaskId}, 结果: ${result.success ? '成功' : '失败'}`);
      }
    });

    // 监听任务失败事件
    this.systemScheduler.on('taskFailed', (taskId: string, error: string) => {
      if (taskId === systemTaskId) {
        this.logger.error(`系统调度器任务失败: ${collectionTaskId}`, new Error(error));
      }
    });
  }

  /**
   * 安排任务执行
   */
  private scheduleTask(taskId: string): void {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      return;
    }

    // 计算下次执行时间
    const nextExecution = this.calculateNextExecutionTime(taskInstance.config.schedule);
    taskInstance.nextExecution = nextExecution;
    taskInstance.status = TaskStatus.PENDING;
    taskInstance.updatedAt = new Date();

    // 注册到系统调度器
    this.registerTaskWithSystemScheduler(taskId);

    this.logger.debug(`安排任务执行: ${taskId}, 下次执行时间: ${nextExecution?.toISOString()}`);
  }

  /**
   * 取消安排任务
   */
  private unscheduleTask(taskId: string): void {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      return;
    }

    // 从系统调度器中移除
    const systemTaskId = this.systemTaskIds.get(taskId);
    if (systemTaskId) {
      try {
        this.systemScheduler.removeTask(systemTaskId);
      } catch (error) {
        this.logger.warn(`从系统调度器移除任务失败: ${systemTaskId}`, error as Error);
      }
      this.systemTaskIds.delete(taskId);
    }

    taskInstance.nextExecution = undefined;
    taskInstance.status = TaskStatus.PENDING;
    taskInstance.updatedAt = new Date();

    this.logger.debug(`取消安排任务: ${taskId}`);
  }

  /**
   * 安排重试
   */
  private scheduleRetry(taskId: string): void {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      return;
    }

    // 使用指数退避计算重试延迟
    const baseDelay = 60000; // 1分钟
    const maxDelay = 3600000; // 1小时
    const delay = Math.min(baseDelay * Math.pow(2, taskInstance.retryCount - 1), maxDelay);

    const retryTime = new Date(Date.now() + delay);
    taskInstance.nextExecution = retryTime;
    taskInstance.status = TaskStatus.PENDING;
    taskInstance.updatedAt = new Date();

    this.logger.info(`安排任务重试: ${taskId}, 重试时间: ${retryTime.toISOString()}`);
  }

  /**
   * 计算下次执行时间
   */
  private calculateNextExecutionTime(schedule: string | number): Date {
    if (typeof schedule === 'number') {
      // 毫秒数间隔
      return new Date(Date.now() + schedule);
    } else {
      // 支持多种调度格式
      try {
        // 预定义调度格式
        const predefinedSchedules: Record<string, number> = {
          'hourly': 60 * 60 * 1000,
          'daily': 24 * 60 * 60 * 1000,
          'every-6-hours': 6 * 60 * 60 * 1000,
          'every-12-hours': 12 * 60 * 60 * 1000,
          'twice-daily': 12 * 60 * 60 * 1000, // 每天两次
          'every-30-minutes': 30 * 60 * 1000,
          'every-2-hours': 2 * 60 * 60 * 1000,
          'every-4-hours': 4 * 60 * 60 * 1000,
          'weekly': 7 * 24 * 60 * 60 * 1000
        };

        if (predefinedSchedules[schedule]) {
          return new Date(Date.now() + predefinedSchedules[schedule]);
        }

        // 尝试解析为cron表达式（简单实现）
        // 格式: "0 * * * *" 表示每小时
        // 格式: "0 0 * * *" 表示每天午夜
        // 格式: "0 */6 * * *" 表示每6小时
        const cronParts = schedule.split(' ');
        if (cronParts.length === 5) {
          // 简单cron解析：只处理分钟和小时部分
          const minute = cronParts[0];
          const hour = cronParts[1];

          const now = new Date();
          const next = new Date(now);

          // 处理分钟部分
          if (minute === '*') {
            next.setMinutes(now.getMinutes() + 1);
            next.setSeconds(0);
            next.setMilliseconds(0);
          } else if (minute.startsWith('*/')) {
            const interval = parseInt(minute.substring(2));
            if (!isNaN(interval)) {
              const nextMinute = Math.ceil((now.getMinutes() + 1) / interval) * interval;
              next.setMinutes(nextMinute);
              next.setSeconds(0);
              next.setMilliseconds(0);
            }
          } else {
            const targetMinute = parseInt(minute);
            if (!isNaN(targetMinute)) {
              next.setMinutes(targetMinute);
              next.setSeconds(0);
              next.setMilliseconds(0);
              if (next <= now) {
                next.setHours(next.getHours() + 1);
              }
            }
          }

          // 处理小时部分
          if (hour !== '*') {
            if (hour.startsWith('*/')) {
              const interval = parseInt(hour.substring(2));
              if (!isNaN(interval)) {
                const currentHour = now.getHours();
                const nextHour = Math.ceil((currentHour + 1) / interval) * interval;
                next.setHours(nextHour);
                if (nextHour < currentHour) {
                  next.setDate(next.getDate() + 1);
                }
              }
            } else {
              const targetHour = parseInt(hour);
              if (!isNaN(targetHour)) {
                next.setHours(targetHour);
                if (next <= now) {
                  next.setDate(next.getDate() + 1);
                }
              }
            }
          }

          return next;
        }

        // 默认每小时
        return new Date(Date.now() + 60 * 60 * 1000);
      } catch {
        // 解析失败，默认每小时
        return new Date(Date.now() + 60 * 60 * 1000);
      }
    }
  }

  /**
   * 检查任务依赖
   */
  private async checkDependencies(taskId: string): Promise<boolean> {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance || !taskInstance.config.dependencies || taskInstance.config.dependencies.length === 0) {
      return true;
    }

    // 检查循环依赖
    const visited = new Set<string>();
    const hasCycle = this.checkForCyclicDependency(taskId, visited);
    if (hasCycle) {
      this.logger.error(`检测到循环依赖: ${taskId}`);
      return false;
    }

    for (const depTaskId of taskInstance.config.dependencies) {
      const depTask = this.tasks.get(depTaskId);
      if (!depTask) {
        this.logger.warn(`依赖任务不存在: ${depTaskId}`);
        return false;
      }

      // 检查依赖任务是否启用
      if (!depTask.config.enabled) {
        this.logger.debug(`依赖任务未启用: ${depTaskId}`);
        return false;
      }

      // 检查依赖任务是否成功完成
      if (depTask.status !== TaskStatus.COMPLETED) {
        this.logger.debug(`依赖任务未完成: ${depTaskId}, 状态: ${depTask.status}`);
        return false;
      }

      // 检查依赖任务是否在合理时间内完成
      if (depTask.lastExecution) {
        const timeSinceLastExecution = Date.now() - depTask.lastExecution.endTime!.getTime();
        const maxAge = this.getDependencyMaxAge(taskInstance.config.platform, depTask.config.platform);
        if (timeSinceLastExecution > maxAge) {
          this.logger.debug(`依赖任务执行时间过久: ${depTaskId}, 已过 ${Math.round(timeSinceLastExecution / 1000 / 60)} 分钟`);
          return false;
        }
      } else {
        // 依赖任务从未执行过
        this.logger.debug(`依赖任务从未执行: ${depTaskId}`);
        return false;
      }

      // 检查依赖任务是否执行成功（没有错误）
      if (depTask.lastExecution?.status === TaskStatus.FAILED) {
        this.logger.debug(`依赖任务执行失败: ${depTaskId}`);
        return false;
      }
    }

    return true;
  }

  /**
   * 检查循环依赖
   */
  private checkForCyclicDependency(taskId: string, visited: Set<string>): boolean {
    if (visited.has(taskId)) {
      return true;
    }

    visited.add(taskId);
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance || !taskInstance.config.dependencies) {
      visited.delete(taskId);
      return false;
    }

    for (const depTaskId of taskInstance.config.dependencies) {
      if (this.checkForCyclicDependency(depTaskId, visited)) {
        return true;
      }
    }

    visited.delete(taskId);
    return false;
  }

  /**
   * 获取依赖最大年龄（根据平台类型）
   */
  private getDependencyMaxAge(platform: PlatformType, depPlatform: PlatformType): number {
    // 默认依赖最大年龄：24小时
    const defaultMaxAge = 24 * 60 * 60 * 1000;

    // 平台特定的依赖时效性
    const platformMaxAges: Record<PlatformType, number> = {
      twitter: 2 * 60 * 60 * 1000, // Twitter数据时效性较短：2小时
      youtube: 6 * 60 * 60 * 1000, // YouTube数据时效性：6小时
      tiktok: 4 * 60 * 60 * 1000, // TikTok数据时效性：4小时
      weibo: 2 * 60 * 60 * 1000, // 微博数据时效性：2小时
      douyin: 4 * 60 * 60 * 1000 // 抖音数据时效性：4小时
    };

    // 使用依赖平台或当前平台中较小的时效性
    const depMaxAge = platformMaxAges[depPlatform] || defaultMaxAge;
    const currentMaxAge = platformMaxAges[platform] || defaultMaxAge;

    return Math.min(depMaxAge, currentMaxAge);
  }

  /**
   * 验证任务配置
   */
  private validateTaskConfig(config: TaskConfig): void {
    if (!config.id || config.id.trim() === '') {
      throw new CollectionError('任务ID不能为空', CollectionErrorType.CONFIGURATION_ERROR, 'task-manager');
    }

    if (!config.platform) {
      throw new CollectionError('平台类型不能为空', CollectionErrorType.CONFIGURATION_ERROR, 'task-manager');
    }

    if (!config.name || config.name.trim() === '') {
      throw new CollectionError('任务名称不能为空', CollectionErrorType.CONFIGURATION_ERROR, 'task-manager');
    }

    if (!config.schedule) {
      throw new CollectionError('执行频率不能为空', CollectionErrorType.CONFIGURATION_ERROR, 'task-manager');
    }

    if (config.maxRetries < 0) {
      throw new CollectionError('最大重试次数不能为负数', CollectionErrorType.CONFIGURATION_ERROR, 'task-manager');
    }

    if (config.timeout <= 0) {
      throw new CollectionError('超时时间必须大于0', CollectionErrorType.CONFIGURATION_ERROR, 'task-manager');
    }

    // 检查ID是否已存在
    if (this.tasks.has(config.id)) {
      throw new CollectionError(`任务ID已存在: ${config.id}`, CollectionErrorType.CONFIGURATION_ERROR, 'task-manager');
    }

    // 检查依赖任务是否存在（如果指定了依赖）
    if (config.dependencies && config.dependencies.length > 0) {
      for (const depTaskId of config.dependencies) {
        if (depTaskId === config.id) {
          throw new CollectionError(`任务不能依赖自身: ${config.id}`, CollectionErrorType.CONFIGURATION_ERROR, 'task-manager');
        }
        // 注意：这里不检查依赖任务是否存在，因为依赖任务可能稍后添加
      }
    }
  }

  /**
   * 清理过期的执行历史
   */
  private async cleanupOldHistory(): Promise<void> {
    const retentionDays = this.config.historyRetentionDays;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    for (const taskInstance of this.tasks.values()) {
      taskInstance.executionHistory = taskInstance.executionHistory.filter(
        execution => execution.endTime && execution.endTime > cutoffDate
      );
    }

    this.logger.debug(`清理了超过 ${retentionDays} 天的执行历史`);
  }

  /**
   * 获取任务统计信息
   */
  getTaskStatistics(): {
    totalTasks: number;
    byStatus: Record<TaskStatus, number>;
    byPlatform: Record<PlatformType, number>;
    runningTasks: number;
    pendingTasks: number;
    successRate: number;
    averageExecutionTime: number;
    failedTasks: number;
    last24Hours: {
      completed: number;
      failed: number;
      total: number;
    };
  } {
    const tasks = Array.from(this.tasks.values());
    const byStatus: Record<TaskStatus, number> = {
      [TaskStatus.PENDING]: 0,
      [TaskStatus.RUNNING]: 0,
      [TaskStatus.COMPLETED]: 0,
      [TaskStatus.FAILED]: 0,
      [TaskStatus.CANCELLED]: 0
    };

    const byPlatform: Record<PlatformType, number> = {};

    // 计算24小时内的执行统计
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let last24HoursCompleted = 0;
    let last24HoursFailed = 0;
    let totalExecutionTime = 0;
    let executionCount = 0;

    tasks.forEach(task => {
      byStatus[task.status]++;
      const platform = task.config.platform;
      byPlatform[platform] = (byPlatform[platform] || 0) + 1;

      // 分析执行历史
      for (const execution of task.executionHistory) {
        if (execution.endTime && execution.endTime > twentyFourHoursAgo) {
          if (execution.status === TaskStatus.COMPLETED) {
            last24HoursCompleted++;
          } else if (execution.status === TaskStatus.FAILED) {
            last24HoursFailed++;
          }

          if (execution.duration) {
            totalExecutionTime += execution.duration;
            executionCount++;
          }
        }
      }
    });

    const total24Hours = last24HoursCompleted + last24HoursFailed;
    const successRate = total24Hours > 0 ? (last24HoursCompleted / total24Hours) * 100 : 0;
    const averageExecutionTime = executionCount > 0 ? totalExecutionTime / executionCount : 0;

    return {
      totalTasks: tasks.length,
      byStatus,
      byPlatform,
      runningTasks: byStatus[TaskStatus.RUNNING],
      pendingTasks: byStatus[TaskStatus.PENDING],
      successRate: Math.round(successRate * 100) / 100, // 保留两位小数
      averageExecutionTime: Math.round(averageExecutionTime),
      failedTasks: byStatus[TaskStatus.FAILED],
      last24Hours: {
        completed: last24HoursCompleted,
        failed: last24HoursFailed,
        total: total24Hours
      }
    };
  }

  /**
   * 获取任务依赖关系
   */
  getTaskDependencies(taskId: string): { dependsOn: string[], dependedBy: string[] } {
    const dependsOn: string[] = [];
    const dependedBy: string[] = [];

    const taskInstance = this.tasks.get(taskId);
    if (taskInstance && taskInstance.config.dependencies) {
      dependsOn.push(...taskInstance.config.dependencies);
    }

    // 查找哪些任务依赖于此任务
    for (const [otherTaskId, otherTaskInstance] of this.tasks.entries()) {
      if (otherTaskInstance.config.dependencies && otherTaskInstance.config.dependencies.includes(taskId)) {
        dependedBy.push(otherTaskId);
      }
    }

    return { dependsOn, dependedBy };
  }

  /**
   * 更新任务依赖
   */
  updateTaskDependencies(taskId: string, dependencies: string[]): boolean {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      return false;
    }

    // 检查循环依赖
    const visited = new Set<string>();
    visited.add(taskId);
    for (const depTaskId of dependencies) {
      if (this.checkForCyclicDependency(depTaskId, visited)) {
        this.logger.error(`更新依赖失败: 检测到循环依赖 ${taskId} -> ${depTaskId}`);
        return false;
      }
    }

    // 更新依赖
    taskInstance.config.dependencies = dependencies;
    taskInstance.updatedAt = new Date();

    this.logger.info(`更新任务依赖: ${taskId}, 新依赖: ${dependencies.join(', ')}`);
    return true;
  }

  /**
   * 获取任务监控详情
   */
  getTaskMonitoringDetails(taskId: string): {
    taskInfo: TaskInstance | null;
    recentExecutions: TaskExecutionResult[];
    performanceMetrics: {
      successRate: number;
      averageDuration: number;
      failureRate: number;
      lastSuccessfulExecution: Date | null;
      lastFailedExecution: Date | null;
    };
    healthStatus: 'healthy' | 'warning' | 'critical';
    nextExecution: Date | null;
    dependencies: { dependsOn: string[], dependedBy: string[] };
  } {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      return {
        taskInfo: null,
        recentExecutions: [],
        performanceMetrics: {
          successRate: 0,
          averageDuration: 0,
          failureRate: 0,
          lastSuccessfulExecution: null,
          lastFailedExecution: null
        },
        healthStatus: 'critical',
        nextExecution: null,
        dependencies: { dependsOn: [], dependedBy: [] }
      };
    }

    // 获取最近执行记录
    const recentExecutions = this.getTaskExecutionHistory(taskId, 10);

    // 计算性能指标（基于最近50次执行）
    const executionHistory = this.getTaskExecutionHistory(taskId, 50);
    const successfulExecutions = executionHistory.filter(e => e.status === TaskStatus.COMPLETED);
    const failedExecutions = executionHistory.filter(e => e.status === TaskStatus.FAILED);

    const successRate = executionHistory.length > 0 ? (successfulExecutions.length / executionHistory.length) * 100 : 0;
    const failureRate = executionHistory.length > 0 ? (failedExecutions.length / executionHistory.length) * 100 : 0;

    const totalDuration = successfulExecutions.reduce((sum, e) => sum + (e.duration || 0), 0);
    const averageDuration = successfulExecutions.length > 0 ? totalDuration / successfulExecutions.length : 0;

    const lastSuccessfulExecution = successfulExecutions.length > 0
      ? successfulExecutions[0].endTime || null
      : null;

    const lastFailedExecution = failedExecutions.length > 0
      ? failedExecutions[0].endTime || null
      : null;

    // 确定健康状态
    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';

    if (taskInstance.status === TaskStatus.FAILED && taskInstance.retryCount >= taskInstance.config.maxRetries) {
      healthStatus = 'critical';
    } else if (failureRate > 30) {
      healthStatus = 'critical';
    } else if (failureRate > 10 || taskInstance.retryCount > 0) {
      healthStatus = 'warning';
    }

    // 检查任务是否长时间未执行
    if (lastSuccessfulExecution) {
      const timeSinceLastSuccess = Date.now() - lastSuccessfulExecution.getTime();
      const expectedInterval = this.getExpectedExecutionInterval(taskInstance.config.schedule);

      if (timeSinceLastSuccess > expectedInterval * 2) {
        healthStatus = 'warning';
      }
      if (timeSinceLastSuccess > expectedInterval * 4) {
        healthStatus = 'critical';
      }
    }

    return {
      taskInfo: taskInstance,
      recentExecutions,
      performanceMetrics: {
        successRate: Math.round(successRate * 100) / 100,
        averageDuration: Math.round(averageDuration),
        failureRate: Math.round(failureRate * 100) / 100,
        lastSuccessfulExecution,
        lastFailedExecution
      },
      healthStatus,
      nextExecution: taskInstance.nextExecution || null,
      dependencies: this.getTaskDependencies(taskId)
    };
  }

  /**
   * 获取预期执行间隔
   */
  private getExpectedExecutionInterval(schedule: string | number): number {
    if (typeof schedule === 'number') {
      return schedule;
    }

    const predefinedIntervals: Record<string, number> = {
      'hourly': 60 * 60 * 1000,
      'daily': 24 * 60 * 60 * 1000,
      'every-6-hours': 6 * 60 * 60 * 1000,
      'every-12-hours': 12 * 60 * 60 * 1000,
      'twice-daily': 12 * 60 * 60 * 1000,
      'every-30-minutes': 30 * 60 * 1000,
      'every-2-hours': 2 * 60 * 60 * 1000,
      'every-4-hours': 4 * 60 * 60 * 1000,
      'weekly': 7 * 24 * 60 * 60 * 1000
    };

    return predefinedIntervals[schedule] || 60 * 60 * 1000; // 默认1小时
  }

  /**
   * 获取系统健康状态
   */
  getSystemHealthStatus(): {
    overallStatus: 'healthy' | 'warning' | 'critical';
    tasks: Array<{
      taskId: string;
      name: string;
      platform: PlatformType;
      status: TaskStatus;
      healthStatus: 'healthy' | 'warning' | 'critical';
      lastExecution: Date | null;
      nextExecution: Date | null;
    }>;
    statistics: ReturnType<typeof this.getTaskStatistics>;
    issues: Array<{
      type: 'failed_task' | 'stuck_task' | 'dependency_issue' | 'scheduler_issue';
      taskId?: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
    }>;
  } {
    const tasks = Array.from(this.tasks.values());
    const taskHealthStatuses: Array<{
      taskId: string;
      name: string;
      platform: PlatformType;
      status: TaskStatus;
      healthStatus: 'healthy' | 'warning' | 'critical';
      lastExecution: Date | null;
      nextExecution: Date | null;
    }> = [];

    const issues: Array<{
      type: 'failed_task' | 'stuck_task' | 'dependency_issue' | 'scheduler_issue';
      taskId?: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
    }> = [];

    // 分析每个任务的健康状态
    for (const task of tasks) {
      const monitoringDetails = this.getTaskMonitoringDetails(task.config.id);
      const healthStatus = monitoringDetails.healthStatus;

      taskHealthStatuses.push({
        taskId: task.config.id,
        name: task.config.name,
        platform: task.config.platform,
        status: task.status,
        healthStatus,
        lastExecution: task.lastExecution?.endTime || null,
        nextExecution: task.nextExecution || null
      });

      // 记录问题
      if (healthStatus === 'critical') {
        if (task.status === TaskStatus.FAILED && task.retryCount >= task.config.maxRetries) {
          issues.push({
            type: 'failed_task',
            taskId: task.config.id,
            description: `任务 ${task.config.name} 已失败并达到最大重试次数`,
            severity: 'high'
          });
        } else if (task.lastExecution && task.lastExecution.status === TaskStatus.FAILED) {
          issues.push({
            type: 'failed_task',
            taskId: task.config.id,
            description: `任务 ${task.config.name} 最近一次执行失败`,
            severity: 'medium'
          });
        }
      }

      // 检查卡住的任务（长时间运行）
      if (task.status === TaskStatus.RUNNING && task.lastExecution?.startTime) {
        const runningTime = Date.now() - task.lastExecution.startTime.getTime();
        if (runningTime > task.config.timeout) {
          issues.push({
            type: 'stuck_task',
            taskId: task.config.id,
            description: `任务 ${task.config.name} 运行时间超过超时限制`,
            severity: 'high'
          });
        }
      }

      // 检查调度器问题
      if (task.config.enabled && !task.nextExecution) {
        issues.push({
          type: 'scheduler_issue',
          taskId: task.config.id,
          description: `任务 ${task.config.name} 已启用但未安排执行时间`,
          severity: 'medium'
        });
      }
    }

    // 检查调度器状态
    if (!this.scheduler || !this.scheduler.isRunning) {
      issues.push({
        type: 'scheduler_issue',
        description: '任务调度器未运行',
        severity: 'high'
      });
    }

    // 确定整体状态
    let overallStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    const criticalCount = taskHealthStatuses.filter(t => t.healthStatus === 'critical').length;
    const warningCount = taskHealthStatuses.filter(t => t.healthStatus === 'warning').length;

    if (criticalCount > 0 || issues.some(i => i.severity === 'high')) {
      overallStatus = 'critical';
    } else if (warningCount > 0 || issues.some(i => i.severity === 'medium')) {
      overallStatus = 'warning';
    }

    return {
      overallStatus,
      tasks: taskHealthStatuses,
      statistics: this.getTaskStatistics(),
      issues
    };
  }

  /**
   * 获取任务执行历史
   */
  getTaskExecutionHistory(taskId: string, options: {
    limit?: number;
    offset?: number;
    startDate?: Date;
    endDate?: Date;
    status?: TaskStatus;
    minDuration?: number;
    maxDuration?: number;
    sortBy?: 'startTime' | 'endTime' | 'duration' | 'itemsCollected';
    sortOrder?: 'asc' | 'desc';
  } = {}): TaskExecutionResult[] {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      return [];
    }

    const {
      limit = 50,
      offset = 0,
      startDate,
      endDate,
      status,
      minDuration,
      maxDuration,
      sortBy = 'startTime',
      sortOrder = 'desc'
    } = options;

    // 过滤执行历史
    let filteredHistory = taskInstance.executionHistory.filter(execution => {
      // 按时间过滤
      if (startDate && execution.startTime && execution.startTime < startDate) {
        return false;
      }
      if (endDate && execution.startTime && execution.startTime > endDate) {
        return false;
      }

      // 按状态过滤
      if (status && execution.status !== status) {
        return false;
      }

      // 按执行时长过滤
      if (minDuration && (!execution.duration || execution.duration < minDuration)) {
        return false;
      }
      if (maxDuration && (!execution.duration || execution.duration > maxDuration)) {
        return false;
      }

      return true;
    });

    // 排序
    filteredHistory.sort((a, b) => {
      let aValue: any, bValue: any;

      switch (sortBy) {
        case 'startTime':
          aValue = a.startTime?.getTime() || 0;
          bValue = b.startTime?.getTime() || 0;
          break;
        case 'endTime':
          aValue = a.endTime?.getTime() || 0;
          bValue = b.endTime?.getTime() || 0;
          break;
        case 'duration':
          aValue = a.duration || 0;
          bValue = b.duration || 0;
          break;
        case 'itemsCollected':
          aValue = a.itemsCollected || 0;
          bValue = b.itemsCollected || 0;
          break;
        default:
          aValue = a.startTime?.getTime() || 0;
          bValue = b.startTime?.getTime() || 0;
      }

      if (sortOrder === 'asc') {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });

    // 分页
    return filteredHistory.slice(offset, offset + limit);
  }

  /**
   * 批量更新任务配置
   */
  bulkUpdateTasks(updates: Array<{ taskId: string; updates: Partial<TaskConfig> }>): Array<{ taskId: string; success: boolean; error?: string }> {
    const results: Array<{ taskId: string; success: boolean; error?: string }> = [];

    this.logger.info(`批量更新任务配置, 共 ${updates.length} 个任务`);

    for (const { taskId, updates: taskUpdates } of updates) {
      try {
        const success = this.updateTask(taskId, taskUpdates);
        results.push({ taskId, success, error: success ? undefined : '更新失败' });
      } catch (error) {
        results.push({
          taskId,
          success: false,
          error: (error as Error).message
        });
      }
    }

    return results;
  }

  /**
   * 启用/禁用任务
   */
  setTaskEnabled(taskId: string, enabled: boolean): boolean {
    return this.updateTask(taskId, { enabled });
  }

  /**
   * 批量启用/禁用任务
   */
  bulkSetTasksEnabled(taskIds: string[], enabled: boolean): Array<{ taskId: string; success: boolean }> {
    const results: Array<{ taskId: string; success: boolean }> = [];

    this.logger.info(`批量${enabled ? '启用' : '禁用'}任务, 共 ${taskIds.length} 个任务`);

    for (const taskId of taskIds) {
      const success = this.setTaskEnabled(taskId, enabled);
      results.push({ taskId, success });
    }

    return results;
  }

  /**
   * 更新任务调度频率
   */
  updateTaskSchedule(taskId: string, schedule: string | number): boolean {
    return this.updateTask(taskId, { schedule });
  }

  /**
   * 更新任务优先级
   */
  updateTaskPriority(taskId: string, priority: TaskPriority): boolean {
    return this.updateTask(taskId, { priority });
  }

  /**
   * 批量更新任务优先级
   */
  bulkUpdateTaskPriorities(updates: Array<{ taskId: string; priority: TaskPriority }>): Array<{ taskId: string; success: boolean }> {
    const results: Array<{ taskId: string; success: boolean }> = [];

    this.logger.info(`批量更新任务优先级, 共 ${updates.length} 个任务`);

    for (const { taskId, priority } of updates) {
      const success = this.updateTaskPriority(taskId, priority);
      results.push({ taskId, success });
    }

    return results;
  }

  /**
   * 获取任务默认配置
   */
  getDefaultTaskConfig(platform: PlatformType): Partial<TaskConfig> {
    // 平台默认配置
    const platformDefaults: Record<PlatformType, Partial<TaskConfig>> = {
      twitter: {
        priority: TaskPriority.HIGH,
        schedule: 'hourly',
        maxRetries: 3,
        timeout: 300000, // 5分钟
        enabled: true
      },
      youtube: {
        priority: TaskPriority.HIGH,
        schedule: 'every-6-hours',
        maxRetries: 3,
        timeout: 600000, // 10分钟
        enabled: true
      },
      tiktok: {
        priority: TaskPriority.NORMAL,
        schedule: 'twice-daily',
        maxRetries: 2,
        timeout: 300000, // 5分钟
        enabled: true
      },
      weibo: {
        priority: TaskPriority.HIGH,
        schedule: 'hourly',
        maxRetries: 3,
        timeout: 300000, // 5分钟
        enabled: true
      },
      douyin: {
        priority: TaskPriority.NORMAL,
        schedule: 'twice-daily',
        maxRetries: 2,
        timeout: 300000, // 5分钟
        enabled: true
      }
    };

    const defaultConfig: Partial<TaskConfig> = {
      priority: TaskPriority.NORMAL,
      schedule: 'daily',
      maxRetries: 2,
      timeout: 300000, // 5分钟
      enabled: true,
      ...platformDefaults[platform]
    };

    return defaultConfig;
  }

  /**
   * 验证配置更改是否有效
   */
  validateConfigurationChange(taskId: string, updates: Partial<TaskConfig>): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      errors.push(`任务不存在: ${taskId}`);
      return { valid: false, errors, warnings };
    }

    // 创建临时配置进行验证
    const tempConfig = { ...taskInstance.config, ...updates };

    try {
      this.validateTaskConfig(tempConfig);
    } catch (error) {
      errors.push((error as Error).message);
    }

    // 检查调度频率变化
    if (updates.schedule && updates.schedule !== taskInstance.config.schedule) {
      const oldInterval = this.getExpectedExecutionInterval(taskInstance.config.schedule);
      const newInterval = this.getExpectedExecutionInterval(updates.schedule);

      if (newInterval < oldInterval / 2) {
        warnings.push(`调度频率显著增加: 从 ${this.formatInterval(oldInterval)} 改为 ${this.formatInterval(newInterval)}，可能增加反爬风险`);
      }
    }

    // 检查超时时间变化
    if (updates.timeout && updates.timeout !== taskInstance.config.timeout) {
      if (updates.timeout < 60000) {
        warnings.push(`超时时间过短: ${updates.timeout}ms，可能导致任务频繁超时`);
      }
      if (updates.timeout > 1800000) {
        warnings.push(`超时时间过长: ${updates.timeout}ms，可能导致资源长时间占用`);
      }
    }

    // 检查最大重试次数变化
    if (updates.maxRetries && updates.maxRetries !== taskInstance.config.maxRetries) {
      if (updates.maxRetries > 5) {
        warnings.push(`最大重试次数较高: ${updates.maxRetries}，可能导致任务长时间重试`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 格式化时间间隔
   */
  private formatInterval(ms: number): string {
    if (ms < 60000) {
      return `${Math.round(ms / 1000)}秒`;
    } else if (ms < 3600000) {
      return `${Math.round(ms / 60000)}分钟`;
    } else if (ms < 86400000) {
      return `${Math.round(ms / 3600000)}小时`;
    } else {
      return `${Math.round(ms / 86400000)}天`;
    }
  }

  /**
   * 获取任务执行历史统计
   */
  getTaskExecutionStatistics(taskId: string, options: {
    startDate?: Date;
    endDate?: Date;
    groupBy?: 'hour' | 'day' | 'week' | 'month';
  } = {}): {
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    cancelledExecutions: number;
    averageDuration: number;
    totalItemsCollected: number;
    averageItemsPerExecution: number;
    successRate: number;
    failureRate: number;
    executionTrend: Array<{
      period: string;
      executions: number;
      successful: number;
      failed: number;
      averageDuration: number;
      itemsCollected: number;
    }>;
  } {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        cancelledExecutions: 0,
        averageDuration: 0,
        totalItemsCollected: 0,
        averageItemsPerExecution: 0,
        successRate: 0,
        failureRate: 0,
        executionTrend: []
      };
    }

    const { startDate, endDate, groupBy = 'day' } = options;

    // 过滤执行历史
    let filteredHistory = taskInstance.executionHistory.filter(execution => {
      if (startDate && execution.startTime && execution.startTime < startDate) {
        return false;
      }
      if (endDate && execution.startTime && execution.startTime > endDate) {
        return false;
      }
      return true;
    });

    // 计算基本统计
    const totalExecutions = filteredHistory.length;
    const successfulExecutions = filteredHistory.filter(e => e.status === TaskStatus.COMPLETED).length;
    const failedExecutions = filteredHistory.filter(e => e.status === TaskStatus.FAILED).length;
    const cancelledExecutions = filteredHistory.filter(e => e.status === TaskStatus.CANCELLED).length;

    const successfulExecutionsList = filteredHistory.filter(e => e.status === TaskStatus.COMPLETED);
    const totalDuration = successfulExecutionsList.reduce((sum, e) => sum + (e.duration || 0), 0);
    const averageDuration = successfulExecutions > 0 ? totalDuration / successfulExecutions : 0;

    const totalItemsCollected = successfulExecutionsList.reduce((sum, e) => sum + (e.itemsCollected || 0), 0);
    const averageItemsPerExecution = successfulExecutions > 0 ? totalItemsCollected / successfulExecutions : 0;

    const successRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;
    const failureRate = totalExecutions > 0 ? (failedExecutions / totalExecutions) * 100 : 0;

    // 计算执行趋势
    const executionTrend: Array<{
      period: string;
      executions: number;
      successful: number;
      failed: number;
      averageDuration: number;
      itemsCollected: number;
    }> = [];

    if (filteredHistory.length > 0 && groupBy) {
      // 按时间分组
      const groupedExecutions = new Map<string, TaskExecutionResult[]>();

      for (const execution of filteredHistory) {
        if (!execution.startTime) continue;

        let periodKey: string;
        const date = execution.startTime;

        switch (groupBy) {
          case 'hour':
            periodKey = date.toISOString().slice(0, 13) + ':00:00Z'; // YYYY-MM-DDTHH:00:00Z
            break;
          case 'day':
            periodKey = date.toISOString().slice(0, 10); // YYYY-MM-DD
            break;
          case 'week':
            // 获取周数
            const weekStart = new Date(date);
            weekStart.setDate(date.getDate() - date.getDay());
            periodKey = weekStart.toISOString().slice(0, 10); // 周开始日期
            break;
          case 'month':
            periodKey = date.toISOString().slice(0, 7); // YYYY-MM
            break;
          default:
            periodKey = date.toISOString().slice(0, 10);
        }

        const group = groupedExecutions.get(periodKey) || [];
        group.push(execution);
        groupedExecutions.set(periodKey, group);
      }

      // 计算每个时间段的统计
      for (const [period, executions] of groupedExecutions.entries()) {
        const successful = executions.filter(e => e.status === TaskStatus.COMPLETED);
        const failed = executions.filter(e => e.status === TaskStatus.FAILED);

        const successfulDurations = successful.filter(e => e.duration).map(e => e.duration!);
        const averageDuration = successfulDurations.length > 0
          ? successfulDurations.reduce((sum, d) => sum + d, 0) / successfulDurations.length
          : 0;

        const itemsCollected = successful.reduce((sum, e) => sum + (e.itemsCollected || 0), 0);

        executionTrend.push({
          period,
          executions: executions.length,
          successful: successful.length,
          failed: failed.length,
          averageDuration,
          itemsCollected
        });
      }

      // 按时间段排序
      executionTrend.sort((a, b) => a.period.localeCompare(b.period));
    }

    return {
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      cancelledExecutions,
      averageDuration: Math.round(averageDuration),
      totalItemsCollected,
      averageItemsPerExecution: Math.round(averageItemsPerExecution * 100) / 100,
      successRate: Math.round(successRate * 100) / 100,
      failureRate: Math.round(failureRate * 100) / 100,
      executionTrend
    };
  }

  /**
   * 获取所有任务执行历史（聚合视图）
   */
  getAllTasksExecutionHistory(options: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
    platform?: PlatformType;
    status?: TaskStatus;
  } = {}): Array<{
    taskId: string;
    taskName: string;
    platform: PlatformType;
    execution: TaskExecutionResult;
  }> {
    const {
      limit = 100,
      startDate,
      endDate,
      platform,
      status
    } = options;

    const allExecutions: Array<{
      taskId: string;
      taskName: string;
      platform: PlatformType;
      execution: TaskExecutionResult;
    }> = [];

    // 收集所有任务的执行历史
    for (const taskInstance of this.tasks.values()) {
      // 按平台过滤
      if (platform && taskInstance.config.platform !== platform) {
        continue;
      }

      for (const execution of taskInstance.executionHistory) {
        // 按时间过滤
        if (startDate && execution.startTime && execution.startTime < startDate) {
          continue;
        }
        if (endDate && execution.startTime && execution.startTime > endDate) {
          continue;
        }

        // 按状态过滤
        if (status && execution.status !== status) {
          continue;
        }

        allExecutions.push({
          taskId: taskInstance.config.id,
          taskName: taskInstance.config.name,
          platform: taskInstance.config.platform,
          execution
        });
      }
    }

    // 按开始时间排序（最新的在前）
    allExecutions.sort((a, b) => {
      const aTime = a.execution.startTime?.getTime() || 0;
      const bTime = b.execution.startTime?.getTime() || 0;
      return bTime - aTime;
    });

    // 限制数量
    return allExecutions.slice(0, limit);
  }

  /**
   * 导出任务执行历史
   */
  exportTaskExecutionHistory(taskId: string, format: 'json' | 'csv' = 'json'): string {
    const taskInstance = this.tasks.get(taskId);
    if (!taskInstance) {
      return '';
    }

    const history = taskInstance.executionHistory;

    if (format === 'json') {
      return JSON.stringify({
        taskId,
        taskName: taskInstance.config.name,
        platform: taskInstance.config.platform,
        totalExecutions: history.length,
        executions: history.map(execution => ({
          ...execution,
          startTime: execution.startTime?.toISOString(),
          endTime: execution.endTime?.toISOString()
        }))
      }, null, 2);
    } else if (format === 'csv') {
      // CSV格式
      const headers = ['startTime', 'endTime', 'status', 'duration', 'itemsCollected', 'retryCount', 'error'];
      const rows = history.map(execution => [
        execution.startTime?.toISOString() || '',
        execution.endTime?.toISOString() || '',
        execution.status,
        execution.duration?.toString() || '',
        execution.itemsCollected?.toString() || '',
        execution.retryCount.toString(),
        execution.error || ''
      ]);

      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.map(cell => `"${cell.replace(/"/g, '""')}"`).join(','))
      ].join('\n');

      return csvContent;
    }

    return '';
  }

  /**
   * 清理过期的执行历史
   */
  async cleanupOldHistory(): Promise<void> {
    const retentionDays = this.config.historyRetentionDays;
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    let totalRemoved = 0;

    for (const taskInstance of this.tasks.values()) {
      const originalLength = taskInstance.executionHistory.length;
      taskInstance.executionHistory = taskInstance.executionHistory.filter(
        execution => execution.endTime && execution.endTime > cutoffDate
      );
      totalRemoved += originalLength - taskInstance.executionHistory.length;
    }

    this.logger.info(`清理了超过 ${retentionDays} 天的执行历史，共移除 ${totalRemoved} 条记录`);
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理采集任务管理器资源...');

    try {
      // 停止调度器
      this.stopScheduler();

      // 取消所有正在运行的任务
      for (const taskId of this.runningTasks.keys()) {
        this.cancelTask(taskId);
      }

      // 清空数据结构
      this.tasks.clear();
      this.platformCollectors.clear();
      this.runningTasks.clear();
      this.taskQueue = [];

      this.logger.info('采集任务管理器资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error as Error, { operation: '资源清理', platform: 'task-manager' });
      throw error;
    }
  }
}