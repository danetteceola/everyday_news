# 系统架构模块 - API 使用文档

## 概述

系统架构模块为每日热点新闻聚合系统提供核心基础设施，包括任务调度、错误处理、监控、通知、Claude集成和配置管理。本文档介绍各模块的API使用方法。

## 模块导入

所有模块都可以通过统一入口导入：

```typescript
import {
  // 调度器
  scheduler,
  Scheduler,

  // 错误处理
  CollectionErrorHandler,
  DatabaseErrorHandler,
  LLMErrorHandler,
  BaseErrorHandler,

  // 监控
  metricsCollector,
  MetricsCollector,

  // 通知系统
  notificationManager,
  NotificationManager,
  TelegramNotificationAdapter,
  EmailNotificationAdapter,
  WebhookNotificationAdapter,

  // Claude集成
  claudeIntegration,
  dailySummaryIntegration,
  ClaudeIntegration,
  DailySummaryIntegration,

  // 配置管理
  configManager,
  ConfigManager,

  // 系统核心
  system,
  System
} from '../src/system';
```

或者按需导入单个模块：

```typescript
import { scheduler } from '../src/system/scheduler';
import { notificationManager } from '../src/system/notification';
import { metricsCollector } from '../src/system/monitoring';
```

## 调度器模块 (Scheduler)

### 核心功能
- 基于cron表达式的定时任务调度
- 任务执行监控和状态跟踪
- 支持并发任务限制和超时控制
- 任务历史记录查询

### 基本使用

#### 1. 创建调度器实例
```typescript
import { scheduler } from '../src/system/scheduler';

// 使用默认单例实例
const schedulerInstance = scheduler;

// 或者创建新的实例
import { Scheduler } from '../src/system/scheduler';
const customScheduler = new Scheduler({
  maxConcurrentTasks: 10,
  taskTimeout: 300000
});
```

#### 2. 添加定时任务
```typescript
// 添加一个定时任务
const taskId = scheduler.addTask({
  id: 'twitter-collection',
  name: 'Twitter数据采集',
  cronExpression: '0,6,12,18 * * * *', // 每6小时
  command: 'npm run collect:twitter',
  enabled: true,
  description: '采集Twitter热点新闻'
});

console.log(`任务已添加，ID: ${taskId}`);
```

#### 3. 管理任务
```typescript
// 暂停任务
scheduler.pauseTask('twitter-collection');

// 恢复任务
scheduler.resumeTask('twitter-collection');

// 移除任务
scheduler.removeTask('twitter-collection');

// 立即执行任务
await scheduler.executeTask('twitter-collection');
```

#### 4. 查询任务状态
```typescript
// 获取所有任务
const allTasks = scheduler.getAllTasks();

// 获取单个任务详情
const task = scheduler.getTask('twitter-collection');

// 获取任务历史记录
const history = scheduler.getTaskHistory('twitter-collection', {
  limit: 10,
  startDate: '2026-01-01',
  endDate: '2026-01-31'
});

// 获取运行中任务
const runningTasks = scheduler.getRunningTasks();
```

#### 5. 事件监听
```typescript
// 监听任务开始事件
scheduler.on('task:started', (taskId, startTime) => {
  console.log(`任务 ${taskId} 开始执行: ${startTime}`);
});

// 监听任务完成事件
scheduler.on('task:completed', (taskId, result, duration) => {
  console.log(`任务 ${taskId} 完成，耗时: ${duration}ms`);
});

// 监听任务失败事件
scheduler.on('task:failed', (taskId, error, duration) => {
  console.error(`任务 ${taskId} 失败:`, error.message);
});

// 监听任务跳过事件（达到并发限制）
scheduler.on('task:skipped', (taskId, reason) => {
  console.log(`任务 ${taskId} 被跳过: ${reason}`);
});
```

### 配置示例

```typescript
// 配置调度器选项
scheduler.setOptions({
  maxConcurrentTasks: 5,        // 最大并发任务数
  taskTimeout: 300000,          // 任务超时时间（毫秒）
  logLevel: 'info',             // 日志级别
  timezone: 'Asia/Shanghai'     // 时区
});

// 从配置文件加载任务
const config = configManager.getSchedulerConfig();
for (const taskConfig of config.tasks) {
  if (taskConfig.enabled) {
    scheduler.addTask(taskConfig);
  }
}
```

### 任务配置接口

```typescript
interface TaskConfig {
  id: string;                    // 唯一标识符
  name: string;                  // 任务名称
  cronExpression: string;        // cron表达式
  command: string;               // 执行的命令
  enabled: boolean;              // 是否启用
  description?: string;          // 任务描述
  maxRetries?: number;           // 最大重试次数（默认：3）
  retryDelay?: number;           // 重试延迟（毫秒，默认：30000）
  timeout?: number;              // 任务超时时间（毫秒）
  env?: Record<string, string>;  // 环境变量
  cwd?: string;                  // 工作目录
}
```

### 高级功能

#### 任务依赖
```typescript
// 设置任务依赖（任务B依赖任务A）
scheduler.setTaskDependency('task-a', 'task-b');

// 检查依赖关系
const dependencies = scheduler.getTaskDependencies('task-b');
```

