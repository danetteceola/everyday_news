# 数据库API使用文档

## 概述

数据库模块采用Repository模式提供数据访问层，所有数据库操作都通过Repository接口进行。本文档介绍如何初始化数据库模块、使用各个Repository以及执行高级操作。

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 初始化数据库

```typescript
import { DatabaseModule } from '../src/db';

// 自动初始化数据库（如果不存在则创建）
await DatabaseModule.initialize();

// 或者使用CLI命令
npm run db:init
```

### 3. 基本使用示例

```typescript
import {
  platformRepository,
  newsRepository,
  summaryRepository,
  crawlRepository
} from '../src/db/repositories';

// 添加平台
const platform = await platformRepository.create({
  name: 'Twitter',
  icon: 'twitter.png'
});

// 添加新闻
const news = await newsRepository.create({
  platform_id: platform.id,
  external_id: '123456789',
  title: '热点新闻标题',
  content: '新闻内容...',
  url: 'https://twitter.com/status/123456789',
  publish_time: new Date(),
  views: 1000,
  likes: 200,
  shares: 50,
  comments: 30
});

// 查询新闻
const newsList = await newsRepository.findByPlatform(platform.id, {
  startDate: '2026-01-01',
  endDate: '2026-01-31'
});
```

## Repository API

### PlatformRepository - 平台管理

**导入:**
```typescript
import { platformRepository } from '../src/db/repositories/platform.repository';
```

**方法:**

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `findAll()` | - | `Promise<Platform[]>` | 获取所有平台 |
| `findById(id: number)` | `id: number` | `Promise<Platform \| null>` | 根据ID查找平台 |
| `findByName(name: string)` | `name: string` | `Promise<Platform \| null>` | 根据名称查找平台 |
| `create(data: CreatePlatform)` | `data: CreatePlatform` | `Promise<Platform>` | 创建新平台 |
| `update(id: number, data: UpdatePlatform)` | `id: number`, `data: UpdatePlatform` | `Promise<Platform>` | 更新平台信息 |
| `delete(id: number)` | `id: number` | `Promise<boolean>` | 删除平台 |
| `count()` | - | `Promise<number>` | 统计平台数量 |

**类型定义:**
```typescript
interface Platform {
  id: number;
  name: string;
  icon: string | null;
  created_at: Date;
}

interface CreatePlatform {
  name: string;
  icon?: string;
}

interface UpdatePlatform {
  name?: string;
  icon?: string;
}
```

**示例:**
```typescript
// 获取所有平台
const platforms = await platformRepository.findAll();

// 创建新平台
const newPlatform = await platformRepository.create({
  name: 'YouTube',
  icon: 'youtube.png'
});

// 更新平台
const updated = await platformRepository.update(newPlatform.id, {
  icon: 'youtube-new.png'
});
```

### NewsRepository - 新闻数据管理

**导入:**
```typescript
import { newsRepository } from '../src/db/repositories/news.repository';
```

**方法:**

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `findAll(options?)` | `options?: FindOptions` | `Promise<NewsItem[]>` | 获取新闻列表（支持分页和过滤） |
| `findById(id: number)` | `id: number` | `Promise<NewsItem \| null>` | 根据ID查找新闻 |
| `findByPlatform(platformId, options?)` | `platformId: number`, `options?: PlatformFindOptions` | `Promise<NewsItem[]>` | 根据平台查找新闻 |
| `findByExternalId(platformId, externalId)` | `platformId: number`, `externalId: string` | `Promise<NewsItem \| null>` | 根据平台和外部ID查找 |
| `create(data: CreateNewsItem)` | `data: CreateNewsItem` | `Promise<NewsItem>` | 创建新闻 |
| `update(id: number, data: UpdateNewsItem)` | `id: number`, `data: UpdateNewsItem` | `Promise<NewsItem>` | 更新新闻 |
| `delete(id: number)` | `id: number` | `Promise<boolean>` | 删除新闻 |
| `count(options?)` | `options?: CountOptions` | `Promise<number>` | 统计新闻数量 |
| `search(keyword, options?)` | `keyword: string`, `options?: SearchOptions` | `Promise<NewsItem[]>` | 搜索新闻 |
| `getStatistics(startDate, endDate)` | `startDate: string`, `endDate: string` | `Promise<NewsStatistics>` | 获取新闻统计 |
| `batchCreate(items: CreateNewsItem[])` | `items: CreateNewsItem[]` | `Promise<NewsItem[]>` | 批量创建新闻 |
| `updateSummary(id, summary)` | `id: number`, `summary: string` | `Promise<NewsItem>` | 更新新闻摘要 |

