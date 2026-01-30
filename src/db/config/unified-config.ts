/**
 * 统一配置管理器
 */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import {
  UnifiedDatabaseConfig,
  ConfigSource,
  ConfigSourceInfo,
  ConfigValidationResult,
  ConfigValidationError,
  PerformanceMonitoringConfig,
  OptimizationConfig,
  DeepPartial
} from './config-types';
import { BackupConfig } from '../backup/backup-manager';
import { MigrationConfig } from '../types/migration';
import { DatabaseConfig } from '../types';

/**
 * 默认配置
 */
const DEFAULT_CONFIG: UnifiedDatabaseConfig = {
  database: {
    databasePath: path.join(process.cwd(), 'data', 'everyday_news.db'),
    backupPath: path.join(process.cwd(), 'data', 'backups'),
    maxConnections: 10,
    timeout: 5000
  },
  backup: {
    backupDirectory: path.join(process.cwd(), 'data', 'backups'),
    backupType: 'full',
    retentionDays: 7,
    compress: true,
    compressionLevel: 6,
    encrypt: false,
    maxBackupFiles: 30,
    autoBackupInterval: 86400 // 24 hours
  },
  migration: {
    migrationTableName: 'schema_migrations',
    migrationsDirectory: path.join(__dirname, '..', 'migrations', 'scripts'),
    autoRollbackOnFailure: true,
    checkOnStartup: true,
    verboseLogging: false
  },
  performance: {
    enabled: true,
    slowQueryThreshold: 1000, // 1 second
    retentionDays: 30,
    queryCacheEnabled: true,
    queryCacheMaxEntries: 1000,
    queryCacheTTL: 300, // 5 minutes
    indexMonitoringEnabled: true,
    indexCheckInterval: 3600, // 1 hour
    connectionPoolMonitoringEnabled: true,
    alertThresholds: {
      connectionPoolUsage: 80, // 80%
      queryExecutionTime: 5000, // 5 seconds
      databaseSize: 1024 // 1GB
    }
  },
  optimization: {
    autoOptimizationEnabled: true,
    optimizationCheckInterval: 24, // hours
    autoVacuumThreshold: 100, // MB
    autoAnalyzeThreshold: 1000, // operations
    queryPlanAnalysisEnabled: true,
    maxSuggestedIndexes: 10
  },
  general: {
    environment: 'development',
    logLevel: 'info',
    debugMode: false,
    appName: 'everyday-news',
    appVersion: '1.0.0'
  }
};

/**
 * 环境变量映射规则
 */