#### 任务编排
```typescript
// 创建任务组
const taskGroup = scheduler.createTaskGroup('data-collection', [
  'twitter-collection',
  'youtube-collection',
  'tiktok-collection'
]);

// 按顺序执行任务组
await scheduler.executeTaskGroup('data-collection', 'sequential');

// 并行执行任务组
await scheduler.executeTaskGroup('data-collection', 'parallel');
```

#### 性能统计
```typescript
// 获取调度器统计信息
const stats = scheduler.getStats();

console.log(`总任务数: ${stats.totalTasks}`);
console.log(`运行中任务: ${stats.runningTasks}`);
console.log(`平均执行时间: ${stats.avgExecutionTime}ms`);
console.log(`成功率: ${stats.successRate}%`);
```

## 错误处理模块 (Error Handling)

### 核心功能
- 分层的错误处理策略
- 自动重试机制
- 优雅降级功能
- 错误分类和上报

### 错误处理器基类

```typescript
import { BaseErrorHandler } from '../src/system/error-handling';

// 创建自定义错误处理器
class CustomErrorHandler extends BaseErrorHandler {
  constructor(context: Record<string, any>) {
    super(context);
  }

  protected async doHandle(
    operation: () => Promise<any>,
    options?: ErrorHandlerOptions
  ): Promise<any> {
    // 自定义错误处理逻辑
    try {
      return await operation();
    } catch (error) {
      // 记录错误
      this.logError(error);

      // 根据错误类型决定是否重试
      if (this.shouldRetry(error)) {
        return this.retry(operation, options);
      }

      // 执行降级逻辑
      return this.degrade(options?.degradation);
    }
  }

  private shouldRetry(error: Error): boolean {
    // 只重试特定类型的错误
    return error.name === 'NetworkError' || error.name === 'TimeoutError';
  }
}
```

### 内置错误处理器

#### 1. 数据采集错误处理器 (CollectionErrorHandler)
```typescript
import { CollectionErrorHandler } from '../src/system/error-handling';

const collectionHandler = new CollectionErrorHandler({
  operation: 'twitter-collection',
  platform: 'twitter',
  timestamp: new Date()
});

// 处理采集操作
const result = await collectionHandler.handle(
  async () => {
    // 采集逻辑
    return await collectTwitterData();
  },
  {
    maxRetries: 3,
    retryDelay: 30000, // 30秒
    degradation: () => ({}) // 降级为返回空对象
  }
);
```

#### 2. 数据库错误处理器 (DatabaseErrorHandler)
```typescript
import { DatabaseErrorHandler } from '../src/system/error-handling';

const dbHandler = new DatabaseErrorHandler({
  operation: 'save-news',
  table: 'news_items',
  timestamp: new Date()
});

// 处理数据库操作
const savedNews = await dbHandler.handle(
  async () => {
    return await newsRepository.create(newsData);
  },
  {
    maxRetries: 2,
    retryDelay: 5000,
    degradation: () => {
      // 降级为写入本地文件
      return writeToLocalFile(newsData);
    }
  }
);
```

#### 3. LLM API错误处理器 (LLMErrorHandler)
```typescript
import { LLMErrorHandler } from '../src/system/error-handling';

const llmHandler = new LLMErrorHandler({
  operation: 'generate-summary',
  model: 'claude-3-5-sonnet',
  timestamp: new Date()
});

// 处理LLM调用
const summary = await llmHandler.handle(
  async () => {
    return await claudeIntegration.executeLLM(prompt);
  },
  {
    maxRetries: 3,
    retryDelay: 60000, // 1分钟
    degradation: () => {
      // 降级为模板生成
      return generateTemplateSummary(newsData);
    }
  }
);
```

### 错误处理选项

```typescript
interface ErrorHandlerOptions {
  maxRetries?: number;           // 最大重试次数（默认：3）
  retryDelay?: number;           // 重试延迟（毫秒，默认：30000）
  retryBackoff?: boolean;        // 是否使用退避策略（默认：true）
  degradation?: () => any;       // 降级函数
  timeout?: number;              // 超时时间（毫秒）
  context?: Record<string, any>; // 额外上下文
}
```

### 错误监控和上报

```typescript
// 监听错误事件
collectionHandler.on('error:retry', (error, attempt, delay) => {
  console.log(`第${attempt}次重试，延迟${delay}ms:`, error.message);
});

collectionHandler.on('error:degraded', (error, result) => {
  console.log('服务降级，使用备选方案:', result);
});

collectionHandler.on('error:failed', (error) => {
  console.error('所有重试失败:', error);
  // 上报到监控系统
  metricsCollector.record({
    name: 'error_total',
    value: 1,
    tags: { type: 'collection', fatal: true }
  });
});
```

### 错误统计

```typescript
// 获取错误统计
const errorStats = collectionHandler.getStats();

console.log(`总错误数: ${errorStats.totalErrors}`);
console.log(`重试次数: ${errorStats.totalRetries}`);
console.log(`降级次数: ${errorStats.totalDegradations}`);
console.log(`成功率: ${errorStats.successRate}%`);
```

## 监控指标模块 (Monitoring)

### 核心功能
- 自定义指标收集和存储
- 系统健康检查
- 性能监控和告警
- 数据可视化和查询

