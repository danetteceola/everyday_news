# 每日热点新闻聚合系统 - 配置指南

## 配置概览

系统配置采用分层设计，优先级从高到低:
1. **环境变量** - 最高优先级，动态配置
2. **配置文件** (`config/*.yaml`) - 静态配置
3. **默认配置** - 内置默认值

## 环境变量配置

### 核心配置

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `NODE_ENV` | `production` | 运行环境: `development`, `staging`, `production` | 否 |
| `LOG_LEVEL` | `info` | 日志级别: `debug`, `info`, `warn`, `error` | 否 |
| `PORT` | `3000` | HTTP 服务端口 | 否 |
| `HOST` | `0.0.0.0` | 服务绑定地址 | 否 |

### 数据库配置

| 变量名 | 默认值 | 说明 | 必填 |
|--------|--------|------|------|
| `DATABASE_PATH` | `./data/everyday_news.db` | SQLite 数据库文件路径 | 否 |
| `BACKUP_PATH` | `./data/backups` | 备份文件存储路径 | 否 |
| `MAX_CONNECTIONS` | `10` | 数据库最大连接数 | 否 |
| `DATABASE_TIMEOUT` | `5000` | 数据库操作超时（毫秒） | 否 |

### 系统架构模块配置

#### 调度器配置
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `SCHEDULER_MAX_CONCURRENT_TASKS` | `5` | 最大并发任务数 |
| `SCHEDULER_TASK_TIMEOUT` | `300000` | 任务超时时间（毫秒） |

#### 通知系统配置
**Telegram:**
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `TELEGRAM_BOT_TOKEN` | (空) | Telegram Bot Token |
| `TELEGRAM_CHAT_ID` | (空) | 接收消息的 Chat ID |

**Email:**
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `SMTP_HOST` | (空) | SMTP 服务器地址 |
| `SMTP_PORT` | `587` | SMTP 端口 |
| `SMTP_USER` | (空) | SMTP 用户名 |
| `SMTP_PASS` | (空) | SMTP 密码 |
| `SMTP_SECURE` | `true` | 是否使用 SSL/TLS |
| `EMAIL_RECIPIENT` | (空) | 邮件接收地址 |

**Webhook:**
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `WEBHOOK_URL` | (空) | Webhook 接收地址 |
| `WEBHOOK_SECRET` | (空) | Webhook 签名密钥 |

#### 监控配置
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `MONITORING_COLLECTION_INTERVAL` | `60000` | 指标收集间隔（毫秒） |
| `MONITORING_ALERT_THRESHOLD_COLLECTION_SUCCESS` | `80` | 采集成功率告警阈值（百分比） |
| `MONITORING_ALERT_THRESHOLD_DATA_COMPLETENESS` | `90` | 数据完整性告警阈值（百分比） |
| `MONITORING_ALERT_THRESHOLD_PERFORMANCE` | `2000` | 性能告警阈值（毫秒） |

#### Claude LLM 集成配置
| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `LLM_MODEL` | `claude-3-5-sonnet-20241022` | Claude 模型名称 |
| `LLM_TEMPERATURE` | `0.7` | 生成温度（0-1） |
| `LLM_API_KEY` | (空) | Claude API 密钥 |
| `LLM_MAX_RETRIES` | `3` | 最大重试次数 |
| `LLM_RETRY_DELAY` | `300000` | 重试延迟（毫秒） |
| `LLM_CACHE_TTL` | `3600000` | 缓存过期时间（毫秒） |

## 配置文件

### 调度器配置 (`config/scheduler.yaml`)

```yaml
# 调度器全局配置
maxConcurrentTasks: 5
taskTimeout: 300000
logLevel: info

# 定时任务定义
tasks:
  - id: twitter-collection
    name: Twitter数据采集
    cronExpression: "0,6,12,18 * * * *"
    command: "npm run collect:twitter"
    enabled: true
    description: "每6小时采集Twitter热点新闻"

  - id: youtube-collection
    name: YouTube数据采集
    cronExpression: "6,18 * * * *"
    command: "npm run collect:youtube"
    enabled: true
    description: "每12小时采集YouTube热点视频"

  - id: daily-summary
    name: 每日新闻总结生成
    cronExpression: "2,14 * * * *"
    command: "npm run generate:summary"
    enabled: true
    description: "每天2次生成新闻摘要"
```

### 通知系统配置 (`config/notification.yaml`)

```yaml
# 通知系统全局配置
defaultPriority: medium
maxRetries: 3
retryDelay: 60000

# 通道配置
channels:
  telegram:
    enabled: false
    botToken: "${TELEGRAM_BOT_TOKEN}"
    chatId: "${TELEGRAM_CHAT_ID}"
    priority: high

  email:
    enabled: false
    smtpHost: "${SMTP_HOST}"
    smtpPort: "${SMTP_PORT}"
    smtpUser: "${SMTP_USER}"
    smtpPass: "${SMTP_PASS}"
    smtpSecure: true
    recipient: "${EMAIL_RECIPIENT}"
    priority: medium

  webhook:
    enabled: false
    url: "${WEBHOOK_URL}"
    secret: "${WEBHOOK_SECRET}"
    priority: low
```

