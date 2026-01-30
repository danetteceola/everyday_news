# 数据迁移系统使用指南

## 概述

数据迁移系统用于管理数据库结构的版本化变更，支持平滑升级和回滚。系统采用版本号管理，每个迁移都有独立的升级和降级脚本。

## 核心概念

### 迁移版本
每个迁移都有一个唯一的版本号（整数），版本号按顺序递增。系统记录当前数据库版本，并自动应用未执行的迁移。

### 迁移脚本
每个迁移包含两个方向的脚本：
- **升级脚本 (up)**: 将数据库从旧版本升级到新版本
- **降级脚本 (down)**: 将数据库从新版本降级到旧版本

### 迁移记录
系统在 `schema_migrations` 表中记录所有已执行的迁移，包括：
- 版本号
- 执行状态（pending, running, completed, failed, rolled_back）
- 执行时间
- 错误信息（如果失败）

## 快速开始

### 1. 初始化迁移系统

```bash
# 初始化迁移表
npm run db:migrate:init

# 或使用CLI
ts-node src/db/cli/migrate.ts init
```

### 2. 创建新迁移

```bash
# 创建迁移脚本模板
npm run db:migrate:create -- "添加用户表"

# 或使用CLI
ts-node src/db/cli/migrate.ts create "添加用户表"
```

这将在 `src/db/migrations/scripts` 目录下创建新的迁移文件：
```
src/db/migrations/scripts/
├── 001_initial_schema.ts
├── 002_add_user_table.ts  # 新创建的迁移
└── ...
```

### 3. 执行迁移

```bash
# 执行所有待处理的迁移
npm run db:migrate:up

# 执行到特定版本
npm run db:migrate:up -- --version 5

# 或使用CLI
ts-node src/db/cli/migrate.ts up
ts-node src/db/cli/migrate.ts up --version 5
```

### 4. 回滚迁移

```bash
# 回滚最后一个迁移
npm run db:migrate:down

# 回滚到特定版本
npm run db:migrate:down -- --version 3

# 或使用CLI
ts-node src/db/cli/migrate.ts down
ts-node src/db/cli/migrate.ts down --version 3
```

## 迁移脚本编写

### 迁移文件结构

生成的迁移文件模板：

```typescript
// src/db/migrations/scripts/002_add_user_table.ts
import { MigrationScript } from '../../types/migration';

/**
 * 迁移: 添加用户表
 * 版本: 2
 */
const migration: MigrationScript = {
  version: 2,
  description: '添加用户表',

  /**
   * 升级操作
   */
  async up(db: any): Promise<void> {
    // 创建用户表
    await db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 创建索引
    await db.run(`
      CREATE INDEX idx_users_username ON users(username)
    `);

    await db.run(`
      CREATE INDEX idx_users_email ON users(email)
    `);
  },

  /**
   * 降级操作
   */
  async down(db: any): Promise<void> {
    // 删除索引
    await db.run(`DROP INDEX IF EXISTS idx_users_email`);
    await db.run(`DROP INDEX IF EXISTS idx_users_username`);

    // 删除用户表
    await db.run(`DROP TABLE IF EXISTS users`);
  },

  /**
   * 迁移依赖（可选）
   * 指定此迁移依赖的其他迁移版本
   */
  dependencies: [1] // 依赖版本1的迁移
};

export default migration;
```

### 迁移操作类型

#### 1. 表操作

