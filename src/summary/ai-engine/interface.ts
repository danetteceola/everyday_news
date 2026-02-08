/**
 * AI总结引擎接口定义
 */

import {
  GenerateRequest,
  GenerateResponse,
  LLMConfig,
  SummaryType,
  SummaryLanguage
} from '../types';

/**
 * AI总结引擎接口
 */
export interface AISummaryEngine {
  /**
   * 生成总结
   */
  generateSummary(request: GenerateRequest): Promise<GenerateResponse>;

  /**
   * 测试连接
   */
  testConnection(): Promise<boolean>;

  /**
   * 获取引擎信息
   */
  getEngineInfo(): EngineInfo;

  /**
   * 更新配置
   */
  updateConfig(config: Partial<LLMConfig>): void;

  /**
   * 获取当前配置
   */
  getConfig(): LLMConfig;

  /**
   * 获取使用统计
   */
  getUsageStats(): UsageStats;
}

/**
 * 引擎信息
 */
export interface EngineInfo {
  name: string;
  version: string;
  provider: string;
  supportedModels: string[];
  capabilities: EngineCapability[];
}

/**
 * 引擎能力
 */
export interface EngineCapability {
  type: SummaryType;
  languages: SummaryLanguage[];
  maxTokens: number;
  supportsStreaming: boolean;
}

/**
 * 使用统计
 */
export interface UsageStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalTokens: number;
  totalCost: number;
  averageResponseTime: number;
  lastRequestTime?: Date;
}

/**
 * 提示模板接口
 */
export interface PromptTemplate {
  /**
   * 生成提示
   */
  generatePrompt(data: any, options?: PromptOptions): string;

  /**
   * 获取模板信息
   */
  getTemplateInfo(): TemplateInfo;
}

/**
 * 提示选项
 */
export interface PromptOptions {
  language?: SummaryLanguage;
  maxTokens?: number;
  includeExamples?: boolean;
  temperature?: number;
  systemPrompt?: string;
}

/**
 * 模板信息
 */
export interface TemplateInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  estimatedTokens: number;
  variables: string[];
}

/**
 * LLM客户端接口
 */
export interface LLMClient {
  /**
   * 发送聊天完成请求
   */
  chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse>;

  /**
   * 测试连接
   */
  testConnection(): Promise<boolean>;

  /**
   * 获取客户端信息
   */
  getClientInfo(): ClientInfo;
}

/**
 * 聊天完成请求
 */
export interface ChatCompletionRequest {
  messages: ChatMessage[];
  model: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
  tools?: ToolDefinition[];
  toolChoice?: ToolChoice;
}

/**
 * 聊天消息
 */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

/**
 * 工具定义
 */
export interface ToolDefinition {
  type: 'function';
  function: FunctionDefinition;
}

/**
 * 函数定义
 */
export interface FunctionDefinition {
  name: string;
  description: string;
  parameters: any; // JSON Schema
}

/**
 * 工具选择
 */
export type ToolChoice = 'auto' | 'none' | { type: 'function'; function: { name: string } };

/**
 * 聊天完成响应
 */
export interface ChatCompletionResponse {
  id: string;
  model: string;
  choices: ChatChoice[];
  usage: TokenUsage;
  created: number;
}

/**
 * 聊天选择
 */
export interface ChatChoice {
  index: number;
  message: ChatMessage;
  finishReason: string;
}

/**
 * Token使用情况
 */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/**
 * 客户端信息
 */
export interface ClientInfo {
  provider: string;
  supportedModels: string[];
  rateLimit?: RateLimitInfo;
  features: string[];
}

/**
 * 速率限制信息
 */
export interface RateLimitInfo {
  requestsPerMinute: number;
  tokensPerMinute: number;
}

/**
 * 错误类型
 */
export enum AIEngineErrorType {
  API_ERROR = 'api_error',
  AUTHENTICATION_ERROR = 'authentication_error',
  RATE_LIMIT_ERROR = 'rate_limit_error',
  NETWORK_ERROR = 'network_error',
  VALIDATION_ERROR = 'validation_error',
  PARSING_ERROR = 'parsing_error',
  UNKNOWN_ERROR = 'unknown_error'
}

/**
 * AI引擎错误
 */
