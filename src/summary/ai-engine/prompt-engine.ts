/**
 * 提示工程和模板系统
 */

import {
  PromptTemplate,
  PromptOptions,
  TemplateInfo,
  SummaryType,
  SummaryLanguage
} from './interface';

/**
 * 提示模板配置
 */
export interface PromptTemplateConfig {
  id: string;
  name: string;
  description: string;
  version: string;
  systemPrompt: string;
  userPromptTemplate: string;
  variables: string[];
  estimatedTokens: number;
}

/**
 * 基础提示模板
 */
export class BasePromptTemplate implements PromptTemplate {
  protected config: PromptTemplateConfig;

  constructor(config: PromptTemplateConfig) {
    this.config = config;
  }

  /**
   * 生成提示
   */
  generatePrompt(data: any, options?: PromptOptions): string {
    // 准备变量
    const variables = this.prepareVariables(data, options);

    // 生成用户提示
    let userPrompt = this.config.userPromptTemplate;

    // 替换变量
    for (const [key, value] of Object.entries(variables)) {
      const placeholder = `{{${key}}}`;
      userPrompt = userPrompt.replace(new RegExp(placeholder, 'g'), String(value));
    }

    // 清理未替换的变量
    userPrompt = userPrompt.replace(/\{\{[\w]+\}\}/g, '');

    return userPrompt;
  }

  /**
   * 准备变量
   */
  protected prepareVariables(data: any, options?: PromptOptions): Record<string, any> {
    const variables: Record<string, any> = {
      date: new Date().toLocaleDateString('zh-CN'),
      language: options?.language || 'zh',
      ...data
    };

    // 添加选项变量
    if (options) {
      if (options.maxTokens) {
        variables.maxTokens = options.maxTokens;
      }
      if (options.temperature) {
        variables.temperature = options.temperature;
      }
    }

    return variables;
  }

  /**
   * 获取模板信息
   */
  getTemplateInfo(): TemplateInfo {
    return {
      id: this.config.id,
      name: this.config.name,
      description: this.config.description,
      version: this.config.version,
      estimatedTokens: this.config.estimatedTokens,
      variables: this.config.variables
    };
  }

  /**
   * 获取系统提示
   */
  getSystemPrompt(options?: PromptOptions): string {
    let systemPrompt = this.config.systemPrompt;

    // 替换语言变量
    if (options?.language) {
      systemPrompt = systemPrompt.replace('{{language}}', options.language);
    }

    return systemPrompt;
  }

  /**
   * 估算token数量
   */
  estimateTokens(data: any, options?: PromptOptions): number {
    const prompt = this.generatePrompt(data, options);
    const systemPrompt = this.getSystemPrompt(options);

    // 简单估算：每个中文字符约1.5个token，每个英文字符约0.25个token
    const chineseChars = (prompt + systemPrompt).match(/[\u4e00-\u9fa5]/g)?.length || 0;
    const englishChars = (prompt + systemPrompt).match(/[a-zA-Z]/g)?.length || 0;
    const otherChars = (prompt + systemPrompt).length - chineseChars - englishChars;

    return Math.ceil(chineseChars * 1.5 + englishChars * 0.25 + otherChars * 0.5);
  }
}

/**
 * 每日总结提示模板
 */
export class DailySummaryPromptTemplate extends BasePromptTemplate {
  constructor() {
    super({
      id: 'daily-summary-zh',
      name: '每日新闻总结模板（中文）',
      description: '生成每日新闻总结，包括国内热点、国际热点和投资相关热点',
      version: '1.0.0',
      systemPrompt: `你是一个专业的新闻总结助手。请根据提供的新闻数据，生成一份结构清晰、内容准确的每日新闻总结。

要求：
1. 使用{{language}}语言生成总结
2. 总结应包括以下部分：国内热点、国际热点、投资相关热点
3. 每个部分列出3-5个最重要的热点
4. 每个热点应包含简要描述和重要性说明
5. 最后提供整体趋势分析和明日关注点
6. 保持专业、客观的语气
7. 总长度控制在800-1200字之间

请确保总结：
- 准确反映新闻数据中的关键信息
- 突出重点，避免冗长
- 提供有价值的洞察和分析
- 格式清晰，易于阅读`,
      userPromptTemplate: `请根据以下新闻数据生成今日（{{date}}）的新闻总结：

## 新闻数据概览
- 总新闻数量：{{totalNewsCount}} 条
- 国内新闻：{{domesticNewsCount}} 条
- 国际新闻：{{internationalNewsCount}} 条
- 投资相关新闻：{{investmentNewsCount}} 条

## 国内热点新闻
{{domesticNews}}

## 国际热点新闻
{{internationalNews}}

## 投资相关新闻
{{investmentNews}}

## 其他数据
{{otherData}}

请按照上述要求生成总结。`,
      variables: [
        'date',
        'totalNewsCount',
        'domesticNewsCount',
        'internationalNewsCount',
        'investmentNewsCount',
        'domesticNews',
        'internationalNews',
        'investmentNews',
        'otherData'
      ],
      estimatedTokens: 1500
    });
  }

