/**
 * Scheduler Module
 *
 * Provides cron-based task scheduling using node-cron library.
 * Integrates with Claude Code Router's ccr cron command for task management.
 */

import cron from 'node-cron';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { SchedulerConfig } from '../config';

export interface TaskConfig {
  id: string;
  name: string;
  cronExpression: string;
  command: string;
  enabled: boolean;
  description?: string;
  timeout?: number; // milliseconds
}

export interface TaskStatus {
  id: string;
  lastRun: Date | null;
  nextRun: Date | null;
  isRunning: boolean;
  lastError: string | null;
  runCount: number;
  successCount: number;
  failureCount: number;
  lastRunDuration?: number; // milliseconds
}

export interface SchedulerOptions {
  maxConcurrentTasks?: number;
  taskTimeout?: number; // milliseconds
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export interface TaskExecutionResult {
  success: boolean;
  output?: string;
  error?: string;
  duration: number; // milliseconds
  exitCode?: number;
}

export interface ExecutionRecord extends TaskExecutionResult {
  taskId: string;
  timestamp: Date;
  scheduled: boolean; // true if triggered by cron, false if manual
}

export class Scheduler extends EventEmitter {
  private tasks: Map<string, TaskConfig> = new Map();
  private status: Map<string, TaskStatus> = new Map();
  private cronJobs: Map<string, cron.ScheduledTask> = new Map();
  private runningTasks: Set<string> = new Set();
  private history: Map<string, ExecutionRecord[]> = new Map();
  private options: SchedulerOptions;

  constructor(options: SchedulerOptions = {}) {
    super();
    this.options = {
      maxConcurrentTasks: 5,
      taskTimeout: 300000, // 5 minutes
      logLevel: 'info',
      ...options
    };
  }

  /**
   * Load tasks from configuration
   */
  loadFromConfig(config: SchedulerConfig): void {
    // Clear existing tasks
    for (const taskId of this.tasks.keys()) {
      this.unscheduleTask(taskId);
    }
    this.tasks.clear();
    this.status.clear();
    this.cronJobs.clear();

    // Add tasks from config
    for (const taskConfig of config.tasks) {
      this.addTask({
        id: taskConfig.id,
        name: taskConfig.name,
        cronExpression: taskConfig.cronExpression,
        command: taskConfig.command,
        enabled: taskConfig.enabled,
        timeout: config.taskTimeout
      });
    }

    // Update scheduler options from config
    this.options.maxConcurrentTasks = config.maxConcurrentTasks;
    this.options.taskTimeout = config.taskTimeout;
    this.options.logLevel = config.logLevel;
  }

  /**
   * Add a new task to the scheduler
   */
  addTask(config: TaskConfig): void {
    this.tasks.set(config.id, config);
    this.status.set(config.id, {
      id: config.id,
      lastRun: null,
      nextRun: null,
      isRunning: false,
      lastError: null,
      runCount: 0,
      successCount: 0,
      failureCount: 0
    });

    // If scheduler is already running and task is enabled, schedule it
    if (config.enabled && this.cronJobs.size > 0) {
      this.scheduleTask(config);
    }

    this.emit('taskAdded', config);
  }

  /**
   * Update an existing task
   */
  updateTask(taskId: string, updates: Partial<TaskConfig>): void {
    const existing = this.tasks.get(taskId);
    if (!existing) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const updated = { ...existing, ...updates };
    this.tasks.set(taskId, updated);

    // Reschedule if cron expression changed or enabled state changed
    const needsReschedule = updates.cronExpression !== undefined || updates.enabled !== undefined;

    if (needsReschedule) {
      this.unscheduleTask(taskId);
      if (updated.enabled) {
        this.scheduleTask(updated);
      }
    }

    this.emit('taskUpdated', updated);
  }

  /**
   * Remove a task from the scheduler
   */
  removeTask(taskId: string): void {
    this.unscheduleTask(taskId);
    this.tasks.delete(taskId);
    this.status.delete(taskId);
    this.emit('taskRemoved', taskId);
  }

  /**
   * Start the scheduler
   */
  start(): void {
    // Schedule all enabled tasks
    for (const task of this.tasks.values()) {
      if (task.enabled) {
        this.scheduleTask(task);
      }
    }

    this.emit('schedulerStarted');
    console.log('Scheduler started');
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    // Stop all cron jobs
    for (const [taskId, job] of this.cronJobs.entries()) {
      job.stop();
      this.cronJobs.delete(taskId);
    }

    // Cancel any running tasks?
    // Note: We don't kill running processes, but we stop scheduling new ones

    this.emit('schedulerStopped');
    console.log('Scheduler stopped');
  }

  /**
   * Execute a task immediately (manual trigger)
   */
  async executeTask(taskId: string): Promise<TaskExecutionResult> {
    const task = this.tasks.get(taskId);
    if (!task) {
      throw new Error(`Task not found: ${taskId}`);
    }

    return this.runTask(task, false);
  }

  /**
   * Get task status
   */
  getTaskStatus(taskId: string): TaskStatus | undefined {
    return this.status.get(taskId);
  }

  /**
   * Get all task statuses
   */
  getAllStatuses(): TaskStatus[] {
    return Array.from(this.status.values());
  }

  /**
   * Get execution history for a task
   */
  getExecutionHistory(taskId: string): ExecutionRecord[] {
    return this.history.get(taskId) || [];
  }

