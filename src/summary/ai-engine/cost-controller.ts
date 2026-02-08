/**
 * Token使用限制和成本控制
 */

import {
  ChatCompletionRequest,
  ChatCompletionResponse,
  CostCalculator,
  PricingInfo,
  ModelPricing
} from './interface';

/**
 * 成本控制配置
 */
export interface CostControlConfig {
  dailyBudget: number;           // 每日预算（单位：元）
  monthlyBudget: number;         // 每月预算（单位：元）
  maxTokensPerRequest: number;   // 每个请求最大token数
  maxCostPerRequest: number;     // 每个请求最大成本（单位：元）
  enableHardLimit: boolean;      // 是否启用硬限制
  notifyOnThreshold: number;     // 达到预算百分比时通知（0-100）
}

/**
 * 使用统计
 */
export interface UsageStats {
  date: string;
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  byModel: Record<string, ModelUsage>;
  byHour: Record<string, HourlyUsage>;
}

/**
 * 模型使用情况
 */
export interface ModelUsage {
  requests: number;
  tokens: number;
  cost: number;
}

/**
 * 小时使用情况
 */
export interface HourlyUsage {
  requests: number;
  tokens: number;
  cost: number;
}

/**
 * 预算状态
 */
export interface BudgetStatus {
  daily: {
    budget: number;
    used: number;
    remaining: number;
    percentage: number;
    status: 'under' | 'near' | 'over';
  };
  monthly: {
    budget: number;
    used: number;
    remaining: number;
    percentage: number;
    status: 'under' | 'near' | 'over';
  };
}

/**
 * 成本控制器
 */
export class CostController implements CostCalculator {
  private config: CostControlConfig;
  private pricingInfo: PricingInfo;
  private usageStats: UsageStats;
  private budgetStatus: BudgetStatus;

  constructor(config: CostControlConfig, pricingInfo: PricingInfo) {
    this.config = config;
    this.pricingInfo = pricingInfo;
    this.usageStats = this.initializeUsageStats();
    this.budgetStatus = this.initializeBudgetStatus();
  }

  /**
   * 初始化使用统计
   */
  private initializeUsageStats(): UsageStats {
    const today = new Date().toISOString().split('T')[0];

    return {
      date: today,
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      byModel: {},
      byHour: {}
    };
  }

  /**
   * 初始化预算状态
   */
  private initializeBudgetStatus(): BudgetStatus {
    return {
      daily: {
        budget: this.config.dailyBudget,
        used: 0,
        remaining: this.config.dailyBudget,
        percentage: 0,
        status: 'under'
      },
      monthly: {
        budget: this.config.monthlyBudget,
        used: 0,
        remaining: this.config.monthlyBudget,
        percentage: 0,
        status: 'under'
      }
    };
  }

  /**
   * 计算请求成本
   */
  calculateCost(request: ChatCompletionRequest, response: ChatCompletionResponse): number {
    const modelPricing = this.getModelPricing(request.model);

    if (!modelPricing) {
      console.warn(`No pricing info for model: ${request.model}`);
      return 0;
    }

    const inputTokens = response.usage.promptTokens;
    const outputTokens = response.usage.completionTokens;

    const inputCost = (inputTokens / 1000) * modelPricing.inputPricePer1K;
    const outputCost = (outputTokens / 1000) * modelPricing.outputPricePer1K;

    const totalCost = inputCost + outputCost;

    // 转换为人民币（如果定价是美元）
    let finalCost = totalCost;
    if (modelPricing.currency === 'USD') {
      finalCost = totalCost * 7.2; // 假设汇率 1 USD = 7.2 CNY
    }

    // 记录使用情况
    this.recordUsage(request, response, finalCost);

    return finalCost;
  }

