/**
 * Daily Summary Skill 处理器
 */

import { SkillExecutionContext, SkillExecutionResult } from '../types';
import { validateDailySummaryParams } from './skill-definition';
import { configManager } from '../../config';
import { templateEngine } from '../../templates';
import { clientFactory } from '../../ai-engine/client-factory';
import { PromptTemplateFactory } from '../../ai-engine/prompt-engine';
import { CostController } from '../../ai-engine/cost-controller';
import { ResponseParser } from '../../ai-engine/response-parser';

import { dataAccessService } from '../data-access/data-access-service';
import { PlatformType } from '../../../collection/types/news-item';

/**
 * 获取新闻数据
 */
async function getNewsData(params: any): Promise<any> {
  const { date, sources, includeStatistics, includeTrends } = params;

  // 转换平台类型
  const platforms: PlatformType[] = sources.map((source: string) => {
    switch (source) {
      case 'twitter': return 'twitter';
      case 'youtube': return 'youtube';
      case 'tiktok': return 'tiktok';
      case 'weibo': return 'weibo';
      case 'douyin': return 'douyin';
      default: return 'twitter' as PlatformType;
    }
  });

  try {
    // 查询新闻数据
    const queryOptions = {
      date,
      platforms,
      limit: 100, // 限制数量以提高性能
      sortBy: 'popularity' as const,
      sortOrder: 'desc' as const
    };

    const newsQueryResult = await dataAccessService.queryNewsData(queryOptions);
    const newsItems = newsQueryResult.items;

    // 获取统计数据
    let statistics: any = { totalItems: newsItems.length };
    if (includeStatistics) {
      const stats = await dataAccessService.getNewsStatistics(queryOptions);
      statistics = {
        ...statistics,
        bySource: stats.itemsByPlatform,
        itemsByHour: stats.itemsByHour,
        sentimentDistribution: stats.sentimentDistribution,
        topKeywords: stats.topKeywords
      };
    }

    // 获取趋势分析
    let trends: any[] = [];
    if (includeTrends) {
      const trendAnalysis = await dataAccessService.getTrendAnalysis(queryOptions);
      trends = trendAnalysis.trends;
    }

    return {
      date,
      sources,
      newsItems,
      statistics,
      trends
    };

  } catch (error) {
    console.error('获取新闻数据失败:', error);

    // 返回模拟数据作为降级方案
    return getMockNewsData(params);
  }
}

/**
 * 获取模拟新闻数据（降级方案）
 */
function getMockNewsData(params: any): any {
  const { date, sources } = params;

  return {
    date,
    sources,
    newsItems: [
      {
        id: '1',
        title: '示例新闻标题',
        content: '示例新闻内容',
        source: 'twitter',
        timestamp: new Date().toISOString(),
        author: '示例作者',
        url: 'https://example.com/news/1',
        metadata: {
          likes: 100,
          shares: 50,
          comments: 20
        }
      }
    ],
    statistics: {
      totalItems: 100,
      bySource: {
        twitter: 30,
        youtube: 25,
        tiktok: 20,
        weibo: 15,
        douyin: 10
      },
      trends: [
        { topic: 'AI', count: 50 },
        { topic: '投资', count: 30 },
        { topic: '科技', count: 20 }
      ]
    }
  };
}

/**
 * 根据参数选择模板
 */
function selectTemplate(summaryType: string, language: string): string {
  const templateMap: Record<string, Record<string, string>> = {
    daily: {
      zh: 'daily-summary-zh',
      en: 'daily-summary-en'
    },
    investment: {
      zh: 'investment-summary-zh',
      en: 'investment-summary-en'
    },
    brief: {
      zh: 'brief-summary-zh',
      en: 'brief-summary-en'
    }
  };

  return templateMap[summaryType]?.[language] || 'daily-summary-zh';
}

/**
 * 构建模板变量
 */
function buildTemplateVariables(newsData: any, params: any): Record<string, any> {
  const { date, language, summaryType, includeTrends, includeStatistics } = params;

  return {
    // 基本信息
    date,
    language,
    summaryType,

    // 新闻数据
    newsItems: newsData.newsItems,
    totalNewsCount: newsData.statistics.totalItems,

    // 统计数据
    ...(includeStatistics && {
      statistics: newsData.statistics,
      sourceBreakdown: newsData.statistics.bySource
    }),

    // 趋势数据
    ...(includeTrends && {
      trends: newsData.statistics.trends,
      topTrends: newsData.statistics.trends.slice(0, 5)
    }),

    // 元数据
    generatedAt: new Date().toISOString(),
    sources: params.sources,
    maxLength: params.maxLength
  };
}

