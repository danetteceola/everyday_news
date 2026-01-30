# 备份恢复操作手册

## 概述

数据库备份恢复系统提供完整的数据保护方案，支持自动备份、手动备份、增量备份、数据恢复和完整性验证。系统设计满足数据安全和业务连续性要求。

## 备份策略

### 备份类型

| 备份类型 | 说明 | 适用场景 |
|----------|------|----------|
| **完整备份** | 备份整个数据库文件 | 日常备份、版本发布前 |
| **增量备份** | 仅备份自上次备份以来的变更 | 频繁备份、减少存储空间 |
| **差异备份** | 备份自上次完整备份以来的变更 | 平衡存储和恢复速度 |

### 备份频率

| 环境 | 完整备份 | 增量备份 | 保留期限 |
|------|----------|----------|----------|
| 开发环境 | 每日1次 | 每小时1次 | 7天 |
| 测试环境 | 每日2次 | 每30分钟1次 | 14天 |
| 生产环境 | 每日1次 | 每15分钟1次 | 30天 |

### 存储策略

1. **本地存储**: 快速恢复，用于近期备份
2. **网络存储**: 防本地故障，用于中期备份
3. **云存储**: 防灾难，用于长期归档

## 快速开始

### 1. 初始化备份系统

```bash
# 初始化备份目录和配置
npm run db:backup:init

# 或使用CLI
ts-node src/db/cli/backup.ts init
```

### 2. 执行手动备份

```bash
# 执行完整备份
npm run db:backup:full

# 执行增量备份
npm run db:backup:incremental

# 或使用CLI
ts-node src/db/cli/backup.ts create --type full
ts-node src/db/cli/backup.ts create --type incremental
```

### 3. 查看备份列表

```bash
# 查看所有备份
npm run db:backup:list

# 查看最近备份
npm run db:backup:list -- --limit 10

# 或使用CLI
ts-node src/db/cli/backup.ts list
ts-node src/db/cli/backup.ts list --limit 10 --format json
```

### 4. 恢复数据

```bash
# 恢复最新备份
npm run db:backup:restore

# 恢复特定备份
npm run db:backup:restore -- --backup-id "20260129_120000_full"

# 或使用CLI
ts-node src/db/cli/backup.ts restore
ts-node src/db/cli/backup.ts restore --backup-id "20260129_120000_full"
```

## 备份操作详解

### 自动备份配置

配置自动备份策略：

```yaml
# config/backup.yaml
backup:
  # 备份类型: full, incremental
  backupType: full

  # 备份目录
  backupDirectory: ./data/backups

  # 保留天数
  retentionDays: 7

  # 是否压缩
  compress: true

  # 压缩级别 (1-9)
  compressionLevel: 6

  # 是否加密
  encrypt: false

  # 加密密钥（如果启用加密）
  # encryptionKey: your-secret-key

  # 最大备份文件数
  maxBackupFiles: 30

  # 自动备份间隔（秒，0表示禁用）
  autoBackupInterval: 86400  # 24小时

  # 备份时间窗口
  schedule:
    # 完整备份时间
    fullBackupTime: "02:00"  # 每天凌晨2点

    # 增量备份间隔
    incrementalInterval: 3600  # 每小时

    # 排除时间段（不执行备份）
    excludeHours:
      - "09:00-12:00"  # 业务高峰
      - "14:00-17:00"
```

### 环境变量配置

```bash
# 备份配置环境变量
export BACKUP_DIRECTORY="./data/backups"
export BACKUP_TYPE="full"
export BACKUP_RETENTION_DAYS="7"
export BACKUP_COMPRESS="true"
export BACKUP_COMPRESSION_LEVEL="6"
export BACKUP_ENCRYPT="false"
export BACKUP_MAX_FILES="30"
export BACKUP_AUTO_INTERVAL="86400"
```

### 手动备份选项

```bash
# 创建完整备份并添加描述
ts-node src/db/cli/backup.ts create \
  --type full \
  --description "生产环境每日备份" \
  --compress \
  --compression-level 7 \
  --metadata '{"environment": "production", "version": "1.2.3"}'

# 创建增量备份
ts-node src/db/cli/backup.ts create \
  --type incremental \
  --description "增量备份" \
  --base-backup "20260128_020000_full"

# 创建加密备份
ts-node src/db/cli/backup.ts create \
  --type full \
  --encrypt \
  --encryption-key "my-secret-key-123" \
  --description "加密备份"
```

