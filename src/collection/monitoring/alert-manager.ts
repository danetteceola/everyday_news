/**
 * 告警管理器
 * 负责监控指标并触发告警
 */

import { CollectionLogger, createCollectorLogger } from '../utils/logger';
import { metricsCollector, MetricsCollector } from './metrics-collector';

// 告警级别
export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

// 告警状态
export enum AlertStatus {
  FIRING = 'firing',
  RESOLVED = 'resolved',
  ACKNOWLEDGED = 'acknowledged'
}

// 告警规则
export interface AlertRule {
  id: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  enabled: boolean;

  // 条件配置
  condition: {
    metric: string;
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    threshold: number;
    duration: string; // 例如: "5m", "1h"
    platform?: string; // 平台特定告警
  };

  // 通知配置
  notification: {
    channels: string[]; // email, slack, webhook, etc.
    template?: string;
    cooldown: number; // 冷却时间（毫秒）
  };

  // 标签
  labels?: Record<string, string>;
}

// 告警实例
export interface AlertInstance {
  id: string;
  ruleId: string;
  name: string;
  description: string;
  severity: AlertSeverity;
  status: AlertStatus;
  startedAt: Date;
  resolvedAt?: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  value: number;
  threshold: number;
}

// 通知渠道
export interface NotificationChannel {
  id: string;
  name: string;
  type: 'email' | 'slack' | 'webhook' | 'pagerduty' | 'sms';
  config: Record<string, any>;
  enabled: boolean;
}

export class AlertManager {
  private logger: CollectionLogger;
  private metricsCollector: MetricsCollector;

  // 告警规则
  private rules: Map<string, AlertRule> = new Map();

  // 活跃告警
  private activeAlerts: Map<string, AlertInstance> = new Map();

  // 告警历史
  private alertHistory: AlertInstance[] = [];

  // 通知渠道
  private notificationChannels: Map<string, NotificationChannel> = new Map();

  // 检查间隔（毫秒）
  private checkInterval: number = 30000; // 30秒

  // 检查定时器
  private checkTimer?: NodeJS.Timeout;

  constructor() {
    this.logger = createCollectorLogger('alert-manager');
    this.metricsCollector = metricsCollector;

    // 加载默认告警规则
    this.loadDefaultRules();

    // 加载默认通知渠道
    this.loadDefaultChannels();

    this.logger.info('告警管理器初始化完成');
  }

