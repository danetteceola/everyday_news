# Daily Summary Claude Skill 帮助文档

## 概述

Daily Summary Skill 是一个 Claude Skill，用于从多个社交媒体平台收集新闻并生成 AI 总结。该技能可以生成每日新闻总结、投资总结或简要总结，支持中文和英文。

## 基本用法

### 通过 Claude Code 调用

```bash
claude daily-summary --date 2024-01-15 --language zh --summaryType daily
```

### 通过 API 调用

```javascript
const result = await executeSkillQuickly('daily-summary', {
  date: '2024-01-15',
  language: 'zh',
  summaryType: 'daily'
});
```

## 参数说明

### date (日期)
- **类型**: string
- **必需**: 否
- **默认值**: 今天 (YYYY-MM-DD)
- **格式**: YYYY-MM-DD
- **描述**: 生成总结的日期
- **示例**: `2024-01-15`

### language (语言)
- **类型**: string
- **必需**: 否
- **默认值**: `zh`
- **可选值**: `zh` (中文), `en` (英文)
- **描述**: 总结输出的语言
- **示例**: `zh`

### summaryType (总结类型)
- **类型**: string
- **必需**: 否
- **默认值**: `daily`
- **可选值**:
  - `daily`: 每日总结 (综合新闻)
  - `investment`: 投资总结 (投资焦点)
  - `brief`: 简要总结 (快速概览)
- **描述**: 生成的总结类型
- **示例**: `investment`

### sources (数据来源)
- **类型**: array
- **必需**: 否
- **默认值**: `['twitter', 'youtube', 'tiktok', 'weibo', 'douyin']`
- **可选值**: `twitter`, `youtube`, `tiktok`, `weibo`, `douyin`
- **描述**: 从哪些社交媒体平台获取数据
- **示例**: `['twitter', 'weibo']`

### maxLength (最大长度)
- **类型**: number
- **必需**: 否
- **默认值**: `1000`
- **范围**: 1-5000 字符
- **描述**: 总结的最大长度（字符数）
- **示例**: `1500`

### includeTrends (包含趋势分析)
- **类型**: boolean
- **必需**: 否
- **默认值**: `true`
- **描述**: 是否在总结中包含趋势分析
- **示例**: `false`

### includeStatistics (包含统计数据)
- **类型**: boolean
- **必需**: 否
- **默认值**: `true`
- **描述**: 是否在总结中包含统计数据
- **示例**: `true`

### outputFormat (输出格式)
- **类型**: string
- **必需**: 否
- **默认值**: `markdown`
- **可选值**: `markdown`, `html`, `plaintext`
- **描述**: 总结的输出格式
- **示例**: `html`

## 使用示例

### 示例 1: 生成今天的每日总结（中文）

```bash
claude daily-summary
```

等效于:
```bash
claude daily-summary --date $(date +%Y-%m-%d) --language zh --summaryType daily
```

### 示例 2: 生成昨天的投资总结（英文）

```bash
claude daily-summary --date 2024-01-14 --language en --summaryType investment
```

### 示例 3: 生成微博和抖音的简要总结

```bash
claude daily-summary --summaryType brief --sources weibo douyin
```

### 示例 4: 生成包含统计数据的详细总结（HTML格式）

```bash
claude daily-summary --maxLength 2000 --includeStatistics true --outputFormat html
```

### 示例 5: 生成不带趋势分析的快速总结

```bash
claude daily-summary --includeTrends false --maxLength 500
```

## 输出示例

### 成功响应

```json
{
  "success": true,
  "data": {
    "summary": "# 2024-01-15 每日新闻总结\n\n## 今日热点\n\n1. **AI技术突破**：最新研究显示...\n2. **投资市场动态**：股市今日...\n\n## 趋势分析\n\n- 人工智能话题热度上升50%\n- 投资相关讨论增加30%\n\n## 统计数据\n\n- 总新闻数: 100\n- 来源分布: Twitter(30%), YouTube(25%), TikTok(20%), Weibo(15%), Douyin(10%)\n- 热门话题: AI(50条), 投资(30条), 科技(20条)",
    "metadata": {
      "date": "2024-01-15",
      "summaryType": "daily",
      "language": "zh",
      "length": 1245,
      "sources": ["twitter", "youtube", "tiktok", "weibo", "douyin"],
      "generatedAt": "2024-01-15T14:30:00.000Z"
    },
    "rawData": {
      "newsCount": 100,
      "statistics": {
        "totalItems": 100,
        "bySource": {
          "twitter": 30,
          "youtube": 25,
          "tiktok": 20,
          "weibo": 15,
          "douyin": 10
        }
      }
    }
  },
  "metadata": {
    "executionTime": 4523,
    "skillId": "daily-summary",
    "requestId": "req-1705336200000-abc123",
    "timestamp": "2024-01-15T14:30:00.000Z"
  }
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "code": "PARAM_VALIDATION_FAILED",
    "message": "参数验证失败",
    "details": ["参数 \"date\" 格式错误"]
  },
  "metadata": {
    "executionTime": 123,
    "skillId": "daily-summary",
    "requestId": "req-1705336200000-def456",
    "timestamp": "2024-01-15T14:30:00.000Z"
  }
}
```

## 错误代码

| 错误代码 | 描述 | 解决方案 |
|---------|------|---------|
| PARAM_VALIDATION_FAILED | 参数验证失败 | 检查参数格式和值 |
| EXECUTION_FAILED | 技能执行失败 | 检查网络连接和API密钥 |
| SKILL_NOT_FOUND | 技能未找到 | 确认技能ID正确 |
| SKILL_DISABLED | 技能已禁用 | 在配置中启用技能 |
| TIMEOUT | 执行超时 | 增加超时时间或重试 |
| INVALID_STATE | 无效状态 | 检查技能并发限制 |

## 配置选项

技能可以通过环境变量配置：

```bash
# 技能超时时间（毫秒）
export SKILL_TIMEOUT=30000

# 最大并发执行数
export SKILL_MAX_CONCURRENT=10

# 启用日志记录
export SKILL_ENABLE_LOGGING=true

# 启用指标收集
export SKILL_ENABLE_METRICS=true

# 重试次数
export SKILL_RETRY_COUNT=3

# 启用的技能列表
export ENABLED_SKILLS=daily-summary

# 禁用的技能列表
export DISABLED_SKILLS=
```

## 最佳实践

1. **日期选择**: 建议使用最近7天的日期，数据更完整
2. **语言选择**: 中文总结更详细，英文总结更简洁
3. **来源选择**: 根据目标受众选择来源平台
4. **长度控制**: 每日总结建议1000-2000字符，简要总结建议500-1000字符
5. **格式选择**:
   - Markdown: 适合显示和阅读
   - HTML: 适合网页嵌入
   - Plaintext: 适合文本处理

## 故障排除

### 问题1: 技能执行超时
- **可能原因**: 网络连接慢或AI API响应慢
- **解决方案**: 增加 `SKILL_TIMEOUT` 或减少 `maxLength`

### 问题2: 生成内容质量低
- **可能原因**: 输入数据不足或AI配置不当
- **解决方案**: 检查数据收集模块，调整AI温度参数

### 问题3: 参数验证失败
- **可能原因**: 参数格式错误或值超出范围
- **解决方案**: 参考本文档的参数说明

### 问题4: 预算超限
- **可能原因**: API调用次数过多或token使用过多
- **解决方案**: 检查成本控制配置，调整预算

## 相关链接

- [技能注册表配置](../skill-registry.ts)
- [技能管理器配置](../skill-manager.ts)
- [AI引擎配置](../../ai-engine/)
- [模板系统配置](../../templates/)