## 恢复操作详解

### 恢复策略选择

1. **完全恢复**: 恢复整个数据库到备份时间点
2. **部分恢复**: 恢复特定表或数据
3. **时间点恢复**: 恢复到特定时间点的状态
4. **测试恢复**: 恢复到测试环境验证备份

### 恢复操作步骤

```bash
# 1. 查看可用备份
ts-node src/db/cli/backup.ts list --format table

# 2. 验证备份完整性
ts-node src/db/cli/backup.ts verify --backup-id "20260129_020000_full"

# 3. 执行恢复（预览模式）
ts-node src/db/cli/backup.ts restore \
  --backup-id "20260129_020000_full" \
  --dry-run \
  --verbose

# 4. 实际恢复
ts-node src/db/cli/backup.ts restore \
  --backup-id "20260129_020000_full" \
  --target-db "./data/restored.db" \
  --confirm
```

### 恢复场景示例

#### 场景1: 数据库损坏恢复

```bash
# 停止数据库服务
systemctl stop everyday-news

# 备份当前损坏的数据库（用于分析）
cp ./data/everyday_news.db ./data/corrupted_backup_$(date +%Y%m%d_%H%M%S).db

# 恢复最新备份
ts-node src/db/cli/backup.ts restore \
  --backup-id $(ts-node src/db/cli/backup.ts list --latest --format json | jq -r '.backupId') \
  --confirm

# 启动数据库服务
systemctl start everyday-news

# 验证数据完整性
ts-node src/db/cli/backup.ts verify --integrity-check
```

#### 场景2: 误删除数据恢复

```bash
# 创建临时恢复数据库
ts-node src/db/cli/backup.ts restore \
  --backup-id "20260129_020000_full" \
  --target-db "./data/temp_restored.db" \
  --confirm

# 导出误删除的数据
sqlite3 ./data/temp_restored.db \
  "SELECT * FROM news_items WHERE id IN (1001, 1002, 1003)" \
  > ./data/deleted_data.sql

# 导入到生产数据库
sqlite3 ./data/everyday_news.db < ./data/deleted_data.sql

# 清理临时文件
rm ./data/temp_restored.db ./data/deleted_data.sql
```

#### 场景3: 迁移失败回滚

```bash
# 迁移前备份
ts-node src/db/cli/backup.ts create \
  --type full \
  --description "迁移前备份" \
  --metadata '{"migration_version": 5, "purpose": "rollback"}'

# 执行迁移（假设失败）
ts-node src/db/cli/migrate.ts up --version 5

# 迁移失败，执行回滚
ts-node src/db/cli/backup.ts restore \
  --backup-id $(ts-node src/db/cli/backup.ts list --query 'metadata.migration_version=5' --format json | jq -r '.backupId') \
  --confirm

# 验证回滚结果
ts-node src/db/cli/migrate.ts status
```

## 备份管理

### 备份保留策略

系统自动管理备份文件保留：

```bash
# 查看保留策略
ts-node src/db/cli/backup.ts policy

# 手动清理过期备份
ts-node src/db/cli/backup.ts cleanup

# 选项:
#   --dry-run: 预览将删除的备份
#   --force: 强制清理
#   --keep-min: 至少保留的备份数

ts-node src/db/cli/backup.ts cleanup --dry-run --keep-min 5
```

### 备份验证

定期验证备份完整性：

```bash
# 验证所有备份
ts-node src/db/cli/backup.ts verify-all

# 验证特定备份
ts-node src/db/cli/backup.ts verify \
  --backup-id "20260129_020000_full" \
  --integrity-check \
  --checksum-verify

# 自动验证调度
ts-node src/db/cli/backup.ts schedule-verify \
  --cron "0 3 * * *" \  # 每天凌晨3点
  --report-email "admin@example.com"
```

### 备份监控

