/**
 * 性能报告和告警系统
 */

import fs from 'fs';
import path from 'path';
import { performanceMonitor, PerformanceMonitor } from './performance-monitor';
import { configOptimizer, ConfigOptimizer } from './config-optimizer';
import { queryCache, QueryCache } from './query-cache';

/**
 * 告警级别
 */
export type AlertLevel = 'info' | 'warning' | 'error' | 'critical';

/**
 * 告警
 */
export interface Alert {
  id: string;
  title: string;
  message: string;
  level: AlertLevel;
  source: string;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  metadata: Record<string, any>;
}

/**
 * 报告格式
 */
export type ReportFormat = 'html' | 'json' | 'pdf' | 'text';

/**
 * 报告选项
 */
export interface ReportOptions {
  format: ReportFormat;
  outputDir?: string;
  includeCharts?: boolean;
  emailRecipients?: string[];
}

/**
 * 告警系统配置
 */
export interface AlertSystemConfig {
  // 告警检查间隔（秒）
  checkInterval: number;

  // 告警保留天数
  alertRetentionDays: number;

  // 告警通知方式
  notificationMethods: string[];

  // 性能阈值
  thresholds: {
    slowQueryMs: number;
    highMemoryUsagePercent: number;
    highCpuUsagePercent: number;
    lowCacheHitRatePercent: number;
    highTableSizeMB: number;
  };

  // 报告配置
  reportConfig: {
    autoGenerate: boolean;
    generationInterval: number; // 小时
    keepReports: number;
  };
}

/**
 * 性能报告和告警系统
 */
