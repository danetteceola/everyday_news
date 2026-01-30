/**
 * 统一配置管理类型定义
 */

import { DatabaseConfig } from '../types';
import { BackupConfig } from '../backup/backup-manager';
import { MigrationConfig } from '../types/migration';

/**
 * 性能监控配置
 */
export interface PerformanceMonitoringConfig {
  /**
   * 是否启用性能监控
   */
  enabled: boolean;

  /**
   * 慢查询阈值（毫秒）
   */
  slowQueryThreshold: number;

  /**
   * 监控数据保留天数
   */
  retentionDays: number;

  /**
   * 是否启用查询缓存
   */
  queryCacheEnabled: boolean;

  /**
   * 查询缓存最大条目数
   */
  queryCacheMaxEntries: number;

  /**
   * 缓存过期时间（秒）
   */
  queryCacheTTL: number;

  /**
   * 是否启用索引监控
   */
  indexMonitoringEnabled: boolean;

  /**
   * 索引优化检查间隔（秒）
   */
  indexCheckInterval: number;

  /**
   * 是否启用连接池监控
   */
  connectionPoolMonitoringEnabled: boolean;

  /**
   * 告警阈值配置
   */
  alertThresholds: {
    /**
     * 连接池使用率告警阈值（百分比）
     */
    connectionPoolUsage: number;

    /**
     * 查询执行时间告警阈值（毫秒）
     */
    queryExecutionTime: number;

    /**
     * 数据库文件大小告警阈值（MB）
     */
    databaseSize: number;
  };
}

/**
 * 数据库优化配置
 */
export interface OptimizationConfig {
  /**
   * 是否启用自动优化
   */
  autoOptimizationEnabled: boolean;

  /**
   * 优化检查间隔（小时）
   */
  optimizationCheckInterval: number;

  /**
   * 自动VACUUM阈值（MB）
   */
  autoVacuumThreshold: number;

  /**
   * 自动ANALYZE阈值（插入/更新次数）
   */
  autoAnalyzeThreshold: number;

  /**
   * 是否启用查询计划分析
   */
  queryPlanAnalysisEnabled: boolean;

  /**
   * 最大建议索引数
   */
  maxSuggestedIndexes: number;
}

/**
 * 统一数据库配置
 */
export interface UnifiedDatabaseConfig {
  /**
   * 数据库连接配置
   */
  database: DatabaseConfig;

  /**
   * 备份配置
   */
  backup: BackupConfig;

  /**
   * 迁移配置
   */
  migration: MigrationConfig;

  /**
   * 性能监控配置
   */
  performance: PerformanceMonitoringConfig;

  /**
   * 优化配置
   */
  optimization: OptimizationConfig;

  /**
   * 通用配置
   */
  general: {
    /**
     * 环境名称（development, production, testing）
     */
    environment: 'development' | 'production' | 'testing';

    /**
     * 日志级别
     */
    logLevel: 'error' | 'warn' | 'info' | 'debug';

    /**
     * 是否启用调试模式
     */
    debugMode: boolean;

    /**
     * 应用名称
     */
    appName: string;

    /**
     * 应用版本
     */
    appVersion: string;
  };
}

/**
 * 配置源优先级
 */
export enum ConfigSource {
  /**
   * 默认值（最低优先级）
   */
  DEFAULT = 'default',

  /**
   * 配置文件
   */
  FILE = 'file',

  /**
   * 环境变量
   */
  ENV = 'env',

  /**
   * 运行时覆盖（最高优先级）
   */
  RUNTIME = 'runtime'
}

/**
 * 配置验证错误
 */
export interface ConfigValidationError {
  field: string;
  message: string;
  value?: any;
  expected?: any;
}

/**
 * 配置验证结果
 */
export interface ConfigValidationResult {
  valid: boolean;
  errors: ConfigValidationError[];
  warnings: string[];
}

/**
 * 配置源信息
 */
export interface ConfigSourceInfo {
  source: ConfigSource;
  path?: string; // 配置文件路径
  timestamp: Date;
  values: DeepPartial<UnifiedDatabaseConfig>;
}

/**
 * 深度部分类型，允许嵌套对象的部分更新
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};