```bash
# 查看备份统计
ts-node src/db/cli/backup.ts stats

# 监控备份状态
ts-node src/db/cli/backup.ts monitor

# 设置监控告警
ts-node src/db/cli/backup.ts alerts \
  --add-rule "backup-failed" \
  --condition "status == 'failed'" \
  --action "email:admin@example.com"

ts-node src/db/cli/backup.ts alerts \
  --add-rule "backup-missing" \
  --condition "hours_since_last_backup > 24" \
  --action "slack:#backup-alerts"
```

## 高级功能

### 增量备份管理

```bash
# 查看增量备份链
ts-node src/db/cli/backup.ts chain --backup-id "20260129_020000_full"

# 合并增量备份为完整备份
ts-node src/db/cli/backup.ts merge \
  --base-backup "20260128_020000_full" \
  --incremental-backups "20260128_030000_inc,20260128_040000_inc,20260128_050000_inc" \
  --output "20260128_merged_full"

# 验证增量备份连续性
ts-node src/db/cli/backup.ts verify-chain \
  --start-backup "20260128_020000_full" \
  --end-backup "20260129_020000_full"
```

### 备份加密

```bash
# 生成加密密钥
ts-node src/db/cli/backup.ts generate-key \
  --algorithm aes-256-gcm \
  --output ./config/backup-key.key

# 创建加密备份
ts-node src/db/cli/backup.ts create \
  --type full \
  --encrypt \
  --encryption-key-file ./config/backup-key.key \
  --description "加密备份"

# 恢复加密备份
ts-node src/db/cli/backup.ts restore \
  --backup-id "20260129_encrypted_full" \
  --encryption-key-file ./config/backup-key.key
```

### 跨平台备份

```bash
# 备份到远程存储
ts-node src/db/cli/backup.ts create \
  --type full \
  --remote-storage s3 \
  --s3-bucket my-backup-bucket \
  --s3-region us-east-1 \
  --description "S3远程备份"

# 从远程存储恢复
ts-node src/db/cli/backup.ts restore \
  --backup-id "20260129_020000_full" \
  --remote-storage s3 \
  --s3-bucket my-backup-bucket

# 同步本地和远程备份
ts-node src/db/cli/backup.ts sync \
  --source local \
  --destination s3 \
  --delete-missing
```

## 故障排除

### 常见问题

#### Q1: 备份失败，提示磁盘空间不足
**A:** 清理旧备份或增加磁盘空间
```bash
# 查看磁盘使用情况
df -h ./data/backups

# 清理过期备份
ts-node src/db/cli/backup.ts cleanup --force

# 调整备份保留策略
ts-node src/db/cli/backup.ts policy --retention-days 3 --max-files 10
```

#### Q2: 恢复时提示备份文件损坏
**A:** 验证备份完整性，尝试其他备份
```bash
# 验证备份文件
ts-node src/db/cli/backup.ts verify --backup-id "20260129_020000_full"

# 尝试修复备份
ts-node src/db/cli/backup.ts repair --backup-id "20260129_020000_full"

# 使用更早的备份
ts-node src/db/cli/backup.ts list --before "2026-01-29"
```

#### Q3: 增量备份失败，找不到基准备份
**A:** 检查基准备份是否存在，重新创建完整备份
```bash
# 查找基准备份
ts-node src/db/cli/backup.ts find-base --for-incremental

# 创建新的完整备份
ts-node src/db/cli/backup.ts create --type full

# 重新开始增量备份链
ts-node src/db/cli/backup.ts reset-chain
```

#### Q4: 自动备份未按计划执行
**A:** 检查备份服务状态和配置
```bash
# 检查备份服务状态
systemctl status everyday-news-backup

# 查看备份日志
tail -f logs/backup.log

# 手动触发备份测试
ts-node src/db/cli/backup.ts create --type full --verbose

# 检查调度配置
ts-node src/db/cli/backup.ts schedule --list
```

### 错误代码

| 错误代码 | 说明 | 解决方法 |
|----------|------|----------|
| BACKUP_001 | 备份目录不可写 | 检查目录权限 |
| BACKUP_002 | 数据库文件不存在 | 检查数据库路径 |
| BACKUP_003 | 备份文件已存在 | 使用不同备份ID |
| BACKUP_004 | 备份过程中数据库被修改 | 停止写入操作后重试 |
| BACKUP_005 | 恢复目标文件已存在 | 删除或重命名目标文件 |
| BACKUP_006 | 备份文件损坏 | 使用备份验证工具 |
| BACKUP_007 | 加密密钥错误 | 检查加密密钥 |
| BACKUP_008 | 增量备份基准丢失 | 创建新的完整备份 |
| BACKUP_009 | 磁盘空间不足 | 清理旧备份 |
| BACKUP_010 | 网络存储连接失败 | 检查网络和权限 |

