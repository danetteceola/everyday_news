/**
 * CAPTCHA检测和处理
 * 提供CAPTCHA挑战的检测、处理策略和解决机制
 */

import { CollectionLogger, createAntiCrawlingLogger } from '../utils/logger';

export enum CaptchaType {
  /** 图片验证码 */
  IMAGE_CAPTCHA = 'image_captcha',

  /** 滑动验证码 */
  SLIDER_CAPTCHA = 'slider_captcha',

  /** 点击验证码 */
  CLICK_CAPTCHA = 'click_captcha',

  /** 文字验证码 */
  TEXT_CAPTCHA = 'text_captcha',

  /** 拼图验证码 */
  PUZZLE_CAPTCHA = 'puzzle_captcha',

  /** 旋转验证码 */
  ROTATE_CAPTCHA = 'rotate_captcha',

  /** 行为验证码 */
  BEHAVIOR_CAPTCHA = 'behavior_captcha',

  /** 未知类型 */
  UNKNOWN = 'unknown'
}

export interface CaptchaDetectionResult {
  /** 是否检测到CAPTCHA */
  detected: boolean;

  /** CAPTCHA类型 */
  captchaType: CaptchaType;

  /** 置信度 (0-1) */
  confidence: number;

  /** 检测到的特征 */
  features: string[];

  /** 原始响应数据 */
  rawData?: any;

  /** 检测时间 */
  timestamp: Date;
}

export interface CaptchaSolution {
  /** 解决方案ID */
  id: string;

  /** 是否成功 */
  success: boolean;

  /** 解决方案数据 */
  solutionData: any;

  /** 解决时间 */
  solvedAt: Date;

  /** 解决耗时（毫秒） */
  solveDuration: number;

  /** 错误信息 */
  error?: string;
}

export interface CaptchaSolver {
  /** 解析器名称 */
  name: string;

  /** 支持的CAPTCHA类型 */
  supportedTypes: CaptchaType[];

  /** 解析函数 */
  solve: (detection: CaptchaDetectionResult, context?: any) => Promise<CaptchaSolution>;

  /** 解析器优先级（1-10，越高越优先） */
  priority: number;

  /** 是否启用 */
  enabled: boolean;

  /** 解析器配置 */
  config?: Record<string, any>;
}

export interface CaptchaHandlerConfig {
  /** 是否启用CAPTCHA检测 */
  enableDetection: boolean;

  /** 是否启用自动解决 */
  enableAutoSolve: boolean;

  /** 最大自动解决尝试次数 */
  maxAutoSolveAttempts: number;

  /** 失败后的处理策略 */
  failureStrategy: 'skip' | 'retry' | 'notify' | 'pause';

  /** 通知配置 */
  notificationConfig: {
    enabled: boolean;
    notificationChannels: string[];
    notificationTemplate?: string;
  };

  /** 检测阈值 */
  detectionThreshold: number;

  /** 是否记录详细日志 */
  enableDetailedLogging: boolean;

  /** 是否启用学习模式 */
  enableLearningMode: boolean;

  /** 学习数据保存路径 */
  learningDataPath?: string;
}

export class CaptchaManager {
  private config: CaptchaHandlerConfig;
  private logger: CollectionLogger;
  private captchaSolvers: Map<string, CaptchaSolver>;
  private detectionHistory: CaptchaDetectionResult[];
  private solutionHistory: CaptchaSolution[];
  private learningData: any[];

  constructor(config: Partial<CaptchaHandlerConfig> = {}) {
    this.config = {
      enableDetection: true,
      enableAutoSolve: true,
      maxAutoSolveAttempts: 3,
      failureStrategy: 'notify',
      notificationConfig: {
        enabled: true,
        notificationChannels: ['console'],
        notificationTemplate: 'CAPTCHA detected during data collection'
      },
      detectionThreshold: 0.7,
      enableDetailedLogging: true,
      enableLearningMode: false,
      learningDataPath: './data/captcha-learning',
      ...config
    };

    this.logger = createAntiCrawlingLogger();
    this.captchaSolvers = new Map();
    this.detectionHistory = [];
    this.solutionHistory = [];
    this.learningData = [];

    // 注册默认解析器
    this.registerDefaultSolvers();

    // 初始化学习数据
    if (this.config.enableLearningMode) {
      this.loadLearningData();
    }

    this.logger.info('CAPTCHA manager initialized', {
      enableDetection: this.config.enableDetection,
      enableAutoSolve: this.config.enableAutoSolve,
      failureStrategy: this.config.failureStrategy
    });
  }

