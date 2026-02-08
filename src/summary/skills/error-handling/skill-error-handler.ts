/**
 * Skill 错误处理模块
 */

import { SkillErrorCode, SkillExecutionResult, SkillExecutionContext } from '../types';

/**
 * 技能错误类型
 */
export interface SkillError {
  code: SkillErrorCode;
  message: string;
  details?: any;
  retryable: boolean;
  userFriendlyMessage: string;
  suggestions?: string[];
}

/**
 * 错误处理器配置
 */
export interface ErrorHandlerConfig {
  includeStackTrace: boolean;
  logErrors: boolean;
  maxErrorDetailsLength: number;
  provideSuggestions: boolean;
}

/**
 * 默认配置
 */
export const DEFAULT_ERROR_HANDLER_CONFIG: ErrorHandlerConfig = {
  includeStackTrace: false, // 生产环境不包含堆栈跟踪
  logErrors: true,
  maxErrorDetailsLength: 1000,
  provideSuggestions: true
};

/**
 * 错误类别
 */
export enum ErrorCategory {
  VALIDATION = 'VALIDATION',
  EXECUTION = 'EXECUTION',
  RESOURCE = 'RESOURCE',
  NETWORK = 'NETWORK',
  SECURITY = 'SECURITY',
  UNKNOWN = 'UNKNOWN'
}

/**
 * 错误严重级别
 */
export enum ErrorSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL'
}

/**
 * Skill 错误处理器
 */
export class SkillErrorHandler {
  private config: ErrorHandlerConfig;
  private errorStats: Map<string, number> = new Map();

  constructor(config?: Partial<ErrorHandlerConfig>) {
    this.config = { ...DEFAULT_ERROR_HANDLER_CONFIG, ...config };
  }

