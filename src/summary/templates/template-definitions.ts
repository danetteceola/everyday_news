/**
 * 模板定义
 */

import {
  TemplateInstance,
  TemplateMetadata,
  TemplateConfig,
  TemplateSection,
  TemplateVariableDefinition,
  TemplateVariableType,
  VariableSource,
  ValidationRule,
  ValidationRuleType,
  ValidationSeverity,
  TemplateFormat,
  SummaryType,
  SummaryLanguage,
  OutputFormat,
  OutputStyle,
  AIIntegrationConfig,
  PromptSectionMapping,
  AIValidationRule,
  AIValidationAction,
  FallbackStrategy,
  FallbackAction
} from './types';

/**
 * 创建模板元数据
 */
export function createTemplateMetadata(
  id: string,
  name: string,
  version: string = '1.0.0',
  description?: string,
  author: string = 'System',
  tags: string[] = []
): TemplateMetadata {
  const now = new Date();
  return {
    id,
    name,
    description,
    version,
    author,
    createdAt: now,
    updatedAt: now,
    tags,
    compatibleWith: []
  };
}

/**
 * 创建模板部分
 */
export function createTemplateSection(
  id: string,
  name: string,
  required: boolean = true,
  description?: string,
  minLength?: number,
  maxLength?: number,
  format?: string,
  variables: string[] = [],
  contentExample?: string,
  aiGuidance?: string
): TemplateSection {
  return {
    id,
    name,
    description,
    required,
    minLength,
    maxLength,
    format,
    variables,
    contentExample,
    aiGuidance
  };
}

/**
 * 创建模板变量定义
 */
export function createTemplateVariableDefinition(
  name: string,
  type: TemplateVariableType,
  required: boolean = false,
  description?: string,
  defaultValue?: any,
  source: VariableSource = VariableSource.DATA,
  validation?: any
): TemplateVariableDefinition {
  return {
    name,
    type,
    description,
    required,
    defaultValue,
    source,
    validation
  };
}

/**
 * 创建验证规则
 */
export function createValidationRule(
  type: ValidationRuleType,
  condition: string,
  message: string,
  severity: ValidationSeverity = ValidationSeverity.ERROR
): ValidationRule {
  return {
    type,
    condition,
    message,
    severity
  };
}

/**
 * 创建AI集成配置
 */
export function createAIIntegrationConfig(
  useAsPrompt: boolean = true,
  promptSectionMapping: PromptSectionMapping[] = [],
  validationRules: AIValidationRule[] = [],
  fallbackStrategies: FallbackStrategy[] = []
): AIIntegrationConfig {
  return {
    useAsPrompt,
    promptSectionMapping,
    validationRules,
    fallbackStrategies
  };
}

/**
 * 创建标准每日总结模板（中文）
 */
