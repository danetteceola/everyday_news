/**
 * 反爬系统监控和报告功能
 * 提供反爬系统性能监控、告警和报告生成功能
 */

import { CollectionLogger, createAntiCrawlingLogger } from '../utils/logger';
import { RequestStats } from './anti-crawling-system';
import { ProxyManager } from './proxy-manager';
import { UserAgentManager } from './user-agent-manager';
import { ErrorRetryManager } from './error-retry-manager';
import { CaptchaManager } from './captcha-manager';

export interface MonitoringMetric {
  /** 指标名称 */
  name: string;

  /** 指标值 */
  value: number;

  /** 指标单位 */
  unit?: string;

  /** 指标标签 */
  tags?: Record<string, string>;

  /** 时间戳 */
  timestamp: Date;
}

export interface AlertCondition {
  /** 条件名称 */
  name: string;

  /** 条件描述 */
  description: string;

  /** 检查条件函数 */
  check: (metrics: MonitoringMetric[], context?: any) => boolean;

  /** 严重程度 */
  severity: 'info' | 'warning' | 'error' | 'critical';

  /** 告警消息模板 */
  messageTemplate: string;

  /** 是否启用 */
  enabled: boolean;
}

export interface Alert {
  /** 告警ID */
  id: string;

  /** 告警条件 */
  condition: string;

  /** 告警消息 */
  message: string;

  /** 严重程度 */
  severity: 'info' | 'warning' | 'error' | 'critical';

  /** 触发时间 */
  triggeredAt: Date;

  /** 相关指标 */
  relatedMetrics: MonitoringMetric[];

  /** 是否已确认 */
  acknowledged: boolean;

  /** 确认时间 */
  acknowledgedAt?: Date;

  /** 确认用户 */
  acknowledgedBy?: string;
}

export interface ReportConfig {
  /** 报告类型 */
  reportType: 'daily' | 'weekly' | 'monthly' | 'custom';

  /** 报告格式 */
  format: 'json' | 'html' | 'text' | 'markdown';

  /** 是否包含详细数据 */
  includeDetails: boolean;

  /** 是否包含图表 */
  includeCharts: boolean;

  /** 报告接收者 */
  recipients?: string[];

  /** 报告模板 */
  template?: string;
}

export interface ReportData {
  /** 报告ID */
  id: string;

  /** 报告标题 */
  title: string;

  /** 报告类型 */
  type: string;

  /** 生成时间 */
  generatedAt: Date;

  /** 时间范围 */
  timeRange: {
    start: Date;
    end: Date;
  };

  /** 报告数据 */
  data: any;

  /** 报告格式 */
  format: string;

  /** 报告文件路径 */
  filePath?: string;
}

export interface MonitoringManagerConfig {
  /** 是否启用监控 */
  enableMonitoring: boolean;

  /** 指标收集间隔（毫秒） */
  collectionInterval: number;

  /** 指标保留时间（天） */
  retentionDays: number;

  /** 是否启用告警 */
  enableAlerts: boolean;

  /** 告警静默时间（毫秒） */
  alertCooldown: number;

  /** 是否启用报告 */
  enableReporting: boolean;

  /** 报告生成间隔（毫秒） */
  reportInterval: number;

  /** 报告配置 */
  reportConfigs: ReportConfig[];

  /** 监控组件 */
  monitoredComponents: {
    antiCrawlingSystem?: boolean;
    proxyManager?: boolean;
    userAgentManager?: boolean;
    errorRetryManager?: boolean;
    captchaManager?: boolean;
  };
}

export class MonitoringManager {
  private config: MonitoringManagerConfig;
  private logger: CollectionLogger;
  private metrics: MonitoringMetric[];
  private alerts: Alert[];
  private reports: ReportData[];
  private collectionInterval?: NodeJS.Timeout;
  private reportInterval?: NodeJS.Timeout;
  private alertConditions: Map<string, AlertCondition>;
  private lastAlertTime: Map<string, Date>;

  // 被监控的组件
  private antiCrawlingSystem?: any;
  private proxyManager?: ProxyManager;
  private userAgentManager?: UserAgentManager;
  private errorRetryManager?: ErrorRetryManager;
  private captchaManager?: CaptchaManager;