### 基本使用

#### 1. 记录指标
```typescript
import { metricsCollector } from '../src/system/monitoring';

// 记录简单指标
metricsCollector.record({
  name: 'collection_success',
  value: 1,
  tags: { platform: 'twitter', type: 'hotspot' }
});

// 记录耗时指标
metricsCollector.record({
  name: 'collection_duration',
  value: 2350, // 毫秒
  tags: { platform: 'twitter' }
});

// 记录带时间戳的指标
metricsCollector.record({
  name: 'news_count',
  value: 150,
  timestamp: new Date('2026-01-30T10:00:00Z'),
  tags: { date: '2026-01-30' }
});
```

#### 2. 查询指标
```typescript
// 查询最新指标
const recentMetrics = await metricsCollector.query({
  name: 'collection_success',
  limit: 10,
  order: 'desc'
});

// 查询时间范围内的指标
const timeRangeMetrics = await metricsCollector.query({
  name: 'collection_duration',
  startTime: '2026-01-01T00:00:00Z',
  endTime: '2026-01-31T23:59:59Z',
  aggregation: 'avg' // 支持：sum, avg, min, max, count
});

// 按标签过滤
const filteredMetrics = await metricsCollector.query({
  name: 'collection_success',
  tags: { platform: 'twitter' },
  startTime: '2026-01-30T00:00:00Z'
});
```

#### 3. 系统健康检查
```typescript
// 执行健康检查
const health = await metricsCollector.healthCheck();

console.log(`系统健康: ${health.healthy}`);
console.log('检查结果:', health.checks);
/*
{
  healthy: true,
  checks: {
    database: true,
    storage: true,
    recent_activity: true,
    error_rate: false
  },
  message: '系统运行正常'
}
*/
```

#### 4. 性能监控
```typescript
// 监控函数执行时间
const result = await metricsCollector.measure(
  'generate_summary',
  async () => {
    return await dailySummaryIntegration.generateSummary(newsData, date);
  },
  { tags: { date: '2026-01-30' } }
);

// 获取性能报告
const performanceReport = metricsCollector.getPerformanceReport({
  startTime: '2026-01-01T00:00:00Z',
  endTime: '2026-01-31T23:59:59Z'
});

console.log('平均响应时间:', performanceReport.avgResponseTime);
console.log('P95响应时间:', performanceReport.p95ResponseTime);
console.log('请求成功率:', performanceReport.successRate);
```

### 指标类型

```typescript
interface Metric {
  name: string;                    // 指标名称
  value: number;                   // 指标值
  timestamp?: Date;                // 时间戳（默认：当前时间）
  tags?: Record<string, string>;   // 标签
  metadata?: Record<string, any>;  // 元数据
}

// 预定义指标
const PREDEFINED_METRICS = {
  // 采集指标
  COLLECTION_SUCCESS: 'collection_success',
  COLLECTION_DURATION: 'collection_duration',
  COLLECTION_COUNT: 'collection_count',

  // 数据指标
  NEWS_COUNT: 'news_count',
  SUMMARY_COUNT: 'summary_count',

  // 性能指标
  RESPONSE_TIME: 'response_time',
  MEMORY_USAGE: 'memory_usage',
  CPU_USAGE: 'cpu_usage',

  // 错误指标
  ERROR_TOTAL: 'error_total',
  ERROR_RATE: 'error_rate',

  // 系统指标
  SYSTEM_STARTUP: 'system_startup',
  SYSTEM_SHUTDOWN: 'system_shutdown',
  HEALTH_CHECK: 'health_check'
};
```

### 告警配置

```typescript
// 配置告警规则
metricsCollector.configureAlert({
  metricName: 'collection_success_rate',
  threshold: 80, // 成功率低于80%触发告警
  operator: '<',
  window: '5m', // 5分钟窗口
  cooldown: '30m', // 30分钟冷却时间
  actions: [
    {
      type: 'notification',
      channel: 'telegram',
      message: '采集成功率低于阈值: {value}%'
    },
    {
      type: 'webhook',
      url: 'https://alert.example.com/webhook',
      payload: {
        severity: 'warning',
        metric: '{metric}',
        value: '{value}'
      }
    }
  ]
});

// 手动触发告警
metricsCollector.triggerAlert('collection_success_rate', {
  currentValue: 75,
  threshold: 80,
  timestamp: new Date()
});
```

### 数据导出

```typescript
// 导出指标数据
const exportData = await metricsCollector.export({
  format: 'json', // 支持：json, csv, prometheus
  startTime: '2026-01-01T00:00:00Z',
  endTime: '2026-01-31T23:59:59Z',
  metrics: ['collection_success', 'collection_duration']
});

// 保存到文件
await fs.writeFile('metrics_export.json', JSON.stringify(exportData, null, 2));

// 推送到外部监控系统
await metricsCollector.pushToExternalSystem({
  system: 'prometheus',
  endpoint: 'http://prometheus:9090/api/v1/import',
  data: exportData
});
```

## 通知系统模块 (Notification)

### 核心功能
- 多通道通知发送（Telegram, Email, Webhook）
- 通知模板系统
- 失败处理和降级机制
- 通知历史记录和状态跟踪

