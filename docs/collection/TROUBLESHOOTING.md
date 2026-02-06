# 数据采集模块故障排除和运维指南

## 目录

1. [快速诊断](#快速诊断)
2. [常见问题](#常见问题)
3. [服务监控](#服务监控)
4. [性能优化](#性能优化)
5. [数据管理](#数据管理)
6. [安全运维](#安全运维)
7. [备份恢复](#备份恢复)
8. [升级维护](#升级维护)
9. [紧急响应](#紧急响应)

## 快速诊断

### 诊断流程图

```
服务无法启动
    ↓
检查日志文件
    ↓
├─ 配置文件错误 → 修复配置 → 重启服务
├─ 端口冲突 → 更改端口 → 重启服务
├─ 依赖缺失 → 安装依赖 → 重启服务
└─ 权限问题 → 修复权限 → 重启服务

服务启动但无法采集
    ↓
检查网络连接
    ↓
├─ 网络不通 → 检查防火墙/代理 → 测试连接
├─ DNS问题 → 检查DNS配置 → 刷新缓存
└─ 目标网站屏蔽 → 调整反爬策略 → 使用代理

采集性能下降
    ↓
检查系统资源
    ↓
├─ 内存不足 → 增加内存/优化配置
├─ CPU过高 → 减少并发/优化代码
└─ 磁盘IO高 → 使用SSD/优化存储
```

### 快速检查命令

```bash
# 1. 检查服务状态
systemctl status collection-service  # 系统服务
docker-compose ps                    # Docker容器
pm2 status                          # PM2进程

# 2. 检查日志
tail -f /var/log/collection/collection.log
docker-compose logs -f collection-service
journalctl -u collection-service -f

# 3. 检查网络
curl -I https://twitter.com
docker exec collection-service ping -c 3 twitter.com
nslookup twitter.com

# 4. 检查资源
top -p $(pgrep -f collection-service)
docker stats collection-service
df -h /app/data

# 5. 检查配置
node -c config/collection.config.json
npm run config:validate
```

### 健康检查端点

如果启用了HTTP服务，可以使用以下端点：

```bash
# 健康检查
curl http://localhost:9090/health

# 状态信息
curl http://localhost:9090/status

# 指标数据
curl http://localhost:9090/metrics

# 版本信息
curl http://localhost:9090/version
```

## 常见问题

### 1. 服务无法启动

#### 症状
- 容器立即退出
- 系统服务启动失败
- 进程不存在

#### 解决方案

**步骤1: 检查日志**
```bash
# Docker容器
docker logs collection-service

# 系统服务
journalctl -u collection-service -n 50

# 直接运行
node dist/src/collection/collection-service.js start 2>&1 | head -50
```

**步骤2: 常见错误及修复**

| 错误信息 | 可能原因 | 解决方案 |
|----------|----------|----------|
| `Error: Cannot find module` | 依赖缺失 | `npm ci` 或 `docker build` |
| `Error: EACCES: permission denied` | 权限不足 | `chmod +x` 或 `chown` |
| `Error: listen EADDRINUSE` | 端口占用 | 更改端口或停止占用进程 |
| `Error: Invalid configuration` | 配置错误 | `npm run config:validate` |
| `Error: Database connection failed` | 数据库问题 | 检查数据库连接和权限 |

**步骤3: 调试模式启动**
```bash
# 启用调试
export NODE_ENV=development
export LOG_LEVEL=debug

# 启动服务
node --inspect dist/src/collection/collection-service.js start
```

### 2. 采集任务失败

#### 症状
- 采集任务状态为FAILED
- 日志显示网络错误
- 无数据产出

#### 解决方案

**步骤1: 检查网络连接**
```bash
# 测试目标网站
curl -I https://twitter.com --connect-timeout 10

# 测试DNS解析
dig twitter.com +short

# 测试代理（如果使用）
curl -x http://proxy:port https://twitter.com
```

**步骤2: 检查反爬配置**
```json
{
  "antiCrawling": {
    "enabled": true,
    "requestDelay": {
      "minDelay": 3000,  # 增加延迟
      "maxDelay": 10000
    },
    "userAgents": {
      "enabled": true,
      "rotation": true
    }
  }
}
```

**步骤3: 启用代理**
```bash
# 临时启用代理
export HTTP_PROXY=http://proxy:port
export HTTPS_PROXY=http://proxy:port

# 或修改配置
{
  "antiCrawling": {
    "proxy": {
      "enabled": true,
      "list": ["http://proxy1:port", "http://proxy2:port"]
    }
  }
}
```

**步骤4: 平台特定问题**

| 平台 | 常见问题 | 解决方案 |
|------|----------|----------|
| Twitter | API限制、登录要求 | 使用API密钥、调整频率 |
| YouTube | 年龄限制、区域限制 | 使用Cookie、代理服务器 |
| TikTok | 强反爬、JavaScript渲染 | 使用浏览器自动化、调整延迟 |
| 微博 | 登录验证、频率限制 | 使用Cookie、增加延迟 |
| 抖音 | 强反爬、App限制 | 使用移动端User-Agent |

### 3. 性能问题

#### 症状
- 采集速度慢
- 内存使用高
- CPU使用率高
- 响应延迟大

#### 解决方案

**步骤1: 资源监控**
```bash
# 实时监控
htop
docker stats
nmon

# 历史分析
sar -u 1 10      # CPU使用率
sar -r 1 10      # 内存使用率
iostat -x 1 10   # 磁盘IO
```

**步骤2: 性能优化配置**

```json
{
  "system": {
    "maxConcurrentCollections": 2,  # 减少并发
    "maxItemsPerCollection": 50,    # 减少采集量
    "requestTimeout": 60000         # 增加超时
  },
  "antiCrawling": {
    "requestDelay": {
      "minDelay": 2000,            # 增加延迟
      "maxDelay": 8000
    }
  }
}
```

**步骤3: 内存优化**
```bash
# 检查内存泄漏
node --inspect --trace-gc dist/src/collection/collection-service.js start

# 分析内存快照
npm install -g heapdump
# 在代码中添加：require('heapdump').writeSnapshot()
```

**步骤4: 数据库优化**
```bash
# SQLite优化
sqlite3 data/collection.db "PRAGMA optimize;"
sqlite3 data/collection.db "VACUUM;"
sqlite3 data/collection.db "ANALYZE;"
```

### 4. 数据质量问题

#### 症状
- 重复数据多
- 数据字段缺失
- 编码问题
- 日期格式不一致

#### 解决方案

**步骤1: 检查数据清洗配置**
```json
{
  "dataCleaning": {
    "deduplication": {
      "enabled": true,
      "similarityThreshold": 0.85  # 提高阈值
    },
    "validation": {
      "enabled": true,
      "requiredFields": ["title", "url", "platform", "publishedAt"]
    }
  }
}
```

**步骤2: 数据验证**
```bash
# 检查数据完整性
node -e "
const db = require('better-sqlite3')('./data/collection.db');
const rows = db.prepare('SELECT COUNT(*) as count FROM news_items').get();
console.log('总记录数:', rows.count);

const invalid = db.prepare('SELECT COUNT(*) as count FROM news_items WHERE title IS NULL OR url IS NULL').get();
console.log('无效记录:', invalid.count);
"

# 检查重复数据
node -e "
const db = require('better-sqlite3')('./data/collection.db');
const duplicates = db.prepare('SELECT url, COUNT(*) as count FROM news_items GROUP BY url HAVING count > 1').all();
console.log('重复URL数量:', duplicates.length);
"
```

**步骤3: 数据修复**
```bash
# 删除重复数据
sqlite3 data/collection.db "
DELETE FROM news_items
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM news_items
  GROUP BY url
);
"

# 修复编码问题
node -e "
const iconv = require('iconv-lite');
// 处理GBK到UTF-8转换
function fixEncoding(text) {
  try {
    return iconv.decode(iconv.encode(text, 'gbk'), 'utf-8');
  } catch (e) {
    return text;
  }
}
"
```

### 5. 监控告警问题

#### 症状
- 监控数据缺失
- 告警不触发
- 指标异常

#### 解决方案

**步骤1: 检查监控配置**
```json
{
  "monitoring": {
    "enabled": true,
    "metrics": {
      "collection": {
        "enabled": true,
        "interval": 30000
      }
    },
    "alerts": {
      "enabled": true,
      "rules": {
        "serviceDown": {
          "enabled": true,
          "threshold": 1
        }
      }
    }
  }
}
```

**步骤2: 测试监控端点**
```bash
# 检查指标端点
curl http://localhost:9090/metrics | head -20

# 检查健康端点
curl -s http://localhost:9090/health | jq .

# 检查Prometheus抓取
curl http://prometheus:9090/targets
```

**步骤3: 验证告警规则**
```bash
# 测试告警条件
node -e "
const result = require('./dist/src/collection/monitoring').checkAlerts();
console.log('告警检查结果:', result);
"

# 手动触发测试告警
node -e "
require('./dist/src/collection/monitoring').triggerTestAlert();
"
```

## 服务监控

### 监控指标

#### 关键指标

| 指标 | 描述 | 正常范围 | 告警阈值 |
|------|------|----------|----------|
| `collection_total` | 总采集次数 | 持续增长 | 1小时内无增长 |
| `collection_success_rate` | 采集成功率 | >90% | <70% |
| `collection_duration_avg` | 平均采集耗时 | <60s | >300s |
| `memory_usage_percent` | 内存使用率 | <70% | >90% |
| `cpu_usage_percent` | CPU使用率 | <60% | >90% |
| `disk_usage_percent` | 磁盘使用率 | <80% | >95% |
| `queue_length` | 任务队列长度 | <10 | >50 |

#### 平台特定指标

| 平台 | 关键指标 | 说明 |
|------|----------|------|
| Twitter | `twitter_collection_total` | Twitter采集次数 |
| YouTube | `youtube_videos_collected` | 采集的视频数 |
| TikTok | `tiktok_collection_duration` | TikTok采集耗时 |
| 微博 | `weibo_hot_topics` | 热搜话题数 |
| 抖音 | `douyin_videos_collected` | 抖音视频数 |

### 监控工具配置

#### Prometheus配置

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'collection-service'
    static_configs:
      - targets: ['collection-service:9090']
    scrape_interval: 30s
    scrape_timeout: 10s
```

#### Grafana仪表板

导入预配置的仪表板：
1. 采集概览仪表板
2. 性能监控仪表板
3. 平台统计仪表板
4. 告警管理仪表板

### 日志管理

#### 日志级别配置

```json
{
  "monitoring": {
    "logging": {
      "level": "info",
      "output": {
        "console": true,
        "file": true,
        "path": "/var/log/collection/collection.log",
        "rotation": {
          "enabled": true,
          "maxSize": "100m",
          "maxFiles": 10,
          "compress": true
        }
      }
    }
  }
}
```

#### 日志分析

```bash
# 错误日志分析
grep -E "(ERROR|FATAL)" /var/log/collection/collection.log | tail -20

# 性能日志分析
grep "collection duration" /var/log/collection/collection.log | awk '{print $NF}' | sort -n | tail -5

# 平台统计
grep -o "platform:[a-z]*" /var/log/collection/collection.log | sort | uniq -c

# 时间分布分析
awk '{print $1}' /var/log/collection/collection.log | cut -d'T' -f1 | uniq -c
```

## 性能优化

### 配置优化

#### 并发控制优化

```json
{
  "system": {
    "maxConcurrentCollections": 3,  # 根据CPU核心数调整
    "maxItemsPerCollection": 100    # 根据内存调整
  }
}
```

推荐配置：
- 2核CPU: `maxConcurrentCollections: 2`
- 4核CPU: `maxConcurrentCollections: 3-4`
- 8核CPU: `maxConcurrentCollections: 6-8`

#### 内存优化

```json
{
  "system": {
    "cache": {
      "enabled": true,
      "ttl": 1800000,      # 30分钟
      "maxSize": 500       # 减少缓存大小
    }
  }
}
```

#### 网络优化

```json
{
  "antiCrawling": {
    "requestDelay": {
      "minDelay": 1000,    # 减少延迟
      "maxDelay": 3000
    }
  }
}
```

### 数据库优化

#### SQLite优化

```bash
# 定期优化
sqlite3 data/collection.db "
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA cache_size = -2000;
PRAGMA foreign_keys = ON;
PRAGMA optimize;
"

# 创建索引
sqlite3 data/collection.db "
CREATE INDEX IF NOT EXISTS idx_url ON news_items(url);
CREATE INDEX IF NOT EXISTS idx_platform ON news_items(platform);
CREATE INDEX IF NOT EXISTS idx_published ON news_items(publishedAt);
CREATE INDEX IF NOT EXISTS idx_created ON news_items(createdAt);
"
```

#### 数据清理

```bash
# 清理旧数据
sqlite3 data/collection.db "
DELETE FROM news_items
WHERE createdAt < datetime('now', '-30 days');

-- 清理任务历史
DELETE FROM task_history
WHERE completedAt < datetime('now', '-7 days');
"
```

### 代码优化

#### 内存泄漏检测

```javascript
// 启用内存监控
const heapdump = require('heapdump');

setInterval(() => {
  const used = process.memoryUsage();
  console.log(`内存使用: ${Math.round(used.heapUsed / 1024 / 1024)}MB`);

  if (used.heapUsed > 500 * 1024 * 1024) { // 500MB
    heapdump.writeSnapshot(`heapdump-${Date.now()}.heapsnapshot`);
  }
}, 60000);
```

#### 性能分析

```bash
# 使用0x进行性能分析
npx 0x dist/src/collection/collection-service.js start

# 使用clinic.js
npx clinic doctor -- node dist/src/collection/collection-service.js start
npx clinic flame -- node dist/src/collection/collection-service.js start
```

## 数据管理

### 数据备份

#### 自动备份配置

```json
{
  "system": {
    "storage": {
      "backup": {
        "enabled": true,
        "schedule": "0 2 * * *",  # 每天2点
        "retentionDays": 30,
        "compression": true,
        "encryption": false
      }
    }
  }
}
```

#### 手动备份

```bash
# 完整备份
./deploy/collection/backup.sh full

# 增量备份
./deploy/collection/backup.sh incremental

# 列出备份
./deploy/collection/backup.sh list

# 验证备份
./deploy/collection/backup.sh verify latest
```

#### 备份脚本示例

```bash
#!/bin/bash
# backup.sh

BACKUP_DIR="/app/data/backups"
DATA_DIR="/app/data/collection"
DATE=$(date +%Y%m%d_%H%M%S)

case "$1" in
  full)
    tar -czf "$BACKUP_DIR/full_$DATE.tar.gz" "$DATA_DIR"
    echo "完整备份完成: full_$DATE.tar.gz"
    ;;
  incremental)
    rsync -av --link-dest="$BACKUP_DIR/latest" "$DATA_DIR" "$BACKUP_DIR/incr_$DATE"
    ln -sfn "incr_$DATE" "$BACKUP_DIR/latest"
    echo "增量备份完成: incr_$DATE"
    ;;
  list)
    ls -la "$BACKUP_DIR"
    ;;
  verify)
    tar -tzf "$BACKUP_DIR/$2" > /dev/null && echo "备份有效" || echo "备份损坏"
    ;;
  *)
    echo "用法: $0 {full|incremental|list|verify}"
    ;;
esac
```

### 数据恢复

#### 恢复步骤

1. **停止服务**
   ```bash
   systemctl stop collection-service
   # 或
   docker-compose stop collection-service
   ```

2. **恢复备份**
   ```bash
   # 解压备份
   tar -xzf /app/data/backups/full_20240101.tar.gz -C /tmp/restore

   # 恢复数据
   cp -r /tmp/restore/data/collection/* /app/data/collection/

   # 修复权限
   chown -R nodejs:nodejs /app/data/collection
   ```

3. **验证数据**
   ```bash
   sqlite3 /app/data/collection/data.db "SELECT COUNT(*) FROM news_items;"
   ```

4. **启动服务**
   ```bash
   systemctl start collection-service
   # 或
   docker-compose start collection-service
   ```

#### 灾难恢复计划

1. **恢复时间目标 (RTO)**: 1小时
2. **恢复点目标 (RPO)**: 15分钟
3. **备份策略**: 每日全备 + 每小时增量
4. **异地备份**: 启用云存储备份

### 数据迁移

#### 版本升级迁移

```bash
# 1. 备份当前数据
./deploy/collection/backup.sh full

# 2. 运行迁移脚本
node dist/src/collection/migrations/migrate-v1-to-v2.js

# 3. 验证迁移
node dist/src/collection/migrations/verify-migration.js

# 4. 回滚计划（如果需要）
./deploy/collection/restore.sh latest
```

#### 数据库迁移

```bash
# SQLite到MySQL迁移
node dist/src/collection/migrations/sqlite-to-mysql.js \
  --source ./data/collection.db \
  --destination mysql://user:pass@localhost:3306/collection
```

## 安全运维

### 安全配置

#### 最小权限原则

```bash
# 创建专用用户
useradd -r -s /bin/false collection-user

# 设置目录权限
chown -R collection-user:collection-user /app/data
chmod 750 /app/data
chmod 640 /app/data/collection.db
```

#### 网络安全

```bash
# 防火墙配置
ufw allow 9090/tcp comment "Collection service"
ufw allow from 192.168.1.0/24 to any port 9090

# 或使用iptables
iptables -A INPUT -p tcp --dport 9090 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 9090 -j DROP
```

#### 敏感信息保护

```json
{
  "system": {
    "security": {
      "encryptSecrets": true,
      "keyPath": "/etc/collection/secrets.key",
      "rotateKeys": true,
      "keyRotationDays": 90
    }
  }
}
```

### 安全监控

#### 入侵检测

```bash
# 检查异常登录
last -f /var/log/auth.log | grep -v "still logged in"

# 检查文件修改
find /app -type f -mtime -1 -ls

# 检查进程
ps aux | grep -E "(collection-service|node)" | grep -v grep
```

#### 日志审计

```bash
# 安全日志分析
grep -E "(FAILED|ERROR|WARN).*(auth|login|password)" /var/log/collection/collection.log

# 访问日志分析
grep "9090" /var/log/nginx/access.log | awk '{print $1}' | sort | uniq -c | sort -nr
```

### 漏洞管理

#### 定期更新

```bash
# 更新依赖
npm audit
npm audit fix
npm update

# 更新基础镜像
docker pull node:18-alpine
```

#### 安全扫描

```bash
# 容器安全扫描
docker scan everyday-news-collection:latest

# 代码安全扫描
npm run security:scan

# 依赖漏洞检查
npx snyk test
```

## 备份恢复

### 备份策略

#### 多级备份

1. **本地备份**: 每日全备 + 每小时增量
2. **网络备份**: 实时同步到NAS
3. **云备份**: 每周上传到云存储
4. **异地备份**: 每月复制到异地

#### 备份配置示例

```json
{
  "backup": {
    "local": {
      "enabled": true,
      "schedule": "0 2 * * *",
      "retentionDays": 7
    },
    "nas": {
      "enabled": true,
      "host": "nas.local",
      "path": "/backup/collection",
      "schedule": "*/30 * * * *"
    },
    "cloud": {
      "enabled": false,
      "provider": "s3",
      "bucket": "collection-backup",
      "schedule": "0 3 * * 0"
    }
  }
}
```

### 恢复测试

#### 定期恢复测试

```bash
# 每月执行恢复测试
#!/bin/bash
# test-recovery.sh

echo "=== 恢复测试开始 ==="

# 1. 选择测试备份
BACKUP_FILE=$(ls -t /app/data/backups/full_*.tar.gz | head -1)
echo "测试备份: $BACKUP_FILE"

# 2. 创建测试环境
TEST_DIR="/tmp/recovery-test-$(date +%s)"
mkdir -p "$TEST_DIR"

# 3. 恢复备份
tar -xzf "$BACKUP_FILE" -C "$TEST_DIR"

# 4. 验证数据
if [ -f "$TEST_DIR/data/collection/data.db" ]; then
  COUNT=$(sqlite3 "$TEST_DIR/data/collection/data.db" "SELECT COUNT(*) FROM news_items;" 2>/dev/null || echo "0")
  echo "恢复记录数: $COUNT"

  if [ "$COUNT" -gt 0 ]; then
    echo "✓ 恢复测试成功"
  else
    echo "✗ 恢复测试失败: 无数据"
  fi
else
  echo "✗ 恢复测试失败: 数据库文件不存在"
fi

# 5. 清理
rm -rf "$TEST_DIR"
echo "=== 恢复测试结束 ==="
```

#### 恢复演练计划

1. **季度演练**: 完整恢复流程
2. **月度测试**: 数据验证测试
3. **周度检查**: 备份完整性检查
4. **每日监控**: 备份任务监控

## 升级维护

### 版本升级

#### 升级前准备

1. **检查兼容性**
   ```bash
   npm ls --depth=0
   node --version
   docker --version
   ```

2. **备份数据**
   ```bash
   ./deploy/collection/backup.sh full
   ```

3. **阅读更新日志**
   ```bash
   cat CHANGELOG.md | grep -A 10 "## v"
   ```

#### 升级步骤

```bash
# 1. 停止服务
systemctl stop collection-service

# 2. 备份配置
cp config/collection.config.json config/collection.config.json.backup

# 3. 更新代码
git pull origin main

# 4. 更新依赖
npm ci

# 5. 运行迁移
npm run db:migrate

# 6. 构建项目
npm run build

# 7. 启动服务
systemctl start collection-service

# 8. 验证升级
npm run test:smoke
```

#### 回滚计划

```bash
# 如果升级失败
systemctl stop collection-service
git reset --hard HEAD^
npm ci
./deploy/collection/restore.sh latest
systemctl start collection-service
```

### 维护窗口

#### 计划维护

- **时间**: 每周日凌晨2:00-4:00
- **时长**: 2小时
- **通知**: 提前24小时通知
- **回滚时间**: 30分钟

#### 维护检查清单

- [ ] 备份数据
- [ ] 检查日志
- [ ] 验证监控
- [ ] 测试功能
- [ ] 更新文档
- [ ] 通知完成

## 紧急响应

### 紧急情况分类

#### P0 - 严重故障
- 服务完全不可用
- 数据丢失或损坏
- 安全漏洞被利用

**响应时间**: 15分钟内
**解决时间**: 2小时内

#### P1 - 重大故障
- 主要功能不可用
- 性能严重下降
- 数据不一致

**响应时间**: 30分钟内
**解决时间**: 4小时内

#### P2 - 一般故障
- 次要功能问题
- 性能轻微下降
- 监控告警

**响应时间**: 2小时内
**解决时间**: 24小时内

#### P3 - 轻微问题
- 界面问题
- 文档错误
- 功能建议

**响应时间**: 24小时内
**解决时间**: 7天内

### 紧急响应流程

#### 1. 问题识别
```bash
# 快速诊断
./deploy/collection/diagnose.sh

# 收集信息
./deploy/collection/collect-info.sh > incident-$(date +%s).log
```

#### 2. 问题分类
```bash
# 根据影响程度分类
IMPACT=$(
  if systemctl is-active collection-service; then
    echo "P2"
  else
    echo "P1"
  fi
)
echo "问题级别: $IMPACT"
```

#### 3. 紧急处理
```bash
# 服务重启
systemctl restart collection-service

# 或回滚
./deploy/collection/rollback.sh

# 或切换备用
./deploy/collection/failover.sh
```

#### 4. 根本原因分析
```bash
# 分析日志
./deploy/collection/analyze-logs.sh

# 检查配置
./deploy/collection/check-config.sh

# 测试功能
./deploy/collection/test-functionality.sh
```

#### 5. 修复部署
```bash
# 应用修复
git apply fix.patch

# 或更新版本
git pull origin hotfix

# 重新部署
./deploy/collection/deploy.sh
```

#### 6. 验证恢复
```bash
# 功能验证
./deploy/collection/verify-recovery.sh

# 监控验证
./deploy/collection/check-monitoring.sh

# 通知完成
./deploy/collection/notify-resolved.sh
```

### 紧急联系人

| 角色 | 姓名 | 电话 | 邮箱 | 值班时间 |
|------|------|------|------|----------|
| 运维主管 | 张三 | 13800138000 | zhangsan@example.com | 24/7 |
| 开发负责人 | 李四 | 13900139000 | lisi@example.com | 工作日 9:00-18:00 |
| 数据库管理员 | 王五 | 13700137000 | wangwu@example.com | 工作日 9:00-18:00 |
| 网络管理员 | 赵六 | 13600136000 | zhaoliu@example.com | 24/7 |

### 事后复盘

#### 复盘会议
- **时间**: 故障解决后24小时内
- **参与人**: 所有相关人员
- **时长**: 1-2小时

#### 复盘文档
```markdown
# 故障复盘报告

## 故障概述
- 时间: 2024-01-01 10:00
- 持续时间: 2小时
- 影响范围: 所有采集任务
- 故障级别: P1

## 时间线
1. 10:00 - 监控告警
2. 10:05 - 开始响应
3. 10:30 - 问题定位
4. 11:00 - 实施修复
5. 12:00 - 恢复验证

## 根本原因
数据库连接池耗尽导致服务不可用

## 纠正措施
1. 增加数据库连接池大小
2. 添加连接池监控
3. 优化SQL查询

## 预防措施
1. 定期进行压力测试
2. 完善监控告警
3. 建立容量规划

## 经验教训
1. 需要更好的容量规划
2. 监控需要更及时
3. 应急预案需要演练
```

## 附录

### 常用命令速查

```bash
# 服务管理
systemctl start collection-service
systemctl stop collection-service
systemctl restart collection-service
systemctl status collection-service
systemctl enable collection-service
systemctl disable collection-service

# Docker管理
docker-compose up -d
docker-compose down
docker-compose logs -f
docker-compose ps
docker-compose restart collection-service

# 数据管理
sqlite3 data/collection.db ".tables"
sqlite3 data/collection.db "SELECT COUNT(*) FROM news_items;"
sqlite3 data/collection.db "VACUUM;"

# 日志管理
tail -f /var/log/collection/collection.log
grep ERROR /var/log/collection/collection.log
journalctl -u collection-service -f

# 监控检查
curl http://localhost:9090/health
curl http://localhost:9090/metrics
curl http://localhost:9090/status

# 备份恢复
./deploy/collection/backup.sh full
./deploy/collection/restore.sh latest
./deploy/collection/verify-backup.sh

# 配置管理
npm run config:validate
npm run config:show
npm run config:test
```

### 资源链接

- [项目文档](docs/)
- [监控面板](http://grafana:3000)
- [问题跟踪](https://github.com/your-repo/issues)
- [知识库](https://wiki.example.com/collection)
- [API文档](http://localhost:9090/api-docs)

### 支持渠道

1. **内部支持**
   - Slack频道: #collection-support
   - 邮件列表: collection-team@example.com
   - 电话支持: 400-xxx-xxxx

2. **外部支持**
   - 社区论坛: https://forum.example.com
   - Stack Overflow: tag:everyday-news
   - GitHub Discussions: https://github.com/your-repo/discussions

3. **紧急支持**
   - 值班电话: 13800138000
   - 紧急邮箱: emergency@example.com
   - 短信通知: 13900139000