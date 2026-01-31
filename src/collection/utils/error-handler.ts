/**
 * 数据采集模块错误处理工具
 * 提供数据采集特定的错误处理功能
 */

import { CollectionLogger, createPlatformLogger } from './logger';

export enum CollectionErrorType {
  /** 网络错误 */
  NETWORK_ERROR = 'network_error',

  /** 反爬错误 */
  ANTI_CRAWLING_ERROR = 'anti_crawling_error',

  /** 数据解析错误 */
  DATA_PARSING_ERROR = 'data_parsing_error',

  /** API限制错误 */
  API_LIMIT_ERROR = 'api_limit_error',

  /** 配置错误 */
  CONFIGURATION_ERROR = 'configuration_error',

  /** 平台特定错误 */
  PLATFORM_SPECIFIC_ERROR = 'platform_specific_error',

  /** 未知错误 */
  UNKNOWN_ERROR = 'unknown_error',

  /** 致命错误 */
  FATAL_ERROR = 'fatal_error'
}

export interface CollectionErrorContext {
  /** 错误类型 */
  errorType: CollectionErrorType;

  /** 平台名称 */
  platform?: string;

  /** 采集操作 */
  operation?: string;

  /** 错误发生时间 */
  timestamp: Date;

  /** 重试次数 */
  retryCount?: number;

  /** 错误详情 */
  details?: Record<string, any>;
}

export class CollectionError extends Error {
  public readonly context: CollectionErrorContext;

  constructor(
    message: string,
    errorType: CollectionErrorType,
    platform?: string,
    operation?: string,
    details?: Record<string, any>
  ) {
    super(message);
    this.name = 'CollectionError';
    this.context = {
      errorType,
      platform,
      operation,
      timestamp: new Date(),
      details
    };
  }

  /**
   * 转换为可读字符串
   */
  toString(): string {
    return `[${this.context.errorType}] ${this.message} (Platform: ${this.context.platform || 'unknown'}, Operation: ${this.context.operation || 'unknown'})`;
  }
}

export class CollectionErrorHandler {
  private logger: CollectionLogger;

  constructor(logger?: CollectionLogger) {
    this.logger = logger || createPlatformLogger('error-handler');
  }

  /**
   * 处理采集错误
   */
  handleError(error: Error, context?: Partial<CollectionErrorContext>): void {
    const errorContext: CollectionErrorContext = {
      errorType: CollectionErrorType.UNKNOWN_ERROR,
      timestamp: new Date(),
      ...context
    };

    // 如果是CollectionError，合并上下文
    if (error instanceof CollectionError) {
      errorContext.errorType = error.context.errorType;
      errorContext.platform = error.context.platform || errorContext.platform;
      errorContext.operation = error.context.operation || errorContext.operation;
      errorContext.details = {
        ...error.context.details,
        ...errorContext.details
      };
    }

    // 根据错误类型记录日志
    this.logError(error, errorContext);

    // 根据错误类型采取不同处理策略
    this.applyErrorStrategy(error, errorContext);
  }

  /**
   * 记录错误日志
   */
  private logError(error: Error, context: CollectionErrorContext): void {
    const logData = {
      errorType: context.errorType,
      platform: context.platform,
      operation: context.operation,
      retryCount: context.retryCount,
      details: context.details,
      stack: error.stack
    };

    switch (context.errorType) {
      case CollectionErrorType.NETWORK_ERROR:
      case CollectionErrorType.API_LIMIT_ERROR:
        this.logger.warn(`Collection ${context.errorType}: ${error.message}`, logData, context.operation);
        break;

      case CollectionErrorType.ANTI_CRAWLING_ERROR:
        this.logger.error(`Anti-crawling detected: ${error.message}`, error, logData, context.operation);
        break;

      case CollectionErrorType.CONFIGURATION_ERROR:
        this.logger.error(`Configuration error: ${error.message}`, error, logData, context.operation);
        break;

      case CollectionErrorType.FATAL_ERROR:
        this.logger.fatal(`Fatal collection error: ${error.message}`, error, logData, context.operation);
        break;

      default:
        this.logger.error(`Collection error: ${error.message}`, error, logData, context.operation);
    }
  }

  /**
   * 应用错误处理策略
   */
  private applyErrorStrategy(error: Error, context: CollectionErrorContext): void {
    switch (context.errorType) {
      case CollectionErrorType.NETWORK_ERROR:
        // 网络错误：建议重试
        this.suggestRetry(error, context);
        break;

      case CollectionErrorType.API_LIMIT_ERROR:
        // API限制：建议等待或使用备用方案
        this.suggestWaitOrFallback(error, context);
        break;

      case CollectionErrorType.ANTI_CRAWLING_ERROR:
        // 反爬错误：建议调整采集策略
        this.suggestStrategyAdjustment(error, context);
        break;

      case CollectionErrorType.CONFIGURATION_ERROR:
        // 配置错误：需要人工干预
        this.requireHumanIntervention(error, context);
        break;

      default:
        // 其他错误：记录并继续
        this.logger.warn(`No specific strategy for error type: ${context.errorType}`);
    }
  }

  /**
   * 建议重试
   */
  private suggestRetry(error: Error, context: CollectionErrorContext): void {
    const retryCount = (context.retryCount || 0) + 1;
    const maxRetries = 3;

    if (retryCount <= maxRetries) {
      const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000); // 指数退避，最多30秒
      this.logger.info(`Will retry in ${delay}ms (attempt ${retryCount}/${maxRetries})`, {
        error: error.message,
        retryCount,
        delay
      }, context.operation);
    } else {
      this.logger.error(`Max retries exceeded (${maxRetries})`, error, {
        maxRetries
      }, context.operation);
    }
  }

  /**
   * 建议等待或使用备用方案
   */
  private suggestWaitOrFallback(error: Error, context: CollectionErrorContext): void {
    this.logger.warn(`API limit reached, consider:`, {
      error: error.message,
      suggestions: [
        'Wait for rate limit reset',
        'Use alternative API endpoint if available',
        'Switch to web scraping fallback',
        'Reduce collection frequency'
      ]
    }, context.operation);
  }

  /**
   * 建议调整采集策略
   */
  private suggestStrategyAdjustment(error: Error, context: CollectionErrorContext): void {
    this.logger.warn(`Anti-crawling detected, consider:`, {
      error: error.message,
      suggestions: [
        'Increase request delays',
        'Rotate user agents',
        'Use proxy servers',
        'Reduce collection frequency',
        'Switch to official API if available'
      ]
    }, context.operation);
  }

  /**
   * 需要人工干预
   */
  private requireHumanIntervention(error: Error, context: CollectionErrorContext): void {
    this.logger.error(`Configuration error requires manual intervention:`, error, {
      requiredActions: [
        'Check configuration files',
        'Verify API credentials',
        'Validate network connectivity',
        'Review platform access permissions'
      ]
    }, context.operation);
  }

  /**
   * 创建错误包装函数
   */
  wrapOperation<T>(
    operation: () => Promise<T>,
    platform?: string,
    operationName?: string
  ): () => Promise<T> {
    return async (): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        this.handleError(
          error instanceof Error ? error : new Error(String(error)),
          { platform, operation: operationName }
        );
        throw error;
      }
    };
  }
}

/**
 * 默认错误处理器实例
 */
export const defaultErrorHandler = new CollectionErrorHandler();

/**
 * 创建平台特定的错误处理器
 */
export function createPlatformErrorHandler(platform: string): CollectionErrorHandler {
  return new CollectionErrorHandler(createPlatformLogger(platform));
}