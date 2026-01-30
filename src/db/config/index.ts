import { DatabaseConfig } from '../types';
import path from 'path';
import fs from 'fs';
import { unifiedConfigManager } from './unified-config';

/**
 * 数据库配置管理（兼容层，使用统一配置管理器）
 */
export class DatabaseConfigManager {
  private static instance: DatabaseConfigManager;

  private constructor() {
    // 确保配置目录存在
    this.ensureDirectoriesExist();
  }

  /**
   * 获取配置管理器实例
   */
  public static getInstance(): DatabaseConfigManager {
    if (!DatabaseConfigManager.instance) {
      DatabaseConfigManager.instance = new DatabaseConfigManager();
    }
    return DatabaseConfigManager.instance;
  }

  /**
   * 确保目录存在
   */
  private ensureDirectoriesExist(): void {
    const config = this.getConfig();
    this.ensureDirectoryExists(path.dirname(config.databasePath));
    this.ensureDirectoryExists(config.backupPath);
  }

  /**
   * 确保目录存在
   */
  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * 获取当前配置
   */
  public getConfig(): DatabaseConfig {
    return unifiedConfigManager.getDatabaseConfig();
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<DatabaseConfig>): void {
    // 更新统一配置
    unifiedConfigManager.updateConfig({ database: newConfig });

    // 确保目录存在
    if (newConfig.databasePath) {
      this.ensureDirectoryExists(path.dirname(newConfig.databasePath));
    }
    if (newConfig.backupPath) {
      this.ensureDirectoryExists(newConfig.backupPath);
    }
  }

  /**
   * 获取数据库文件路径
   */
  public getDatabasePath(): string {
    return this.getConfig().databasePath;
  }

  /**
   * 获取备份目录路径
   */
  public getBackupPath(): string {
    return this.getConfig().backupPath;
  }

  /**
   * 获取最大连接数
   */
  public getMaxConnections(): number {
    return this.getConfig().maxConnections || 10;
  }

  /**
   * 获取超时时间
   */
  public getTimeout(): number {
    return this.getConfig().timeout || 5000;
  }

  /**
   * 检查数据库文件是否存在
   */
  public databaseExists(): boolean {
    return fs.existsSync(this.getDatabasePath());
  }

  /**
   * 获取数据库文件大小
   */
  public getDatabaseSize(): number {
    try {
      const stats = fs.statSync(this.getDatabasePath());
      return stats.size;
    } catch (error) {
      return 0;
    }
  }
}

// 导出默认配置管理器实例
export const configManager = DatabaseConfigManager.getInstance();