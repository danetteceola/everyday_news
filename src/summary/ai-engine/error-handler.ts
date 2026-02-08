/**
 * API错误处理和重试机制
 */

import {
  AIEngineError,
  AIEngineErrorType,
  RetryStrategy,
  DEFAULT_RETRY_STRATEGY
} from './interface';

/**
 * 重试选项
 */
export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryableErrors?: AIEngineErrorType[];
  onRetry?: (attempt: number, error: AIEngineError, delay: number) => void;
}

/**
 * 错误统计
 */
export interface ErrorStats {
  totalErrors: number;
  byType: Record<AIEngineErrorType, number>;
  lastError?: {
    type: AIEngineErrorType;
    message: string;
    timestamp: Date;
  };
  retrySuccessCount: number;
  retryFailureCount: number;
}

/**
 * 错误处理器
 */
export class ErrorHandler {
  private stats: ErrorStats;
  private retryStrategy: RetryStrategy;

  constructor(retryStrategy: RetryStrategy = DEFAULT_RETRY_STRATEGY) {
    this.retryStrategy = retryStrategy;
    this.stats = this.initializeStats();
  }

  /**
   * 初始化统计
   */
  private initializeStats(): ErrorStats {
    const stats: ErrorStats = {
      totalErrors: 0,
      byType: {
        [AIEngineErrorType.API_ERROR]: 0,
        [AIEngineErrorType.AUTHENTICATION_ERROR]: 0,
        [AIEngineErrorType.RATE_LIMIT_ERROR]: 0,
        [AIEngineErrorType.NETWORK_ERROR]: 0,
        [AIEngineErrorType.VALIDATION_ERROR]: 0,
        [AIEngineErrorType.PARSING_ERROR]: 0,
        [AIEngineErrorType.UNKNOWN_ERROR]: 0
      },
      retrySuccessCount: 0,
      retryFailureCount: 0
    };

    return stats;
  }

  /**
   * 记录错误
   */
  public recordError(error: AIEngineError): void {
    this.stats.totalErrors++;
    this.stats.byType[error.type]++;

    this.stats.lastError = {
      type: error.type,
      message: error.message,
      timestamp: new Date()
    };
  }

  /**
   * 记录重试成功
   */
  public recordRetrySuccess(): void {
    this.stats.retrySuccessCount++;
  }

  /**
   * 记录重试失败
   */
  public recordRetryFailure(): void {
    this.stats.retryFailureCount++;
  }

  /**
   * 获取错误统计
   */
  public getErrorStats(): ErrorStats {
    return { ...this.stats };
  }

  /**
   * 重置统计
   */
  public resetStats(): void {
    this.stats = this.initializeStats();
  }

  /**
   * 检查错误是否可重试
   */
  public isRetryable(error: AIEngineError): boolean {
    return error.retryable && this.retryStrategy.retryableErrors.includes(error.type);
  }

  /**
   * 计算重试延迟
   */
  public calculateRetryDelay(attempt: number): number {
    // 指数退避：baseDelay * 2^(attempt-1)
    const delay = this.retryStrategy.baseDelay * Math.pow(2, attempt - 1);

    // 添加随机抖动（±20%）
    const jitter = delay * 0.2;
    const jitteredDelay = delay + (Math.random() * 2 - 1) * jitter;

    // 限制最大延迟
    return Math.min(Math.max(jitteredDelay, this.retryStrategy.baseDelay), this.retryStrategy.maxDelay);
  }

