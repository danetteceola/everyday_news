/**
 * 监控指标收集器
 * 负责收集和暴露数据采集模块的监控指标
 */

import { CollectionLogger, createCollectorLogger } from '../utils/logger';
import { PlatformType } from '../types/news-item';

// 指标类型定义
export interface Metric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'summary';
  help: string;
  labels?: Record<string, string>;
  value: number;
  timestamp: number;
}

export interface CollectionMetrics {
  // 采集相关指标
  collection_total: number;
  collection_success_total: number;
  collection_failed_total: number;
  collection_duration_seconds: HistogramData;
  collection_items_total: number;

  // 平台特定指标
  platform_collections: Record<PlatformType, PlatformMetrics>;

  // 性能指标
  memory_usage_bytes: number;
  cpu_usage_percent: number;
  heap_used_bytes: number;
  heap_total_bytes: number;

  // 队列指标
  queue_length: number;
  queue_processing_time_seconds: number;

  // 错误指标
  error_total: number;
  error_by_type: Record<string, number>;
}

export interface PlatformMetrics {
  collections_total: number;
  collections_success: number;
  collections_failed: number;
  items_collected: number;
  avg_duration_seconds: number;
  last_collection_time: number;
}

export interface HistogramData {
  buckets: Array<{ le: string; count: number }>;
  sum: number;
  count: number;
}

export class MetricsCollector {
  private logger: CollectionLogger;
  private metrics: CollectionMetrics;
  private startTime: number;

  // Prometheus格式的指标缓存
  private prometheusMetrics: Map<string, Metric> = new Map();

  constructor() {
    this.logger = createCollectorLogger('metrics-collector');
    this.startTime = Date.now();

    // 初始化指标
    this.metrics = {
      collection_total: 0,
      collection_success_total: 0,
      collection_failed_total: 0,
      collection_duration_seconds: {
        buckets: [
          { le: '0.1', count: 0 },
          { le: '0.5', count: 0 },
          { le: '1', count: 0 },
          { le: '5', count: 0 },
          { le: '10', count: 0 },
          { le: '30', count: 0 },
          { le: '60', count: 0 },
          { le: '+Inf', count: 0 }
        ],
        sum: 0,
        count: 0
      },
      collection_items_total: 0,

      platform_collections: {} as Record<PlatformType, PlatformMetrics>,

      memory_usage_bytes: 0,
      cpu_usage_percent: 0,
      heap_used_bytes: 0,
      heap_total_bytes: 0,

      queue_length: 0,
      queue_processing_time_seconds: 0,

      error_total: 0,
      error_by_type: {}
    };

    // 初始化平台指标
    this.initializePlatformMetrics();

    this.logger.info('监控指标收集器初始化完成');
  }

  /**
   * 初始化平台指标
   */
  private initializePlatformMetrics(): void {
    const platforms: PlatformType[] = ['twitter', 'youtube', 'tiktok', 'weibo', 'douyin'];

    for (const platform of platforms) {
      this.metrics.platform_collections[platform] = {
        collections_total: 0,
        collections_success: 0,
        collections_failed: 0,
        items_collected: 0,
        avg_duration_seconds: 0,
        last_collection_time: 0
      };
    }
  }

