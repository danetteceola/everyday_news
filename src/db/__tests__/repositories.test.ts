import { platformRepository } from '../repositories/platform.repository';
import { newsRepository } from '../repositories/news.repository';
import { dailySummaryRepository } from '../repositories/summary.repository';
import { crawlLogRepository } from '../repositories/crawl.repository';
import { connectionManager } from '../config/connection';

describe('数据仓库测试', () => {
  let testPlatformId: number;

  beforeAll(async () => {
    // 创建测试平台
    const platform = await platformRepository.create({
      name: 'test_repository_platform',
      icon: '🧪'
    });
    testPlatformId = platform.id;
  });

  afterAll(async () => {
    // 清理测试数据
    const db = await connectionManager.getConnection();
    try {
      await db.run('DELETE FROM news_items WHERE platform_id = ?', testPlatformId);
      await db.run('DELETE FROM crawl_logs WHERE platform_id = ?', testPlatformId);
      await db.run('DELETE FROM platforms WHERE id = ?', testPlatformId);
    } finally {
      await db.close();
    }

    await connectionManager.closeAllConnections();
  });

  describe('PlatformRepository', () => {
    test('应该创建平台', async () => {
      const platform = await platformRepository.create({
        name: 'test_create_platform',
        icon: '🚀'
      });

      expect(platform).toBeDefined();
      expect(platform.id).toBeGreaterThan(0);
      expect(platform.name).toBe('test_create_platform');
      expect(platform.icon).toBe('🚀');
      expect(platform.created_at).toBeInstanceOf(Date);
    });

    test('应该根据ID查找平台', async () => {
      const platform = await platformRepository.findById(testPlatformId);

      expect(platform).not.toBeNull();
      expect(platform!.id).toBe(testPlatformId);
      expect(platform!.name).toBe('test_repository_platform');
    });

    test('应该根据名称查找平台', async () => {
      const platform = await platformRepository.findByName('test_repository_platform');

      expect(platform).not.toBeNull();
      expect(platform!.id).toBe(testPlatformId);
    });

    test('应该查找所有平台', async () => {
      const platforms = await platformRepository.findAll();

      expect(Array.isArray(platforms)).toBe(true);
      expect(platforms.length).toBeGreaterThan(0);

      const testPlatform = platforms.find(p => p.id === testPlatformId);
      expect(testPlatform).toBeDefined();
    });

    test('应该更新平台', async () => {
      const updated = await platformRepository.update(testPlatformId, {
        icon: '🎯'
      });

      expect(updated).not.toBeNull();
      expect(updated!.icon).toBe('🎯');
      expect(updated!.name).toBe('test_repository_platform'); // 名称不变
    });

    test('应该删除平台', async () => {
      const tempPlatform = await platformRepository.create({
        name: 'temp_delete_platform',
        icon: '🗑️'
      });

      const deleted = await platformRepository.delete(tempPlatform.id);
      expect(deleted).toBe(true);

      const found = await platformRepository.findById(tempPlatform.id);
      expect(found).toBeNull();
    });

    test('应该批量创建平台', async () => {
      const platforms = await platformRepository.batchCreate([
        { name: 'batch_platform_1', icon: '1️⃣' },
        { name: 'batch_platform_2', icon: '2️⃣' },
        { name: 'batch_platform_3', icon: '3️⃣' }
      ]);

      expect(platforms).toHaveLength(3);
      expect(platforms[0].name).toBe('batch_platform_1');
      expect(platforms[1].name).toBe('batch_platform_2');
      expect(platforms[2].name).toBe('batch_platform_3');

      // 清理
      for (const platform of platforms) {
        await platformRepository.delete(platform.id);
      }
    });

    test('应该搜索平台', async () => {
      const results = await platformRepository.search('repository');

      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(p => p.id === testPlatformId)).toBe(true);
    });

    test('应该获取平台统计', async () => {
      const stats = await platformRepository.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalPlatforms).toBe('number');
      expect(typeof stats.platformsWithIcon).toBe('number');
      expect(typeof stats.platformsWithoutIcon).toBe('number');

      expect(stats.totalPlatforms).toBeGreaterThan(0);
    });
  });

  describe('NewsRepository', () => {
    let testNewsId: number;

    test('应该创建新闻', async () => {
      const news = await newsRepository.create({
        platform_id: testPlatformId,
        external_id: 'test_external_123',
        title: '测试新闻标题',
        content: '测试新闻内容',
        url: 'https://example.com/test',
        author: '测试作者',
        publish_time: new Date('2024-01-01T10:00:00Z'),
        views: 100,
        likes: 20,
        shares: 10,
        comments: 5,
        tags: ['测试', '新闻'],
        category: '科技',
        is_investment_related: false,
        summary: '测试摘要'
      });

      expect(news).toBeDefined();
      expect(news.id).toBeGreaterThan(0);
      expect(news.title).toBe('测试新闻标题');
      expect(news.tags).toEqual(['测试', '新闻']);
      expect(news.is_investment_related).toBe(false);

      testNewsId = news.id;
    });

    test('应该根据ID查找新闻', async () => {
      const news = await newsRepository.findById(testNewsId);

      expect(news).not.toBeNull();
      expect(news!.id).toBe(testNewsId);
      expect(news!.title).toBe('测试新闻标题');
    });

    test('应该根据平台和外部ID查找新闻', async () => {
      const news = await newsRepository.findByPlatformAndExternalId(
        testPlatformId,
        'test_external_123'
      );

      expect(news).not.toBeNull();
      expect(news!.id).toBe(testNewsId);
    });

    test('应该查询新闻', async () => {
      const result = await newsRepository.query({
        platformId: testPlatformId,
        limit: 10
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe(testNewsId);
    });

    test('应该更新新闻', async () => {
      const updated = await newsRepository.update(testNewsId, {
        title: '更新后的标题',
        views: 200
      });

      expect(updated).not.toBeNull();
      expect(updated!.title).toBe('更新后的标题');
      expect(updated!.views).toBe(200);
    });

    test('应该获取新闻统计', async () => {
      const stats = await newsRepository.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalNews).toBe('number');
      expect(typeof stats.totalViews).toBe('number');
      expect(typeof stats.averageEngagement).toBe('number');

      expect(stats.totalNews).toBeGreaterThan(0);
    });

    test('应该获取分类统计', async () => {
      const stats = await newsRepository.getCategoryStats();

      expect(Array.isArray(stats)).toBe(true);
      const techStats = stats.find(s => s.category === '科技');
      expect(techStats).toBeDefined();
      expect(techStats!.count).toBeGreaterThan(0);
    });

    test('应该获取热门新闻', async () => {
      const topNews = await newsRepository.getTopNews(5);

      expect(Array.isArray(topNews)).toBe(true);
      expect(topNews.length).toBeGreaterThan(0);
    });

    test('应该批量创建新闻', async () => {
      const newsItems = await newsRepository.batchCreate([
        {
          platform_id: testPlatformId,
          external_id: 'batch_1',
          title: '批量新闻1',
          content: '内容1',
          url: 'https://example.com/1',
          publish_time: new Date(),
          views: 10,
          likes: 2,
          shares: 1,
          comments: 0,
          tags: ['批量'],
          category: '测试',
          is_investment_related: false
        },
        {
          platform_id: testPlatformId,
          external_id: 'batch_2',
          title: '批量新闻2',
          content: '内容2',
          url: 'https://example.com/2',
          publish_time: new Date(),
          views: 20,
          likes: 5,
          shares: 2,
          comments: 1,
          tags: ['批量'],
          category: '测试',
          is_investment_related: true
        }
      ]);

      expect(newsItems).toHaveLength(2);
      expect(newsItems[0].title).toBe('批量新闻1');
      expect(newsItems[1].title).toBe('批量新闻2');
      expect(newsItems[1].is_investment_related).toBe(true);

      // 清理
      for (const news of newsItems) {
        await newsRepository.delete(news.id);
      }
    });
  });

  describe('DailySummaryRepository', () => {
    let testSummaryId: number;

    test('应该创建每日总结', async () => {
      const summary = await dailySummaryRepository.create({
        date: '2024-01-01',
        domestic_hotspots: ['国内热点1', '国内热点2'],
        international_hotspots: ['国际热点1'],
        investment_hotspots: ['投资热点1', '投资热点2', '投资热点3']
      });

      expect(summary).toBeDefined();
      expect(summary.id).toBeGreaterThan(0);
      expect(summary.date).toBe('2024-01-01');
      expect(summary.domestic_hotspots).toEqual(['国内热点1', '国内热点2']);
      expect(summary.international_hotspots).toEqual(['国际热点1']);
      expect(summary.investment_hotspots).toHaveLength(3);

      testSummaryId = summary.id;
    });

    test('应该根据日期查找总结', async () => {
      const summary = await dailySummaryRepository.findByDate('2024-01-01');

      expect(summary).not.toBeNull();
      expect(summary!.id).toBe(testSummaryId);
    });

    test('应该查询总结', async () => {
      const result = await dailySummaryRepository.query({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
        limit: 10
      });

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.items[0].id).toBe(testSummaryId);
    });

    test('应该获取最新总结', async () => {
      const latest = await dailySummaryRepository.getLatest(5);

      expect(Array.isArray(latest)).toBe(true);
      expect(latest.length).toBeGreaterThan(0);
      expect(latest[0].date).toBe('2024-01-01');
    });

    test('应该获取热点统计', async () => {
      const stats = await dailySummaryRepository.getHotspotStats('2024-01-01', '2024-01-31');

      expect(Array.isArray(stats)).toBe(true);
      expect(stats).toHaveLength(1);
      expect(stats[0].date).toBe('2024-01-01');
      expect(stats[0].domesticCount).toBe(2);
      expect(stats[0].internationalCount).toBe(1);
      expect(stats[0].investmentCount).toBe(3);
    });

    test('应该获取总结统计', async () => {
      const stats = await dailySummaryRepository.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalSummaries).toBe('number');
      expect(typeof stats.averageHotspotsPerDay).toBe('number');

      expect(stats.totalSummaries).toBeGreaterThan(0);
    });

    test('应该批量创建总结', async () => {
      const summaries = await dailySummaryRepository.batchCreate([
        {
          date: '2024-01-02',
          domestic_hotspots: ['热点1'],
          international_hotspots: null,
          investment_hotspots: ['投资1']
        },
        {
          date: '2024-01-03',
          domestic_hotspots: null,
          international_hotspots: ['国际1', '国际2'],
          investment_hotspots: null
        }
      ]);

      expect(summaries).toHaveLength(2);
      expect(summaries[0].date).toBe('2024-01-02');
      expect(summaries[1].date).toBe('2024-01-03');

      // 清理
      for (const summary of summaries) {
        await dailySummaryRepository.delete(summary.id);
      }
    });
  });

  describe('CrawlLogRepository', () => {
    let testCrawlId: number;

    test('应该开始采集', async () => {
      const crawl = await crawlLogRepository.startCrawl(testPlatformId);

      expect(crawl).toBeDefined();
      expect(crawl.id).toBeGreaterThan(0);
      expect(crawl.platform_id).toBe(testPlatformId);
      expect(crawl.status).toBe('running');
      expect(crawl.started_at).toBeInstanceOf(Date);
      expect(crawl.completed_at).toBeNull();

      testCrawlId = crawl.id;
    });

    test('应该完成采集', async () => {
      const completed = await crawlLogRepository.completeCrawl(testCrawlId, 10);

      expect(completed).not.toBeNull();
      expect(completed!.status).toBe('completed');
      expect(completed!.items_collected).toBe(10);
      expect(completed!.completed_at).toBeInstanceOf(Date);
    });

    test('应该标记采集失败', async () => {
      const crawl = await crawlLogRepository.startCrawl(testPlatformId);
      const failed = await crawlLogRepository.failCrawl(crawl.id, '测试错误');

      expect(failed).not.toBeNull();
      expect(failed!.status).toBe('failed');
      expect(failed!.error_message).toBe('测试错误');
    });

    test('应该查询采集日志', async () => {
      const result = await crawlLogRepository.query({
        platformId: testPlatformId,
        limit: 10
      });

      expect(result.items.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);

      const hasTestCrawl = result.items.some(log => log.id === testCrawlId);
      expect(hasTestCrawl).toBe(true);
    });

    test('应该获取运行中的采集', async () => {
      // 创建一个运行中的采集
      const runningCrawl = await crawlLogRepository.startCrawl(testPlatformId);

      const runningCrawls = await crawlLogRepository.getRunningCrawls();

      expect(Array.isArray(runningCrawls)).toBe(true);
      expect(runningCrawls.length).toBeGreaterThan(0);
      expect(runningCrawls.some(log => log.id === runningCrawl.id)).toBe(true);

      // 完成这个采集
      await crawlLogRepository.completeCrawl(runningCrawl.id, 5);
    });

    test('应该获取采集统计', async () => {
      const stats = await crawlLogRepository.getStats();

      expect(stats).toBeDefined();
      expect(typeof stats.totalCrawls).toBe('number');
      expect(typeof stats.successRate).toBe('number');

      expect(stats.totalCrawls).toBeGreaterThan(0);
    });

    test('应该获取平台采集统计', async () => {
      const stats = await crawlLogRepository.getPlatformCrawlStats();

      expect(Array.isArray(stats)).toBe(true);
      const platformStats = stats.find(s => s.platformId === testPlatformId);
      expect(platformStats).toBeDefined();
      expect(platformStats!.totalCrawls).toBeGreaterThan(0);
    });

    test('应该清理旧的采集日志', async () => {
      // 创建一个很旧的日志
      const oldCrawl = await crawlLogRepository.create({
        platform_id: testPlatformId,
        started_at: new Date('2000-01-01'), // 很旧的日期
        completed_at: new Date('2000-01-01'),
        items_collected: 1,
        status: 'completed',
        error_message: null
      });

      const deletedCount = await crawlLogRepository.cleanupOldLogs(1); // 保留1天

      expect(deletedCount).toBeGreaterThan(0);

      // 验证旧的日志已被删除
      const found = await crawlLogRepository.findById(oldCrawl.id);
      expect(found).toBeNull();
    });
  });
});