  /**
   * 等待重试
   */
  public async waitForRetry(attempt: number): Promise<void> {
    const delay = this.calculateRetryDelay(attempt);
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * 执行带重试的操作
   */
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    options?: RetryOptions
  ): Promise<T> {
    const maxRetries = options?.maxRetries || this.retryStrategy.maxRetries;
    const onRetry = options?.onRetry;

    let lastError: AIEngineError | null = null;

    for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
      try {
        const result = await operation();

        // 如果是重试成功，记录统计
        if (attempt > 1) {
          this.recordRetrySuccess();
        }

        return result;

      } catch (error: any) {
        // 转换为AIEngineError（如果不是）
        const aiError = error instanceof AIEngineError ? error : AIEngineError.apiError(
          error.message || 'Unknown error',
          undefined,
          error
        );

        // 记录错误
        this.recordError(aiError);
        lastError = aiError;

        // 检查是否应该重试
        const shouldRetry = this.shouldRetry(attempt, aiError, options);

        if (shouldRetry) {
          // 计算延迟并等待
          const delay = this.calculateRetryDelay(attempt);

          // 调用重试回调
          if (onRetry) {
            onRetry(attempt, aiError, delay);
          }

          // 等待重试
          await this.waitForRetry(attempt);

          // 继续重试
          continue;
        } else {
          // 记录重试失败
          if (attempt > 1) {
            this.recordRetryFailure();
          }

          // 抛出最终错误
          throw this.enrichError(aiError, attempt);
        }
      }
    }

    // 如果所有重试都失败，抛出最后一个错误
    throw this.enrichError(lastError || new AIEngineError('All retries failed', AIEngineErrorType.UNKNOWN_ERROR), maxRetries + 1);
  }

  /**
   * 检查是否应该重试
   */
  private shouldRetry(
    attempt: number,
    error: AIEngineError,
    options?: RetryOptions
  ): boolean {
    // 检查是否超过最大重试次数
    const maxRetries = options?.maxRetries || this.retryStrategy.maxRetries;
    if (attempt > maxRetries) {
      return false;
    }

    // 检查错误是否可重试
    const retryableErrors = options?.retryableErrors || this.retryStrategy.retryableErrors;
    if (!retryableErrors.includes(error.type)) {
      return false;
    }

    // 检查错误本身是否可重试
    if (!error.retryable) {
      return false;
    }

    // 特定错误类型的特殊处理
    switch (error.type) {
      case AIEngineErrorType.AUTHENTICATION_ERROR:
        // 认证错误通常不可重试
        return false;

      case AIEngineErrorType.RATE_LIMIT_ERROR:
        // 速率限制错误：检查是否有retryAfter信息
        const retryAfter = (error as any).retryAfter;
        if (retryAfter && retryAfter > 60) { // 如果等待时间超过60秒，不重试
          return false;
        }
        return true;

      case AIEngineErrorType.NETWORK_ERROR:
        // 网络错误：最多重试3次
        return attempt <= 3;

      default:
        return true;
    }
  }

  /**
   * 丰富错误信息
   */
  private enrichError(error: AIEngineError, attempt: number): AIEngineError {
    const enrichedMessage = `${error.message} (Attempt ${attempt})`;

    return new AIEngineError(
      enrichedMessage,
      error.type,
      error.code,
      false, // 最终错误不可重试
      error.originalError
    );
  }

  /**
   * 获取错误建议
   */
  public getErrorSuggestions(error: AIEngineError): string[] {
    const suggestions: string[] = [];

    switch (error.type) {
      case AIEngineErrorType.AUTHENTICATION_ERROR:
        suggestions.push('检查API密钥是否正确配置');
        suggestions.push('验证API密钥是否有访问权限');
        suggestions.push('确认API密钥是否已过期');
        break;

      case AIEngineErrorType.RATE_LIMIT_ERROR:
        suggestions.push('降低请求频率');
        suggestions.push('考虑升级API套餐');
        suggestions.push('实现请求队列和批处理');
        break;

      case AIEngineErrorType.NETWORK_ERROR:
        suggestions.push('检查网络连接');
        suggestions.push('验证API端点是否可访问');
        suggestions.push('增加请求超时时间');
        break;

      case AIEngineErrorType.API_ERROR:
        suggestions.push('检查API服务状态');
        suggestions.push('验证请求参数是否正确');
        suggestions.push('查看API文档了解错误代码含义');
        break;

      case AIEngineErrorType.VALIDATION_ERROR:
        suggestions.push('验证输入数据格式');
        suggestions.push('检查必填字段是否完整');
        suggestions.push('确认数据是否符合API要求');
        break;

      case AIEngineErrorType.PARSING_ERROR:
        suggestions.push('检查API响应格式');
        suggestions.push('验证响应解析逻辑');
        suggestions.push('查看API响应原始数据');
        break;
    }

    // 通用建议
    suggestions.push('查看错误日志获取详细信息');
    suggestions.push('联系技术支持如果问题持续');

    return suggestions;
  }

  /**
   * 创建错误报告
   */
  public createErrorReport(error: AIEngineError): {
    summary: string;
    details: {
      type: string;
      message: string;
      timestamp: Date;
      retryable: boolean;
      suggestions: string[];
    };
    context: {
      totalErrors: number;
      errorTypeDistribution: Record<string, number>;
      lastErrors: Array<{ type: string; message: string; timestamp: Date }>;
    };
  } {
    const suggestions = this.getErrorSuggestions(error);

    // 获取最近错误
    const lastErrors: Array<{ type: string; message: string; timestamp: Date }> = [];
    if (this.stats.lastError) {
      lastErrors.push({
        type: this.stats.lastError.type,
        message: this.stats.lastError.message,
        timestamp: this.stats.lastError.timestamp
      });
    }

    return {
      summary: `AI Engine Error: ${error.type} - ${error.message.substring(0, 100)}...`,
      details: {
        type: error.type,
        message: error.message,
        timestamp: new Date(),
        retryable: error.retryable,
        suggestions
      },
      context: {
        totalErrors: this.stats.totalErrors,
        errorTypeDistribution: this.stats.byType,
        lastErrors
      }
    };
  }

  /**
   * 更新重试策略
   */
  public updateRetryStrategy(strategy: Partial<RetryStrategy>): void {
    this.retryStrategy = {
      ...this.retryStrategy,
      ...strategy
    };
  }

  /**
   * 获取当前重试策略
   */
  public getRetryStrategy(): RetryStrategy {
    return { ...this.retryStrategy };
  }
}

