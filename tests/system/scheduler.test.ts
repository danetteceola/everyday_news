import { Scheduler, TaskConfig } from '../../src/system/scheduler';

describe('Scheduler', () => {
  let scheduler: Scheduler;

  beforeEach(() => {
    scheduler = new Scheduler();
  });

  afterEach(() => {
    scheduler.stop();
  });

  describe('task management', () => {
    const testTask: TaskConfig = {
      id: 'test-task',
      name: 'Test Task',
      cronExpression: '* * * * *', // Every minute
      command: 'echo "Hello World"',
      enabled: true
    };

    it('should add a task', () => {
      scheduler.addTask(testTask);

      const tasks = scheduler.getAllTasks();
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('test-task');
    });

    it('should update a task', () => {
      scheduler.addTask(testTask);

      scheduler.updateTask('test-task', {
        name: 'Updated Task',
        command: 'echo "Updated"'
      });

      const task = scheduler.getAllTasks()[0];
      expect(task.name).toBe('Updated Task');
      expect(task.command).toBe('echo "Updated"');
    });

    it('should remove a task', () => {
      scheduler.addTask(testTask);
      expect(scheduler.getAllTasks()).toHaveLength(1);

      scheduler.removeTask('test-task');
      expect(scheduler.getAllTasks()).toHaveLength(0);
    });
  });

  describe('task status', () => {
    const testTask: TaskConfig = {
      id: 'status-task',
      name: 'Status Task',
      cronExpression: '* * * * *',
      command: 'echo "Status"',
      enabled: false // Disabled so it doesn't auto-schedule
    };

    it('should return task status', () => {
      scheduler.addTask(testTask);

      const status = scheduler.getTaskStatus('status-task');
      expect(status).toBeDefined();
      expect(status?.id).toBe('status-task');
      expect(status?.isRunning).toBe(false);
      expect(status?.runCount).toBe(0);
    });

    it('should return all statuses', () => {
      scheduler.addTask(testTask);

      const statuses = scheduler.getAllStatuses();
      expect(statuses).toHaveLength(1);
      expect(statuses[0].id).toBe('status-task');
    });
  });

  describe('execution history', () => {
    const testTask: TaskConfig = {
      id: 'history-task',
      name: 'History Task',
      cronExpression: '* * * * *',
      command: 'echo "History"',
      enabled: false
    };

    it('should record execution history', async () => {
      scheduler.addTask(testTask);

      const result = await scheduler.executeTask('history-task');
      expect(result.success).toBe(true);

      const history = scheduler.getExecutionHistory('history-task');
      expect(history).toHaveLength(1);
      expect(history[0].taskId).toBe('history-task');
      expect(history[0].success).toBe(true);
    });

    it('should keep only last 10 executions', async () => {
      scheduler.addTask(testTask);

      // Execute 15 times
      for (let i = 0; i < 15; i++) {
        await scheduler.executeTask('history-task');
      }

      const history = scheduler.getExecutionHistory('history-task');
      expect(history).toHaveLength(10);
    });
  });

  describe('configuration loading', () => {
    it('should load tasks from configuration', () => {
      const config = {
        maxConcurrentTasks: 3,
        taskTimeout: 60000,
        logLevel: 'debug' as const,
        tasks: [
          {
            id: 'config-task-1',
            name: 'Config Task 1',
            cronExpression: '0 * * * *',
            command: 'echo "Config 1"',
            enabled: true
          },
          {
            id: 'config-task-2',
            name: 'Config Task 2',
            cronExpression: '30 * * * *',
            command: 'echo "Config 2"',
            enabled: false
          }
        ]
      };

      scheduler.loadFromConfig(config);

      const tasks = scheduler.getAllTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks[0].id).toBe('config-task-1');
      expect(tasks[1].id).toBe('config-task-2');
    });
  });
});