  /**
   * 记录采集开始
   */
  recordCollectionStart(platform: PlatformType): string {
    const collectionId = `col_${platform}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 更新平台指标
    const platformMetrics = this.metrics.platform_collections[platform];
    if (platformMetrics) {
      platformMetrics.collections_total++;
    }

    // 更新总指标
    this.metrics.collection_total++;

    this.updatePrometheusMetrics();

    return collectionId;
  }

  /**
   * 记录采集完成
   */
  recordCollectionEnd(
    collectionId: string,
    platform: PlatformType,
    success: boolean,
    duration: number,
    itemsCollected: number
  ): void {
    // 更新平台指标
    const platformMetrics = this.metrics.platform_collections[platform];
    if (platformMetrics) {
      if (success) {
        platformMetrics.collections_success++;
        platformMetrics.items_collected += itemsCollected;
      } else {
        platformMetrics.collections_failed++;
      }

      // 更新平均耗时
      const totalCollections = platformMetrics.collections_success + platformMetrics.collections_failed;
      platformMetrics.avg_duration_seconds =
        (platformMetrics.avg_duration_seconds * (totalCollections - 1) + duration) / totalCollections;

      platformMetrics.last_collection_time = Date.now();
    }

    // 更新总指标
    if (success) {
      this.metrics.collection_success_total++;
      this.metrics.collection_items_total += itemsCollected;
    } else {
      this.metrics.collection_failed_total++;
    }

    // 更新直方图
    this.updateHistogram(duration);

    this.updatePrometheusMetrics();

    this.logger.debug(`采集记录: ${platform}, 成功: ${success}, 耗时: ${duration}ms, 项目: ${itemsCollected}`);
  }

  /**
   * 更新直方图数据
   */
  private updateHistogram(duration: number): void {
    const durationSeconds = duration / 1000;
    this.metrics.collection_duration_seconds.sum += durationSeconds;
    this.metrics.collection_duration_seconds.count++;

    // 更新桶计数
    const buckets = this.metrics.collection_duration_seconds.buckets;
    for (const bucket of buckets) {
      const le = bucket.le === '+Inf' ? Infinity : parseFloat(bucket.le);
      if (durationSeconds <= le) {
        bucket.count++;
      }
    }
  }

  /**
   * 记录错误
   */
  recordError(errorType: string, platform?: PlatformType): void {
    this.metrics.error_total++;

    // 按类型统计错误
    if (!this.metrics.error_by_type[errorType]) {
      this.metrics.error_by_type[errorType] = 0;
    }
    this.metrics.error_by_type[errorType]++;

    // 平台特定错误统计
    if (platform) {
      const errorKey = `${platform}_${errorType}`;
      if (!this.metrics.error_by_type[errorKey]) {
        this.metrics.error_by_type[errorKey] = 0;
      }
      this.metrics.error_by_type[errorKey]++;
    }

    this.updatePrometheusMetrics();

    this.logger.debug(`错误记录: ${errorType}, 平台: ${platform || 'N/A'}`);
  }

  /**
   * 更新队列指标
   */
  updateQueueMetrics(length: number, processingTime?: number): void {
    this.metrics.queue_length = length;

    if (processingTime !== undefined) {
      this.metrics.queue_processing_time_seconds = processingTime;
    }

    this.updatePrometheusMetrics();
  }

  /**
   * 更新系统指标
   */
  updateSystemMetrics(): void {
    const memoryUsage = process.memoryUsage();

    this.metrics.memory_usage_bytes = memoryUsage.rss;
    this.metrics.heap_used_bytes = memoryUsage.heapUsed;
    this.metrics.heap_total_bytes = memoryUsage.heapTotal;

    // CPU使用率需要外部提供或使用系统调用
    // 这里使用一个简单的估算
    const cpuUsage = process.cpuUsage();
    this.metrics.cpu_usage_percent = (cpuUsage.user + cpuUsage.system) / 10000; // 简化计算

    this.updatePrometheusMetrics();
  }

  /**
   * 更新Prometheus格式指标
   */
  private updatePrometheusMetrics(): void {
    const timestamp = Date.now();

    // 采集指标
    this.setPrometheusMetric('collection_total', 'counter', 'Total number of collections', this.metrics.collection_total, timestamp);
    this.setPrometheusMetric('collection_success_total', 'counter', 'Total number of successful collections', this.metrics.collection_success_total, timestamp);
    this.setPrometheusMetric('collection_failed_total', 'counter', 'Total number of failed collections', this.metrics.collection_failed_total, timestamp);
    this.setPrometheusMetric('collection_items_total', 'counter', 'Total number of items collected', this.metrics.collection_items_total, timestamp);

    // 平台指标
    for (const [platform, metrics] of Object.entries(this.metrics.platform_collections)) {
      this.setPrometheusMetric(
        'platform_collections_total',
        'counter',
        `Total collections for platform ${platform}`,
        metrics.collections_total,
        timestamp,
        { platform }
      );

      this.setPrometheusMetric(
        'platform_collections_success',
        'counter',
        `Successful collections for platform ${platform}`,
        metrics.collections_success,
        timestamp,
        { platform }
      );

      this.setPrometheusMetric(
        'platform_items_collected',
        'counter',
        `Items collected for platform ${platform}`,
        metrics.items_collected,
        timestamp,
        { platform }
      );

      this.setPrometheusMetric(
        'platform_avg_duration_seconds',
        'gauge',
        `Average collection duration for platform ${platform}`,
        metrics.avg_duration_seconds,
        timestamp,
        { platform }
      );
    }

    // 系统指标
    this.setPrometheusMetric('memory_usage_bytes', 'gauge', 'Memory usage in bytes', this.metrics.memory_usage_bytes, timestamp);
    this.setPrometheusMetric('heap_used_bytes', 'gauge', 'Heap memory used in bytes', this.metrics.heap_used_bytes, timestamp);
    this.setPrometheusMetric('heap_total_bytes', 'gauge', 'Total heap memory in bytes', this.metrics.heap_total_bytes, timestamp);
    this.setPrometheusMetric('cpu_usage_percent', 'gauge', 'CPU usage percentage', this.metrics.cpu_usage_percent, timestamp);

    // 队列指标
    this.setPrometheusMetric('queue_length', 'gauge', 'Current queue length', this.metrics.queue_length, timestamp);
    this.setPrometheusMetric('queue_processing_time_seconds', 'gauge', 'Queue processing time in seconds', this.metrics.queue_processing_time_seconds, timestamp);

    // 错误指标
    this.setPrometheusMetric('error_total', 'counter', 'Total number of errors', this.metrics.error_total, timestamp);

    for (const [errorType, count] of Object.entries(this.metrics.error_by_type)) {
      this.setPrometheusMetric(
        'error_by_type',
        'counter',
        `Errors by type: ${errorType}`,
        count,
        timestamp,
        { type: errorType }
      );
    }

    // 运行时间
    const uptime = (Date.now() - this.startTime) / 1000;
    this.setPrometheusMetric('process_uptime_seconds', 'gauge', 'Process uptime in seconds', uptime, timestamp);
  }

  /**
   * 设置Prometheus指标
   */
  private setPrometheusMetric(
    name: string,
    type: Metric['type'],
    help: string,
    value: number,
    timestamp: number,
    labels?: Record<string, string>
  ): void {
    const metricKey = labels ? `${name}_${JSON.stringify(labels)}` : name;

    this.prometheusMetrics.set(metricKey, {
      name,
      type,
      help,
      labels,
      value,
      timestamp
    });
  }

  /**
   * 获取Prometheus格式的指标
   */
  getPrometheusMetrics(): string {
    const lines: string[] = [];

    // 按指标名称分组
    const metricsByName = new Map<string, Metric[]>();

    for (const metric of this.prometheusMetrics.values()) {
      if (!metricsByName.has(metric.name)) {
        metricsByName.set(metric.name, []);
      }
      metricsByName.get(metric.name)!.push(metric);
    }

    // 生成Prometheus格式
    for (const [name, metrics] of metricsByName.entries()) {
      // 添加帮助文本
      const help = metrics[0].help;
      lines.push(`# HELP ${name} ${help}`);
      lines.push(`# TYPE ${name} ${metrics[0].type}`);

      // 添加指标数据
      for (const metric of metrics) {
        let line = name;

        // 添加标签
        if (metric.labels && Object.keys(metric.labels).length > 0) {
          const labelStrings = Object.entries(metric.labels)
            .map(([key, value]) => `${key}="${value}"`);
          line += `{${labelStrings.join(',')}}`;
        }

        line += ` ${metric.value}`;

        // 添加时间戳（可选）
        // line += ` ${metric.timestamp}`;

        lines.push(line);
      }

      lines.push(''); // 空行分隔
    }