### 监控配置 (`config/monitoring.yaml`)

```yaml
# 监控系统配置
collectionInterval: 60000
retentionPeriod: 604800000  # 7天（毫秒）

# 告警阈值
alertThresholds:
  collectionSuccessRate: 80    # 采集成功率（%）
  dataCompleteness: 90         # 数据完整性（%）
  performance: 2000            # 性能阈值（毫秒）

# 健康检查配置
healthChecks:
  database: true
  scheduler: true
  notification: true
  claude: true
```

### LLM 配置 (`config/llm.yaml`)

```yaml
# LLM 服务配置
defaultModel: claude-3-5-sonnet-20241022
defaultTemperature: 0.7
maxRetries: 3
retryDelay: 300000
cacheTtl: 3600000

# 提示词模板
promptTemplates:
  dailySummary: |
    请为以下新闻数据生成每日总结：

    {newsData}

    要求：
    1. 按重要性排序
    2. 突出关键事件
    3. 提供简要分析
    4. 字数限制在500字以内

    日期：{date}

  errorAnalysis: |
    分析以下系统错误并提出解决方案：

    {errorDetails}

    当前时间：{timestamp}
```

## 环境特定配置

系统支持不同环境的配置，通过 `NODE_ENV` 环境变量切换:

### 开发环境 (`NODE_ENV=development`)
- 日志级别: `debug`
- 数据库: 使用开发数据库文件
- 监控: 更频繁的收集间隔
- 通知: 使用模拟服务或禁用

### 预发布环境 (`NODE_ENV=staging`)
- 日志级别: `info`
- 数据库: 使用独立数据库
- 监控: 中等告警阈值
- 通知: 使用测试通道

### 生产环境 (`NODE_ENV=production`)
- 日志级别: `warn` 或 `error`
- 数据库: 使用高可用配置
- 监控: 严格的告警阈值
- 通知: 使用所有可用通道

## 配置验证

### 验证配置语法
```bash
# 检查环境变量
npm run config:validate

# 或者直接调用系统API
curl http://localhost:3000/config/validate
```

### 查看当前配置
```bash
# 查看完整配置
npm run config:show

# 查看特定模块配置
npm run config:show -- scheduler
```

### 配置热重载
某些配置支持热重载，无需重启服务:
```bash
# 重载配置
curl -X POST http://localhost:3000/config/reload
```

## 最佳实践

### 安全配置
1. **API 密钥管理**
   - 使用环境变量存储敏感信息
   - 定期轮换 API 密钥
   - 限制密钥权限

2. **数据库安全**
   - 定期备份数据库
   - 加密敏感数据
   - 限制数据库访问权限

3. **网络配置**
   - 使用 HTTPS 加密通信
   - 配置防火墙规则
   - 限制外部访问

### 性能调优
1. **数据库性能**
   ```bash
   # 启用查询缓存
   export QUERY_CACHE_ENABLED=true
   export QUERY_CACHE_SIZE=1000

   # 优化连接池
   export MAX_CONNECTIONS=20
   ```

2. **调度器优化**
   ```bash
   # 调整并发任务数
   export SCHEDULER_MAX_CONCURRENT_TASKS=10

   # 设置合理的任务超时
   export SCHEDULER_TASK_TIMEOUT=600000
   ```

3. **监控配置**
   ```bash
   # 根据负载调整收集频率
   export MONITORING_COLLECTION_INTERVAL=30000  # 高负载时减少
   ```

### 故障恢复配置
1. **重试策略**
   ```bash
   # 配置重试机制
   export LLM_MAX_RETRIES=5
   export LLM_RETRY_DELAY=60000
   ```

2. **降级配置**
   ```bash
   # 配置服务降级
   export FALLBACK_ENABLED=true
   export FALLBACK_MODE=template
   ```

## 故障排除

### 配置错误常见问题

#### 1. 环境变量未生效
**症状**: 配置变更后系统行为未改变
**解决方案**:
```bash
# 检查环境变量是否被正确加载
npm run config:show

# 重启服务使环境变量生效
./scripts/deploy.sh prod restart
```

#### 2. 配置文件语法错误
**症状**: 服务启动失败，报 YAML 解析错误
**解决方案**:
```bash
# 验证 YAML 语法
npm run config:validate

# 使用在线 YAML 验证工具检查语法
```

#### 3. 配置优先级冲突
**症状**: 配置表现不符合预期
**解决方案**:
- 环境变量优先级最高
- 检查是否有环境变量覆盖了配置文件
- 使用 `npm run config:show` 查看最终配置

#### 4. 敏感信息泄露
**症状**: API 密钥等敏感信息出现在日志中
**解决方案**:
- 确保敏感信息只通过环境变量配置
- 检查配置文件不包含明文密钥
- 使用配置掩码功能

## 配置参考

完整配置参考见 [配置 API 文档](./api-documentation.md#配置-api)。

需要帮助? 查看:
- [安装指南](./installation.md)
- [API 文档](./api-documentation.md)
- [故障排除指南](./troubleshooting.md)