### 基本使用

#### 1. 发送通知
```typescript
import { notificationManager } from '../src/system/notification';

// 发送简单通知
const results = await notificationManager.send({
  title: '数据采集完成',
  content: 'Twitter数据采集已完成，共收集150条新闻。',
  priority: 'medium' // low, medium, high, critical
});

// 检查发送结果
for (const result of results) {
  if (result.success) {
    console.log(`通过 ${result.channel} 发送成功: ${result.messageId}`);
  } else {
    console.error(`通过 ${result.channel} 发送失败:`, result.error);
  }
}

// 发送带模板的通知
const templateResult = await notificationManager.sendWithTemplate(
  'collection_complete',
  {
    platform: 'Twitter',
    count: 150,
    duration: '2分30秒',
    successRate: '95%'
  },
  {
    priority: 'high',
    channels: ['telegram', 'email'] // 指定发送通道
  }
);
```

#### 2. 管理通知通道
```typescript
// 检查可用通道
const availableChannels = await notificationManager.getAvailableAdapters();
console.log('可用通知通道:', availableChannels);

// 启用/禁用通道
notificationManager.enableChannel('telegram', true);
notificationManager.enableChannel('email', false);

// 配置通道优先级
notificationManager.setChannelPriority(['telegram', 'email', 'webhook']);

// 测试通道连接
const testResults = await notificationManager.testChannels();
for (const result of testResults) {
  console.log(`${result.channel}: ${result.available ? '可用' : '不可用'}`);
}
```

#### 3. 通知模板
```typescript
// 定义通知模板
notificationManager.defineTemplate('collection_complete', {
  subject: '{platform}数据采集完成通知',
  content: `
{platform}数据采集已完成！

📊 采集统计:
• 采集数量: {count}条
• 采集耗时: {duration}
• 成功率: {successRate}

⏰ 采集时间: {timestamp}
  `,
  channels: ['telegram', 'email'],
  priority: 'medium'
});

// 使用模板发送通知
await notificationManager.sendWithTemplate('collection_complete', {
  platform: 'Twitter',
  count: 150,
  duration: '2分30秒',
  successRate: '95%',
  timestamp: new Date().toLocaleString()
});
```

#### 4. 历史记录查询
```typescript
// 查询通知历史
const history = await notificationManager.getHistory({
  limit: 20,
  offset: 0,
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  channels: ['telegram', 'email'],
  status: 'success' // success, failed, pending
});

// 按通道查询历史
const telegramHistory = await notificationManager.getHistoryByChannel('telegram', {
  limit: 10,
  startDate: '2026-01-30'
});

// 计算成功率
const successRate = await notificationManager.getSuccessRate({
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  channel: 'telegram'
});

console.log(`Telegram通知成功率: ${successRate}%`);

// 清理历史记录
await notificationManager.clearHistory({
  olderThan: '30d' // 清理30天前的记录
});
```

### 自定义通知适配器

```typescript
import { BaseNotificationAdapter } from '../src/system/notification';

// 创建自定义适配器
class CustomNotificationAdapter extends BaseNotificationAdapter {
  name = 'custom';

  async isAvailable(): Promise<boolean> {
    // 检查服务是否可用
    return true;
  }

  protected async doSend(message: NotificationMessage): Promise<{ messageId?: string }> {
    // 实现发送逻辑
    const response = await fetch('https://custom-notification-service.com/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: message.title,
        content: message.content,
        priority: message.priority
      })
    });

    if (!response.ok) {
      throw new Error(`发送失败: ${response.statusText}`);
    }

    const data = await response.json();
    return { messageId: data.id };
  }
}

// 注册自定义适配器
const customAdapter = new CustomNotificationAdapter();
notificationManager.addAdapter(customAdapter);
```

### 通知配置

```typescript
// 全局配置
notificationManager.setOptions({
  maxRetries: 3,
  retryDelay: 5000,
  timeout: 30000,
  fallbackEnabled: true,
  fallbackOrder: ['telegram', 'email', 'webhook']
});

// 通道特定配置
notificationManager.configureChannel('telegram', {
  enabled: true,
  botToken: process.env.TELEGRAM_BOT_TOKEN,
  chatId: process.env.TELEGRAM_CHAT_ID,
  parseMode: 'HTML',
  disableNotification: false
});

notificationManager.configureChannel('email', {
  enabled: true,
  smtpHost: process.env.SMTP_HOST,
  smtpPort: parseInt(process.env.SMTP_PORT || '587'),
  smtpUser: process.env.SMTP_USER,
  smtpPass: process.env.SMTP_PASS,
  smtpSecure: true,
  from: 'news@example.com',
  recipient: process.env.EMAIL_RECIPIENT
});

notificationManager.configureChannel('webhook', {
  enabled: false,
  url: process.env.WEBHOOK_URL,
  secret: process.env.WEBHOOK_SECRET,
  timeout: 10000
});
```

## Claude集成模块 (Claude Integration)

### 核心功能
- Claude LLM API调用封装
- 提示词模板管理
- 响应缓存和重试机制
- 使用量统计和成本跟踪

### 基本使用