  /**
   * 注册默认解析器
   */
  private registerDefaultSolvers(): void {
    // 控制台通知解析器
    this.registerCaptchaSolver('consoleNotifier', {
      name: 'consoleNotifier',
      supportedTypes: Object.values(CaptchaType),
      priority: 1,
      enabled: true,
      solve: async (detection, context) => {
        this.logger.warn('CAPTCHA detected, manual intervention required', {
          captchaType: detection.captchaType,
          confidence: detection.confidence,
          features: detection.features,
          context
        });

        return {
          id: `console-${Date.now()}`,
          success: false,
          solutionData: { message: 'Manual intervention required' },
          solvedAt: new Date(),
          solveDuration: 0
        };
      }
    });

    // 模拟解析器（用于测试）
    this.registerCaptchaSolver('mockSolver', {
      name: 'mockSolver',
      supportedTypes: [CaptchaType.IMAGE_CAPTCHA, CaptchaType.TEXT_CAPTCHA],
      priority: 2,
      enabled: false,
      solve: async (_detection, _context) => {
        // 模拟解决过程
        await new Promise(resolve => setTimeout(resolve, 1000));

        const success = Math.random() > 0.3; // 70%成功率

        return {
          id: `mock-${Date.now()}`,
          success,
          solutionData: { simulated: true, success },
          solvedAt: new Date(),
          solveDuration: 1000,
          error: success ? undefined : 'Simulated failure'
        };
      }
    });

    // 跳过解析器
    this.registerCaptchaSolver('skipSolver', {
      name: 'skipSolver',
      supportedTypes: Object.values(CaptchaType),
      priority: 3,
      enabled: true,
      solve: async (detection, context) => {
        this.logger.info('Skipping CAPTCHA challenge', {
          captchaType: detection.captchaType,
          url: context?.url
        });

        return {
          id: `skip-${Date.now()}`,
          success: true,
          solutionData: { action: 'skipped', reason: 'Bypassed CAPTCHA' },
          solvedAt: new Date(),
          solveDuration: 0
        };
      }
    });
  }

  /**
   * 注册CAPTCHA解析器
   */
  registerCaptchaSolver(name: string, solver: CaptchaSolver): void {
    this.captchaSolvers.set(name, solver);
    this.logger.debug(`CAPTCHA solver registered: ${name}`, {
      solverName: solver.name,
      supportedTypes: solver.supportedTypes,
      priority: solver.priority,
      enabled: solver.enabled
    });
  }

  /**
   * 启用/禁用解析器
   */
  setSolverEnabled(name: string, enabled: boolean): boolean {
    const solver = this.captchaSolvers.get(name);
    if (!solver) {
      this.logger.warn(`CAPTCHA solver not found: ${name}`);
      return false;
    }

    solver.enabled = enabled;
    this.captchaSolvers.set(name, solver);
    this.logger.info(`CAPTCHA solver ${name} ${enabled ? 'enabled' : 'disabled'}`);
    return true;
  }

  /**
   * 检测CAPTCHA
   */
  detectCaptcha(response: any, context?: any): CaptchaDetectionResult {
    if (!this.config.enableDetection) {
      return {
        detected: false,
        captchaType: CaptchaType.UNKNOWN,
        confidence: 0,
        features: [],
        timestamp: new Date()
      };
    }

    const detection = this.performDetection(response, context);
    this.detectionHistory.push(detection);

    // 保存学习数据
    if (this.config.enableLearningMode && detection.detected) {
      this.saveLearningData(detection, response, context);
    }

    // 记录检测结果
    if (detection.detected) {
      this.logDetection(detection, context);
    }

    return detection;
  }

