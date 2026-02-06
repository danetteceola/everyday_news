/**
 * YouTube采集器基础单元测试
 * 测试核心功能而不依赖外部模块
 */

import { YouTubeCollector } from '../../src/collection/collectors/youtube-collector';

// 测试配置
const testConfig = {
  enableWebCollection: false, // 测试时不启用网页采集
  collectionTargets: {
    collectTrendingVideos: true,
    collectPopularContent: false,
    videosPerCategory: 5
  }
};

describe('YouTubeCollector 核心功能测试', () => {
  let collector: any;

  beforeEach(() => {
    // 创建采集器实例
    collector = new YouTubeCollector(testConfig);
  });

  describe('内容分类分析', () => {
    test('应该识别新闻内容', () => {
      const content = 'Breaking news: Major announcement today';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('news');
    });

    test('应该识别科技内容', () => {
      const content = 'New AI technology breakthrough announced';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('technology');
    });

    test('应该识别金融内容', () => {
      const content = 'Stock market reaches new highs today';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('finance');
    });

    test('应该识别娱乐内容', () => {
      const content = 'New music album released today';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('entertainment');
    });

    test('应该识别教育内容', () => {
      const content = 'Learn programming with this tutorial';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('education');
    });

    test('应该为未分类内容返回general', () => {
      const content = 'Beautiful sunset at the beach';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('general');
    });
  });

  describe('投资内容检测', () => {
    test('应该检测投资关键词', () => {
      const content = 'Investment portfolio strategies';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该检测股票代码', () => {
      const content = 'Buy $AAPL and $TSLA stocks';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该检测百分比变化', () => {
      const content = 'Market is up +3.5% today';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该排除非投资内容', () => {
      const content = 'Today we went to the park';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(false);
    });
  });

  describe('发布时间解析', () => {
    test('应该解析"小时前"格式', () => {
      const publishedTime = '2小时前';
      const parsedTime = collector['parsePublishedTime'](publishedTime);

      const now = new Date();
      const expectedTime = new Date(now.getTime() - 2 * 60 * 60 * 1000);

      // 允许1分钟误差
      expect(Math.abs(parsedTime.getTime() - expectedTime.getTime())).toBeLessThan(60000);
    });

    test('应该解析"天前"格式', () => {
      const publishedTime = '3天前';
      const parsedTime = collector['parsePublishedTime'](publishedTime);

      const now = new Date();
      const expectedTime = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      expect(Math.abs(parsedTime.getTime() - expectedTime.getTime())).toBeLessThan(60000);
    });

    test('应该解析"周前"格式', () => {
      const publishedTime = '1周前';
      const parsedTime = collector['parsePublishedTime'](publishedTime);

      const now = new Date();
      const expectedTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      expect(Math.abs(parsedTime.getTime() - expectedTime.getTime())).toBeLessThan(60000);
    });

    test('无法解析时返回当前时间', () => {
      const publishedTime = 'unknown format';
      const parsedTime = collector['parsePublishedTime'](publishedTime);

      const now = new Date();
      expect(Math.abs(parsedTime.getTime() - now.getTime())).toBeLessThan(1000);
    });
  });

  describe('频道ID提取', () => {
    test('应该从频道URL提取ID', () => {
      const channelUrl = 'https://www.youtube.com/@ChannelName';
      const channelId = collector['extractChannelId'](channelUrl);
      expect(channelId).toBe('@ChannelName');
    });

    test('应该处理无效URL', () => {
      const channelUrl = 'invalid-url';
      const channelId = collector['extractChannelId'](channelUrl);
      expect(channelId).toMatch(/^channel_\d+$/);
    });
  });

  describe('标签生成', () => {
    test('应该为投资相关内容生成投资标签', () => {
      const video = {
        id: 'test123',
        title: 'Stock market analysis',
        description: 'Investment content about stocks',
        channel: {
          id: 'channel1',
          name: 'Finance Channel',
          url: 'https://youtube.com/@finance',
          verified: true
        },
        publishTime: new Date(),
        statistics: {
          viewCount: 1000000,
          likeCount: 50000,
          commentCount: 2000
        },
        metadata: {
          duration: 600, // 10分钟
          category: 'Finance',
          tags: ['investing', 'stocks']
        },
        media: [{ type: 'thumbnail', url: 'test.jpg' }],
        url: 'https://youtube.com/watch?v=test123'
      };

      const categories = ['finance'];
      const isInvestmentRelated = true;

      const tags = collector['generateTags'](video, categories, isInvestmentRelated);

      expect(tags).toContain('Finance'); // 视频分类
      expect(tags).toContain('finance'); // 内容分类
      expect(tags).toContain('investment'); // 投资相关
      expect(tags).toContain('verified'); // 频道验证状态
      expect(tags).toContain('medium'); // 时长标签
      expect(tags).toContain('viral'); // 观看量标签
    });

    test('应该为短视频生成短时长标签', () => {
      const video = {
        id: 'test123',
        title: 'Short video',
        description: 'Short content',
        channel: {
          id: 'channel1',
          name: 'Channel',
          url: 'https://youtube.com/@channel',
          verified: false
        },
        publishTime: new Date(),
        statistics: {
          viewCount: 1000,
          likeCount: 50,
          commentCount: 5
        },
        metadata: {
          duration: 30, // 30秒
          category: 'General',
          tags: []
        },
        media: [{ type: 'thumbnail', url: 'test.jpg' }],
        url: 'https://youtube.com/watch?v=test123'
      };

      const categories = ['general'];
      const isInvestmentRelated = false;

      const tags = collector['generateTags'](video, categories, isInvestmentRelated);

      expect(tags).toContain('short');
    });

    test('应该为长视频生成长时长标签', () => {
      const video = {
        id: 'test123',
        title: 'Long video',
        description: 'Long content',
        channel: {
          id: 'channel1',
          name: 'Channel',
          url: 'https://youtube.com/@channel',
          verified: false
        },
        publishTime: new Date(),
        statistics: {
          viewCount: 5000,
          likeCount: 100,
          commentCount: 20
        },
        metadata: {
          duration: 3600, // 1小时
          category: 'Education',
          tags: []
        },
        media: [{ type: 'thumbnail', url: 'test.jpg' }],
        url: 'https://youtube.com/watch?v=test123'
      };

      const categories = ['education'];
      const isInvestmentRelated = false;

      const tags = collector['generateTags'](video, categories, isInvestmentRelated);

      expect(tags).toContain('long');
    });
  });

  describe('视频转换', () => {
    test('应该正确转换视频为新闻项', () => {
      const video = {
        id: 'test123456',
        title: 'Test Video Title',
        description: 'This is a test video description with investment content $AAPL',
        channel: {
          id: 'channel123',
          name: 'Test Channel',
          url: 'https://youtube.com/@testchannel',
          avatarUrl: 'https://example.com/avatar.jpg',
          verified: true
        },
        publishTime: new Date('2024-01-01T12:00:00Z'),
        statistics: {
          viewCount: 1500000,
          likeCount: 75000,
          commentCount: 3000,
          shareCount: 500
        },
        metadata: {
          duration: 300, // 5分钟
          category: 'Technology',
          tags: ['tech', 'innovation'],
          language: 'en',
          license: 'Standard YouTube License',
          allowRatings: true,
          ageRestricted: false
        },
        media: [
          {
            type: 'thumbnail',
            url: 'https://example.com/thumbnail.jpg',
            thumbnailUrl: 'https://example.com/thumbnail.jpg'
          }
        ],
        url: 'https://youtube.com/watch?v=test123456'
      };

      const newsItem = collector['convertVideoToNewsItem'](video);

      expect(newsItem).toHaveProperty('id', 'youtube_test123456');
      expect(newsItem).toHaveProperty('platform', 'youtube');
      expect(newsItem).toHaveProperty('title', 'Test Video Title');
      expect(newsItem).toHaveProperty('content', video.description);
      expect(newsItem).toHaveProperty('url', video.url);
      expect(newsItem.author).toHaveProperty('id', video.channel.id);
      expect(newsItem.author).toHaveProperty('name', video.channel.name);
      expect(newsItem.author).toHaveProperty('verified', true);
      expect(newsItem.engagement).toHaveProperty('viewCount', video.statistics.viewCount);
      expect(newsItem.engagement).toHaveProperty('likeCount', video.statistics.likeCount);
      expect(newsItem.engagement).toHaveProperty('commentCount', video.statistics.commentCount);
      expect(newsItem.engagement).toHaveProperty('shareCount', video.statistics.shareCount);
      expect(newsItem.tags).toContain('Technology');
      expect(newsItem.tags).toContain('technology');
      expect(newsItem.tags).toContain('investment'); // 因为有$AAPL
      expect(newsItem.tags).toContain('verified');
      expect(newsItem.tags).toContain('medium');
      expect(newsItem.tags).toContain('viral');
      expect(newsItem.platformSpecific.youtube).toHaveProperty('videoId', video.id);
      expect(newsItem.platformSpecific.youtube).toHaveProperty('channelId', video.channel.id);
      expect(newsItem.platformSpecific.youtube).toHaveProperty('duration', video.metadata.duration);
      expect(newsItem.platformSpecific.youtube).toHaveProperty('category', video.metadata.category);
      expect(newsItem.categories).toContain('technology');
      expect(newsItem.isInvestmentRelated).toBe(true);
    });
  });
});