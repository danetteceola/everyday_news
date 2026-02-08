/**
 * OpenRouter API客户端
 */

import OpenAI from 'openai';
import {
  LLMClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  ClientInfo,
  AIEngineError
} from '../interface';

/**
 * OpenRouter客户端配置
 */
export interface OpenRouterClientConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
}

/**
 * OpenRouter客户端
 */
export class OpenRouterClient implements LLMClient {
  private client: OpenAI;
  private config: OpenRouterClientConfig;
  private usageStats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
  };

  constructor(config: OpenRouterClientConfig) {
    this.config = {
      model: 'anthropic/claude-3-5-sonnet',
      baseUrl: 'https://openrouter.ai/api/v1',
      timeout: 30000,
      maxRetries: 3,
      defaultMaxTokens: 4000,
      defaultTemperature: 0.7,
      ...config
    };

    if (!this.config.apiKey) {
      throw new Error('OpenRouter API key is required');
    }

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries,
      defaultHeaders: {
        'HTTP-Referer': 'https://everyday-news.com', // OpenRouter要求
        'X-Title': 'Everyday News Summary Generator'
      }
    });

    this.usageStats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalTokens: 0
    };
  }

  /**
   * 发送聊天完成请求
   */
  async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    this.usageStats.totalRequests++;

    try {
      // 转换消息格式
      const messages = this.convertMessages(request.messages);

      // 准备请求参数
      const params: OpenAI.Chat.ChatCompletionCreateParams = {
        model: request.model || this.config.model!,
        messages,
        max_tokens: request.maxTokens || this.config.defaultMaxTokens,
        temperature: request.temperature || this.config.defaultTemperature,
        stream: request.stream || false
      };

      // 添加额外头部（OpenRouter特定）
      const extraHeaders: Record<string, string> = {
        'HTTP-Referer': 'https://everyday-news.com',
        'X-Title': 'Everyday News Summary Generator'
      };

      // 发送请求
      const response = await this.client.chat.completions.create(params, {
        headers: extraHeaders
      });

      // 更新使用统计
      this.usageStats.successfulRequests++;
      if (response.usage) {
        this.usageStats.totalTokens += response.usage.total_tokens;
      }

      // 转换响应格式
      return this.convertResponse(response);

    } catch (error: any) {
      this.usageStats.failedRequests++;
      throw this.handleError(error);
    }
  }

  /**
   * 转换消息格式
   */
  private convertMessages(messages: ChatMessage[]): OpenAI.Chat.ChatCompletionMessageParam[] {
    return messages.map(message => {
      let role: OpenAI.Chat.ChatCompletionMessageParam['role'];

      switch (message.role) {
        case 'system':
          role = 'system';
          break;
        case 'assistant':
          role = 'assistant';
          break;
        case 'user':
          role = 'user';
          break;
        case 'tool':
          role = 'tool';
          break;
        default:
          role = 'user';
      }

      return {
        role,
        content: message.content,
        name: message.name,
        tool_call_id: message.toolCallId
      };
    });
  }

  /**
   * 转换响应格式
   */
  private convertResponse(response: OpenAI.Chat.ChatCompletion): ChatCompletionResponse {
    const choices = response.choices.map(choice => ({
      index: choice.index,
      message: {
        role: choice.message.role as 'assistant',
        content: choice.message.content || ''
      },
      finishReason: choice.finish_reason || 'stop'
    }));

    return {
      id: response.id,
      model: response.model,
      choices,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0
      },
      created: response.created
    };
  }

  /**
   * 处理错误
   */
  private handleError(error: any): AIEngineError {
    if (error instanceof OpenAI.APIError) {
      // OpenAI兼容API错误
      switch (error.status) {
        case 401:
        case 403:
          return AIEngineError.authenticationError(
            'OpenRouter API authentication failed',
            error.code
          );

        case 429:
          return AIEngineError.rateLimitError(
            'OpenRouter API rate limit exceeded',
            error.headers?.['retry-after'] ? parseInt(error.headers['retry-after']) : undefined
          );

        case 500:
        case 502:
        case 503:
        case 504:
          return AIEngineError.apiError(
            `OpenRouter API server error: ${error.message}`,
            error.code,
            error
          );

        default:
          return AIEngineError.apiError(
            `OpenRouter API error: ${error.message}`,
            error.code,
            error
          );
      }
    } else if (error instanceof Error) {
      // 网络或其他错误
      if (error.message.includes('timeout') || error.message.includes('network')) {
        return AIEngineError.networkError(
          `Network error: ${error.message}`,
          error
        );
      }
    }

    // 未知错误
    return AIEngineError.apiError(
      `Unknown error: ${error?.message || 'Unknown error occurred'}`,
      undefined,
      error
    );
  }

  /**
   * 测试连接
   */
  async testConnection(): Promise<boolean> {
    try {
      // 发送一个简单的测试请求
      await this.client.chat.completions.create({
        model: this.config.model!,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });
      return true;
    } catch (error) {
      console.error('OpenRouter API connection test failed:', error);
      return false;
    }
  }

  /**
   * 获取客户端信息
   */
  getClientInfo(): ClientInfo {
    return {
      provider: 'openrouter',
      supportedModels: [
        'anthropic/claude-3-5-sonnet',
        'anthropic/claude-3-5-haiku',
        'openai/gpt-4-turbo',
        'openai/gpt-4',
        'google/gemini-pro',
        'meta-llama/llama-3-70b-instruct',
        'mistralai/mistral-large',
        'deepseek/deepseek-chat'
      ],
      rateLimit: {
        requestsPerMinute: 60, // OpenRouter API默认限制
        tokensPerMinute: 100000
      },
      features: [
        'chat_completion',
        'system_prompt',
        'temperature_control',
        'max_tokens_limit',
        'streaming',
        'function_calling',
        'multi_model_support'
      ]
    };
  }

  /**
   * 获取使用统计
   */
  getUsageStats() {
    return { ...this.usageStats };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<OpenRouterClientConfig>): void {
    this.config = { ...this.config, ...config };

    // 重新创建客户端（如果需要）
    if (config.apiKey || config.baseUrl) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries,
        defaultHeaders: {
          'HTTP-Referer': 'https://everyday-news.com',
          'X-Title': 'Everyday News Summary Generator'
        }
      });
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): OpenRouterClientConfig {
    return { ...this.config };
  }

  /**
   * 获取支持的模型列表
   */
  static getSupportedModels(): string[] {
    return [
      // Anthropic
      'anthropic/claude-3-5-sonnet',
      'anthropic/claude-3-5-haiku',
      'anthropic/claude-3-opus',
      'anthropic/claude-3-sonnet',
      'anthropic/claude-3-haiku',
      // OpenAI
      'openai/gpt-4-turbo',
      'openai/gpt-4',
      'openai/gpt-3.5-turbo',
      // Google
      'google/gemini-pro',
      'google/gemini-flash',
      // Meta
      'meta-llama/llama-3-70b-instruct',
      'meta-llama/llama-3-8b-instruct',
      // Mistral
      'mistralai/mistral-large',
      'mistralai/mixtral-8x7b',
      // DeepSeek
      'deepseek/deepseek-chat',
      'deepseek/deepseek-coder'
    ];
  }

  /**
   * 验证配置
   */
  static validateConfig(config: OpenRouterClientConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push('API key is required');
    }

    if (config.model && !OpenRouterClient.getSupportedModels().includes(config.model)) {
      errors.push(`Unsupported model: ${config.model}`);
    }

    if (config.timeout && config.timeout <= 0) {
      errors.push('Timeout must be positive');
    }

    if (config.maxRetries && config.maxRetries < 0) {
      errors.push('Max retries must be non-negative');
    }

    if (config.defaultMaxTokens && config.defaultMaxTokens <= 0) {
      errors.push('Default max tokens must be positive');
    }

    if (config.defaultTemperature && (config.defaultTemperature < 0 || config.defaultTemperature > 1)) {
      errors.push('Default temperature must be between 0 and 1');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 获取模型信息
   */
  static getModelInfo(model: string): {
    provider: string;
    family: string;
    contextLength: number;
    supportsFunctionCalling: boolean;
  } | null {
    const modelInfo: Record<string, any> = {
      'anthropic/claude-3-5-sonnet': {
        provider: 'anthropic',
        family: 'claude',
        contextLength: 200000,
        supportsFunctionCalling: true
      },
      'anthropic/claude-3-5-haiku': {
        provider: 'anthropic',
        family: 'claude',
        contextLength: 200000,
        supportsFunctionCalling: true
      },
      'openai/gpt-4-turbo': {
        provider: 'openai',
        family: 'gpt',
        contextLength: 128000,
        supportsFunctionCalling: true
      },
      'google/gemini-pro': {
        provider: 'google',
        family: 'gemini',
        contextLength: 32768,
        supportsFunctionCalling: true
      },
      'meta-llama/llama-3-70b-instruct': {
        provider: 'meta',
        family: 'llama',
        contextLength: 8192,
        supportsFunctionCalling: false
      },
      'deepseek/deepseek-chat': {
        provider: 'deepseek',
        family: 'deepseek',
        contextLength: 32768,
        supportsFunctionCalling: true
      }
    };

    return modelInfo[model] || null;
  }

  /**
   * 获取推荐模型
   */
  static getRecommendedModels(): Array<{
    model: string;
    useCase: string;
    costPer1KTokens: number;
    quality: 'high' | 'medium' | 'low';
  }> {
    return [
      {
        model: 'anthropic/claude-3-5-sonnet',
        useCase: '高质量总结和分析',
        costPer1KTokens: 3.00, // 美元
        quality: 'high'
      },
      {
        model: 'openai/gpt-4-turbo',
        useCase: '通用总结',
        costPer1KTokens: 10.00,
        quality: 'high'
      },
      {
        model: 'google/gemini-pro',
        useCase: '成本效益平衡',
        costPer1KTokens: 0.50,
        quality: 'medium'
      },
      {
        model: 'deepseek/deepseek-chat',
        useCase: '低成本总结',
        costPer1KTokens: 0.14,
        quality: 'medium'
      },
      {
        model: 'meta-llama/llama-3-70b-instruct',
        useCase: '开源选项',
        costPer1KTokens: 0.80,
        quality: 'medium'
      }
    ];
  }
}

/**
 * 创建OpenRouter客户端
 */
export function createOpenRouterClient(config: OpenRouterClientConfig): OpenRouterClient {
  const validation = OpenRouterClient.validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid OpenRouter client configuration: ${validation.errors.join(', ')}`);
  }

  return new OpenRouterClient(config);
}

/**
 * 默认OpenRouter客户端配置
 */
export const DEFAULT_OPENROUTER_CONFIG: OpenRouterClientConfig = {
  apiKey: '',
  model: 'anthropic/claude-3-5-sonnet',
  baseUrl: 'https://openrouter.ai/api/v1',
  timeout: 30000,
  maxRetries: 3,
  defaultMaxTokens: 4000,
  defaultTemperature: 0.7
};