## 监控和告警

### 备份监控指标

```bash
# 查看备份健康状态
ts-node src/db/cli/backup.ts health

# 导出监控指标
ts-node src/db/cli/backup.ts metrics --format prometheus > metrics.txt

# 设置监控面板
ts-node src/db/cli/backup.ts dashboard --port 3000
```

### 告警配置示例

```yaml
# config/backup-alerts.yaml
alerts:
  - name: backup-failed
    condition: "last_backup_status == 'failed'"
    severity: "critical"
    actions:
      - type: email
        recipients: ["admin@example.com"]
      - type: slack
        channel: "#alerts"

  - name: backup-missing
    condition: "hours_since_last_backup > 24"
    severity: "high"
    actions:
      - type: sms
        phone_numbers: ["+1234567890"]

  - name: backup-space-low
    condition: "backup_disk_usage > 90"
    severity: "medium"
    actions:
      - type: email
        recipients: ["backup-team@example.com"]
```

### 备份报告

```bash
# 生成每日备份报告
ts-node src/db/cli/backup.ts report \
  --period daily \
  --date 2026-01-29 \
  --output ./reports/backup_20260129.pdf

# 发送周报
ts-node src/db/cli/backup.ts report \
  --period weekly \
  --send-email "team@example.com" \
  --include-charts
```

## 最佳实践

### 备份策略最佳实践

1. **3-2-1规则**:
   - 至少3份备份
   - 至少2种存储介质
   - 至少1份异地备份

2. **定期测试恢复**:
   - 每月至少测试一次恢复流程
   - 验证备份完整性和可用性
   - 记录恢复时间和成功率

3. **版本控制**:
   - 备份配置纳入版本控制
   - 备份脚本代码审查
   - 变更记录和审计跟踪

### 操作最佳实践

1. **备份前检查**:
   ```bash
   # 检查清单
   ts-node src/db/cli/backup.ts preflight
   ```

2. **恢复前验证**:
   ```bash
   # 验证步骤
   ts-node src/db/cli/backup.ts verify --integrity-check
   ts-node src/db/cli/backup.ts test-restore --dry-run
   ```

3. **文档记录**:
   - 记录每次备份操作
   - 记录恢复操作步骤
   - 记录问题和解决方案

### 安全最佳实践

1. **加密敏感数据**:
   - 备份文件加密存储
   - 加密密钥安全管理
   - 访问权限控制

2. **访问控制**:
   - 最小权限原则
   - 操作审计日志
   - 多因素认证

3. **合规性**:
   - 符合数据保护法规
   - 保留期限管理
   - 审计跟踪保存

## 附录

### 备份检查清单

**日常检查:**
- [ ] 备份作业是否成功执行
- [ ] 备份文件完整性验证
- [ ] 存储空间使用情况
- [ ] 监控告警状态检查

**每周检查:**
- [ ] 备份保留策略审查
- [ ] 恢复测试执行
- [ ] 性能指标分析
- [ ] 安全设置审查

**每月检查:**
- [ ] 备份策略有效性评估
- [ ] 灾难恢复演练
- [ ] 合规性检查
- [ ] 改进计划制定

### 恢复时间目标 (RTO/RPO)

| 数据类别 | RTO (恢复时间目标) | RPO (恢复点目标) |
|----------|-------------------|------------------|
| 关键业务数据 | < 1小时 | < 15分钟 |
| 重要业务数据 | < 4小时 | < 1小时 |
| 一般业务数据 | < 24小时 | < 4小时 |
| 归档数据 | < 72小时 | < 24小时 |

### 工具和资源

- **备份管理控制台**: http://localhost:3000/backup
- **监控仪表板**: http://localhost:3000/monitoring
- **文档Wiki**: https://wiki.example.com/database-backup
- **紧急联系人**: backup-team@example.com

---

*本文档最后更新于 2026-01-29*
*备份系统版本: 1.0.0*