#### 1. 执行LLM调用
```typescript
import { claudeIntegration } from '../src/system/claude-integration';

// 简单调用
const response = await claudeIntegration.executeLLM({
  prompt: '请总结以下新闻内容...',
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.7,
  maxTokens: 1000
});

console.log('LLM响应:', response);

// 使用模板
const summary = await claudeIntegration.executeWithTemplate(
  'daily_summary',
  {
    newsData: '...新闻数据...',
    date: '2026-01-30'
  },
  {
    model: 'claude-3-5-sonnet-20241022',
    temperature: 0.7
  }
);
```

#### 2. 每日总结集成
```typescript
import { dailySummaryIntegration } from '../src/system/claude-integration';

// 生成每日总结
const summary = await dailySummaryIntegration.generateSummary(
  newsData,  // 新闻数据
  '2026-01-30',  // 日期
  {
    format: 'markdown',  // 输出格式：markdown, html, plain
    language: 'zh-CN',   // 语言
    length: 'medium'     // 长度：short, medium, long
  }
);

// 批量生成总结
const batchSummaries = await dailySummaryIntegration.batchGenerate(
  newsDataArray,
  datesArray,
  {
    concurrent: 2,  // 并发数
    delay: 1000     // 请求间隔
  }
);
```

#### 3. 缓存管理
```typescript
// 检查缓存
const cachedResponse = await claudeIntegration.getCachedResponse(
  'daily_summary',
  { newsData: '...', date: '2026-01-30' }
);

if (cachedResponse) {
  console.log('使用缓存响应');
} else {
  console.log('未找到缓存，执行LLM调用');
}

// 手动缓存响应
await claudeIntegration.cacheResponse(
  'daily_summary',
  { newsData: '...', date: '2026-01-30' },
  response,
  3600000  // TTL：1小时
);

// 清理缓存
await claudeIntegration.clearCache();
await claudeIntegration.clearCacheByPattern('daily_summary:*');
```

#### 4. 使用量统计
```typescript
// 获取使用统计
const usageStats = claudeIntegration.getUsageStats({
  startDate: '2026-01-01',
  endDate: '2026-01-31',
  model: 'claude-3-5-sonnet-20241022'
});

console.log(`总调用次数: ${usageStats.totalCalls}`);
console.log(`总token数: ${usageStats.totalTokens}`);
console.log(`估计成本: $${usageStats.estimatedCost}`);

// 实时监控
claudeIntegration.on('llm:called', (stats) => {
  console.log(`LLM调用: ${stats.model}, tokens: ${stats.tokens}`);
});

claudeIntegration.on('llm:cached', (key) => {
  console.log(`缓存命中: ${key}`);
});

// 重置统计
claudeIntegration.clearUsageStats();
```

### 提示词模板管理

```typescript
// 定义模板
claudeIntegration.defineTemplate('daily_summary', `
请为以下{date}的新闻数据生成每日总结：

{newsData}

要求：
1. 按重要性排序，最重要的新闻放在前面
2. 每个新闻提供简要说明
3. 突出关键事件和趋势
4. 字数限制在500字以内
5. 使用清晰的结构和标题

请用中文回答。
`);

// 使用模板
const prompt = claudeIntegration.renderTemplate('daily_summary', {
  date: '2026年1月30日',
  newsData: '...新闻数据...'
});

// 获取所有模板
const templates = claudeIntegration.getTemplates();

// 更新模板
claudeIntegration.updateTemplate('daily_summary', newTemplate);

// 删除模板
claudeIntegration.deleteTemplate('daily_summary');
```

### 高级功能

#### 流式响应
```typescript
// 流式处理LLM响应
const stream = await claudeIntegration.executeLLMStream({
  prompt: '长篇内容生成...',
  model: 'claude-3-5-sonnet-20241022',
  temperature: 0.7,
  maxTokens: 4000
});

for await (const chunk of stream) {
  process.stdout.write(chunk);
  // 实时处理每个chunk
}

const fullResponse = await stream.getFullResponse();
```

#### 函数调用
```typescript
// 定义函数
const functions = [
  {
    name: 'extract_news_info',
    description: '从新闻内容中提取结构化信息',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '新闻标题' },
        category: { type: 'string', description: '新闻分类' },
        sentiment: { type: 'string', description: '情感倾向' },
        keyPoints: { type: 'array', items: { type: 'string' } }
      },
      required: ['title', 'category']
    }
  }
];

// 执行函数调用
const result = await claudeIntegration.executeWithFunctions({
  prompt: '请分析以下新闻内容并提取信息...',
  functions,
  model: 'claude-3-5-sonnet-20241022'
});

if (result.functionCall) {
  console.log('函数调用:', result.functionCall.name);
  console.log('参数:', result.functionCall.arguments);
}
```

#### 多模型支持
```typescript
// 根据内容自动选择模型
const autoResponse = await claudeIntegration.executeWithAutoModel({
  prompt: '复杂分析任务...',
  context: {
    complexity: 'high',
    length: 'long',
    language: 'zh-CN'
  }
});

// 手动选择模型
const modelResponse = await claudeIntegration.executeWithModelSelection(
  '复杂分析任务...',
  {
    candidates: [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-haiku-20240307'
    ],
    selectionCriteria: 'accuracy' // accuracy, speed, cost
  }
);
```