const ENV_VAR_MAPPINGS = {
  // 数据库配置
  'DATABASE_PATH': 'database.databasePath',
  'BACKUP_PATH': 'database.backupPath',
  'MAX_CONNECTIONS': 'database.maxConnections',
  'DATABASE_TIMEOUT': 'database.timeout',

  // 备份配置
  'BACKUP_DIRECTORY': 'backup.backupDirectory',
  'BACKUP_TYPE': 'backup.backupType',
  'BACKUP_RETENTION_DAYS': 'backup.retentionDays',
  'BACKUP_COMPRESS': 'backup.compress',
  'BACKUP_COMPRESSION_LEVEL': 'backup.compressionLevel',
  'BACKUP_ENCRYPT': 'backup.encrypt',
  'BACKUP_ENCRYPTION_KEY': 'backup.encryptionKey',
  'BACKUP_MAX_FILES': 'backup.maxBackupFiles',
  'BACKUP_AUTO_INTERVAL': 'backup.autoBackupInterval',

  // 迁移配置
  'MIGRATION_TABLE_NAME': 'migration.migrationTableName',
  'MIGRATION_DIRECTORY': 'migration.migrationsDirectory',
  'MIGRATION_AUTO_ROLLBACK': 'migration.autoRollbackOnFailure',
  'MIGRATION_CHECK_ON_STARTUP': 'migration.checkOnStartup',
  'MIGRATION_VERBOSE_LOGGING': 'migration.verboseLogging',

  // 性能监控配置
  'PERFORMANCE_ENABLED': 'performance.enabled',
  'PERFORMANCE_SLOW_QUERY_THRESHOLD': 'performance.slowQueryThreshold',
  'PERFORMANCE_RETENTION_DAYS': 'performance.retentionDays',
  'PERFORMANCE_QUERY_CACHE_ENABLED': 'performance.queryCacheEnabled',
  'PERFORMANCE_QUERY_CACHE_MAX_ENTRIES': 'performance.queryCacheMaxEntries',
  'PERFORMANCE_QUERY_CACHE_TTL': 'performance.queryCacheTTL',
  'PERFORMANCE_INDEX_MONITORING_ENABLED': 'performance.indexMonitoringEnabled',
  'PERFORMANCE_INDEX_CHECK_INTERVAL': 'performance.indexCheckInterval',
  'PERFORMANCE_CONNECTION_POOL_MONITORING_ENABLED': 'performance.connectionPoolMonitoringEnabled',
  'PERFORMANCE_ALERT_CONNECTION_POOL_USAGE': 'performance.alertThresholds.connectionPoolUsage',
  'PERFORMANCE_ALERT_QUERY_EXECUTION_TIME': 'performance.alertThresholds.queryExecutionTime',
  'PERFORMANCE_ALERT_DATABASE_SIZE': 'performance.alertThresholds.databaseSize',

  // 优化配置
  'OPTIMIZATION_AUTO_ENABLED': 'optimization.autoOptimizationEnabled',
  'OPTIMIZATION_CHECK_INTERVAL': 'optimization.optimizationCheckInterval',
  'OPTIMIZATION_AUTO_VACUUM_THRESHOLD': 'optimization.autoVacuumThreshold',
  'OPTIMIZATION_AUTO_ANALYZE_THRESHOLD': 'optimization.autoAnalyzeThreshold',
  'OPTIMIZATION_QUERY_PLAN_ANALYSIS_ENABLED': 'optimization.queryPlanAnalysisEnabled',
  'OPTIMIZATION_MAX_SUGGESTED_INDEXES': 'optimization.maxSuggestedIndexes',

  // 通用配置
  'NODE_ENV': 'general.environment',
  'LOG_LEVEL': 'general.logLevel',
  'DEBUG_MODE': 'general.debugMode',
  'APP_NAME': 'general.appName',
  'APP_VERSION': 'general.appVersion'
} as const;

/**
 * 配置值类型转换函数
 */
const TYPE_CONVERTERS = {
  string: (value: string) => value,
  number: (value: string) => parseFloat(value),
  boolean: (value: string) => value.toLowerCase() === 'true' || value === '1',
  'string[]': (value: string) => value.split(',').map(v => v.trim()),
  'number[]': (value: string) => value.split(',').map(v => parseFloat(v.trim()))
};

/**
 * 统一配置管理器
 */
export class UnifiedConfigManager {
  private static instance: UnifiedConfigManager;
  private config: UnifiedDatabaseConfig;
  private sources: ConfigSourceInfo[] = [];
  private listeners: Array<(config: UnifiedDatabaseConfig) => void> = [];

  private constructor() {
    this.config = this.loadConfig();
  }

  /**
   * 获取配置管理器实例
   */
  public static getInstance(): UnifiedConfigManager {
    if (!UnifiedConfigManager.instance) {
      UnifiedConfigManager.instance = new UnifiedConfigManager();
    }
    return UnifiedConfigManager.instance;
  }

  /**
   * 加载配置
   */
  private loadConfig(): UnifiedDatabaseConfig {
    // 重置源信息
    this.sources = [];

    // 1. 加载默认配置
    this.applyDefaultConfig();

    // 2. 加载配置文件
    this.loadConfigFiles();

    // 3. 加载环境变量
    this.loadEnvironmentVariables();

    // 4. 验证配置
    const validationResult = this.validateConfig(this.config);
    if (!validationResult.valid) {
      console.warn('Configuration validation warnings:', validationResult.warnings);
      if (validationResult.errors.length > 0) {
        throw new Error(`Invalid configuration: ${validationResult.errors.map(e => e.message).join(', ')}`);
      }
    }

    return this.config;
  }

  /**
   * 应用默认配置
   */
  private applyDefaultConfig(): void {
    this.sources.push({
      source: ConfigSource.DEFAULT,
      timestamp: new Date(),
      values: { ...DEFAULT_CONFIG }
    });
    this.config = { ...DEFAULT_CONFIG };
  }