  /**
   * 处理技能错误
   */
  handleError(
    error: any,
    context: SkillExecutionContext,
    category: ErrorCategory = ErrorCategory.UNKNOWN
  ): SkillExecutionResult {
    const startTime = Date.now();
    const skillError = this.normalizeError(error, category);

    // 更新错误统计
    this.updateErrorStats(skillError.code);

    // 记录日志
    if (this.config.logErrors) {
      this.logError(skillError, context);
    }

    // 创建用户友好的错误信息
    const userFriendlyMessage = this.createUserFriendlyMessage(skillError, context);

    // 构建错误结果
    return {
      success: false,
      error: {
        code: skillError.code,
        message: userFriendlyMessage,
        details: this.createErrorDetails(skillError, context)
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
   * 规范化错误
   */
  private normalizeError(error: any, category: ErrorCategory): SkillError {
    // 如果是 SkillError 类型，直接使用
    if (this.isSkillError(error)) {
      return error;
    }

    // 根据错误类型确定错误代码
    let code: SkillErrorCode;
    let retryable = false;
    let userFriendlyMessage = '技能执行过程中发生错误';

    // 分析错误类型
    if (error.name === 'ValidationError' || error.message?.includes('validation')) {
      code = SkillErrorCode.PARAM_VALIDATION_FAILED;
      userFriendlyMessage = '参数验证失败，请检查输入参数';
    } else if (error.name === 'TimeoutError' || error.message?.includes('timeout')) {
      code = SkillErrorCode.TIMEOUT;
      userFriendlyMessage = '技能执行超时，请稍后重试';
      retryable = true;
    } else if (error.name === 'NetworkError' || error.message?.includes('network')) {
      code = SkillErrorCode.EXECUTION_FAILED;
      userFriendlyMessage = '网络连接问题，请检查网络后重试';
      retryable = true;
    } else if (error.message?.includes('budget') || error.message?.includes('cost')) {
      code = SkillErrorCode.EXECUTION_FAILED;
      userFriendlyMessage = '超出预算限制，请联系管理员';
    } else if (error.message?.includes('permission') || error.message?.includes('auth')) {
      code = SkillErrorCode.PERMISSION_DENIED;
      userFriendlyMessage = '权限不足，请检查访问权限';
    } else {
      code = SkillErrorCode.EXECUTION_FAILED;
    }

    // 确定严重级别
    const severity = this.determineSeverity(code, category);

    // 生成建议
    const suggestions = this.generateSuggestions(code, error);

    return {
      code,
      message: error.message || 'Unknown error',
      details: error.details || error,
      retryable,
      userFriendlyMessage,
      suggestions
    };
  }

  /**
   * 判断是否为 SkillError
   */
  private isSkillError(error: any): error is SkillError {
    return error && error.code && error.message && error.userFriendlyMessage !== undefined;
  }

  /**
   * 确定错误严重级别
   */
  private determineSeverity(code: SkillErrorCode, category: ErrorCategory): ErrorSeverity {
    switch (code) {
      case SkillErrorCode.PARAM_VALIDATION_FAILED:
        return ErrorSeverity.LOW;
      case SkillErrorCode.TIMEOUT:
        return ErrorSeverity.MEDIUM;
      case SkillErrorCode.PERMISSION_DENIED:
        return ErrorSeverity.HIGH;
      case SkillErrorCode.EXECUTION_FAILED:
        return category === ErrorCategory.RESOURCE ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM;
      case SkillErrorCode.SKILL_NOT_FOUND:
      case SkillErrorCode.SKILL_DISABLED:
        return ErrorSeverity.MEDIUM;
      case SkillErrorCode.INVALID_STATE:
        return ErrorSeverity.HIGH;
      default:
        return ErrorSeverity.MEDIUM;
    }
  }

  /**
   * 生成建议
   */
  private generateSuggestions(code: SkillErrorCode, error: any): string[] {
    const suggestions: string[] = [];

    switch (code) {
      case SkillErrorCode.PARAM_VALIDATION_FAILED:
        suggestions.push('检查参数格式和类型');
        suggestions.push('参考技能帮助文档获取参数说明');
        if (error.details?.errors) {
          suggestions.push(`具体错误: ${error.details.errors.join(', ')}`);
        }
        break;

      case SkillErrorCode.TIMEOUT:
        suggestions.push('稍后重试');
        suggestions.push('减少请求数据量');
        suggestions.push('联系管理员增加超时时间');
        break;

      case SkillErrorCode.EXECUTION_FAILED:
        suggestions.push('检查网络连接');
        suggestions.push('验证API密钥配置');
        suggestions.push('查看系统日志获取详细信息');
        break;

      case SkillErrorCode.SKILL_NOT_FOUND:
        suggestions.push('检查技能ID是否正确');
        suggestions.push('确认技能已注册');
        suggestions.push('查看可用技能列表');
        break;

      case SkillErrorCode.SKILL_DISABLED:
        suggestions.push('联系管理员启用该技能');
        suggestions.push('使用其他可用技能');
        break;

      case SkillErrorCode.PERMISSION_DENIED:
        suggestions.push('检查用户权限');
        suggestions.push('联系管理员获取访问权限');
        suggestions.push('使用具有适当权限的账号');
        break;

      case SkillErrorCode.INVALID_STATE:
        suggestions.push('等待其他任务完成');
        suggestions.push('减少并发请求');
        suggestions.push('重启技能服务');
        break;
    }

    // 如果错误包含具体信息，添加相关建议
    if (error.message?.includes('API key')) {
      suggestions.push('检查环境变量中的API密钥配置');
    }

    if (error.message?.includes('rate limit')) {
      suggestions.push('降低请求频率');
      suggestions.push('联系服务商增加配额');
    }

    return suggestions.slice(0, 3); // 最多返回3条建议
  }

  /**
   * 创建用户友好错误信息
   */
  private createUserFriendlyMessage(error: SkillError, context: SkillExecutionContext): string {
    let message = error.userFriendlyMessage;

    // 添加上下文信息
    if (context.skillId) {
      message = `技能 "${context.skillId}" 执行失败: ${message}`;
    }

    // 添加建议（如果配置允许）
    if (this.config.provideSuggestions && error.suggestions && error.suggestions.length > 0) {
      message += `\n\n建议:\n${error.suggestions.map(s => `• ${s}`).join('\n')}`;
    }

    return message;
  }

  /**
   * 创建错误详情
   */
  private createErrorDetails(error: SkillError, context: SkillExecutionContext): any {
    const details: any = {
      code: error.code,
      message: error.message,
      skillId: context.skillId,
      timestamp: new Date().toISOString(),
      retryable: error.retryable
    };

    // 添加错误详情（限制长度）
    if (error.details) {
      const detailsStr = JSON.stringify(error.details);
      if (detailsStr.length <= this.config.maxErrorDetailsLength) {
        details.originalError = error.details;
      } else {
        details.originalError = 'Error details too large, see logs for full details';
      }
    }

    // 添加堆栈跟踪（如果配置允许）
    if (this.config.includeStackTrace && error.details?.stack) {
      details.stackTrace = error.details.stack;
    }

    return details;
  }

  /**
   * 记录错误日志
   */
  private logError(error: SkillError, context: SkillExecutionContext): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      skillId: context.skillId,
      requestId: context.requestId,
      userId: context.userId,
      errorCode: error.code,
      errorMessage: error.message,
      retryable: error.retryable,
      parameters: context.parameters
    };

    console.error('Skill Error:', JSON.stringify(logEntry, null, 2));

    // 这里可以集成到系统的日志框架
    if (error.details) {
      console.error('Error Details:', error.details);
    }
  }

  /**
   * 更新错误统计
   */
  private updateErrorStats(errorCode: SkillErrorCode): void {
    const currentCount = this.errorStats.get(errorCode) || 0;
    this.errorStats.set(errorCode, currentCount + 1);
  }

  /**
   * 获取错误统计
   */
  getErrorStats(): Record<string, number> {
    const stats: Record<string, number> = {};
    for (const [code, count] of this.errorStats.entries()) {
      stats[code] = count;
    }
    return stats;
  }

  /**
   * 重置错误统计
   */
  resetErrorStats(): void {
    this.errorStats.clear();
  }

  /**
   * 获取配置
   */
  getConfig(): ErrorHandlerConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ErrorHandlerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * 全局错误处理器实例
 */
export const globalSkillErrorHandler = new SkillErrorHandler();

// 默认导出
export default globalSkillErrorHandler;