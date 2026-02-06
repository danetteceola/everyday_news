/**
 * Twitter采集器基础单元测试
 * 测试核心功能而不依赖外部模块
 */

import { TwitterCollector } from '../../src/collection/collectors/twitter-collector';

// 测试配置
const testConfig = {
  enableApiCollection: false,
  enableWebCollection: false,
  collectionTargets: {
    collectTrendingTopics: true,
    collectPopularTweets: true,
    tweetsPerTopic: 5
  }
};

describe('TwitterCollector 核心功能测试', () => {
  let collector: any;

  beforeEach(() => {
    // 创建采集器实例
    collector = new TwitterCollector(testConfig);
  });

  describe('内容分类分析', () => {
    test('应该识别政治内容', () => {
      const content = '总统宣布了新政策';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('politics');
    });

    test('应该识别科技内容', () => {
      const content = '谷歌发布了新的AI技术';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('technology');
    });

    test('应该识别金融内容', () => {
      const content = '股市今天创下新高';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('finance');
    });

    test('应该为未分类内容返回general', () => {
      const content = '今天天气真好';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('general');
    });
  });

  describe('投资内容检测', () => {
    test('应该检测投资关键词', () => {
      const content = '投资股票市场';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该检测股票代码', () => {
      const content = '买入 $AAPL 和 $TSLA';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该检测百分比变化', () => {
      const content = '上涨 +5.3%';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该排除非投资内容', () => {
      const content = '今天去公园散步';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(false);
    });
  });

  describe('查询构建', () => {
    test('应该构建正确的搜索查询', () => {
      const topic = {
        name: '#科技',
        url: 'https://twitter.com/search?q=科技',
        tweetVolume: 1000
      };

      const query = collector['buildTweetSearchQuery'](topic);
      expect(query).toContain('"科技"');
      expect(query).toContain('-is:retweet');
      expect(query).toContain('-is:reply');
    });

    test('应该移除话题标签符号', () => {
      const topic = {
        name: '#人工智能',
        url: 'https://twitter.com/search?q=人工智能',
        tweetVolume: 5000
      };

      const query = collector['buildTweetSearchQuery'](topic);
      expect(query).not.toContain('#');
      expect(query).toContain('"人工智能"');
    });
  });

  describe('推文过滤和排序', () => {
    test('应该按互动数据排序推文', () => {
      const tweets = [
        {
          id: '1',
          author: { id: 'user1', name: 'User 1', screenName: 'user1', verified: false },
          content: '推文1',
          publishTime: new Date(),
          engagement: { likeCount: 10, retweetCount: 5, replyCount: 2 },
          media: [],
          url: 'https://twitter.com/user1/status/1'
        },
        {
          id: '2',
          author: { id: 'user2', name: 'User 2', screenName: 'user2', verified: false },
          content: '推文2',
          publishTime: new Date(),
          engagement: { likeCount: 50, retweetCount: 20, replyCount: 10 },
          media: [],
          url: 'https://twitter.com/user2/status/2'
        },
        {
          id: '3',
          author: { id: 'user3', name: 'User 3', screenName: 'user3', verified: false },
          content: '推文3',
          publishTime: new Date(),
          engagement: { likeCount: 30, retweetCount: 15, replyCount: 5 },
          media: [],
          url: 'https://twitter.com/user3/status/3'
        }
      ];

      const sortedTweets = collector['filterAndSortTweets'](tweets);

      // 应该按总互动数降序排序
      expect(sortedTweets[0].id).toBe('2'); // 总互动数: 80
      expect(sortedTweets[1].id).toBe('3'); // 总互动数: 50
      expect(sortedTweets[2].id).toBe('1'); // 总互动数: 17
    });

    test('应该限制返回数量', () => {
      const tweets = Array.from({ length: 10 }, (_, i) => ({
        id: `${i}`,
        author: { id: `user${i}`, name: `User ${i}`, screenName: `user${i}`, verified: false },
        content: `推文${i}`,
        publishTime: new Date(),
        engagement: { likeCount: i * 10, retweetCount: i * 5, replyCount: i * 2 },
        media: [],
        url: `https://twitter.com/user${i}/status/${i}`
      }));

      // 设置配置
      collector['config'].collectionTargets.tweetsPerTopic = 3;

      const filteredTweets = collector['filterAndSortTweets'](tweets);
      expect(filteredTweets.length).toBe(3);
    });
  });

  describe('标签生成', () => {
    test('应该生成正确的标签', () => {
      const tweet = {
        id: '123',
        author: { id: 'user1', name: 'User 1', screenName: 'user1', verified: true },
        content: '科技投资内容',
        publishTime: new Date(),
        engagement: { likeCount: 100, retweetCount: 50, replyCount: 20 },
        media: [{ type: 'image', url: 'test.jpg', thumbnailUrl: 'test-thumb.jpg' }],
        url: 'https://twitter.com/user1/status/123'
      };

      const topic = {
        name: '科技',
        url: 'https://twitter.com/search?q=科技',
        tweetVolume: 1000
      };

      const categories = ['technology', 'finance'];
      const isInvestmentRelated = true;

      const tags = collector['generateTags'](tweet, topic, categories, isInvestmentRelated);

      expect(tags).toContain('科技'); // 话题标签
      expect(tags).toContain('technology'); // 内容分类
      expect(tags).toContain('finance'); // 内容分类
      expect(tags).toContain('investment'); // 投资相关
      expect(tags).toContain('verified'); // 作者验证状态
      expect(tags).toContain('image'); // 媒体类型
    });
  });
});