## 配置管理模块 (Configuration)

### 核心功能
- 统一配置管理架构
- 环境变量和配置文件支持
- 配置验证和类型安全
- 热重载和版本管理

### 基本使用

#### 1. 获取配置
```typescript
import { configManager } from '../src/system/config';

// 获取完整配置
const config = configManager.getConfig();

// 获取模块配置
const schedulerConfig = configManager.getSchedulerConfig();
const notificationConfig = configManager.getNotificationConfig();
const monitoringConfig = configManager.getMonitoringConfig();
const llmConfig = configManager.getLLMConfig();

// 获取环境变量
const env = configManager.getEnvironment();
const isProduction = env === 'production';
const isDevelopment = env === 'development';
```

#### 2. 更新配置
```typescript
// 更新配置
configManager.updateConfig({
  environment: 'staging',
  logLevel: 'debug',
  scheduler: {
    maxConcurrentTasks: 10,
    taskTimeout: 600000
  }
});

// 热重载配置
await configManager.reload();

// 重置为默认配置
configManager.reset();
```

#### 3. 配置验证
```typescript
// 验证配置
const errors = configManager.validate();

if (errors.length > 0) {
  console.error('配置验证失败:');
  errors.forEach(error => console.error(`  - ${error}`));
} else {
  console.log('配置验证通过');
}

// 检查特定配置项
const isValid = configManager.validateSection('scheduler');
const llmErrors = configManager.validateSection('llm');
```

#### 4. 配置监听
```typescript
// 监听配置变化
configManager.on('config:changed', (changes) => {
  console.log('配置已更新:', changes);
  // 重新初始化受影响的模块
});

configManager.on('config:reloaded', () => {
  console.log('配置已重新加载');
});

configManager.on('config:error', (error) => {
  console.error('配置错误:', error);
});
```

### 配置结构

```typescript
// 完整配置结构
interface SystemConfig {
  // 基础配置
  environment: 'development' | 'staging' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';

  // 调度器配置
  scheduler: {
    maxConcurrentTasks: number;
    taskTimeout: number;
    logLevel: string;
    tasks: TaskConfig[];
  };

  // 通知系统配置
  notification: {
    telegram?: TelegramConfig;
    email?: EmailConfig;
    webhook?: WebhookConfig;
  };

  // 监控配置
  monitoring: {
    collectionInterval: number;
    alertThresholds: {
      collectionSuccessRate: number;
      dataCompleteness: number;
      performance: number;
    };
  };

  // LLM配置
  llm: {
    defaultModel: string;
    defaultTemperature: number;
    apiKey?: string;
    maxRetries: number;
    retryDelay: number;
    cacheTtl: number;
  };
}
```

### 环境特定配置

```typescript
// 加载环境特定配置
const envConfig = configManager.getEnvironmentConfig();

// 检查当前环境
if (configManager.isDevelopment()) {
  // 开发环境特定逻辑
  console.log('运行在开发环境');
} else if (configManager.isProduction()) {
  // 生产环境特定逻辑
  console.log('运行在生产环境');
}

// 获取环境变量覆盖
const overrides = configManager.getEnvironmentOverrides();
console.log('环境变量覆盖:', overrides);
```

### 配置工具

```typescript
// 导出配置
const exportedConfig = configManager.export({
  format: 'json', // json, yaml, env
  includeSensitive: false // 是否包含敏感信息
});

// 导入配置
await configManager.import(exportedConfig, {
  validate: true,
  backup: true
});

// 比较配置差异
const diff = configManager.diff(currentConfig, newConfig);

// 配置版本管理
const version = configManager.getVersion();
const history = configManager.getHistory();
const previousConfig = configManager.getVersionConfig('1.0.0');
```

## 系统核心模块 (System)

### 核心功能
- 统一系统初始化和生命周期管理
- 组件集成和依赖注入
- 系统健康检查和监控
- 全局错误处理和恢复

### 基本使用

#### 1. 系统实例
```typescript
import { system, System } from '../src/system';

// 使用默认单例实例
const sys = system;

// 或者获取单例实例
const sys2 = System.getInstance();
console.log(sys === sys2); // true

// 创建独立实例（测试用途）
const independentSys = new System();
```

#### 2. 系统生命周期
```typescript
// 启动系统
await system.start();
console.log('系统已启动:', system.isRunning());

// 检查系统健康
const health = await system.getHealth();
console.log('系统健康状态:', health.healthy);
console.log('组件状态:', health.components);

// 发送系统通知
await system.sendNotification(
  '系统启动完成',
  '所有组件已成功初始化并启动。',
  'info'
);

// 停止系统
await system.stop();
console.log('系统已停止:', system.isRunning());
```

#### 3. 组件访问
```typescript
// 访问系统组件
const scheduler = system.scheduler;
const notification = system.notification;
const monitoring = system.monitoring;
const config = system.config;
const claude = system.claude;
const dailySummary = system.dailySummary;

// 访问错误处理器
const collectionHandler = system.collectionErrorHandler;
const dbHandler = system.databaseErrorHandler;
const llmHandler = system.llmErrorHandler;

// 使用组件
await system.scheduler.addTask(taskConfig);
await system.notification.send(notificationMessage);
await system.monitoring.record(metric);
const summary = await system.dailySummary.generateSummary(newsData, date);
```

