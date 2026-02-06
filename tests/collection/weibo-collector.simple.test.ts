/**
 * 微博采集器基础单元测试
 * 测试核心功能而不依赖外部模块
 */

import { WeiboCollector } from '../../src/collection/collectors/weibo-collector';

// 测试配置
const testConfig = {
  enableWebCollection: false, // 测试时不启用网页采集
  collectionTargets: {
    collectHotTopics: true,
    collectPopularPosts: false,
    postsPerTopic: 5
  }
};

describe('WeiboCollector 核心功能测试', () => {
  let collector: any;

  beforeEach(() => {
    // 创建采集器实例
    collector = new WeiboCollector(testConfig);
  });

  describe('内容分类分析', () => {
    test('应该识别新闻内容', () => {
      const content = '最新新闻：两会今日召开';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('news');
    });

    test('应该识别娱乐内容', () => {
      const content = '明星演唱会今晚举行';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('entertainment');
    });

    test('应该识别科技内容', () => {
      const content = '人工智能技术新突破';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('technology');
    });

    test('应该识别财经内容', () => {
      const content = '股市今日上涨';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('finance');
    });

    test('应该识别体育内容', () => {
      const content = '足球比赛精彩瞬间';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('sports');
    });

    test('应该为未分类内容返回general', () => {
      const content = '今天天气不错';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('general');
    });
  });

  describe('投资内容检测', () => {
    test('应该检测中文投资关键词', () => {
      const content = '股票投资策略分析';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该检测股票代码', () => {
      const content = '买入$AAPL和$TSLA股票';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该检测中文百分比变化', () => {
      const content = '股市上涨5%';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该检测中文涨跌描述', () => {
      const content = '今日股市下跌3.2%';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该排除非投资内容', () => {
      const content = '今天去公园散步';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(false);
    });
  });

  describe('热搜话题转换', () => {
    test('应该正确转换热搜话题为新闻项', () => {
      const topic = {
        id: 'topic_001',
        title: '2024两会召开',
        url: 'https://s.weibo.com/weibo?q=%232024%E4%B8%A4%E4%BC%9A%E5%8F%AC%E5%BC%80%23',
        hotValue: 2850000,
        category: '时事',
        rank: 1,
        description: '2024年全国两会正式召开',
        discussionCount: 125000,
        readCount: 28500000
      };

      const newsItem = collector['convertHotTopicToNewsItem'](topic);

      expect(newsItem).toHaveProperty('id', 'weibo_topic_topic_001');
      expect(newsItem).toHaveProperty('platform', 'weibo');
      expect(newsItem.title).toContain('热搜');
      expect(newsItem.content).toContain(topic.title);
      expect(newsItem.content).toContain(topic.description);
      expect(newsItem.url).toBe(topic.url);
      expect(newsItem.author).toHaveProperty('name', '微博热搜');
      expect(newsItem.author).toHaveProperty('verified', true);
      expect(newsItem.engagement.commentCount).toBe(topic.discussionCount);
      expect(newsItem.engagement.viewCount).toBe(topic.readCount);
      expect(newsItem.tags).toContain(topic.category);
      expect(newsItem.tags).toContain(`rank-${topic.rank}`);
      expect(newsItem.platformSpecific.weibo).toHaveProperty('topicId', topic.id);
      expect(newsItem.platformSpecific.weibo).toHaveProperty('hotValue', topic.hotValue);
      expect(newsItem.platformSpecific.weibo).toHaveProperty('rank', topic.rank);
    });

    test('应该为高热度话题添加热度标签', () => {
      const topic = {
        id: 'topic_002',
        title: '热门话题',
        url: 'https://example.com',
        hotValue: 2000000, // 超过100万
        category: '娱乐',
        rank: 2
      };

      const newsItem = collector['convertHotTopicToNewsItem'](topic);
      expect(newsItem.tags).toContain('super-hot');
    });
  });

  describe('微博帖子标签生成', () => {
    test('应该为原创微博生成原创标签', () => {
      const post = {
        id: 'post_001',
        content: '测试微博内容',
        author: {
          id: 'user_001',
          name: '测试用户',
          screenName: 'test_user',
          url: 'https://weibo.com/test_user',
          verified: false
        },
        publishTime: new Date(),
        engagement: {
          repostCount: 100,
          commentCount: 50,
          likeCount: 200
        },
        metadata: {
          isOriginal: true,
          containsVideo: false,
          containsImage: true,
          containsLink: false,
          imageCount: 2
        },
        media: [],
        url: 'https://weibo.com/test_user/post_001'
      };

      const categories = ['general'];
      const isInvestmentRelated = false;

      const tags = collector['generateTags'](post, categories, isInvestmentRelated);

      expect(tags).toContain('original');
      expect(tags).toContain('image');
      expect(tags).toContain('images-2');
    });

    test('应该为高互动微博生成高互动标签', () => {
      const post = {
        id: 'post_002',
        content: '高互动微博',
        author: {
          id: 'user_002',
          name: '大V用户',
          screenName: 'bigv_user',
          url: 'https://weibo.com/bigv_user',
          verified: true,
          verificationType: 'blue'
        },
        publishTime: new Date(),
        engagement: {
          repostCount: 15000, // 超过10000
          commentCount: 12000, // 超过10000
          likeCount: 60000 // 超过50000
        },
        metadata: {
          isOriginal: false,
          containsVideo: true,
          containsImage: false,
          containsLink: false,
          topics: ['#热门话题#', '#测试#']
        },
        media: [],
        url: 'https://weibo.com/bigv_user/post_002'
      };

      const categories = ['entertainment'];
      const isInvestmentRelated = false;

      const tags = collector['generateTags'](post, categories, isInvestmentRelated);

      expect(tags).toContain('verified');
      expect(tags).toContain('verified-blue');
      expect(tags).toContain('video');
      expect(tags).toContain('high-repost');
      expect(tags).toContain('high-comment');
      expect(tags).toContain('high-like');
      expect(tags).toContain('热门话题');
      expect(tags).toContain('测试');
    });

    test('应该为投资相关内容生成投资标签', () => {
      const post = {
        id: 'post_003',
        content: '股市分析报告 $AAPL',
        author: {
          id: 'user_003',
          name: '财经博主',
          screenName: 'finance_blogger',
          url: 'https://weibo.com/finance_blogger',
          verified: true
        },
        publishTime: new Date(),
        engagement: {
          repostCount: 500,
          commentCount: 300,
          likeCount: 1500
        },
        metadata: {
          isOriginal: true,
          containsVideo: false,
          containsImage: false,
          containsLink: true
        },
        media: [],
        url: 'https://weibo.com/finance_blogger/post_003'
      };

      const categories = ['finance'];
      const isInvestmentRelated = true;

      const tags = collector['generateTags'](post, categories, isInvestmentRelated);

      expect(tags).toContain('investment');
      expect(tags).toContain('verified');
      expect(tags).toContain('original');
      expect(tags).toContain('link');
    });
  });
});