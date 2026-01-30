/**
 * Monitoring Module
 *
 * Collects and tracks system metrics including collection success rates,
 * data integrity, summary generation performance, and system health.
 */

export interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  tags?: Record<string, string>;
}

export interface HealthCheckResult {
  healthy: boolean;
  checks: Record<string, boolean>;
  message?: string;
  timestamp: Date;
}

export interface MonitoringOptions {
  collectionInterval?: number; // milliseconds
  retentionPeriod?: number; // days
  alertThresholds?: {
    collectionSuccessRate?: number; // percentage
    dataIntegrityScore?: number; // 0-100
    summaryGenerationTime?: number; // milliseconds
  };
}

export class MetricsCollector {
  private metrics: Metric[] = [];
  private options: MonitoringOptions;

  constructor(options: MonitoringOptions = {}) {
    this.options = {
      collectionInterval: 60000, // 1 minute
      retentionPeriod: 7, // 7 days
      alertThresholds: {
        collectionSuccessRate: 80, // 80%
        dataIntegrityScore: 90, // 90%
        summaryGenerationTime: 300000 // 5 minutes
      },
      ...options
    };
  }

  /**
   * Record a metric
   */
  record(metric: Omit<Metric, 'timestamp'>): void {
    this.metrics.push({
      ...metric,
      timestamp: new Date()
    });

    // Clean up old metrics
    this.cleanup();
  }

  /**
   * Record collection success rate
   */
  recordCollectionSuccess(platform: string, success: boolean): void {
    this.record({
      name: 'collection_success',
      value: success ? 1 : 0,
      tags: { platform, success: success.toString() }
    });
  }

  /**
   * Record data integrity score
   */
  recordDataIntegrity(score: number): void {
    this.record({
      name: 'data_integrity',
      value: score,
      tags: { type: 'integrity_score' }
    });
  }

  /**
   * Record summary generation performance
   */
  recordSummaryGenerationTime(timeMs: number): void {
    this.record({
      name: 'summary_generation_time',
      value: timeMs,
      tags: { unit: 'milliseconds' }
    });
  }

  /**
   * Get metrics for a specific time range
   */
  getMetrics(startTime: Date, endTime: Date, name?: string): Metric[] {
    return this.metrics.filter(metric => {
      const inTimeRange = metric.timestamp >= startTime && metric.timestamp <= endTime;
      const nameMatches = !name || metric.name === name;
      return inTimeRange && nameMatches;
    });
  }

  /**
   * Calculate collection success rate
   */
  calculateCollectionSuccessRate(startTime: Date, endTime: Date, platform?: string): number {
    const metrics = this.getMetrics(startTime, endTime, 'collection_success');
    const filtered = platform
      ? metrics.filter(m => m.tags?.platform === platform)
      : metrics;

    if (filtered.length === 0) return 100; // No data means no failures

    const successes = filtered.filter(m => m.value === 1).length;
    return (successes / filtered.length) * 100;
  }

  /**
   * Calculate average summary generation time
   */
  calculateAverageSummaryTime(startTime: Date, endTime: Date): number {
    const metrics = this.getMetrics(startTime, endTime, 'summary_generation_time');
    if (metrics.length === 0) return 0;

    const total = metrics.reduce((sum, m) => sum + m.value, 0);
    return total / metrics.length;
  }

  /**
   * Perform system health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const checks: Record<string, boolean> = {
      metrics_collection: this.metrics.length > 0,
      recent_activity: this.hasRecentActivity(),
      storage_available: await this.checkStorageAvailability()
    };

    const allHealthy = Object.values(checks).every(check => check);

    return {
      healthy: allHealthy,
      checks,
      message: allHealthy ? 'All systems operational' : 'Some health checks failed',
      timestamp: new Date()
    };
  }

  /**
   * Check if there's recent activity
   */
  private hasRecentActivity(): boolean {
    const oneHourAgo = new Date(Date.now() - 3600000);
    const recentMetrics = this.metrics.filter(m => m.timestamp > oneHourAgo);
    return recentMetrics.length > 0;
  }

  /**
   * Check storage availability
   */
  private async checkStorageAvailability(): Promise<boolean> {
    // Simplified storage check
    try {
      // In a real implementation, this would check disk space or database connectivity
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Clean up old metrics
   */
  private cleanup(): void {
    const retentionDate = new Date(Date.now() - this.options.retentionPeriod! * 86400000);
    this.metrics = this.metrics.filter(m => m.timestamp > retentionDate);
  }
}

// Default metrics collector instance
export const metricsCollector = new MetricsCollector();