# 提案 03: 新闻总结生成 (Claude Skill)

## 需求

使用 Claude LLM 智能总结每日热点新闻，包括：
- 国内热点
- 国际热点
- 投资相关热点

## Claude Skill 设计

### Skill 结构

```
skills/
├── daily-summary/
│   ├── SKILL.md          # Skill 定义
│   ├── summary-prompt.md # 总结模板
│   └── examples/         # 参考案例
```

### 总结模板 (summary-prompt.md)

```markdown
# 每日新闻总结模板

## 采集概览
- 日期: {date}
- 来源平台: {platforms}
- 总新闻数: {total_count}
- 投资相关: {investment_count}

## 一、国内热点 (Top 5)
### 政治
- [标题] - 摘要 (热度: {score})

### 经济
- [标题] - 摘要 (热度: {score})

### 社会
- [标题] - 摘要 (热度: {score})

## 二、国际热点 (Top 5)
### 美国
- [标题] - 摘要 (热度: {score})

### 欧洲
- [标题] - 摘要 (热度: {score})

### 亚太
- [标题] - 摘要 (热度: {score})

## 三、投资相关热点
### 股市
- [标题] - 摘要 (热度: {score})

### crypto
- [标题] - 摘要 (热度: {score})

### 宏观经济
- [标题] - 摘要 (热度: {score})

## 总结
{ai_generated_summary}

---
生成时间: {timestamp}
```

### 输入数据结构

```typescript
interface SummaryInput {
  date: string;
  platforms: string[];
  domestic: NewsItem[];
  international: NewsItem[];
  investment: NewsItem[];
}
```

### 输出格式

```typescript
interface DailySummary {
  domesticHotspots: Hotspot[];
  internationalHotspots: Hotspot[];
  investmentHotspots: Hotspot[];
  overview: string;
}
```

## 触发方式

1. **定时触发**: 每天 10:00, 22:00 自动总结
2. **手动触发**: `ccr code "生成今日新闻总结"`
3. **API 触发**: `POST /api/summary`

## 质量控制

- 限制总结长度 (max_tokens)
- 检查关键信息遗漏
- 投资建议需标注来源

## 决策

使用 Claude Code Router 调用 DeepSeek 生成总结，速度快且成本低。
