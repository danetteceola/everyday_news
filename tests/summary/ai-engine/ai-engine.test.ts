/**
 * AI总结引擎单元测试
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ClaudeClient } from '../../../src/summary/ai-engine/clients/claude-client';
import { DeepSeekClient } from '../../../src/summary/ai-engine/clients/deepseek-client';
import { OpenRouterClient } from '../../../src/summary/ai-engine/clients/openrouter-client';
import { ClientFactory } from '../../../src/summary/ai-engine/client-factory';
import { DailySummaryPromptTemplate, InvestmentSummaryPromptTemplate, BriefSummaryPromptTemplate } from '../../../src/summary/ai-engine/prompt-engine';
import { ErrorHandler } from '../../../src/summary/ai-engine/error-handler';
import { CostController } from '../../../src/summary/ai-engine/cost-controller';
import { ResponseParser } from '../../../src/summary/ai-engine/response-parser';
import { AIEngineError, AIEngineErrorType } from '../../../src/summary/ai-engine/interface';
import { SummaryType, SummaryLanguage } from '../../../src/summary/types';

// Mock API密钥
const MOCK_API_KEYS = {
  anthropic: 'test-claude-key',
  deepseek: 'test-deepseek-key',
  openrouter: 'test-openrouter-key'
};

describe('AI总结引擎', () => {
  describe('Claude客户端', () => {
    let client: ClaudeClient;

    beforeEach(() => {
      client = new ClaudeClient({
        apiKey: MOCK_API_KEYS.anthropic,
        model: 'claude-3-5-haiku-20241022',
        timeout: 1000
      });
    });

    it('应该正确创建Claude客户端', () => {
      expect(client).toBeInstanceOf(ClaudeClient);
      expect(client.getConfig().apiKey).toBe(MOCK_API_KEYS.anthropic);
    });

    it('应该验证配置', () => {
      const validation = ClaudeClient.validateConfig({
        apiKey: MOCK_API_KEYS.anthropic,
        model: 'claude-3-5-sonnet-20241022',
        timeout: 30000,
        maxRetries: 3,
        defaultMaxTokens: 4000,
        defaultTemperature: 0.7
      });

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('应该返回支持的模型列表', () => {
      const models = ClaudeClient.getSupportedModels();
      expect(models).toContain('claude-3-5-sonnet-20241022');
      expect(models).toContain('claude-3-5-haiku-20241022');
    });
  });

  describe('DeepSeek客户端', () => {
    let client: DeepSeekClient;

    beforeEach(() => {
      client = new DeepSeekClient({
        apiKey: MOCK_API_KEYS.deepseek,
        model: 'deepseek-chat',
        timeout: 1000
      });
    });

    it('应该正确创建DeepSeek客户端', () => {
      expect(client).toBeInstanceOf(DeepSeekClient);
      expect(client.getConfig().apiKey).toBe(MOCK_API_KEYS.deepseek);
    });

    it('应该验证配置', () => {
      const validation = DeepSeekClient.validateConfig({
        apiKey: MOCK_API_KEYS.deepseek,
        model: 'deepseek-chat',
        timeout: 30000,
        maxRetries: 3,
        defaultMaxTokens: 4000,
        defaultTemperature: 0.7
      });

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('应该返回支持的模型列表', () => {
      const models = DeepSeekClient.getSupportedModels();
      expect(models).toContain('deepseek-chat');
      expect(models).toContain('deepseek-coder');
    });

    it('应该返回定价信息', () => {
      const pricing = DeepSeekClient.getPricingInfo();
      expect(pricing).toHaveLength(2);
      expect(pricing[0].model).toBe('deepseek-chat');
      expect(pricing[0].currency).toBe('CNY');
    });
  });

  describe('OpenRouter客户端', () => {
    let client: OpenRouterClient;

    beforeEach(() => {
      client = new OpenRouterClient({
        apiKey: MOCK_API_KEYS.openrouter,
        model: 'anthropic/claude-3-5-haiku',
        timeout: 1000
      });
    });

    it('应该正确创建OpenRouter客户端', () => {
      expect(client).toBeInstanceOf(OpenRouterClient);
      expect(client.getConfig().apiKey).toBe(MOCK_API_KEYS.openrouter);
    });

    it('应该验证配置', () => {
      const validation = OpenRouterClient.validateConfig({
        apiKey: MOCK_API_KEYS.openrouter,
        model: 'anthropic/claude-3-5-sonnet',
        timeout: 30000,
        maxRetries: 3,
        defaultMaxTokens: 4000,
        defaultTemperature: 0.7
      });

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('应该返回支持的模型列表', () => {
      const models = OpenRouterClient.getSupportedModels();
      expect(models).toContain('anthropic/claude-3-5-sonnet');
      expect(models).toContain('openai/gpt-4-turbo');
      expect(models).toContain('google/gemini-pro');
    });

    it('应该返回模型信息', () => {
      const info = OpenRouterClient.getModelInfo('anthropic/claude-3-5-sonnet');
      expect(info).not.toBeNull();
      expect(info?.provider).toBe('anthropic');
      expect(info?.family).toBe('claude');
    });

    it('应该返回推荐模型', () => {
      const recommendations = OpenRouterClient.getRecommendedModels();
      expect(recommendations).toHaveLength(5);
      expect(recommendations[0].model).toBe('anthropic/claude-3-5-sonnet');
    });
  });

  describe('客户端工厂', () => {
    let factory: ClientFactory;

    beforeEach(() => {
      factory = ClientFactory.getInstance();
    });

    afterEach(() => {
      factory.clearAll();
    });

    it('应该创建单例实例', () => {
      const instance1 = ClientFactory.getInstance();
      const instance2 = ClientFactory.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('应该创建不同类型的客户端', () => {
      const anthropicClient = factory.createClient('anthropic', {
        apiKey: MOCK_API_KEYS.anthropic
      });
      const deepseekClient = factory.createClient('deepseek', {
        apiKey: MOCK_API_KEYS.deepseek
      });
      const openrouterClient = factory.createClient('openrouter', {
        apiKey: MOCK_API_KEYS.openrouter
      });

      expect(anthropicClient).toBeDefined();
      expect(deepseekClient).toBeDefined();
      expect(openrouterClient).toBeDefined();
    });

    it('应该缓存客户端', () => {
      const client1 = factory.createClient('anthropic', {
        apiKey: MOCK_API_KEYS.anthropic,
        model: 'claude-3-5-haiku-20241022'
      });

      const client2 = factory.createClient('anthropic', {
        apiKey: MOCK_API_KEYS.anthropic,
        model: 'claude-3-5-haiku-20241022'
      });

      expect(client1).toBe(client2);
    });

    it('应该获取客户端信息', () => {
      factory.createClient('anthropic', { apiKey: MOCK_API_KEYS.anthropic });
      const allInfo = factory.getAllClientInfo();

      expect(allInfo).toHaveLength(1);
      expect(allInfo[0].type).toBe('anthropic');
    });
  });

  describe('提示模板', () => {
    describe('每日总结模板', () => {
      let template: DailySummaryPromptTemplate;

      beforeEach(() => {
        template = new DailySummaryPromptTemplate();
      });

      it('应该正确创建模板', () => {
        const info = template.getTemplateInfo();
        expect(info.id).toBe('daily-summary-zh');
        expect(info.name).toBe('每日新闻总结模板（中文）');
        expect(info.variables).toContain('date');
        expect(info.variables).toContain('totalNewsCount');
      });

      it('应该生成提示', () => {
        const data = {
          newsData: {
            domestic: [
              { title: '国内新闻1', platform: '微博', content: '内容1' },
              { title: '国内新闻2', platform: '抖音', content: '内容2' }
            ],
            international: [
              { title: '国际新闻1', platform: 'Twitter', content: '内容3' }
            ],
            investment: [],
            other: []
          }
        };

        const prompt = template.generatePrompt(data);
        expect(prompt).toContain('国内热点新闻');
        expect(prompt).toContain('国际热点新闻');
        expect(prompt).toContain('投资相关新闻');
      });

      it('应该估算token数量', () => {
        const data = {
          newsData: {
            domestic: [{ title: '测试新闻', content: '测试内容' }],
            international: [],
            investment: [],
            other: []
          }
        };

        const tokens = template.estimateTokens(data);
        expect(tokens).toBeGreaterThan(0);
      });
    });

    describe('投资总结模板', () => {
      let template: InvestmentSummaryPromptTemplate;

      beforeEach(() => {
        template = new InvestmentSummaryPromptTemplate();
      });

      it('应该正确创建模板', () => {
        const info = template.getTemplateInfo();
        expect(info.id).toBe('investment-summary-zh');
        expect(info.name).toBe('投资焦点总结模板（中文）');
        expect(info.variables).toContain('stockNews');
        expect(info.variables).toContain('cryptoNews');
      });

      it('应该生成提示', () => {
        const data = {
          investmentData: {
            stock: [
              { title: '股票新闻1', assets: ['AAPL'], impact: '高' }
            ],
            crypto: [
              { title: '加密货币新闻1', assets: ['BTC'], impact: '中' }
            ],
            commodity: [],
            macro: []
          },
          marketIndicators: {
            stockIndices: {
              '上证指数': { price: 3000, change: 1.5 }
            }
          }
        };

        const prompt = template.generatePrompt(data);
        expect(prompt).toContain('股票市场新闻');
        expect(prompt).toContain('加密货币新闻');
        expect(prompt).toContain('主要股指');
      });
    });

    describe('简要总结模板', () => {
      let template: BriefSummaryPromptTemplate;

      beforeEach(() => {
        template = new BriefSummaryPromptTemplate();
      });

      it('应该正确创建模板', () => {
        const info = template.getTemplateInfo();
        expect(info.id).toBe('brief-summary-zh');
        expect(info.name).toBe('简要总结模板（中文）');
        expect(info.variables).toContain('topNews');
        expect(info.variables).toContain('totalNewsCount');
      });

      it('应该生成简要提示', () => {
        const data = {
          newsData: {
            domestic: [
              { title: '重要新闻1', platform: '微博', content: '内容1', engagement: 1000 }
            ],
            international: [],
            investment: [],
            other: []
          }
        };

        const prompt = template.generatePrompt(data);
        expect(prompt).toContain('最重要新闻');
        expect(prompt).toContain('要点式总结');
      });
    });
  });

  describe('错误处理器', () => {
    let errorHandler: ErrorHandler;

    beforeEach(() => {
      errorHandler = new ErrorHandler();
    });

    it('应该记录错误', () => {
      const error = AIEngineError.apiError('测试错误');
      errorHandler.recordError(error);

      const stats = errorHandler.getErrorStats();
      expect(stats.totalErrors).toBe(1);
      expect(stats.byType[AIEngineErrorType.API_ERROR]).toBe(1);
    });

    it('应该检查错误是否可重试', () => {
      const retryableError = AIEngineError.apiError('可重试错误');
      const nonRetryableError = AIEngineError.authenticationError('不可重试错误');

      expect(errorHandler.isRetryable(retryableError)).toBe(true);
      expect(errorHandler.isRetryable(nonRetryableError)).toBe(false);
    });

    it('应该计算重试延迟', () => {
      const delay1 = errorHandler.calculateRetryDelay(1);
      const delay2 = errorHandler.calculateRetryDelay(2);
      const delay3 = errorHandler.calculateRetryDelay(3);

      expect(delay1).toBeGreaterThan(0);
      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
    });

    it('应该提供错误建议', () => {
      const error = AIEngineError.rateLimitError('速率限制错误');
      const suggestions = errorHandler.getErrorSuggestions(error);

      expect(suggestions).toContain('降低请求频率');
      expect(suggestions).toContain('考虑升级API套餐');
    });
  });

  describe('成本控制器', () => {
    let costController: CostController;

    beforeEach(() => {
      costController = new CostController(
        {
          dailyBudget: 100,
          monthlyBudget: 3000,
          maxTokensPerRequest: 16000,
          maxCostPerRequest: 10,
          enableHardLimit: true,
          notifyOnThreshold: 80
        },
        {
          provider: 'test',
          models: [
            {
              model: 'test-model',
              inputPricePer1K: 1.0,
              outputPricePer1K: 2.0,
              currency: 'CNY'
            }
          ],
          updatedAt: new Date()
        }
      );
    });

    it('应该估算成本', () => {
      const request = {
        model: 'test-model',
        messages: [
          { role: 'user', content: '测试消息' }
        ],
        maxTokens: 1000
      };

      const cost = costController.estimateCost(request);
      expect(cost).toBeGreaterThan(0);
    });

    it('应该验证请求', () => {
      const request = {
        model: 'test-model',
        messages: [
          { role: 'user', content: '短消息' }
        ],
        maxTokens: 1000
      };

      const validation = costController.validateRequest(request);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('应该检测超出预算', () => {
      // 模拟大量使用
      for (let i = 0; i < 100; i++) {
        const request = {
          model: 'test-model',
          messages: [{ role: 'user', content: '测试' }],
          maxTokens: 1000
        };
        const response = {
          usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
          model: 'test-model'
        };
        costController.calculateCost(request, response as any);
      }

      expect(costController.isOverBudget() || costController.isNearBudget()).toBe(true);
    });
  });

  describe('响应解析器', () => {
    let parser: ResponseParser;

    beforeEach(() => {
      parser = new ResponseParser();
    });

    it('应该解析AI响应', () => {
      const response = `每日新闻总结 - 2024年1月1日

## 国内热点
1. 国内新闻1：重要事件发生
2. 国内新闻2：另一个重要事件

## 国际热点
1. 国际新闻1：全球关注事件

## 投资相关热点
1. 投资新闻1：市场动态

## 趋势分析
市场整体向好，投资机会增多。`;

      const request = {
        type: SummaryType.DAILY,
        data: { totalNewsCount: 10 }
      };

      const result = parser.parseAIResponse(response, request);
      expect(result.isValid).toBe(true);
      expect(result.summary.title).toContain('每日新闻总结');
      expect(result.summary.content).toBe(response);
      expect(result.summary.quality).toBeDefined();
    });

    it('应该检测无效响应', () => {
      const response = '太短';
      const request = { type: SummaryType.DAILY };

      const result = parser.parseAIResponse(response, request, {
        validateStructure: true
      });

      expect(result.isValid).toBe(false);
      expect(result.warnings).toContain('总结过短');
    });

    it('应该提取元数据', () => {
      const response = `测试总结包含多个主题和关键词。
国内热点：经济发展
国际热点：外交关系
投资热点：股市上涨`;

      const request = {
        type: SummaryType.DAILY,
        model: 'test-model',
        generationTime: 1000
      };

      const result = parser.parseAIResponse(response, request, {
        extractMetadata: true
      });

      expect(result.metadata.topics.length).toBeGreaterThan(0);
      expect(result.metadata.keywords.length).toBeGreaterThan(0);
      expect(result.metadata.model).toBe('test-model');
      expect(result.metadata.generationTime).toBe(1000);
    });

    it('应该分析情感', () => {
      const positiveResponse = `好消息！经济增长，市场上涨，发展迅速。`;
      const negativeResponse = `坏消息！经济下滑，市场下跌，面临挑战。`;
      const neutralResponse = `经济平稳，市场波动，发展一般。`;

      const request = { type: SummaryType.DAILY };

      const positiveResult = parser.parseAIResponse(positiveResponse, request, {
        extractMetadata: true
      });
      const negativeResult = parser.parseAIResponse(negativeResponse, request, {
        extractMetadata: true
      });
      const neutralResult = parser.parseAIResponse(neutralResponse, request, {
        extractMetadata: true
      });

      expect(positiveResult.metadata.sentiment).toBe('positive');
      expect(negativeResult.metadata.sentiment).toBe('negative');
      expect(neutralResult.metadata.sentiment).toBe('neutral');
    });
  });
});