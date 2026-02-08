/**
 * LLM客户端工厂
 */

import { LLMClient, ClientInfo, AIEngineError } from './interface';
import { ClaudeClient, ClaudeClientConfig, createClaudeClient } from './clients/claude-client';
import { DeepSeekClient, DeepSeekClientConfig, createDeepSeekClient } from './clients/deepseek-client';
import { OpenRouterClient, OpenRouterClientConfig, createOpenRouterClient } from './clients/openrouter-client';
import { apiKeyManager } from '../config/api-keys';

/**
 * 客户端类型
 */
export type ClientType = 'anthropic' | 'deepseek' | 'openrouter';

/**
 * 客户端配置
 */
export type ClientConfig =
  | { type: 'anthropic'; config: ClaudeClientConfig }
  | { type: 'deepseek'; config: DeepSeekClientConfig }
  | { type: 'openrouter'; config: OpenRouterClientConfig };

/**
 * 客户端工厂
 */
export class ClientFactory {
  private static instance: ClientFactory;
  private clients: Map<string, LLMClient> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): ClientFactory {
    if (!ClientFactory.instance) {
      ClientFactory.instance = new ClientFactory();
    }
    return ClientFactory.instance;
  }

  /**
   * 创建客户端
   */
  public createClient(type: ClientType, config?: any): LLMClient {
    const clientId = this.generateClientId(type, config);

    // 检查是否已存在
    if (this.clients.has(clientId)) {
      return this.clients.get(clientId)!;
    }

    // 创建新客户端
    let client: LLMClient;

    switch (type) {
      case 'anthropic':
        client = this.createClaudeClient(config);
        break;
      case 'deepseek':
        client = this.createDeepSeekClient(config);
        break;
      case 'openrouter':
        client = this.createOpenRouterClient(config);
        break;
      default:
        throw new Error(`Unsupported client type: ${type}`);
    }

    // 缓存客户端
    this.clients.set(clientId, client);

    return client;
  }

  /**
   * 创建Claude客户端
   */
  private createClaudeClient(config?: Partial<ClaudeClientConfig>): ClaudeClient {
    const apiKey = config?.apiKey || apiKeyManager.getKey('anthropic');

    if (!apiKey) {
      throw new Error('Claude API key is not configured');
    }

    const fullConfig: ClaudeClientConfig = {
      apiKey,
      model: config?.model || 'claude-3-5-sonnet-20241022',
      timeout: config?.timeout || 30000,
      maxRetries: config?.maxRetries || 3,
      defaultMaxTokens: config?.defaultMaxTokens || 4000,
      defaultTemperature: config?.defaultTemperature || 0.7
    };

    return createClaudeClient(fullConfig);
  }

  /**
   * 创建DeepSeek客户端
   */
  private createDeepSeekClient(config?: Partial<DeepSeekClientConfig>): DeepSeekClient {
    const apiKey = config?.apiKey || apiKeyManager.getKey('deepseek');

    if (!apiKey) {
      throw new Error('DeepSeek API key is not configured');
    }

    const fullConfig: DeepSeekClientConfig = {
      apiKey,
      model: config?.model || 'deepseek-chat',
      baseUrl: config?.baseUrl || 'https://api.deepseek.com',
      timeout: config?.timeout || 30000,
      maxRetries: config?.maxRetries || 3,
      defaultMaxTokens: config?.defaultMaxTokens || 4000,
      defaultTemperature: config?.defaultTemperature || 0.7
    };

    return createDeepSeekClient(fullConfig);
  }

  /**
   * 创建OpenRouter客户端
   */
  private createOpenRouterClient(config?: Partial<OpenRouterClientConfig>): OpenRouterClient {
    const apiKey = config?.apiKey || apiKeyManager.getKey('openrouter');

    if (!apiKey) {
      throw new Error('OpenRouter API key is not configured');
    }

    const fullConfig: OpenRouterClientConfig = {
      apiKey,
      model: config?.model || 'anthropic/claude-3-5-sonnet',
      baseUrl: config?.baseUrl || 'https://openrouter.ai/api/v1',
      timeout: config?.timeout || 30000,
      maxRetries: config?.maxRetries || 3,
      defaultMaxTokens: config?.defaultMaxTokens || 4000,
      defaultTemperature: config?.defaultTemperature || 0.7
    };

    return createOpenRouterClient(fullConfig);
  }

  /**
   * 生成客户端ID
   */
  private generateClientId(type: ClientType, config?: any): string {
    const baseId = `${type}:${config?.model || 'default'}`;

    if (config?.apiKey) {
      // 使用API密钥的哈希作为ID的一部分（不存储实际密钥）
      const keyHash = this.hashString(config.apiKey.substring(0, 8));
      return `${baseId}:${keyHash}`;
    }

    return baseId;
  }

  /**
   * 哈希字符串
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * 获取客户端
   */
  public getClient(type: ClientType, config?: any): LLMClient | null {
    const clientId = this.generateClientId(type, config);
    return this.clients.get(clientId) || null;
  }

  /**
   * 移除客户端
   */
  public removeClient(type: ClientType, config?: any): boolean {
    const clientId = this.generateClientId(type, config);
    return this.clients.delete(clientId);
  }

  /**
   * 清空所有客户端
   */
  public clearAll(): void {
    this.clients.clear();
  }

  /**
   * 获取所有客户端信息
   */
  public getAllClientInfo(): Array<{
    type: ClientType;
    clientId: string;
    info: ClientInfo;
  }> {
    const result: Array<{
      type: ClientType;
      clientId: string;
      info: ClientInfo;
    }> = [];

    this.clients.forEach((client, clientId) => {
      // 从clientId解析类型
      const type = clientId.split(':')[0] as ClientType;
      result.push({
        type,
        clientId,
        info: client.getClientInfo()
      });
    });

    return result;
  }

  /**
   * 测试所有客户端连接
   */
  public async testAllConnections(): Promise<Array<{
    type: ClientType;
    clientId: string;
    connected: boolean;
    error?: string;
  }>> {
    const results: Array<{
      type: ClientType;
      clientId: string;
      connected: boolean;
      error?: string;
    }> = [];

    const promises = Array.from(this.clients.entries()).map(async ([clientId, client]) => {
      const type = clientId.split(':')[0] as ClientType;

      try {
        const connected = await client.testConnection();
        results.push({
          type,
          clientId,
          connected,
          error: connected ? undefined : 'Connection test failed'
        });
      } catch (error: any) {
        results.push({
          type,
          clientId,
          connected: false,
          error: error.message
        });
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * 根据配置获取最佳客户端
   */
  public getBestClient(options?: {
    preferredProvider?: ClientType;
    requiredFeatures?: string[];
    maxCostPer1KTokens?: number;
  }): LLMClient | null {
    const availableClients = this.getAllClientInfo();

    if (availableClients.length === 0) {
      return null;
    }

    // 过滤客户端
    let filteredClients = availableClients;

    // 按首选提供商过滤
    if (options?.preferredProvider) {
      filteredClients = filteredClients.filter(c => c.type === options.preferredProvider);
    }

    // 按所需功能过滤
    if (options?.requiredFeatures && options.requiredFeatures.length > 0) {
      filteredClients = filteredClients.filter(client => {
        return options.requiredFeatures!.every(feature =>
          client.info.features.includes(feature)
        );
      });
    }

    if (filteredClients.length === 0) {
      // 如果没有匹配的客户端，返回第一个可用的
      const firstClientId = availableClients[0].clientId;
      return this.clients.get(firstClientId) || null;
    }

    // 选择第一个匹配的客户端
    const bestClient = filteredClients[0];
    return this.clients.get(bestClient.clientId) || null;
  }

  /**
   * 创建默认客户端（基于配置）
   */
  public createDefaultClient(): LLMClient {
    // 获取首选提供商
    const preferredProvider = apiKeyManager.getPreferredProvider();

    if (!preferredProvider) {
      throw new Error('No API keys configured. Please configure at least one LLM API key.');
    }

    // 创建客户端
    return this.createClient(preferredProvider as ClientType);
  }

  /**
   * 获取客户端统计
   */
  public getClientStats(): {
    totalClients: number;
    byType: Record<ClientType, number>;
    connectedClients: number;
  } {
    const byType: Record<ClientType, number> = {
      anthropic: 0,
      deepseek: 0,
      openrouter: 0
    };

    let connectedClients = 0;

    this.clients.forEach((client, clientId) => {
      const type = clientId.split(':')[0] as ClientType;
      byType[type] = (byType[type] || 0) + 1;

      // 这里可以添加连接状态检查
      // 暂时假设所有客户端都是连接的
      connectedClients++;
    });

    return {
      totalClients: this.clients.size,
      byType,
      connectedClients
    };
  }
}

// 导出单例实例
export const clientFactory = ClientFactory.getInstance();

// 辅助函数：创建客户端
export function createClient(type: ClientType, config?: any): LLMClient {
  return clientFactory.createClient(type, config);
}

// 辅助函数：获取默认客户端
export function getDefaultClient(): LLMClient {
  return clientFactory.createDefaultClient();
}

// 辅助函数：获取最佳客户端
export function getBestClient(options?: {
  preferredProvider?: ClientType;
  requiredFeatures?: string[];
  maxCostPer1KTokens?: number;
}): LLMClient | null {
  return clientFactory.getBestClient(options);
}

// 辅助函数：测试所有连接
export async function testAllConnections(): Promise<Array<{
  type: ClientType;
  clientId: string;
  connected: boolean;
  error?: string;
}>> {
  return clientFactory.testAllConnections();
}