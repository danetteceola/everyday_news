/**
 * Skill 管理器
 */

import {
  SkillExecutionContext,
  SkillExecutionResult,
  SkillRegistration,
  SkillErrorCode
} from './types';
import { SkillRegistry } from './skill-registry';
import { configManager } from '../config';
import { globalSkillErrorHandler, ErrorCategory } from './error-handling/skill-error-handler';

/**
 * Skill 管理器配置
 */
export interface SkillManagerConfig {
  timeout: number; // 超时时间（毫秒）
  maxConcurrentExecutions: number; // 最大并发执行数
  enableLogging: boolean; // 是否启用日志
  enableMetrics: boolean; // 是否启用指标收集
  retryCount: number; // 重试次数
}

/**
 * 默认配置
 */
export const DEFAULT_SKILL_MANAGER_CONFIG: SkillManagerConfig = {
  timeout: 30000, // 30秒
  maxConcurrentExecutions: 10,
  enableLogging: true,
  enableMetrics: true,
  retryCount: 3
};

/**
 * Skill 执行统计
 */
export interface SkillExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageExecutionTime: number;
  lastExecutionTime?: Date;
  errorCounts: Record<string, number>;
}

/**
 * Skill 管理器类
 */
export class SkillManager {
  private registry: SkillRegistry;
  private config: SkillManagerConfig;
  private stats: Map<string, SkillExecutionStats> = new Map();
  private concurrentExecutions: Map<string, number> = new Map();

  constructor(registry: SkillRegistry, config?: Partial<SkillManagerConfig>) {
    this.registry = registry;
    this.config = { ...DEFAULT_SKILL_MANAGER_CONFIG, ...config };
  }

  /**
   * 执行技能
   */
  async executeSkill(context: SkillExecutionContext): Promise<SkillExecutionResult> {
    const { skillId, requestId } = context;
    const startTime = Date.now();

    try {
      // 1. 获取技能
      const skillRegistration = this.registry.get(skillId);
      if (!skillRegistration) {
        return this.createErrorResult(
          SkillErrorCode.SKILL_NOT_FOUND,
          `技能 "${skillId}" 未找到`,
          startTime,
          context
        );
      }

      // 2. 检查是否启用
      if (!skillRegistration.definition.enabled) {
        return this.createErrorResult(
          SkillErrorCode.SKILL_DISABLED,
          `技能 "${skillId}" 已禁用`,
          startTime,
          context
        );
      }

      // 3. 检查并发限制
      const concurrentCount = this.concurrentExecutions.get(skillId) || 0;
      if (concurrentCount >= this.config.maxConcurrentExecutions) {
        return this.createErrorResult(
          SkillErrorCode.INVALID_STATE,
          `技能 "${skillId}" 达到最大并发限制`,
          startTime,
          context
        );
      }

      // 4. 更新并发计数
      this.concurrentExecutions.set(skillId, concurrentCount + 1);

      // 5. 执行技能（带超时）
      let executionResult: SkillExecutionResult;
      try {
        executionResult = await this.executeWithTimeout(
          skillRegistration,
          context,
          startTime
        );
      } finally {
        // 减少并发计数
        const currentCount = this.concurrentExecutions.get(skillId) || 0;
        this.concurrentExecutions.set(skillId, Math.max(0, currentCount - 1));
      }

      // 6. 更新统计
      this.updateStats(skillId, executionResult, startTime);

      // 7. 记录日志
      if (this.config.enableLogging) {
        this.logExecution(skillId, executionResult, startTime, context);
      }

      return executionResult;

    } catch (error: any) {
      console.error('技能管理器执行异常:', error);

      return {
        success: false,
        error: {
          code: SkillErrorCode.EXECUTION_FAILED,
          message: '技能执行异常',
          details: error.message || error.toString()
        },
        metadata: {
          executionTime: Date.now() - startTime,
          skillId,
          requestId,
          timestamp: context.timestamp
        }
      };
    }
  }