export function createDailySummaryTemplateZh(): TemplateInstance {
  const metadata = createTemplateMetadata(
    'daily-summary-zh',
    '每日新闻总结模板（中文）',
    '1.0.0',
    '标准每日新闻总结模板，包含概览、国内热点、国际热点、投资热点等部分',
    'System',
    ['daily', 'summary', 'zh', 'news']
  );

  const sections: TemplateSection[] = [
    createTemplateSection(
      'header',
      '标题和日期',
      true,
      '总结的标题和生成日期',
      50,
      200,
      'markdown',
      ['title', 'date'],
      '# 每日新闻总结 - {{date}}\n\n## 概览',
      '生成清晰简洁的标题，包含日期'
    ),
    createTemplateSection(
      'overview',
      '概览',
      true,
      '今日新闻总体概览',
      200,
      500,
      'markdown',
      ['totalNewsCount', 'platformCounts', 'overviewSummary'],
      '今日共收集 {{totalNewsCount}} 条新闻，来自 {{platformCounts}} 个平台。总体来看...',
      '总结今日新闻总体趋势和重点'
    ),
    createTemplateSection(
      'domestic',
      '国内热点',
      true,
      '国内热点新闻总结',
      300,
      1000,
      'markdown',
      ['domesticNews', 'domesticTrends', 'keyEvents'],
      '## 国内热点\n\n1. **热点事件1**：简要描述\n   - 影响：...\n   - 趋势：...\n\n2. **热点事件2**：简要描述\n   - 影响：...\n   - 趋势：...',
      '按重要性排序，每个热点提供简要描述、影响分析和趋势判断'
    ),
    createTemplateSection(
      'international',
      '国际热点',
      true,
      '国际热点新闻总结',
      300,
      1000,
      'markdown',
      ['internationalNews', 'globalTrends', 'diplomaticEvents'],
      '## 国际热点\n\n1. **国际事件1**：简要描述\n   - 地区影响：...\n   - 全球影响：...\n\n2. **国际事件2**：简要描述\n   - 地区影响：...\n   - 全球影响：...',
      '关注全球重要事件，分析地区和国际影响'
    ),
    createTemplateSection(
      'investment',
      '投资热点',
      false,
      '投资相关新闻总结',
      200,
      800,
      'markdown',
      ['investmentNews', 'marketTrends', 'stockPerformance', 'cryptoNews'],
      '## 投资热点\n\n### 股市动态\n- 主要指数：...\n- 热门板块：...\n\n### 加密货币\n- 主要币种：...\n- 市场情绪：...',
      '分析市场动态和投资机会，提供实用信息'
    ),
    createTemplateSection(
      'trends',
      '趋势分析',
      false,
      '今日趋势分析和预测',
      200,
      600,
      'markdown',
      ['keyTrends', 'predictions', 'recommendations'],
      '## 趋势分析\n\n### 主要趋势\n1. 趋势1：...\n2. 趋势2：...\n\n### 未来展望\n- 短期：...\n- 中期：...',
      '识别关键趋势，提供有洞察力的分析和预测'
    ),
    createTemplateSection(
      'footer',
      '总结和说明',
      false,
      '总结结尾和说明',
      50,
      300,
      'markdown',
      ['generatedAt', 'dataSources', 'disclaimer'],
      '---\n\n*总结生成时间：{{generatedAt}}*\n*数据来源：{{dataSources}}*\n{{disclaimer}}',
      '提供必要的说明和免责声明'
    )
  ];

  const variables: TemplateVariableDefinition[] = [
    createTemplateVariableDefinition(
      'title',
      TemplateVariableType.STRING,
      false,
      '总结标题',
      '每日新闻总结',
      VariableSource.SYSTEM
    ),
    createTemplateVariableDefinition(
      'date',
      TemplateVariableType.DATE,
      true,
      '总结日期',
      undefined,
      VariableSource.SYSTEM,
      { pattern: 'yyyy-mm-dd' }
    ),
    createTemplateVariableDefinition(
      'totalNewsCount',
      TemplateVariableType.NUMBER,
      true,
      '新闻总数',
      0,
      VariableSource.DATA,
      { min: 0 }
    ),
    createTemplateVariableDefinition(
      'platformCounts',
      TemplateVariableType.OBJECT,
      true,
      '各平台新闻数量',
      {},
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'overviewSummary',
      TemplateVariableType.STRING,
      true,
      '总体概览',
      '',
      VariableSource.AI,
      { minLength: 100, maxLength: 500 }
    ),
    createTemplateVariableDefinition(
      'domesticNews',
      TemplateVariableType.ARRAY,
      true,
      '国内新闻列表',
      [],
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'domesticTrends',
      TemplateVariableType.STRING,
      false,
      '国内趋势分析',
      '',
      VariableSource.AI
    ),
    createTemplateVariableDefinition(
      'internationalNews',
      TemplateVariableType.ARRAY,
      true,
      '国际新闻列表',
      [],
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'globalTrends',
      TemplateVariableType.STRING,
      false,
      '全球趋势分析',
      '',
      VariableSource.AI
    ),
    createTemplateVariableDefinition(
      'investmentNews',
      TemplateVariableType.ARRAY,
      false,
      '投资新闻列表',
      [],
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'marketTrends',
      TemplateVariableType.STRING,
      false,
      '市场趋势分析',
      '',
      VariableSource.AI
    ),
    createTemplateVariableDefinition(
      'keyTrends',
      TemplateVariableType.STRING,
      false,
      '关键趋势',
      '',
      VariableSource.AI
    ),
    createTemplateVariableDefinition(
      'predictions',
      TemplateVariableType.STRING,
      false,
      '未来预测',
      '',
      VariableSource.AI
    ),
    createTemplateVariableDefinition(
      'generatedAt',
      TemplateVariableType.DATE,
      true,
      '生成时间',
      undefined,
      VariableSource.SYSTEM
    ),
    createTemplateVariableDefinition(
      'dataSources',
      TemplateVariableType.STRING,
      true,
      '数据来源',
      'Twitter, YouTube, TikTok, 微博, 抖音',
      VariableSource.SYSTEM
    ),
    createTemplateVariableDefinition(
      'disclaimer',
      TemplateVariableType.STRING,
      false,
      '免责声明',
      '*本总结由AI生成，仅供参考，不构成投资建议。*',
      VariableSource.SYSTEM
    )
  ];

  const validationRules: ValidationRule[] = [
    createValidationRule(
      ValidationRuleType.COMPLETENESS,
      'hasOverview',
      '必须包含概览部分',
      ValidationSeverity.ERROR
    ),
    createValidationRule(
      ValidationRuleType.COMPLETENESS,
      'hasDomesticSection',
      '必须包含国内热点部分',
      ValidationSeverity.ERROR
    ),
    createValidationRule(
      ValidationRuleType.COMPLETENESS,
      'hasInternationalSection',
      '必须包含国际热点部分',
      ValidationSeverity.ERROR
    ),
    createValidationRule(
      ValidationRuleType.LENGTH,
      'overviewLength',
      '概览部分长度应在200-500字符之间',
      ValidationSeverity.WARNING
    ),
    createValidationRule(
      ValidationRuleType.FORMAT,
      'markdownFormat',
      '必须使用正确的Markdown格式',
      ValidationSeverity.WARNING
    )
  ];

  const aiIntegration: AIIntegrationConfig = createAIIntegrationConfig(
    true,
    [
      { templateSectionId: 'overview', promptVariable: 'overview', transformation: 'summary' },
      { templateSectionId: 'domestic', promptVariable: 'domestic_news', transformation: 'analyze' },
      { templateSectionId: 'international', promptVariable: 'international_news', transformation: 'analyze' },
      { templateSectionId: 'investment', promptVariable: 'investment_news', transformation: 'analyze' },
      { templateSectionId: 'trends', promptVariable: 'trends', transformation: 'predict' }
    ],
    [
      {
        check: 'section_completeness',
        message: '所有必需部分必须完整',
        action: AIValidationAction.RETRY
      },
      {
        check: 'content_quality',
        message: '内容质量不足',
        action: AIValidationAction.REGENERATE
      }
    ],
    [
      {
        condition: 'ai_failed_3_times',
        action: FallbackAction.USE_SIMPLER_TEMPLATE,
        templateId: 'daily-summary-simple-zh',
        message: '切换到简化模板'
      },
      {
        condition: 'missing_investment_data',
        action: FallbackAction.SKIP_SECTION,
        message: '跳过投资热点部分'
      }
    ]
  );

  const config: TemplateConfig = {
    type: SummaryType.DAILY,
    language: SummaryLanguage.ZH,
    format: TemplateFormat.MARKDOWN,
    sections,
    variables,
    validationRules,
    outputFormat: {
      type: TemplateFormat.MARKDOWN,
      options: {
        includeHeader: true,
        includeFooter: true,
        includeMetadata: false,
        style: {
          font: 'default',
          fontSize: 14,
          lineHeight: 1.6,
          margin: 20,
          theme: 'github'
        },
        encoding: 'utf-8',
        lineEnding: 'lf'
      }
    },
    aiIntegration
  };

  const content = `# {{title}} - {{date|date:yyyy-mm-dd}}

## 概览

{{overviewSummary}}

今日共收集 {{totalNewsCount}} 条新闻，来自多个社交平台。

## 国内热点

{{#each domesticNews}}
### {{title}}
- **平台**: {{platform}}
- **内容**: {{content}}
- **热度**: {{engagement}}
- **分析**: {{analysis}}
{{/each}}

{{domesticTrends}}

## 国际热点

{{#each internationalNews}}
### {{title}}
- **平台**: {{platform}}
- **内容**: {{content}}
- **热度**: {{engagement}}
- **分析**: {{analysis}}
{{/each}}

{{globalTrends}}

{{#if investmentNews.length}}
## 投资热点

{{#each investmentNews}}
### {{title}}
- **资产**: {{assets}}
- **影响**: {{impact}}
- **分析**: {{analysis}}
{{/each}}

{{marketTrends}}
{{/if}}

{{#if keyTrends}}
## 趋势分析

{{keyTrends}}

{{predictions}}
{{/if}}

---

*总结生成时间：{{generatedAt|datetime}}*
*数据来源：{{dataSources}}*
{{disclaimer}}`;

  return {
    metadata,
    config,
    content,
    variables: {},
    validationResults: []
  };
}