  /**
   * 执行CAPTCHA检测
   */
  private performDetection(response: any, context?: any): CaptchaDetectionResult {
    const features: string[] = [];
    let confidence = 0;
    let captchaType = CaptchaType.UNKNOWN;

    // 检查响应数据
    if (response) {
      // 检查HTTP状态码
      if (response.status === 403 || response.status === 429) {
        features.push(`status_${response.status}`);
        confidence += 0.2;
      }

      // 检查响应头
      if (response.headers) {
        const headers = Object.keys(response.headers).map(k => k.toLowerCase());
        if (headers.some(h => h.includes('captcha') || h.includes('challenge'))) {
          features.push('captcha_header');
          confidence += 0.3;
        }
      }

      // 检查响应体
      if (response.data) {
        const responseText = typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data);

        const textLower = responseText.toLowerCase();

        // CAPTCHA关键词检测
        const captchaKeywords = [
          'captcha',
          'recaptcha',
          'hcaptcha',
          'cloudflare',
          'challenge',
          '验证码',
          '人机验证',
          'robot',
          'bot'
        ];

        const foundKeywords = captchaKeywords.filter(keyword =>
          textLower.includes(keyword.toLowerCase())
        );

        if (foundKeywords.length > 0) {
          features.push(...foundKeywords.map(k => `keyword_${k}`));
          confidence += Math.min(0.4, foundKeywords.length * 0.1);
        }

        // 特定CAPTCHA类型检测
        if (textLower.includes('recaptcha')) {
          captchaType = CaptchaType.CLICK_CAPTCHA;
          confidence += 0.2;
        } else if (textLower.includes('hcaptcha')) {
          captchaType = CaptchaType.CLICK_CAPTCHA;
          confidence += 0.2;
        } else if (textLower.includes('slider')) {
          captchaType = CaptchaType.SLIDER_CAPTCHA;
          confidence += 0.2;
        } else if (textLower.includes('puzzle')) {
          captchaType = CaptchaType.PUZZLE_CAPTCHA;
          confidence += 0.2;
        } else if (textLower.includes('rotate')) {
          captchaType = CaptchaType.ROTATE_CAPTCHA;
          confidence += 0.2;
        } else if (textLower.includes('image') && textLower.includes('code')) {
          captchaType = CaptchaType.IMAGE_CAPTCHA;
          confidence += 0.2;
        } else if (textLower.includes('text') && textLower.includes('code')) {
          captchaType = CaptchaType.TEXT_CAPTCHA;
          confidence += 0.2;
        }

        // HTML特征检测
        if (textLower.includes('<iframe') && textLower.includes('recaptcha')) {
          features.push('recaptcha_iframe');
          confidence += 0.3;
          captchaType = CaptchaType.CLICK_CAPTCHA;
        }

        if (textLower.includes('data-sitekey')) {
          features.push('sitekey_attribute');
          confidence += 0.3;
        }

        if (textLower.includes('cf-chl-widget')) {
          features.push('cloudflare_widget');
          confidence += 0.4;
          captchaType = CaptchaType.BEHAVIOR_CAPTCHA;
        }
      }

      // 检查响应URL
      if (context?.url) {
        const urlLower = context.url.toLowerCase();
        if (urlLower.includes('captcha') || urlLower.includes('challenge')) {
          features.push('captcha_url');
          confidence += 0.2;
        }
      }
    }

    // 归一化置信度
    confidence = Math.min(1, confidence);

    const detected = confidence >= this.config.detectionThreshold;