  protected prepareVariables(data: any, options?: PromptOptions): Record<string, any> {
    const baseVariables = super.prepareVariables(data, options);

    // 处理新闻数据
    if (data.newsData) {
      baseVariables.domesticNews = this.formatNewsData(data.newsData.domestic || []);
      baseVariables.internationalNews = this.formatNewsData(data.newsData.international || []);
      baseVariables.investmentNews = this.formatNewsData(data.newsData.investment || []);
      baseVariables.otherData = this.formatOtherData(data.newsData.other || []);
    }

    // 计算数量
    baseVariables.totalNewsCount = this.calculateTotalNews(data.newsData);
    baseVariables.domesticNewsCount = data.newsData?.domestic?.length || 0;
    baseVariables.internationalNewsCount = data.newsData?.international?.length || 0;
    baseVariables.investmentNewsCount = data.newsData?.investment?.length || 0;

    return baseVariables;
  }

  private formatNewsData(newsItems: any[]): string {
    if (!newsItems || newsItems.length === 0) {
      return '今日该类别没有重要新闻。';
    }

    return newsItems
      .slice(0, 10) // 限制数量
      .map((item, index) => {
        return `${index + 1}. **${item.title || '无标题'}**
   - 来源：${item.platform || '未知'}
   - 时间：${item.publishTime || '未知'}
   - 内容：${item.content?.substring(0, 100) || '无内容'}...
   - 热度：${item.engagement || '未知'}`;
      })
      .join('\n\n');
  }

  private formatOtherData(otherItems: any[]): string {
    if (!otherItems || otherItems.length === 0) {
      return '无其他重要数据。';
    }

    const categories = otherItems.reduce((acc, item) => {
      const category = item.category || '其他';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(item);
      return acc;
    }, {} as Record<string, any[]>);

    return Object.entries(categories)
      .map(([category, items]) => {
        return `### ${category}
${items.slice(0, 3).map(item => `- ${item.title || '无标题'}`).join('\n')}`;
      })
      .join('\n\n');
  }

  private calculateTotalNews(newsData: any): number {
    if (!newsData) return 0;

    return (
      (newsData.domestic?.length || 0) +
      (newsData.international?.length || 0) +
      (newsData.investment?.length || 0) +
      (newsData.other?.length || 0)
    );
  }
}

/**
 * 投资焦点总结提示模板
 */
export class InvestmentSummaryPromptTemplate extends BasePromptTemplate {
  constructor() {
    super({
      id: 'investment-summary-zh',
      name: '投资焦点总结模板（中文）',
      description: '生成投资相关新闻总结，包括股票、加密货币、大宗商品等',
      version: '1.0.0',
      systemPrompt: `你是一个专业的投资分析助手。请根据提供的投资相关新闻数据，生成一份专业的投资焦点总结。

要求：
1. 使用{{language}}语言生成总结
2. 总结应包括以下部分：市场概览、热点板块、投资机会、风险提示
3. 分析市场趋势和关键影响因素
4. 提供具体的投资建议和策略
5. 保持客观、理性的分析态度
6. 总长度控制在600-1000字之间

请确保总结：
- 准确反映市场动态和投资机会
- 基于数据提供有依据的分析
- 识别潜在风险和机会
- 提供可操作的投资建议`,
      userPromptTemplate: `请根据以下投资相关新闻数据生成今日（{{date}}）的投资焦点总结：

## 市场数据概览
- 股票市场新闻：{{stockNewsCount}} 条
- 加密货币新闻：{{cryptoNewsCount}} 条
- 大宗商品新闻：{{commodityNewsCount}} 条
- 宏观经济新闻：{{macroNewsCount}} 条

## 股票市场新闻
{{stockNews}}

## 加密货币新闻
{{cryptoNews}}

## 大宗商品新闻
{{commodityNews}}

## 宏观经济新闻
{{macroNews}}

## 市场指标
{{marketIndicators}}

请按照上述要求生成投资焦点总结。`,
      variables: [
        'date',
        'stockNewsCount',
        'cryptoNewsCount',
        'commodityNewsCount',
        'macroNewsCount',
        'stockNews',
        'cryptoNews',
        'commodityNews',
        'macroNews',
        'marketIndicators'
      ],
      estimatedTokens: 1200
    });
  }

