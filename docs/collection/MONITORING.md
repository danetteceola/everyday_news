# 数据采集模块监控和告警配置指南

## 目录

1. [监控架构](#监控架构)
2. [监控指标](#监控指标)
3. [告警规则](#告警规则)
4. [通知渠道](#通知渠道)
5. [配置示例](#配置示例)
6. [部署监控](#部署监控)
7. [故障排除](#故障排除)

## 监控架构

### 架构概述

数据采集模块的监控系统采用分层架构：

```
数据采集服务
    ↓
监控指标收集器 (Metrics Collector)
    ├─ Prometheus格式指标 (/metrics)
    ├─ JSON格式指标 (/metrics/json)
    └─ 指标摘要 (/metrics/summary)
        ↓
告警管理器 (Alert Manager)
    ├─ 告警规则检查
    ├─ 告警状态管理
    └─ 通知发送
        ↓
通知渠道
    ├─ 邮件 (SMTP)
    ├─ Slack
    ├─ Webhook
    └─ 自定义渠道
```

### 组件说明

1. **监控指标收集器**
   - 收集所有采集相关的指标
   - 提供Prometheus兼容的指标端点
   - 实时更新指标数据

2. **告警管理器**
   - 定期检查告警规则
   - 管理告警生命周期（触发、解决、确认）
   - 发送通知到配置的渠道

3. **监控服务**
   - 提供HTTP API访问监控数据
   - 健康检查端点
   - 管理接口

## 监控指标

### 指标分类

#### 1. 采集指标

| 指标名称 | 类型 | 说明 | 标签 |
|----------|------|------|------|
| `collection_total` | Counter | 总采集次数 | - |
| `collection_success_total` | Counter | 成功采集次数 | - |
| `collection_failed_total` | Counter | 失败采集次数 | - |
| `collection_items_total` | Counter | 采集到的总项目数 | - |
| `collection_duration_seconds` | Histogram | 采集耗时分布 | - |
| `collection_duration_seconds_bucket` | Histogram | 采集耗时桶 | `le` |
| `collection_duration_seconds_sum` | Histogram | 采集耗时总和 | - |
| `collection_duration_seconds_count` | Histogram | 采集次数 | - |

#### 2. 平台指标

| 指标名称 | 类型 | 说明 | 标签 |
|----------|------|------|------|
| `platform_collections_total` | Counter | 平台总采集次数 | `platform` |
| `platform_collections_success` | Counter | 平台成功采集次数 | `platform` |
| `platform_items_collected` | Counter | 平台采集项目数 | `platform` |
| `platform_avg_duration_seconds` | Gauge | 平台平均采集耗时 | `platform` |

#### 3. 系统指标

| 指标名称 | 类型 | 说明 | 标签 |
|----------|------|------|------|
| `memory_usage_bytes` | Gauge | 内存使用量（字节） | - |
| `heap_used_bytes` | Gauge | 堆内存使用量 | - |
| `heap_total_bytes` | Gauge | 堆内存总量 | - |
| `cpu_usage_percent` | Gauge | CPU使用率（百分比） | - |
| `process_uptime_seconds` | Gauge | 进程运行时间 | - |

#### 4. 队列指标

| 指标名称 | 类型 | 说明 | 标签 |
|----------|------|------|------|
| `queue_length` | Gauge | 任务队列长度 | - |
| `queue_processing_time_seconds` | Gauge | 队列处理时间 | - |

#### 5. 错误指标

| 指标名称 | 类型 | 说明 | 标签 |
|----------|------|------|------|
| `error_total` | Counter | 总错误数 | - |
| `error_by_type` | Counter | 按类型统计的错误数 | `type` |

### 衍生指标

以下指标可以通过PromQL计算得到：

#### 采集成功率
```promql
# 整体采集成功率
(collection_success_total / collection_total) * 100

# 平台采集成功率
(platform_collections_success{platform="twitter"} / platform_collections_total{platform="twitter"}) * 100
```

#### 平均采集耗时
```promql
# 整体平均耗时
rate(collection_duration_seconds_sum[5m]) / rate(collection_duration_seconds_count[5m])

# 平台平均耗时
platform_avg_duration_seconds{platform="twitter"}
```

#### 错误率
```promql
# 整体错误率
(collection_failed_total / collection_total) * 100

# 错误类型分布
rate(error_by_type[5m])
```

### 指标端点

监控服务提供以下指标端点：

#### Prometheus格式指标
```
GET http://localhost:9090/metrics
```

响应示例：
```
# HELP collection_total Total number of collections
# TYPE collection_total counter
collection_total 150

# HELP collection_success_total Total number of successful collections
# TYPE collection_success_total counter
collection_success_total 135

# HELP collection_duration_seconds Collection duration histogram
# TYPE collection_duration_seconds histogram
collection_duration_seconds_bucket{le="0.1"} 45
collection_duration_seconds_bucket{le="0.5"} 120
collection_duration_seconds_bucket{le="1"} 145
collection_duration_seconds_bucket{le="5"} 150
collection_duration_seconds_bucket{le="+Inf"} 150
collection_duration_seconds_sum 285.6
collection_duration_seconds_count 150
```

#### JSON格式指标
```
GET http://localhost:9090/metrics/json
```

响应示例：
```json
{
  "collection_total": 150,
  "collection_success_total": 135,
  "collection_failed_total": 15,
  "collection_duration_seconds": {
    "buckets": [
      {"le": "0.1", "count": 45},
      {"le": "0.5", "count": 120},
      {"le": "1", "count": 145},
      {"le": "5", "count": 150},
      {"le": "+Inf", "count": 150}
    ],
    "sum": 285.6,
    "count": 150
  },
  "collection_items_total": 1250
}
```

#### 指标摘要
```
GET http://localhost:9090/metrics/summary
```

响应示例：
```json
{
  "uptime": "2h 30m 15s",
  "totalCollections": 150,
  "successRate": 90.0,
  "totalItems": 1250,
  "avgDuration": "1.9s",
  "platformStats": [
    {
      "platform": "twitter",
      "collections": 50,
      "successRate": 92.0
    },
    {
      "platform": "youtube",
      "collections": 40,
      "successRate": 85.0
    }
  ],
  "systemStats": {
    "memory": "256.5 MB",
    "heap": "145.2 / 512.0 MB",
    "cpu": "12.5%",
    "queue": 3
  }
}
```

## 告警规则

### 默认告警规则

系统预定义了以下告警规则：

#### 1. 服务宕机告警
- **规则ID**: `service_down`
- **严重程度**: CRITICAL
- **条件**: 5分钟内无任何采集活动
- **阈值**: `collection_total == 0` (持续5分钟)
- **通知渠道**: 邮件, Slack
- **冷却时间**: 5分钟

#### 2. 采集失败率过高
- **规则ID**: `high_failure_rate`
- **严重程度**: ERROR
- **条件**: 采集失败率超过30%
- **阈值**: `success_rate < 70%` (持续10分钟)
- **通知渠道**: 邮件, Slack
- **冷却时间**: 10分钟

#### 3. 采集延迟过高
- **规则ID**: `high_collection_latency`
- **严重程度**: WARNING
- **条件**: 平均采集延迟超过5分钟
- **阈值**: `avg_duration > 300秒` (持续5分钟)
- **通知渠道**: Slack
- **冷却时间**: 5分钟

#### 4. 内存使用率过高
- **规则ID**: `high_memory_usage`
- **严重程度**: WARNING
- **条件**: 内存使用率超过90%
- **阈值**: `memory_usage_percent > 90%` (持续5分钟)
- **通知渠道**: Slack
- **冷却时间**: 5分钟

#### 5. CPU使用率过高
- **规则ID**: `high_cpu_usage`
- **严重程度**: WARNING
- **条件**: CPU使用率超过90%
- **阈值**: `cpu_usage_percent > 90%` (持续5分钟)
- **通知渠道**: Slack
- **冷却时间**: 5分钟

#### 6. 磁盘空间不足
- **规则ID**: `low_disk_space`
- **严重程度**: ERROR
- **条件**: 磁盘可用空间低于5%
- **阈值**: `disk_usage_percent > 95%` (持续5分钟)
- **通知渠道**: 邮件, Slack
- **冷却时间**: 5分钟

#### 7. Twitter采集失败
- **规则ID**: `twitter_collection_failed`
- **严重程度**: WARNING
- **条件**: Twitter平台30分钟内无成功采集
- **阈值**: `twitter_success == 0` (持续30分钟)
- **通知渠道**: Slack
- **冷却时间**: 30分钟

#### 8. 任务队列积压
- **规则ID**: `queue_backlog`
- **严重程度**: WARNING
- **条件**: 任务队列长度超过50
- **阈值**: `queue_length > 50` (持续5分钟)
- **通知渠道**: Slack
- **冷却时间**: 5分钟

### 告警状态

告警有以下几种状态：

1. **FIRING** - 告警已触发，正在发送通知
2. **RESOLVED** - 告警条件不再满足，已解决
3. **ACKNOWLEDGED** - 告警已被人工确认

### 告警端点

监控服务提供以下告警端点：

#### 获取所有告警
```
GET http://localhost:9090/alerts
```

响应示例：
```json
{
  "active": [
    {
      "id": "service_down_1640995200000",
      "ruleId": "service_down",
      "name": "服务宕机",
      "description": "数据采集服务不可用",
      "severity": "critical",
      "status": "firing",
      "startedAt": "2024-01-01T00:00:00.000Z",
      "value": 0,
      "threshold": 0,
      "labels": {
        "component": "collection-service",
        "impact": "high"
      }
    }
  ],
  "status": {
    "rules": {
      "total": 8,
      "enabled": 8,
      "disabled": 0
    },
    "alerts": {
      "active": 1,
      "history": 15,
      "bySeverity": {
        "info": 0,
        "warning": 0,
        "error": 0,
        "critical": 1
      }
    }
  }
}
```

#### 获取活跃告警
```
GET http://localhost:9090/alerts/active
```

#### 获取告警历史
```
GET http://localhost:9090/alerts/history
```

查询参数：
- `limit`: 返回数量限制（默认: 100）
- `startDate`: 开始时间
- `endDate`: 结束时间
- `severity`: 严重程度过滤
- `ruleId`: 规则ID过滤

#### 获取告警规则
```
GET http://localhost:9090/alerts/rules
```

#### 确认告警
```
POST http://localhost:9090/alerts/acknowledge/{ruleId}
```

请求体：
```json
{
  "acknowledgedBy": "admin"
}
```

## 通知渠道

### 支持的渠道

#### 1. 邮件通知
- **类型**: `email`
- **配置**: SMTP服务器设置
- **适用场景**: 重要告警、每日摘要

#### 2. Slack通知
- **类型**: `slack`
- **配置**: Webhook URL
- **适用场景**: 实时告警、团队协作

#### 3. Webhook通知
- **类型**: `webhook`
- **配置**: HTTP端点
- **适用场景**: 集成到其他系统

#### 4. 自定义渠道
可以通过扩展 `NotificationChannel` 接口添加自定义渠道。

### 渠道配置

#### 邮件配置
```bash
# 环境变量配置
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_SECURE=false
export SMTP_USER=your-email@gmail.com
export SMTP_PASS=your-password
export ALERT_EMAIL_FROM=alerts@example.com
export ALERT_EMAIL_TO=admin@example.com,ops@example.com
export EMAIL_ALERTS_ENABLED=true
```

#### Slack配置
```bash
# 环境变量配置
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
export SLACK_CHANNEL="#alerts"
export SLACK_USERNAME="Collection Alerts"
export SLACK_ICON_EMOJI=":warning:"
export SLACK_ALERTS_ENABLED=true
```

#### Webhook配置
```bash
# 环境变量配置
export WEBHOOK_URL=https://your-webhook.com/alerts
export WEBHOOK_ALERTS_ENABLED=true
```

### 通知模板

#### 邮件模板
```html
<h2>[CRITICAL] 服务宕机</h2>
<p><strong>描述:</strong> 数据采集服务不可用</p>
<p><strong>严重程度:</strong> critical</p>
<p><strong>触发时间:</strong> 2024-01-01 00:00:00</p>
<p><strong>当前值:</strong> 0</p>
<p><strong>阈值:</strong> 0</p>
<p><strong>规则:</strong> collection_total == 0</p>
<hr>
<p><small>告警ID: service_down_1640995200000</small></p>
<p><small>规则ID: service_down</small></p>
```

#### Slack模板
```json
{
  "channel": "#alerts",
  "username": "Collection Alerts",
  "icon_emoji": ":fire:",
  "attachments": [
    {
      "color": "#ff0000",
      "title": ":fire: 服务宕机",
      "text": "数据采集服务不可用",
      "fields": [
        {
          "title": "严重程度",
          "value": "CRITICAL",
          "short": true
        },
        {
          "title": "当前值",
          "value": "0",
          "short": true
        },
        {
          "title": "阈值",
          "value": "0",
          "short": true
        },
        {
          "title": "触发时间",
          "value": "2024-01-01 00:00:00",
          "short": true
        }
      ],
      "footer": "告警ID: service_down_1640995200000 | 规则ID: service_down",
      "ts": 1640995200
    }
  ]
}
```

## 配置示例

### 完整配置示例

```typescript
// 通过代码配置
import { alertManager } from './src/collection/monitoring/alert-manager';

// 添加自定义告警规则
alertManager.addRule({
  id: 'custom_high_error_rate',
  name: '自定义错误率过高',
  description: '特定错误类型出现频率过高',
  severity: 'warning',
  enabled: true,
  condition: {
    metric: 'error_by_type',
    operator: '>',
    threshold: 10,
    duration: '5m'
  },
  notification: {
    channels: ['slack'],
    cooldown: 300000 // 5分钟
  },
  labels: {
    component: 'custom',
    impact: 'medium'
  }
});

// 添加自定义通知渠道
alertManager.addNotificationChannel({
  id: 'teams',
  name: 'Microsoft Teams通知',
  type: 'webhook',
  config: {
    url: 'https://your-teams-webhook.com',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  },
  enabled: true
});
```

### 环境变量配置

```bash
# 监控服务配置
export MONITORING_PORT=9090
export METRICS_UPDATE_INTERVAL=30000

# 告警配置
export ALERT_CHECK_INTERVAL=30000
export ALERT_HISTORY_RETENTION_DAYS=30

# 邮件通知配置
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_SECURE=false
export SMTP_USER=your-email@gmail.com
export SMTP_PASS=your-password
export ALERT_EMAIL_FROM=alerts@example.com
export ALERT_EMAIL_TO=admin@example.com
export EMAIL_ALERTS_ENABLED=true

# Slack通知配置
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
export SLACK_CHANNEL="#alerts"
export SLACK_USERNAME="Collection Alerts"
export SLACK_ICON_EMOJI=":warning:"
export SLACK_ALERTS_ENABLED=true

# Webhook配置
export WEBHOOK_URL=https://your-webhook.com/alerts
export WEBHOOK_ALERTS_ENABLED=false
```

### Docker Compose配置

```yaml
version: '3.8'

services:
  collection-service:
    image: everyday-news-collection:latest
    environment:
      # 监控配置
      - MONITORING_PORT=9090
      - METRICS_UPDATE_INTERVAL=30000

      # 告警配置
      - ALERT_CHECK_INTERVAL=30000

      # 邮件通知
      - SMTP_HOST=smtp.gmail.com
      - SMTP_PORT=587
      - SMTP_USER=${SMTP_USER}
      - SMTP_PASS=${SMTP_PASS}
      - ALERT_EMAIL_FROM=alerts@example.com
      - ALERT_EMAIL_TO=admin@example.com
      - EMAIL_ALERTS_ENABLED=true

      # Slack通知
      - SLACK_WEBHOOK_URL=${SLACK_WEBHOOK_URL}
      - SLACK_CHANNEL=#alerts
      - SLACK_ALERTS_ENABLED=true
    ports:
      - "9090:9090"
```

## 部署监控

### 1. 独立部署

#### 启动监控服务
```bash
# 直接运行
node dist/src/collection/monitoring/monitoring-service.js

# 或通过PM2
pm2 start dist/src/collection/monitoring/monitoring-service.js --name collection-monitoring
```

#### 配置Prometheus

`prometheus.yml` 配置：
```yaml
scrape_configs:
  - job_name: 'collection-service'
    static_configs:
      - targets: ['localhost:9090']
    scrape_interval: 30s
    scrape_timeout: 10s
    metrics_path: '/metrics'
```

#### 配置Grafana仪表板

导入预配置的仪表板JSON文件，包含：
1. 采集概览仪表板
2. 平台统计仪表板
3. 系统监控仪表板
4. 告警管理仪表板

### 2. 集成部署

#### 与采集服务一起运行
```bash
# 启动采集服务（自动启动监控服务）
node dist/src/collection/collection-service.js start
```

#### 验证监控
```bash
# 检查健康状态
curl http://localhost:9090/health

# 获取指标
curl http://localhost:9090/metrics

# 获取状态
curl http://localhost:9090/status
```

### 3. 容器化部署

#### Dockerfile
```dockerfile
FROM node:18-alpine

# 复制应用文件
COPY dist /app/dist
COPY node_modules /app/node_modules
COPY config /app/config

# 设置工作目录
WORKDIR /app

# 暴露监控端口
EXPOSE 9090

# 启动命令
CMD ["node", "dist/src/collection/collection-service.js", "start"]
```

#### Kubernetes部署

`deployment.yaml`:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: collection-service
spec:
  replicas: 1
  selector:
    matchLabels:
      app: collection-service
  template:
    metadata:
      labels:
        app: collection-service
    spec:
      containers:
      - name: collection-service
        image: everyday-news-collection:latest
        ports:
        - containerPort: 9090
          name: metrics
        env:
        - name: MONITORING_PORT
          value: "9090"
        - name: SLACK_WEBHOOK_URL
          valueFrom:
            secretKeyRef:
              name: alert-secrets
              key: slack-webhook-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 9090
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 9090
          initialDelaySeconds: 5
          periodSeconds: 5
```

`service.yaml`:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: collection-service
  annotations:
    prometheus.io/scrape: "true"
    prometheus.io/port: "9090"
    prometheus.io/path: "/metrics"
spec:
  selector:
    app: collection-service
  ports:
  - port: 9090
    targetPort: 9090
    name: metrics
```

## 故障排除

### 常见问题

#### 1. 监控服务无法启动

**症状**: 端口被占用或绑定失败

**解决方案**:
```bash
# 检查端口占用
netstat -tulpn | grep 9090

# 更改端口
export MONITORING_PORT=9091
node dist/src/collection/monitoring/monitoring-service.js

# 或通过代码指定端口
const { MonitoringService } = require('./dist/src/collection/monitoring/monitoring-service');
const service = new MonitoringService(9091);
service.start();
```

#### 2. 指标数据不更新

**症状**: `/metrics` 端点返回旧数据

**解决方案**:
```bash
# 检查采集服务是否正常运行
curl http://localhost:9090/health

# 检查是否有采集活动
curl http://localhost:9090/metrics/summary | jq '.totalCollections'

# 手动触发采集测试
curl -X POST http://localhost:9090/manage/test-alert
```

#### 3. 告警不触发

**症状**: 条件满足但未收到告警

**解决方案**:
```bash
# 检查告警规则状态
curl http://localhost:9090/alerts/rules | jq '.[] | select(.enabled==true)'

# 检查告警管理器状态
curl http://localhost:9090/alerts | jq '.status'

# 测试告警规则
curl -X POST http://localhost:9090/manage/test-alert

# 检查通知渠道
curl http://localhost:9090/alerts | jq '.status.channels'
```

#### 4. 通知发送失败

**症状**: 告警触发但未收到通知

**解决方案**:
```bash
# 测试邮件通知
export SMTP_HOST=smtp.gmail.com
export SMTP_PORT=587
export SMTP_USER=test@gmail.com
export SMTP_PASS=password
curl -X POST http://localhost:9090/manage/test-notification/email

# 测试Slack通知
export SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx/yyy/zzz
curl -X POST http://localhost:9090/manage/test-notification/slack

# 检查日志
tail -f /var/log/collection/collection.log | grep -E "(ERROR|WARN).*alert"
```

#### 5. Prometheus无法抓取指标

**症状**: Prometheus targets显示DOWN

**解决方案**:
```bash
# 检查端点可访问性
curl http://localhost:9090/metrics

# 检查网络连接
telnet localhost 9090

# 检查防火墙
sudo ufw status
sudo ufw allow 9090/tcp

# 验证Prometheus配置
curl http://prometheus:9090/targets
```

### 调试命令

#### 监控服务调试
```bash
# 启用调试日志
export LOG_LEVEL=debug
node dist/src/collection/monitoring/monitoring-service.js

# 检查进程状态
ps aux | grep monitoring-service

# 查看监控服务日志
tail -f /var/log/collection/monitoring.log
```

#### 指标调试
```bash
# 实时查看指标变化
watch -n 5 'curl -s http://localhost:9090/metrics/summary | jq .'

# 导出指标到文件
curl -s http://localhost:9090/metrics > metrics.txt

# 分析指标趋势
curl -s http://localhost:9090/metrics/json | jq '.collection_total'
```

#### 告警调试
```bash
# 查看活跃告警
curl -s http://localhost:9090/alerts/active | jq .

# 查看告警历史
curl -s "http://localhost:9090/alerts/history?limit=10" | jq .

# 手动触发测试告警
curl -X POST http://localhost:9090/manage/test-alert -H "Content-Type: application/json" -d '{"severity":"warning"}'
```

### 性能优化

#### 指标收集优化
```typescript
// 调整指标更新频率
const metricsCollector = new MetricsCollector();
metricsCollector.setUpdateInterval(60000); // 60秒

// 限制指标历史数据
metricsCollector.setHistoryLimit(1000);
```

#### 告警检查优化
```typescript
// 调整告警检查间隔
alertManager.setCheckInterval(60000); // 60秒

// 启用批量检查
alertManager.enableBatchProcessing(true);
```

#### 内存优化
```bash
# 限制Node.js内存使用
node --max-old-space-size=512 dist/src/collection/monitoring/monitoring-service.js

# 定期清理历史数据
curl -X POST http://localhost:9090/manage/cleanup-history
```

### 监控最佳实践

#### 1. 分层监控
- **基础层**: 系统资源监控（CPU、内存、磁盘）
- **应用层**: 采集服务监控（成功率、延迟、队列）
- **业务层**: 平台特定监控（各平台采集状态）

#### 2. 告警分级
- **P0 (紧急)**: 服务完全不可用，立即处理
- **P1 (重要)**: 主要功能受影响，2小时内处理
- **P2 (警告)**: 性能下降或次要问题，24小时内处理
- **P3 (信息)**: 需要关注但不影响业务，定期处理

#### 3. 通知策略
- **实时通知**: 紧急告警通过多个渠道立即通知
- **批量通知**: 非紧急告警汇总后定时发送
- **静默期**: 维护期间临时禁用非紧急告警

#### 4. 容量规划
- **指标存储**: 保留30天历史数据
- **告警历史**: 保留90天告警记录
- **资源预留**: 为监控系统预留20%的系统资源

#### 5. 定期演练
- **月度演练**: 测试所有告警规则和通知渠道
- **季度复盘**: 分析告警效果，优化规则
- **年度审计**: 审查监控体系完整性

## 附录

### API参考

#### 健康检查
```
GET /health
```

#### 指标端点
```
GET /metrics              # Prometheus格式
GET /metrics/json         # JSON格式
GET /metrics/summary      # 指标摘要
```

#### 告警端点
```
GET /alerts               # 所有告警
GET /alerts/active        # 活跃告警
GET /alerts/history       # 告警历史
GET /alerts/rules         # 告警规则
POST /alerts/acknowledge/{ruleId}  # 确认告警
```

#### 状态端点
```
GET /status               # 状态信息
GET /status/detailed      # 详细状态
```

#### 管理端点
```
POST /manage/reset-metrics         # 重置指标
POST /manage/test-alert            # 测试告警
POST /manage/test-notification/{channelId}  # 测试通知渠道
```

### 工具脚本

#### 监控状态检查脚本
```bash
#!/bin/bash
# check-monitoring.sh

HOST=${1:-localhost}
PORT=${2:-9090}

echo "=== 监控状态检查 ==="
echo "时间: $(date)"
echo "主机: $HOST:$PORT"
echo ""

# 检查健康状态
echo "1. 健康状态:"
curl -s "http://$HOST:$PORT/health" | jq -r '.status'

# 检查指标
echo -e "\n2. 指标摘要:"
curl -s "http://$HOST:$PORT/metrics/summary" | jq '{
  uptime: .uptime,
  totalCollections: .totalCollections,
  successRate: .successRate,
  totalItems: .totalItems
}'

# 检查告警
echo -e "\n3. 告警状态:"
curl -s "http://$HOST:$PORT/alerts" | jq '.status.alerts'

# 检查系统状态
echo -e "\n4. 系统状态:"
curl -s "http://$HOST:$PORT/status" | jq '.system'
```

#### 告警测试脚本
```bash
#!/bin/bash
# test-alerts.sh

HOST=${1:-localhost}
PORT=${2:-9090}

echo "=== 告警测试 ==="

# 测试服务宕机告警
echo "1. 测试服务宕机告警..."
curl -X POST "http://$HOST:$PORT/manage/test-alert" \
  -H "Content-Type: application/json" \
  -d '{"severity":"critical"}'

sleep 5

# 检查告警状态
echo -e "\n2. 检查告警状态..."
curl -s "http://$HOST:$PORT/alerts/active" | jq '.[] | {name: .name, severity: .severity, status: .status}'

# 测试通知渠道
echo -e "\n3. 测试通知渠道..."
if [ -n "$SLACK_WEBHOOK_URL" ]; then
  echo "测试Slack通知..."
  curl -X POST "http://$HOST:$PORT/manage/test-notification/slack"
fi

if [ -n "$SMTP_USER" ]; then
  echo "测试邮件通知..."
  curl -X POST "http://$HOST:$PORT/manage/test-notification/email"
fi

echo -e "\n测试完成"
```

### 相关资源

- [Prometheus文档](https://prometheus.io/docs/)
- [Grafana文档](https://grafana.com/docs/)
- [Node.js性能监控](https://nodejs.org/en/docs/guides/diagnostics/)
- [监控最佳实践](https://landing.google.com/sre/sre-book/chapters/monitoring-distributed-systems/)

### 支持联系

如有监控相关问题，请联系：

- **技术支持**: support@example.com
- **紧急响应**: ops@example.com
- **文档反馈**: docs@example.com
- **GitHub Issues**: https://github.com/your-repo/issues