  /**
   * 估算成本
   */
  estimateCost(request: ChatCompletionRequest): number {
    const modelPricing = this.getModelPricing(request.model);

    if (!modelPricing) {
      console.warn(`No pricing info for model: ${request.model}`);
      return 0;
    }

    // 估算输入token数（基于消息内容）
    const estimatedInputTokens = this.estimateTokens(request.messages);
    const estimatedOutputTokens = request.maxTokens || 1000; // 默认1000个输出token

    const inputCost = (estimatedInputTokens / 1000) * modelPricing.inputPricePer1K;
    const outputCost = (estimatedOutputTokens / 1000) * modelPricing.outputPricePer1K;

    const totalCost = inputCost + outputCost;

    // 转换为人民币（如果定价是美元）
    let finalCost = totalCost;
    if (modelPricing.currency === 'USD') {
      finalCost = totalCost * 7.2;
    }

    return finalCost;
  }

  /**
   * 获取模型定价
   */
  private getModelPricing(model: string): ModelPricing | undefined {
    return this.pricingInfo.models.find(m => m.model === model);
  }

  /**
   * 估算token数量
   */
  private estimateTokens(messages: any[]): number {
    let totalTokens = 0;

    for (const message of messages) {
      if (message.content) {
        // 简单估算：每个中文字符约1.5个token，每个英文字符约0.25个token
        const text = message.content;
        const chineseChars = text.match(/[\u4e00-\u9fa5]/g)?.length || 0;
        const englishChars = text.match(/[a-zA-Z]/g)?.length || 0;
        const otherChars = text.length - chineseChars - englishChars;

        totalTokens += Math.ceil(chineseChars * 1.5 + englishChars * 0.25 + otherChars * 0.5);
      }
    }

    return totalTokens;
  }

  /**
   * 记录使用情况
   */
  private recordUsage(request: ChatCompletionRequest, response: ChatCompletionResponse, cost: number): void {
    const now = new Date();
    const hourKey = now.getHours().toString().padStart(2, '0');
    const model = request.model;

    // 更新总体统计
    this.usageStats.totalRequests++;
    this.usageStats.totalTokens += response.usage.totalTokens;
    this.usageStats.totalCost += cost;

    // 更新模型统计
    if (!this.usageStats.byModel[model]) {
      this.usageStats.byModel[model] = {
        requests: 0,
        tokens: 0,
        cost: 0
      };
    }
    this.usageStats.byModel[model].requests++;
    this.usageStats.byModel[model].tokens += response.usage.totalTokens;
    this.usageStats.byModel[model].cost += cost;

    // 更新小时统计
    if (!this.usageStats.byHour[hourKey]) {
      this.usageStats.byHour[hourKey] = {
        requests: 0,
        tokens: 0,
        cost: 0
      };
    }
    this.usageStats.byHour[hourKey].requests++;
    this.usageStats.byHour[hourKey].tokens += response.usage.totalTokens;
    this.usageStats.byHour[hourKey].cost += cost;

    // 更新预算状态
    this.updateBudgetStatus(cost);
  }

  /**
   * 更新预算状态
   */
  private updateBudgetStatus(cost: number): void {
    // 更新每日预算
    this.budgetStatus.daily.used += cost;
    this.budgetStatus.daily.remaining = Math.max(0, this.budgetStatus.daily.budget - this.budgetStatus.daily.used);
    this.budgetStatus.daily.percentage = (this.budgetStatus.daily.used / this.budgetStatus.daily.budget) * 100;

    // 更新每月预算（简化：假设每月30天）
    this.budgetStatus.monthly.used += cost;
    this.budgetStatus.monthly.remaining = Math.max(0, this.budgetStatus.monthly.budget - this.budgetStatus.monthly.used);
    this.budgetStatus.monthly.percentage = (this.budgetStatus.monthly.used / this.budgetStatus.monthly.budget) * 100;

    // 更新状态
    this.budgetStatus.daily.status = this.getBudgetStatus(this.budgetStatus.daily.percentage);
    this.budgetStatus.monthly.status = this.getBudgetStatus(this.budgetStatus.monthly.percentage);
  }

  /**
   * 获取预算状态
   */
  private getBudgetStatus(percentage: number): 'under' | 'near' | 'over' {
    if (percentage >= 100) {
      return 'over';
    } else if (percentage >= this.config.notifyOnThreshold) {
      return 'near';
    } else {
      return 'under';
    }
  }

