/**
 * LLM API密钥管理
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

// 加载环境变量
dotenv.config();

// API密钥配置接口
export interface APIKeyConfig {
  anthropic?: string;      // Claude API密钥
  openai?: string;         // OpenAI API密钥
  openrouter?: string;     // OpenRouter API密钥
  deepseek?: string;       // DeepSeek API密钥
}

// 密钥来源
export enum KeySource {
  ENV = 'env',      // 环境变量
  FILE = 'file',    // 配置文件
  MEMORY = 'memory' // 内存
}

// 密钥状态
export interface KeyStatus {
  source: KeySource;
  loaded: boolean;
  lastUsed?: Date;
  usageCount: number;
}

/**
 * API密钥管理器
 */
export class APIKeyManager {
  private static instance: APIKeyManager;
  private keys: APIKeyConfig = {};
  private keyStatus: Record<string, KeyStatus> = {};
  private keyFile?: string;

  private constructor() {
    this.loadKeys();
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): APIKeyManager {
    if (!APIKeyManager.instance) {
      APIKeyManager.instance = new APIKeyManager();
    }
    return APIKeyManager.instance;
  }

  /**
   * 加载API密钥
   */
  private loadKeys(): void {
    // 从环境变量加载
    this.loadFromEnv();

    // 尝试从配置文件加载
    this.loadFromFile();

    // 验证密钥
    this.validateKeys();
  }

  /**
   * 从环境变量加载密钥
   */
  private loadFromEnv(): void {
    const envKeys: APIKeyConfig = {
      anthropic: process.env.ANTHROPIC_API_KEY,
      openai: process.env.OPENAI_API_KEY,
      openrouter: process.env.OPENROUTER_API_KEY,
      deepseek: process.env.DEEPSEEK_API_KEY
    };

    Object.entries(envKeys).forEach(([provider, key]) => {
      if (key) {
        this.keys[provider as keyof APIKeyConfig] = key;
        this.keyStatus[provider] = {
          source: KeySource.ENV,
          loaded: true,
          usageCount: 0
        };
      }
    });
  }

  /**
   * 从配置文件加载密钥
   */
  private loadFromFile(): void {
    const configPaths = [
      path.join(process.cwd(), 'config', 'api-keys.json'),
      path.join(process.cwd(), 'api-keys.json'),
      path.join(process.cwd(), '.api-keys.json')
    ];

    for (const configPath of configPaths) {
      if (fs.existsSync(configPath)) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          Object.entries(config).forEach(([provider, key]) => {
            if (key && !this.keys[provider as keyof APIKeyConfig]) {
              this.keys[provider as keyof APIKeyConfig] = key as string;
              this.keyStatus[provider] = {
                source: KeySource.FILE,
                loaded: true,
                usageCount: 0
              };
            }
          });
          this.keyFile = configPath;
          break;
        } catch (error) {
          console.warn(`Failed to load API keys from ${configPath}:`, error);
        }
      }
    }
  }

  /**
   * 验证密钥
   */
  private validateKeys(): void {
    const requiredProviders = ['anthropic']; // Claude是主要提供商

    for (const provider of requiredProviders) {
      if (!this.keys[provider as keyof APIKeyConfig]) {
        console.warn(`Warning: ${provider.toUpperCase()} API key is not configured`);
      }
    }
  }

  /**
   * 获取API密钥
   */
  public getKey(provider: keyof APIKeyConfig): string | undefined {
    const key = this.keys[provider];
    if (key) {
      // 更新使用统计
      if (this.keyStatus[provider]) {
        this.keyStatus[provider].lastUsed = new Date();
        this.keyStatus[provider].usageCount++;
      }
    }
    return key;
  }

  /**
   * 设置API密钥
   */
  public setKey(provider: keyof APIKeyConfig, key: string, source: KeySource = KeySource.MEMORY): void {
    this.keys[provider] = key;
    this.keyStatus[provider] = {
      source,
      loaded: true,
      lastUsed: new Date(),
      usageCount: 0
    };
  }

  /**
   * 移除API密钥
   */
  public removeKey(provider: keyof APIKeyConfig): void {
    delete this.keys[provider];
    delete this.keyStatus[provider];
  }

  /**
   * 获取所有密钥
   */
  public getAllKeys(): APIKeyConfig {
    return { ...this.keys };
  }

  /**
   * 获取密钥状态
   */
  public getKeyStatus(): Record<string, KeyStatus> {
    return { ...this.keyStatus };
  }

  /**
   * 检查是否有可用的密钥
   */
  public hasKey(provider: keyof APIKeyConfig): boolean {
    return !!this.keys[provider];
  }

  /**
   * 获取首选提供商
   */
  public getPreferredProvider(): keyof APIKeyConfig | null {
    const providers: (keyof APIKeyConfig)[] = ['anthropic', 'openrouter', 'openai', 'deepseek'];

    for (const provider of providers) {
      if (this.hasKey(provider)) {
        return provider;
      }
    }

    return null;
  }

  /**
   * 保存密钥到文件
   */
  public saveToFile(filePath?: string): boolean {
    try {
      const savePath = filePath || this.keyFile || path.join(process.cwd(), 'config', 'api-keys.json');

      // 确保目录存在
      const dir = path.dirname(savePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 保存密钥（不保存环境变量来源的密钥）
      const keysToSave: APIKeyConfig = {};
      Object.entries(this.keyStatus).forEach(([provider, status]) => {
        if (status.source !== KeySource.ENV && this.keys[provider as keyof APIKeyConfig]) {
          keysToSave[provider as keyof APIKeyConfig] = this.keys[provider as keyof APIKeyConfig];
        }
      });

      fs.writeFileSync(savePath, JSON.stringify(keysToSave, null, 2));
      this.keyFile = savePath;

      return true;
    } catch (error) {
      console.error('Failed to save API keys:', error);
      return false;
    }
  }

  /**
   * 清除所有密钥
   */
  public clear(): void {
    this.keys = {};
    this.keyStatus = {};
  }

  /**
   * 获取配置信息
   */
  public getConfigInfo(): {
    providers: string[];
    preferred: string | null;
    keyCount: number;
  } {
    const providers = Object.keys(this.keys);
    const preferred = this.getPreferredProvider();

    return {
      providers,
      preferred: preferred as string | null,
      keyCount: providers.length
    };
  }
}

// 导出单例实例
export const apiKeyManager = APIKeyManager.getInstance();

// 辅助函数：获取API密钥
export function getAPIKey(provider: keyof APIKeyConfig): string | undefined {
  return apiKeyManager.getKey(provider);
}

// 辅助函数：设置API密钥
export function setAPIKey(provider: keyof APIKeyConfig, key: string): void {
  apiKeyManager.setKey(provider, key);
}

// 辅助函数：获取首选提供商
export function getPreferredProvider(): keyof APIKeyConfig | null {
  return apiKeyManager.getPreferredProvider();
}