    return {
      detected,
      captchaType: detected ? captchaType : CaptchaType.UNKNOWN,
      confidence,
      features: [...new Set(features)], // 去重
      rawData: response,
      timestamp: new Date()
    };
  }

  /**
   * 记录检测结果
   */
  private logDetection(detection: CaptchaDetectionResult, context?: any): void {
    const logData = {
      captchaType: detection.captchaType,
      confidence: detection.confidence,
      features: detection.features,
      url: context?.url,
      timestamp: detection.timestamp
    };

    if (detection.confidence >= 0.8) {
      this.logger.warn('High confidence CAPTCHA detection', logData);
    } else if (detection.confidence >= this.config.detectionThreshold) {
      this.logger.info('CAPTCHA detected', logData);
    } else if (this.config.enableDetailedLogging) {
      this.logger.debug('Low confidence CAPTCHA detection', logData);
    }
  }

  /**
   * 处理CAPTCHA挑战
   */
  async handleCaptcha(detection: CaptchaDetectionResult, context?: any): Promise<CaptchaSolution> {
    if (!detection.detected) {
      return {
        id: `no-captcha-${Date.now()}`,
        success: true,
        solutionData: { action: 'none', reason: 'No CAPTCHA detected' },
        solvedAt: new Date(),
        solveDuration: 0
      };
    }

    // 如果不启用自动解决，返回通知
    if (!this.config.enableAutoSolve) {
      return this.notifyCaptcha(detection, context);
    }

    // 尝试自动解决
    for (let attempt = 1; attempt <= this.config.maxAutoSolveAttempts; attempt++) {
      try {
        const solution = await this.attemptAutoSolve(detection, context, attempt);

        if (solution.success) {
          this.logger.info(`CAPTCHA solved successfully on attempt ${attempt}`, {
            captchaType: detection.captchaType,
            attempt,
            solver: solution.id
          });

          this.solutionHistory.push(solution);
          return solution;
        }

        this.logger.warn(`CAPTCHA solve attempt ${attempt} failed`, {
          captchaType: detection.captchaType,
          attempt,
          solver: solution.id,
          error: solution.error
        });

        // 检查是否还有尝试次数
        if (attempt === this.config.maxAutoSolveAttempts) {
          this.logger.error(`All CAPTCHA solve attempts failed`, null, {
            captchaType: detection.captchaType,
            maxAttempts: this.config.maxAutoSolveAttempts
          });

          // 根据失败策略处理
          return this.handleFailureStrategy(detection, context);
        }

        // 等待后重试
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));

      } catch (error) {
        this.logger.error(`Error during CAPTCHA solve attempt ${attempt}`, error as Error, {
          captchaType: detection.captchaType,
          attempt
        });

        if (attempt === this.config.maxAutoSolveAttempts) {
          return this.handleFailureStrategy(detection, context);
        }
      }
    }

    // 所有尝试都失败
    return this.handleFailureStrategy(detection, context);
  }

  /**
   * 尝试自动解决
   */
  private async attemptAutoSolve(
    detection: CaptchaDetectionResult,
    context: any,
    attempt: number
  ): Promise<CaptchaSolution> {
    // 获取可用的解析器
    const availableSolvers = Array.from(this.captchaSolvers.values())
      .filter(solver =>
        solver.enabled &&
        solver.supportedTypes.includes(detection.captchaType)
      )
      .sort((a, b) => b.priority - a.priority);

    if (availableSolvers.length === 0) {
      this.logger.warn(`No CAPTCHA solver available for type: ${detection.captchaType}`, {
        captchaType: detection.captchaType,
        availableSolvers: Array.from(this.captchaSolvers.values())
          .filter(s => s.enabled)
          .map(s => s.name)
      });

      return {
        id: `no-solver-${Date.now()}`,
        success: false,
        solutionData: { action: 'none', reason: 'No solver available' },
        solvedAt: new Date(),
        solveDuration: 0,
        error: `No solver available for CAPTCHA type: ${detection.captchaType}`
      };
    }

    // 尝试每个解析器（按优先级）
    for (const solver of availableSolvers) {
      try {
        const startTime = Date.now();
        const solution = await solver.solve(detection, { ...context, attempt });
        const solveDuration = Date.now() - startTime;

        return {
          ...solution,
          solveDuration
        };

      } catch (error) {
        this.logger.warn(`CAPTCHA solver ${solver.name} failed`, {
          error: error instanceof Error ? error.message : String(error),
          captchaType: detection.captchaType,
          solver: solver.name,
          attempt
        });

        // 继续尝试下一个解析器
        continue;
      }
    }

    // 所有解析器都失败
    return {
      id: `all-failed-${Date.now()}`,
      success: false,
      solutionData: { action: 'none', reason: 'All solvers failed' },
      solvedAt: new Date(),
      solveDuration: 0,
      error: 'All CAPTCHA solvers failed'
    };
  }

  /**
   * 处理失败策略
   */
  private async handleFailureStrategy(
    detection: CaptchaDetectionResult,
    context: any
  ): Promise<CaptchaSolution> {
    switch (this.config.failureStrategy) {
      case 'skip':
        this.logger.info('Skipping due to CAPTCHA failure', {
          captchaType: detection.captchaType,
          strategy: 'skip'
        });

        return {
          id: `skip-${Date.now()}`,
          success: true, // 跳过视为成功
          solutionData: { action: 'skipped', reason: 'CAPTCHA solve failed' },
          solvedAt: new Date(),
          solveDuration: 0
        };

      case 'retry':
        this.logger.info('Will retry later due to CAPTCHA failure', {
          captchaType: detection.captchaType,
          strategy: 'retry'
        });

        return {
          id: `retry-${Date.now()}`,
          success: false,
          solutionData: { action: 'retry_later', reason: 'Will retry after delay' },
          solvedAt: new Date(),
          solveDuration: 0,
          error: 'CAPTCHA solve failed, will retry'
        };

      case 'notify':
        return this.notifyCaptcha(detection, context);

      case 'pause':
        this.logger.error('Pausing collection due to CAPTCHA failure', null, {
          captchaType: detection.captchaType,
          strategy: 'pause'
        });

        return {
          id: `pause-${Date.now()}`,
          success: false,
          solutionData: { action: 'paused', reason: 'Collection paused due to CAPTCHA' },
          solvedAt: new Date(),
          solveDuration: 0,
          error: 'Collection paused due to CAPTCHA failure'
        };

      default:
        return this.notifyCaptcha(detection, context);
    }
  }

  /**
   * 通知CAPTCHA检测
   */
  private async notifyCaptcha(detection: CaptchaDetectionResult, context?: any): Promise<CaptchaSolution> {
    const notificationData = {
      captchaType: detection.captchaType,
      confidence: detection.confidence,
      features: detection.features,
      timestamp: new Date(),
      context
    };

    // 发送通知
    if (this.config.notificationConfig.enabled) {
      const channels = this.config.notificationConfig.notificationChannels;

      for (const channel of channels) {
        try {
          await this.sendNotification(channel, notificationData);
        } catch (error) {
          this.logger.error(`Failed to send CAPTCHA notification via ${channel}`, error as Error);
        }
      }
    }

    this.logger.warn('CAPTCHA notification sent', notificationData);

    return {
      id: `notify-${Date.now()}`,
      success: false,
      solutionData: notificationData,
      solvedAt: new Date(),
      solveDuration: 0,
      error: 'CAPTCHA detected, manual intervention required'
    };
  }

  /**
   * 发送通知
   */
  private async sendNotification(channel: string, data: any): Promise<void> {
    switch (channel) {
      case 'console':
        console.warn('CAPTCHA Notification:', data);
        break;

      case 'log':
        this.logger.warn('CAPTCHA notification', data);
        break;

      default:
        this.logger.warn(`Unsupported notification channel: ${channel}`, { data });
    }
  }

  /**
   * 保存学习数据
   */
  private saveLearningData(detection: CaptchaDetectionResult, response: any, context: any): void {
    const learningRecord = {
      detection,
      responseSummary: this.summarizeResponse(response),
      context,
      timestamp: new Date()
    };

    this.learningData.push(learningRecord);

    // 限制学习数据大小
    if (this.learningData.length > 1000) {
      this.learningData = this.learningData.slice(-500);
    }
  }

  /**
   * 加载学习数据
   */
  private loadLearningData(): void {
    // 这里可以实现从文件加载学习数据
    // 目前只是初始化空数组
    this.logger.debug('Learning data loading not implemented yet');
  }

  /**
   * 总结响应数据
   */
  private summarizeResponse(response: any): any {
    if (!response) {
      return null;
    }

    return {
      status: response.status,
      headers: response.headers ? Object.keys(response.headers) : [],
      dataType: typeof response.data,
      dataLength: typeof response.data === 'string'
        ? response.data.length
        : JSON.stringify(response.data).length
    };
  }

  /**
   * 获取检测历史
   */
  getDetectionHistory(limit?: number): CaptchaDetectionResult[] {
    const history = [...this.detectionHistory].reverse(); // 最新的在前
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * 获取解决历史
   */
  getSolutionHistory(limit?: number): CaptchaSolution[] {
    const history = [...this.solutionHistory].reverse(); // 最新的在前
    return limit ? history.slice(0, limit) : history;
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalDetections: number;
    totalSolutions: number;
    successRate: number;
    byCaptchaType: Record<string, number>;
    averageConfidence: number;
  } {
    const totalDetections = this.detectionHistory.length;
    const totalSolutions = this.solutionHistory.length;

    const successfulSolutions = this.solutionHistory.filter(s => s.success).length;
    const successRate = totalSolutions > 0 ? successfulSolutions / totalSolutions : 0;

    // 按类型统计
    const byCaptchaType: Record<string, number> = {};
    let totalConfidence = 0;

    this.detectionHistory.forEach(detection => {
      if (detection.detected) {
        const type = detection.captchaType;
        byCaptchaType[type] = (byCaptchaType[type] || 0) + 1;
        totalConfidence += detection.confidence;
      }
    });

    const averageConfidence = this.detectionHistory.length > 0
      ? totalConfidence / this.detectionHistory.length
      : 0;

    return {
      totalDetections,
      totalSolutions,
      successRate,
      byCaptchaType,
      averageConfidence
    };
  }

  /**
   * 清除历史记录
   */
  clearHistory(): void {
    this.detectionHistory = [];
    this.solutionHistory = [];
    this.logger.info('CAPTCHA history cleared');
  }

  /**
   * 导出学习数据
   */
  exportLearningData(): any[] {
    return [...this.learningData];
  }

  /**
   * 导入学习数据
   */
  importLearningData(data: any[]): void {
    this.learningData = [...this.learningData, ...data];
    this.logger.info(`Learning data imported, total records: ${this.learningData.length}`);
  }
}