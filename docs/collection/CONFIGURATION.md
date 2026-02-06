# 数据采集模块配置指南

## 目录

1. [配置文件结构](#配置文件结构)
2. [配置管理方式](#配置管理方式)
3. [系统配置](#系统配置)
4. [平台配置](#平台配置)
5. [反爬配置](#反爬配置)
6. [调度配置](#调度配置)
7. [数据清洗配置](#数据清洗配置)
8. [监控配置](#监控配置)
9. [环境变量配置](#环境变量配置)
10. [配置验证](#配置验证)
11. [配置最佳实践](#配置最佳实践)

## 配置文件结构

数据采集模块使用分层配置系统：

```
config/
├── collection.config.ts          # TypeScript配置定义
├── collection.config.json        # 主配置文件（生产环境）
├── collection.config.dev.json    # 开发环境配置
├── collection.config.test.json   # 测试环境配置
└── collection.config.example.json # 配置示例
```

### 配置加载顺序

1. 默认配置（代码中定义）
2. 配置文件（`collection.config.json`）
3. 环境变量
4. 命令行参数

## 配置管理方式

### 1. 配置文件方式

**主配置文件**: `config/collection.config.json`

```json
{
  "system": { ... },
  "platforms": [ ... ],
  "antiCrawling": { ... },
  "taskScheduling": { ... },
  "dataCleaning": { ... },
  "monitoring": { ... }
}
```

### 2. 环境变量方式

```bash
# 基础配置
export LOG_LEVEL=debug
export MAX_CONCURRENT_COLLECTIONS=5

# 平台配置
export TWITTER_ENABLED=true
export TWITTER_SCHEDULE="0 */2 * * *"

# 反爬配置
export ENABLE_ANTI_CRAWLING=true
export REQUEST_MIN_DELAY=2000
```

### 3. 命令行参数方式

```bash
# 启动服务时指定配置
node collection-service.js start --log-level debug --max-concurrent 5

# 手动采集时指定平台
node collection-service.js collect twitter --max-items 50
```

### 4. 配置管理器API

```typescript
import { configManager } from '../src/collection/config-manager';

// 加载配置
await configManager.loadConfig();

// 获取配置
const config = configManager.getConfig();

// 更新配置
configManager.updateConfig({
  system: {
    logLevel: 'debug'
  }
});

// 保存配置
await configManager.saveConfig();
```

## 系统配置

### 完整配置示例

```json
{
  "system": {
    "debug": false,
    "logLevel": "info",
    "maxConcurrentCollections": 3,
    "maxItemsPerCollection": 100,
    "requestTimeout": 30000,
    "maxRetryAttempts": 3,
    "cache": {
      "enabled": true,
      "ttl": 3600000,
      "maxSize": 1000
    },
    "storage": {
      "type": "sqlite",
      "path": "./data/collection.db",
      "backup": {
        "enabled": true,
        "interval": 86400000,
        "retentionDays": 7
      }
    },
    "performance": {
      "enableCompression": true,
      "batchSize": 50,
      "enableStreaming": false
    }
  }
}
```

### 配置项说明

#### 基础配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `debug` | boolean | `false` | 调试模式，启用详细日志 |
| `logLevel` | string | `"info"` | 日志级别：debug/info/warn/error |
| `maxConcurrentCollections` | number | `3` | 最大并发采集任务数 |
| `maxItemsPerCollection` | number | `100` | 每次采集最大项目数 |
| `requestTimeout` | number | `30000` | HTTP请求超时时间（毫秒） |
| `maxRetryAttempts` | number | `3` | 最大重试次数 |

#### 缓存配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `cache.enabled` | boolean | `true` | 启用缓存 |
| `cache.ttl` | number | `3600000` | 缓存存活时间（毫秒） |
| `cache.maxSize` | number | `1000` | 缓存最大条目数 |

#### 存储配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `storage.type` | string | `"sqlite"` | 存储类型：sqlite/mysql/postgres |
| `storage.path` | string | `"./data/collection.db"` | 数据库文件路径 |
| `storage.backup.enabled` | boolean | `true` | 启用自动备份 |
| `storage.backup.interval` | number | `86400000` | 备份间隔（毫秒） |
| `storage.backup.retentionDays` | number | `7` | 备份保留天数 |

#### 性能配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `performance.enableCompression` | boolean | `true` | 启用数据压缩 |
| `performance.batchSize` | number | `50` | 批量处理大小 |
| `performance.enableStreaming` | boolean | `false` | 启用流式处理 |

### 环境变量对应

| 配置项 | 环境变量 | 示例 |
|--------|----------|------|
| `system.debug` | `DEBUG` | `DEBUG=true` |
| `system.logLevel` | `LOG_LEVEL` | `LOG_LEVEL=debug` |
| `system.maxConcurrentCollections` | `MAX_CONCURRENT_COLLECTIONS` | `MAX_CONCURRENT_COLLECTIONS=5` |
| `system.maxItemsPerCollection` | `MAX_ITEMS_PER_COLLECTION` | `MAX_ITEMS_PER_COLLECTION=200` |
| `system.requestTimeout` | `REQUEST_TIMEOUT` | `REQUEST_TIMEOUT=60000` |

## 平台配置

### 完整配置示例

```json
{
  "platforms": [
    {
      "platform": "twitter",
      "enabled": true,
      "priority": 1,
      "platformSpecific": {
        "collectionTargets": {
          "maxTweetsPerCollection": 20,
          "trendingTopics": true,
          "hotTweets": true,
          "userTimelines": false
        },
        "schedule": "0 */2 * * *",
        "priority": "high",
        "maxRetries": 3,
        "timeout": 300000,
        "api": {
          "enabled": false,
          "credentials": {
            "apiKey": "",
            "apiSecret": "",
            "accessToken": "",
            "accessSecret": ""
          },
          "rateLimit": {
            "requestsPer15Min": 900
          }
        },
        "filters": {
          "minLikes": 100,
          "minRetweets": 10,
          "languages": ["en", "zh"],
          "excludeKeywords": ["spam", "advertisement"]
        }
      }
    }
  ]
}
```

### 平台列表

| 平台 | 标识 | 支持功能 | 特殊要求 |
|------|------|----------|----------|
| Twitter | `twitter` | 趋势话题、热门推文 | 国际网络 |
| YouTube | `youtube` | 趋势视频、频道更新 | 视频处理 |
| TikTok | `tiktok` | 趋势视频、热门标签 | 区域限制处理 |
| 微博 | `weibo` | 热搜话题、热门微博 | 中文编码处理 |
| 抖音 | `douyin` | 热搜视频、热门音乐 | 中文内容处理 |

### 通用配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `platform` | string | - | 平台标识（必填） |
| `enabled` | boolean | `true` | 是否启用该平台 |
| `priority` | number | `1` | 平台优先级（1-10） |

### 平台特定配置

#### 采集目标配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `collectionTargets.maxXPerCollection` | number | 平台相关 | 每次采集最大数量 |
| `collectionTargets.trendingTopics` | boolean | `true` | 采集趋势话题 |
| `collectionTargets.hotContent` | boolean | `true` | 采集热门内容 |
| `collectionTargets.userTimelines` | boolean | `false` | 采集用户时间线 |

#### 调度配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `schedule` | string | `"0 */1 * * *"` | cron表达式 |
| `priority` | string | `"normal"` | 任务优先级 |
| `maxRetries` | number | `3` | 最大重试次数 |
| `timeout` | number | `300000` | 任务超时时间（毫秒） |

#### API配置（如果支持）

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `api.enabled` | boolean | `false` | 启用API采集 |
| `api.credentials.*` | string | `""` | API认证信息 |
| `api.rateLimit.requestsPerX` | number | 平台相关 | API速率限制 |

#### 过滤配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `filters.minLikes` | number | `0` | 最小点赞数 |
| `filters.minShares` | number | `0` | 最小分享数 |
| `filters.languages` | string[] | `[]` | 语言过滤 |
| `filters.excludeKeywords` | string[] | `[]` | 排除关键词 |

### 环境变量对应

| 配置项 | 环境变量 | 示例 |
|--------|----------|------|
| `platforms[].enabled` | `{PLATFORM}_ENABLED` | `TWITTER_ENABLED=true` |
| `platforms[].platformSpecific.schedule` | `{PLATFORM}_SCHEDULE` | `TWITTER_SCHEDULE="0 */2 * * *"` |
| `platforms[].platformSpecific.maxRetries` | `{PLATFORM}_MAX_RETRIES` | `TWITTER_MAX_RETRIES=5` |

## 反爬配置

### 完整配置示例

```json
{
  "antiCrawling": {
    "enabled": true,
    "requestDelay": {
      "minDelay": 1000,
      "maxDelay": 5000,
      "adaptive": true,
      "increaseFactor": 1.5
    },
    "userAgents": {
      "enabled": true,
      "rotation": true,
      "customList": [],
      "updateFrequency": 86400000
    },
    "proxy": {
      "enabled": false,
      "rotation": true,
      "list": [],
      "rotationInterval": 3600000,
      "healthCheck": {
        "enabled": true,
        "interval": 300000,
        "timeout": 10000
      }
    },
    "retryStrategy": {
      "maxRetries": 3,
      "backoffFactor": 2,
      "initialDelay": 1000,
      "maxDelay": 60000
    },
    "captcha": {
      "enabled": false,
      "service": "2captcha",
      "apiKey": "",
      "maxCostPerRequest": 0.1
    },
    "headers": {
      "randomize": true,
      "customHeaders": {
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive"
      }
    }
  }
}
```

### 配置项说明

#### 请求延迟

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `requestDelay.minDelay` | number | `1000` | 最小延迟（毫秒） |
| `requestDelay.maxDelay` | number | `5000` | 最大延迟（毫秒） |
| `requestDelay.adaptive` | boolean | `true` | 启用自适应延迟 |
| `requestDelay.increaseFactor` | number | `1.5` | 失败时延迟增加倍数 |

#### 用户代理

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `userAgents.enabled` | boolean | `true` | 启用用户代理轮换 |
| `userAgents.rotation` | boolean | `true` | 启用自动轮换 |
| `userAgents.customList` | string[] | `[]` | 自定义用户代理列表 |
| `userAgents.updateFrequency` | number | `86400000` | 更新频率（毫秒） |

#### 代理配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `proxy.enabled` | boolean | `false` | 启用代理 |
| `proxy.rotation` | boolean | `true` | 启用代理轮换 |
| `proxy.list` | string[] | `[]` | 代理服务器列表 |
| `proxy.rotationInterval` | number | `3600000` | 轮换间隔（毫秒） |
| `proxy.healthCheck.enabled` | boolean | `true` | 启用健康检查 |
| `proxy.healthCheck.interval` | number | `300000` | 检查间隔（毫秒） |
| `proxy.healthCheck.timeout` | number | `10000` | 检查超时时间（毫秒） |

#### 重试策略

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `retryStrategy.maxRetries` | number | `3` | 最大重试次数 |
| `retryStrategy.backoffFactor` | number | `2` | 退避因子 |
| `retryStrategy.initialDelay` | number | `1000` | 初始延迟（毫秒） |
| `retryStrategy.maxDelay` | number | `60000` | 最大延迟（毫秒） |

#### CAPTCHA处理

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `captcha.enabled` | boolean | `false` | 启用CAPTCHA处理 |
| `captcha.service` | string | `"2captcha"` | CAPTCHA服务提供商 |
| `captcha.apiKey` | string | `""` | API密钥 |
| `captcha.maxCostPerRequest` | number | `0.1` | 每次请求最大成本（美元） |

#### 请求头配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `headers.randomize` | boolean | `true` | 随机化请求头 |
| `headers.customHeaders` | object | `{}` | 自定义请求头 |

### 环境变量对应

| 配置项 | 环境变量 | 示例 |
|--------|----------|------|
| `antiCrawling.enabled` | `ENABLE_ANTI_CRAWLING` | `ENABLE_ANTI_CRAWLING=true` |
| `antiCrawling.requestDelay.minDelay` | `REQUEST_MIN_DELAY` | `REQUEST_MIN_DELAY=2000` |
| `antiCrawling.requestDelay.maxDelay` | `REQUEST_MAX_DELAY` | `REQUEST_MAX_DELAY=10000` |
| `antiCrawling.retryStrategy.maxRetries` | `MAX_RETRY_ATTEMPTS` | `MAX_RETRY_ATTEMPTS=5` |

## 调度配置

### 完整配置示例

```json
{
  "taskScheduling": {
    "enabled": true,
    "autoStart": true,
    "historyRetentionDays": 30,
    "enableDependencyCheck": true,
    "enablePriorityQueue": true,
    "defaultSchedule": "0 */1 * * *",
    "concurrency": {
      "maxConcurrentTasks": 3,
      "queueSize": 100,
      "timeout": 300000
    },
    "notifications": {
      "enabled": true,
      "onSuccess": false,
      "onFailure": true,
      "channels": ["log", "email"],
      "email": {
        "smtp": {
          "host": "",
          "port": 587,
          "secure": false,
          "auth": {
            "user": "",
            "pass": ""
          }
        },
        "from": "collection@example.com",
        "to": ["admin@example.com"]
      }
    }
  }
}
```

### 配置项说明

#### 基础配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enabled` | boolean | `true` | 启用任务调度 |
| `autoStart` | boolean | `true` | 自动启动调度器 |
| `historyRetentionDays` | number | `30` | 历史记录保留天数 |
| `enableDependencyCheck` | boolean | `true` | 启用任务依赖检查 |
| `enablePriorityQueue` | boolean | `true` | 启用优先级队列 |
| `defaultSchedule` | string | `"0 */1 * * *"` | 默认调度频率 |

#### 并发控制

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `concurrency.maxConcurrentTasks` | number | `3` | 最大并发任务数 |
| `concurrency.queueSize` | number | `100` | 任务队列大小 |
| `concurrency.timeout` | number | `300000` | 任务超时时间（毫秒） |

#### 通知配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `notifications.enabled` | boolean | `true` | 启用通知 |
| `notifications.onSuccess` | boolean | `false` | 成功时发送通知 |
| `notifications.onFailure` | boolean | `true` | 失败时发送通知 |
| `notifications.channels` | string[] | `["log"]` | 通知渠道 |

### 环境变量对应

| 配置项 | 环境变量 | 示例 |
|--------|----------|------|
| `taskScheduling.enabled` | `ENABLE_TASK_SCHEDULING` | `ENABLE_TASK_SCHEDULING=true` |
| `taskScheduling.autoStart` | `AUTO_START_SCHEDULER` | `AUTO_START_SCHEDULER=false` |
| `taskScheduling.concurrency.maxConcurrentTasks` | `MAX_CONCURRENT_TASKS` | `MAX_CONCURRENT_TASKS=5` |

## 数据清洗配置

### 完整配置示例

```json
{
  "dataCleaning": {
    "enabled": true,
    "deduplication": {
      "enabled": true,
      "methods": ["url", "content"],
      "similarityThreshold": 0.8,
      "crossPlatform": true
    },
    "validation": {
      "enabled": true,
      "requiredFields": ["title", "url", "platform", "publishedAt"],
      "fieldRules": {
        "title": {
          "minLength": 5,
          "maxLength": 500
        },
        "url": {
          "pattern": "^https?://"
        }
      }
    },
    "normalization": {
      "enabled": true,
      "dateFormat": "YYYY-MM-DD HH:mm:ss",
      "timezone": "UTC",
      "encoding": "UTF-8"
    },
    "filtering": {
      "enabled": true,
      "minContentLength": 50,
      "excludePatterns": [
        "^Sponsored",
        "^Advertisement"
      ],
      "languageDetection": {
        "enabled": true,
        "supportedLanguages": ["en", "zh"]
      }
    },
    "enrichment": {
      "enabled": true,
      "sentimentAnalysis": false,
      "keywordExtraction": true,
      "categoryClassification": true
    }
  }
}
```

### 配置项说明

#### 去重配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `deduplication.enabled` | boolean | `true` | 启用去重 |
| `deduplication.methods` | string[] | `["url", "content"]` | 去重方法 |
| `deduplication.similarityThreshold` | number | `0.8` | 内容相似度阈值 |
| `deduplication.crossPlatform` | boolean | `true` | 跨平台去重 |

#### 验证配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `validation.enabled` | boolean | `true` | 启用验证 |
| `validation.requiredFields` | string[] | `["title", "url", "platform", "publishedAt"]` | 必填字段 |
| `validation.fieldRules.*` | object | `{}` | 字段验证规则 |

#### 标准化配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `normalization.enabled` | boolean | `true` | 启用标准化 |
| `normalization.dateFormat` | string | `"YYYY-MM-DD HH:mm:ss"` | 日期格式 |
| `normalization.timezone` | string | `"UTC"` | 时区 |
| `normalization.encoding` | string | `"UTF-8"` | 编码 |

#### 过滤配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `filtering.enabled` | boolean | `true` | 启用过滤 |
| `filtering.minContentLength` | number | `50` | 最小内容长度 |
| `filtering.excludePatterns` | string[] | `[]` | 排除模式 |
| `filtering.languageDetection.enabled` | boolean | `true` | 启用语言检测 |
| `filtering.languageDetection.supportedLanguages` | string[] | `["en", "zh"]` | 支持的语言 |

#### 增强配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `enrichment.enabled` | boolean | `true` | 启用数据增强 |
| `enrichment.sentimentAnalysis` | boolean | `false` | 情感分析 |
| `enrichment.keywordExtraction` | boolean | `true` | 关键词提取 |
| `enrichment.categoryClassification` | boolean | `true` | 分类分类 |

### 环境变量对应

| 配置项 | 环境变量 | 示例 |
|--------|----------|------|
| `dataCleaning.enabled` | `ENABLE_DATA_CLEANING` | `ENABLE_DATA_CLEANING=true` |
| `dataCleaning.deduplication.enabled` | `ENABLE_DEDUPLICATION` | `ENABLE_DEDUPLICATION=false` |
| `dataCleaning.deduplication.similarityThreshold` | `SIMILARITY_THRESHOLD` | `SIMILARITY_THRESHOLD=0.9` |

## 监控配置

### 完整配置示例

```json
{
  "monitoring": {
    "enabled": true,
    "metrics": {
      "collection": {
        "enabled": true,
        "interval": 60000
      },
      "performance": {
        "enabled": true,
        "interval": 30000
      },
      "resources": {
        "enabled": true,
        "interval": 60000
      }
    },
    "alerts": {
      "enabled": true,
      "rules": {
        "serviceDown": {
          "enabled": true,
          "threshold": 1,
          "duration": "1m"
        },
        "highFailureRate": {
          "enabled": true,
          "threshold": 0.3,
          "duration": "5m"
        },
        "highLatency": {
          "enabled": true,
          "threshold": 300,
          "duration": "5m"
        }
      },
      "channels": ["log", "email", "slack"],
      "slack": {
        "webhookUrl": "",
        "channel": "#alerts"
      }
    },
    "logging": {
      "enabled": true,
      "level": "info",
      "format": "json",
      "output": {
        "console": true,
        "file": true,
        "path": "./logs/collection.log",
        "rotation": {
          "enabled": true,
          "maxSize": "100m",
          "maxFiles": 10
        }
      }
    }
  }
}
```

### 配置项说明

#### 指标监控

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `metrics.collection.enabled` | boolean | `true` | 启用采集指标 |
| `metrics.collection.interval` | number | `60000` | 采集间隔（毫秒） |
| `metrics.performance.enabled` | boolean | `true` | 启用性能指标 |
| `metrics.performance.interval` | number | `30000` | 性能指标间隔 |
| `metrics.resources.enabled` | boolean | `true` | 启用资源指标 |
| `metrics.resources.interval` | number | `60000` | 资源指标间隔 |

#### 告警配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `alerts.enabled` | boolean | `true` | 启用告警 |
| `alerts.rules.*.enabled` | boolean | `true` | 启用特定告警规则 |
| `alerts.rules.*.threshold` | number | 规则相关 | 告警阈值 |
| `alerts.rules.*.duration` | string | 规则相关 | 持续时间 |
| `alerts.channels` | string[] | `["log"]` | 告警渠道 |
| `alerts.slack.webhookUrl` | string | `""` | Slack Webhook URL |
| `alerts.slack.channel` | string | `"#alerts"` | Slack频道 |

#### 日志配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `logging.enabled` | boolean | `true` | 启用日志 |
| `logging.level` | string | `"info"` | 日志级别 |
| `logging.format` | string | `"json"` | 日志格式 |
| `logging.output.console` | boolean | `true` | 输出到控制台 |
| `logging.output.file` | boolean | `true` | 输出到文件 |
| `logging.output.path` | string | `"./logs/collection.log"` | 日志文件路径 |
| `logging.output.rotation.enabled` | boolean | `true` | 启用日志轮转 |
| `logging.output.rotation.maxSize` | string | `"100m"` | 最大文件大小 |
| `logging.output.rotation.maxFiles` | number | `10` | 最大文件数 |

### 环境变量对应

| 配置项 | 环境变量 | 示例 |
|--------|----------|------|
| `monitoring.enabled` | `ENABLE_MONITORING` | `ENABLE_MONITORING=true` |
| `monitoring.logging.level` | `LOG_LEVEL` | `LOG_LEVEL=debug` |
| `monitoring.logging.output.path` | `LOG_PATH` | `LOG_PATH=/var/log/collection.log` |

## 环境变量配置

### 优先级说明

环境变量配置的优先级高于配置文件，便于在容器化部署时动态配置。

### 完整环境变量列表

```bash
# 系统配置
DEBUG=false
LOG_LEVEL=info
MAX_CONCURRENT_COLLECTIONS=3
MAX_ITEMS_PER_COLLECTION=100
REQUEST_TIMEOUT=30000
MAX_RETRY_ATTEMPTS=3

# 平台配置
TWITTER_ENABLED=true
TWITTER_SCHEDULE="0 */2 * * *"
TWITTER_MAX_RETRIES=3
TWITTER_TIMEOUT=300000

YOUTUBE_ENABLED=true
YOUTUBE_SCHEDULE="0 */3 * * *"

TIKTOK_ENABLED=true
WEIBO_ENABLED=true
DOUYIN_ENABLED=true

# 反爬配置
ENABLE_ANTI_CRAWLING=true
REQUEST_MIN_DELAY=1000
REQUEST_MAX_DELAY=5000
ENABLE_USER_AGENT_ROTATION=true
ENABLE_PROXY=false
MAX_RETRY_ATTEMPTS=3

# 调度配置
ENABLE_TASK_SCHEDULING=true
AUTO_START_SCHEDULER=true
MAX_CONCURRENT_TASKS=3

# 数据清洗配置
ENABLE_DATA_CLEANING=true
ENABLE_DEDUPLICATION=true
SIMILARITY_THRESHOLD=0.8

# 监控配置
ENABLE_MONITORING=true
METRICS_INTERVAL=60000
LOG_PATH=./logs/collection.log

# 数据路径
COLLECTION_DATA_PATH=./data/collection
COLLECTION_LOG_PATH=./logs
COLLECTION_BACKUP_PATH=./backups

# 数据库配置
DATABASE_TYPE=sqlite
DATABASE_PATH=./data/collection.db
DATABASE_BACKUP_INTERVAL=86400000
```

### 动态配置示例

```bash
# 使用.env文件
cat > .env << EOF
LOG_LEVEL=debug
MAX_CONCURRENT_COLLECTIONS=5
TWITTER_ENABLED=true
YOUTUBE_ENABLED=false
ENABLE_ANTI_CRAWLING=true
EOF

# 加载环境变量
export $(cat .env | xargs)

# 启动服务
node collection-service.js start
```

## 配置验证

### 验证配置文件

```bash
# 使用配置管理器验证
node -e "
const { configManager } = require('./dist/src/collection/config-manager');
const result = configManager.validateConfig();
console.log('配置验证结果:', result);
if (!result.valid) {
  console.error('配置错误:', result.errors);
  process.exit(1);
}
"

# 或使用命令行工具
npm run config:validate
```

### 配置验证输出

```
配置验证结果: {
  valid: true,
  errors: []
}

或

配置验证结果: {
  valid: false,
  errors: [
    "system.maxConcurrentCollections: 必须是数字",
    "platforms[0].platform: 未知平台类型 'unknown'"
  ]
}
```

### 配置测试

```bash
# 测试配置加载
npm run config:test

# 生成配置报告
npm run config:report
```

## 配置最佳实践

### 1. 环境分离

```bash
# 开发环境
cp config/collection.config.dev.json config/collection.config.json

# 测试环境
cp config/collection.config.test.json config/collection.config.json

# 生产环境
cp config/collection.config.prod.json config/collection.config.json
```

### 2. 配置版本控制

```bash
# 使用git管理配置
git add config/collection.config*.json
git commit -m "更新采集配置"

# 但不提交敏感信息
echo "config/collection.config.prod.json" >> .gitignore
```

### 3. 安全配置

```json
{
  "system": {
    "security": {
      "encryptSecrets": true,
      "keyPath": "./secrets/key.pem"
    }
  }
}
```

### 4. 性能优化配置

```json
{
  "system": {
    "performance": {
      "enableCompression": true,
      "batchSize": 100,
      "cacheSize": 1000
    }
  },
  "antiCrawling": {
    "requestDelay": {
      "minDelay": 2000,
      "maxDelay": 8000
    }
  }
}
```

### 5. 监控配置

```json
{
  "monitoring": {
    "metrics": {
      "collection": {
        "enabled": true,
        "interval": 30000
      }
    },
    "alerts": {
      "enabled": true,
      "channels": ["slack", "email"]
    }
  }
}
```

### 6. 备份配置

```json
{
  "system": {
    "storage": {
      "backup": {
        "enabled": true,
        "interval": 21600000,  # 6小时
        "retentionDays": 30,
        "compression": true
      }
    }
  }
}
```

## 配置更新

### 热更新配置

```typescript
// 重新加载配置
await configManager.loadConfig();

// 应用新配置到框架
collectionFramework.reloadConfig();
```

### 配置迁移

当配置结构发生变化时：

```bash
# 1. 备份旧配置
cp config/collection.config.json config/collection.config.json.backup

# 2. 使用迁移工具
npm run config:migrate

# 3. 验证新配置
npm run config:validate
```

## 故障排除

### 配置问题诊断

```bash
# 查看当前配置
npm run config:show

# 检查配置语法
node -c config/collection.config.json

# 验证配置完整性
npm run config:check
```

### 常见配置错误

1. **JSON语法错误**
   ```bash
   # 使用jq验证
   jq . config/collection.config.json
   ```

2. **类型不匹配**
   ```bash
   # 检查类型
   node -e "const config = require('./config/collection.config.json'); console.log(typeof config.system.maxConcurrentCollections);"
   ```

3. **缺少必填字段**
   ```bash
   # 验证必填字段
   npm run config:validate
   ```

### 获取帮助

如果配置问题无法解决：

1. 查看默认配置：`config/collection.config.ts`
2. 参考示例配置：`config/collection.config.example.json`
3. 查看日志：`tail -f logs/collection.log`
4. 提交Issue：提供配置文件和错误信息