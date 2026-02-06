/**
 * 简单测试运行器
 */

import { CollectionTaskManager, TaskStatus, TaskPriority } from '../../../src/collection/task-manager/collection-task-manager';
import { PlatformType } from '../../../src/collection/types/news-item';

async function runTests() {
  console.log('=== 采集任务管理器单元测试 ===\n');

  let passed = 0;
  let failed = 0;

  // 测试1: 初始化
  console.log('测试1: 初始化任务管理器');
  try {
    const taskManager = new CollectionTaskManager({
      autoStartScheduler: false,
      maxConcurrentTasks: 2
    });
    console.log('✓ 任务管理器初始化成功');
    passed++;

    // 测试2: 添加任务
    console.log('\n测试2: 添加任务');
    const taskId = taskManager.addTask({
      id: 'test-task-1',
      platform: PlatformType.TWITTER,
      name: '测试Twitter采集任务',
      enabled: true,
      schedule: 'hourly',
      priority: TaskPriority.HIGH,
      maxRetries: 3,
      timeout: 300000
    });

    const task = taskManager.getTask(taskId);
    if (task && task.config.id === taskId) {
      console.log('✓ 任务添加成功');
      passed++;
    } else {
      console.log('✗ 任务添加失败');
      failed++;
    }

    // 测试3: 获取所有任务
    console.log('\n测试3: 获取所有任务');
    const tasks = taskManager.getAllTasks();
    if (tasks.length === 1) {
      console.log('✓ 成功获取所有任务');
      passed++;
    } else {
      console.log('✗ 获取所有任务失败');
      failed++;
    }

    // 测试4: 更新任务
    console.log('\n测试4: 更新任务');
    const updateSuccess = taskManager.updateTask(taskId, {
      name: '更新后的任务名称',
      priority: TaskPriority.CRITICAL
    });

    const updatedTask = taskManager.getTask(taskId);
    if (updateSuccess && updatedTask?.config.name === '更新后的任务名称') {
      console.log('✓ 任务更新成功');
      passed++;
    } else {
      console.log('✗ 任务更新失败');
      failed++;
    }

    // 测试5: 获取任务统计
    console.log('\n测试5: 获取任务统计');
    const statistics = taskManager.getTaskStatistics();
    if (statistics.totalTasks === 1) {
      console.log('✓ 任务统计获取成功');
      passed++;
    } else {
      console.log('✗ 任务统计获取失败');
      failed++;
    }

    // 测试6: 删除任务
    console.log('\n测试6: 删除任务');
    const deleteSuccess = taskManager.deleteTask(taskId);
    const deletedTask = taskManager.getTask(taskId);

    if (deleteSuccess && !deletedTask) {
      console.log('✓ 任务删除成功');
      passed++;
    } else {
      console.log('✗ 任务删除失败');
      failed++;
    }

    // 清理
    await taskManager.cleanup();

  } catch (error) {
    console.error('测试失败:', error);
    failed++;
  }

  // 测试7: 依赖管理
  console.log('\n测试7: 任务依赖管理');
  try {
    const taskManager2 = new CollectionTaskManager({
      autoStartScheduler: false
    });

    // 添加依赖任务
    taskManager2.addTask({
      id: 'dep-task',
      platform: PlatformType.TWITTER,
      name: '依赖任务',
      enabled: true,
      schedule: 'hourly',
      priority: TaskPriority.NORMAL,
      maxRetries: 3,
      timeout: 300000
    });

    // 添加主任务
    taskManager2.addTask({
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

    const dependencies = taskManager2.getTaskDependencies('main-task');
    if (dependencies.dependsOn.includes('dep-task')) {
      console.log('✓ 任务依赖管理成功');
      passed++;
    } else {
      console.log('✗ 任务依赖管理失败');
      failed++;
    }

    await taskManager2.cleanup();

  } catch (error) {
    console.error('依赖管理测试失败:', error);
    failed++;
  }

  // 测试8: 配置管理
  console.log('\n测试8: 配置管理');
  try {
    const taskManager3 = new CollectionTaskManager({
      autoStartScheduler: false
    });

    const defaultConfig = taskManager3.getDefaultTaskConfig(PlatformType.TWITTER);
    if (defaultConfig.priority === TaskPriority.HIGH && defaultConfig.schedule === 'hourly') {
      console.log('✓ 默认配置获取成功');
      passed++;
    } else {
      console.log('✗ 默认配置获取失败');
      failed++;
    }

    await taskManager3.cleanup();

  } catch (error) {
    console.error('配置管理测试失败:', error);
    failed++;
  }

  // 输出测试结果
  console.log('\n=== 测试结果 ===');
  console.log(`总计: ${passed + failed} 个测试`);
  console.log(`通过: ${passed}`);
  console.log(`失败: ${failed}`);
  console.log(`通过率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n🎉 所有测试通过！');
    process.exit(0);
  } else {
    console.log('\n❌ 有测试失败');
    process.exit(1);
  }
}

// 运行测试
runTests().catch(error => {
  console.error('测试运行器错误:', error);
  process.exit(1);
});