  /**
   * 获取提供商定价
   */
  getPricingInfo(): PricingInfo {
    return { ...this.pricingInfo };
  }

  /**
   * 获取使用统计
   */
  getUsageStats(): UsageStats {
    return { ...this.usageStats };
  }

  /**
   * 获取预算状态
   */
  getBudgetStatus(): BudgetStatus {
    return { ...this.budgetStatus };
  }

  /**
   * 检查是否超出预算
   */
  isOverBudget(): boolean {
    return this.budgetStatus.daily.status === 'over' || this.budgetStatus.monthly.status === 'over';
  }

  /**
   * 检查是否接近预算
   */
  isNearBudget(): boolean {
    return this.budgetStatus.daily.status === 'near' || this.budgetStatus.monthly.status === 'near';
  }

  /**
   * 验证请求是否在限制内
   */
  validateRequest(request: ChatCompletionRequest): {
    valid: boolean;
    errors: string[];
    estimatedCost: number;
  } {
    const errors: string[] = [];
    const estimatedCost = this.estimateCost(request);

    // 检查token限制
    const estimatedTokens = this.estimateTokens(request.messages);
    const maxTokens = request.maxTokens || 1000;

    if (estimatedTokens + maxTokens > this.config.maxTokensPerRequest) {
      errors.push(`Estimated tokens (${estimatedTokens + maxTokens}) exceed maximum (${this.config.maxTokensPerRequest})`);
    }

    // 检查成本限制
    if (estimatedCost > this.config.maxCostPerRequest) {
      errors.push(`Estimated cost (${estimatedCost.toFixed(2)}) exceed maximum (${this.config.maxCostPerRequest})`);
    }

    // 检查预算限制
    if (this.isOverBudget() && this.config.enableHardLimit) {
      errors.push('Daily or monthly budget exceeded');
    }

    return {
      valid: errors.length === 0,
      errors,
      estimatedCost
    };
  }

  /**
   * 获取成本优化建议
   */
  getCostOptimizationSuggestions(): string[] {
    const suggestions: string[] = [];

    // 基于使用模式的分析
    const models = Object.entries(this.usageStats.byModel);
    if (models.length > 0) {
      const mostExpensive = models.sort((a, b) => b[1].cost - a[1].cost)[0];
      suggestions.push(`考虑为某些任务使用成本更低的模型替代 ${mostExpensive[0]}`);
    }

    // 基于时间模式的分析
    const hours = Object.entries(this.usageStats.byHour);
    if (hours.length > 0) {
      const peakHour = hours.sort((a, b) => b[1].cost - a[1].cost)[0];
      suggestions.push(`高峰使用时间: ${peakHour[0]}:00，考虑错峰使用`);
    }

    // 基于预算状态
    if (this.isNearBudget()) {
      suggestions.push(`预算使用率: ${this.budgetStatus.daily.percentage.toFixed(1)}%，接近通知阈值`);
    }

    if (this.isOverBudget()) {
      suggestions.push('预算已超，建议调整预算或优化使用模式');
    }

    // 通用建议
    suggestions.push('使用缓存减少重复请求');
    suggestions.push('优化提示工程减少token使用');
    suggestions.push('考虑使用更高效的模型');

    return suggestions;
  }

  /**
   * 重置每日统计
   */
  resetDailyStats(): void {
    const today = new Date().toISOString().split('T')[0];

    if (this.usageStats.date !== today) {
      this.usageStats = this.initializeUsageStats();
      this.budgetStatus.daily = {
        budget: this.config.dailyBudget,
        used: 0,
        remaining: this.config.dailyBudget,
        percentage: 0,
        status: 'under'
      };
    }
  }