  /**
   * 加载配置文件
   */
  private loadConfigFiles(): void {
    const configDir = process.env.CONFIG_DIR || path.join(process.cwd(), 'config');
    const configFiles = [
      path.join(configDir, 'database.yaml'),
      path.join(configDir, 'database.yml'),
      path.join(configDir, 'database.json'),
      path.join(configDir, 'config.yaml'),
      path.join(configDir, 'config.yml'),
      path.join(configDir, 'config.json'),
      path.join(process.cwd(), 'database.yaml'),
      path.join(process.cwd(), 'database.yml'),
      path.join(process.cwd(), 'database.json'),
      path.join(process.cwd(), 'config.yaml'),
      path.join(process.cwd(), 'config.yml'),
      path.join(process.cwd(), 'config.json')
    ];

    for (const configFile of configFiles) {
      if (fs.existsSync(configFile)) {
        try {
          const fileContent = fs.readFileSync(configFile, 'utf-8');
          let configData: any;

          if (configFile.endsWith('.json')) {
            configData = JSON.parse(fileContent);
          } else if (configFile.endsWith('.yaml') || configFile.endsWith('.yml')) {
            configData = yaml.load(fileContent);
          } else {
            continue;
          }

          this.sources.push({
            source: ConfigSource.FILE,
            path: configFile,
            timestamp: fs.statSync(configFile).mtime,
            values: configData
          });

          // 合并配置
          this.config = this.deepMerge(this.config, configData);
          console.log(`Loaded configuration from: ${configFile}`);
          break; // 只加载第一个找到的配置文件
        } catch (error) {
          console.error(`Failed to load configuration file ${configFile}:`, error);
        }
      }
    }
  }

  /**
   * 加载环境变量
   */
  private loadEnvironmentVariables(): void {
    const envConfig: DeepPartial<UnifiedDatabaseConfig> = {};

    for (const [envVar, configPath] of Object.entries(ENV_VAR_MAPPINGS)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        this.setNestedValue(envConfig, configPath, this.convertEnvValue(envValue, configPath));
      }
    }

