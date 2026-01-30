import { UnifiedConfigManager } from '../config/unified-config';
import { ConfigSource } from '../config/config-types';
import fs from 'fs';
import path from 'path';

// 临时测试目录
const TEST_CONFIG_DIR = path.join(__dirname, '..', '..', '..', 'test-config-temp');

describe('统一配置管理器测试', () => {
  beforeAll(() => {
    // 创建测试配置目录
    if (!fs.existsSync(TEST_CONFIG_DIR)) {
      fs.mkdirSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  afterAll(() => {
    // 清理测试配置目录
    if (fs.existsSync(TEST_CONFIG_DIR)) {
      fs.rmSync(TEST_CONFIG_DIR, { recursive: true });
    }
  });

  beforeEach(() => {
    // 清除环境变量
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('DATABASE_') || key.startsWith('BACKUP_') ||
          key.startsWith('MIGRATION_') || key.startsWith('PERFORMANCE_') ||
          key.startsWith('OPTIMIZATION_') || key === 'NODE_ENV' ||
          key === 'LOG_LEVEL' || key === 'DEBUG_MODE' ||
          key === 'APP_NAME' || key === 'APP_VERSION') {
        delete process.env[key];
      }
    });

    // 重置配置管理器实例（通过私有方法）
    // 注意：由于单例模式，我们无法直接重置实例，所以测试中我们将创建新的实例
  });

  describe('默认配置', () => {
    test('应该加载默认配置', () => {
      // 创建新的配置管理器实例（避免单例影响）
      const manager = UnifiedConfigManager.getInstance();
      const config = manager.getConfig();

      expect(config.database.databasePath).toBeDefined();
      expect(config.database.databasePath).toContain('everyday_news.db');

      expect(config.backup.backupDirectory).toBeDefined();
      expect(config.migration.migrationTableName).toBe('schema_migrations');
      expect(config.performance.enabled).toBe(true);
      expect(config.optimization.autoOptimizationEnabled).toBe(true);
      expect(config.general.environment).toBe('development');
    });

    test('应该返回配置的深拷贝', () => {
      const manager = UnifiedConfigManager.getInstance();
      const config1 = manager.getConfig();
      const config2 = manager.getConfig();

      expect(config1).not.toBe(config2); // 不是同一个引用
      expect(config1.database).not.toBe(config2.database);
      expect(config1.backup).not.toBe(config2.backup);
    });
  });

  describe('环境变量配置', () => {
    test('应该从环境变量加载数据库配置', () => {
      process.env.DATABASE_PATH = '/test/path/database.db';
      process.env.MAX_CONNECTIONS = '50';
      process.env.DATABASE_TIMEOUT = '10000';

      // 创建新的管理器实例以重新加载配置
      // 由于单例模式，我们直接测试统一配置管理器
      // 在实际使用中，环境变量会在应用启动时加载
      const manager = UnifiedConfigManager.getInstance();
      // 重新加载配置
      (manager as any).reload();

      const config = manager.getConfig();
      expect(config.database.databasePath).toBe('/test/path/database.db');
      expect(config.database.maxConnections).toBe(50);
      expect(config.database.timeout).toBe(10000);
    });

    test('应该从环境变量加载备份配置', () => {
      process.env.BACKUP_DIRECTORY = '/test/backups';
      process.env.BACKUP_RETENTION_DAYS = '14';
      process.env.BACKUP_COMPRESS = 'false';

      const manager = UnifiedConfigManager.getInstance();
      (manager as any).reload();

      const config = manager.getConfig();
      expect(config.backup.backupDirectory).toBe('/test/backups');
      expect(config.backup.retentionDays).toBe(14);
      expect(config.backup.compress).toBe(false);
    });

    test('应该从环境变量加载性能监控配置', () => {
      process.env.PERFORMANCE_ENABLED = 'false';
      process.env.PERFORMANCE_SLOW_QUERY_THRESHOLD = '2000';
      process.env.PERFORMANCE_QUERY_CACHE_ENABLED = 'false';

      const manager = UnifiedConfigManager.getInstance();
      (manager as any).reload();

      const config = manager.getConfig();
      expect(config.performance.enabled).toBe(false);
      expect(config.performance.slowQueryThreshold).toBe(2000);
      expect(config.performance.queryCacheEnabled).toBe(false);
    });
  });

  describe('配置文件加载', () => {
    test('应该从YAML配置文件加载配置', () => {
      const yamlConfig = `
database:
  databasePath: ./test/data/test.db
  maxConnections: 5
backup:
  backupDirectory: ./test/backups
  retentionDays: 3
general:
  environment: testing
  logLevel: debug
`;

      const configFile = path.join(TEST_CONFIG_DIR, 'test-config.yaml');
      fs.writeFileSync(configFile, yamlConfig);

      // 设置环境变量指向测试配置文件
      process.env.CONFIG_DIR = TEST_CONFIG_DIR;

      const manager = UnifiedConfigManager.getInstance();
      (manager as any).reload();

      const config = manager.getConfig();
      expect(config.database.databasePath).toBe('./test/data/test.db');
      expect(config.database.maxConnections).toBe(5);
      expect(config.backup.retentionDays).toBe(3);
      expect(config.general.environment).toBe('testing');
      expect(config.general.logLevel).toBe('debug');

      // 清理
      delete process.env.CONFIG_DIR;
      fs.unlinkSync(configFile);
    });

    test('应该从JSON配置文件加载配置', () => {
      const jsonConfig = {
        database: {
          databasePath: './test/data/json-test.db',
          timeout: 15000
        },
        backup: {
          backupType: 'incremental' as const,
          maxBackupFiles: 10
        }
      };

      const configFile = path.join(TEST_CONFIG_DIR, 'database.json');
      fs.writeFileSync(configFile, JSON.stringify(jsonConfig));

      // 临时设置当前目录为测试目录
      const originalCwd = process.cwd();
      process.chdir(TEST_CONFIG_DIR);

      const manager = UnifiedConfigManager.getInstance();
      (manager as any).reload();

      const config = manager.getConfig();
      expect(config.database.databasePath).toBe('./test/data/json-test.db');
      expect(config.database.timeout).toBe(15000);
      expect(config.backup.backupType).toBe('incremental');
      expect(config.backup.maxBackupFiles).toBe(10);

      // 恢复原始目录
      process.chdir(originalCwd);
      fs.unlinkSync(configFile);
    });
  });

  describe('配置源管理', () => {
    test('应该记录配置源信息', () => {
      const manager = UnifiedConfigManager.getInstance();
      const sources = manager.getSources();

      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);

      // 至少应该有默认配置源
      const defaultSource = sources.find(s => s.source === ConfigSource.DEFAULT);
      expect(defaultSource).toBeDefined();
      expect(defaultSource?.timestamp).toBeInstanceOf(Date);
      expect(defaultSource?.values).toBeDefined();
    });

    test('应该按正确优先级合并配置', () => {
      // 1. 设置环境变量（高优先级）
      process.env.DATABASE_PATH = '/env/path/db.db';
      process.env.MAX_CONNECTIONS = '99';

      // 2. 创建配置文件（中优先级）
      const yamlConfig = `
database:
  databasePath: /file/path/db.db
  timeout: 7777
backup:
  retentionDays: 21
`;
      const configFile = path.join(TEST_CONFIG_DIR, 'priority-test.yaml');
      fs.writeFileSync(configFile, yamlConfig);
      process.env.CONFIG_DIR = TEST_CONFIG_DIR;

      const manager = UnifiedConfigManager.getInstance();
      (manager as any).reload();

      const config = manager.getConfig();
      // 环境变量应覆盖配置文件
      expect(config.database.databasePath).toBe('/env/path/db.db'); // 来自环境变量
      expect(config.database.maxConnections).toBe(99); // 来自环境变量
      expect(config.database.timeout).toBe(7777); // 来自配置文件
      expect(config.backup.retentionDays).toBe(21); // 来自配置文件

      // 清理
      delete process.env.CONFIG_DIR;
      fs.unlinkSync(configFile);
    });
  });

  describe('配置验证', () => {
    test('应该验证有效配置', () => {
      const manager = UnifiedConfigManager.getInstance();
      const config = manager.getConfig();

      // 验证方法在内部调用，如果没有抛出错误则通过
      expect(() => {
        (manager as any).validateConfig(config);
      }).not.toThrow();
    });

    test('应该检测无效配置', () => {
      const manager = UnifiedConfigManager.getInstance();

      const invalidConfig = {
        database: {
          databasePath: '', // 空路径
          maxConnections: 0 // 无效值
        },
        backup: {
          retentionDays: -1 // 无效值
        }
      };

      const validationResult = (manager as any).validateConfig(invalidConfig);
      expect(validationResult.valid).toBe(false);
      expect(validationResult.errors.length).toBeGreaterThan(0);

      const errorMessages = validationResult.errors.map((e: any) => e.message);
      expect(errorMessages).toContain('Database path is required');
      expect(errorMessages).toContain('Max connections must be at least 1');
      expect(errorMessages).toContain('Retention days must be at least 1');
    });
  });

  describe('运行时配置更新', () => {
    test('应该允许运行时更新配置', () => {
      const manager = UnifiedConfigManager.getInstance();
      const initialConfig = manager.getConfig();

      // 更新配置
      manager.updateConfig({
        database: {
          maxConnections: 999
        }
      });

      const updatedConfig = manager.getConfig();
      expect(updatedConfig.database.maxConnections).toBe(999);

      // 其他配置应保持不变
      expect(updatedConfig.database.databasePath).toBe(initialConfig.database.databasePath);
      expect(updatedConfig.backup.backupType).toBe(initialConfig.backup.backupType);
    });

    test('应该记录运行时配置源', () => {
      const manager = UnifiedConfigManager.getInstance();
      const initialSourceCount = manager.getSources().length;

      manager.updateConfig({
        database: { timeout: 12345 }
      });

      const sources = manager.getSources();
      expect(sources.length).toBe(initialSourceCount + 1);

      const runtimeSource = sources[sources.length - 1];
      expect(runtimeSource.source).toBe(ConfigSource.RUNTIME);
      expect(runtimeSource.timestamp).toBeInstanceOf(Date);
      expect(runtimeSource.values.database?.timeout).toBe(12345);
    });
  });

  describe('特定配置获取', () => {
    test('应该获取数据库配置', () => {
      const manager = UnifiedConfigManager.getInstance();
      const dbConfig = manager.getDatabaseConfig();
      const fullConfig = manager.getConfig();

      expect(dbConfig.databasePath).toBe(fullConfig.database.databasePath);
      expect(dbConfig.maxConnections).toBe(fullConfig.database.maxConnections);
      expect(dbConfig.timeout).toBe(fullConfig.database.timeout);
    });

    test('应该获取备份配置', () => {
      const manager = UnifiedConfigManager.getInstance();
      const backupConfig = manager.getBackupConfig();
      const fullConfig = manager.getConfig();

      expect(backupConfig.backupDirectory).toBe(fullConfig.backup.backupDirectory);
      expect(backupConfig.retentionDays).toBe(fullConfig.backup.retentionDays);
      expect(backupConfig.backupType).toBe(fullConfig.backup.backupType);
    });

    test('应该获取迁移配置', () => {
      const manager = UnifiedConfigManager.getInstance();
      const migrationConfig = manager.getMigrationConfig();
      const fullConfig = manager.getConfig();

      expect(migrationConfig.migrationTableName).toBe(fullConfig.migration.migrationTableName);
      expect(migrationConfig.migrationsDirectory).toBe(fullConfig.migration.migrationsDirectory);
      expect(migrationConfig.autoRollbackOnFailure).toBe(fullConfig.migration.autoRollbackOnFailure);
    });

    test('应该获取性能监控配置', () => {
      const manager = UnifiedConfigManager.getInstance();
      const performanceConfig = manager.getPerformanceConfig();
      const fullConfig = manager.getConfig();

      expect(performanceConfig.enabled).toBe(fullConfig.performance.enabled);
      expect(performanceConfig.slowQueryThreshold).toBe(fullConfig.performance.slowQueryThreshold);
      expect(performanceConfig.queryCacheEnabled).toBe(fullConfig.performance.queryCacheEnabled);
    });

    test('应该获取优化配置', () => {
      const manager = UnifiedConfigManager.getInstance();
      const optimizationConfig = manager.getOptimizationConfig();
      const fullConfig = manager.getConfig();

      expect(optimizationConfig.autoOptimizationEnabled).toBe(fullConfig.optimization.autoOptimizationEnabled);
      expect(optimizationConfig.optimizationCheckInterval).toBe(fullConfig.optimization.optimizationCheckInterval);
      expect(optimizationConfig.autoVacuumThreshold).toBe(fullConfig.optimization.autoVacuumThreshold);
    });
  });

  describe('配置导出', () => {
    test('应该导出配置为JSON', () => {
      const manager = UnifiedConfigManager.getInstance();
      const json = manager.exportToJSON();

      expect(typeof json).toBe('string');

      const parsed = JSON.parse(json);
      expect(parsed.database).toBeDefined();
      expect(parsed.backup).toBeDefined();
      expect(parsed.migration).toBeDefined();
      expect(parsed.performance).toBeDefined();
      expect(parsed.optimization).toBeDefined();
      expect(parsed.general).toBeDefined();
    });

    test('应该导出配置为YAML', () => {
      const manager = UnifiedConfigManager.getInstance();
      const yamlOutput = manager.exportToYAML();

      expect(typeof yamlOutput).toBe('string');
      expect(yamlOutput).toContain('database:');
      expect(yamlOutput).toContain('backup:');
      expect(yamlOutput).toContain('migration:');
    });

    test('应该生成配置文档', () => {
      const manager = UnifiedConfigManager.getInstance();
      const documentation = manager.generateDocumentation();

      expect(typeof documentation).toBe('string');
      expect(documentation).toContain('# 数据库配置文档');
      expect(documentation).toContain('配置源');
      expect(documentation).toContain('当前配置');
    });
  });

  describe('配置监听器', () => {
    test('应该添加和触发配置变更监听器', () => {
      const manager = UnifiedConfigManager.getInstance();
      let listenerCalled = false;
      let receivedConfig: any = null;

      const listener = (config: any) => {
        listenerCalled = true;
        receivedConfig = config;
      };

      manager.addListener(listener);

      // 触发配置变更
      manager.updateConfig({
        database: { timeout: 9999 }
      });

      expect(listenerCalled).toBe(true);
      expect(receivedConfig).toBeDefined();
      expect(receivedConfig.database.timeout).toBe(9999);

      // 移除监听器
      manager.removeListener(listener);
    });
  });
});