  /**
   * 重置每月统计
   */
  resetMonthlyStats(): void {
    const now = new Date();
    const isFirstDayOfMonth = now.getDate() === 1;

    if (isFirstDayOfMonth) {
      this.budgetStatus.monthly = {
        budget: this.config.monthlyBudget,
        used: 0,
        remaining: this.config.monthlyBudget,
        percentage: 0,
        status: 'under'
      };
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<CostControlConfig>): void {
    this.config = { ...this.config, ...config };

    // 更新预算状态
    this.budgetStatus.daily.budget = this.config.dailyBudget;
    this.budgetStatus.monthly.budget = this.config.monthlyBudget;

    // 重新计算剩余预算
    this.budgetStatus.daily.remaining = Math.max(0, this.config.dailyBudget - this.budgetStatus.daily.used);
    this.budgetStatus.monthly.remaining = Math.max(0, this.config.monthlyBudget - this.budgetStatus.monthly.used);
  }

  /**
   * 更新定价信息
   */
  updatePricingInfo(pricingInfo: PricingInfo): void {
    this.pricingInfo = pricingInfo;
  }
}

/**
 * 默认定价信息（Claude, DeepSeek, OpenRouter）
 */
export const DEFAULT_PRICING_INFO: PricingInfo = {
  provider: 'mixed',
  models: [
    // Claude
    {
      model: 'claude-3-5-sonnet-20241022',
      inputPricePer1K: 3.00,
      outputPricePer1K: 15.00,
      currency: 'USD'
    },
    {
      model: 'claude-3-5-haiku-20241022',
      inputPricePer1K: 0.80,
      outputPricePer1K: 4.00,
      currency: 'USD'
    },
    // DeepSeek
    {
      model: 'deepseek-chat',
      inputPricePer1K: 0.14,
      outputPricePer1K: 0.28,
      currency: 'CNY'
    },
    // OpenRouter (Claude via OpenRouter)
    {
      model: 'anthropic/claude-3-5-sonnet',
      inputPricePer1K: 3.00,
      outputPricePer1K: 15.00,
      currency: 'USD'
    },
    // OpenRouter (GPT-4)
    {
      model: 'openai/gpt-4-turbo',
      inputPricePer1K: 10.00,
      outputPricePer1K: 30.00,
      currency: 'USD'
    },
    // OpenRouter (Gemini)
    {
      model: 'google/gemini-pro',
      inputPricePer1K: 0.50,
      outputPricePer1K: 1.50,
      currency: 'USD'
    }
  ],
  updatedAt: new Date()
};

/**
 * 默认成本控制配置
 */
export const DEFAULT_COST_CONTROL_CONFIG: CostControlConfig = {
  dailyBudget: 100,           // 每日100元
  monthlyBudget: 3000,        // 每月3000元
  maxTokensPerRequest: 16000, // 每个请求最多16000个token
  maxCostPerRequest: 10,      // 每个请求最多10元
  enableHardLimit: true,      // 启用硬限制
  notifyOnThreshold: 80       // 达到80%时通知
};

/**
 * 成本控制器工厂
 */
export class CostControllerFactory {
  private static instance: CostController;

  /**
   * 获取单例实例
   */
  public static getInstance(): CostController {
    if (!CostControllerFactory.instance) {
      CostControllerFactory.instance = new CostController(
        DEFAULT_COST_CONTROL_CONFIG,
        DEFAULT_PRICING_INFO
      );
    }
    return CostControllerFactory.instance;
  }

  /**
   * 创建自定义成本控制器
   */
  public static createController(config: CostControlConfig, pricingInfo: PricingInfo): CostController {
    return new CostController(config, pricingInfo);
  }
}

// 导出默认成本控制器
export const costController = CostControllerFactory.getInstance();

// 辅助函数：计算成本
export function calculateCost(request: ChatCompletionRequest, response: ChatCompletionResponse): number {
  return costController.calculateCost(request, response);
}

// 辅助函数：估算成本
export function estimateCost(request: ChatCompletionRequest): number {
  return costController.estimateCost(request);
}

// 辅助函数：验证请求
export function validateRequest(request: ChatCompletionRequest): {
  valid: boolean;
  errors: string[];
  estimatedCost: number;
} {
  return costController.validateRequest(request);
}

// 辅助函数：获取预算状态
export function getBudgetStatus(): BudgetStatus {
  return costController.getBudgetStatus();
}