  constructor(
    config: Partial<MonitoringManagerConfig> = {},
    components?: {
      antiCrawlingSystem?: any;
      proxyManager?: ProxyManager;
      userAgentManager?: UserAgentManager;
      errorRetryManager?: ErrorRetryManager;
      captchaManager?: CaptchaManager;
    }
  ) {
    this.config = {
      enableMonitoring: true,
      collectionInterval: 60000, // 1分钟
      retentionDays: 30,
      enableAlerts: true,
      alertCooldown: 300000, // 5分钟
      enableReporting: true,
      reportInterval: 86400000, // 24小时
      reportConfigs: [
        {
          reportType: 'daily',
          format: 'json',
          includeDetails: true,
          includeCharts: false
        }
      ],
      monitoredComponents: {
        antiCrawlingSystem: true,
        proxyManager: true,
        userAgentManager: true,
        errorRetryManager: true,
        captchaManager: true
      },
      ...config
    };

    this.logger = createAntiCrawlingLogger();
    this.metrics = [];
    this.alerts = [];
    this.reports = [];
    this.alertConditions = new Map();
    this.lastAlertTime = new Map();

    // 设置被监控的组件
    if (components) {
      this.antiCrawlingSystem = components.antiCrawlingSystem;
      this.proxyManager = components.proxyManager;
      this.userAgentManager = components.userAgentManager;
      this.errorRetryManager = components.errorRetryManager;
      this.captchaManager = components.captchaManager;
    }

    // 注册默认告警条件
    this.registerDefaultAlertConditions();

    // 启动监控
    if (this.config.enableMonitoring) {
      this.startMonitoring();
    }

    // 启动报告生成
    if (this.config.enableReporting) {
      this.startReporting();
    }

    this.logger.info('Monitoring manager initialized', {
      enableMonitoring: this.config.enableMonitoring,
      enableAlerts: this.config.enableAlerts,
      enableReporting: this.config.enableReporting
    });
  }

  /**
   * 注册默认告警条件
   */
  private registerDefaultAlertConditions(): void {
    // 高失败率告警
    this.registerAlertCondition('high_failure_rate', {
      name: 'high_failure_rate',
      description: '请求失败率超过阈值',
      severity: 'warning',
      messageTemplate: '请求失败率过高: {value}% (阈值: {threshold}%)',
      enabled: true,
      check: (metrics) => {
        const failureRateMetrics = metrics.filter(m =>
          m.name === 'request_failure_rate' &&
          m.timestamp.getTime() > Date.now() - 3600000 // 最近1小时
        );

        if (failureRateMetrics.length === 0) return false;

        const latestFailureRate = failureRateMetrics[failureRateMetrics.length - 1].value;
        return latestFailureRate > 20; // 20%失败率阈值
      }
    });

    // 低代理可用性告警
    this.registerAlertCondition('low_proxy_availability', {
      name: 'low_proxy_availability',
      description: '代理可用性低于阈值',
      severity: 'warning',
      messageTemplate: '代理可用性过低: {value}% (阈值: {threshold}%)',
      enabled: true,
      check: (metrics) => {
        const availabilityMetrics = metrics.filter(m =>
          m.name === 'proxy_availability' &&
          m.timestamp.getTime() > Date.now() - 3600000 // 最近1小时
        );

        if (availabilityMetrics.length === 0) return false;

        const latestAvailability = availabilityMetrics[availabilityMetrics.length - 1].value;
        return latestAvailability < 50; // 50%可用性阈值
      }
    });

    // 高CAPTCHA检测率告警
    this.registerAlertCondition('high_captcha_rate', {
      name: 'high_captcha_rate',
      description: 'CAPTCHA检测率超过阈值',
      severity: 'error',
      messageTemplate: 'CAPTCHA检测率过高: {value}% (阈值: {threshold}%)',
      enabled: true,
      check: (metrics) => {
        const captchaRateMetrics = metrics.filter(m =>
          m.name === 'captcha_detection_rate' &&
          m.timestamp.getTime() > Date.now() - 3600000 // 最近1小时
        );

        if (captchaRateMetrics.length === 0) return false;

        const latestCaptchaRate = captchaRateMetrics[captchaRateMetrics.length - 1].value;
        return latestCaptchaRate > 10; // 10% CAPTCHA检测率阈值
      }
    });

    // 高响应时间告警
    this.registerAlertCondition('high_response_time', {
      name: 'high_response_time',
      description: '平均响应时间超过阈值',
      severity: 'warning',
      messageTemplate: '平均响应时间过高: {value}ms (阈值: {threshold}ms)',
      enabled: true,
      check: (metrics) => {
        const responseTimeMetrics = metrics.filter(m =>
          m.name === 'average_response_time' &&
          m.timestamp.getTime() > Date.now() - 3600000 // 最近1小时
        );

        if (responseTimeMetrics.length === 0) return false;

        const latestResponseTime = responseTimeMetrics[responseTimeMetrics.length - 1].value;
        return latestResponseTime > 5000; // 5秒阈值
      }
    });

    // 低成功率告警
    this.registerAlertCondition('low_success_rate', {
      name: 'low_success_rate',
      description: '操作成功率低于阈值',
      severity: 'error',
      messageTemplate: '操作成功率过低: {value}% (阈值: {threshold}%)',
      enabled: true,
      check: (metrics) => {
        const successRateMetrics = metrics.filter(m =>
          m.name === 'operation_success_rate' &&
          m.timestamp.getTime() > Date.now() - 3600000 // 最近1小时
        );

        if (successRateMetrics.length === 0) return false;

        const latestSuccessRate = successRateMetrics[successRateMetrics.length - 1].value;
        return latestSuccessRate < 80; // 80%成功率阈值
      }
    });
  }