/**
 * 创建投资焦点总结模板（中文）
 */
export function createInvestmentSummaryTemplateZh(): TemplateInstance {
  const metadata = createTemplateMetadata(
    'investment-summary-zh',
    '投资焦点总结模板（中文）',
    '1.0.0',
    '投资焦点总结模板，专注于金融市场、股票、加密货币等投资相关信息',
    'System',
    ['investment', 'summary', 'zh', 'finance']
  );

  const sections: TemplateSection[] = [
    createTemplateSection(
      'header',
      '标题和日期',
      true,
      '投资总结的标题和生成日期',
      50,
      200,
      'markdown',
      ['title', 'date', 'marketDate'],
      '# 投资焦点总结 - {{date}}\n\n## 市场概况',
      '生成专业投资总结标题'
    ),
    createTemplateSection(
      'marketOverview',
      '市场概况',
      true,
      '整体市场表现概览',
      200,
      500,
      'markdown',
      ['marketIndicators', 'keyIndices', 'overallSentiment'],
      '## 市场概况\n\n今日市场整体{{overallSentiment}}，主要指数表现...',
      '分析市场整体表现和情绪'
    ),
    createTemplateSection(
      'stockMarket',
      '股市动态',
      true,
      '股票市场分析和表现',
      300,
      1000,
      'markdown',
      ['stockNews', 'sectorPerformance', 'topGainers', 'topLosers'],
      '## 股市动态\n\n### 板块表现\n1. **领涨板块**: ...\n2. **领跌板块**: ...\n\n### 个股表现\n- 涨幅榜：...\n- 跌幅榜：...',
      '详细分析股票市场，关注板块和个股表现'
    ),
    createTemplateSection(
      'cryptoMarket',
      '加密货币',
      false,
      '加密货币市场分析',
      200,
      800,
      'markdown',
      ['cryptoNews', 'topCrypto', 'cryptoTrends', 'regulatoryNews'],
      '## 加密货币\n\n### 主要币种\n- BTC: ...\n- ETH: ...\n\n### 监管动态\n- ...',
      '分析加密货币市场趋势和监管动态'
    ),
    createTemplateSection(
      'commodities',
      '大宗商品',
      false,
      '大宗商品市场分析',
      150,
      600,
      'markdown',
      ['commodityNews', 'oilPrices', 'goldPrices', 'commodityTrends'],
      '## 大宗商品\n\n### 原油价格\n- WTI: ...\n- Brent: ...\n\n### 黄金价格\n- 现货金: ...',
      '关注大宗商品价格和趋势'
    ),
    createTemplateSection(
      'macroEconomics',
      '宏观经济',
      false,
      '宏观经济新闻和分析',
      200,
      700,
      'markdown',
      ['macroNews', 'economicIndicators', 'centralBank', 'policyChanges'],
      '## 宏观经济\n\n### 经济指标\n- CPI: ...\n- GDP: ...\n\n### 央行政策\n- ...',
      '分析宏观经济数据和政策影响'
    ),
    createTemplateSection(
      'investmentOpportunities',
      '投资机会',
      false,
      '投资机会和建议',
      200,
      600,
      'markdown',
      ['opportunities', 'risks', 'recommendations', 'timeHorizon'],
      '## 投资机会\n\n### 机会领域\n1. ...\n2. ...\n\n### 风险提示\n- ...',
      '识别投资机会，提示风险'
    ),
    createTemplateSection(
      'footer',
      '风险提示',
      true,
      '风险提示和免责声明',
      100,
      300,
      'markdown',
      ['riskDisclaimer', 'generatedAt', 'dataSources'],
      '---\n\n**风险提示**: {{riskDisclaimer}}\n\n*生成时间：{{generatedAt}}*\n*数据来源：{{dataSources}}*',
      '提供必要的风险提示'
    )
  ];

  const variables: TemplateVariableDefinition[] = [
    createTemplateVariableDefinition(
      'title',
      TemplateVariableType.STRING,
      false,
      '总结标题',
      '投资焦点总结',
      VariableSource.SYSTEM
    ),
    createTemplateVariableDefinition(
      'date',
      TemplateVariableType.DATE,
      true,
      '总结日期',
      undefined,
      VariableSource.SYSTEM
    ),
    createTemplateVariableDefinition(
      'marketDate',
      TemplateVariableType.DATE,
      true,
      '市场数据日期',
      undefined,
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'marketIndicators',
      TemplateVariableType.OBJECT,
      true,
      '市场指标数据',
      {},
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'keyIndices',
      TemplateVariableType.ARRAY,
      true,
      '主要指数数据',
      [],
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'overallSentiment',
      TemplateVariableType.STRING,
      true,
      '市场整体情绪',
      '中性',
      VariableSource.AI,
      { allowedValues: [' bullish', 'bearish', 'neutral', 'volatile'] }
    ),
    createTemplateVariableDefinition(
      'stockNews',
      TemplateVariableType.ARRAY,
      true,
      '股票新闻',
      [],
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'sectorPerformance',
      TemplateVariableType.ARRAY,
      true,
      '板块表现',
      [],
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'cryptoNews',
      TemplateVariableType.ARRAY,
      false,
      '加密货币新闻',
      [],
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'commodityNews',
      TemplateVariableType.ARRAY,
      false,
      '大宗商品新闻',
      [],
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'macroNews',
      TemplateVariableType.ARRAY,
      false,
      '宏观经济新闻',
      [],
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'opportunities',
      TemplateVariableType.ARRAY,
      false,
      '投资机会',
      [],
      VariableSource.AI
    ),
    createTemplateVariableDefinition(
      'risks',
      TemplateVariableType.ARRAY,
      false,
      '风险因素',
      [],
      VariableSource.AI
    ),
    createTemplateVariableDefinition(
      'recommendations',
      TemplateVariableType.STRING,
      false,
      '投资建议',
      '',
      VariableSource.AI
    ),
    createTemplateVariableDefinition(
      'riskDisclaimer',
      TemplateVariableType.STRING,
      true,
      '风险提示',
      '市场有风险，投资需谨慎。本总结仅供参考，不构成投资建议。',
      VariableSource.SYSTEM
    ),
    createTemplateVariableDefinition(
      'generatedAt',
      TemplateVariableType.DATE,
      true,
      '生成时间',
      undefined,
      VariableSource.SYSTEM
    ),
    createTemplateVariableDefinition(
      'dataSources',
      TemplateVariableType.STRING,
      true,
      '数据来源',
      '金融市场数据、新闻媒体',
      VariableSource.SYSTEM
    )
  ];

  const config: TemplateConfig = {
    type: SummaryType.INVESTMENT,
    language: SummaryLanguage.ZH,
    format: TemplateFormat.MARKDOWN,
    sections,
    variables,
    validationRules: [
      createValidationRule(
        ValidationRuleType.COMPLETENESS,
        'hasMarketOverview',
        '必须包含市场概况',
        ValidationSeverity.ERROR
      ),
      createValidationRule(
        ValidationRuleType.COMPLETENESS,
        'hasStockMarket',
        '必须包含股市动态',
        ValidationSeverity.ERROR
      )
    ],
    outputFormat: {
      type: TemplateFormat.MARKDOWN,
      options: {
        includeHeader: true,
        includeFooter: true,
        includeMetadata: false,
        style: {
          font: 'default',
          fontSize: 14,
          lineHeight: 1.6,
          margin: 20,
          theme: 'github'
        },
        encoding: 'utf-8',
        lineEnding: 'lf'
      }
    },
    aiIntegration: createAIIntegrationConfig(
      true,
      [
        { templateSectionId: 'marketOverview', promptVariable: 'market_overview', transformation: 'analyze' },
        { templateSectionId: 'stockMarket', promptVariable: 'stock_market', transformation: 'analyze' },
        { templateSectionId: 'cryptoMarket', promptVariable: 'crypto_market', transformation: 'analyze' },
        { templateSectionId: 'investmentOpportunities', promptVariable: 'opportunities', transformation: 'suggest' }
      ]
    )
  };

  const content = `# {{title}} - {{date|date:yyyy-mm-dd}}

## 市场概况

{{overallSentiment}} 市场情绪主导今日交易。

### 主要指数表现
{{#each keyIndices}}
- **{{name}}**: {{price}} ({{change}}%)
{{/each}}

{{#if marketIndicators.volume}}
**成交量**: {{marketIndicators.volume}}
{{/if}}

## 股市动态

{{#if sectorPerformance.length}}
### 板块表现
{{#each sectorPerformance}}
- **{{sector}}**: {{performance}}%
{{/each}}
{{/if}}

### 重要新闻
{{#each stockNews}}
#### {{title}}
- **影响**: {{impact}}
- **相关股票**: {{stocks}}
- **分析**: {{analysis}}
{{/each}}

{{#if cryptoNews.length}}
## 加密货币

{{#each cryptoNews}}
#### {{title}}
- **相关币种**: {{coins}}
- **影响**: {{impact}}
- **分析**: {{analysis}}
{{/each}}
{{/if}}

{{#if commodityNews.length}}
## 大宗商品

{{#each commodityNews}}
#### {{title}}
- **商品**: {{commodity}}
- **价格变化**: {{priceChange}}
- **分析**: {{analysis}}
{{/each}}
{{/if}}

{{#if macroNews.length}}
## 宏观经济

{{#each macroNews}}
#### {{title}}
- **指标**: {{indicator}}
- **数值**: {{value}}
- **影响**: {{impact}}
{{/each}}
{{/if}}

{{#if opportunities.length}}
## 投资机会

### 机会领域
{{#each opportunities}}
{{@index}}. **{{area}}**: {{reason}}
{{/each}}

### 风险提示
{{#each risks}}
- {{risk}}
{{/each}}

{{recommendations}}
{{/if}}

---

**风险提示**: {{riskDisclaimer}}

*生成时间：{{generatedAt|datetime}}*
*数据来源：{{dataSources}}*`;

  return {
    metadata,
    config,
    content,
    variables: {},
    validationResults: []
  };
}