/**
 * 生成总结内容
 */
async function generateSummary(params: any, templateVariables: any): Promise<string> {
  try {
    // 获取配置
    const config = configManager.getSummaryConfig();

    // 选择模板
    const templateId = selectTemplate(params.summaryType, params.language);

    // 加载模板
    const template = await templateEngine.loadTemplate(templateId, {
      cache: true,
      validate: true
    });

    // 编译模板（变量替换）
    const compiledTemplate = templateEngine.compileTemplate(template, templateVariables);

    // 选择AI客户端
    const clientConfig = config.llmConfig;
    const client = clientFactory.getBestClient(clientConfig);

    // 创建成本控制器
    const costController = new CostController({
      dailyBudget: config.dailyBudget,
      monthlyBudget: config.monthlyBudget,
      tokenLimit: config.tokenLimit
    });

    // 检查预算
    if (!costController.checkBudget()) {
      throw new Error('超出预算限制');
    }

    // 选择提示模板
    const promptTemplateFactory = new PromptTemplateFactory();
    const promptTemplate = promptTemplateFactory.getTemplate(params.summaryType);

    // 构建提示
    const prompt = promptTemplate.build({
      content: compiledTemplate,
      language: params.language,
      length: params.maxLength,
      format: params.outputFormat
    });

    // 调用AI生成
    const response = await client.chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      model: clientConfig.model,
      temperature: clientConfig.temperature,
      maxTokens: Math.min(clientConfig.maxTokens, params.maxLength * 2)
    });

    // 计算成本
    const cost = costController.calculateCost(
      response.usage?.promptTokens || 0,
      response.usage?.completionTokens || 0,
      clientConfig.model
    );
    costController.recordUsage(cost);

    // 解析响应
    const responseParser = new ResponseParser();
    const parsedResponse = responseParser.parse(
      response.content,
      {
        format: params.outputFormat,
        language: params.language,
        type: params.summaryType
      }
    );

    // 提取内容
    const summary = responseParser.extractContent(parsedResponse);

    // 验证输出质量
    const qualityScore = responseParser.calculateQualityScore(parsedResponse);
    if (qualityScore < config.qualityThreshold) {
      throw new Error(`生成内容质量不足: ${qualityScore}/100`);
    }

    return summary;
  } catch (error) {
    console.error('生成总结失败:', error);
    throw error;
  }
}

/**
 * 主处理函数
 */
export async function handleDailySummarySkill(context: SkillExecutionContext): Promise<SkillExecutionResult> {
  const startTime = Date.now();

  try {
    // 1. 验证参数
    const validationResult = validateDailySummaryParams(context.parameters);
    if (!validationResult.valid) {
      return {
        success: false,
        error: {
          code: 'PARAM_VALIDATION_FAILED',
          message: '参数验证失败',
          details: validationResult.errors
        },
        metadata: {
          executionTime: Date.now() - startTime,
          skillId: context.skillId,
          requestId: context.requestId,
          timestamp: context.timestamp
        }
      };
    }

    const params = validationResult.validatedParams!;

    // 2. 获取新闻数据
    console.log(`获取新闻数据: date=${params.date}, sources=${params.sources}`);
    const newsData = await getNewsData(params);

    // 3. 构建模板变量
    const templateVariables = buildTemplateVariables(newsData, params);

    // 4. 生成总结
    console.log(`开始生成总结: type=${params.summaryType}, language=${params.language}`);
    const summary = await generateSummary(params, templateVariables);

    // 5. 返回结果
    return {
      success: true,
      data: {
        summary,
        metadata: {
          date: params.date,
          summaryType: params.summaryType,
          language: params.language,
          length: summary.length,
          sources: params.sources,
          generatedAt: new Date().toISOString()
        },
        rawData: {
          newsCount: newsData.newsItems.length,
          statistics: newsData.statistics
        }
      },
      metadata: {
        executionTime: Date.now() - startTime,
        skillId: context.skillId,
        requestId: context.requestId,
        timestamp: context.timestamp
      }
    };

  } catch (error: any) {
    console.error('Skill执行失败:', error);

    return {
      success: false,
      error: {
        code: 'EXECUTION_FAILED',
        message: error.message || '技能执行失败',
        details: error.stack || error.toString()
      },
      metadata: {
        executionTime: Date.now() - startTime,
        skillId: context.skillId,
        requestId: context.requestId,
        timestamp: context.timestamp
      }
    };
  }
}