#### 4. 系统事件
```typescript
// 监听系统事件（通过组件）
system.scheduler.on('task:completed', (taskId, result) => {
  console.log(`任务完成: ${taskId}`);
  // 发送通知
  system.sendNotification(
    '任务完成',
    `任务 ${taskId} 已完成执行。`,
    'low'
  ).catch(console.error);
});

system.monitoring.on('alert:triggered', (alert) => {
  console.log(`告警触发: ${alert.metricName} = ${alert.currentValue}`);
  // 发送紧急通知
  system.sendNotification(
    '系统告警',
    `指标 ${alert.metricName} 触发告警: ${alert.currentValue}`,
    'critical'
  ).catch(console.error);
});

// 系统级别事件
system.on('system:started', () => {
  console.log('系统启动事件');
});

system.on('system:stopped', () => {
  console.log('系统停止事件');
});

system.on('system:error', (error) => {
  console.error('系统错误:', error);
});
```

### 系统配置

```typescript
// 系统启动配置
await system.start({
  // 启动选项
  initializeDatabase: true,
  loadConfiguration: true,
  startScheduler: true,
  enableMonitoring: true,

  // 组件特定配置
  scheduler: {
    maxConcurrentTasks: 5,
    taskTimeout: 300000
  },

  notification: {
    enabledChannels: ['telegram', 'email'],
    testOnStartup: true
  },

  monitoring: {
    collectionInterval: 60000,
    enableAlerts: true
  },

  claude: {
    enableCache: true,
    testConnection: true
  }
});
```

### 系统工具

```typescript
// 系统信息
const systemInfo = system.getSystemInfo();
console.log('系统版本:', systemInfo.version);
console.log('启动时间:', systemInfo.startTime);
console.log('运行时长:', systemInfo.uptime);
console.log('组件状态:', systemInfo.components);

// 系统诊断
const diagnosis = await system.diagnose();
if (diagnosis.healthy) {
  console.log('系统诊断通过');
} else {
  console.log('系统诊断发现问题:');
  diagnosis.issues.forEach(issue => {
    console.log(`  - ${issue.component}: ${issue.message}`);
  });
}

// 系统维护
await system.maintenance({
  cleanup: true,      // 清理临时文件
  backup: true,       // 备份数据
  optimize: true,     // 优化数据库
  validate: true      // 验证配置
});

// 系统重置（谨慎使用）
await system.reset({
  keepData: true,     // 保留数据
  keepConfig: false,  // 重置配置
  reinitialize: true  // 重新初始化
});
```

## 集成示例

### 完整工作流程
```typescript
import { system } from '../src/system';

async function dailyNewsWorkflow() {
  try {
    // 1. 启动系统
    await system.start();
    console.log('系统启动完成');

    // 2. 检查系统健康
    const health = await system.getHealth();
    if (!health.healthy) {
      throw new Error('系统健康检查失败');
    }

    // 3. 执行数据采集任务
    await system.scheduler.executeTask('twitter-collection');
    await system.scheduler.executeTask('youtube-collection');

    // 4. 监控采集过程
    system.monitoring.on('metric:recorded', (metric) => {
      if (metric.name === 'collection_success') {
        console.log(`采集成功: ${metric.value}`);
      }
    });

    // 5. 等待采集完成，生成每日总结
    setTimeout(async () => {
      const newsData = await fetchNewsData(); // 获取采集的新闻数据
      const summary = await system.dailySummary.generateSummary(
        newsData,
        new Date().toISOString().split('T')[0]
      );

      // 6. 发送总结通知
      await system.sendNotification(
        '每日新闻总结',
        summary,
        'high'
      );

      console.log('每日工作流程完成');
    }, 300000); // 等待5分钟

  } catch (error) {
    // 7. 错误处理
    console.error('工作流程失败:', error);

    // 使用系统错误处理器
    await system.collectionErrorHandler.handle(
      () => { throw error; },
      {
        maxRetries: 3,
        degradation: () => {
          // 降级方案
          return sendFallbackNotification();
        }
      }
    );

    // 发送错误通知
    await system.sendNotification(
      '系统错误',
      `工作流程执行失败: ${error.message}`,
      'critical'
    );
  }
}

// 启动工作流程
dailyNewsWorkflow();
```

### 定时任务配置
```typescript
import { system } from '../src/system';

// 配置定时任务
system.scheduler.addTask({
  id: 'daily-summary-generation',
  name: '每日总结生成',
  cronExpression: '0 2 * * *', // 每天凌晨2点
  command: 'npm run generate:daily-summary',
  enabled: true,
  description: '自动生成每日新闻总结'
});

// 任务执行处理程序
system.scheduler.on('task:started', (taskId) => {
  console.log(`任务开始: ${taskId}`);

  if (taskId === 'daily-summary-generation') {
    // 记录监控指标
    system.monitoring.record({
      name: 'daily_summary_started',
      value: 1,
      tags: { task: taskId }
    });
  }
});

system.scheduler.on('task:completed', (taskId, result) => {
  console.log(`任务完成: ${taskId}`);

  if (taskId === 'daily-summary-generation') {
    // 发送完成通知
    system.sendNotification(
      '每日总结生成完成',
      `每日新闻总结已生成: ${result}`,
      'medium'
    ).catch(console.error);
  }
});
```

