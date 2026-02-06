/**
 * 抖音采集器基础单元测试
 * 测试核心功能而不依赖外部模块
 */

import { DouyinCollector } from '../../src/collection/collectors/douyin-collector';

// 测试配置
const testConfig = {
  enableWebCollection: false, // 测试时不启用网页采集
  collectionTargets: {
    collectHotTopics: true,
    collectTrendingVideos: false,
    videosPerCategory: 5
  }
};

describe('DouyinCollector 核心功能测试', () => {
  let collector: any;

  beforeEach(() => {
    // 创建采集器实例
    collector = new DouyinCollector(testConfig);
  });

  describe('内容分类分析', () => {
    test('应该识别娱乐内容', () => {
      const content = '搞笑舞蹈挑战视频';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('entertainment');
    });

    test('应该识别美食内容', () => {
      const content = '年夜饭菜谱教程';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('food');
    });

    test('应该识别时尚内容', () => {
      const content = '春季穿搭美妆分享';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('fashion');
    });

    test('应该识别知识内容', () => {
      const content = '科普知识学习技巧';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('knowledge');
    });

    test('应该识别旅游内容', () => {
      const content = '旅游景点打卡攻略';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('travel');
    });

    test('应该为未分类内容返回general', () => {
      const content = '日常分享';
      const categories = collector['analyzeContentCategories'](content);
      expect(categories).toContain('general');
    });
  });

  describe('投资内容检测', () => {
    test('应该检测中文投资关键词', () => {
      const content = '股票投资理财技巧';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该检测股票代码', () => {
      const content = '买入$AAPL股票';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该检测百分比变化', () => {
      const content = '收益上涨5%';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(true);
    });

    test('应该排除非投资内容', () => {
      const content = '今天天气真好';
      const isInvestment = collector['detectInvestmentContent'](content);
      expect(isInvestment).toBe(false);
    });
  });

  describe('热搜话题转换', () => {
    test('应该正确转换热搜话题为新闻项', () => {
      const topic = {
        id: 'topic_001',
        title: '春节穿搭',
        url: 'https://www.douyin.com/hot/topic/001',
        hotValue: 1850000,
        category: '时尚',
        rank: 1,
        description: '春节穿搭灵感',
        videoCount: 12500
      };

      const newsItem = collector['convertHotTopicToNewsItem'](topic);

      expect(newsItem).toHaveProperty('id', 'douyin_topic_topic_001');
      expect(newsItem).toHaveProperty('platform', 'douyin');
      expect(newsItem.title).toContain('抖音热搜');
      expect(newsItem.content).toContain(topic.title);
      expect(newsItem.content).toContain(topic.description);
      expect(newsItem.url).toBe(topic.url);
      expect(newsItem.author).toHaveProperty('name', '抖音热搜');
      expect(newsItem.author).toHaveProperty('verified', true);
      expect(newsItem.engagement.viewCount).toBe(topic.hotValue);
      expect(newsItem.tags).toContain(topic.category);
      expect(newsItem.tags).toContain(`rank-${topic.rank}`);
      expect(newsItem.tags).toContain('super-hot'); // 热度超过100万
      expect(newsItem.platformSpecific.douyin).toHaveProperty('topicId', topic.id);
      expect(newsItem.platformSpecific.douyin).toHaveProperty('hotValue', topic.hotValue);
    });
  });

  describe('视频标签生成', () => {
    test('应该为短视频生成短时长标签', () => {
      const video = {
        id: 'video_001',
        title: '短视频',
        description: '短内容',
        author: {
          id: 'author_001',
          name: '作者',
          screenName: 'author',
          url: 'https://douyin.com/user/author',
          verified: false
        },
        publishTime: new Date(),
        statistics: {
          viewCount: 10000,
          likeCount: 500,
          commentCount: 50,
          shareCount: 100
        },
        metadata: {
          duration: 15, // 15秒
          tags: ['short'],
          hasAudio: true,
          hasEffects: false
        },
        media: [{ type: 'thumbnail', url: 'test.jpg' }],
        url: 'https://douyin.com/video/video_001'
      };

      const categories = ['entertainment'];
      const isInvestmentRelated = false;

      const tags = collector['generateTags'](video, categories, isInvestmentRelated);

      expect(tags).toContain('short');
      expect(tags).toContain('has-music');
    });

    test('应该为长视频生成长时长标签', () => {
      const video = {
        id: 'video_002',
        title: '长视频教程',
        description: '详细教程内容',
        author: {
          id: 'author_002',
          name: '专家',
          screenName: 'expert',
          url: 'https://douyin.com/user/expert',
          verified: true,
          verificationType: 'blue'
        },
        publishTime: new Date(),
        statistics: {
          viewCount: 1500000,
          likeCount: 250000,
          commentCount: 15000,
          shareCount: 50000
        },
        metadata: {
          duration: 180, // 3分钟
          tags: ['tutorial'],
          category: '知识',
          hasAudio: true,
          hasEffects: true
        },
        media: [{ type: 'video', url: 'test.mp4' }],
        url: 'https://douyin.com/video/video_002'
      };

      const categories = ['knowledge'];
      const isInvestmentRelated = false;

      const tags = collector['generateTags'](video, categories, isInvestmentRelated);

      expect(tags).toContain('long');
      expect(tags).toContain('verified');
      expect(tags).toContain('verified-blue');
      expect(tags).toContain('video');
      expect(tags).toContain('has-music');
      expect(tags).toContain('has-effects');
      expect(tags).toContain('viral');
      expect(tags).toContain('知识');
    });

    test('应该为投资相关内容生成投资标签', () => {
      const video = {
        id: 'video_003',
        title: '理财教程',
        description: '股票投资技巧 $AAPL',
        author: {
          id: 'author_003',
          name: '财经博主',
          screenName: 'finance',
          url: 'https://douyin.com/user/finance',
          verified: true
        },
        publishTime: new Date(),
        statistics: {
          viewCount: 850000,
          likeCount: 120000,
          commentCount: 8000,
          shareCount: 25000
        },
        metadata: {
          duration: 60,
          tags: ['finance'],
          hasAudio: false,
          hasEffects: false
        },
        media: [{ type: 'thumbnail', url: 'test.jpg' }],
        url: 'https://douyin.com/video/video_003'
      };

      const categories = ['general'];
      const isInvestmentRelated = true;

      const tags = collector['generateTags'](video, categories, isInvestmentRelated);

      expect(tags).toContain('investment');
      expect(tags).toContain('verified');
    });
  });
});