    // 添加直方图数据
    lines.push(...this.getHistogramPrometheusFormat());

    return lines.join('\n');
  }

  /**
   * 获取直方图的Prometheus格式
   */
  private getHistogramPrometheusFormat(): string[] {
    const lines: string[] = [];
    const histogram = this.metrics.collection_duration_seconds;

    lines.push('# HELP collection_duration_seconds Collection duration histogram');
    lines.push('# TYPE collection_duration_seconds histogram');

    // 桶数据
    for (const bucket of histogram.buckets) {
      const le = bucket.le === '+Inf' ? '+Inf' : `"${bucket.le}"`;
      lines.push(`collection_duration_seconds_bucket{le=${le}} ${bucket.count}`);
    }

    // 总和和计数
    lines.push(`collection_duration_seconds_sum ${histogram.sum}`);
    lines.push(`collection_duration_seconds_count ${histogram.count}`);
    lines.push('');

    return lines;
  }

  /**
   * 获取JSON格式的指标
   */
  getMetrics(): CollectionMetrics {
    // 更新系统指标
    this.updateSystemMetrics();

    return { ...this.metrics };
  }

  /**
   * 获取指标摘要
   */
  getMetricsSummary(): {
    uptime: string;
    totalCollections: number;
    successRate: number;
    totalItems: number;
    avgDuration: string;
    platformStats: Array<{ platform: string; collections: number; successRate: number }>;
    systemStats: {
      memory: string;
      heap: string;
      cpu: string;
      queue: number;
    };
  } {
    const uptimeSeconds = (Date.now() - this.startTime) / 1000;
    const uptimeHours = Math.floor(uptimeSeconds / 3600);
    const uptimeMinutes = Math.floor((uptimeSeconds % 3600) / 60);
    const uptimeSecs = Math.floor(uptimeSeconds % 60);

    const successRate = this.metrics.collection_total > 0
      ? (this.metrics.collection_success_total / this.metrics.collection_total) * 100
      : 0;

    const avgDuration = this.metrics.collection_duration_seconds.count > 0
      ? this.metrics.collection_duration_seconds.sum / this.metrics.collection_duration_seconds.count
      : 0;

    const platformStats = Object.entries(this.metrics.platform_collections)
      .map(([platform, metrics]) => ({
        platform,
        collections: metrics.collections_total,
        successRate: metrics.collections_total > 0
          ? (metrics.collections_success / metrics.collections_total) * 100
          : 0
      }))
      .filter(stat => stat.collections > 0)
      .sort((a, b) => b.collections - a.collections);

    const memoryMB = this.metrics.memory_usage_bytes / 1024 / 1024;
    const heapUsedMB = this.metrics.heap_used_bytes / 1024 / 1024;
    const heapTotalMB = this.metrics.heap_total_bytes / 1024 / 1024;

    return {
      uptime: `${uptimeHours}h ${uptimeMinutes}m ${uptimeSecs}s`,
      totalCollections: this.metrics.collection_total,
      successRate: parseFloat(successRate.toFixed(2)),
      totalItems: this.metrics.collection_items_total,
      avgDuration: `${avgDuration.toFixed(2)}s`,
      platformStats,
      systemStats: {
        memory: `${memoryMB.toFixed(2)} MB`,
        heap: `${heapUsedMB.toFixed(2)} / ${heapTotalMB.toFixed(2)} MB`,
        cpu: `${this.metrics.cpu_usage_percent.toFixed(2)}%`,
        queue: this.metrics.queue_length
      }
    };
  }

  /**
   * 重置指标（谨慎使用）
   */
  resetMetrics(): void {
    this.logger.warn('重置所有监控指标');

    // 重置基础指标
    this.metrics.collection_total = 0;
    this.metrics.collection_success_total = 0;
    this.metrics.collection_failed_total = 0;
    this.metrics.collection_items_total = 0;

    this.metrics.collection_duration_seconds = {
      buckets: [
        { le: '0.1', count: 0 },
        { le: '0.5', count: 0 },
        { le: '1', count: 0 },
        { le: '5', count: 0 },
        { le: '10', count: 0 },
        { le: '30', count: 0 },
        { le: '60', count: 0 },
        { le: '+Inf', count: 0 }
      ],
      sum: 0,
      count: 0
    };

    // 重置平台指标
    this.initializePlatformMetrics();

    // 重置错误指标
    this.metrics.error_total = 0;
    this.metrics.error_by_type = {};

    // 重置Prometheus指标
    this.prometheusMetrics.clear();

    this.updatePrometheusMetrics();
  }

  /**
   * 导出指标到文件
   */
  async exportMetricsToFile(filePath: string): Promise<void> {
    try {
      const fs = require('fs').promises;
      const metrics = this.getMetrics();
      const metricsJson = JSON.stringify(metrics, null, 2);

      await fs.writeFile(filePath, metricsJson);
      this.logger.info(`指标已导出到文件: ${filePath}`);
    } catch (error) {
      this.logger.error('导出指标到文件失败', error as Error);
      throw error;
    }
  }
}

// 全局指标收集器实例
export const metricsCollector = new MetricsCollector();