  protected prepareVariables(data: any, options?: PromptOptions): Record<string, any> {
    const baseVariables = super.prepareVariables(data, options);

    // 处理投资数据
    if (data.investmentData) {
      baseVariables.stockNews = this.formatInvestmentData(data.investmentData.stock || [], '股票');
      baseVariables.cryptoNews = this.formatInvestmentData(data.investmentData.crypto || [], '加密货币');
      baseVariables.commodityNews = this.formatInvestmentData(data.investmentData.commodity || [], '大宗商品');
      baseVariables.macroNews = this.formatInvestmentData(data.investmentData.macro || [], '宏观经济');
      baseVariables.marketIndicators = this.formatMarketIndicators(data.marketIndicators);
    }

    // 计算数量
    baseVariables.stockNewsCount = data.investmentData?.stock?.length || 0;
    baseVariables.cryptoNewsCount = data.investmentData?.crypto?.length || 0;
    baseVariables.commodityNewsCount = data.investmentData?.commodity?.length || 0;
    baseVariables.macroNewsCount = data.investmentData?.macro?.length || 0;

    return baseVariables;
  }

  private formatInvestmentData(items: any[], category: string): string {
    if (!items || items.length === 0) {
      return `今日${category}市场没有重要新闻。`;
    }

    return items
      .slice(0, 8) // 限制数量
      .map((item, index) => {
        return `${index + 1}. **${item.title || '无标题'}**
   - 相关资产：${item.assets?.join(', ') || '未知'}
   - 影响程度：${item.impact || '中等'}
   - 关键信息：${item.keyPoints?.join('; ') || '无'}
   - 市场反应：${item.marketReaction || '未知'}`;
      })
      .join('\n\n');
  }

  private formatMarketIndicators(indicators: any): string {
    if (!indicators) {
      return '今日市场指标数据暂不可用。';
    }

    const lines: string[] = [];

    if (indicators.stockIndices) {
      lines.push('### 主要股指');
      Object.entries(indicators.stockIndices).forEach(([index, value]: [string, any]) => {
        lines.push(`- ${index}: ${value.price} (${value.change > 0 ? '+' : ''}${value.change}%)`);
      });
    }

    if (indicators.cryptoPrices) {
      lines.push('\n### 加密货币');
      Object.entries(indicators.cryptoPrices).forEach(([crypto, value]: [string, any]) => {
        lines.push(`- ${crypto}: $${value.price} (${value.change > 0 ? '+' : ''}${value.change}%)`);
      });
    }

    if (indicators.commodityPrices) {
      lines.push('\n### 大宗商品');
      Object.entries(indicators.commodityPrices).forEach(([commodity, value]: [string, any]) => {
        lines.push(`- ${commodity}: $${value.price} (${value.change > 0 ? '+' : ''}${value.change}%)`);
      });
    }

    return lines.join('\n');
  }
}

/**
 * 简要总结提示模板
 */
export class BriefSummaryPromptTemplate extends BasePromptTemplate {
  constructor() {
    super({
      id: 'brief-summary-zh',
      name: '简要总结模板（中文）',
      description: '生成简要新闻总结，适合快速浏览',
      version: '1.0.0',
      systemPrompt: `你是一个高效的新闻总结助手。请根据提供的新闻数据，生成一份简洁明了的简要新闻总结。

要求：
1. 使用{{language}}语言生成总结
2. 总结应非常简洁，突出重点
3. 使用要点列表形式
4. 每个要点不超过一句话
5. 总长度控制在300-500字之间
6. 直接了当，避免修饰性语言

请确保总结：
- 只包含最重要的信息
- 易于快速阅读和理解
- 准确反映关键新闻
- 格式简洁清晰`,
      userPromptTemplate: `请根据以下新闻数据生成今日（{{date}}）的简要新闻总结：

## 关键新闻数据
- 总新闻数：{{totalNewsCount}}
- 最重要新闻：{{topNewsCount}} 条

## 最重要新闻
{{topNews}}

请生成一份非常简洁的要点式总结。`,
      variables: [
        'date',
        'totalNewsCount',
        'topNewsCount',
        'topNews'
      ],
      estimatedTokens: 800
    });
  }