    if (Object.keys(envConfig).length > 0) {
      this.sources.push({
        source: ConfigSource.ENV,
        timestamp: new Date(),
        values: envConfig
      });
      this.config = this.deepMerge(this.config, envConfig);
    }
  }

  /**
   * 转换环境变量值
   */
  private convertEnvValue(value: string, configPath: string): any {
    // 根据配置路径推断类型
    if (configPath.includes('enabled') || configPath.includes('Enabled')) {
      return TYPE_CONVERTERS.boolean(value);
    } else if (configPath.includes('Threshold') || configPath.includes('Interval') ||
               configPath.includes('Level') || configPath.includes('Days') ||
               configPath.includes('Time') || configPath.includes('Size') ||
               configPath.includes('Entries') || configPath.includes('TTL') ||
               configPath.includes('Usage') || configPath.includes('Connections') ||
               configPath.includes('Files') || configPath.includes('Indexes')) {
      return TYPE_CONVERTERS.number(value);
    } else if (configPath.includes('environment')) {
      return value as 'development' | 'production' | 'testing';
    } else if (configPath.includes('logLevel')) {
      return value as 'error' | 'warn' | 'info' | 'debug';
    } else if (configPath.includes('backupType')) {
      return value as 'full' | 'incremental';
    } else {
      return TYPE_CONVERTERS.string(value);
    }
  }

  /**
   * 设置嵌套对象值
   */
  private setNestedValue(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const key = keys[i];
      if (!current[key] || typeof current[key] !== 'object') {
        current[key] = {};
      }
      current = current[key];
    }

    current[keys[keys.length - 1]] = value;
  }

  /**
   * 深度合并对象
   */
  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          result[key] = this.deepMerge(result[key] || {}, source[key]);
        } else {
          result[key] = source[key];
        }
      }
    }

    return result;
  }

  /**
   * 验证配置
   */
  private validateConfig(config: UnifiedDatabaseConfig): ConfigValidationResult {
    const errors: ConfigValidationError[] = [];
    const warnings: string[] = [];

    // 验证数据库配置
    if (!config.database.databasePath) {
      errors.push({ field: 'database.databasePath', message: 'Database path is required' });
    }

    if (config.database.maxConnections && config.database.maxConnections < 1) {
      errors.push({
        field: 'database.maxConnections',
        message: 'Max connections must be at least 1',
        value: config.database.maxConnections,
        expected: '>= 1'
      });
    }

    // 验证备份配置
    if (config.backup.retentionDays < 1) {
      errors.push({
        field: 'backup.retentionDays',
        message: 'Retention days must be at least 1',
        value: config.backup.retentionDays,
        expected: '>= 1'
      });
    }

    if (config.backup.compress && (config.backup.compressionLevel < 1 || config.backup.compressionLevel > 9)) {
      errors.push({
        field: 'backup.compressionLevel',
        message: 'Compression level must be between 1 and 9',
        value: config.backup.compressionLevel,
        expected: '1-9'
      });
    }

    if (config.backup.encrypt && !config.backup.encryptionKey) {
      warnings.push('Encryption is enabled but no encryption key is provided');
    }

    // 验证性能监控配置
    if (config.performance.slowQueryThreshold < 0) {
      errors.push({
        field: 'performance.slowQueryThreshold',
        message: 'Slow query threshold must be positive',
        value: config.performance.slowQueryThreshold,
        expected: '> 0'
      });
    }

    // 验证优化配置
    if (config.optimization.autoVacuumThreshold < 0) {
      errors.push({
        field: 'optimization.autoVacuumThreshold',
        message: 'Auto vacuum threshold must be positive',
        value: config.optimization.autoVacuumThreshold,
        expected: '> 0'
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 获取当前配置
   */
  public getConfig(): UnifiedDatabaseConfig {
    return { ...this.config };
  }

  /**
   * 获取特定部分的配置
   */
  public getDatabaseConfig(): DatabaseConfig {
    return { ...this.config.database };
  }

  public getBackupConfig(): BackupConfig {
    return { ...this.config.backup };
  }

  public getMigrationConfig(): MigrationConfig {
    return { ...this.config.migration };
  }

  public getPerformanceConfig(): PerformanceMonitoringConfig {
    return { ...this.config.performance };
  }

  public getOptimizationConfig(): OptimizationConfig {
    return { ...this.config.optimization };
  }

  /**
   * 更新配置（运行时覆盖）
   */
  public updateConfig(newConfig: DeepPartial<UnifiedDatabaseConfig>): void {
    this.sources.push({
      source: ConfigSource.RUNTIME,
      timestamp: new Date(),
      values: newConfig
    });

    this.config = this.deepMerge(this.config, newConfig);

    // 触发监听器
    this.notifyListeners();
  }

  /**
   * 获取配置源信息
   */
  public getSources(): ConfigSourceInfo[] {
    return [...this.sources];
  }

  /**
   * 重新加载配置
   */
  public reload(): void {
    this.config = this.loadConfig();
    this.notifyListeners();
  }

  /**
   * 添加配置变更监听器
   */
  public addListener(listener: (config: UnifiedDatabaseConfig) => void): void {
    this.listeners.push(listener);
  }

  /**
   * 移除配置变更监听器
   */
  public removeListener(listener: (config: UnifiedDatabaseConfig) => void): void {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    const configCopy = { ...this.config };
    for (const listener of this.listeners) {
      try {
        listener(configCopy);
      } catch (error) {
        console.error('Error in config change listener:', error);
      }
    }
  }

  /**
   * 导出当前配置为JSON
   */
  public exportToJSON(): string {
    return JSON.stringify(this.config, null, 2);
  }

  /**
   * 导出当前配置为YAML
   */
  public exportToYAML(): string {
    return yaml.dump(this.config);
  }

  /**
   * 生成配置文档
   */
  public generateDocumentation(): string {
    let doc = '# 数据库配置文档\n\n';
    doc += `生成时间: ${new Date().toISOString()}\n\n`;

    doc += '## 配置源\n\n';
    for (const source of this.sources) {
      doc += `- **${source.source}**`;
      if (source.path) {
        doc += ` (${source.path})`;
      }
      doc += ` - ${source.timestamp.toISOString()}\n`;
    }
    doc += '\n';

    doc += '## 当前配置\n\n';
    doc += '```yaml\n';
    doc += yaml.dump(this.config);
    doc += '```\n';

    return doc;
  }
}

// 导出默认配置管理器实例
export const unifiedConfigManager = UnifiedConfigManager.getInstance();