/**
 * 创建简要总结模板（中文）
 */
export function createBriefSummaryTemplateZh(): TemplateInstance {
  const metadata = createTemplateMetadata(
    'brief-summary-zh',
    '简要新闻总结模板（中文）',
    '1.0.0',
    '简要新闻总结模板，提供快速概览和要点',
    'System',
    ['brief', 'summary', 'zh', 'quick']
  );

  const sections: TemplateSection[] = [
    createTemplateSection(
      'header',
      '标题',
      true,
      '简要总结标题',
      20,
      100,
      'markdown',
      ['title', 'date'],
      '# 新闻速览 - {{date}}',
      '生成简洁标题'
    ),
    createTemplateSection(
      'quickFacts',
      '快速事实',
      true,
      '关键数据快速展示',
      100,
      300,
      'markdown',
      ['totalNews', 'topPlatform', 'trendingTopics'],
      '**今日数据**: {{totalNews}}条新闻，{{topPlatform}}最活跃\n**热门话题**: {{trendingTopics}}',
      '用简短形式展示关键数据'
    ),
    createTemplateSection(
      'topStories',
      '头条新闻',
      true,
      '最重要的3-5条新闻',
      200,
      500,
      'markdown',
      ['topStories'],
      '## 头条新闻\n\n1. **新闻1**: 简要描述\n2. **新闻2**: 简要描述',
      '选择最重要的新闻，每条用一句话描述'
    ),
    createTemplateSection(
      'keyTakeaways',
      '关键要点',
      true,
      '今日关键要点总结',
      150,
      400,
      'markdown',
      ['keyTakeaways'],
      '## 关键要点\n\n- 要点1\n- 要点2\n- 要点3',
      '提炼3-5个关键要点'
    ),
    createTemplateSection(
      'actionItems',
      '关注事项',
      false,
      '需要关注的事项',
      100,
      300,
      'markdown',
      ['actionItems'],
      '## 关注事项\n\n- 关注1\n- 关注2',
      '列出需要继续关注的事项'
    )
  ];

  const variables: TemplateVariableDefinition[] = [
    createTemplateVariableDefinition(
      'title',
      TemplateVariableType.STRING,
      false,
      '总结标题',
      '新闻速览',
      VariableSource.SYSTEM
    ),
    createTemplateVariableDefinition(
      'date',
      TemplateVariableType.DATE,
      true,
      '日期',
      undefined,
      VariableSource.SYSTEM
    ),
    createTemplateVariableDefinition(
      'totalNews',
      TemplateVariableType.NUMBER,
      true,
      '新闻总数',
      0,
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'topPlatform',
      TemplateVariableType.STRING,
      true,
      '最活跃平台',
      '',
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'trendingTopics',
      TemplateVariableType.ARRAY,
      true,
      '热门话题',
      [],
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'topStories',
      TemplateVariableType.ARRAY,
      true,
      '头条新闻',
      [],
      VariableSource.DATA
    ),
    createTemplateVariableDefinition(
      'keyTakeaways',
      TemplateVariableType.ARRAY,
      true,
      '关键要点',
      [],
      VariableSource.AI
    ),
    createTemplateVariableDefinition(
      'actionItems',
      TemplateVariableType.ARRAY,
      false,
      '关注事项',
      [],
      VariableSource.AI
    )
  ];

  const config: TemplateConfig = {
    type: SummaryType.BRIEF,
    language: SummaryLanguage.ZH,
    format: TemplateFormat.MARKDOWN,
    sections,
    variables,
    validationRules: [
      createValidationRule(
        ValidationRuleType.LENGTH,
        'totalLength',
        '简要总结总长度应在500-1000字符之间',
        ValidationSeverity.WARNING
      ),
      createValidationRule(
        ValidationRuleType.COMPLETENESS,
        'hasTopStories',
        '必须包含头条新闻',
        ValidationSeverity.ERROR
      )
    ],
    outputFormat: {
      type: TemplateFormat.MARKDOWN,
      options: {
        includeHeader: true,
        includeFooter: false,
        includeMetadata: false,
        style: {
          font: 'default',
          fontSize: 14,
          lineHeight: 1.5,
          margin: 10,
          theme: 'minimal'
        },
        encoding: 'utf-8',
        lineEnding: 'lf'
      }
    },
    aiIntegration: createAIIntegrationConfig(
      true,
      [
        { templateSectionId: 'topStories', promptVariable: 'top_stories', transformation: 'select' },
        { templateSectionId: 'keyTakeaways', promptVariable: 'key_takeaways', transformation: 'summarize' }
      ]
    )
  };

  const content = `# {{title}} - {{date|date:yyyy-mm-dd}}

**📊 今日数据**: {{totalNews}}条新闻 | **🎯 最活跃**: {{topPlatform}}
**🔥 热门话题**: {{trendingTopics|join:", "}}

## 头条新闻

{{#each topStories}}
{{@index}}. **{{title}}**
   - {{summary}}
   - *平台*: {{platform}} | *热度*: {{engagement}}
{{/each}}

## 关键要点

{{#each keyTakeaways}}
- {{takeaway}}
{{/each}}

{{#if actionItems.length}}
## 关注事项

{{#each actionItems}}
- {{item}}
{{/each}}
{{/if}}

---

*生成时间：{{"now"|date:HH:mm}}*`;

  return {
    metadata,
    config,
    content,
    variables: {},
    validationResults: []
  };
}

