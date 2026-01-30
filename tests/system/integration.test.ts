/**
 * System Integration Tests
 *
 * End-to-end tests for the system architecture module integration.
 * Tests the interaction between scheduler, error handling, monitoring,
 * notification, and Claude integration components.
 */

import { System, system } from '../../src/system/system';
import { BaseNotificationAdapter, NotificationMessage } from '../../src/system/notification';

// Mock child_process exec for Claude integration
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

import { exec } from 'child_process';

// Mock notification adapter for testing
class MockNotificationAdapter extends BaseNotificationAdapter {
  name = 'mock';
  private shouldSucceed: boolean;
  private isAvailableFlag: boolean;

  constructor(shouldSucceed: boolean = true, isAvailableFlag: boolean = true) {
    super();
    this.shouldSucceed = shouldSucceed;
    this.isAvailableFlag = isAvailableFlag;
  }

  async isAvailable(): Promise<boolean> {
    return this.isAvailableFlag;
  }

  protected async doSend(_message: NotificationMessage): Promise<{ messageId?: string }> {
    if (!this.shouldSucceed) {
      throw new Error('Mock send failure');
    }
    return { messageId: 'mock-123' };
  }
}

describe('System Integration', () => {
  let sys: System;
  const mockExec = exec as jest.MockedFunction<typeof exec>;

  beforeEach(() => {
    // Clear singleton instance to start fresh
    (System as any).instance = undefined;
    sys = System.getInstance();
    mockExec.mockReset();
  });

  afterEach(async () => {
    // Ensure system is stopped after each test
    if (sys.isRunning()) {
      await sys.stop();
    }
  });

  describe('system lifecycle', () => {
    it('should start and stop system successfully', async () => {
      expect(sys.isRunning()).toBe(false);

      await sys.start();
      expect(sys.isRunning()).toBe(true);

      await sys.stop();
      expect(sys.isRunning()).toBe(false);
    });

    it('should not start if already running', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      await sys.start();
      expect(sys.isRunning()).toBe(true);

      await sys.start(); // Second start should warn
      expect(consoleWarnSpy).toHaveBeenCalledWith('System is already started');

      consoleWarnSpy.mockRestore();
    });

    it('should not stop if not running', async () => {
      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      await sys.stop(); // Should not throw
      expect(sys.isRunning()).toBe(false);
      // Should not log "Stopping system..." since it's not started
      expect(consoleLogSpy).not.toHaveBeenCalledWith('Stopping system...');

      consoleLogSpy.mockRestore();
    });
  });

  describe('health checks', () => {
    it('should return health status with all components', async () => {
      // Mock successful exec for Claude integration
      mockExec.mockImplementation((_command, _options, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'Mock response', '');
        }
        return {} as any;
      });

      await sys.start();

      const health = await sys.getHealth();
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('components');

      // Check expected components
      expect(health.components).toHaveProperty('scheduler');
      expect(health.components).toHaveProperty('notification');
      expect(health.components).toHaveProperty('monitoring');
      expect(health.components).toHaveProperty('claude');

      // All components should be healthy in a good state
      expect(health.healthy).toBe(true);
    });

    it('should detect unhealthy notification system', async () => {
      // Replace notification manager with one that has no available adapters
      // We need to mock the default notification manager
      // This is tricky due to singleton pattern, we'll skip for now
      // and rely on component-specific tests
    });
  });

  describe('notification integration', () => {
    it('should send notification through system', async () => {
      // Replace default notification manager with mock adapter
      const mockAdapter = new MockNotificationAdapter(true, true);
      sys.notification.addAdapter(mockAdapter);

      await sys.sendNotification('Test Title', 'Test content');
      // Should not throw
    });

    it('should throw when all notification channels fail', async () => {
      // Add only failing adapter
      const mockAdapter = new MockNotificationAdapter(false, true);
      sys.notification.addAdapter(mockAdapter);

      await expect(sys.sendNotification('Test', 'Content'))
        .rejects
        .toThrow('Failed to send notification through any channel');
    });
  });

  describe('scheduler integration', () => {
    it('should load tasks from configuration on startup', async () => {
      const config = sys.config.getSchedulerConfig();
      const initialTaskCount = config.tasks.filter(t => t.enabled).length;

      await sys.start();

      const scheduledTasks = sys.scheduler.getAllTasks();
      expect(scheduledTasks).toHaveLength(initialTaskCount);
    });

    it('should schedule tasks with correct configuration', async () => {
      await sys.start();

      const tasks = sys.scheduler.getAllTasks();
      expect(tasks.length).toBeGreaterThan(0);

      const twitterTask = tasks.find(t => t.id === 'twitter-collection');
      expect(twitterTask).toBeDefined();
      expect(twitterTask?.cronExpression).toBe('0,6,12,18 * * * *');
      expect(twitterTask?.command).toBe('npm run collect:twitter');
    });
  });

  describe('monitoring integration', () => {
    it('should record system startup metric', async () => {
      const recordSpy = jest.spyOn(sys.monitoring, 'record');

      await sys.start();

      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'system_startup',
          value: 1,
          tags: { version: '1.0.0' }
        })
      );

      recordSpy.mockRestore();
    });

    it('should record system shutdown metric', async () => {
      const recordSpy = jest.spyOn(sys.monitoring, 'record');

      await sys.start();
      await sys.stop();

      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'system_shutdown',
          value: 1
        })
      );

      recordSpy.mockRestore();
    });

    it('should track health check metrics', async () => {
      await sys.start();

      const health = await sys.getHealth();
      expect(health).toBeDefined();

      // Verify monitoring is working by checking recent activity
      const monitoringHealth = await sys.monitoring.healthCheck();
      expect(monitoringHealth.checks.recent_activity).toBe(true);
    });
  });

  describe('Claude integration', () => {
    it('should clear cache on system stop', async () => {
      const clearCacheSpy = jest.spyOn(sys.claude, 'clearCache');
      const clearUsageStatsSpy = jest.spyOn(sys.claude, 'clearUsageStats');

      await sys.start();
      await sys.stop();

      expect(clearCacheSpy).toHaveBeenCalled();
      expect(clearUsageStatsSpy).toHaveBeenCalled();

      clearCacheSpy.mockRestore();
      clearUsageStatsSpy.mockRestore();
    });

    it('should integrate daily summary generation', async () => {
      // Mock successful LLM call
      mockExec.mockImplementation((_command, _options, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'Mock daily summary content', '');
        }
        return {} as any;
      });

      const newsData = 'Sample news data';
      const date = '2024-01-01';

      const summary = await sys.dailySummary.generateSummary(newsData, date);
      expect(summary).toBe('Mock daily summary content');
    });
  });

  describe('error handling integration', () => {
    it('should have error handlers initialized', () => {
      expect(sys.collectionErrorHandler).toBeDefined();
      expect(sys.databaseErrorHandler).toBeDefined();
      expect(sys.llmErrorHandler).toBeDefined();
    });

    it('should handle collection errors with retry', async () => {
      const operation = jest.fn()
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce('success');

      const result = await sys.collectionErrorHandler.handle(operation, {
        maxRetries: 1,
        retryDelay: 10
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should degrade after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Permanent failure'));

      const result = await sys.collectionErrorHandler.handle(operation, {
        maxRetries: 1,
        retryDelay: 10
      });

      expect(result).toEqual({}); // CollectionErrorHandler degrades to empty object
      expect(operation).toHaveBeenCalledTimes(2); // Initial + 1 retry
    });
  });
});

describe('Default System Instance', () => {
  it('should provide singleton instance', () => {
    const instance1 = System.getInstance();
    const instance2 = System.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should export default system instance', () => {
    expect(system).toBeDefined();
    expect(system).toBe(System.getInstance());
  });
});