```typescript
// 创建表
await db.run(`
  CREATE TABLE IF NOT EXISTS table_name (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    column1 TEXT NOT NULL,
    column2 INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// 修改表
await db.run(`ALTER TABLE table_name ADD COLUMN new_column TEXT`);

// 删除表
await db.run(`DROP TABLE IF EXISTS table_name`);
```

#### 2. 索引操作

```typescript
// 创建索引
await db.run(`CREATE INDEX idx_table_column ON table_name(column)`);

// 创建唯一索引
await db.run(`CREATE UNIQUE INDEX idx_table_unique ON table_name(column1, column2)`);

// 删除索引
await db.run(`DROP INDEX IF EXISTS idx_table_column`);
```

#### 3. 数据迁移

```typescript
// 插入初始数据
await db.run(`
  INSERT INTO platforms (name, icon)
  VALUES
    ('Twitter', 'twitter.png'),
    ('YouTube', 'youtube.png'),
    ('TikTok', 'tiktok.png')
`);

// 更新现有数据
await db.run(`
  UPDATE news_items
  SET category = 'general'
  WHERE category IS NULL
`);

// 数据转换
const rows = await db.all(`SELECT id, tags FROM news_items WHERE tags IS NOT NULL`);
for (const row of rows) {
  // 转换tags格式
  const newTags = JSON.parse(row.tags).map((tag: string) => tag.toLowerCase());
  await db.run(`UPDATE news_items SET tags = ? WHERE id = ?`,
    JSON.stringify(newTags), row.id);
}
```

#### 4. 约束操作

```typescript
// 添加外键约束
await db.run(`
  CREATE TABLE child_table (
    id INTEGER PRIMARY KEY,
    parent_id INTEGER,
    FOREIGN KEY (parent_id) REFERENCES parent_table(id)
      ON DELETE CASCADE
      ON UPDATE CASCADE
  )
`);

// 添加检查约束
await db.run(`
  CREATE TABLE products (
    id INTEGER PRIMARY KEY,
    price REAL CHECK (price >= 0),
    quantity INTEGER CHECK (quantity >= 0)
  )
`);
```

### 最佳实践

1. **保持迁移幂等性**
   ```typescript
   // 好: 使用 IF NOT EXISTS
   await db.run(`CREATE TABLE IF NOT EXISTS ...`);

   // 好: 使用 IF EXISTS
   await db.run(`DROP INDEX IF EXISTS ...`);

   // 避免: 直接操作可能失败
   await db.run(`CREATE TABLE ...`); // 表已存在时会失败
   ```

2. **处理迁移失败**
   ```typescript
   async up(db: any): Promise<void> {
     try {
       await db.run(`BEGIN TRANSACTION`);

       // 一系列操作
       await db.run(`CREATE TABLE ...`);
       await db.run(`INSERT INTO ...`);

       await db.run(`COMMIT`);
     } catch (error) {
       await db.run(`ROLLBACK`);
       throw error;
     }
   }
   ```

3. **添加数据验证**
   ```typescript
   async up(db: any): Promise<void> {
     // 迁移前检查
     const tableExists = await db.get(
       `SELECT name FROM sqlite_master WHERE type='table' AND name='old_table'`
     );

     if (tableExists) {
       // 执行数据迁移
       await db.run(`INSERT INTO new_table SELECT * FROM old_table`);
     }
   }
   ```

## 迁移依赖管理

### 简单依赖

```typescript
const migration: MigrationScript = {
  version: 3,
  description: '添加用户配置表',
  dependencies: [1, 2], // 依赖版本1和版本2的迁移

  async up(db: any): Promise<void> {
    // 此迁移会在版本1和版本2之后执行
    await db.run(`CREATE TABLE user_settings ...`);
  },

  async down(db: any): Promise<void> {
    await db.run(`DROP TABLE IF EXISTS user_settings`);
  }
};
```

### 复杂依赖图

系统支持复杂的依赖关系，自动解决执行顺序：

```typescript
// 版本4依赖版本2和版本3
const migration4: MigrationScript = {
  version: 4,
  description: '迁移4',
  dependencies: [2, 3],
  // ...
};

// 版本5依赖版本4
const migration5: MigrationScript = {
  version: 5,
  description: '迁移5',
  dependencies: [4],
  // ...
};
```

执行顺序: 1 → 2 → 3 → 4 → 5

## 迁移配置

### 配置文件

创建 `config/migration.yaml`:

```yaml
# 迁移配置
migration:
  # 迁移表名
  migrationTableName: schema_migrations

  # 迁移脚本目录
  migrationsDirectory: ./src/db/migrations/scripts

  # 是否在迁移失败时自动回滚
  autoRollbackOnFailure: true

  # 是否在启动时检查迁移
  checkOnStartup: true

  # 是否记录详细日志
  verboseLogging: false
```

### 环境变量

```bash
# 迁移配置环境变量
export MIGRATION_TABLE_NAME="app_migrations"
export MIGRATION_DIRECTORY="./migrations"
export MIGRATION_AUTO_ROLLBACK="true"
export MIGRATION_CHECK_ON_STARTUP="true"
export MIGRATION_VERBOSE_LOGGING="false"
```

## CLI命令参考

### 初始化命令

```bash
# 初始化迁移系统
ts-node src/db/cli/migrate.ts init

# 选项:
#   --table-name: 迁移表名 (默认: schema_migrations)
#   --force: 强制重新初始化

ts-node src/db/cli/migrate.ts init --table-name app_migrations --force
```

### 创建命令

```bash
# 创建新迁移
ts-node src/db/cli/migrate.ts create "迁移描述"

# 选项:
#   --version: 指定版本号 (默认: 自动递增)
#   --template: 模板文件路径
#   --dependencies: 依赖版本 (逗号分隔)

ts-node src/db/cli/migrate.ts create "添加用户表" \
  --version 5 \
  --dependencies "1,2,4"
```

### 升级命令

```bash
# 执行迁移升级
ts-node src/db/cli/migrate.ts up

# 选项:
#   --version: 升级到特定版本
#   --dry-run: 试运行，不实际执行
#   --verbose: 显示详细日志

ts-node src/db/cli/migrate.ts up --version 10 --dry-run --verbose
```

### 降级命令

```bash
# 执行迁移降级
ts-node src/db/cli/migrate.ts down

# 选项:
#   --version: 降级到特定版本
#   --steps: 回滚的步数
#   --dry-run: 试运行
#   --verbose: 详细日志

ts-node src/db/cli/migrate.ts down --steps 2 --dry-run
```

### 状态命令

```bash
# 查看迁移状态
ts-node src/db/cli/migrate.ts status

# 选项:
#   --format: 输出格式 (text, json, table)
#   --verbose: 显示详细信息

ts-node src/db/cli/migrate.ts status --format json --verbose
```

### 验证命令

```bash
# 验证迁移完整性
ts-node src/db/cli/migrate.ts validate

# 选项:
#   --fix: 自动修复问题

ts-node src/db/cli/migrate.ts validate --fix
```

## 高级用法

### 数据迁移工具

```typescript
import { DataMigrator } from '../src/db/migrations/data-migrator';

// 创建数据迁移器
const migrator = new DataMigrator({
  sourcePath: './data/legacy.db',
  targetPath: './data/everyday_news.db'
});

// 执行数据迁移
await migrator.migrate({
  tables: ['news', 'users', 'settings'],
  transform: {
    news: (row) => {
      // 数据转换逻辑
      return {
        ...row,
        tags: JSON.parse(row.tags || '[]'),
        publish_time: new Date(row.publish_timestamp * 1000)
      };
    }
  },
  onProgress: (progress) => {
    console.log(`迁移进度: ${progress.percentage}%`);
  }
});
```

### 自定义迁移模板

创建自定义模板文件 `migration-template.ts`:

```typescript
// migration-template.ts
export const template = `import { MigrationScript } from '../../types/migration';

const migration: MigrationScript = {
  version: {{version}},
  description: '{{description}}',

  {{#if dependencies}}
  dependencies: [{{dependencies}}],
  {{/if}}

  async up(db: any): Promise<void> {
    // 升级操作
    {{upScript}}
  },

  async down(db: any): Promise<void> {
    // 降级操作
    {{downScript}}
  }
};

export default migration;
`;
```

使用自定义模板:
```bash
ts-node src/db/cli/migrate.ts create "迁移描述" \
  --template ./migration-template.ts
```

### 迁移钩子

```typescript
import { MigrationManager } from '../src/db/migrations/migration-manager';

const manager = new MigrationManager();

// 添加迁移前钩子
manager.addHook('beforeUp', async (version, description) => {
  console.log(`开始迁移: ${version} - ${description}`);
  // 备份数据库
  await backupDatabase();
});

// 添加迁移后钩子
manager.addHook('afterUp', async (version, description) => {
  console.log(`迁移完成: ${version} - ${description}`);
  // 清理临时数据
  await cleanupTempData();
});

// 添加错误钩子
manager.addHook('onError', async (version, error) => {
  console.error(`迁移失败: ${version}`, error);
  // 发送告警
  await sendAlert(`迁移 ${version} 失败: ${error.message}`);
});
```

## 故障排除

### 常见问题

#### Q1: 迁移执行失败怎么办？
**A:** 检查错误信息，修复问题后可以：
```bash
# 查看失败迁移
ts-node src/db/cli/migrate.ts status

# 手动修复迁移表
ts-node src/db/cli/migrate.ts repair --version 5

# 重新执行迁移
ts-node src/db/cli/migrate.ts up --version 5
```

#### Q2: 如何跳过失败的迁移？
**A:** 不推荐跳过，但紧急情况下：
```bash
# 标记迁移为已完成（慎用）
ts-node src/db/cli/migrate.ts mark --version 5 --status completed

# 标记迁移为已回滚
ts-node src/db/cli/migrate.ts mark --version 5 --status rolled_back
```

#### Q3: 迁移文件损坏或丢失？
**A:** 从备份恢复或重新创建：
```bash
# 验证迁移文件完整性
ts-node src/db/cli/migrate.ts validate

# 重新生成丢失的迁移文件
ts-node src/db/cli/migrate.ts recreate --version 5 --description "原始描述"
```

#### Q4: 依赖冲突如何解决？
**A:** 检查并修复依赖关系：
```bash
# 分析依赖关系
ts-node src/db/cli/migrate.ts deps --version 5

# 重新指定依赖
ts-node src/db/cli/migrate.ts edit --version 5 --dependencies "1,2,3"
```

### 错误代码

| 错误代码 | 说明 | 解决方法 |
|----------|------|----------|
| MIGRATION_001 | 迁移表不存在 | 执行 `migrate init` |
| MIGRATION_002 | 迁移文件不存在 | 检查迁移脚本目录 |
| MIGRATION_003 | 依赖未满足 | 检查依赖迁移是否已执行 |
| MIGRATION_004 | 版本冲突 | 检查版本号是否重复 |
| MIGRATION_005 | 迁移执行失败 | 查看详细错误信息 |
| MIGRATION_006 | 回滚失败 | 手动修复数据 |
| MIGRATION_007 | 验证失败 | 执行 `migrate validate --fix` |

## 监控和日志

### 迁移日志

迁移系统记录详细日志，位置：`logs/migrations.log`

```bash
# 查看迁移日志
tail -f logs/migrations.log

# 按日期查看
grep "2026-01-29" logs/migrations.log
```

### 性能监控

```typescript
import { migrationMonitor } from '../src/db/migrations/migration-monitor';

// 获取迁移统计
const stats = migrationMonitor.getStats();
console.log(`总迁移数: ${stats.totalMigrations}`);
console.log(`平均执行时间: ${stats.avgExecutionTime}ms`);
console.log(`失败率: ${stats.failureRate}%`);

// 获取迁移时间线
const timeline = migrationMonitor.getTimeline('2026-01-01', '2026-01-31');
```

### 告警配置

配置迁移告警规则：

```yaml
# config/alerts.yaml
migration:
  rules:
    - name: migration-failure
      condition: "status == 'failed'"
      action: "email"
      recipients: ["admin@example.com"]

    - name: migration-slow
      condition: "execution_time > 5000"
      action: "slack"
      channel: "#alerts"

    - name: version-behind
      condition: "pending_migrations > 5"
      action: "pagerduty"
      severity: "critical"
```

## 最佳实践

### 开发环境

1. **版本控制**: 将所有迁移文件纳入版本控制
2. **测试迁移**: 在测试环境验证迁移脚本
3. **代码审查**: 迁移脚本需要代码审查
4. **文档记录**: 为每个迁移编写文档

### 生产环境

1. **备份优先**: 执行迁移前备份数据库
2. **维护窗口**: 在低峰期执行迁移
3. **监控告警**: 设置迁移监控和告警
4. **回滚计划**: 准备回滚方案
5. **逐步发布**: 分阶段执行大规模迁移

### 团队协作

1. **迁移顺序**: 协调团队成员的迁移顺序
2. **冲突解决**: 建立迁移冲突解决流程
3. **知识分享**: 定期分享迁移经验
4. **工具标准化**: 统一迁移工具和流程

## 附录

### 迁移检查清单

- [ ] 备份数据库
- [ ] 验证迁移脚本语法
- [ ] 测试升级和降级操作
- [ ] 检查依赖关系
- [ ] 设置维护窗口通知
- [ ] 准备回滚方案
- [ ] 监控迁移执行
- [ ] 验证数据完整性
- [ ] 更新文档

### 迁移模板库

访问内部Wiki获取常用迁移模板：
- 添加新表模板
- 添加索引模板
- 数据转换模板
- 分表迁移模板
- 数据归档模板

---

*本文档最后更新于 2026-01-29*
*迁移系统版本: 1.0.0*