/**
 * 创建英文模板
 */
export function createDailySummaryTemplateEn(): TemplateInstance {
  const zhTemplate = createDailySummaryTemplateZh();
  return {
    ...zhTemplate,
    metadata: {
      ...zhTemplate.metadata,
      id: 'daily-summary-en',
      name: 'Daily News Summary Template (English)',
      description: 'Standard daily news summary template with overview, domestic hotspots, international hotspots, and investment hotspots sections',
      tags: ['daily', 'summary', 'en', 'news']
    },
    config: {
      ...zhTemplate.config,
      language: SummaryLanguage.EN
    },
    content: zhTemplate.content
      .replace('每日新闻总结', 'Daily News Summary')
      .replace('## 概览', '## Overview')
      .replace('## 国内热点', '## Domestic Hotspots')
      .replace('## 国际热点', '## International Hotspots')
      .replace('## 投资热点', '## Investment Hotspots')
      .replace('## 趋势分析', '## Trend Analysis')
      .replace('总结生成时间', 'Generated at')
      .replace('数据来源', 'Data sources')
      .replace('本总结由AI生成，仅供参考，不构成投资建议。', 'This summary is AI-generated, for reference only, not investment advice.')
  };
}

/**
 * 创建投资焦点总结模板（英文）
 */
export function createInvestmentSummaryTemplateEn(): TemplateInstance {
  const zhTemplate = createInvestmentSummaryTemplateZh();
  return {
    ...zhTemplate,
    metadata: {
      ...zhTemplate.metadata,
      id: 'investment-summary-en',
      name: 'Investment Focus Summary Template (English)',
      description: 'Investment focus summary template focusing on financial markets, stocks, cryptocurrencies, and other investment-related information',
      tags: ['investment', 'summary', 'en', 'finance']
    },
    config: {
      ...zhTemplate.config,
      language: SummaryLanguage.EN
    },
    content: zhTemplate.content
      .replace('投资焦点总结', 'Investment Focus Summary')
      .replace('## 市场概况', '## Market Overview')
      .replace('## 股市动态', '## Stock Market Dynamics')
      .replace('## 加密货币', '## Cryptocurrency Market')
      .replace('## 大宗商品', '## Commodities')
      .replace('## 宏观经济', '## Macro Economics')
      .replace('## 投资机会', '## Investment Opportunities')
      .replace('风险提示', 'Risk Disclaimer')
      .replace('生成时间', 'Generated at')
      .replace('数据来源', 'Data sources')
      .replace('市场有风险，投资需谨慎。本总结仅供参考，不构成投资建议。', 'Market risk exists, invest with caution. This summary is for reference only, not investment advice.')
  };
}

