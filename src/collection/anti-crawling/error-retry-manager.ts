/**
 * 错误重试和指数退避机制
 * 提供可配置的重试策略、退避算法和错误分类处理
 */

import { CollectionLogger, createAntiCrawlingLogger } from '../utils/logger';

export enum RetryableErrorType {
  /** 网络错误 */
  NETWORK_ERROR = 'network_error',

  /** 临时服务器错误 */
  SERVER_ERROR = 'server_error',

  /** 速率限制错误 */
  RATE_LIMIT_ERROR = 'rate_limit_error',

  /** 超时错误 */
  TIMEOUT_ERROR = 'timeout_error',

  /** 连接错误 */
  CONNECTION_ERROR = 'connection_error',

  /** 未知错误 */
  UNKNOWN_ERROR = 'unknown_error'
}

export interface RetryStrategy {
  /** 策略名称 */
  name: string;

  /** 是否启用重试 */
  enabled: boolean;

  /** 最大重试次数 */
  maxRetries: number;

  /** 基础延迟（毫秒） */
  baseDelay: number;

  /** 最大延迟（毫秒） */
  maxDelay: number;

  /** 退避因子 */
  backoffFactor: number;

  /** 是否启用抖动 */
  enableJitter: boolean;

  /** 抖动因子（0-1） */
  jitterFactor: number;

  /** 重试条件函数 */
  shouldRetry: (error: Error, attempt: number) => boolean;

  /** 计算延迟的函数 */
  calculateDelay: (attempt: number, baseDelay: number, backoffFactor: number, maxDelay: number, enableJitter: boolean, jitterFactor: number) => number;

  /** 策略描述 */
  description?: string;
}

export interface RetryContext {
  /** 操作名称 */
  operation: string;

  /** 开始时间 */
  startTime: Date;

  /** 当前重试次数 */
  currentAttempt: number;

  /** 总重试次数 */
  totalAttempts: number;

  /** 最后一次错误 */
  lastError?: Error;

  /** 错误类型 */
  errorType?: RetryableErrorType;

  /** 自定义上下文数据 */
  customData?: Record<string, any>;
}

export interface RetryResult<T> {
  /** 是否成功 */
  success: boolean;

  /** 返回结果（成功时） */
  result?: T;

  /** 错误（失败时） */
  error?: Error;

  /** 总重试次数 */
  totalAttempts: number;

  /** 总耗时（毫秒） */
  totalDuration: number;

  /** 重试上下文 */
  context: RetryContext;
}

export interface RetryManagerConfig {
  /** 默认重试策略 */
  defaultStrategy: string;

  /** 错误类型映射 */
  errorTypeMapping: Record<string, RetryableErrorType>;

  /** 是否记录重试日志 */
  enableLogging: boolean;

  /** 是否启用指标收集 */
  enableMetrics: boolean;

  /** 最大操作超时（毫秒） */
  maxOperationTimeout: number;

  /** 是否启用熔断器 */
  enableCircuitBreaker: boolean;

  /** 熔断器配置 */
  circuitBreakerConfig: {
    failureThreshold: number;
    resetTimeout: number;
    halfOpenMaxAttempts: number;
  };
}

export class ErrorRetryManager {
  private config: RetryManagerConfig;
  private logger: CollectionLogger;
  private retryStrategies: Map<string, RetryStrategy>;
  private retryMetrics: Map<string, { successes: number; failures: number; totalRetries: number; totalDuration: number }>;
  private circuitBreakerStates: Map<string, { failures: number; lastFailure: Date; state: 'closed' | 'open' | 'half-open' }>;

  constructor(config: Partial<RetryManagerConfig> = {}) {
    this.config = {
      defaultStrategy: 'exponentialBackoff',
      errorTypeMapping: {
        'network': RetryableErrorType.NETWORK_ERROR,
        'timeout': RetryableErrorType.TIMEOUT_ERROR,
        'rate limit': RetryableErrorType.RATE_LIMIT_ERROR,
        'server': RetryableErrorType.SERVER_ERROR,
        'connection': RetryableErrorType.CONNECTION_ERROR
      },
      enableLogging: true,
      enableMetrics: true,
      maxOperationTimeout: 300000, // 5分钟
      enableCircuitBreaker: true,
      circuitBreakerConfig: {
        failureThreshold: 5,
        resetTimeout: 60000, // 1分钟
        halfOpenMaxAttempts: 3
      },
      ...config
    };

    this.logger = createAntiCrawlingLogger();
    this.retryStrategies = new Map();
    this.retryMetrics = new Map();
    this.circuitBreakerStates = new Map();

    // 注册默认重试策略
    this.registerDefaultStrategies();

    this.logger.info('Error retry manager initialized', {
      defaultStrategy: this.config.defaultStrategy,
      enableCircuitBreaker: this.config.enableCircuitBreaker
    });
  }

