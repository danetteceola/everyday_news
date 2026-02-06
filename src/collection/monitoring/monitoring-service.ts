/**
 * 监控服务
 * 提供监控指标和告警的HTTP接口
 */

import express, { Request, Response, Application } from 'express';
import { CollectionLogger, createCollectorLogger } from '../utils/logger';
import { metricsCollector } from './metrics-collector';
import { alertManager, AlertManager, AlertSeverity, AlertStatus } from './alert-manager';

export class MonitoringService {
  private logger: CollectionLogger;
  private app: Application;
  private port: number;
  private server: any;

  constructor(port: number = 9090) {
    this.logger = createCollectorLogger('monitoring-service');
    this.port = port;
    this.app = express();

    // 中间件
    this.app.use(express.json());
    this.app.use(express.urlencoded({ extended: true }));

    // 路由
    this.setupRoutes();

    // 启动告警检查
    alertManager.start();

    this.logger.info(`监控服务初始化完成，端口: ${port}`);
  }

  /**
   * 设置路由
   */
  private setupRoutes(): void {
    // 健康检查
    this.app.get('/health', this.healthCheck.bind(this));

    // 指标端点
    this.app.get('/metrics', this.getMetrics.bind(this));
    this.app.get('/metrics/json', this.getMetricsJson.bind(this));
    this.app.get('/metrics/summary', this.getMetricsSummary.bind(this));

    // 告警端点
    this.app.get('/alerts', this.getAlerts.bind(this));
    this.app.get('/alerts/active', this.getActiveAlerts.bind(this));
    this.app.get('/alerts/history', this.getAlertHistory.bind(this));
    this.app.get('/alerts/rules', this.getAlertRules.bind(this));
    this.app.post('/alerts/acknowledge/:ruleId', this.acknowledgeAlert.bind(this));

    // 状态端点
    this.app.get('/status', this.getStatus.bind(this));
    this.app.get('/status/detailed', this.getDetailedStatus.bind(this));

    // 管理端点
    this.app.post('/manage/reset-metrics', this.resetMetrics.bind(this));
    this.app.post('/manage/test-alert', this.testAlert.bind(this));
    this.app.post('/manage/test-notification/:channelId', this.testNotification.bind(this));

    // 版本信息
    this.app.get('/version', this.getVersion.bind(this));

    // 404处理
    this.app.use(this.notFound.bind(this));

    // 错误处理
    this.app.use(this.errorHandler.bind(this));
  }

  /**
   * 健康检查
   */
  private healthCheck(req: Request, res: Response): void {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version
    };