## 最佳实践

### 1. 错误处理策略
- 使用适当的错误处理器（CollectionErrorHandler, DatabaseErrorHandler, LLMErrorHandler）
- 配置合理的重试次数和延迟
- 实现优雅降级方案
- 记录错误到监控系统

### 2. 监控和告警
- 定义关键业务指标（采集成功率、响应时间、错误率）
- 设置合理的告警阈值
- 配置多通道告警通知
- 定期审查监控数据

### 3. 配置管理
- 使用环境变量管理敏感信息
- 为不同环境创建配置模板
- 定期验证配置有效性
- 实现配置版本管理

### 4. 性能优化
- 使用缓存减少重复LLM调用
- 合理配置调度器并发数
- 监控系统资源使用情况
- 定期进行性能测试

### 5. 安全考虑
- 保护API密钥和敏感配置
- 实施访问控制和身份验证
- 加密敏感数据传输
- 定期安全审计

## 故障排除

### 常见问题

#### 1. 调度器任务不执行
**可能原因**: cron表达式错误、时区设置不正确、任务被禁用
**解决方案**:
```typescript
// 检查任务配置
const task = system.scheduler.getTask('task-id');
console.log('任务配置:', task);

// 测试cron表达式
const nextRuns = system.scheduler.getNextRuns('task-id', 5);
console.log('下次执行时间:', nextRuns);

// 手动执行测试
await system.scheduler.executeTask('task-id');
```

#### 2. 通知发送失败
**可能原因**: 通道配置错误、网络问题、服务不可用
**解决方案**:
```typescript
// 测试通道可用性
const available = await system.notification.getAvailableAdapters();
console.log('可用通道:', available);

// 检查通道配置
const config = system.config.getNotificationConfig();
console.log('通知配置:', config);

// 查看发送历史
const history = await system.notification.getHistory({
  limit: 10,
  status: 'failed'
});
console.log('失败记录:', history);
```

#### 3. LLM调用超时或失败
**可能原因**: API密钥无效、网络问题、token超限
**解决方案**:
```typescript
// 检查API配置
const llmConfig = system.config.getLLMConfig();
console.log('LLM配置:', llmConfig);

// 测试连接
const testResult = await system.claude.testConnection();
console.log('连接测试:', testResult);

// 查看使用统计
const usage = system.claude.getUsageStats();
console.log('使用统计:', usage);
```

#### 4. 监控指标不更新
**可能原因**: 收集器未启动、存储问题、配置错误
**解决方案**:
```typescript
// 检查监控配置
const monitoringConfig = system.config.getMonitoringConfig();
console.log('监控配置:', monitoringConfig);

// 手动记录测试指标
system.monitoring.record({
  name: 'test_metric',
  value: 1,
  tags: { test: 'diagnostic' }
});

// 查询测试指标
const metrics = await system.monitoring.query({
  name: 'test_metric',
  limit: 1
});
console.log('测试指标:', metrics);
```

## 扩展开发

### 自定义组件
```typescript
// 创建自定义监控器
class CustomMonitor {
  constructor(private system: System) {}

  async start() {
    // 监听系统事件
    this.system.scheduler.on('task:completed', this.onTaskCompleted.bind(this));
    this.system.monitoring.on('alert:triggered', this.onAlertTriggered.bind(this));
  }

  private onTaskCompleted(taskId: string, result: any) {
    // 自定义处理逻辑
    this.system.monitoring.record({
      name: 'custom_task_completed',
      value: 1,
      tags: { task: taskId }
    });
  }

  private onAlertTriggered(alert: any) {
    // 自定义告警处理
    console.log('自定义告警处理:', alert);
  }
}

// 集成到系统
const customMonitor = new CustomMonitor(system);
await customMonitor.start();
```

### 插件系统
```typescript
// 定义插件接口
interface SystemPlugin {
  name: string;
  version: string;
  initialize(system: System): Promise<void>;
  cleanup?(): Promise<void>;
}

// 创建插件
class AnalyticsPlugin implements SystemPlugin {
  name = 'analytics';
  version = '1.0.0';

  async initialize(system: System) {
    // 集成到系统
    system.on('system:started', this.onSystemStarted.bind(this));
    system.scheduler.on('task:completed', this.onTaskCompleted.bind(this));
  }

  private onSystemStarted() {
    console.log('Analytics插件已启动');
  }

  private onTaskCompleted(taskId: string) {
    // 收集分析数据
    console.log(`任务分析: ${taskId}`);
  }

  async cleanup() {
    console.log('清理Analytics插件');
  }
}

// 注册插件
const plugin = new AnalyticsPlugin();
await plugin.initialize(system);
```

---

*本文档最后更新于 2026-01-30*
*API版本: 1.0.0*
*系统架构模块版本: 1.0.0*

更多信息请参考:
- [安装指南](./installation.md)
- [配置指南](./configuration.md)
- [数据库API文档](./database/api.md)