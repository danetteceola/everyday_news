/**
 * DeepSeek API客户端
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
 * DeepSeek客户端配置
 */
export interface DeepSeekClientConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
}

/**
 * DeepSeek客户端
 */
export class DeepSeekClient implements LLMClient {
  private client: OpenAI;
  private config: DeepSeekClientConfig;
  private usageStats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
  };

  constructor(config: DeepSeekClientConfig) {
    this.config = {
      model: 'deepseek-chat',
      baseUrl: 'https://api.deepseek.com',
      timeout: 30000,
      maxRetries: 3,
      defaultMaxTokens: 4000,
      defaultTemperature: 0.7,
      ...config
    };

    if (!this.config.apiKey) {
      throw new Error('DeepSeek API key is required');
    }

    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      maxRetries: this.config.maxRetries
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

      // 发送请求
      const response = await this.client.chat.completions.create(params);

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
            'DeepSeek API authentication failed',
            error.code
          );

        case 429:
          return AIEngineError.rateLimitError(
            'DeepSeek API rate limit exceeded',
            error.headers?.['retry-after'] ? parseInt(error.headers['retry-after']) : undefined
          );

        case 500:
        case 502:
        case 503:
        case 504:
          return AIEngineError.apiError(
            `DeepSeek API server error: ${error.message}`,
            error.code,
            error
          );

        default:
          return AIEngineError.apiError(
            `DeepSeek API error: ${error.message}`,
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
      console.error('DeepSeek API connection test failed:', error);
      return false;
    }
  }

  /**
   * 获取客户端信息
   */
  getClientInfo(): ClientInfo {
    return {
      provider: 'deepseek',
      supportedModels: [
        'deepseek-chat',
        'deepseek-coder'
      ],
      rateLimit: {
        requestsPerMinute: 60, // DeepSeek API默认限制
        tokensPerMinute: 60000
      },
      features: [
        'chat_completion',
        'system_prompt',
        'temperature_control',
        'max_tokens_limit',
        'streaming',
        'function_calling'
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
  updateConfig(config: Partial<DeepSeekClientConfig>): void {
    this.config = { ...this.config, ...config };

    // 重新创建客户端（如果需要）
    if (config.apiKey || config.baseUrl) {
      this.client = new OpenAI({
        apiKey: this.config.apiKey,
        baseURL: this.config.baseUrl,
        timeout: this.config.timeout,
        maxRetries: this.config.maxRetries
      });
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): DeepSeekClientConfig {
    return { ...this.config };
  }

  /**
   * 获取支持的模型列表
   */
  static getSupportedModels(): string[] {
    return [
      'deepseek-chat',
      'deepseek-coder'
    ];
  }

  /**
   * 验证配置
   */
  static validateConfig(config: DeepSeekClientConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push('API key is required');
    }

    if (config.model && !DeepSeekClient.getSupportedModels().includes(config.model)) {
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
   * 获取成本信息
   */
  static getPricingInfo(): { model: string; inputPricePer1K: number; outputPricePer1K: number; currency: string }[] {
    return [
      {
        model: 'deepseek-chat',
        inputPricePer1K: 0.14,  // 每1000个输入token的价格（人民币）
        outputPricePer1K: 0.28, // 每1000个输出token的价格（人民币）
        currency: 'CNY'
      },
      {
        model: 'deepseek-coder',
        inputPricePer1K: 0.14,
        outputPricePer1K: 0.28,
        currency: 'CNY'
      }
    ];
  }
}

/**
 * 创建DeepSeek客户端
 */
export function createDeepSeekClient(config: DeepSeekClientConfig): DeepSeekClient {
  const validation = DeepSeekClient.validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid DeepSeek client configuration: ${validation.errors.join(', ')}`);
  }

  return new DeepSeekClient(config);
}

/**
 * 默认DeepSeek客户端配置
 */
export const DEFAULT_DEEPSEEK_CONFIG: DeepSeekClientConfig = {
  apiKey: '',
  model: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com',
  timeout: 30000,
  maxRetries: 3,
  defaultMaxTokens: 4000,
  defaultTemperature: 0.7
};