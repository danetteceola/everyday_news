/**
 * Twitter采集器单元测试
 */

import { TwitterCollector, TwitterCollectorConfig } from '../../src/collection/collectors/twitter-collector';
import { CollectionError, CollectionErrorType } from '../../src/collection/utils/error-handler';

// 模拟依赖
jest.mock('../../src/collection/collectors/twitter-api-client');
jest.mock('../../src/collection/collectors/twitter-web-scraper');
jest.mock('../../src/collection/anti-crawling/anti-crawling-system');
jest.mock('../../src/collection/utils/logger');
jest.mock('../../src/collection/utils/error-handler');

describe('TwitterCollector', () => {
  let collector: TwitterCollector;
  let mockConfig: TwitterCollectorConfig;

  beforeEach(() => {
    // 创建模拟配置
    mockConfig = {
      enableApiCollection: true,
      apiConfig: {
        apiKey: 'test-api-key',
        apiSecret: 'test-api-secret',
        accessToken: 'test-access-token',
        accessTokenSecret: 'test-access-token-secret',
        bearerToken: 'test-bearer-token'
      },
      enableWebCollection: true,
      webConfig: {
        headless: true,
        timeout: 30000,
        enableJavaScript: true
      },
      collectionTargets: {
        collectTrendingTopics: true,
        collectPopularTweets: true,
        tweetsPerTopic: 5,
        location: 'global'
      }
    };

    // 清除所有模拟
    jest.clearAllMocks();
  });

  describe('构造函数', () => {
    test('应该使用有效配置成功创建实例', () => {
      expect(() => {
        collector = new TwitterCollector(mockConfig);
      }).not.toThrow();
    });

    test('当API和网页采集都禁用时应该抛出错误', () => {
      const invalidConfig = {
        ...mockConfig,
        enableApiCollection: false,
        enableWebCollection: false
      };

      expect(() => {
        new TwitterCollector(invalidConfig);
      }).toThrow(CollectionError);
    });

    test('当启用API采集但没有API配置时应该抛出错误', () => {
      const invalidConfig = {
        ...mockConfig,
        enableApiCollection: true,
        apiConfig: undefined
      };

      expect(() => {
        new TwitterCollector(invalidConfig);
      }).toThrow(CollectionError);
    });

    test('当启用网页采集但没有网页配置时应该抛出错误', () => {
      const invalidConfig = {
        ...mockConfig,
        enableWebCollection: true,
        webConfig: undefined
      };

      expect(() => {
        new TwitterCollector(invalidConfig);
      }).toThrow(CollectionError);
    });
  });

  describe('初始化', () => {
    beforeEach(() => {
      collector = new TwitterCollector(mockConfig);
    });

    test('应该成功初始化', async () => {
      // 设置模拟返回值
      const mockInitializeApiClient = jest.fn().mockResolvedValue({ testAvailability: jest.fn().mockResolvedValue(true) });
      const mockInitializeWebScraper = jest.fn().mockResolvedValue({ testAvailability: jest.fn().mockResolvedValue(true) });

      // 替换私有方法
      (collector as any).initializeApiClient = mockInitializeApiClient;
      (collector as any).initializeWebScraper = mockInitializeWebScraper;

      await expect(collector.initialize()).resolves.not.toThrow();
    });

    test('当API和网页采集都不可用时应该抛出错误', async () => {
      // 设置模拟返回值
      const mockInitializeApiClient = jest.fn().mockResolvedValue(null);
      const mockInitializeWebScraper = jest.fn().mockResolvedValue(null);

      // 替换私有方法
      (collector as any).initializeApiClient = mockInitializeApiClient;
      (collector as any).initializeWebScraper = mockInitializeWebScraper;

      await expect(collector.initialize()).rejects.toThrow(CollectionError);
    });
  });

  describe('内容分析', () => {
    beforeEach(() => {
      collector = new TwitterCollector(mockConfig);
    });

    test('应该正确分析政治内容', () => {
      const content = 'The president announced new policies today';
      const categories = (collector as any).analyzeContentCategories(content);

      expect(categories).toContain('politics');
    });

    test('应该正确分析科技内容', () => {
      const content = 'New AI technology breakthrough announced by Google';
      const categories = (collector as any).analyzeContentCategories(content);

      expect(categories).toContain('technology');
    });

    test('应该正确分析金融内容', () => {
      const content = 'Stock market reaches new highs today';
      const categories = (collector as any).analyzeContentCategories(content);

      expect(categories).toContain('finance');
    });

    test('应该检测投资相关内容', () => {
      const investmentContent = 'AAPL stock is up 5% today after earnings report';
      const nonInvestmentContent = 'Beautiful sunset at the beach today';

      const isInvestment1 = (collector as any).detectInvestmentContent(investmentContent);
      const isInvestment2 = (collector as any).detectInvestmentContent(nonInvestmentContent);

      expect(isInvestment1).toBe(true);
      expect(isInvestment2).toBe(false);
    });

    test('应该检测股票代码模式', () => {
      const contentWithSymbol = 'Just bought $TSLA and $AAPL stocks';
      const isInvestment = (collector as any).detectInvestmentContent(contentWithSymbol);

      expect(isInvestment).toBe(true);
    });

    test('应该检测百分比变化模式', () => {
      const contentWithPercentage = 'Market is up +3.5% today';
      const isInvestment = (collector as any).detectInvestmentContent(contentWithPercentage);

      expect(isInvestment).toBe(true);
    });
  });

  describe('推文转换', () => {
    beforeEach(() => {
      collector = new TwitterCollector(mockConfig);
    });

    test('应该正确转换推文为新闻项', () => {
      const mockTweet = {
        id: '1234567890',
        author: {
          id: 'user123',
          name: 'Test User',
          screenName: 'testuser',
          avatarUrl: 'https://example.com/avatar.jpg',
          verified: true,
          followerCount: 1000
        },
        content: 'This is a test tweet about technology and AI',
        publishTime: new Date('2024-01-01T12:00:00Z'),
        engagement: {
          likeCount: 100,
          retweetCount: 50,
          replyCount: 20,
          quoteCount: 10,
          viewCount: 1000
        },
        media: [],
        url: 'https://twitter.com/testuser/status/1234567890',
        language: 'en'
      };

      const mockTopic = {
        name: 'Technology',
        url: 'https://twitter.com/search?q=Technology',
        tweetVolume: 10000
      };

      const newsItem = (collector as any).convertTweetToNewsItem(mockTweet, mockTopic);

      expect(newsItem).toHaveProperty('id', 'twitter_1234567890');
      expect(newsItem).toHaveProperty('platform', 'twitter');
      expect(newsItem).toHaveProperty('title');
      expect(newsItem).toHaveProperty('content', mockTweet.content);
      expect(newsItem).toHaveProperty('url', mockTweet.url);
      expect(newsItem).toHaveProperty('author.id', mockTweet.author.id);
      expect(newsItem).toHaveProperty('engagement.likeCount', mockTweet.engagement.likeCount);
      expect(newsItem.tags).toContain('Technology');
      expect(newsItem.tags).toContain('technology');
      expect(newsItem.platformSpecific.twitter).toHaveProperty('tweetId', mockTweet.id);
    });

    test('应该为投资相关内容添加投资标签', () => {
      const mockTweet = {
        id: '1234567890',
        author: {
          id: 'user123',
          name: 'Test User',
          screenName: 'testuser',
          avatarUrl: 'https://example.com/avatar.jpg',
          verified: false,
          followerCount: 100
        },
        content: '$AAPL stock is up 5% today',
        publishTime: new Date('2024-01-01T12:00:00Z'),
        engagement: {
          likeCount: 10,
          retweetCount: 5,
          replyCount: 2,
          quoteCount: 1,
          viewCount: 100
        },
        media: [],
        url: 'https://twitter.com/testuser/status/1234567890',
        language: 'en'
      };

      const newsItem = (collector as any).convertTweetToNewsItem(mockTweet);

      expect(newsItem.tags).toContain('investment');
      expect(newsItem.tags).toContain('finance');
    });
  });

  describe('查询构建', () => {
    beforeEach(() => {
      collector = new TwitterCollector(mockConfig);
    });

    test('应该正确构建推文搜索查询', () => {
      const mockTopic = {
        name: '#Technology',
        url: 'https://twitter.com/search?q=Technology',
        tweetVolume: 10000
      };

      const query = (collector as any).buildTweetSearchQuery(mockTopic);

      expect(query).toContain('"Technology"');
      expect(query).toContain('-is:retweet');
      expect(query).toContain('-is:reply');
      expect(query).not.toContain('#');
    });
  });

  describe('清理', () => {
    beforeEach(() => {
      collector = new TwitterCollector(mockConfig);
    });

    test('应该成功清理资源', async () => {
      // 设置模拟
      const mockApiClientCleanup = jest.fn().mockResolvedValue(undefined);
      const mockWebScraperCleanup = jest.fn().mockResolvedValue(undefined);

      (collector as any).apiClient = { cleanup: mockApiClientCleanup };
      (collector as any).webScraper = { cleanup: mockWebScraperCleanup };

      await expect(collector.cleanup()).resolves.not.toThrow();

      expect(mockApiClientCleanup).toHaveBeenCalled();
      expect(mockWebScraperCleanup).toHaveBeenCalled();
    });
  });
});

describe('TwitterCollector 配置测试', () => {
  test('应该支持仅API采集模式', () => {
    const apiOnlyConfig: TwitterCollectorConfig = {
      enableApiCollection: true,
      apiConfig: {
        apiKey: 'test-key',
        apiSecret: 'test-secret',
        accessToken: 'test-token',
        accessTokenSecret: 'test-token-secret'
      },
      enableWebCollection: false,
      collectionTargets: {
        collectTrendingTopics: true,
        collectPopularTweets: true,
        tweetsPerTopic: 5
      }
    };

    expect(() => {
      new TwitterCollector(apiOnlyConfig);
    }).not.toThrow();
  });

  test('应该支持仅网页采集模式', () => {
    const webOnlyConfig: TwitterCollectorConfig = {
      enableApiCollection: false,
      enableWebCollection: true,
      webConfig: {
        headless: true,
        timeout: 30000,
        enableJavaScript: true
      },
      collectionTargets: {
        collectTrendingTopics: true,
        collectPopularTweets: true,
        tweetsPerTopic: 5
      }
    };

    expect(() => {
      new TwitterCollector(webOnlyConfig);
    }).not.toThrow();
  });
});