  /**
   * 注册默认重试策略
   */
  private registerDefaultStrategies(): void {
    // 指数退避策略
    this.registerRetryStrategy('exponentialBackoff', {
      name: 'exponentialBackoff',
      enabled: true,
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      backoffFactor: 2,
      enableJitter: true,
      jitterFactor: 0.1,
      description: '指数退避策略，带抖动',
      shouldRetry: (error, attempt) => {
        const errorType = this.classifyError(error);
        return this.isRetryableErrorType(errorType) && attempt <= this.getStrategy('exponentialBackoff')!.maxRetries;
      },
      calculateDelay: (attempt, baseDelay, _backoffFactor, maxDelay, enableJitter, jitterFactor) => {
        // 指数退避：baseDelay * (backoffFactor ^ (attempt - 1))
        const delay = Math.min(
          baseDelay * Math.pow(_backoffFactor, attempt - 1),
          maxDelay
        );

        // 添加抖动
        if (enableJitter) {
          const jitter = delay * jitterFactor * (Math.random() * 2 - 1); // ±jitterFactor
          return Math.max(0, delay + jitter);
        }

        return delay;
      }
    });

    // 固定延迟策略
    this.registerRetryStrategy('fixedDelay', {
      name: 'fixedDelay',
      enabled: true,
      maxRetries: 3,
      baseDelay: 2000,
      maxDelay: 2000,
      backoffFactor: 1,
      enableJitter: false,
      jitterFactor: 0,
      description: '固定延迟策略',
      shouldRetry: (error, attempt) => {
        const errorType = this.classifyError(error);
        return this.isRetryableErrorType(errorType) && attempt <= this.getStrategy('fixedDelay')!.maxRetries;
      },
      calculateDelay: () => {
        return this.getStrategy('fixedDelay')!.baseDelay;
      }
    });

    // 线性递增策略
    this.registerRetryStrategy('linear', {
      name: 'linear',
      enabled: true,
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffFactor: 1,
      enableJitter: true,
      jitterFactor: 0.2,
      description: '线性递增延迟策略',
      shouldRetry: (error, attempt) => {
        const errorType = this.classifyError(error);
        return this.isRetryableErrorType(errorType) && attempt <= this.getStrategy('linear')!.maxRetries;
      },
      calculateDelay: (attempt, baseDelay, _backoffFactor, maxDelay, enableJitter, jitterFactor) => {
        // 线性递增：baseDelay * attempt
        const delay = Math.min(baseDelay * attempt, maxDelay);

        if (enableJitter) {
          const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
          return Math.max(0, delay + jitter);
        }

        return delay;
      }
    });

    // 激进重试策略（用于非关键操作）
    this.registerRetryStrategy('aggressive', {
      name: 'aggressive',
      enabled: true,
      maxRetries: 1,
      baseDelay: 500,
      maxDelay: 500,
      backoffFactor: 1,
      enableJitter: false,
      jitterFactor: 0,
      description: '激进重试策略，只重试一次',
      shouldRetry: (error, attempt) => {
        const errorType = this.classifyError(error);
        return this.isRetryableErrorType(errorType) && attempt <= this.getStrategy('aggressive')!.maxRetries;
      },
      calculateDelay: () => {
        return this.getStrategy('aggressive')!.baseDelay;
      }
    });

    // 保守重试策略（用于关键操作）
    this.registerRetryStrategy('conservative', {
      name: 'conservative',
      enabled: true,
      maxRetries: 5,
      baseDelay: 5000,
      maxDelay: 60000,
      backoffFactor: 3,
      enableJitter: true,
      jitterFactor: 0.15,
      description: '保守重试策略，更多重试和更长延迟',
      shouldRetry: (error, attempt) => {
        const errorType = this.classifyError(error);
        return this.isRetryableErrorType(errorType) && attempt <= this.getStrategy('conservative')!.maxRetries;
      },
      calculateDelay: (attempt, baseDelay, _backoffFactor, maxDelay, enableJitter, jitterFactor) => {
        const delay = Math.min(
          baseDelay * Math.pow(_backoffFactor, attempt - 1),
          maxDelay
        );

        if (enableJitter) {
          const jitter = delay * jitterFactor * (Math.random() * 2 - 1);
          return Math.max(0, delay + jitter);
        }

        return delay;
      }
    });
  }