  /**
   * Get all execution history
   */
  getAllExecutionHistory(): Map<string, ExecutionRecord[]> {
    return new Map(this.history);
  }

  /**
   * Get all tasks
   */
  getAllTasks(): TaskConfig[] {
    return Array.from(this.tasks.values());
  }

  /**
   * Schedule a task using node-cron
   */
  private scheduleTask(task: TaskConfig): void {
    // Validate cron expression
    if (!cron.validate(task.cronExpression)) {
      throw new Error(`Invalid cron expression for task ${task.id}: ${task.cronExpression}`);
    }

    // Stop existing job if any
    this.unscheduleTask(task.id);

    // Create new cron job
    const job = cron.schedule(task.cronExpression, async () => {
      await this.runTask(task, true);
    }, {
      scheduled: true,
      timezone: 'UTC'
    });

    this.cronJobs.set(task.id, job);

    // Calculate next run time
    const nextRun = this.calculateNextRun(task.cronExpression);
    this.updateTaskStatus(task.id, { nextRun });

    this.emit('taskScheduled', task);
  }

  /**
   * Unschedule a task
   */
  private unscheduleTask(taskId: string): void {
    const job = this.cronJobs.get(taskId);
    if (job) {
      job.stop();
      this.cronJobs.delete(taskId);
      this.updateTaskStatus(taskId, { nextRun: null });
      this.emit('taskUnscheduled', taskId);
    }
  }

  /**
   * Execute a task
   */
  private async runTask(task: TaskConfig, scheduled: boolean = false): Promise<TaskExecutionResult> {
    // Check concurrency limit
    if (this.runningTasks.size >= this.options.maxConcurrentTasks!) {
      this.emit('taskSkipped', task.id, 'Concurrency limit reached');
      return {
        success: false,
        error: 'Concurrency limit reached',
        duration: 0
      };
    }

    // Mark as running
    this.runningTasks.add(task.id);
    this.updateTaskStatus(task.id, { isRunning: true });

    const startTime = Date.now();
    let result: TaskExecutionResult;

    try {
      this.emit('taskStarted', task.id);

      // Execute command
      const output = await this.executeCommand(task.command, task.timeout || this.options.taskTimeout!);

      result = {
        success: true,
        output,
        duration: Date.now() - startTime,
        exitCode: 0
      };

      this.updateTaskStatus(task.id, {
        lastRun: new Date(),
        isRunning: false,
        runCount: (this.status.get(task.id)?.runCount || 0) + 1,
        successCount: (this.status.get(task.id)?.successCount || 0) + 1,
        lastRunDuration: result.duration,
        lastError: null
      });

      this.emit('taskCompleted', task.id, result);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      result = {
        success: false,
        error: errorMessage,
        duration: Date.now() - startTime,
        exitCode: error instanceof Error && 'code' in error ? Number(error.code) : undefined
      };

      this.updateTaskStatus(task.id, {
        lastRun: new Date(),
        isRunning: false,
        runCount: (this.status.get(task.id)?.runCount || 0) + 1,
        failureCount: (this.status.get(task.id)?.failureCount || 0) + 1,
        lastRunDuration: result.duration,
        lastError: errorMessage
      });

      this.emit('taskFailed', task.id, errorMessage);
    } finally {
      this.runningTasks.delete(task.id);
    }

    // Record execution history
    this.recordExecution(task.id, result, scheduled);

    return result;
  }

  /**
   * Record execution history
   */
  private recordExecution(taskId: string, result: TaskExecutionResult, scheduled: boolean): void {
    const history = this.history.get(taskId) || [];
    history.push({
      ...result,
      taskId,
      timestamp: new Date(),
      scheduled
    });

    // Keep only last 10 executions per task
    if (history.length > 10) {
      history.shift();
    }

    this.history.set(taskId, history);
  }

  /**
   * Execute a shell command
   */
  private executeCommand(command: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let errorOutput = '';

      child.stdout.on('data', (data) => {
        output += data.toString();
      });

      child.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
      }, timeout);

      child.on('close', (code) => {
        clearTimeout(timeoutId);

        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${command}\n${errorOutput}`));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    });
  }

  /**
   * Calculate next run time for a cron expression
   */
  private calculateNextRun(cronExpression: string): Date | null {
    try {
      // node-cron doesn't provide next run calculation directly
      // For simplicity, we'll return null and rely on node-cron's scheduling
      // In a real implementation, you might use a library like `cron-parser`
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Update task status
   */
  private updateTaskStatus(taskId: string, updates: Partial<TaskStatus>): void {
    const current = this.status.get(taskId);
    if (current) {
      this.status.set(taskId, { ...current, ...updates });
    }
  }

  /**
   * Integrate with ccr cron command
   * This method allows tasks to be defined using ccr cron syntax
   */
  addCCRCronTask(taskDef: string): void {
    // Parse ccr cron task definition
    // Format: "schedule <cron> <command>"
    const match = taskDef.match(/schedule\s+([^\s]+)\s+(.+)/);
    if (!match) {
      throw new Error(`Invalid ccr cron task definition: ${taskDef}`);
    }

    const [, cronExpression, command] = match;
    const taskId = `ccr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    this.addTask({
      id: taskId,
      name: `CCR Cron: ${command.substring(0, 50)}`,
      cronExpression,
      command,
      enabled: true,
      description: `Auto-generated from ccr cron: ${taskDef}`
    });
  }
}

// Default scheduler instance
export const scheduler = new Scheduler();