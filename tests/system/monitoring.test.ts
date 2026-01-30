import { MetricsCollector, Metric } from '../../src/system/monitoring';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    collector = new MetricsCollector();
  });

  describe('metric recording', () => {
    it('should record a metric', () => {
      const metric: Omit<Metric, 'timestamp'> = {
        name: 'test_metric',
        value: 42,
        tags: { unit: 'test' }
      };

      collector.record(metric);

      const now = new Date();
      const startTime = new Date(now.getTime() - 1000);
      const metrics = collector.getMetrics(startTime, now, 'test_metric');

      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('test_metric');
      expect(metrics[0].value).toBe(42);
      expect(metrics[0].tags?.unit).toBe('test');
      expect(metrics[0].timestamp).toBeInstanceOf(Date);
    });

    it('should record collection success', () => {
      collector.recordCollectionSuccess('twitter', true);
      collector.recordCollectionSuccess('twitter', false);

      const now = new Date();
      const startTime = new Date(now.getTime() - 1000);
      const metrics = collector.getMetrics(startTime, now, 'collection_success');

      expect(metrics).toHaveLength(2);
      expect(metrics[0].value).toBe(1);
      expect(metrics[1].value).toBe(0);
    });

    it('should record data integrity score', () => {
      collector.recordDataIntegrity(95.5);

      const now = new Date();
      const startTime = new Date(now.getTime() - 1000);
      const metrics = collector.getMetrics(startTime, now, 'data_integrity');

      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toBe(95.5);
    });

    it('should record summary generation time', () => {
      collector.recordSummaryGenerationTime(1500);

      const now = new Date();
      const startTime = new Date(now.getTime() - 1000);
      const metrics = collector.getMetrics(startTime, now, 'summary_generation_time');

      expect(metrics).toHaveLength(1);
      expect(metrics[0].value).toBe(1500);
    });
  });

  describe('metric calculations', () => {
    beforeEach(() => {
      // Add some test data
      const baseTime = new Date('2024-01-01T00:00:00Z');

      // Successes and failures for twitter
      collector.record({ name: 'collection_success', value: 1, tags: { platform: 'twitter' }, timestamp: new Date(baseTime.getTime() + 1000) });
      collector.record({ name: 'collection_success', value: 1, tags: { platform: 'twitter' }, timestamp: new Date(baseTime.getTime() + 2000) });
      collector.record({ name: 'collection_success', value: 0, tags: { platform: 'twitter' }, timestamp: new Date(baseTime.getTime() + 3000) });

      // Successes for youtube
      collector.record({ name: 'collection_success', value: 1, tags: { platform: 'youtube' }, timestamp: new Date(baseTime.getTime() + 1000) });
      collector.record({ name: 'collection_success', value: 1, tags: { platform: 'youtube' }, timestamp: new Date(baseTime.getTime() + 2000) });

      // Summary generation times
      collector.record({ name: 'summary_generation_time', value: 2000, timestamp: new Date(baseTime.getTime() + 1000) });
      collector.record({ name: 'summary_generation_time', value: 3000, timestamp: new Date(baseTime.getTime() + 2000) });
      collector.record({ name: 'summary_generation_time', value: 2500, timestamp: new Date(baseTime.getTime() + 3000) });
    });

    it('should calculate collection success rate', () => {
      const startTime = new Date('2024-01-01T00:00:00Z');
      const endTime = new Date('2024-01-01T00:10:00Z');

      const twitterRate = collector.calculateCollectionSuccessRate(startTime, endTime, 'twitter');
      expect(twitterRate).toBeCloseTo(66.666, 2); // 2 out of 3 successes

      const youtubeRate = collector.calculateCollectionSuccessRate(startTime, endTime, 'youtube');
      expect(youtubeRate).toBe(100); // 2 out of 2 successes

      const overallRate = collector.calculateCollectionSuccessRate(startTime, endTime);
      expect(overallRate).toBeCloseTo(80, 2); // 4 out of 5 successes
    });

    it('should calculate average summary generation time', () => {
      const startTime = new Date('2024-01-01T00:00:00Z');
      const endTime = new Date('2024-01-01T00:10:00Z');

      const avgTime = collector.calculateAverageSummaryTime(startTime, endTime);
      expect(avgTime).toBe(2500); // (2000 + 3000 + 2500) / 3
    });
  });

  describe('health check', () => {
    it('should perform health check', async () => {
      const health = await collector.healthCheck();

      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('checks');
      expect(health).toHaveProperty('timestamp');
      expect(health.timestamp).toBeInstanceOf(Date);

      // Should have basic checks
      expect(health.checks).toHaveProperty('metrics_collection');
      expect(health.checks).toHaveProperty('recent_activity');
      expect(health.checks).toHaveProperty('storage_available');
    });

    it('should detect recent activity', async () => {
      // No metrics yet, so recent activity should be false
      const health1 = await collector.healthCheck();
      expect(health1.checks.recent_activity).toBe(false);

      // Add a recent metric
      collector.record({ name: 'test', value: 1 });

      const health2 = await collector.healthCheck();
      expect(health2.checks.recent_activity).toBe(true);
    });
  });

  describe('cleanup', () => {
    it('should clean up old metrics', () => {
      const collectorWithShortRetention = new MetricsCollector({
        retentionPeriod: 1 // 1 day
      });

      const oldTime = new Date(Date.now() - 2 * 86400000); // 2 days ago
      const recentTime = new Date(Date.now() - 12 * 3600000); // 12 hours ago

      // Record old metric
      collectorWithShortRetention.record({
        name: 'old_metric',
        value: 1,
        timestamp: oldTime
      });

      // Record recent metric
      collectorWithShortRetention.record({
        name: 'recent_metric',
        value: 2,
        timestamp: recentTime
      });

      // Trigger cleanup by recording another metric
      collectorWithShortRetention.record({
        name: 'trigger',
        value: 3
      });

      const now = new Date();
      const startTime = new Date(now.getTime() - 7 * 86400000); // Last week
      const metrics = collectorWithShortRetention.getMetrics(startTime, now);

      // Should only have recent_metric and trigger
      expect(metrics).toHaveLength(2);
      expect(metrics.map(m => m.name)).toContain('recent_metric');
      expect(metrics.map(m => m.name)).toContain('trigger');
      expect(metrics.map(m => m.name)).not.toContain('old_metric');
    });
  });
});