export class AlertSystem {
  private config: AlertSystemConfig;
  private alerts: Alert[] = [];
  private checkTimer: NodeJS.Timeout | null = null;
  private reportTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<AlertSystemConfig>) {
    this.config = {
      checkInterval: parseInt(process.env.ALERT_CHECK_INTERVAL || '300'),
      alertRetentionDays: parseInt(process.env.ALERT_RETENTION_DAYS || '30'),
      notificationMethods: (process.env.ALERT_NOTIFICATION_METHODS || 'console').split(','),
      thresholds: {
        slowQueryMs: parseInt(process.env.THRESHOLD_SLOW_QUERY_MS || '1000'),
        highMemoryUsagePercent: parseInt(process.env.THRESHOLD_HIGH_MEMORY_PERCENT || '80'),
        highCpuUsagePercent: parseInt(process.env.THRESHOLD_HIGH_CPU_PERCENT || '70'),
        lowCacheHitRatePercent: parseInt(process.env.THRESHOLD_LOW_CACHE_HIT_RATE || '30'),
        highTableSizeMB: parseInt(process.env.THRESHOLD_HIGH_TABLE_SIZE_MB || '1000')
      },
      reportConfig: {
        autoGenerate: process.env.REPORT_AUTO_GENERATE !== 'false',
        generationInterval: parseInt(process.env.REPORT_GENERATION_INTERVAL || '24'),
        keepReports: parseInt(process.env.REPORT_KEEP_COUNT || '10')
      },
      ...config
    };

    // 加载历史告警
    this.loadAlerts();
  }

  /**
   * 启动告警系统
   */
  public start(): void {
    // 启动告警检查
    this.startAlertChecking();

    // 启动自动报告生成
    if (this.config.reportConfig.autoGenerate) {
      this.startReportGeneration();
    }

    console.log('告警系统已启动');
  }

  /**
   * 停止告警系统
   */
  public stop(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }

    if (this.reportTimer) {
      clearInterval(this.reportTimer);
      this.reportTimer = null;
    }

    console.log('告警系统已停止');
  }

  /**
   * 启动告警检查
   */
  private startAlertChecking(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
    }

    this.checkTimer = setInterval(() => {
      this.checkAlerts();
    }, this.config.checkInterval * 1000);

    // 立即执行一次检查
    this.checkAlerts();
  }

  /**
   * 启动报告生成
   */
  private startReportGeneration(): void {
    if (this.reportTimer) {
      clearInterval(this.reportTimer);
    }

    this.reportTimer = setInterval(() => {
      this.generatePerformanceReport({ format: 'html' });
    }, this.config.reportConfig.generationInterval * 60 * 60 * 1000);

    // 立即生成一次报告
    setTimeout(() => {
      this.generatePerformanceReport({ format: 'html' });
    }, 5000);
  }

  /**
   * 检查告警条件
   */
  private async checkAlerts(): Promise<void> {
    try {
      await this.checkSlowQueries();
      await this.checkCachePerformance();
      await this.checkDatabaseSize();
      await this.checkConfiguration();
      await this.checkSystemResources();

      // 清理旧告警
      this.cleanupOldAlerts();
    } catch (error) {
      console.error('告警检查失败:', error);
    }
  }

  /**
   * 检查慢查询
   */
  private async checkSlowQueries(): Promise<void> {
    try {
      const slowQueries = performanceMonitor.getSlowQueries(10);
      const recentSlowQueries = slowQueries.filter(q =>
        Date.now() - q.executedAt.getTime() < 3600000 // 最近1小时
      );

      if (recentSlowQueries.length > 0) {
        const worstQuery = recentSlowQueries[0];

        this.createAlert({
          title: '慢查询检测',
          message: `发现 ${recentSlowQueries.length} 个慢查询，最慢查询: ${worstQuery.executionTime}ms`,
          level: recentSlowQueries.length > 5 ? 'warning' : 'info',
          source: 'performance-monitor',
          metadata: {
            slowQueryCount: recentSlowQueries.length,
            worstQuery: worstQuery.query.substring(0, 200),
            worstExecutionTime: worstQuery.executionTime
          }
        });
      }
    } catch (error) {
      console.warn('慢查询检查失败:', error);
    }
  }

  /**
   * 检查缓存性能
   */
  private async checkCachePerformance(): Promise<void> {
    try {
      const cacheStats = queryCache.getStats();

      if (cacheStats.hitRate < this.config.thresholds.lowCacheHitRatePercent) {
        this.createAlert({
          title: '缓存命中率低',
          message: `查询缓存命中率较低: ${cacheStats.hitRate.toFixed(2)}%`,
          level: 'warning',
          source: 'query-cache',
          metadata: cacheStats
        });
      }

      if (cacheStats.totalItems > 0 && cacheStats.cacheSize > 1024 * 1024 * 100) { // 100MB
        this.createAlert({
          title: '缓存占用过大',
          message: `查询缓存占用 ${(cacheStats.cacheSize / (1024 * 1024)).toFixed(2)}MB 内存`,
          level: 'info',
          source: 'query-cache',
          metadata: cacheStats
        });
      }
    } catch (error) {
      console.warn('缓存性能检查失败:', error);
    }
  }

  /**
   * 检查数据库大小
   */
  private async checkDatabaseSize(): Promise<void> {
    try {
      // 这里简化处理，实际应该检查数据库文件大小
      const dbPath = process.env.DB_PATH || './data/news.db';
      if (fs.existsSync(dbPath)) {
        const stats = fs.statSync(dbPath);
        const sizeMB = stats.size / (1024 * 1024);

        if (sizeMB > this.config.thresholds.highTableSizeMB) {
          this.createAlert({
            title: '数据库过大',
            message: `数据库大小: ${sizeMB.toFixed(2)}MB，考虑归档旧数据`,
            level: 'warning',
            source: 'database',
            metadata: { sizeMB }
          });
        }
      }
    } catch (error) {
      console.warn('数据库大小检查失败:', error);
    }
  }

  /**
   * 检查配置
   */
  private async checkConfiguration(): Promise<void> {
    try {
      const recommendations = await configOptimizer.analyzeConfig();
      const highImpactRecs = recommendations.filter(r => r.impact === 'high');

      if (highImpactRecs.length > 0) {
        this.createAlert({
          title: '配置优化建议',
          message: `发现 ${highImpactRecs.length} 个高影响配置优化建议`,
          level: 'warning',
          source: 'config-optimizer',
          metadata: {
            recommendations: highImpactRecs.map(r => ({
              setting: r.setting,
              description: r.description
            }))
          }
        });
      }
    } catch (error) {
      console.warn('配置检查失败:', error);
    }
  }

  /**
   * 检查系统资源
   */
  private async checkSystemResources(): Promise<void> {
    try {
      // 检查内存使用
      const memoryUsage = process.memoryUsage();
      const memoryUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      if (memoryUsagePercent > this.config.thresholds.highMemoryUsagePercent) {
        this.createAlert({
          title: '高内存使用',
          message: `内存使用率: ${memoryUsagePercent.toFixed(2)}%`,
          level: 'warning',
          source: 'system',
          metadata: {
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
            memoryUsagePercent
          }
        });
      }

      // 注意：Node.js不直接提供CPU使用率，这里简化处理
      // 实际可以使用os.cpus()计算
    } catch (error) {
      console.warn('系统资源检查失败:', error);
    }
  }

  /**
   * 创建告警
   */
  private createAlert(alertData: {
    title: string;
    message: string;
    level: AlertLevel;
    source: string;
    metadata?: Record<string, any>;
  }): void {
    const alert: Alert = {
      id: this.generateAlertId(),
      title: alertData.title,
      message: alertData.message,
      level: alertData.level,
      source: alertData.source,
      timestamp: new Date(),
      acknowledged: false,
      acknowledgedAt: null,
      acknowledgedBy: null,
      metadata: alertData.metadata || {}
    };

    this.alerts.push(alert);
    this.saveAlerts();
    this.notifyAlert(alert);
  }

  /**
   * 通知告警
   */
  private notifyAlert(alert: Alert): void {
    // 控制台通知
    if (this.config.notificationMethods.includes('console')) {
      const timestamp = alert.timestamp.toISOString();
      const level = alert.level.toUpperCase();
      console.log(`[${timestamp}] [${level}] ${alert.title}: ${alert.message}`);
    }

    // 文件日志
    if (this.config.notificationMethods.includes('file')) {
      this.logAlertToFile(alert);
    }

    // 电子邮件（需要实现）
    if (this.config.notificationMethods.includes('email')) {
      // this.sendAlertEmail(alert);
    }

    // Webhook（需要实现）
    if (this.config.notificationMethods.includes('webhook')) {
      // this.sendAlertWebhook(alert);
    }
  }

  /**
   * 告警记录到文件
   */
  private logAlertToFile(alert: Alert): void {
    const logDir = path.join(process.cwd(), 'logs', 'alerts');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, `${alert.timestamp.toISOString().split('T')[0]}.log`);
    const logEntry = JSON.stringify({
      timestamp: alert.timestamp.toISOString(),
      level: alert.level,
      source: alert.source,
      title: alert.title,
      message: alert.message,
      metadata: alert.metadata
    });

    fs.appendFileSync(logFile, logEntry + '\n', 'utf8');
  }

  /**
   * 生成性能报告
   */
  public async generatePerformanceReport(options: ReportOptions): Promise<string> {
    try {
      const timestamp = new Date();
      const reportId = `report_${timestamp.toISOString().replace(/[:.]/g, '-')}`;
      const outputDir = options.outputDir || path.join(process.cwd(), 'reports');
      const outputPath = path.join(outputDir, `${reportId}.${options.format}`);

      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // 收集报告数据
      const reportData = await this.collectReportData();

      // 生成报告
      let reportContent: string;
      switch (options.format) {
        case 'json':
          reportContent = JSON.stringify(reportData, null, 2);
          break;
        case 'html':
          reportContent = this.generateHtmlReport(reportData);
          break;
        case 'text':
          reportContent = this.generateTextReport(reportData);
          break;
        default:
          throw new Error(`不支持的报告格式: ${options.format}`);
      }

      // 保存报告
      fs.writeFileSync(outputPath, reportContent, 'utf8');

      // 清理旧报告
      this.cleanupOldReports(outputDir);

      console.log(`性能报告已生成: ${outputPath}`);
      return outputPath;
    } catch (error) {
      console.error('生成性能报告失败:', error);
      throw error;
    }
  }

  /**
   * 收集报告数据
   */
  private async collectReportData(): Promise<any> {
    const [queryStats, slowQueries, cacheStats, configRecommendations, activeAlerts] = await Promise.all([
      // 查询统计
      Promise.resolve(performanceMonitor.getQueryStats().slice(0, 20)),

      // 慢查询
      Promise.resolve(performanceMonitor.getSlowQueries(20)),

      // 缓存统计
      Promise.resolve(queryCache.getStats()),

      // 配置建议
      configOptimizer.analyzeConfig(),

      // 活动告警
      Promise.resolve(this.getActiveAlerts())
    ]);

    // 系统信息
    const systemInfo = {
      nodeVersion: process.version,
      platform: process.platform,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    };

    return {
      systemInfo,
      performance: {
        queryStats,
        slowQueries,
        cacheStats
      },
      optimization: {
        configRecommendations
      },
      alerts: {
        active: activeAlerts,
        total: this.alerts.length
      }
    };
  }

  /**
   * 生成HTML报告
   */
  private generateHtmlReport(data: any): string {
    const timestamp = new Date().toLocaleString();

    return `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>数据库性能报告 - ${timestamp}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; color: #333; }
        .header { background: #f5f5f5; padding: 20px; border-radius: 5px; margin-bottom: 20px; }
        .section { margin-bottom: 30px; border: 1px solid #ddd; border-radius: 5px; padding: 15px; }
        .section-title { font-size: 18px; font-weight: bold; margin-bottom: 15px; color: #2c3e50; border-bottom: 2px solid #3498db; padding-bottom: 5px; }
        .table { width: 100%; border-collapse: collapse; margin-top: 10px; }
        .table th, .table td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        .table th { background-color: #f2f2f2; }
        .alert-info { background-color: #d9edf7; border-color: #bce8f1; color: #31708f; }
        .alert-warning { background-color: #fcf8e3; border-color: #faebcc; color: #8a6d3b; }
        .alert-error { background-color: #f2dede; border-color: #ebccd1; color: #a94442; }
        .metric { display: inline-block; margin: 10px; padding: 10px; background: #f8f9fa; border-radius: 3px; }
        .metric-value { font-size: 24px; font-weight: bold; }
        .metric-label { font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="header">
        <h1>数据库性能报告</h1>
        <p>生成时间: ${timestamp}</p>
    </div>

    <div class="section">
        <div class="section-title">系统概览</div>
        <div>
            <div class="metric">
                <div class="metric-value">${data.systemInfo.nodeVersion}</div>
                <div class="metric-label">Node.js版本</div>
            </div>
            <div class="metric">
                <div class="metric-value">${Math.round(data.systemInfo.memoryUsage.heapUsed / 1024 / 1024)}MB</div>
                <div class="metric-label">内存使用</div>
            </div>
            <div class="metric">
                <div class="metric-value">${Math.round(data.systemInfo.uptime / 3600)}h</div>
                <div class="metric-label">运行时间</div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">查询性能</div>
        <h3>慢查询 (最近20个)</h3>
        <table class="table">
            <tr>
                <th>查询摘要</th>
                <th>执行时间</th>
                <th>执行时间</th>
            </tr>
            ${data.performance.slowQueries.map((q: any) => `
            <tr>
                <td>${q.query.substring(0, 100)}...</td>
                <td>${q.executionTime}ms</td>
                <td>${q.executedAt.toLocaleString()}</td>
            </tr>
            `).join('')}
        </table>

        <h3>查询统计 (前20个)</h3>
        <table class="table">
            <tr>
                <th>查询</th>
                <th>执行次数</th>
                <th>平均时间</th>
                <th>最长时间</th>
            </tr>
            ${data.performance.queryStats.map((s: any) => `
            <tr>
                <td>${s.query.substring(0, 80)}...</td>
                <td>${s.executionCount}</td>
                <td>${s.avgExecutionTime.toFixed(2)}ms</td>
                <td>${s.maxExecutionTime}ms</td>
            </tr>
            `).join('')}
        </table>
    </div>

    <div class="section">
        <div class="section-title">缓存性能</div>
        <div>
            <div class="metric">
                <div class="metric-value">${data.performance.cacheStats.hitRate.toFixed(1)}%</div>
                <div class="metric-label">命中率</div>
            </div>
            <div class="metric">
                <div class="metric-value">${data.performance.cacheStats.totalItems}</div>
                <div class="metric-label">缓存项数</div>
            </div>
            <div class="metric">
                <div class="metric-value">${Math.round(data.performance.cacheStats.cacheSize / 1024 / 1024 * 100) / 100}MB</div>
                <div class="metric-label">缓存大小</div>
            </div>
        </div>
    </div>

    <div class="section">
        <div class="section-title">配置优化建议</div>
        ${data.optimization.configRecommendations.length > 0 ? `
        <table class="table">
            <tr>
                <th>分类</th>
                <th>设置</th>
                <th>建议</th>
                <th>影响</th>
            </tr>
            ${data.optimization.configRecommendations.map((r: any) => `
            <tr>
                <td>${r.category}</td>
                <td>${r.setting}</td>
                <td>${r.description}</td>
                <td><span class="alert-${r.impact}">${r.impact.toUpperCase()}</span></td>
            </tr>
            `).join('')}
        </table>
        ` : '<p>没有配置优化建议。</p>'}
    </div>

    <div class="section">
        <div class="section-title">活动告警</div>
        ${data.alerts.active.length > 0 ? `
        <table class="table">
            <tr>
                <th>级别</th>
                <th>标题</th>
                <th>消息</th>
                <th>时间</th>
            </tr>
            ${data.alerts.active.map((a: any) => `
            <tr class="alert-${a.level}">
                <td>${a.level.toUpperCase()}</td>
                <td>${a.title}</td>
                <td>${a.message}</td>
                <td>${a.timestamp.toLocaleString()}</td>
            </tr>
            `).join('')}
        </table>
        ` : '<p>没有活动告警。</p>'}
    </div>
</body>
</html>
    `;
  }

  /**
   * 生成文本报告
   */
  private generateTextReport(data: any): string {
    const lines: string[] = [];

    lines.push('='.repeat(80));
    lines.push('数据库性能报告');
    lines.push(`生成时间: ${new Date().toLocaleString()}`);
    lines.push('='.repeat(80));
    lines.push('');

    lines.push('系统概览:');
    lines.push(`  Node.js版本: ${data.systemInfo.nodeVersion}`);
    lines.push(`  内存使用: ${Math.round(data.systemInfo.memoryUsage.heapUsed / 1024 / 1024)}MB`);
    lines.push(`  运行时间: ${Math.round(data.systemInfo.uptime / 3600)}小时`);
    lines.push('');

    lines.push('查询性能:');
    lines.push(`  慢查询数量: ${data.performance.slowQueries.length}`);
    lines.push(`  查询统计数量: ${data.performance.queryStats.length}`);
    lines.push('');

    lines.push('缓存性能:');
    lines.push(`  命中率: ${data.performance.cacheStats.hitRate.toFixed(1)}%`);
    lines.push(`  缓存项数: ${data.performance.cacheStats.totalItems}`);
    lines.push(`  缓存大小: ${Math.round(data.performance.cacheStats.cacheSize / 1024 / 1024 * 100) / 100}MB`);
    lines.push('');

    lines.push('配置优化建议:');
    data.optimization.configRecommendations.forEach((r: any, i: number) => {
      lines.push(`  ${i + 1}. [${r.impact.toUpperCase()}] ${r.setting}: ${r.description}`);
    });
    lines.push('');

    lines.push('活动告警:');
    data.alerts.active.forEach((a: any, i: number) => {
      lines.push(`  ${i + 1}. [${a.level.toUpperCase()}] ${a.title}: ${a.message}`);
    });

    return lines.join('\n');
  }

  /**
   * 获取活动告警
   */
  public getActiveAlerts(): Alert[] {
    return this.alerts.filter(a => !a.acknowledged).slice(0, 50);
  }

  /**
   * 确认告警
   */
  public acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.acknowledged) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = acknowledgedBy;
      this.saveAlerts();
      return true;
    }
    return false;
  }

  /**
   * 生成告警ID
   */
  private generateAlertId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `alert_${timestamp}_${random}`;
  }

  /**
   * 加载告警
   */
  private loadAlerts(): void {
    const alertsFile = path.join(process.cwd(), 'data', 'alerts.json');
    if (fs.existsSync(alertsFile)) {
      try {
        const data = fs.readFileSync(alertsFile, 'utf8');
        const parsed = JSON.parse(data);
        this.alerts = parsed.map((a: any) => ({
          ...a,
          timestamp: new Date(a.timestamp),
          acknowledgedAt: a.acknowledgedAt ? new Date(a.acknowledgedAt) : null
        }));
      } catch (error) {
        console.warn('加载告警失败:', error);
      }
    }
  }

  /**
   * 保存告警
   */
  private saveAlerts(): void {
    const alertsDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(alertsDir)) {
      fs.mkdirSync(alertsDir, { recursive: true });
    }

    const alertsFile = path.join(alertsDir, 'alerts.json');
    const data = JSON.stringify(this.alerts, null, 2);
    fs.writeFileSync(alertsFile, data, 'utf8');
  }

  /**
   * 清理旧告警
   */
  private cleanupOldAlerts(): void {
    const cutoffDate = new Date(Date.now() - this.config.alertRetentionDays * 24 * 60 * 60 * 1000);
    const initialCount = this.alerts.length;
    this.alerts = this.alerts.filter(a => a.timestamp > cutoffDate || a.acknowledged);

    if (this.alerts.length < initialCount) {
      this.saveAlerts();
    }
  }

  /**
   * 清理旧报告
   */
  private cleanupOldReports(reportsDir: string): void {
    if (!fs.existsSync(reportsDir)) {
      return;
    }

    const files = fs.readdirSync(reportsDir)
      .map(file => ({ name: file, path: path.join(reportsDir, file), time: fs.statSync(path.join(reportsDir, file)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time); // 按时间降序排序

    // 保留最新的N个报告
    const filesToDelete = files.slice(this.config.reportConfig.keepReports);
    filesToDelete.forEach(file => {
      fs.unlinkSync(file.path);
    });
  }

  /**
   * 生成综合性能仪表板数据
   */
  public async generateDashboardData(): Promise<{
    timestamp: Date;
    metrics: {
      database: {
        size: number;
        tableCount: number;
        indexCount: number;
        connectionCount: number;
      };
      performance: {
        queryCount: number;
        avgQueryTime: number;
        slowQueryCount: number;
        cacheHitRate: number;
      };
      alerts: {
        active: number;
        critical: number;
        warning: number;
        info: number;
      };
      recommendations: {
        total: number;
        highPriority: number;
        mediumPriority: number;
      };
    };
    trends: {
      queryPerformance: Array<{ timestamp: Date; avgTime: number }>;
      cacheEfficiency: Array<{ timestamp: Date; hitRate: number }>;
      databaseGrowth: Array<{ timestamp: Date; size: number }>;
    };
  }> {
    const timestamp = new Date();

    // 收集数据库指标
    const db = await connectionManager.getConnection();
    const tableCount = await db.get(`SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`);
    const indexCount = await db.get(`SELECT COUNT(*) as count FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex_%'`);
    const sizeResult = await db.get(`SELECT page_count * page_size as size FROM pragma_page_count, pragma_page_size`);

    // 收集性能指标
    const queryStats = performanceMonitor.getQueryStats();
    const avgQueryTime = queryStats.length > 0
      ? queryStats.reduce((sum, stat) => sum + stat.avgExecutionTime, 0) / queryStats.length
      : 0;
    const slowQueryCount = performanceMonitor.getSlowQueries(1000).length;

    // 收集缓存指标
    const cacheStats = queryCache.getStats();

    // 收集告警指标
    const activeAlerts = this.alerts.filter(a => !a.acknowledged);
    const criticalAlerts = activeAlerts.filter(a => a.level === 'critical');
    const warningAlerts = activeAlerts.filter(a => a.level === 'warning');
    const infoAlerts = activeAlerts.filter(a => a.level === 'info');

    // 收集优化建议
    const configOptimizer = new ConfigOptimizer();
    const recommendations = await configOptimizer.analyzeConfig();
    const highPriority = recommendations.filter(r => r.impact === 'high').length;
    const mediumPriority = recommendations.filter(r => r.impact === 'medium').length;

    // 生成趋势数据（简化版本，实际应该从历史数据中获取）
    const trends = {
      queryPerformance: [
        { timestamp: new Date(Date.now() - 3600000), avgTime: avgQueryTime * 0.9 },
        { timestamp: new Date(Date.now() - 1800000), avgTime: avgQueryTime * 1.1 },
        { timestamp, avgTime: avgQueryTime }
      ],
      cacheEfficiency: [
        { timestamp: new Date(Date.now() - 3600000), hitRate: cacheStats.hitRate * 0.95 },
        { timestamp: new Date(Date.now() - 1800000), hitRate: cacheStats.hitRate * 1.05 },
        { timestamp, hitRate: cacheStats.hitRate }
      ],
      databaseGrowth: [
        { timestamp: new Date(Date.now() - 86400000), size: (sizeResult?.size || 0) * 0.8 },
        { timestamp: new Date(Date.now() - 43200000), size: (sizeResult?.size || 0) * 0.9 },
        { timestamp, size: sizeResult?.size || 0 }
      ]
    };

    return {
      timestamp,
      metrics: {
        database: {
          size: sizeResult?.size || 0,
          tableCount: tableCount?.count || 0,
          indexCount: indexCount?.count || 0,
          connectionCount: 0 // 需要从连接池获取
        },
        performance: {
          queryCount: queryStats.reduce((sum, stat) => sum + stat.executionCount, 0),
          avgQueryTime,
          slowQueryCount,
          cacheHitRate: cacheStats.hitRate
        },
        alerts: {
          active: activeAlerts.length,
          critical: criticalAlerts.length,
          warning: warningAlerts.length,
          info: infoAlerts.length
        },
        recommendations: {
          total: recommendations.length,
          highPriority,
          mediumPriority
        }
      },
      trends
    };
  }

  /**
   * 生成实时监控流
   */
  public startRealTimeMonitoring(callback: (data: any) => void, intervalSeconds: number = 5): NodeJS.Timeout {
    console.log(`启动实时监控，间隔: ${intervalSeconds}秒`);

    const timer = setInterval(async () => {
      try {
        const dashboardData = await this.generateDashboardData();
        callback(dashboardData);
      } catch (error) {
        console.error('实时监控数据生成失败:', error);
        callback({ error: error.message, timestamp: new Date() });
      }
    }, intervalSeconds * 1000);

    return timer;
  }

  /**
   * 生成性能基准报告
   */
  public async generateBenchmarkReport(): Promise<{
    timestamp: Date;
    benchmarks: Array<{
      name: string;
      score: number;
      executionTime: number;
      status: 'passed' | 'warning' | 'failed';
      threshold: number;
    }>;
    overallScore: number;
    recommendations: string[];
  }> {
    const configOptimizer = new ConfigOptimizer();
    const benchmarkResults = await configOptimizer.runBenchmark();

    const benchmarks = benchmarkResults.map(result => {
      let status: 'passed' | 'warning' | 'failed' = 'passed';
      let threshold = 0;

      // 根据测试类型设置阈值
      switch (result.testName) {
        case '简单查询':
          threshold = 10;
          break;
        case '元数据查询':
          threshold = 50;
          break;
        case '连接查询':
          threshold = 100;
          break;
      }

      if (result.executionTime > threshold * 2) {
        status = 'failed';
      } else if (result.executionTime > threshold) {
        status = 'warning';
      }

      return {
        name: result.testName,
        score: result.score,
        executionTime: result.executionTime,
        status,
        threshold
      };
    });

    const overallScore = benchmarks.length > 0
      ? benchmarks.reduce((sum, b) => sum + b.score, 0) / benchmarks.length
      : 0;

    const recommendations = benchmarkResults.flatMap(r => r.recommendations);

    return {
      timestamp: new Date(),
      benchmarks,
      overallScore: Math.round(overallScore),
      recommendations
    };
  }

  /**
   * 导出告警历史
   */
  public exportAlertHistory(format: 'csv' | 'json'): string {
    const timestamp = new Date();
    const exportData = this.alerts.map(alert => ({
      id: alert.id,
      title: alert.title,
      message: alert.message,
      level: alert.level,
      source: alert.source,
      timestamp: alert.timestamp.toISOString(),
      acknowledged: alert.acknowledged,
      acknowledgedAt: alert.acknowledgedAt?.toISOString() || null,
      acknowledgedBy: alert.acknowledgedBy
    }));

    if (format === 'csv') {
      // 生成CSV
      const headers = ['ID', 'Title', 'Message', 'Level', 'Source', 'Timestamp', 'Acknowledged', 'AcknowledgedAt', 'AcknowledgedBy'];
      const rows = exportData.map(alert => [
        alert.id,
        `"${alert.title.replace(/"/g, '""')}"`,
        `"${alert.message.replace(/"/g, '""')}"`,
        alert.level,
        alert.source,
        alert.timestamp,
        alert.acknowledged.toString(),
        alert.acknowledgedAt || '',
        alert.acknowledgedBy || ''
      ]);

      const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
      return csvContent;
    } else {
      // JSON格式
      return JSON.stringify(exportData, null, 2);
    }
  }

  /**
   * 获取活动告警
   */
  public getActiveAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.acknowledged);
  }

  /**
   * 确认告警
   */
  public acknowledgeAlert(alertId: string, acknowledgedBy: string = 'system'): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert && !alert.acknowledged) {
      alert.acknowledged = true;
      alert.acknowledgedAt = new Date();
      alert.acknowledgedBy = acknowledgedBy;
      this.saveAlerts();
      return true;
    }
    return false;
  }

  /**
   * 批量确认告警
   */
  public acknowledgeAlerts(alertIds: string[], acknowledgedBy: string = 'system'): number {
    let count = 0;
    for (const alertId of alertIds) {
      if (this.acknowledgeAlert(alertId, acknowledgedBy)) {
        count++;
      }
    }
    return count;
  }
}

// 导出默认告警系统实例
export const alertSystem = new AlertSystem();