  /**
   * 注册告警条件
   */
  registerAlertCondition(name: string, condition: AlertCondition): void {
    this.alertConditions.set(name, condition);
    this.logger.debug(`Alert condition registered: ${name}`, {
      conditionName: condition.name,
      severity: condition.severity,
      enabled: condition.enabled
    });
  }

  /**
   * 启动监控
   */
  startMonitoring(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
    }

    this.collectionInterval = setInterval(() => {
      this.collectMetrics();
    }, this.config.collectionInterval);

    // 立即收集一次指标
    this.collectMetrics();

    this.logger.info('Monitoring started', {
      collectionInterval: this.config.collectionInterval
    });
  }

  /**
   * 停止监控
   */
  stopMonitoring(): void {
    if (this.collectionInterval) {
      clearInterval(this.collectionInterval);
      this.collectionInterval = undefined;
      this.logger.info('Monitoring stopped');
    }
  }

  /**
   * 收集指标
   */
  private collectMetrics(): void {
    try {
      const timestamp = new Date();
      const collectedMetrics: MonitoringMetric[] = [];

      // 收集反爬系统指标
      if (this.config.monitoredComponents.antiCrawlingSystem && this.antiCrawlingSystem) {
        const stats = this.antiCrawlingSystem.getStats?.();
        if (stats) {
          collectedMetrics.push(
            {
              name: 'total_requests',
              value: stats.totalRequests || 0,
              unit: 'count',
              tags: { component: 'anti_crawling_system' },
              timestamp
            },
            {
              name: 'successful_requests',
              value: stats.successfulRequests || 0,
              unit: 'count',
              tags: { component: 'anti_crawling_system' },
              timestamp
            },
            {
              name: 'failed_requests',
              value: stats.failedRequests || 0,
              unit: 'count',
              tags: { component: 'anti_crawling_system' },
              timestamp
            },
            {
              name: 'blocked_requests',
              value: stats.blockedRequests || 0,
              unit: 'count',
              tags: { component: 'anti_crawling_system' },
              timestamp
            },
            {
              name: 'average_response_time',
              value: stats.averageResponseTime || 0,
              unit: 'ms',
              tags: { component: 'anti_crawling_system' },
              timestamp
            },
            {
              name: 'current_concurrent_requests',
              value: stats.currentConcurrentRequests || 0,
              unit: 'count',
              tags: { component: 'anti_crawling_system' },
              timestamp
            }
          );

          // 计算失败率
          const totalRequests = stats.totalRequests || 0;
          const failedRequests = stats.failedRequests || 0;
          const failureRate = totalRequests > 0 ? (failedRequests / totalRequests) * 100 : 0;

          collectedMetrics.push({
            name: 'request_failure_rate',
            value: failureRate,
            unit: 'percent',
            tags: { component: 'anti_crawling_system' },
            timestamp
          });
        }
      }

      // 收集代理管理器指标
      if (this.config.monitoredComponents.proxyManager && this.proxyManager) {
        const stats = this.proxyManager.getOverallStats?.();
        if (stats) {
          collectedMetrics.push(
            {
              name: 'total_proxies',
              value: stats.totalProxies || 0,
              unit: 'count',
              tags: { component: 'proxy_manager' },
              timestamp
            },
            {
              name: 'enabled_proxies',
              value: stats.enabledProxies || 0,
              unit: 'count',
              tags: { component: 'proxy_manager' },
              timestamp
            },
            {
              name: 'disabled_proxies',
              value: stats.disabledProxies || 0,
              unit: 'count',
              tags: { component: 'proxy_manager' },
              timestamp
            },
            {
              name: 'proxy_availability',
              value: (stats.overallAvailability || 0) * 100,
              unit: 'percent',
              tags: { component: 'proxy_manager' },
              timestamp
            },
            {
              name: 'average_proxy_response_time',
              value: stats.averageResponseTime || 0,
              unit: 'ms',
              tags: { component: 'proxy_manager' },
              timestamp
            }
          );
        }
      }

      // 收集用户代理管理器指标
      if (this.config.monitoredComponents.userAgentManager && this.userAgentManager) {
        const stats = this.userAgentManager.getOverallStats?.();
        if (stats) {
          collectedMetrics.push(
            {
              name: 'total_user_agents',
              value: stats.totalUserAgents || 0,
              unit: 'count',
              tags: { component: 'user_agent_manager' },
              timestamp
            },
            {
              name: 'enabled_user_agents',
              value: stats.enabledUserAgents || 0,
              unit: 'count',
              tags: { component: 'user_agent_manager' },
              timestamp
            },
            {
              name: 'user_agent_success_rate',
              value: (stats.averageSuccessRate || 0) * 100,
              unit: 'percent',
              tags: { component: 'user_agent_manager' },
              timestamp
            }
          );
        }
      }

      // 收集错误重试管理器指标
      if (this.config.monitoredComponents.errorRetryManager && this.errorRetryManager) {
        const metrics = this.errorRetryManager.getAllMetrics?.();
        if (metrics) {
          Object.entries(metrics).forEach(([operation, opMetrics]) => {
            collectedMetrics.push(
              {
                name: 'operation_success_rate',
                value: (opMetrics.successRate || 0) * 100,
                unit: 'percent',
                tags: { component: 'error_retry_manager', operation },
                timestamp
              },
              {
                name: 'operation_average_duration',
                value: opMetrics.averageDuration || 0,
                unit: 'ms',
                tags: { component: 'error_retry_manager', operation },
                timestamp
              },
              {
                name: 'operation_total_retries',
                value: opMetrics.totalRetries || 0,
                unit: 'count',
                tags: { component: 'error_retry_manager', operation },
                timestamp
              }
            );
          });
        }
      }

      // 收集CAPTCHA管理器指标
      if (this.config.monitoredComponents.captchaManager && this.captchaManager) {
        const stats = this.captchaManager.getStats?.();
        if (stats) {
          collectedMetrics.push(
            {
              name: 'total_captcha_detections',
              value: stats.totalDetections || 0,
              unit: 'count',
              tags: { component: 'captcha_manager' },
              timestamp
            },
            {
              name: 'captcha_success_rate',
              value: (stats.successRate || 0) * 100,
              unit: 'percent',
              tags: { component: 'captcha_manager' },
              timestamp
            },
            {
              name: 'captcha_detection_rate',
              value: stats.totalDetections > 0 ? (stats.totalDetections / (this.metrics.find(m => m.name === 'total_requests')?.value || 1)) * 100 : 0,
              unit: 'percent',
              tags: { component: 'captcha_manager' },
              timestamp
            }
          );
        }
      }

      // 添加收集的指标
      this.metrics.push(...collectedMetrics);

      // 清理旧指标
      this.cleanupOldMetrics();

      // 检查告警条件
      if (this.config.enableAlerts) {
        this.checkAlertConditions();
      }

      this.logger.debug(`Collected ${collectedMetrics.length} metrics`, {
        timestamp: timestamp.toISOString()
      });

    } catch (error) {
      this.logger.error('Failed to collect metrics', error as Error);
    }
  }

  /**
   * 检查告警条件
   */
  private checkAlertConditions(): void {
    const now = new Date();

    for (const [conditionName, condition] of this.alertConditions) {
      if (!condition.enabled) continue;

      // 检查冷却时间
      const lastAlert = this.lastAlertTime.get(conditionName);
      if (lastAlert && now.getTime() - lastAlert.getTime() < this.config.alertCooldown) {
        continue;
      }

      // 检查条件
      if (condition.check(this.metrics)) {
        // 触发告警
        this.triggerAlert(conditionName, condition);
        this.lastAlertTime.set(conditionName, now);
      }
    }
  }

  /**
   * 触发告警
   */
  private triggerAlert(conditionName: string, condition: AlertCondition): void {
    const alert: Alert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      condition: conditionName,
      message: condition.messageTemplate,
      severity: condition.severity,
      triggeredAt: new Date(),
      relatedMetrics: this.metrics.slice(-10), // 最近10个指标
      acknowledged: false
    };

    this.alerts.push(alert);

    // 记录告警
    const logData = {
      alertId: alert.id,
      condition: conditionName,
      severity: condition.severity,
      message: condition.messageTemplate,
      timestamp: alert.triggeredAt
    };

    switch (condition.severity) {
      case 'critical':
      case 'error':
        this.logger.error('Alert triggered', null, logData);
        break;
      case 'warning':
        this.logger.warn('Alert triggered', logData);
        break;
      case 'info':
        this.logger.info('Alert triggered', logData);
        break;
    }
  }

  /**
   * 清理旧指标
   */
  private cleanupOldMetrics(): void {
    const cutoffTime = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    const initialLength = this.metrics.length;

    this.metrics = this.metrics.filter(metric => metric.timestamp >= cutoffTime);

    if (initialLength !== this.metrics.length) {
      this.logger.debug(`Cleaned up ${initialLength - this.metrics.length} old metrics`, {
        remainingMetrics: this.metrics.length,
        retentionDays: this.config.retentionDays
      });
    }
  }

  /**
   * 启动报告生成
   */
  startReporting(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
    }

    this.reportInterval = setInterval(() => {
      this.generateReports();
    }, this.config.reportInterval);

    // 立即生成一次报告
    this.generateReports();

    this.logger.info('Reporting started', {
      reportInterval: this.config.reportInterval
    });
  }

  /**
   * 停止报告生成
   */
  stopReporting(): void {
    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = undefined;
      this.logger.info('Reporting stopped');
    }
  }

  /**
   * 生成报告
   */
  private generateReports(): void {
    try {
      for (const reportConfig of this.config.reportConfigs) {
        const report = this.generateReport(reportConfig);
        this.reports.push(report);

        this.logger.info(`Report generated: ${report.title}`, {
          reportId: report.id,
          type: report.type,
          format: report.format
        });
      }

      // 清理旧报告
      this.cleanupOldReports();

    } catch (error) {
      this.logger.error('Failed to generate reports', error as Error);
    }
  }

  /**
   * 生成单个报告
   */
  private generateReport(config: ReportConfig): ReportData {
    const now = new Date();
    const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 过去24小时

    // 收集报告数据
    const reportData = {
      summary: this.generateSummary(startTime, now),
      metrics: this.getMetricsInRange(startTime, now),
      alerts: this.getAlertsInRange(startTime, now),
      recommendations: this.generateRecommendations(startTime, now),
      generatedAt: now.toISOString(),
      timeRange: {
        start: startTime.toISOString(),
        end: now.toISOString()
      }
    };

    const reportId = `report-${now.getTime()}-${config.reportType}`;

    return {
      id: reportId,
      title: `Anti-Crawling System ${config.reportType.charAt(0).toUpperCase() + config.reportType.slice(1)} Report`,
      type: config.reportType,
      generatedAt: now,
      timeRange: { start: startTime, end: now },
      data: reportData,
      format: config.format
    };
  }

  /**
   * 生成摘要
   */
  private generateSummary(startTime: Date, endTime: Date): any {
    const metricsInRange = this.getMetricsInRange(startTime, endTime);

    // 计算关键指标
    const totalRequests = metricsInRange
      .filter(m => m.name === 'total_requests')
      .reduce((sum, m) => sum + m.value, 0);

    const successfulRequests = metricsInRange
      .filter(m => m.name === 'successful_requests')
      .reduce((sum, m) => sum + m.value, 0);

    const failureRate = totalRequests > 0
      ? (metricsInRange
          .filter(m => m.name === 'failed_requests')
          .reduce((sum, m) => sum + m.value, 0) / totalRequests) * 100
      : 0;

    const averageResponseTime = metricsInRange
      .filter(m => m.name === 'average_response_time' && m.value > 0)
      .reduce((sum, m, _, arr) => sum + m.value / arr.length, 0);

    const alertsInRange = this.getAlertsInRange(startTime, endTime);

    return {
      totalRequests,
      successfulRequests,
      failureRate: parseFloat(failureRate.toFixed(2)),
      averageResponseTime: parseFloat(averageResponseTime.toFixed(2)),
      totalAlerts: alertsInRange.length,
      criticalAlerts: alertsInRange.filter(a => a.severity === 'critical').length,
      errorAlerts: alertsInRange.filter(a => a.severity === 'error').length,
      warningAlerts: alertsInRange.filter(a => a.severity === 'warning').length
    };
  }

  /**
   * 获取时间范围内的指标
   */
  private getMetricsInRange(startTime: Date, endTime: Date): MonitoringMetric[] {
    return this.metrics.filter(metric =>
      metric.timestamp >= startTime && metric.timestamp <= endTime
    );
  }

  /**
   * 获取时间范围内的告警
   */
  private getAlertsInRange(startTime: Date, endTime: Date): Alert[] {
    return this.alerts.filter(alert =>
      alert.triggeredAt >= startTime && alert.triggeredAt <= endTime
    );
  }

  /**
   * 生成建议
   */
  private generateRecommendations(startTime: Date, endTime: Date): string[] {
    const recommendations: string[] = [];
    const metricsInRange = this.getMetricsInRange(startTime, endTime);

    // 检查失败率
    const failureRateMetrics = metricsInRange.filter(m => m.name === 'request_failure_rate');
    if (failureRateMetrics.length > 0) {
      const latestFailureRate = failureRateMetrics[failureRateMetrics.length - 1].value;
      if (latestFailureRate > 20) {
        recommendations.push('请求失败率过高，建议检查代理配置和网络连接');
      }
    }

    // 检查代理可用性
    const proxyAvailabilityMetrics = metricsInRange.filter(m => m.name === 'proxy_availability');
    if (proxyAvailabilityMetrics.length > 0) {
      const latestAvailability = proxyAvailabilityMetrics[proxyAvailabilityMetrics.length - 1].value;
      if (latestAvailability < 50) {
        recommendations.push('代理可用性过低，建议添加更多代理或检查代理健康状态');
      }
    }

    // 检查CAPTCHA检测率
    const captchaRateMetrics = metricsInRange.filter(m => m.name === 'captcha_detection_rate');
    if (captchaRateMetrics.length > 0) {
      const latestCaptchaRate = captchaRateMetrics[captchaRateMetrics.length - 1].value;
      if (latestCaptchaRate > 10) {
        recommendations.push('CAPTCHA检测率过高，建议调整采集频率或使用更真实的用户行为模拟');
      }
    }

    // 检查响应时间
    const responseTimeMetrics = metricsInRange.filter(m => m.name === 'average_response_time');
    if (responseTimeMetrics.length > 0) {
      const latestResponseTime = responseTimeMetrics[responseTimeMetrics.length - 1].value;
      if (latestResponseTime > 5000) {
        recommendations.push('平均响应时间过长，建议优化网络连接或减少并发请求数');
      }
    }

    return recommendations;
  }

  /**
   * 清理旧报告
   */
  private cleanupOldReports(): void {
    const cutoffTime = new Date(Date.now() - this.config.retentionDays * 24 * 60 * 60 * 1000);
    const initialLength = this.reports.length;

    this.reports = this.reports.filter(report => report.generatedAt >= cutoffTime);

    if (initialLength !== this.reports.length) {
      this.logger.debug(`Cleaned up ${initialLength - this.reports.length} old reports`, {
        remainingReports: this.reports.length,
        retentionDays: this.config.retentionDays
      });
    }
  }

  /**
   * 确认告警
   */
  acknowledgeAlert(alertId: string, user: string = 'system'): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (!alert) {
      this.logger.warn(`Alert not found for acknowledgement: ${alertId}`);
      return false;
    }

    alert.acknowledged = true;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = user;

    this.logger.info(`Alert acknowledged: ${alertId}`, {
      alertId,
      acknowledgedBy: user,
      acknowledgedAt: alert.acknowledgedAt
    });

    return true;
  }

  /**
   * 获取当前指标
   */
  getCurrentMetrics(limit?: number): MonitoringMetric[] {
    const metrics = [...this.metrics].reverse(); // 最新的在前
    return limit ? metrics.slice(0, limit) : metrics;
  }

  /**
   * 获取当前告警
   */
  getCurrentAlerts(includeAcknowledged: boolean = false, limit?: number): Alert[] {
    let alerts = [...this.alerts].reverse(); // 最新的在前

    if (!includeAcknowledged) {
      alerts = alerts.filter(alert => !alert.acknowledged);
    }

    return limit ? alerts.slice(0, limit) : alerts;
  }

  /**
   * 获取生成的报告
   */
  getGeneratedReports(limit?: number): ReportData[] {
    const reports = [...this.reports].reverse(); // 最新的在前
    return limit ? reports.slice(0, limit) : reports;
  }

  /**
   * 获取监控统计
   */
  getMonitoringStats(): {
    totalMetrics: number;
    totalAlerts: number;
    unacknowledgedAlerts: number;
    totalReports: number;
    metricsRetentionDays: number;
  } {
    return {
      totalMetrics: this.metrics.length,
      totalAlerts: this.alerts.length,
      unacknowledgedAlerts: this.alerts.filter(a => !a.acknowledged).length,
      totalReports: this.reports.length,
      metricsRetentionDays: this.config.retentionDays
    };
  }

  /**
   * 导出监控数据
   */
  exportData(): {
    metrics: MonitoringMetric[];
    alerts: Alert[];
    reports: ReportData[];
  } {
    return {
      metrics: [...this.metrics],
      alerts: [...this.alerts],
      reports: [...this.reports]
    };
  }

  /**
   * 导入监控数据
   */
  importData(data: {
    metrics?: MonitoringMetric[];
    alerts?: Alert[];
    reports?: ReportData[];
  }): void {
    if (data.metrics) {
      this.metrics = [...this.metrics, ...data.metrics];
    }

    if (data.alerts) {
      this.alerts = [...this.alerts, ...data.alerts];
    }

    if (data.reports) {
      this.reports = [...this.reports, ...data.reports];
    }

    this.logger.info('Monitoring data imported', {
      metricsImported: data.metrics?.length || 0,
      alertsImported: data.alerts?.length || 0,
      reportsImported: data.reports?.length || 0
    });
  }

  /**
   * 清除所有数据
   */
  clearAllData(): void {
    this.metrics = [];
    this.alerts = [];
    this.reports = [];
    this.lastAlertTime.clear();

    this.logger.info('All monitoring data cleared');
  }

  /**
   * 销毁资源
   */
  destroy(): void {
    this.stopMonitoring();
    this.stopReporting();
    this.logger.info('Monitoring manager destroyed');
  }
}