  protected prepareVariables(data: any, options?: PromptOptions): Record<string, any> {
    const baseVariables = super.prepareVariables(data, options);

    // 提取最重要的新闻
    if (data.newsData) {
      const allNews = [
        ...(data.newsData.domestic || []),
        ...(data.newsData.international || []),
        ...(data.newsData.investment || []),
        ...(data.newsData.other || [])
      ];

      // 按热度排序
      const sortedNews = allNews.sort((a, b) => {
        const aEngagement = this.calculateEngagement(a);
        const bEngagement = this.calculateEngagement(b);
        return bEngagement - aEngagement;
      });

      baseVariables.topNews = this.formatBriefNews(sortedNews.slice(0, 10));
      baseVariables.topNewsCount = Math.min(10, sortedNews.length);
      baseVariables.totalNewsCount = allNews.length;
    }

    return baseVariables;
  }

  private calculateEngagement(newsItem: any): number {
    // 简单的热度计算
    let engagement = 0;

    if (newsItem.engagement) {
      if (typeof newsItem.engagement === 'number') {
        engagement = newsItem.engagement;
      } else if (typeof newsItem.engagement === 'object') {
        engagement = (newsItem.engagement.likes || 0) +
                    (newsItem.engagement.shares || 0) * 2 +
                    (newsItem.engagement.comments || 0) * 1.5;
      }
    }

    return engagement;
  }

  private formatBriefNews(newsItems: any[]): string {
    if (!newsItems || newsItems.length === 0) {
      return '今日没有重要新闻。';
    }

    return newsItems
      .map((item, index) => {
        const platform = item.platform ? `[${item.platform}] ` : '';
        const title = item.title || '无标题';
        const brief = item.content?.substring(0, 50) || '';

        return `${index + 1}. ${platform}${title} - ${brief}...`;
      })
      .join('\n');
  }
}

/**
 * 提示模板工厂
 */
export class PromptTemplateFactory {
  private static templates: Map<string, PromptTemplate> = new Map();

  static {
    // 注册默认模板
    this.registerTemplate(new DailySummaryPromptTemplate());
    this.registerTemplate(new InvestmentSummaryPromptTemplate());
    this.registerTemplate(new BriefSummaryPromptTemplate());
  }

  /**
   * 注册模板
   */
  static registerTemplate(template: PromptTemplate): void {
    const info = template.getTemplateInfo();
    this.templates.set(info.id, template);
  }

  /**
   * 获取模板
   */
  static getTemplate(id: string): PromptTemplate | null {
    return this.templates.get(id) || null;
  }

  /**
   * 根据类型获取模板
   */
  static getTemplateByType(type: SummaryType, language: SummaryLanguage = SummaryLanguage.ZH): PromptTemplate | null {
    const templateId = this.getTemplateId(type, language);
    return this.getTemplate(templateId);
  }

  /**
   * 获取模板ID
   */
  private static getTemplateId(type: SummaryType, language: SummaryLanguage): string {
    const languageSuffix = language === SummaryLanguage.ZH ? 'zh' : 'en';

    switch (type) {
      case SummaryType.DAILY:
        return `daily-summary-${languageSuffix}`;
      case SummaryType.INVESTMENT:
        return `investment-summary-${languageSuffix}`;
      case SummaryType.BRIEF:
        return `brief-summary-${languageSuffix}`;
      default:
        return `custom-${type}-${languageSuffix}`;
    }
  }

  /**
   * 获取所有模板信息
   */
  static getAllTemplateInfo(): TemplateInfo[] {
    return Array.from(this.templates.values()).map(template =>
      template.getTemplateInfo()
    );
  }

  /**
   * 创建自定义模板
   */
  static createCustomTemplate(config: PromptTemplateConfig): PromptTemplate {
    const template = new BasePromptTemplate(config);
    this.registerTemplate(template);
    return template;
  }

  /**
   * 删除模板
   */
  static deleteTemplate(id: string): boolean {
    return this.templates.delete(id);
  }

  /**
   * 清空所有模板
   */
  static clearAll(): void {
    this.templates.clear();
  }
}

// 导出工厂函数
export function getPromptTemplate(id: string): PromptTemplate | null {
  return PromptTemplateFactory.getTemplate(id);
}

export function getPromptTemplateByType(type: SummaryType, language: SummaryLanguage = SummaryLanguage.ZH): PromptTemplate | null {
  return PromptTemplateFactory.getTemplateByType(type, language);
}

export function getAllPromptTemplates(): TemplateInfo[] {
  return PromptTemplateFactory.getAllTemplateInfo();
}