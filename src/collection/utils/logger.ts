/**
 * 数据采集模块日志系统
 * 提供结构化的日志记录功能
 */

export enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error',
  FATAL = 'fatal'
}

export interface LogEntry {
  /** 日志级别 */
  level: LogLevel;

  /** 日志消息 */
  message: string;

  /** 模块名称 */
  module: string;

  /** 操作名称 */
  operation?: string;

  /** 时间戳 */
  timestamp: Date;

  /** 额外数据 */
  data?: Record<string, any>;

  /** 错误对象 */
  error?: Error;
}

export interface LoggerOptions {
  /** 最小日志级别 */
  minLevel?: LogLevel;

  /** 是否启用控制台输出 */
  consoleOutput?: boolean;

  /** 是否启用文件输出 */
  fileOutput?: boolean;

  /** 文件输出路径 */
  filePath?: string;

  /** 模块名称 */
  moduleName?: string;
}

export class CollectionLogger {
  private options: LoggerOptions;

  constructor(options: LoggerOptions = {}) {
    this.options = {
      minLevel: LogLevel.INFO,
      consoleOutput: true,
      fileOutput: false,
      moduleName: 'collection',
      ...options
    };
  }

  /**
   * 记录调试日志
   */
  debug(message: string, data?: Record<string, any>, operation?: string): void {
    this.log(LogLevel.DEBUG, message, data, operation);
  }

  /**
   * 记录信息日志
   */
  info(message: string, data?: Record<string, any>, operation?: string): void {
    this.log(LogLevel.INFO, message, data, operation);
  }

  /**
   * 记录警告日志
   */
  warn(message: string, data?: Record<string, any>, operation?: string): void {
    this.log(LogLevel.WARN, message, data, operation);
  }

  /**
   * 记录错误日志
   */
  error(message: string, error?: Error, data?: Record<string, any>, operation?: string): void {
    this.log(LogLevel.ERROR, message, data, operation, error);
  }

  /**
   * 记录致命错误日志
   */
  fatal(message: string, error?: Error, data?: Record<string, any>, operation?: string): void {
    this.log(LogLevel.FATAL, message, data, operation, error);
  }

  /**
   * 通用日志记录方法
   */
  private log(
    level: LogLevel,
    message: string,
    data?: Record<string, any>,
    operation?: string,
    error?: Error
  ): void {
    // 检查日志级别
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      module: this.options.moduleName || 'collection',
      operation,
      timestamp: new Date(),
      data,
      error
    };

    // 控制台输出
    if (this.options.consoleOutput) {
      this.writeToConsole(entry);
    }

    // 文件输出
    if (this.options.fileOutput && this.options.filePath) {
      this.writeToFile(entry);
    }
  }

  /**
   * 检查是否应该记录该级别的日志
   */
  private shouldLog(level: LogLevel): boolean {
    const levelOrder = {
      [LogLevel.DEBUG]: 0,
      [LogLevel.INFO]: 1,
      [LogLevel.WARN]: 2,
      [LogLevel.ERROR]: 3,
      [LogLevel.FATAL]: 4
    };

    const minLevel = this.options.minLevel || LogLevel.INFO;
    return levelOrder[level] >= levelOrder[minLevel];
  }

  /**
   * 写入控制台
   */
  private writeToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.toISOString();
    const levelStr = entry.level.toUpperCase().padEnd(5);
    const moduleStr = `[${entry.module}]`;
    const operationStr = entry.operation ? `[${entry.operation}]` : '';

    let logMessage = `${timestamp} ${levelStr} ${moduleStr} ${operationStr} ${entry.message}`;

    // 添加错误信息
    if (entry.error) {
      logMessage += `\nError: ${entry.error.message}`;
      if (entry.error.stack) {
        logMessage += `\nStack: ${entry.error.stack}`;
      }
    }

    // 添加额外数据
    if (entry.data && Object.keys(entry.data).length > 0) {
      logMessage += `\nData: ${JSON.stringify(entry.data, null, 2)}`;
    }

    // 根据级别选择控制台方法
    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(logMessage);
        break;
      case LogLevel.INFO:
        console.info(logMessage);
        break;
      case LogLevel.WARN:
        console.warn(logMessage);
        break;
      case LogLevel.ERROR:
      case LogLevel.FATAL:
        console.error(logMessage);
        break;
    }
  }

  /**
   * 写入文件（待实现）
   */
  private writeToFile(entry: LogEntry): void {
    // TODO: 实现文件日志写入
    // 目前先输出到控制台
    console.warn('File logging not implemented yet, entry:', entry);
  }

  /**
   * 创建子模块日志器
   */
  createSubLogger(moduleName: string): CollectionLogger {
    return new CollectionLogger({
      ...this.options,
      moduleName: `${this.options.moduleName}.${moduleName}`
    });
  }
}

/**
 * 默认日志器实例
 */
export const defaultLogger = new CollectionLogger();

/**
 * 创建平台采集器日志器
 */
export function createPlatformLogger(platform: string): CollectionLogger {
  return defaultLogger.createSubLogger(`collector.${platform}`);
}

/**
 * 创建反爬系统日志器
 */
export function createAntiCrawlingLogger(): CollectionLogger {
  return defaultLogger.createSubLogger('anti-crawling');
}

/**
 * 创建数据清洗日志器
 */
export function createDataCleaningLogger(): CollectionLogger {
  return defaultLogger.createSubLogger('data-cleaning');
}

/**
 * 创建任务管理器日志器
 */
export function createTaskManagerLogger(): CollectionLogger {
  return defaultLogger.createSubLogger('task-manager');
}