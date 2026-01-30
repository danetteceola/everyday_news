# 提案 01: 数据采集架构设计

## 问题陈述

需要从 5 个不同平台（Twitter、YouTube、TikTok、微博、抖音）采集热门内容，每个平台有不同的反爬策略和数据结构。

## 提案方案

### 1. 采集策略

| 平台 | 采集方式 | 优先级 | 频率 |
|------|----------|--------|------|
| Twitter | MCP Browser / API | 高 | 每小时 |
| YouTube | MCP Browser | 高 | 每6小时 |
| TikTok | MCP Browser | 中 | 每日2次 |
| 微博 | MCP Browser | 高 | 每小时 |
| 抖音 | MCP Browser | 中 | 每日2次 |

### 2. 采集数据点

```typescript
interface NewsItem {
  id: string;
  platform: 'twitter' | 'youtube' | 'tiktok' | 'weibo' | 'douyin';
  title: string;
  content: string;
  url: string;
  author: string;
  publishTime: Date;
  engagement: {
    views: number;
    likes: number;
    shares: number;
    comments: number;
  };
  tags: string[];
  category: 'politics' | 'entertainment' | 'sports' | 'tech' | 'finance' | 'other';
  isInvestmentRelated: boolean;
}
```

### 3. 反爬对策

- 使用 MCP Browser 模拟真实用户
- 随机延迟请求
- 错误重试机制
- 降级方案（API → 网页 → 缓存）

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 平台反爬升级 | 高 | 高 | 快速迭代 + MCP 工具 |
| 数据不完整 | 中 | 中 | 多源验证 |
| IP 被封 | 低 | 中 | 代理轮换 |

## 决策

采用 MCP Browser 作为主要采集工具，辅以官方 API（如可用）。