**类型定义:**
```typescript
interface NewsItem {
  id: number;
  platform_id: number;
  external_id: string;
  title: string;
  content: string;
  url: string;
  author: string | null;
  publish_time: Date;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  tags: string[] | null;
  category: string | null;
  is_investment_related: boolean;
  summary: string | null;
  created_at: Date;
}

interface CreateNewsItem {
  platform_id: number;
  external_id: string;
  title: string;
  content: string;
  url: string;
  author?: string;
  publish_time: Date;
  views?: number;
  likes?: number;
  shares?: number;
  comments?: number;
  tags?: string[];
  category?: string;
  is_investment_related?: boolean;
  summary?: string;
}

interface FindOptions {
  limit?: number;
  offset?: number;
  orderBy?: 'publish_time' | 'views' | 'likes' | 'shares' | 'comments';
  orderDir?: 'ASC' | 'DESC';
  startDate?: string;
  endDate?: string;
  category?: string;
  isInvestmentRelated?: boolean;
}

interface NewsStatistics {
  total: number;
  byPlatform: Array<{ platform_id: number; platform_name: string; count: number }>;
  byCategory: Array<{ category: string; count: number }>;
  byDate: Array<{ date: string; count: number }>;
}
```

**示例:**
```typescript
// 分页查询新闻
const newsList = await newsRepository.findAll({
  limit: 20,
  offset: 0,
  orderBy: 'publish_time',
  orderDir: 'DESC',
  startDate: '2026-01-01',
  endDate: '2026-01-31'
});

// 搜索新闻
const searchResults = await newsRepository.search('热点新闻', {
  limit: 10
});

// 批量导入新闻
const batchResults = await newsRepository.batchCreate([
  {
    platform_id: 1,
    external_id: 'tweet_123',
    title: '新闻标题1',
    content: '内容1',
    url: 'https://...',
    publish_time: new Date()
  },
  // 更多新闻...
]);

// 获取统计信息
const stats = await newsRepository.getStatistics('2026-01-01', '2026-01-31');
console.log(`总新闻数: ${stats.total}`);
```

### SummaryRepository - 每日总结管理

**导入:**
```typescript
import { summaryRepository } from '../src/db/repositories/summary.repository';
```

**方法:**

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `findAll()` | - | `Promise<DailySummary[]>` | 获取所有每日总结 |
| `findById(id: number)` | `id: number` | `Promise<DailySummary \| null>` | 根据ID查找总结 |
| `findByDate(date: string)` | `date: string` | `Promise<DailySummary \| null>` | 根据日期查找总结 |
| `create(data: CreateDailySummary)` | `data: CreateDailySummary` | `Promise<DailySummary>` | 创建每日总结 |
| `update(id: number, data: UpdateDailySummary)` | `id: number`, `data: UpdateDailySummary` | `Promise<DailySummary>` | 更新每日总结 |
| `delete(id: number)` | `id: number` | `Promise<boolean>` | 删除总结 |
| `getLatest(count?)` | `count?: number` | `Promise<DailySummary[]>` | 获取最新总结 |
| `getDateRange(startDate, endDate)` | `startDate: string`, `endDate: string` | `Promise<DailySummary[]>` | 获取日期范围内的总结 |

**类型定义:**
```typescript
interface DailySummary {
  id: number;
  date: string; // YYYY-MM-DD格式
  domestic_hotspots: string[] | null;
  international_hotspots: string[] | null;
  investment_hotspots: string[] | null;
  generated_at: Date;
}

interface CreateDailySummary {
  date: string;
  domestic_hotspots?: string[];
  international_hotspots?: string[];
  investment_hotspots?: string[];
}

interface UpdateDailySummary {
  domestic_hotspots?: string[];
  international_hotspots?: string[];
  investment_hotspots?: string[];
}
```

**示例:**
```typescript
// 创建每日总结
const summary = await summaryRepository.create({
  date: '2026-01-29',
  domestic_hotspots: ['国内热点1', '国内热点2'],
  international_hotspots: ['国际热点1'],
  investment_hotspots: ['投资热点1', '投资热点2']
});

// 获取最近7天的总结
const recentSummaries = await summaryRepository.getLatest(7);

// 查询特定日期总结
const todaySummary = await summaryRepository.findByDate('2026-01-29');
```

### CrawlRepository - 采集日志管理

**导入:**
```typescript
import { crawlRepository } from '../src/db/repositories/crawl.repository';
```

**方法:**

| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `findAll(options?)` | `options?: FindCrawlOptions` | `Promise<CrawlLog[]>` | 获取采集日志 |
| `findById(id: number)` | `id: number` | `Promise<CrawlLog \| null>` | 根据ID查找日志 |
| `findByPlatform(platformId, options?)` | `platformId: number`, `options?: FindCrawlOptions` | `Promise<CrawlLog[]>` | 根据平台查找日志 |
| `create(data: CreateCrawlLog)` | `data: CreateCrawlLog` | `Promise<CrawlLog>` | 创建采集日志 |
| `update(id: number, data: UpdateCrawlLog)` | `id: number`, `data: UpdateCrawlLog` | `Promise<CrawlLog>` | 更新采集日志 |
| `delete(id: number)` | `id: number` | `Promise<boolean>` | 删除日志 |
| `getLatestByPlatform(platformId, count?)` | `platformId: number`, `count?: number` | `Promise<CrawlLog[]>` | 获取平台最新日志 |
| `getStatistics(startDate, endDate)` | `startDate: string`, `endDate: string` | `Promise<CrawlStatistics>` | 获取采集统计 |
| `markAsCompleted(id, itemsCollected)` | `id: number`, `itemsCollected: number` | `Promise<CrawlLog>` | 标记为完成 |
| `markAsFailed(id, errorMessage)` | `id: number`, `errorMessage: string` | `Promise<CrawlLog>` | 标记为失败 |

**类型定义:**
```typescript
interface CrawlLog {
  id: number;
  platform_id: number;
  started_at: Date;
  completed_at: Date | null;
  items_collected: number;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
}

interface CreateCrawlLog {
  platform_id: number;
  items_collected?: number;
  status?: 'running' | 'completed' | 'failed';
  error_message?: string;
}

interface FindCrawlOptions {
  limit?: number;
  offset?: number;
  startDate?: string;
  endDate?: string;
  status?: 'running' | 'completed' | 'failed';
}

interface CrawlStatistics {
  total: number;
  completed: number;
  failed: number;
  running: number;
  averageItems: number;
  byPlatform: Array<{ platform_id: number; platform_name: string; count: number }>;
}
```

**示例:**
```typescript
// 开始采集
const crawlLog = await crawlRepository.create({
  platform_id: 1,
  status: 'running'
});

// 采集完成
await crawlRepository.markAsCompleted(crawlLog.id, 150);

// 采集失败
await crawlRepository.markAsFailed(crawlLog.id, 'API请求超时');

// 获取采集统计
const stats = await crawlRepository.getStatistics('2026-01-01', '2026-01-31');
console.log(`采集成功率: ${(stats.completed / stats.total * 100).toFixed(1)}%`);
```

## 事务管理

### 使用事务

数据库模块支持事务操作，确保数据一致性：

```typescript
import { transactionManager } from '../src/db';

// 方法1: 使用回调函数
await transactionManager.execute(async (db) => {
  const platform = await platformRepository.create({
    name: 'Test Platform'
  }, db);

  await newsRepository.create({
    platform_id: platform.id,
    external_id: 'test_123',
    title: '测试新闻',
    content: '测试内容',
    url: 'https://test.com',
    publish_time: new Date()
  }, db);
});

// 方法2: 手动控制事务
const transaction = await transactionManager.begin();
try {
  // 使用事务连接执行操作
  await platformRepository.create({ name: 'Test' }, transaction.connection);
  await newsRepository.create({ /* ... */ }, transaction.connection);

  await transaction.commit();
} catch (error) {
  await transaction.rollback();
  throw error;
}
```

### 事务隔离级别

SQLite 支持以下事务隔离级别：
- `DEFERRED` (默认)
- `IMMEDIATE`
- `EXCLUSIVE`

```typescript
// 设置事务隔离级别
await transactionManager.execute(
  async (db) => { /* ... */ },
  { isolationLevel: 'IMMEDIATE' }
);
```

## 高级查询

### 复杂查询构建器

```typescript
import { queryBuilder } from '../src/db';

// 构建复杂查询
const query = queryBuilder
  .select('news_items.*', 'platforms.name as platform_name')
  .from('news_items')
  .join('platforms', 'news_items.platform_id = platforms.id')
  .where('news_items.publish_time', '>=', '2026-01-01')
  .where('news_items.views', '>', 1000)
  .orderBy('news_items.publish_time', 'DESC')
  .limit(20);

const results = await query.execute();
```

### 原生SQL查询

```typescript
import { connectionManager } from '../src/db/config/connection';

const db = await connectionManager.getConnection();
try {
  const results = await db.all(`
    SELECT
      n.*,
      p.name as platform_name,
      COUNT(*) OVER() as total_count
    FROM news_items n
    JOIN platforms p ON n.platform_id = p.id
    WHERE n.is_investment_related = ?
    ORDER BY n.publish_time DESC
    LIMIT ? OFFSET ?
  `, [true, 20, 0]);
} finally {
  await db.close();
}
```

