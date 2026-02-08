/**
 * Claude API客户端
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  LLMClient,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
  ClientInfo,
  AIEngineError,
  TokenUsage
} from '../interface';

/**
 * Claude客户端配置
 */
export interface ClaudeClientConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  defaultMaxTokens?: number;
  defaultTemperature?: number;
}

/**
 * Claude客户端
 */
export class ClaudeClient implements LLMClient {
  private client: Anthropic;
  private config: ClaudeClientConfig;
  private usageStats: {
    totalRequests: number;
    successfulRequests: number;
    failedRequests: number;
    totalTokens: number;
  };

  constructor(config: ClaudeClientConfig) {
    this.config = {
      model: 'claude-3-5-sonnet-20241022',
      timeout: 30000,
      maxRetries: 3,
      defaultMaxTokens: 4000,
      defaultTemperature: 0.7,
      ...config
    };

    if (!this.config.apiKey) {
      throw new Error('Claude API key is required');
    }

    this.client = new Anthropic({
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
      const params: Anthropic.MessageCreateParams = {
        model: request.model || this.config.model!,
        messages,
        max_tokens: request.maxTokens || this.config.defaultMaxTokens!,
        temperature: request.temperature || this.config.defaultTemperature
      };

      // 添加系统提示（如果有）
      const systemMessage = request.messages.find(m => m.role === 'system');
      if (systemMessage) {
        params.system = systemMessage.content;
      }

      // 发送请求
      const response = await this.client.messages.create(params);

      // 更新使用统计
      this.usageStats.successfulRequests++;
      this.usageStats.totalTokens += response.usage.input_tokens + response.usage.output_tokens;

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
  private convertMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
    return messages
      .filter(message => message.role !== 'system') // 系统消息单独处理
      .map(message => {
        const role = message.role === 'assistant' ? 'assistant' : 'user';

        return {
          role,
          content: message.content
        };
      });
  }

  /**
   * 转换响应格式
   */
  private convertResponse(response: Anthropic.Message): ChatCompletionResponse {
    const choices = response.content.map((content, index) => ({
      index,
      message: {
        role: 'assistant' as const,
        content: content.text
      },
      finishReason: response.stop_reason || 'stop'
    }));

    return {
      id: response.id,
      model: response.model,
      choices,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      created: Date.now()
    };
  }

  /**
   * 处理错误
   */
  private handleError(error: any): AIEngineError {
    if (error instanceof Anthropic.APIError) {
      // Claude API错误
      switch (error.status) {
        case 401:
        case 403:
          return AIEngineError.authenticationError(
            'Claude API authentication failed',
            error.code
          );

        case 429:
          return AIEngineError.rateLimitError(
            'Claude API rate limit exceeded',
            error.headers?.['retry-after'] ? parseInt(error.headers['retry-after']) : undefined
          );

        case 500:
        case 502:
        case 503:
        case 504:
          return AIEngineError.apiError(
            `Claude API server error: ${error.message}`,
            error.code,
            error
          );

        default:
          return AIEngineError.apiError(
            `Claude API error: ${error.message}`,
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
      await this.client.messages.create({
        model: this.config.model!,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      });
      return true;
    } catch (error) {
      console.error('Claude API connection test failed:', error);
      return false;
    }
  }

  /**
   * 获取客户端信息
   */
  getClientInfo(): ClientInfo {
    return {
      provider: 'anthropic',
      supportedModels: [
        'claude-3-5-sonnet-20241022',
        'claude-3-5-haiku-20241022',
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307'
      ],
      rateLimit: {
        requestsPerMinute: 100, // Claude API默认限制
        tokensPerMinute: 40000
      },
      features: [
        'chat_completion',
        'system_prompt',
        'temperature_control',
        'max_tokens_limit',
        'streaming'
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
  updateConfig(config: Partial<ClaudeClientConfig>): void {
    this.config = { ...this.config, ...config };

    // 重新创建客户端（如果需要）
    if (config.apiKey || config.baseUrl) {
      this.client = new Anthropic({
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
  getConfig(): ClaudeClientConfig {
    return { ...this.config };
  }

  /**
   * 获取支持的模型列表
   */
  static getSupportedModels(): string[] {
    return [
      'claude-3-5-sonnet-20241022',
      'claude-3-5-haiku-20241022',
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307'
    ];
  }

  /**
   * 验证配置
   */
  static validateConfig(config: ClaudeClientConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.apiKey) {
      errors.push('API key is required');
    }

    if (config.model && !ClaudeClient.getSupportedModels().includes(config.model)) {
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
}

/**
 * 创建Claude客户端
 */
export function createClaudeClient(config: ClaudeClientConfig): ClaudeClient {
  const validation = ClaudeClient.validateConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid Claude client configuration: ${validation.errors.join(', ')}`);
  }

  return new ClaudeClient(config);
}

/**
 * 默认Claude客户端配置
 */
export const DEFAULT_CLAUDE_CONFIG: ClaudeClientConfig = {
  apiKey: '',
  model: 'claude-3-5-sonnet-20241022',
  timeout: 30000,
  maxRetries: 3,
  defaultMaxTokens: 4000,
  defaultTemperature: 0.7
};