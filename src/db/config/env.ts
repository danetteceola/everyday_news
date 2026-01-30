import dotenv from 'dotenv';
import path from 'path';

/**
 * 环境变量加载器
 */
export class EnvLoader {
  private static initialized = false;

  /**
   * 初始化环境变量
   */
  public static initialize(): void {
    if (this.initialized) {
      return;
    }

    // 尝试从不同位置加载.env文件
    const envPaths = [
      path.join(process.cwd(), '.env.local'),
      path.join(process.cwd(), '.env'),
      path.join(process.cwd(), '.env.example')
    ];

    for (const envPath of envPaths) {
      try {
        dotenv.config({ path: envPath });
        console.log(`Loaded environment variables from: ${envPath}`);
        break;
      } catch (error) {
        // 继续尝试下一个文件
      }
    }

    this.initialized = true;
  }

  /**
   * 获取环境变量值
   */
  public static get(key: string, defaultValue?: string): string | undefined {
    this.initialize();
    return process.env[key] || defaultValue;
  }

  /**
   * 获取数值型环境变量
   */
  public static getNumber(key: string, defaultValue?: number): number | undefined {
    const value = this.get(key);
    if (value === undefined) {
      return defaultValue;
    }
    const num = parseFloat(value);
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * 获取布尔型环境变量
   */
  public static getBoolean(key: string, defaultValue?: boolean): boolean | undefined {
    const value = this.get(key);
    if (value === undefined) {
      return defaultValue;
    }
    const lowerValue = value.toLowerCase();
    return lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes';
  }

  /**
   * 获取数组型环境变量
   */
  public static getArray(key: string, defaultValue?: string[]): string[] | undefined {
    const value = this.get(key);
    if (value === undefined) {
      return defaultValue;
    }
    return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
  }

  /**
   * 检查必需的环境变量是否存在
   */
  public static validateRequired(requiredKeys: string[]): void {
    this.initialize();
    const missingKeys: string[] = [];

    for (const key of requiredKeys) {
      if (!process.env[key]) {
        missingKeys.push(key);
      }
    }

    if (missingKeys.length > 0) {
      throw new Error(`Missing required environment variables: ${missingKeys.join(', ')}`);
    }
  }

  /**
   * 获取所有环境变量
   */
  public static getAll(): Record<string, string> {
    this.initialize();
    return { ...process.env } as Record<string, string>;
  }
}

// 导出常用环境变量获取函数
export const env = {
  get: EnvLoader.get.bind(EnvLoader),
  getNumber: EnvLoader.getNumber.bind(EnvLoader),
  getBoolean: EnvLoader.getBoolean.bind(EnvLoader),
  getArray: EnvLoader.getArray.bind(EnvLoader),
  validateRequired: EnvLoader.validateRequired.bind(EnvLoader),
  getAll: EnvLoader.getAll.bind(EnvLoader)
};