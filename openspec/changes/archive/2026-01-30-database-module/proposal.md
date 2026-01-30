## Why

Everyday News系统需要可靠的数据存储解决方案来持久化采集的新闻数据、每日总结和系统日志。SQLite提供了轻量级、零配置的数据库方案，适合单机部署场景，同时better-sqlite3提供了高性能和类型安全的Node.js集成。

## What Changes

- **新增SQLite数据库架构**：实现4个核心表（platforms, news_items, daily_summaries, crawl_logs）
- **新增数据库操作层**：提供CRUD操作、查询优化和事务管理
- **新增数据迁移系统**：支持数据库版本管理和Schema迁移
- **新增备份和恢复机制**：实现自动备份、数据导出和恢复功能
- **新增数据库性能优化**：实现索引优化、查询优化和连接管理

## Capabilities

### New Capabilities
- **database-schema**: SQLite数据库表结构和Schema定义
- **database-operations**: 数据库CRUD操作和查询接口
- **data-migration**: 数据库版本管理和迁移系统
- **backup-recovery**: 数据备份和恢复机制
- **database-optimization**: 数据库性能优化和监控

### Modified Capabilities
<!-- 没有需要修改的现有能力 -->

## Impact

- **代码影响**：需要创建数据库Schema定义、数据访问层、迁移系统、备份工具
- **API影响**：需要定义数据访问接口和查询API
- **依赖影响**：需要better-sqlite3库，可能需要额外的工具库
- **系统影响**：需要数据库文件存储、备份目录、迁移脚本管理