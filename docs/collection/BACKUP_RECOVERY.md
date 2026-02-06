# 数据采集模块备份和恢复指南

## 目录

1. [备份策略](#备份策略)
2. [备份配置](#备份配置)
3. [备份操作](#备份操作)
4. [恢复操作](#恢复操作)
5. [灾难恢复](#灾难恢复)
6. [最佳实践](#最佳实践)
7. [故障排除](#故障排除)

## 备份策略

### 备份类型

#### 1. 完整备份
- **内容**: 所有数据文件、配置文件、日志文件
- **频率**: 每日一次
- **保留期**: 30天
- **特点**: 恢复速度快，占用空间大

#### 2. 增量备份
- **内容**: 自上次完整备份以来的变更文件
- **频率**: 每6小时一次
- **保留期**: 7天
- **特点**: 占用空间小，恢复需要完整备份

#### 3. 数据库备份
- **内容**: 仅数据库文件
- **频率**: 每小时一次
- **保留期**: 24小时
- **特点**: 针对数据库的快速备份

#### 4. 配置备份
- **内容**: 仅配置文件
- **频率**: 每次配置变更时
- **保留期**: 永久
- **特点**: 快速恢复配置

### 备份层级

```
完整备份 (每日)
    ↓
增量备份 (每6小时)
    ↓
数据库备份 (每小时)
    ↓
配置备份 (实时)
```

### 保留策略

| 备份类型 | 保留期限 | 最大数量 | 自动清理 |
|----------|----------|----------|----------|
| 完整备份 | 30天 | 30个 | 是 |
| 增量备份 | 7天 | 28个 | 是 |
| 数据库备份 | 24小时 | 24个 | 是 |
| 配置备份 | 永久 | 无限制 | 否 |

### 存储策略

#### 本地存储
- **位置**: `./data/backups/`
- **容量**: 至少保留10GB空间
- **访问**: 仅备份服务可访问

#### 网络存储 (可选)
- **类型**: NAS、SAN、云存储
- **同步**: 实时或定时同步
- **加密**: 建议启用传输加密

#### 云存储 (可选)
- **服务**: AWS S3、Google Cloud Storage、Azure Blob
- **特性**: 版本控制、生命周期管理
- **成本**: 按使用量计费

## 备份配置

### 默认配置

```json
{
  "backupDir": "./data/backups",
  "dataDir": "./data/collection",
  "configDir": "./config",
  "logDir": "./logs",
  "schedule": {
    "full": "0 2 * * *",
    "incremental": "0 */6 * * *",
    "retentionDays": 30
  },
  "compression": {
    "enabled": true,
    "level": 6
  },
  "encryption": {
    "enabled": false,
    "algorithm": "aes-256-gcm",
    "keyPath": "./secrets/backup.key"
  },
  "verification": {
    "enabled": true,
    "checksum": true,
    "integrityCheck": true
  },
  "notification": {
    "enabled": true,
    "onSuccess": false,
    "onFailure": true,
    "channels": ["log"]
  },
  "storage": {
    "maxBackups": 100,
    "maxTotalSize": 10240,
    "cleanupOldBackups": true
  }
}
```

### 环境变量配置

```bash
# 备份目录配置
export BACKUP_DIR=/data/backups
export DATA_DIR=/data/collection
export CONFIG_DIR=/app/config
export LOG_DIR=/var/log/collection

# 计划配置
export FULL_BACKUP_SCHEDULE="0 2 * * *"
export INCREMENTAL_BACKUP_SCHEDULE="0 */6 * * *"
export BACKUP_RETENTION_DAYS=30

# 压缩配置
export BACKUP_COMPRESSION_ENABLED=true
export BACKUP_COMPRESSION_LEVEL=6

# 加密配置
export BACKUP_ENCRYPTION_ENABLED=false
export BACKUP_ENCRYPTION_KEY_PATH=/secrets/backup.key

# 验证配置
export BACKUP_VERIFICATION_ENABLED=true
export BACKUP_CHECKSUM_ENABLED=true
export BACKUP_INTEGRITY_CHECK_ENABLED=true

# 通知配置
export BACKUP_NOTIFICATION_ENABLED=true
export BACKUP_NOTIFY_ON_SUCCESS=false
export BACKUP_NOTIFY_ON_FAILURE=true
export BACKUP_NOTIFICATION_CHANNELS=log,email

# 存储配置
export MAX_BACKUPS=100
export MAX_BACKUP_SIZE_MB=10240
export CLEANUP_OLD_BACKUPS=true
```

### Docker配置

```yaml
version: '3.8'

services:
  collection-service:
    image: everyday-news-collection:latest
    volumes:
      # 数据持久化
      - collection_data:/app/data/collection
      - collection_backups:/app/data/backups
      - collection_logs:/var/log/collection
      # 配置挂载
      - ./config:/app/config:ro
    environment:
      # 备份配置
      - BACKUP_DIR=/app/data/backups
      - DATA_DIR=/app/data/collection
      - CONFIG_DIR=/app/config
      - LOG_DIR=/var/log/collection
      - FULL_BACKUP_SCHEDULE=0 2 * * *
      - INCREMENTAL_BACKUP_SCHEDULE=0 */6 * * *
    # 备份容器
    depends_on:
      - backup-service

  backup-service:
    image: everyday-news-collection:latest
    command: ["node", "dist/src/collection/backup/backup-cli.js", "schedule"]
    volumes:
      - collection_data:/app/data/collection:ro
      - collection_backups:/app/data/backups
      - ./config:/app/config:ro
    environment:
      - BACKUP_ENCRYPTION_ENABLED=true
      - BACKUP_ENCRYPTION_KEY_PATH=/run/secrets/backup-key
    secrets:
      - backup-key

volumes:
  collection_data:
  collection_backups:
  collection_logs:

secrets:
  backup-key:
    file: ./secrets/backup.key
```

## 备份操作

### 命令行工具

#### 安装工具
```bash
# 授予执行权限
chmod +x dist/src/collection/backup/backup-cli.js

# 创建符号链接
ln -s $(pwd)/dist/src/collection/backup/backup-cli.js /usr/local/bin/collection-backup
```

#### 创建备份

```bash
# 创建完整备份
collection-backup create --type full --name "每日完整备份"

# 创建增量备份
collection-backup create --type incremental --name "增量备份_$(date +%Y%m%d_%H%M%S)"

# 带描述的备份
collection-backup create \
  --type full \
  --name "系统升级前备份" \
  --description "在系统升级前创建的完整备份"
```

#### 列出备份

```bash
# 列出所有备份
collection-backup list

# 列出完整备份
collection-backup list --type full

# 列出失败的备份
collection-backup list --status failed

# 限制数量
collection-backup list --limit 20

# JSON格式输出
collection-backup list --json | jq .
```

#### 验证备份

```bash
# 验证单个备份
collection-backup verify backup_full_1640995200000_abc123

# 批量验证所有备份
for backup in $(collection-backup list --json | jq -r '.[].id'); do
  echo "验证备份: $backup"
  collection-backup verify "$backup" || echo "验证失败: $backup"
done
```

#### 删除备份

```bash
# 删除单个备份
collection-backup delete backup_full_1640995200000_abc123

# 删除所有失败的备份
collection-backup list --status failed --json | \
  jq -r '.[].id' | \
  xargs -I {} collection-backup delete {}
```

#### 清理旧备份

```bash
# 自动清理
collection-backup cleanup

# 预览清理（不实际删除）
collection-backup list | grep -E "(超过30天|大小超限)"
```

#### 查看统计

```bash
# 查看备份统计
collection-backup stats

# JSON格式统计
collection-backup stats --json | jq .
```

#### 查看配置

```bash
# 查看当前配置
collection-backup config

# 导出配置到文件
collection-backup config --json > backup-config.json
```

#### 测试功能

```bash
# 运行备份功能测试
collection-backup test
```

### 计划任务

#### 使用cron

```bash
# 编辑cron任务
crontab -e

# 添加备份任务
# 每天2点执行完整备份
0 2 * * * /usr/local/bin/collection-backup create --type full --name "每日完整备份_$(date +\%Y\%m\%d)"

# 每6小时执行增量备份
0 */6 * * * /usr/local/bin/collection-backup create --type incremental --name "增量备份_$(date +\%Y\%m\%d_\%H)"

# 每周日3点清理旧备份
0 3 * * 0 /usr/local/bin/collection-backup cleanup

# 每天4点验证最新备份
0 4 * * * /usr/local/bin/collection-backup verify $(/usr/local/bin/collection-backup list --limit 1 --json | jq -r '.[0].id')
```

#### 使用systemd定时器

`/etc/systemd/system/collection-backup.timer`:
```ini
[Unit]
Description=Collection Backup Timer

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

`/etc/systemd/system/collection-backup.service`:
```ini
[Unit]
Description=Collection Backup Service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/collection-backup create --type full
User=collection
Group=collection
```

### 编程接口

#### 创建备份

```typescript
import { backupManager } from './src/collection/backup/backup-manager';

// 创建完整备份
const backup = await backupManager.createFullBackup({
  name: '系统维护前备份',
  description: '在系统维护前创建的完整备份',
  metadata: {
    maintenance: true,
    scheduledTime: '2024-01-01T00:00:00Z'
  }
});

console.log(`备份创建成功: ${backup.id}, 大小: ${backup.size} bytes`);
```

#### 计划备份

```typescript
import { CronJob } from 'cron';
import { backupManager } from './src/collection/backup/backup-manager';

// 每天2点执行完整备份
const fullBackupJob = new CronJob('0 2 * * *', async () => {
  try {
    const backup = await backupManager.createFullBackup({
      name: `每日完整备份_${new Date().toISOString().split('T')[0]}`
    });
    console.log(`每日备份完成: ${backup.id}`);
  } catch (error) {
    console.error('每日备份失败:', error);
  }
});

// 每6小时执行增量备份
const incrementalBackupJob = new CronJob('0 */6 * * *', async () => {
  try {
    const backup = await backupManager.createIncrementalBackup({
      name: `增量备份_${new Date().toISOString()}`
    });
    console.log(`增量备份完成: ${backup.id}`);
  } catch (error) {
    console.error('增量备份失败:', error);
  }
});

// 启动定时任务
fullBackupJob.start();
incrementalBackupJob.start();
```

#### 监控备份状态

```typescript
import { backupManager } from './src/collection/backup/backup-manager';

// 获取备份统计
const stats = backupManager.getBackupStats();
console.log('备份统计:', stats);

// 检查备份健康状态
function checkBackupHealth(): {
  healthy: boolean;
  issues: string[];
  lastBackup?: Date;
} {
  const stats = backupManager.getBackupStats();
  const issues: string[] = [];

  // 检查是否有失败的备份
  if (stats.byStatus.failed > 0) {
    issues.push(`有 ${stats.byStatus.failed} 个失败的备份`);
  }

  // 检查是否有损坏的备份
  if (stats.byStatus.corrupted > 0) {
    issues.push(`有 ${stats.byStatus.corrupted} 个损坏的备份`);
  }

  // 检查最近备份时间
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  if (stats.newestBackup && stats.newestBackup < oneDayAgo) {
    issues.push('最近备份超过24小时');
  }

  // 检查存储空间
  const maxSize = backupManager.exportConfig().storage.maxTotalSize * 1024 * 1024;
  if (stats.totalSize > maxSize * 0.9) {
    issues.push(`备份存储使用超过90%: ${stats.totalSize}/${maxSize}`);
  }

  return {
    healthy: issues.length === 0,
    issues,
    lastBackup: stats.newestBackup
  };
}

// 定期检查备份健康状态
setInterval(() => {
  const health = checkBackupHealth();
  if (!health.healthy) {
    console.warn('备份健康检查发现问题:', health.issues);
    // 发送告警通知
  }
}, 3600000); // 每小时检查一次
```

## 恢复操作

### 恢复准备

#### 1. 停止服务
```bash
# 停止采集服务
systemctl stop collection-service

# 或使用Docker
docker-compose stop collection-service

# 或使用PM2
pm2 stop collection-service
```

#### 2. 选择备份
```bash
# 列出可用备份
collection-backup list

# 查看备份详情
collection-backup list --json | jq '.[0]'

# 验证备份完整性
collection-backup verify <backup-id>
```

#### 3. 准备恢复环境
```bash
# 备份当前数据（可选）
collection-backup create --type full --name "恢复前备份"

# 清理目标目录（如果需要）
rm -rf /app/data/collection/*
rm -rf /app/config/*
rm -rf /var/log/collection/*
```

### 执行恢复

#### 完整恢复
```bash
# 使用CLI工具恢复
collection-backup restore <backup-id> \
  --target /app \
  --verify \
  --preserve

# 或使用编程接口
import { backupManager } from './src/collection/backup/backup-manager';

await backupManager.restoreBackup({
  backupId: 'backup_full_1640995200000_abc123',
  targetDir: '/app',
  verifyBeforeRestore: true,
  preserveExisting: true,
  components: {
    database: true,
    config: true,
    logs: true
  }
});
```

#### 部分恢复

```bash
# 仅恢复数据库
collection-backup restore <backup-id> \
  --target /app/data/collection \
  --no-preserve

# 仅恢复配置
cp -r /app/data/backups/<backup-id>/config/* /app/config/

# 仅恢复日志（通常不需要）
cp -r /app/data/backups/<backup-id>/logs/* /var/log/collection/
```

#### 恢复验证

```bash
# 检查恢复的文件
ls -la /app/data/collection/
ls -la /app/config/

# 验证数据库完整性
sqlite3 /app/data/collection/data.db "PRAGMA integrity_check;"

# 检查文件权限
find /app/data/collection -type f -exec ls -la {} \;

# 测试配置加载
node -c /app/config/collection.config.json
```

### 恢复后操作

#### 1. 启动服务
```bash
# 启动采集服务
systemctl start collection-service

# 或使用Docker
docker-compose start collection-service

# 或使用PM2
pm2 start collection-service
```

#### 2. 验证服务
```bash
# 检查服务状态
systemctl status collection-service

# 检查健康端点
curl http://localhost:9090/health

# 检查采集功能
curl -X POST http://localhost:9090/manage/test-collection
```

#### 3. 监控恢复
```bash
# 监控日志
tail -f /var/log/collection/collection.log

# 监控指标
watch -n 5 'curl -s http://localhost:9090/metrics/summary | jq .'

# 检查告警
curl -s http://localhost:9090/alerts/active | jq .
```

### 恢复场景

#### 场景1: 数据损坏恢复
```bash
# 1. 识别问题
sqlite3 /app/data/collection/data.db "PRAGMA integrity_check;" | grep -v "ok"

# 2. 停止服务
systemctl stop collection-service

# 3. 选择最近的完好备份
collection-backup list --type full --status verified --limit 5

# 4. 恢复数据库
collection-backup restore <backup-id> \
  --target /app/data/collection \
  --no-preserve

# 5. 启动服务
systemctl start collection-service
```

#### 场景2: 配置错误恢复
```bash
# 1. 备份当前错误配置
cp /app/config/collection.config.json /app/config/collection.config.json.bak

# 2. 恢复配置备份
collection-backup list --type config --json | jq '.[0].id'
collection-backup restore <config-backup-id> \
  --target /app/config \
  --no-preserve

# 3. 重新加载配置
systemctl restart collection-service
```

#### 场景3: 完全系统恢复
```bash
# 1. 准备新服务器
# 安装依赖: Node.js, SQLite, 等

# 2. 部署应用代码
git clone https://github.com/your-repo/everyday_news.git
cd everyday_news
npm ci
npm run build

# 3. 恢复最新备份
scp user@old-server:/data/backups/latest_full_backup.tar.gz .
collection-backup restore latest_full_backup.tar.gz \
  --target /app \
  --no-preserve

# 4. 配置环境
cp .env.example .env
# 编辑 .env 文件

# 5. 启动服务
npm run start:collection
```

## 灾难恢复

### 恢复计划

#### RTO (恢复时间目标)
- **P0级故障**: 1小时内恢复
- **P1级故障**: 4小时内恢复
- **P2级故障**: 24小时内恢复

#### RPO (恢复点目标)
- **关键数据**: 15分钟
- **重要数据**: 1小时
- **一般数据**: 24小时

### 恢复流程

#### 1. 灾难评估
```bash
# 评估影响范围
./disaster-assessment.sh

# 确定恢复优先级
cat recovery-priority.txt
```

#### 2. 资源准备
```bash
# 准备恢复服务器
./prepare-recovery-server.sh

# 准备备份介质
./prepare-backup-media.sh
```

#### 3. 数据恢复
```bash
# 执行恢复脚本
./disaster-recovery.sh --level p0 --backup latest
```

#### 4. 服务恢复
```bash
# 启动核心服务
./start-core-services.sh

# 验证恢复结果
./verify-recovery.sh
```

### 恢复脚本示例

`disaster-recovery.sh`:
```bash
#!/bin/bash

set -e

# 配置
BACKUP_DIR="/data/backups"
RESTORE_DIR="/app"
LOG_FILE="/var/log/disaster-recovery.log"

# 日志函数
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# 错误处理
error() {
  log "错误: $1"
  exit 1
}

# 主恢复函数
main() {
  local backup_id="$1"
  local recovery_level="$2"

  log "开始灾难恢复"
  log "备份ID: $backup_id"
  log "恢复级别: $recovery_level"

  # 步骤1: 验证备份
  log "步骤1: 验证备份完整性"
  if ! collection-backup verify "$backup_id"; then
    error "备份验证失败"
  fi

  # 步骤2: 停止服务
  log "步骤2: 停止相关服务"
  systemctl stop collection-service || true
  systemctl stop collection-monitoring || true

  # 步骤3: 恢复数据
  log "步骤3: 恢复数据"
  collection-backup restore "$backup_id" \
    --target "$RESTORE_DIR" \
    --no-preserve \
    --no-verify

  # 步骤4: 修复权限
  log "步骤4: 修复文件权限"
  chown -R collection:collection "$RESTORE_DIR"
  chmod -R 750 "$RESTORE_DIR/data"
  chmod -R 640 "$RESTORE_DIR/config"

  # 步骤5: 启动服务
  log "步骤5: 启动服务"
  systemctl start collection-monitoring
  systemctl start collection-service

  # 步骤6: 验证恢复
  log "步骤6: 验证恢复结果"
  sleep 30
  if ! systemctl is-active collection-service; then
    error "服务启动失败"
  fi

  log "灾难恢复完成"
}

# 执行主函数
main "$@"
```

### 恢复测试

#### 定期恢复演练
```bash
# 每月执行恢复测试
./recovery-drill.sh

# 测试报告
cat recovery-drill-report.md
```

#### 自动化测试
```bash
# 集成到CI/CD流水线
# .github/workflows/recovery-test.yml

name: Recovery Test
on:
  schedule:
    - cron: '0 2 * * 0'  # 每周日2点

jobs:
  test-recovery:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Test Backup Recovery
        run: |
          ./scripts/test-recovery.sh
```

## 最佳实践

### 备份策略优化

#### 1. 分层备份策略
```yaml
backup_strategy:
  hot_backup:
    type: incremental
    frequency: hourly
    retention: 24 hours
    storage: local_ssd

  warm_backup:
    type: full
    frequency: daily
    retention: 7 days
    storage: local_hdd

  cold_backup:
    type: full
    frequency: weekly
    retention: 30 days
    storage: network_nas

  archive_backup:
    type: full
    frequency: monthly
    retention: 1 year
    storage: cloud_s3
```

#### 2. 智能清理策略
```typescript
// 基于多个因素的清理策略
function shouldCleanupBackup(backup: BackupInfo): boolean {
  const now = Date.now();
  const ageDays = (now - backup.createdAt.getTime()) / (1000 * 60 * 60 * 24);

  // 因素1: 超过保留期限
  if (ageDays > backup.retentionDays) {
    return true;
  }

  // 因素2: 备份失败或损坏
  if (backup.status === BackupStatus.FAILED ||
      backup.status === BackupStatus.CORRUPTED) {
    return ageDays > 1; // 保留1天用于调试
  }

  // 因素3: 存储空间压力
  const storageUsage = calculateStorageUsage();
  if (storageUsage > 0.9) { // 超过90%
    return ageDays > 1; // 只保留1天内的备份
  }

  // 因素4: 备份频率
  const similarBackups = findSimilarBackups(backup);
  if (similarBackups.length > 5) {
    return true; // 保留最多5个相似备份
  }

  return false;
}
```

### 安全最佳实践

#### 1. 加密备份
```bash
# 生成加密密钥
openssl rand -base64 32 > /secrets/backup.key
chmod 600 /secrets/backup.key

# 配置加密备份
export BACKUP_ENCRYPTION_ENABLED=true
export BACKUP_ENCRYPTION_KEY_PATH=/secrets/backup.key
```

#### 2. 访问控制
```bash
# 创建专用备份用户
useradd -r -s /bin/false backup-user

# 设置目录权限
chown -R backup-user:backup-user /data/backups
chmod 750 /data/backups
chmod 600 /data/backups/*.key

# 配置sudo权限
# /etc/sudoers.d/backup
backup-user ALL=(root) NOPASSWD: /usr/local/bin/collection-backup
```

#### 3. 传输安全
```bash
# 使用SSH传输
scp -i /secrets/backup-key /data/backups/latest.tar.gz \
  backup@remote-server:/remote/backups/

# 使用TLS传输
curl --cert /secrets/client.crt --key /secrets/client.key \
  -X POST https://backup-server/upload \
  -F "file=@/data/backups/latest.tar.gz"
```

### 监控和告警

#### 1. 备份监控
```yaml
# Prometheus告警规则
groups:
  - name: backup_alerts
    rules:
      - alert: BackupFailed
        expr: backup_status{status="failed"} == 1
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "备份失败"
          description: "备份任务 {{ $labels.backup_id }} 失败"

      - alert: NoRecentBackup
        expr: time() - backup_last_success_timestamp > 86400
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "24小时内无成功备份"
          description: "最近一次成功备份在 {{ $value }} 秒前"

      - alert: BackupStorageFull
        expr: backup_storage_usage_percent > 90
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "备份存储空间不足"
          description: "备份存储使用率 {{ $value }}%"
```

#### 2. 恢复监控
```bash
# 恢复后监控脚本
#!/bin/bash
# monitor-recovery.sh

# 监控服务状态
while true; do
  if ! systemctl is-active collection-service; then
    echo "服务异常，发送告警"
    send_alert "服务异常"
  fi

  # 监控数据收集
  if ! curl -s http://localhost:9090/metrics | grep -q "collection_total"; then
    echo "数据收集异常，发送告警"
    send_alert "数据收集异常"
  fi

  sleep 300  # 5分钟检查一次
done
```

### 性能优化

#### 1. 备份性能优化
```bash
# 使用并行压缩
tar -I pigz -cf backup.tar.gz /data/collection

# 排除不需要的文件
tar --exclude='*.tmp' --exclude='*.log' -czf backup.tar.gz /data

# 增量备份优化
rsync -av --link-dest=/data/backups/latest /data/collection /data/backups/incremental
```

#### 2. 恢复性能优化
```bash
# 并行解压
tar -I pigz -xf backup.tar.gz -C /restore

# 流式恢复
cat backup.tar.gz | tar -xz -C /restore

# 验证优化
tar -tzf backup.tar.gz > /dev/null && echo "备份有效"
```

## 故障排除

### 常见问题

#### 1. 备份失败

**症状**: 备份任务失败，日志显示错误

**解决方案**:
```bash
# 检查错误日志
tail -f /var/log/collection/backup.log

# 检查存储空间
df -h /data/backups

# 检查文件权限
ls -la /data/collection/
ls -la /data/backups/

# 测试备份功能
collection-backup test
```

#### 2. 恢复失败

**症状**: 恢复过程失败，数据不完整

**解决方案**:
```bash
# 验证备份完整性
collection-backup verify <backup-id>

# 检查目标目录权限
ls -la /app/data/collection/

# 尝试部分恢复
collection-backup restore <backup-id> --target /tmp/test --no-preserve

# 检查系统资源
free -h
df -h
```

#### 3. 备份文件损坏

**症状**: 备份验证失败，文件损坏

**解决方案**:
```bash
# 尝试修复tar文件
tar -tf backup.tar.gz 2>&1 | grep -i "error"

# 使用备用备份
collection-backup list --status verified

# 重新创建备份
collection-backup create --type full --name "紧急修复备份"
```

#### 4. 存储空间不足

**症状**: 备份失败，磁盘空间不足

**解决方案**:
```bash
# 清理旧备份
collection-backup cleanup

# 手动删除不需要的备份
collection-backup list --json | jq -r '.[] | select(.status=="failed") | .id' | xargs -I {} collection-backup delete {}

# 扩展存储空间
# 1. 添加新磁盘
# 2. 使用网络存储
# 3. 启用云存储
```

### 调试命令

#### 备份调试
```bash
# 启用详细日志
export LOG_LEVEL=debug
collection-backup create --type full

# 检查备份进程
ps aux | grep -E "(tar|gzip|backup)"

# 监控备份进度
watch -n 1 'du -sh /data/backups/*.tar.gz'
```

#### 恢复调试
```bash
# 逐步恢复
collection-backup restore <backup-id> --target /tmp/debug --no-preserve --no-verify

# 检查恢复的文件
find /tmp/debug -type f -name "*.db" -exec sqlite3 {} "PRAGMA integrity_check;" \;

# 验证配置文件
node -c /tmp/debug/config/collection.config.json
```

### 获取帮助

如果备份恢复问题无法解决：

1. **检查文档**: `docs/collection/BACKUP_RECOVERY.md`
2. **查看日志**: `/var/log/collection/backup.log`
3. **运行测试**: `collection-backup test`
4. **提交Issue**: https://github.com/your-repo/issues

提供以下信息有助于诊断：
- 备份ID和类型
- 错误日志内容
- 系统资源信息
- 配置信息（脱敏后）

## 附录

### 备份文件结构

```
/data/backups/
├── backup_full_1640995200000_abc123.tar.gz
├── backup_full_1640995200000_abc123.json
├── backup_incremental_1641009600000_def456.tar.gz
├── backup_incremental_1641009600000_def456.json
├── backup_config_1641013200000_ghi789.tar.gz
└── backup_config_1641013200000_ghi789.json
```

### 备份信息文件格式

```json
{
  "id": "backup_full_1640995200000_abc123",
  "name": "完整备份_2024-01-01",
  "type": "full",
  "status": "verified",
  "size": 1073741824,
  "createdAt": "2024-01-01T00:00:00.000Z",
  "completedAt": "2024-01-01T00:05:30.000Z",
  "verifiedAt": "2024-01-01T00:06:00.000Z",
  "checksum": "a1b2c3d4e5f6...",
  "compression": true,
  "retentionDays": 30,
  "metadata": {
    "description": "每日完整备份",
    "version": "1.0.0",
    "components": ["database", "config", "logs"]
  }
}
```

### 相关工具

#### 备份验证工具
```bash
#!/bin/bash
# verify-backup.sh

BACKUP_FILE="$1"

echo "验证备份文件: $BACKUP_FILE"

# 检查文件存在
if [ ! -f "$BACKUP_FILE" ]; then
  echo "错误: 文件不存在"
  exit 1
fi

# 检查文件大小
FILE_SIZE=$(stat -c%s "$BACKUP_FILE")
echo "文件大小: $FILE_SIZE bytes"

# 检查文件类型
file "$BACKUP_FILE"

# 验证tar文件
if tar -tzf "$BACKUP_FILE" > /dev/null 2>&1; then
  echo "✓ Tar文件有效"
else
  echo "✗ Tar文件损坏"
  exit 1
fi

# 列出内容
echo "备份内容:"
tar -tzf "$BACKUP_FILE" | head -20

echo "验证完成"
```

#### 备份监控工具
```bash
#!/bin/bash
# monitor-backups.sh

# 检查备份状态
function check_backups() {
  echo "=== 备份状态检查 ==="
  echo "时间: $(date)"

  # 检查最近备份
  LATEST_BACKUP=$(collection-backup list --limit 1 --json | jq -r '.[0].id')
  if [ -n "$LATEST_BACKUP" ]; then
    echo "最近备份: $LATEST_BACKUP"
    collection-backup verify "$LATEST_BACKUP" && echo "状态: 正常" || echo "状态: 异常"
  else
    echo "警告: 没有找到备份"
  fi

  # 检查备份统计
  STATS=$(collection-backup stats --json)
  echo "备份统计:"
  echo "$STATS" | jq '.total, .totalSize, .byStatus'

  # 检查存储空间
  STORAGE_USAGE=$(df -h /data/backups | tail -1)
  echo "存储使用: $STORAGE_USAGE"
}

# 定期检查
while true; do
  check_backups
  sleep 3600  # 每小时检查一次
done
```

### 更新日志

#### 版本 1.0.0 (2024-01-01)
- 初始版本发布
- 支持完整备份和增量备份
- 提供CLI管理工具
- 集成监控和告警

#### 版本 1.1.0 (计划中)
- 支持云存储备份
- 增强加密功能
- 改进恢复性能
- 添加Web管理界面

### 支持联系

如有备份恢复相关问题，请联系：

- **技术支持**: backup-support@example.com
- **紧急恢复**: disaster-recovery@example.com
- **文档反馈**: docs-feedback@example.com
- **GitHub Issues**: https://github.com/your-repo/issues