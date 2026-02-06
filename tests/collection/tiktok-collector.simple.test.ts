/**
 * TikTok采集器基础单元测试
 * 测试核心功能而不依赖外部模块
 */

import { TikTokCollector } from '../../src/collection/collectors/tiktok-collector';

// 测试配置
const testConfig = {
  enableWebCollection: false, // 测试时不启用网页采集
  collectionTargets: {
    collectTrendingVideos: true,
    collectPopularContent: false,
    videosPerCategory: 5
  }
};

describe('TikTokCollector 核心功能测试', () => {
  let collector: any;

  beforeEach(() => {
    // 创建采集器实例
    collector = new TikTokCollector(testConfig);
  });

  describe('内容分类分析', () => {
    test('应该识别娱乐内容', () => {
      const content = 'Dance challenge trending now';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('entertainment');
    });

    test('应该识别科技内容', () => {
      const content = 'New gadget review and unboxing';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('technology');
    });

    test('应该识别教育内容', () => {
      const content = 'How to learn programming tutorial';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('education');
    });

    test('应该识别美食内容', () => {
      const content = 'Delicious recipe cooking tutorial';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('food');
    });

    test('应该识别时尚内容', () => {
      const content = 'Fashion style and makeup tips';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('fashion');
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

  describe('标签生成', () => {
    test('应该为短视频生成短时长标签', () => {
      const video = {
        id: 'test123',
        title: 'Short video',
        description: 'Short content',
        author: {
          id: 'author1',
          name: 'Author',
          screenName: 'author1',
          url: 'https://tiktok.com/@author1',
          verified: false
        },
        publishTime: new Date(),
        statistics: {
          viewCount: 1000,
          likeCount: 50,
          commentCount: 5,
          shareCount: 10
        },
        metadata: {
          duration: 15, // 15秒
          tags: ['short', 'funny'],
          hasAudio: true,
          hasEffects: false
        },
        media: [{ type: 'thumbnail', url: 'test.jpg' }],
        url: 'https://tiktok.com/@author1/video/test123'
      };

      const categories = ['entertainment'];
      const isInvestmentRelated = false;

      const tags = collector['generateTags'](video, categories, isInvestmentRelated);

      expect(tags).toContain('short');
      expect(tags).toContain('has-music');
    });

    test('应该为长视频生成长时长标签', () => {
      const video = {
        id: 'test123',
        title: 'Long video',
        description: 'Long content',
        author: {
          id: 'author1',
          name: 'Author',
          screenName: 'author1',
          url: 'https://tiktok.com/@author1',
          verified: true
        },
        publishTime: new Date(),
        statistics: {
          viewCount: 5000000,
          likeCount: 250000,
          commentCount: 10000,
          shareCount: 50000
        },
        metadata: {
          duration: 180, // 3分钟
          tags: ['long', 'educational'],
          hasAudio: true,
          hasEffects: true,
          musicInfo: {
            title: 'Background Music',
            author: 'Artist'
          },
          effectInfo: {
            name: 'Special Effect',
            id: 'effect_123'
          }
        },
        media: [{ type: 'thumbnail', url: 'test.jpg' }],
        url: 'https://tiktok.com/@author1/video/test123'
      };

      const categories = ['education'];
      const isInvestmentRelated = false;

      const tags = collector['generateTags'](video, categories, isInvestmentRelated);

      expect(tags).toContain('long');
      expect(tags).toContain('verified');
      expect(tags).toContain('has-music');
      expect(tags).toContain('has-effects');
      expect(tags).toContain('viral');
      expect(tags).toContain('high-engagement');
    });

    test('应该为投资相关内容生成投资标签', () => {
      const video = {
        id: 'test123',
        title: 'Stock market analysis',
        description: 'Investment content about stocks $AAPL',
        author: {
          id: 'author1',
          name: 'Finance Expert',
          screenName: 'finance_expert',
          url: 'https://tiktok.com/@finance_expert',
          verified: true
        },
        publishTime: new Date(),
        statistics: {
          viewCount: 1000000,
          likeCount: 50000,
          commentCount: 2000,
          shareCount: 10000
        },
        metadata: {
          duration: 60,
          tags: ['finance', 'investment'],
          hasAudio: false,
          hasEffects: false
        },
        media: [{ type: 'thumbnail', url: 'test.jpg' }],
        url: 'https://tiktok.com/@finance_expert/video/test123'
      };

      const categories = ['general'];
      const isInvestmentRelated = true;

      const tags = collector['generateTags'](video, categories, isInvestmentRelated);

      expect(tags).toContain('investment');
      expect(tags).toContain('verified');
    });
  });

  describe('视频转换', () => {
    test('应该正确转换视频为新闻项', () => {
      const video = {
        id: 'test123456',
        title: 'Test TikTok Video Title',
        description: 'This is a test video description with investment content $AAPL',
        author: {
          id: 'author123',
          name: 'Test Author',
          screenName: 'test_author',
          url: 'https://tiktok.com/@test_author',
          avatarUrl: 'https://example.com/avatar.jpg',
          verified: true,
          followerCount: 100000,
          followingCount: 500
        },
        publishTime: new Date('2024-01-01T12:00:00Z'),
        statistics: {
          viewCount: 1500000,
          likeCount: 75000,
          commentCount: 3000,
          shareCount: 5000,
          saveCount: 2500
        },
        metadata: {
          duration: 45,
          resolution: '720x1280',
          aspectRatio: '9:16',
          tags: ['test', 'demo'],
          language: 'en',
          region: 'US',
          category: 'Entertainment',
          hasAudio: true,
          hasEffects: true,
          musicInfo: {
            title: 'Test Song',
            author: 'Test Artist',
            album: 'Test Album',
            duration: 180
          },
          effectInfo: {
            name: 'Test Effect',
            id: 'effect_123',
            type: 'filter'
          }
        },
        media: [
          {
            type: 'video',
            url: 'https://example.com/video.mp4',
            thumbnailUrl: 'https://example.com/thumbnail.jpg',
            width: 720,
            height: 1280
          }
        ],
        url: 'https://tiktok.com/@test_author/video/test123456'
      };

      const newsItem = collector['convertVideoToNewsItem'](video);

      expect(newsItem).toHaveProperty('id', 'tiktok_test123456');
      expect(newsItem).toHaveProperty('platform', 'tiktok');
      expect(newsItem).toHaveProperty('title', 'Test TikTok Video Title');
      expect(newsItem).toHaveProperty('content', video.description);
      expect(newsItem).toHaveProperty('url', video.url);
      expect(newsItem.author).toHaveProperty('id', video.author.id);
      expect(newsItem.author).toHaveProperty('name', video.author.name);
      expect(newsItem.author).toHaveProperty('verified', true);
      expect(newsItem.engagement).toHaveProperty('viewCount', video.statistics.viewCount);
      expect(newsItem.engagement).toHaveProperty('likeCount', video.statistics.likeCount);
      expect(newsItem.engagement).toHaveProperty('commentCount', video.statistics.commentCount);
      expect(newsItem.engagement).toHaveProperty('shareCount', video.statistics.shareCount);
      expect(newsItem.tags).toContain('Entertainment');
      expect(newsItem.tags).toContain('investment');
      expect(newsItem.tags).toContain('verified');
      expect(newsItem.tags).toContain('has-music');
      expect(newsItem.tags).toContain('has-effects');
      expect(newsItem.platformSpecific.tiktok).toHaveProperty('videoId', video.id);
      expect(newsItem.platformSpecific.tiktok).toHaveProperty('authorId', video.author.id);
      expect(newsItem.platformSpecific.tiktok).toHaveProperty('duration', video.metadata.duration);
      expect(newsItem.platformSpecific.tiktok).toHaveProperty('hasAudio', true);
      expect(newsItem.platformSpecific.tiktok).toHaveProperty('hasEffects', true);
    });
  });
});