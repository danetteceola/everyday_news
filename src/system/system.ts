/**
 * System Core - Main entry point for system architecture module
 *
 * Provides unified initialization and management of all system components.
 */

import { scheduler } from './scheduler';
import { notificationManager } from './notification';
import { metricsCollector } from './monitoring';
import { configManager } from './config';
import { claudeIntegration, dailySummaryIntegration } from './claude-integration';
import { CollectionErrorHandler, DatabaseErrorHandler, LLMErrorHandler } from './error-handling';

export class System {
  private static instance: System;
  private isStarted = false;

  // Core components (public access)
  public readonly scheduler = scheduler;
  public readonly notification = notificationManager;
  public readonly monitoring = metricsCollector;
  public readonly config = configManager;
  public readonly claude = claudeIntegration;
  public readonly dailySummary = dailySummaryIntegration;

  // Error handlers
  public readonly collectionErrorHandler: CollectionErrorHandler;
  public readonly databaseErrorHandler: DatabaseErrorHandler;
  public readonly llmErrorHandler: LLMErrorHandler;

  private constructor() {
    // Initialize error handlers with default context
    const defaultContext = {
      operation: 'system_init',
      module: 'system',
      timestamp: new Date()
    };

    this.collectionErrorHandler = new CollectionErrorHandler(defaultContext);
    this.databaseErrorHandler = new DatabaseErrorHandler(defaultContext);
    this.llmErrorHandler = new LLMErrorHandler(defaultContext);
  }

  /**
   * Get singleton instance
   */
  static getInstance(): System {
    if (!System.instance) {
      System.instance = new System();
    }
    return System.instance;
  }

  /**
   * Initialize and start all system components
   */
  async start(): Promise<void> {
    if (this.isStarted) {
      console.warn('System is already started');
      return;
    }

    console.log('Starting system...');

    // Validate configuration
    const configErrors = this.config.validate();
    if (configErrors.length > 0) {
      console.warn('Configuration validation warnings:', configErrors);
    }

    // Start scheduler with configured tasks
    const schedulerConfig = this.config.getSchedulerConfig();
    this.scheduler.setOptions({
      maxConcurrentTasks: schedulerConfig.maxConcurrentTasks,
      taskTimeout: schedulerConfig.taskTimeout
    });

    // Load and schedule tasks from configuration
    for (const task of schedulerConfig.tasks) {
      if (task.enabled) {
        try {
          this.scheduler.addTask(task);
          console.log(`Scheduled task: ${task.name} (${task.cronExpression})`);
        } catch (error) {
          console.error(`Failed to schedule task ${task.name}:`, error);
        }
      }
    }

    // Start monitoring health checks
    const monitoringConfig = this.config.getMonitoringConfig();
    // Schedule periodic health check (if needed)
    // For now, just record startup metric
    this.monitoring.record({
      name: 'system_startup',
      value: 1,
      tags: { version: '1.0.0' }
    });

    this.isStarted = true;
    console.log('System started successfully');
  }

  /**
   * Stop all system components
   */
  async stop(): Promise<void> {
    if (!this.isStarted) {
      return;
    }

    console.log('Stopping system...');

    // Stop all scheduled tasks
    const tasks = this.scheduler.getAllTasks();
    for (const task of tasks) {
      this.scheduler.removeTask(task.id);
    }

    // Clear caches
    this.claude.clearCache();
    this.claude.clearUsageStats();

    // Record shutdown metric
    this.monitoring.record({
      name: 'system_shutdown',
      value: 1
    });

    this.isStarted = false;
    console.log('System stopped');
  }

  /**
   * Check if system is running
   */
  isRunning(): boolean {
    return this.isStarted;
  }

  /**
   * Get system health status
   */
  async getHealth(): Promise<{
    healthy: boolean;
    components: Record<string, { healthy: boolean; message?: string }>;
  }> {
    const components: Record<string, { healthy: boolean; message?: string }> = {};

    // Check scheduler
    try {
      const tasks = this.scheduler.getAllTasks();
      components.scheduler = {
        healthy: true,
        message: `${tasks.length} tasks scheduled`
      };
    } catch (error) {
      components.scheduler = {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Check notification system
    try {
      const availableAdapters = await this.notification.getAvailableAdapters();
      components.notification = {
        healthy: availableAdapters.length > 0,
        message: `Available adapters: ${availableAdapters.join(', ')}`
      };
    } catch (error) {
      components.notification = {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Check monitoring
    try {
      const health = await this.monitoring.healthCheck();
      components.monitoring = {
        healthy: health.healthy,
        message: `Recent activity: ${health.checks.recent_activity}`
      };
    } catch (error) {
      components.monitoring = {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Check Claude integration
    try {
      const usageStats = this.claude.getUsageStats();
      components.claude = {
        healthy: true,
        message: `${usageStats.length} LLM calls recorded`
      };
    } catch (error) {
      components.claude = {
        healthy: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    const healthy = Object.values(components).every(c => c.healthy);

    return {
      healthy,
      components
    };
  }

  /**
   * Send system notification
   */
  async sendNotification(
    title: string,
    content: string,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium'
  ): Promise<void> {
    const results = await this.notification.send({
      title,
      content,
      priority
    });

    const successful = results.filter(r => r.success);
    if (successful.length === 0) {
      throw new Error('Failed to send notification through any channel');
    }
  }
}

// Default system instance
export const system = System.getInstance();