export class AIEngineError extends Error {
  constructor(
    message: string,
    public type: AIEngineErrorType,
    public code?: string,
    public retryable: boolean = false,
    public originalError?: any
  ) {
    super(message);
    this.name = 'AIEngineError';
  }

  /**
   * 创建API错误
   */
  static apiError(message: string, code?: string, originalError?: any): AIEngineError {
    return new AIEngineError(
      message,
      AIEngineErrorType.API_ERROR,
      code,
      true,
      originalError
    );
  }

  /**
   * 创建认证错误
   */
  static authenticationError(message: string, code?: string): AIEngineError {
    return new AIEngineError(
      message,
      AIEngineErrorType.AUTHENTICATION_ERROR,
      code,
      false
    );
  }

  /**
   * 创建速率限制错误
   */
  static rateLimitError(message: string, retryAfter?: number): AIEngineError {
    const error = new AIEngineError(
      message,
      AIEngineErrorType.RATE_LIMIT_ERROR,
      undefined,
      true
    );
    if (retryAfter) {
      (error as any).retryAfter = retryAfter;
    }
    return error;
  }

  /**
   * 创建网络错误
   */
  static networkError(message: string, originalError?: any): AIEngineError {
    return new AIEngineError(
      message,
      AIEngineErrorType.NETWORK_ERROR,
      undefined,
      true,
      originalError
    );
  }

  /**
   * 创建验证错误
   */
  static validationError(message: string): AIEngineError {
    return new AIEngineError(
      message,
      AIEngineErrorType.VALIDATION_ERROR,
      undefined,
      false
    );
  }

  /**
   * 创建解析错误
   */
  static parsingError(message: string, originalError?: any): AIEngineError {
    return new AIEngineError(
      message,
      AIEngineErrorType.PARSING_ERROR,
      undefined,
      false,
      originalError
    );
  }
}

/**
 * 重试策略
 */
export interface RetryStrategy {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableErrors: AIEngineErrorType[];
}

/**
 * 默认重试策略
 */
export const DEFAULT_RETRY_STRATEGY: RetryStrategy = {
  maxRetries: 3,
  baseDelay: 1000, // 1秒
  maxDelay: 10000, // 10秒
  retryableErrors: [
    AIEngineErrorType.API_ERROR,
    AIEngineErrorType.RATE_LIMIT_ERROR,
    AIEngineErrorType.NETWORK_ERROR
  ]
};

/**
 * 成本计算器接口
 */
export interface CostCalculator {
  /**
   * 计算请求成本
   */
  calculateCost(request: ChatCompletionRequest, response: ChatCompletionResponse): number;

  /**
   * 估算成本
   */
  estimateCost(request: ChatCompletionRequest): number;

  /**
   * 获取提供商定价
   */
  getPricingInfo(): PricingInfo;
}

/**
 * 定价信息
 */
export interface PricingInfo {
  provider: string;
  models: ModelPricing[];
  updatedAt: Date;
}

/**
 * 模型定价
 */
export interface ModelPricing {
  model: string;
  inputPricePer1K: number; // 每1000个输入token的价格
  outputPricePer1K: number; // 每1000个输出token的价格
  currency: string;
}

/**
 * 缓存接口
 */
export interface SummaryCache {
  /**
   * 获取缓存
   */
  get(key: string): Promise<CachedSummary | null>;

  /**
   * 设置缓存
   */
  set(key: string, summary: CachedSummary, ttl?: number): Promise<void>;

  /**
   * 删除缓存
   */
  delete(key: string): Promise<void>;

  /**
   * 清空缓存
   */
  clear(): Promise<void>;

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats;
}

/**
 * 缓存的总结
 */
export interface CachedSummary {
  summary: any;
  metadata: {
    generatedAt: Date;
    model: string;
    tokenUsage: number;
    cost: number;
    hash: string;
  };
}

/**
 * 缓存统计
 */
export interface CacheStats {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  memoryUsage: number;
}

/**
 * 数据哈希器接口
 */
export interface DataHasher {
  /**
   * 计算数据哈希
   */
  hash(data: any): string;

  /**
   * 比较数据相似度
   */
  similarity(hash1: string, hash2: string): number;
}