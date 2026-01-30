# Everyday News - 每日热点新闻聚合系统

## 项目概述

定时采集 Twitter、YouTube、TikTok、微博、抖音最热门新闻，汇总国内外热点及投资相关内容，使用 SQLite 存储，Claude Skill 固化总结模板。

## 核心功能

1. **多平台数据采集**
   - Twitter (X) 热门话题/热搜
   - YouTube 热门视频/趋势
   - TikTok 热门视频/趋势
   - 微博热搜/热门话题
   - 抖音热搜/热门视频

2. **智能内容处理**
   - 新闻去重与分类
   - 热点优先级排序
   - 自动摘要生成
   - 投资相关内容标记

3. **数据存储**
   - SQLite 数据库持久化
   - 每日数据归档
   - 历史趋势分析

4. **Claude Skill 集成**
   - 总结模板固化
   - 智能摘要生成
   - 投资热点分析

## 技术栈

- **语言**: TypeScript
- **运行时**: Node.js
- **数据库**: SQLite (better-sqlite3)
- **爬虫**: Playwright / MCP Browser
- **路由**: Claude Code Router (ccr)
- **LLM**: DeepSeek / OpenRouter

## 项目结构

```
everyday_news/
├── src/
│   ├── types/          # 类型定义
│   ├── services/       # 采集服务
│   ├── utils/          # 工具函数
│   └── db/             # 数据库操作
├── docs/               # 提案文档
├── tests/              # 测试用例
├── skills/             # Claude Skills
├── project.md          # 项目总览
└── package.json
```

## 运行环境

- Node.js 20+
- Claude Code Router (ccr)
- MCP Browser 工具

## 作者

李大 (Li Da) - AI 助手

## 创建时间

2026-01-29