  /**
   * 注册重试策略
   */
  registerRetryStrategy(name: string, strategy: RetryStrategy): void {
    this.retryStrategies.set(name, strategy);
    this.logger.debug(`Retry strategy registered: ${name}`, {
      strategyName: strategy.name,
      maxRetries: strategy.maxRetries,
      description: strategy.description
    });
  }

  /**
   * 获取重试策略
   */
  getStrategy(name: string): RetryStrategy | undefined {
    return this.retryStrategies.get(name);
  }

  /**
   * 设置默认重试策略
   */
  setDefaultStrategy(name: string): boolean {
    if (this.retryStrategies.has(name)) {
      this.config.defaultStrategy = name;
      this.logger.info(`Default retry strategy set to: ${name}`);
      return true;
    }

    this.logger.warn(`Retry strategy not found: ${name}`, {
      availableStrategies: Array.from(this.retryStrategies.keys())
    });
    return false;
  }

  /**
   * 分类错误
   */
  classifyError(error: Error): RetryableErrorType {
    const errorMessage = error.message.toLowerCase();
    const errorStack = error.stack?.toLowerCase() || '';

    // 检查错误类型映射
    for (const [keyword, errorType] of Object.entries(this.config.errorTypeMapping)) {
      if (errorMessage.includes(keyword.toLowerCase()) || errorStack.includes(keyword.toLowerCase())) {
        return errorType;
      }
    }

    // 基于错误消息的模式匹配
    if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      return RetryableErrorType.TIMEOUT_ERROR;
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('too many requests')) {
      return RetryableErrorType.RATE_LIMIT_ERROR;
    } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      return RetryableErrorType.NETWORK_ERROR;
    } else if (errorMessage.includes('server') || errorMessage.includes('5')) {
      return RetryableErrorType.SERVER_ERROR;
    } else if (errorMessage.includes('connect') || errorMessage.includes('econn')) {
      return RetryableErrorType.CONNECTION_ERROR;
    }

    return RetryableErrorType.UNKNOWN_ERROR;
  }

  /**
   * 检查错误类型是否可重试
   */
  isRetryableErrorType(errorType: RetryableErrorType): boolean {
    // 所有错误类型默认都可重试
    const nonRetryableTypes: RetryableErrorType[] = [];
    return !nonRetryableTypes.includes(errorType);
  }

  /**
   * 检查熔断器状态
   */
  private checkCircuitBreaker(operation: string): boolean {
    if (!this.config.enableCircuitBreaker) {
      return true;
    }

    const state = this.circuitBreakerStates.get(operation) || {
      failures: 0,
      lastFailure: new Date(0),
      state: 'closed' as const
    };

    const now = new Date();

    switch (state.state) {
      case 'open':
        // 检查是否应该进入半开状态
        if (now.getTime() - state.lastFailure.getTime() >= this.config.circuitBreakerConfig.resetTimeout) {
          state.state = 'half-open';
          state.failures = 0;
          this.circuitBreakerStates.set(operation, state);
          this.logger.info(`Circuit breaker for ${operation} moved to half-open state`);
          return true;
        }
        this.logger.warn(`Circuit breaker open for ${operation}, request blocked`);
        return false;

      case 'half-open':
        // 半开状态允许有限尝试
        if (state.failures < this.config.circuitBreakerConfig.halfOpenMaxAttempts) {
          return true;
        }
        // 尝试失败太多，回到开路状态
        state.state = 'open';
        state.lastFailure = now;
        this.circuitBreakerStates.set(operation, state);
        this.logger.warn(`Circuit breaker for ${operation} moved back to open state`);
        return false;

      case 'closed':
        return true;
    }
  }

  /**
   * 更新熔断器状态
   */
  private updateCircuitBreaker(operation: string, success: boolean): void {
    if (!this.config.enableCircuitBreaker) {
      return;
    }

    let state = this.circuitBreakerStates.get(operation);
    if (!state) {
      state = {
        failures: 0,
        lastFailure: new Date(0),
        state: 'closed'
      };
    }

    const now = new Date();

    if (success) {
      // 成功时重置熔断器
      if (state.state === 'half-open') {
        // 半开状态下成功，回到闭路状态
        state.state = 'closed';
        state.failures = 0;
        this.logger.info(`Circuit breaker for ${operation} reset to closed state after successful attempt`);
      }
    } else {
      // 失败时更新熔断器
      state.failures++;
      state.lastFailure = now;

      if (state.state === 'closed' && state.failures >= this.config.circuitBreakerConfig.failureThreshold) {
        // 闭路状态下失败次数达到阈值，进入开路状态
        state.state = 'open';
        this.logger.warn(`Circuit breaker for ${operation} tripped to open state`, {
          failures: state.failures,
          threshold: this.config.circuitBreakerConfig.failureThreshold
        });
      } else if (state.state === 'half-open') {
        // 半开状态下失败，回到开路状态
        state.state = 'open';
        this.logger.warn(`Circuit breaker for ${operation} moved back to open state after failed half-open attempt`);
      }
    }

    this.circuitBreakerStates.set(operation, state);
  }

  /**
   * 执行带有重试的操作
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: {
      operationName?: string;
      strategyName?: string;
      customContext?: Record<string, any>;
      timeout?: number;
    } = {}
  ): Promise<RetryResult<T>> {
    const operationName = options.operationName || 'unknown';
    const strategyName = options.strategyName || this.config.defaultStrategy;
    const strategy = this.getStrategy(strategyName);

    if (!strategy) {
      const error = new Error(`Retry strategy not found: ${strategyName}`);
      this.logger.error('Failed to execute with retry', error, { operationName, strategyName });
      return {
        success: false,
        error,
        totalAttempts: 0,
        totalDuration: 0,
        context: {
          operation: operationName,
          startTime: new Date(),
          currentAttempt: 0,
          totalAttempts: 0
        }
      };
    }

    // 检查熔断器
    if (!this.checkCircuitBreaker(operationName)) {
      const error = new Error(`Circuit breaker is open for operation: ${operationName}`);
      return {
        success: false,
        error,
        totalAttempts: 0,
        totalDuration: 0,
        context: {
          operation: operationName,
          startTime: new Date(),
          currentAttempt: 0,
          totalAttempts: 0
        }
      };
    }

    const context: RetryContext = {
      operation: operationName,
      startTime: new Date(),
      currentAttempt: 0,
      totalAttempts: 0,
      customData: options.customContext
    };

    let lastError: Error;
    let result: T;

    for (let attempt = 1; attempt <= strategy.maxRetries + 1; attempt++) {
      context.currentAttempt = attempt;
      context.totalAttempts = attempt;

      try {
        // 设置超时
        const timeout = options.timeout || this.config.maxOperationTimeout;
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Operation timeout after ${timeout}ms`)), timeout);
        });

        // 执行操作
        result = await Promise.race([operation(), timeoutPromise]);

        // 成功
        const endTime = new Date();
        const totalDuration = endTime.getTime() - context.startTime.getTime();

        // 更新熔断器
        this.updateCircuitBreaker(operationName, true);

        // 更新指标
        if (this.config.enableMetrics) {
          this.updateMetrics(operationName, true, totalDuration, attempt);
        }

        if (this.config.enableLogging) {
          this.logger.info(`Operation succeeded after ${attempt} attempt(s)`, {
            operation: operationName,
            attempt,
            totalDuration,
            strategy: strategyName
          });
        }

        return {
          success: true,
          result,
          totalAttempts: attempt,
          totalDuration,
          context: { ...context, errorType: undefined }
        };

      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        lastError = errorObj;
        context.lastError = errorObj;
        context.errorType = this.classifyError(errorObj);

        // 检查是否应该重试
        const shouldRetry = strategy.shouldRetry(errorObj, attempt) && attempt <= strategy.maxRetries;

        if (this.config.enableLogging) {
          const logData = {
            operation: operationName,
            attempt,
            errorType: context.errorType,
            shouldRetry,
            maxRetries: strategy.maxRetries
          };
          if (shouldRetry) {
            this.logger.warn(`Operation failed on attempt ${attempt}`, logData);
          } else {
            this.logger.error(`Operation failed on attempt ${attempt}`, errorObj, logData);
          }
        }

        if (!shouldRetry) {
          // 不再重试
          const endTime = new Date();
          const totalDuration = endTime.getTime() - context.startTime.getTime();

          // 更新熔断器
          this.updateCircuitBreaker(operationName, false);

          // 更新指标
          if (this.config.enableMetrics) {
            this.updateMetrics(operationName, false, totalDuration, attempt);
          }

          return {
            success: false,
            error: errorObj,
            totalAttempts: attempt,
            totalDuration,
            context
          };
        }

        // 计算延迟并等待
        const delay = strategy.calculateDelay(
          attempt,
          strategy.baseDelay,
          strategy.backoffFactor,
          strategy.maxDelay,
          strategy.enableJitter,
          strategy.jitterFactor
        );

        if (this.config.enableLogging) {
          this.logger.debug(`Waiting ${delay}ms before retry attempt ${attempt + 1}`, {
            operation: operationName,
            currentAttempt: attempt,
            nextAttempt: attempt + 1,
            delay,
            strategy: strategyName
          });
        }

        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // 所有重试都失败
    const endTime = new Date();
    const totalDuration = endTime.getTime() - context.startTime.getTime();

    // 更新熔断器
    this.updateCircuitBreaker(operationName, false);

    // 更新指标
    if (this.config.enableMetrics) {
      this.updateMetrics(operationName, false, totalDuration, strategy.maxRetries + 1);
    }

    this.logger.error(`Operation failed after all ${strategy.maxRetries + 1} attempts`, lastError!, {
      operation: operationName,
      totalAttempts: strategy.maxRetries + 1,
      totalDuration,
      strategy: strategyName
    });

    return {
      success: false,
      error: lastError!,
      totalAttempts: strategy.maxRetries + 1,
      totalDuration,
      context
    };
  }

  /**
   * 更新指标
   */
  private updateMetrics(operation: string, success: boolean, duration: number, attempts: number): void {
    let metrics = this.retryMetrics.get(operation);
    if (!metrics) {
      metrics = { successes: 0, failures: 0, totalRetries: 0, totalDuration: 0 };
    }

    if (success) {
      metrics.successes++;
    } else {
      metrics.failures++;
    }

    metrics.totalRetries += attempts - 1; // 减去除第一次尝试外的重试次数
    metrics.totalDuration += duration;

    this.retryMetrics.set(operation, metrics);
  }

  /**
   * 获取操作指标
   */
  getOperationMetrics(operation: string): {
    successes: number;
    failures: number;
    totalRetries: number;
    totalDuration: number;
    averageDuration: number;
    successRate: number;
  } | null {
    const metrics = this.retryMetrics.get(operation);
    if (!metrics) {
      return null;
    }

    const totalAttempts = metrics.successes + metrics.failures;
    const successRate = totalAttempts > 0 ? metrics.successes / totalAttempts : 0;
    const averageDuration = totalAttempts > 0 ? metrics.totalDuration / totalAttempts : 0;

    return {
      ...metrics,
      averageDuration,
      successRate
    };
  }

  /**
   * 获取所有指标
   */
  getAllMetrics(): Record<string, {
    successes: number;
    failures: number;
    totalRetries: number;
    totalDuration: number;
    averageDuration: number;
    successRate: number;
  }> {
    const result: Record<string, any> = {};

    for (const [operation, metrics] of this.retryMetrics) {
      const totalAttempts = metrics.successes + metrics.failures;
      const successRate = totalAttempts > 0 ? metrics.successes / totalAttempts : 0;
      const averageDuration = totalAttempts > 0 ? metrics.totalDuration / totalAttempts : 0;

      result[operation] = {
        ...metrics,
        averageDuration,
        successRate
      };
    }

    return result;
  }

  /**
   * 获取熔断器状态
   */
  getCircuitBreakerState(operation: string): {
    state: 'closed' | 'open' | 'half-open';
    failures: number;
    lastFailure: Date;
  } | null {
    const state = this.circuitBreakerStates.get(operation);
    if (!state) {
      return null;
    }

    return { ...state };
  }

  /**
   * 重置熔断器
   */
  resetCircuitBreaker(operation: string): boolean {
    const state = this.circuitBreakerStates.get(operation);
    if (!state) {
      return false;
    }

    state.state = 'closed';
    state.failures = 0;
    state.lastFailure = new Date(0);
    this.circuitBreakerStates.set(operation, state);

    this.logger.info(`Circuit breaker reset for operation: ${operation}`);
    return true;
  }

  /**
   * 重置所有熔断器
   */
  resetAllCircuitBreakers(): void {
    for (const [operation] of this.circuitBreakerStates) {
      this.resetCircuitBreaker(operation);
    }

    this.logger.info('All circuit breakers reset');
  }

  /**
   * 重置指标
   */
  resetMetrics(operation?: string): void {
    if (operation) {
      this.retryMetrics.delete(operation);
      this.logger.info(`Metrics reset for operation: ${operation}`);
    } else {
      this.retryMetrics.clear();
      this.logger.info('All metrics reset');
    }
  }
}