/**
 * 创建简要总结模板（英文）
 */
export function createBriefSummaryTemplateEn(): TemplateInstance {
  const zhTemplate = createBriefSummaryTemplateZh();
  return {
    ...zhTemplate,
    metadata: {
      ...zhTemplate.metadata,
      id: 'brief-summary-en',
      name: 'Brief News Summary Template (English)',
      description: 'Brief news summary template providing quick overview and key points',
      tags: ['brief', 'summary', 'en', 'quick']
    },
    config: {
      ...zhTemplate.config,
      language: SummaryLanguage.EN
    },
    content: zhTemplate.content
      .replace('新闻速览', 'News Brief')
      .replace('📊 今日数据', '📊 Today\'s Data')
      .replace('条新闻', 'news items')
      .replace('最活跃', 'Most Active')
      .replace('🔥 热门话题', '🔥 Trending Topics')
      .replace('## 头条新闻', '## Top Stories')
      .replace('## 关键要点', '## Key Takeaways')
      .replace('## 关注事项', '## Action Items')
      .replace('平台', 'Platform')
      .replace('热度', 'Engagement')
      .replace('生成时间', 'Generated at')
  };
}

/**
 * 模板注册表
 */
export class TemplateRegistry {
  private static templates: Map<string, () => TemplateInstance> = new Map();

  static {
    // 注册所有模板
    this.register('daily-summary-zh', createDailySummaryTemplateZh);
    this.register('investment-summary-zh', createInvestmentSummaryTemplateZh);
    this.register('brief-summary-zh', createBriefSummaryTemplateZh);
    this.register('daily-summary-en', createDailySummaryTemplateEn);
    this.register('investment-summary-en', createInvestmentSummaryTemplateEn);
    this.register('brief-summary-en', createBriefSummaryTemplateEn);
  }

  /**
   * 注册模板
   */
  static register(templateId: string, factory: () => TemplateInstance): void {
    this.templates.set(templateId, factory);
  }

  /**
   * 获取模板
   */
  static get(templateId: string): TemplateInstance | null {
    const factory = this.templates.get(templateId);
    if (!factory) {
      return null;
    }
    return factory();
  }

  /**
   * 获取所有模板ID
   */
  static getAllIds(): string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * 检查模板是否存在
   */
  static has(templateId: string): boolean {
    return this.templates.has(templateId);
  }

  /**
   * 移除模板
   */
  static remove(templateId: string): boolean {
    return this.templates.delete(templateId);
  }

  /**
   * 清空注册表
   */
  static clear(): void {
    this.templates.clear();
  }
}