## 错误处理

### 自定义错误类型

```typescript
import {
  DatabaseError,
  NotFoundError,
  ValidationError,
  ConstraintError
} from '../src/db/errors';

try {
  const news = await newsRepository.findById(999);
  if (!news) {
    throw new NotFoundError('News item not found', { id: 999 });
  }
} catch (error) {
  if (error instanceof NotFoundError) {
    console.log('未找到数据:', error.message);
  } else if (error instanceof ConstraintError) {
    console.log('约束违反:', error.constraint);
  } else if (error instanceof DatabaseError) {
    console.log('数据库错误:', error.message);
  }
}
```

### 错误恢复策略

```typescript
import { retry } from '../src/db/utils/retry';

// 自动重试
const result = await retry(
  async () => {
    return await newsRepository.create(newsData);
  },
  {
    maxAttempts: 3,
    delay: 1000,
    shouldRetry: (error) => error instanceof DatabaseError
  }
);
```

## 性能优化

### 查询缓存

```typescript
import { queryCache } from '../src/db/optimization/query-cache';

// 启用查询缓存
const cachedNews = await queryCache.get('news:popular:2026-01', async () => {
  return await newsRepository.findAll({
    orderBy: 'views',
    orderDir: 'DESC',
    limit: 10,
    startDate: '2026-01-01',
    endDate: '2026-01-31'
  });
});

// 手动清除缓存
await queryCache.clear('news:popular:*');
```

### 批量操作

```typescript
// 批量插入（性能优化）
await newsRepository.batchCreate(newsItems, {
  batchSize: 100,
  transaction: true
});

// 批量更新
await newsRepository.batchUpdate(updates, {
  where: 'platform_id = ?',
  params: [1]
});
```

## 配置管理

### 环境配置

```typescript
import { configManager } from '../src/db/config';

// 获取配置
const config = configManager.getConfig();
console.log(`数据库路径: ${config.databasePath}`);

// 更新配置
configManager.updateConfig({
  maxConnections: 20,
  timeout: 10000
});
```

### 配置文件

创建 `config/database.yaml`:

```yaml
database:
  databasePath: ./data/everyday_news.db
  maxConnections: 20
  timeout: 10000

backup:
  retentionDays: 7
  compress: true

performance:
  slowQueryThreshold: 1000
  queryCacheEnabled: true
```

## 监控和日志

### 性能监控

```typescript
import { performanceMonitor } from '../src/db/optimization/performance-monitor';

// 启用监控
performanceMonitor.start();

// 获取性能报告
const report = performanceMonitor.getReport();
console.log(`慢查询数量: ${report.slowQueries.length}`);
console.log(`平均查询时间: ${report.avgExecutionTime}ms`);

// 自定义监控点
await performanceMonitor.measure('news-query', async () => {
  return await newsRepository.findAll({ limit: 100 });
});
```

### 查询日志

```typescript
import { queryLogger } from '../src/db/optimization/query-logger';

// 启用详细日志
queryLogger.enableVerbose();

// 获取最近查询
const recentQueries = queryLogger.getRecentQueries(10);
for (const query of recentQueries) {
  console.log(`${query.query} - ${query.executionTime}ms`);
}
```

## 最佳实践

### 1. 连接管理
- 始终在完成后关闭数据库连接
- 使用连接池管理连接
- 设置合理的连接超时时间

### 2. 查询优化
- 使用索引优化查询性能
- 避免 SELECT *，只选择需要的字段
- 使用分页处理大量数据
- 合理使用事务减少锁竞争

### 3. 错误处理
- 始终处理数据库错误
- 使用事务确保数据一致性
- 实现重试机制处理临时错误

### 4. 性能监控
- 监控慢查询并及时优化
- 定期分析索引使用情况
- 设置合理的缓存策略

## 常见问题

### Q1: 如何处理数据库连接失败？
A: 实现重试逻辑，检查连接配置，确保数据库文件可访问。

### Q2: 如何优化大量数据插入？
A: 使用批量插入，启用事务，调整SQLite同步模式。

### Q3: 如何备份和恢复数据？
A: 使用内置备份系统，定期自动备份，支持时间点恢复。

### Q4: 如何迁移数据库结构？
A: 使用迁移系统，版本化管理，支持升级和回滚。

---

*本文档最后更新于 2026-01-29*
*API版本: 1.0.0*