  /**
   * 加载默认告警规则
   */
  private loadDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      {
        id: 'service_down',
        name: '服务宕机',
        description: '数据采集服务不可用',
        severity: AlertSeverity.CRITICAL,
        enabled: true,
        condition: {
          metric: 'collection_total',
          operator: '==',
          threshold: 0,
          duration: '5m'
        },
        notification: {
          channels: ['email', 'slack'],
          cooldown: 300000 // 5分钟
        },
        labels: {
          component: 'collection-service',
          impact: 'high'
        }
      },
      {
        id: 'high_failure_rate',
        name: '采集失败率过高',
        description: '数据采集失败率超过阈值',
        severity: AlertSeverity.ERROR,
        enabled: true,
        condition: {
          metric: 'collection_success_rate',
          operator: '<',
          threshold: 70, // 70%
          duration: '10m'
        },
        notification: {
          channels: ['email', 'slack'],
          cooldown: 600000 // 10分钟
        },
        labels: {
          component: 'collection',
          impact: 'medium'
        }
      },
      {
        id: 'high_collection_latency',
        name: '采集延迟过高',
        description: '数据采集平均延迟超过阈值',
        severity: AlertSeverity.WARNING,
        enabled: true,
        condition: {
          metric: 'collection_duration_avg',
          operator: '>',
          threshold: 300, // 300秒
          duration: '5m'
        },
        notification: {
          channels: ['slack'],
          cooldown: 300000 // 5分钟
        },
        labels: {
          component: 'performance',
          impact: 'low'
        }
      },
      {
        id: 'high_memory_usage',
        name: '内存使用率过高',
        description: '内存使用率超过阈值',
        severity: AlertSeverity.WARNING,
        enabled: true,
        condition: {
          metric: 'memory_usage_percent',
          operator: '>',
          threshold: 90, // 90%
          duration: '5m'
        },
        notification: {
          channels: ['slack'],
          cooldown: 300000 // 5分钟
        },
        labels: {
          component: 'system',
          impact: 'medium'
        }
      },
      {
        id: 'high_cpu_usage',
        name: 'CPU使用率过高',
        description: 'CPU使用率超过阈值',
        severity: AlertSeverity.WARNING,
        enabled: true,
        condition: {
          metric: 'cpu_usage_percent',
          operator: '>',
          threshold: 90, // 90%
          duration: '5m'
        },
        notification: {
          channels: ['slack'],
          cooldown: 300000 // 5分钟
        },
        labels: {
          component: 'system',
          impact: 'medium'
        }
      },
      {
        id: 'low_disk_space',
        name: '磁盘空间不足',
        description: '磁盘可用空间低于阈值',
        severity: AlertSeverity.ERROR,
        enabled: true,
        condition: {
          metric: 'disk_usage_percent',
          operator: '>',
          threshold: 95, // 95%
          duration: '5m'
        },
        notification: {
          channels: ['email', 'slack'],
          cooldown: 300000 // 5分钟
        },
        labels: {
          component: 'storage',
          impact: 'high'
        }
      },
      {
        id: 'twitter_collection_failed',
        name: 'Twitter采集失败',
        description: 'Twitter平台采集连续失败',
        severity: AlertSeverity.WARNING,
        enabled: true,
        condition: {
          metric: 'platform_collections_success',
          operator: '==',
          threshold: 0,
          duration: '30m',
          platform: 'twitter'
        },
        notification: {
          channels: ['slack'],
          cooldown: 1800000 // 30分钟
        },
        labels: {
          component: 'twitter',
          platform: 'twitter',
          impact: 'medium'
        }
      },
      {
        id: 'queue_backlog',
        name: '任务队列积压',
        description: '任务队列长度超过阈值',
        severity: AlertSeverity.WARNING,
        enabled: true,
        condition: {
          metric: 'queue_length',
          operator: '>',
          threshold: 50,
          duration: '5m'
        },
        notification: {
          channels: ['slack'],
          cooldown: 300000 // 5分钟
        },
        labels: {
          component: 'queue',
          impact: 'medium'
        }
      }
    ];

    for (const rule of defaultRules) {
      this.rules.set(rule.id, rule);
    }

    this.logger.info(`加载了 ${defaultRules.length} 个默认告警规则`);
  }

  /**
   * 加载默认通知渠道
   */
  private loadDefaultChannels(): void {
    const defaultChannels: NotificationChannel[] = [
      {
        id: 'email',
        name: '邮件通知',
        type: 'email',
        config: {
          smtp: {
            host: process.env.SMTP_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
              user: process.env.SMTP_USER || '',
              pass: process.env.SMTP_PASS || ''
            }
          },
          from: process.env.ALERT_EMAIL_FROM || 'alerts@example.com',
          to: (process.env.ALERT_EMAIL_TO || 'admin@example.com').split(',')
        },
        enabled: process.env.EMAIL_ALERTS_ENABLED === 'true'
      },
      {
        id: 'slack',
        name: 'Slack通知',
        type: 'slack',
        config: {
          webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
          channel: process.env.SLACK_CHANNEL || '#alerts',
          username: process.env.SLACK_USERNAME || 'Collection Alerts',
          icon_emoji: process.env.SLACK_ICON_EMOJI || ':warning:'
        },
        enabled: process.env.SLACK_ALERTS_ENABLED === 'true'
      },
      {
        id: 'webhook',
        name: 'Webhook通知',
        type: 'webhook',
        config: {
          url: process.env.WEBHOOK_URL || '',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          }
        },
        enabled: process.env.WEBHOOK_ALERTS_ENABLED === 'true'
      }
    ];

    for (const channel of defaultChannels) {
      this.notificationChannels.set(channel.id, channel);
    }

    this.logger.info(`加载了 ${defaultChannels.length} 个默认通知渠道`);
  }

  /**
   * 启动告警检查
   */
  start(): void {
    if (this.checkTimer) {
      this.logger.warn('告警检查已经在运行');
      return;
    }

    this.logger.info('启动告警检查，间隔: ' + this.checkInterval + 'ms');

    this.checkTimer = setInterval(() => {
      this.checkAlerts().catch(error => {
        this.logger.error('告警检查失败', error);
      });
    }, this.checkInterval);

    // 立即执行一次检查
    this.checkAlerts().catch(error => {
      this.logger.error('初始告警检查失败', error);
    });
  }

  /**
   * 停止告警检查
   */
  stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = undefined;
      this.logger.info('告警检查已停止');
    }
  }

  /**
   * 检查所有告警规则
   */
  async checkAlerts(): Promise<void> {
    const metrics = this.metricsCollector.getMetrics();
    const metricsSummary = this.metricsCollector.getMetricsSummary();

    // 计算衍生指标
    const derivedMetrics = {
      collection_success_rate: metrics.collection_total > 0
        ? (metrics.collection_success_total / metrics.collection_total) * 100
        : 100,
      collection_duration_avg: metrics.collection_duration_seconds.count > 0
        ? metrics.collection_duration_seconds.sum / metrics.collection_duration_seconds.count
        : 0,
      memory_usage_percent: metrics.memory_usage_bytes > 0
        ? (metrics.heap_used_bytes / metrics.heap_total_bytes) * 100
        : 0,
      cpu_usage_percent: metrics.cpu_usage_percent,
      disk_usage_percent: 0, // 需要从系统获取
      queue_length: metrics.queue_length
    };

    // 检查每个规则
    for (const rule of this.rules.values()) {
      if (!rule.enabled) {
        continue;
      }

      await this.checkRule(rule, metrics, derivedMetrics, metricsSummary);
    }

    // 检查已解决的告警
    await this.checkResolvedAlerts();
  }

  /**
   * 检查单个告警规则
   */
  private async checkRule(
    rule: AlertRule,
    metrics: any,
    derivedMetrics: any,
    metricsSummary: any
  ): Promise<void> {
    try {
      // 获取指标值
      let metricValue: number;

      if (rule.condition.platform) {
        // 平台特定指标
        const platformMetrics = metrics.platform_collections[rule.condition.platform];
        if (!platformMetrics) {
          return;
        }

        switch (rule.condition.metric) {
          case 'platform_collections_success':
            metricValue = platformMetrics.collections_success;
            break;
          case 'platform_collections_total':
            metricValue = platformMetrics.collections_total;
            break;
          default:
            this.logger.warn(`未知的平台指标: ${rule.condition.metric}`);
            return;
        }
      } else {
        // 通用指标
        metricValue = derivedMetrics[rule.condition.metric] || metrics[rule.condition.metric];

        if (metricValue === undefined) {
          this.logger.warn(`未知的指标: ${rule.condition.metric}`);
          return;
        }
      }

      // 检查条件
      const conditionMet = this.evaluateCondition(
        metricValue,
        rule.condition.operator,
        rule.condition.threshold
      );

      if (conditionMet) {
        // 条件满足，触发告警
        await this.triggerAlert(rule, metricValue);
      } else {
        // 条件不满足，检查是否有活跃告警需要解决
        await this.resolveAlertIfExists(rule.id);
      }
    } catch (error) {
      this.logger.error(`检查告警规则失败: ${rule.id}`, error as Error);
    }
  }

  /**
   * 评估条件
   */
  private evaluateCondition(value: number, operator: string, threshold: number): boolean {
    switch (operator) {
      case '>':
        return value > threshold;
      case '<':
        return value < threshold;
      case '>=':
        return value >= threshold;
      case '<=':
        return value <= threshold;
      case '==':
        return Math.abs(value - threshold) < 0.001; // 浮点数比较
      case '!=':
        return Math.abs(value - threshold) >= 0.001;
      default:
        return false;
    }
  }

  /**
   * 触发告警
   */
  private async triggerAlert(rule: AlertRule, currentValue: number): Promise<void> {
    const alertId = `${rule.id}_${Date.now()}`;

    // 检查是否已有活跃告警
    if (this.activeAlerts.has(rule.id)) {
      const existingAlert = this.activeAlerts.get(rule.id)!;

      // 检查冷却时间
      const now = Date.now();
      const lastNotificationTime = existingAlert.startedAt.getTime();
      const cooldownTime = rule.notification.cooldown;

      if (now - lastNotificationTime < cooldownTime) {
        // 还在冷却期内，不发送新通知
        return;
      }

      // 更新现有告警
      existingAlert.value = currentValue;
      existingAlert.startedAt = new Date();

      // 重新发送通知
      await this.sendNotification(rule, existingAlert);
      return;
    }

    // 创建新告警实例
    const alert: AlertInstance = {
      id: alertId,
      ruleId: rule.id,
      name: rule.name,
      description: rule.description,
      severity: rule.severity,
      status: AlertStatus.FIRING,
      startedAt: new Date(),
      labels: {
        ...rule.labels,
        rule_id: rule.id,
        severity: rule.severity
      },
      annotations: {
        current_value: currentValue.toString(),
        threshold: rule.condition.threshold.toString(),
        condition: `${rule.condition.metric} ${rule.condition.operator} ${rule.condition.threshold}`,
        duration: rule.condition.duration
      },
      value: currentValue,
      threshold: rule.condition.threshold
    };

    // 添加到活跃告警
    this.activeAlerts.set(rule.id, alert);

    // 添加到历史
    this.alertHistory.push(alert);

    // 限制历史记录大小
    if (this.alertHistory.length > 1000) {
      this.alertHistory = this.alertHistory.slice(-1000);
    }

    // 发送通知
    await this.sendNotification(rule, alert);

    this.logger.warn(`告警触发: ${rule.name} (${rule.severity})`, {
      ruleId: rule.id,
      value: currentValue,
      threshold: rule.condition.threshold
    });
  }

  /**
   * 解决告警（如果存在）
   */
  private async resolveAlertIfExists(ruleId: string): Promise<void> {
    if (!this.activeAlerts.has(ruleId)) {
      return;
    }

    const alert = this.activeAlerts.get(ruleId)!;

    // 更新告警状态
    alert.status = AlertStatus.RESOLVED;
    alert.resolvedAt = new Date();

    // 从活跃告警中移除
    this.activeAlerts.delete(ruleId);

    // 发送解决通知
    await this.sendResolutionNotification(alert);

    this.logger.info(`告警解决: ${alert.name}`, {
      ruleId: alert.ruleId,
      duration: alert.resolvedAt.getTime() - alert.startedAt.getTime()
    });
  }

  /**
   * 检查已解决的告警
   */
  private async checkResolvedAlerts(): Promise<void> {
    const now = Date.now();
    const resolvedAlerts: string[] = [];

    for (const [ruleId, alert] of this.activeAlerts.entries()) {
      // 如果告警超过24小时未解决，自动标记为已确认
      if (now - alert.startedAt.getTime() > 24 * 60 * 60 * 1000) {
        alert.status = AlertStatus.ACKNOWLEDGED;
        alert.acknowledgedAt = new Date();
        alert.acknowledgedBy = 'system';
        resolvedAlerts.push(ruleId);

        this.logger.info(`告警自动确认: ${alert.name}`, {
          ruleId: alert.ruleId,
          duration: '24h+'
        });
      }
    }

    // 移除已确认的告警
    for (const ruleId of resolvedAlerts) {
      this.activeAlerts.delete(ruleId);
    }
  }

  /**
   * 发送通知
   */
  private async sendNotification(rule: AlertRule, alert: AlertInstance): Promise<void> {
    for (const channelId of rule.notification.channels) {
      const channel = this.notificationChannels.get(channelId);

      if (!channel || !channel.enabled) {
        continue;
      }

      try {
        await this.sendToChannel(channel, alert);
      } catch (error) {
        this.logger.error(`发送通知到渠道失败: ${channelId}`, error as Error);
      }
    }
  }

  /**
   * 发送解决通知
   */
  private async sendResolutionNotification(alert: AlertInstance): Promise<void> {
    const rule = this.rules.get(alert.ruleId);
    if (!rule) {
      return;
    }

    // 创建解决通知
    const resolutionAlert: AlertInstance = {
      ...alert,
      description: `${alert.description} (已解决)`,
      annotations: {
        ...alert.annotations,
        resolution_time: alert.resolvedAt!.toISOString(),
        duration: `${(alert.resolvedAt!.getTime() - alert.startedAt.getTime()) / 1000}秒`
      }
    };

    // 发送解决通知
    for (const channelId of rule.notification.channels) {
      const channel = this.notificationChannels.get(channelId);

      if (!channel || !channel.enabled) {
        continue;
      }

      try {
        await this.sendResolutionToChannel(channel, resolutionAlert);
      } catch (error) {
        this.logger.error(`发送解决通知到渠道失败: ${channelId}`, error as Error);
      }
    }
  }

  /**
   * 发送到具体渠道
   */
  private async sendToChannel(channel: NotificationChannel, alert: AlertInstance): Promise<void> {
    switch (channel.type) {
      case 'email':
        await this.sendEmail(channel.config, alert);
        break;
      case 'slack':
        await this.sendSlack(channel.config, alert);
        break;
      case 'webhook':
        await this.sendWebhook(channel.config, alert);
        break;
      default:
        this.logger.warn(`未知的通知渠道类型: ${channel.type}`);
    }
  }

  /**
   * 发送解决通知到具体渠道
   */
  private async sendResolutionToChannel(channel: NotificationChannel, alert: AlertInstance): Promise<void> {
    switch (channel.type) {
      case 'email':
        await this.sendResolutionEmail(channel.config, alert);
        break;
      case 'slack':
        await this.sendResolutionSlack(channel.config, alert);
        break;
      case 'webhook':
        await this.sendResolutionWebhook(channel.config, alert);
        break;
      default:
        this.logger.warn(`未知的通知渠道类型: ${channel.type}`);
    }
  }

  /**
   * 发送邮件通知
   */
  private async sendEmail(config: any, alert: AlertInstance): Promise<void> {
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport(config.smtp);

    const subject = `[${alert.severity.toUpperCase()}] ${alert.name}`;
    const html = `
      <h2>${alert.name}</h2>
      <p><strong>描述:</strong> ${alert.description}</p>
      <p><strong>严重程度:</strong> ${alert.severity}</p>
      <p><strong>触发时间:</strong> ${alert.startedAt.toLocaleString()}</p>
      <p><strong>当前值:</strong> ${alert.value}</p>
      <p><strong>阈值:</strong> ${alert.threshold}</p>
      <p><strong>规则:</strong> ${alert.annotations.condition}</p>
      <hr>
      <p><small>告警ID: ${alert.id}</small></p>
      <p><small>规则ID: ${alert.ruleId}</small></p>
    `;

    await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject,
      html
    });

    this.logger.debug(`邮件通知已发送: ${subject}`);
  }

  /**
   * 发送解决邮件通知
   */
  private async sendResolutionEmail(config: any, alert: AlertInstance): Promise<void> {
    const nodemailer = require('nodemailer');

    const transporter = nodemailer.createTransport(config.smtp);

    const subject = `[RESOLVED] [${alert.severity.toUpperCase()}] ${alert.name}`;
    const html = `
      <h2>${alert.name} (已解决)</h2>
      <p><strong>描述:</strong> ${alert.description}</p>
      <p><strong>严重程度:</strong> ${alert.severity}</p>
      <p><strong>触发时间:</strong> ${alert.startedAt.toLocaleString()}</p>
      <p><strong>解决时间:</strong> ${alert.resolvedAt!.toLocaleString()}</p>
      <p><strong>持续时间:</strong> ${alert.annotations.duration}</p>
      <hr>
      <p><small>告警ID: ${alert.id}</small></p>
      <p><small>规则ID: ${alert.ruleId}</small></p>
    `;

    await transporter.sendMail({
      from: config.from,
      to: config.to,
      subject,
      html
    });

    this.logger.debug(`解决邮件通知已发送: ${subject}`);
  }

  /**
   * 发送Slack通知
   */
  private async sendSlack(config: any, alert: AlertInstance): Promise<void> {
    const axios = require('axios');

    const color = this.getSeverityColor(alert.severity);
    const icon = this.getSeverityIcon(alert.severity);

    const message = {
      channel: config.channel,
      username: config.username,
      icon_emoji: config.icon_emoji || icon,
      attachments: [
        {
          color,
          title: `${icon} ${alert.name}`,
          text: alert.description,
          fields: [
            {
              title: '严重程度',
              value: alert.severity.toUpperCase(),
              short: true
            },
            {
              title: '当前值',
              value: alert.value.toString(),
              short: true
            },
            {
              title: '阈值',
              value: alert.threshold.toString(),
              short: true
            },
            {
              title: '触发时间',
              value: alert.startedAt.toLocaleString(),
              short: true
            },
            {
              title: '规则',
              value: alert.annotations.condition,
              short: false
            }
          ],
          footer: `告警ID: ${alert.id} | 规则ID: ${alert.ruleId}`,
          ts: Math.floor(alert.startedAt.getTime() / 1000)
        }
      ]
    };

    await axios.post(config.webhookUrl, message);

    this.logger.debug(`Slack通知已发送: ${alert.name}`);
  }

  /**
   * 发送解决Slack通知
   */
  private async sendResolutionSlack(config: any, alert: AlertInstance): Promise<void> {
    const axios = require('axios');

    const message = {
      channel: config.channel,
      username: config.username,
      icon_emoji: ':white_check_mark:',
      attachments: [
        {
          color: '#36a64f', // 绿色
          title: `:white_check_mark: ${alert.name} (已解决)`,
          text: alert.description,
          fields: [
            {
              title: '严重程度',
              value: alert.severity.toUpperCase(),
              short: true
            },
            {
              title: '触发时间',
              value: alert.startedAt.toLocaleString(),
              short: true
            },
            {
              title: '解决时间',
              value: alert.resolvedAt!.toLocaleString(),
              short: true
            },
            {
              title: '持续时间',
              value: alert.annotations.duration,
              short: true
            }
          ],
          footer: `告警ID: ${alert.id} | 规则ID: ${alert.ruleId}`,
          ts: Math.floor(alert.resolvedAt!.getTime() / 1000)
        }
      ]
    };

    await axios.post(config.webhookUrl, message);

    this.logger.debug(`解决Slack通知已发送: ${alert.name}`);
  }

  /**
   * 发送Webhook通知
   */
  private async sendWebhook(config: any, alert: AlertInstance): Promise<void> {
    const axios = require('axios');

    const payload = {
      event: 'alert',
      alert: {
        ...alert,
        startedAt: alert.startedAt.toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await axios({
      method: config.method || 'POST',
      url: config.url,
      headers: config.headers,
      data: payload
    });

    this.logger.debug(`Webhook通知已发送: ${alert.name}`);
  }

  /**
   * 发送解决Webhook通知
   */
  private async sendResolutionWebhook(config: any, alert: AlertInstance): Promise<void> {
    const axios = require('axios');

    const payload = {
      event: 'alert_resolved',
      alert: {
        ...alert,
        startedAt: alert.startedAt.toISOString(),
        resolvedAt: alert.resolvedAt!.toISOString()
      },
      timestamp: new Date().toISOString()
    };

    await axios({
      method: config.method || 'POST',
      url: config.url,
      headers: config.headers,
      data: payload
    });

    this.logger.debug(`解决Webhook通知已发送: ${alert.name}`);
  }

  /**
   * 获取严重程度对应的颜色
   */
  private getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return '#ff0000'; // 红色
      case AlertSeverity.ERROR:
        return '#ff6600'; // 橙色
      case AlertSeverity.WARNING:
        return '#ffcc00'; // 黄色
      case AlertSeverity.INFO:
        return '#0066ff'; // 蓝色
      default:
        return '#999999'; // 灰色
    }
  }

  /**
   * 获取严重程度对应的图标
   */
  private getSeverityIcon(severity: AlertSeverity): string {
    switch (severity) {
      case AlertSeverity.CRITICAL:
        return ':fire:';
      case AlertSeverity.ERROR:
        return ':x:';
      case AlertSeverity.WARNING:
        return ':warning:';
      case AlertSeverity.INFO:
        return ':information_source:';
      default:
        return ':grey_question:';
    }
  }

  /**
   * 添加告警规则
   */
  addRule(rule: AlertRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`告警规则已存在: ${rule.id}`);
    }

    this.rules.set(rule.id, rule);
    this.logger.info(`添加告警规则: ${rule.name}`);
  }

  /**
   * 更新告警规则
   */
  updateRule(ruleId: string, updates: Partial<AlertRule>): boolean {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return false;
    }

    Object.assign(rule, updates);
    this.logger.info(`更新告警规则: ${rule.name}`);
    return true;
  }

  /**
   * 删除告警规则
   */
  deleteRule(ruleId: string): boolean {
    const deleted = this.rules.delete(ruleId);
    if (deleted) {
      this.logger.info(`删除告警规则: ${ruleId}`);
    }
    return deleted;
  }

  /**
   * 获取所有告警规则
   */
  getAllRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * 获取活跃告警
   */
  getActiveAlerts(): AlertInstance[] {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * 获取告警历史
   */
  getAlertHistory(options: {
    limit?: number;
    startDate?: Date;
    endDate?: Date;
    severity?: AlertSeverity;
    ruleId?: string;
  } = {}): AlertInstance[] {
    const {
      limit = 100,
      startDate,
      endDate,
      severity,
      ruleId
    } = options;

    let filtered = this.alertHistory;

    if (startDate) {
      filtered = filtered.filter(alert => alert.startedAt >= startDate);
    }

    if (endDate) {
      filtered = filtered.filter(alert => alert.startedAt <= endDate);
    }

    if (severity) {
      filtered = filtered.filter(alert => alert.severity === severity);
    }

    if (ruleId) {
      filtered = filtered.filter(alert => alert.ruleId === ruleId);
    }

    // 按时间倒序排序
    filtered.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    return filtered.slice(0, limit);
  }

  /**
   * 确认告警
   */
  acknowledgeAlert(ruleId: string, acknowledgedBy: string): boolean {
    const alert = this.activeAlerts.get(ruleId);
    if (!alert) {
      return false;
    }

    alert.status = AlertStatus.ACKNOWLEDGED;
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = acknowledgedBy;

    // 从活跃告警中移除
    this.activeAlerts.delete(ruleId);

    this.logger.info(`告警已确认: ${alert.name}, 确认人: ${acknowledgedBy}`);
    return true;
  }

  /**
   * 添加通知渠道
   */
  addNotificationChannel(channel: NotificationChannel): void {
    if (this.notificationChannels.has(channel.id)) {
      throw new Error(`通知渠道已存在: ${channel.id}`);
    }

    this.notificationChannels.set(channel.id, channel);
    this.logger.info(`添加通知渠道: ${channel.name}`);
  }

  /**
   * 获取所有通知渠道
   */
  getAllNotificationChannels(): NotificationChannel[] {
    return Array.from(this.notificationChannels.values());
  }

  /**
   * 测试通知渠道
   */
  async testNotificationChannel(channelId: string): Promise<boolean> {
    const channel = this.notificationChannels.get(channelId);
    if (!channel) {
      throw new Error(`通知渠道不存在: ${channelId}`);
    }

    const testAlert: AlertInstance = {
      id: 'test_alert',
      ruleId: 'test_rule',
      name: '测试告警',
      description: '这是一个测试告警，用于验证通知渠道是否正常工作',
      severity: AlertSeverity.INFO,
      status: AlertStatus.FIRING,
      startedAt: new Date(),
      labels: {
        test: 'true'
      },
      annotations: {
        current_value: '100',
        threshold: '90',
        condition: 'test_metric > 90',
        duration: '1m'
      },
      value: 100,
      threshold: 90
    };

    try {
      await this.sendToChannel(channel, testAlert);
      this.logger.info(`测试通知渠道成功: ${channel.name}`);
      return true;
    } catch (error) {
      this.logger.error(`测试通知渠道失败: ${channel.name}`, error as Error);
      return false;
    }
  }

  /**
   * 获取状态信息
   */
  getStatus(): {
    rules: {
      total: number;
      enabled: number;
      disabled: number;
    };
    alerts: {
      active: number;
      history: number;
      bySeverity: Record<AlertSeverity, number>;
    };
    channels: {
      total: number;
      enabled: number;
      disabled: number;
    };
  } {
    const rules = Array.from(this.rules.values());
    const activeAlerts = this.getActiveAlerts();
    const channels = Array.from(this.notificationChannels.values());

    const alertsBySeverity = {
      [AlertSeverity.INFO]: 0,
      [AlertSeverity.WARNING]: 0,
      [AlertSeverity.ERROR]: 0,
      [AlertSeverity.CRITICAL]: 0
    };

    for (const alert of activeAlerts) {
      alertsBySeverity[alert.severity]++;
    }

    return {
      rules: {
        total: rules.length,
        enabled: rules.filter(r => r.enabled).length,
        disabled: rules.filter(r => !r.enabled).length
      },
      alerts: {
        active: activeAlerts.length,
        history: this.alertHistory.length,
        bySeverity: alertsBySeverity
      },
      channels: {
        total: channels.length,
        enabled: channels.filter(c => c.enabled).length,
        disabled: channels.filter(c => !c.enabled).length
      }
    };
  }
}

// 全局告警管理器实例
export const alertManager = new AlertManager();