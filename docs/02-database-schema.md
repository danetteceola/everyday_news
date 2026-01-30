# 提案 02: SQLite 数据库架构设计

## 需求分析

需要存储每日采集的新闻数据，支持查询、统计和分析。

## 数据库设计

### 核心表结构

```sql
-- 新闻源平台
CREATE TABLE platforms (
    id INTEGER PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL,
    icon VARCHAR(100),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 采集的新闻
CREATE TABLE news_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_id INTEGER NOT NULL,
    external_id VARCHAR(255),
    title VARCHAR(500),
    content TEXT,
    url VARCHAR(1000),
    author VARCHAR(255),
    publish_time DATETIME,
    engagement_views INTEGER DEFAULT 0,
    engagement_likes INTEGER DEFAULT 0,
    engagement_shares INTEGER DEFAULT 0,
    engagement_comments INTEGER DEFAULT 0,
    tags TEXT, -- JSON array
    category VARCHAR(50),
    is_investment_related BOOLEAN DEFAULT FALSE,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (platform_id) REFERENCES platforms(id),
    UNIQUE(platform_id, external_id)
);

-- 每日热点汇总
CREATE TABLE daily_summaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE UNIQUE NOT NULL,
    domestic_hotspots TEXT, -- JSON
    international_hotspots TEXT, -- JSON
    investment_hotspots TEXT, -- JSON
    generated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 采集任务日志
CREATE TABLE crawl_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_id INTEGER NOT NULL,
    started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    completed_at DATETIME,
    items_collected INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'running',
    error_message TEXT,
    FOREIGN KEY (platform_id) REFERENCES platforms(id)
);

-- 索引优化
CREATE INDEX idx_news_platform_date ON news_items(platform_id, publish_time);
CREATE INDEX idx_news_category ON news_items(category, publish_time);
CREATE INDEX idx_news_investment ON news_items(is_investment_related, publish_time);
```

### 存储估算

| 数据类型 | 单条大小 | 每日量 | 年存储 |
|----------|----------|--------|--------|
| 新闻条目 | ~1KB | ~500条 | ~180MB |
| 汇总数据 | ~5KB | 1条 | ~2MB |
| 日志 | ~200B | ~10条 | ~700KB |

## 备份策略

- 每日自动备份到 `backups/` 目录
- 保留最近 7 天备份
- 重要数据可导出 JSON

## 决策

采用 better-sqlite3，性能好、类型安全。