    res.json(health);
  }

  /**
   * 获取Prometheus格式的指标
   */
  private getMetrics(req: Request, res: Response): void {
    try {
      const metrics = metricsCollector.getPrometheusMetrics();
      res.set('Content-Type', 'text/plain; version=0.0.4');
      res.send(metrics);
    } catch (error) {
      this.logger.error('获取指标失败', error as Error);
      res.status(500).json({ error: '获取指标失败' });
    }
  }

  /**
   * 获取JSON格式的指标
   */
  private getMetricsJson(req: Request, res: Response): void {
    try {
      const metrics = metricsCollector.getMetrics();
      res.json(metrics);
    } catch (error) {
      this.logger.error('获取JSON指标失败', error as Error);
      res.status(500).json({ error: '获取JSON指标失败' });
    }
  }

  /**
   * 获取指标摘要
   */
  private getMetricsSummary(req: Request, res: Response): void {
    try {
      const summary = metricsCollector.getMetricsSummary();
      res.json(summary);
    } catch (error) {
      this.logger.error('获取指标摘要失败', error as Error);
      res.status(500).json({ error: '获取指标摘要失败' });
    }
  }

  /**
   * 获取所有告警
   */
  private getAlerts(req: Request, res: Response): void {
    try {
      const activeAlerts = alertManager.getActiveAlerts();
      const status = alertManager.getStatus();

      res.json({
        active: activeAlerts,
        status
      });
    } catch (error) {
      this.logger.error('获取告警失败', error as Error);
      res.status(500).json({ error: '获取告警失败' });
    }
  }

  /**
   * 获取活跃告警
   */
  private getActiveAlerts(req: Request, res: Response): void {
    try {
      const alerts = alertManager.getActiveAlerts();
      res.json(alerts);
    } catch (error) {
      this.logger.error('获取活跃告警失败', error as Error);
      res.status(500).json({ error: '获取活跃告警失败' });
    }
  }

  /**
   * 获取告警历史
   */
  private getAlertHistory(req: Request, res: Response): void {
    try {
      const {
        limit = 100,
        startDate,
        endDate,
        severity,
        ruleId
      } = req.query;

      const options: any = {
        limit: parseInt(limit as string)
      };

      if (startDate) {
        options.startDate = new Date(startDate as string);
      }

      if (endDate) {
        options.endDate = new Date(endDate as string);
      }

      if (severity) {
        options.severity = severity as AlertSeverity;
      }

      if (ruleId) {
        options.ruleId = ruleId as string;
      }

      const history = alertManager.getAlertHistory(options);
      res.json(history);
    } catch (error) {
      this.logger.error('获取告警历史失败', error as Error);
      res.status(500).json({ error: '获取告警历史失败' });
    }
  }

  /**
   * 获取告警规则
   */
  private getAlertRules(req: Request, res: Response): void {
    try {
      const rules = alertManager.getAllRules();
      res.json(rules);
    } catch (error) {
      this.logger.error('获取告警规则失败', error as Error);
      res.status(500).json({ error: '获取告警规则失败' });
    }
  }

  /**
   * 确认告警
   */
  private acknowledgeAlert(req: Request, res: Response): void {
    try {
      const { ruleId } = req.params;
      const { acknowledgedBy = 'api' } = req.body;

      const success = alertManager.acknowledgeAlert(ruleId, acknowledgedBy);

      if (success) {
        res.json({ success: true, message: '告警已确认' });
      } else {
        res.status(404).json({ success: false, message: '告警不存在' });
      }
    } catch (error) {
      this.logger.error('确认告警失败', error as Error);
      res.status(500).json({ error: '确认告警失败' });
    }
  }

  /**
   * 获取状态信息
   */
  private getStatus(req: Request, res: Response): void {
    try {
      const metricsSummary = metricsCollector.getMetricsSummary();
      const alertStatus = alertManager.getStatus();

      const status = {
        service: 'collection-monitoring',
        timestamp: new Date().toISOString(),
        uptime: metricsSummary.uptime,
        metrics: {
          totalCollections: metricsSummary.totalCollections,
          successRate: metricsSummary.successRate,
          totalItems: metricsSummary.totalItems
        },
        alerts: alertStatus.alerts,
        system: metricsSummary.systemStats
      };

      res.json(status);
    } catch (error) {
      this.logger.error('获取状态失败', error as Error);
      res.status(500).json({ error: '获取状态失败' });
    }
  }

  /**
   * 获取详细状态信息
   */
  private getDetailedStatus(req: Request, res: Response): void {
    try {
      const metrics = metricsCollector.getMetrics();
      const metricsSummary = metricsCollector.getMetricsSummary();
      const alertStatus = alertManager.getStatus();
      const activeAlerts = alertManager.getActiveAlerts();
      const rules = alertManager.getAllRules();

      const detailedStatus = {
        service: 'collection-monitoring',
        timestamp: new Date().toISOString(),
        uptime: metricsSummary.uptime,

        metrics: {
          summary: metricsSummary,
          detailed: metrics
        },

        alerts: {
          status: alertStatus,
          active: activeAlerts,
          rules: rules
        },

        system: {
          node: {
            version: process.version,
            platform: process.platform,
            arch: process.arch,
            memory: process.memoryUsage(),
            uptime: process.uptime()
          },
          process: {
            pid: process.pid,
            title: process.title,
            argv: process.argv,
            execPath: process.execPath
          }
        }
      };

      res.json(detailedStatus);
    } catch (error) {
      this.logger.error('获取详细状态失败', error as Error);
      res.status(500).json({ error: '获取详细状态失败' });
    }
  }

  /**
   * 重置指标
   */
  private resetMetrics(req: Request, res: Response): void {
    try {
      const { confirm } = req.body;

      if (confirm !== 'YES_RESET_METRICS') {
        res.status(400).json({
          error: '需要确认操作',
          message: '请设置 confirm: "YES_RESET_METRICS" 来确认重置指标'
        });
        return;
      }

      metricsCollector.resetMetrics();

      res.json({
        success: true,
        message: '指标已重置',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('重置指标失败', error as Error);
      res.status(500).json({ error: '重置指标失败' });
    }
  }

  /**
   * 测试告警
   */
  private testAlert(req: Request, res: Response): void {
    try {
      const { severity = 'warning' } = req.body;

      // 记录一个测试采集
      const collectionId = metricsCollector.recordCollectionStart('twitter');
      metricsCollector.recordCollectionEnd(
        collectionId,
        'twitter',
        false, // 故意失败
        5000, // 5秒
        0 // 无项目
      );

      // 记录一个错误
      metricsCollector.recordError('test_error', 'twitter');

      res.json({
        success: true,
        message: '测试告警已触发',
        severity,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.logger.error('测试告警失败', error as Error);
      res.status(500).json({ error: '测试告警失败' });
    }
  }

  /**
   * 测试通知渠道
   */
  private async testNotification(req: Request, res: Response): Promise<void> {
    try {
      const { channelId } = req.params;

      const success = await alertManager.testNotificationChannel(channelId);

      if (success) {
        res.json({
          success: true,
          message: `测试通知已发送到渠道: ${channelId}`,
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(500).json({
          success: false,
          message: `测试通知渠道失败: ${channelId}`,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      this.logger.error('测试通知渠道失败', error as Error);
      res.status(500).json({ error: '测试通知渠道失败' });
    }
  }

  /**
   * 获取版本信息
   */
  private getVersion(req: Request, res: Response): void {
    const version = {
      service: 'collection-monitoring',
      version: '1.0.0',
      build: process.env.BUILD_VERSION || 'dev',
      node: process.version,
      timestamp: new Date().toISOString()
    };

    res.json(version);
  }

  /**
   * 404处理
   */
  private notFound(req: Request, res: Response): void {
    res.status(404).json({
      error: '未找到',
      message: `路径 ${req.path} 不存在`,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * 错误处理
   */
  private errorHandler(err: Error, req: Request, res: Response, next: Function): void {
    this.logger.error('监控服务错误', err);

    res.status(500).json({
      error: '内部服务器错误',
      message: err.message,
      timestamp: new Date().toISOString(),
      path: req.path
    });
  }

  /**
   * 启动监控服务
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, () => {
        this.logger.info(`监控服务已启动，监听端口: ${this.port}`);
        resolve();
      });

      this.server.on('error', (error: Error) => {
        this.logger.error('启动监控服务失败', error);
        reject(error);
      });
    });
  }

  /**
   * 停止监控服务
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) {
        resolve();
        return;
      }

      // 停止告警检查
      alertManager.stop();

      this.server.close((error?: Error) => {
        if (error) {
          this.logger.error('停止监控服务失败', error);
          reject(error);
        } else {
          this.logger.info('监控服务已停止');
          resolve();
        }
      });
    });
  }

  /**
   * 获取Express应用实例
   */
  getApp(): Application {
    return this.app;
  }

  /**
   * 获取服务器实例
   */
  getServer(): any {
    return this.server;
  }

  /**
   * 获取端口
   */
  getPort(): number {
    return this.port;
  }
}

// 全局监控服务实例
export const monitoringService = new MonitoringService();

// 如果直接运行此文件，启动监控服务
if (require.main === module) {
  const port = parseInt(process.env.MONITORING_PORT || '9090');

  const service = new MonitoringService(port);

  service.start().catch(error => {
    console.error('启动监控服务失败:', error);
    process.exit(1);
  });

  // 处理退出信号
  process.on('SIGINT', async () => {
    console.log('收到停止信号，正在停止监控服务...');
    await service.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('收到终止信号，正在停止监控服务...');
    await service.stop();
    process.exit(0);
  });
}