/**
 * 错误处理器工厂
 */
export class ErrorHandlerFactory {
  private static instances: Map<string, ErrorHandler> = new Map();

  /**
   * 获取错误处理器
   */
  public static getHandler(name: string = 'default'): ErrorHandler {
    if (!this.instances.has(name)) {
      this.instances.set(name, new ErrorHandler());
    }
    return this.instances.get(name)!;
  }

  /**
   * 创建自定义错误处理器
   */
  public static createHandler(name: string, retryStrategy: RetryStrategy): ErrorHandler {
    const handler = new ErrorHandler(retryStrategy);
    this.instances.set(name, handler);
    return handler;
  }

  /**
   * 移除错误处理器
   */
  public static removeHandler(name: string): boolean {
    return this.instances.delete(name);
  }

  /**
   * 获取所有处理器统计
   */
  public static getAllStats(): Record<string, ErrorStats> {
    const stats: Record<string, ErrorStats> = {};

    this.instances.forEach((handler, name) => {
      stats[name] = handler.getErrorStats();
    });

    return stats;
  }

  /**
   * 重置所有处理器统计
   */
  public static resetAllStats(): void {
    this.instances.forEach(handler => {
      handler.resetStats();
    });
  }
}

// 导出默认错误处理器
export const defaultErrorHandler = ErrorHandlerFactory.getHandler();

// 辅助函数：执行带重试的操作
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  return defaultErrorHandler.executeWithRetry(operation, options);
}

// 辅助函数：检查错误是否可重试
export function isRetryableError(error: AIEngineError): boolean {
  return defaultErrorHandler.isRetryable(error);
}

// 辅助函数：获取错误建议
export function getErrorSuggestions(error: AIEngineError): string[] {
  return defaultErrorHandler.getErrorSuggestions(error);
}