  /**
   * 带超时执行技能
   */
  private async executeWithTimeout(
    skillRegistration: SkillRegistration,
    context: SkillExecutionContext,
    startTime: number
  ): Promise<SkillExecutionResult> {
    const { skillId, requestId } = context;
    const timeout = this.config.timeout;

    // 创建超时Promise
    const timeoutPromise = new Promise<SkillExecutionResult>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`技能执行超时 (${timeout}ms)`));
      }, timeout);
    });

    // 创建执行Promise
    const executionPromise = (async () => {
      // 重试逻辑
      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= this.config.retryCount; attempt++) {
        try {
          if (attempt > 1) {
            console.log(`重试执行技能 "${skillId}"，第 ${attempt} 次尝试`);
          }

          const result = await skillRegistration.handler(context);
          return result;

        } catch (error: any) {
          lastError = error;

          // 如果不是最后一次尝试，等待后重试
          if (attempt < this.config.retryCount) {
            const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // 指数退避
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // 所有重试都失败
      throw lastError || new Error('技能执行失败');
    })();

    // 竞速：执行 vs 超时
    try {
      return await Promise.race([executionPromise, timeoutPromise]);
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: SkillErrorCode.TIMEOUT,
          message: error.message || '技能执行超时',
          details: error.stack || error.toString()
        },
        metadata: {
          executionTime: Date.now() - startTime,
          skillId,
          requestId,
          timestamp: context.timestamp
        }
      };
    }
  }

  /**
   * 更新执行统计
   */
  private updateStats(
    skillId: string,
    result: SkillExecutionResult,
    startTime: number
  ): void {
    if (!this.config.enableMetrics) {
      return;
    }

    const executionTime = Date.now() - startTime;
    const stats = this.stats.get(skillId) || {
      totalExecutions: 0,
      successfulExecutions: 0,
      failedExecutions: 0,
      averageExecutionTime: 0,
      errorCounts: {}
    };

    // 更新统计
    stats.totalExecutions++;
    stats.lastExecutionTime = new Date();

    if (result.success) {
      stats.successfulExecutions++;
    } else {
      stats.failedExecutions++;

      // 更新错误计数
      const errorCode = result.error?.code || 'UNKNOWN';
      stats.errorCounts[errorCode] = (stats.errorCounts[errorCode] || 0) + 1;
    }

    // 更新平均执行时间（移动平均）
    if (stats.totalExecutions === 1) {
      stats.averageExecutionTime = executionTime;
    } else {
      stats.averageExecutionTime = (stats.averageExecutionTime * 0.9) + (executionTime * 0.1);
    }

    this.stats.set(skillId, stats);
  }

  /**
   * 记录执行日志
   */
  private logExecution(
    skillId: string,
    result: SkillExecutionResult,
    startTime: number,
    context: SkillExecutionContext
  ): void {
    const executionTime = Date.now() - startTime;
    const logEntry = {
      timestamp: new Date().toISOString(),
      skillId,
      requestId: context.requestId,
      userId: context.userId,
      success: result.success,
      executionTime,
      error: result.error,
      parameters: context.parameters
    };

    console.log(JSON.stringify(logEntry, null, 2));
  }

  /**
   * 创建错误结果
   */
  private createErrorResult(
    errorCode: SkillErrorCode,
    message: string,
    startTime: number,
    context: SkillExecutionContext
  ): SkillExecutionResult {
    return {
      success: false,
      error: {
        code: errorCode,
        message,
        details: { skillId: context.skillId }
      },
      metadata: {
        executionTime: Date.now() - startTime,
        skillId: context.skillId,
        requestId: context.requestId,
        timestamp: context.timestamp
      }
    };
  }

  /**
   * 获取技能统计
   */
  getStats(skillId?: string): SkillExecutionStats | Record<string, SkillExecutionStats> {
    if (skillId) {
      return this.stats.get(skillId) || {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageExecutionTime: 0,
        errorCounts: {}
      };
    }

    // 返回所有统计
    const allStats: Record<string, SkillExecutionStats> = {};
    for (const [id, stats] of this.stats.entries()) {
      allStats[id] = stats;
    }

    return allStats;
  }

  /**
   * 重置统计
   */
  resetStats(skillId?: string): void {
    if (skillId) {
      this.stats.delete(skillId);
    } else {
      this.stats.clear();
    }
  }

  /**
   * 获取配置
   */
  getConfig(): SkillManagerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<SkillManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取并发执行数
   */
  getConcurrentExecutions(skillId?: string): number | Record<string, number> {
    if (skillId) {
      return this.concurrentExecutions.get(skillId) || 0;
    }

    const result: Record<string, number> = {};
    for (const [id, count] of this.concurrentExecutions.entries()) {
      result[id] = count;
    }

    return result;
  }
}

/**
 * 全局技能管理器实例
 */
export const globalSkillManager = new SkillManager(
  globalSkillRegistry,
  configManager.getSkillConfig()
);

// 默认导出
export default globalSkillManager;