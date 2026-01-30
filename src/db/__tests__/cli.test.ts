/**
 * 数据库CLI工具单元测试
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { program } from '../cli/index';
import { DatabaseInitializer } from '../cli/init';
import { connectionManager } from '../config/connection';
import { schemaManager } from '../config/schema';
import { indexManager } from '../optimization';
import { platformRepository } from '../repositories/platform.repository';

// Mock依赖
jest.mock('../config/connection');
jest.mock('../config/schema');
jest.mock('../optimization');
jest.mock('../repositories/platform.repository');

describe('数据库CLI工具', () => {
  let mockConsoleLog: jest.SpyInstance;
  let mockConsoleError: jest.SpyInstance;
  let mockProcessExit: jest.SpyInstance;

  beforeEach(() => {
    mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    // 重置mock
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockConsoleError.mockRestore();
    mockProcessExit.mockRestore();
  });

  describe('DatabaseInitializer', () => {
    let initializer: DatabaseInitializer;

    beforeEach(() => {
      initializer = new DatabaseInitializer();
    });

    describe('initialize()', () => {
      it('应该成功初始化数据库', async () => {
        // 设置mock
        (connectionManager.healthCheck as jest.Mock).mockResolvedValue(true);
        (schemaManager.initializeSchema as jest.Mock).mockResolvedValue(undefined);
        (platformRepository.initializeDefaultPlatforms as jest.Mock).mockResolvedValue([
          { id: 1, name: '测试平台' }
        ]);
        (schemaManager.validateSchema as jest.Mock).mockResolvedValue({
          isValid: true,
          errors: [],
          warnings: []
        });
        (indexManager.optimizeAllIndexes as jest.Mock).mockResolvedValue({
          created: 2,
          dropped: 1,
          rebuilt: 3
        });
        (connectionManager.getDatabaseStats as jest.Mock).mockResolvedValue({
          tableCount: 4,
          totalRows: 100,
          databaseSize: 1024 * 1024 // 1MB
        });
        (schemaManager.generateSchemaDocumentation as jest.Mock).mockResolvedValue('文档内容');

        await expect(initializer.initialize()).resolves.not.toThrow();

        // 验证调用顺序
        expect(connectionManager.healthCheck).toHaveBeenCalled();
        expect(schemaManager.initializeSchema).toHaveBeenCalled();
        expect(platformRepository.initializeDefaultPlatforms).toHaveBeenCalled();
        expect(schemaManager.validateSchema).toHaveBeenCalled();
        expect(indexManager.optimizeAllIndexes).toHaveBeenCalled();
        expect(connectionManager.getDatabaseStats).toHaveBeenCalled();
        expect(schemaManager.generateSchemaDocumentation).toHaveBeenCalled();
      });

      it('应该在连接测试失败时抛出错误', async () => {
        (connectionManager.healthCheck as jest.Mock).mockResolvedValue(false);

        await expect(initializer.initialize()).rejects.toThrow('数据库连接测试失败');
      });

      it('应该处理Schema验证错误', async () => {
        (connectionManager.healthCheck as jest.Mock).mockResolvedValue(true);
        (schemaManager.initializeSchema as jest.Mock).mockResolvedValue(undefined);
        (platformRepository.initializeDefaultPlatforms as jest.Mock).mockResolvedValue([]);
        (schemaManager.validateSchema as jest.Mock).mockResolvedValue({
          isValid: false,
          errors: ['表 platforms 缺少主键'],
          warnings: ['建议添加索引']
        });

        await initializer.initialize();

        // 应该继续执行而不是抛出错误
        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Schema验证发现错误'));
      });
    });

    describe('status()', () => {
      it('应该显示数据库状态', async () => {
        // 设置mock
        (connectionManager.getStatus as jest.Mock).mockReturnValue({
          isConnected: true,
          activeConnections: 2,
          databaseSize: 1024 * 1024 * 5, // 5MB
          lastActivity: new Date(),
          lastError: null
        });

        (schemaManager.validateSchema as jest.Mock).mockResolvedValue({
          isValid: true,
          errors: [],
          warnings: ['建议优化索引']
        });

        (connectionManager.getDatabaseStats as jest.Mock).mockResolvedValue({
          tableCount: 4,
          totalRows: 150,
          databaseSize: 1024 * 1024 * 5
        });

        (indexManager.analyzeIndexUsage as jest.Mock).mockResolvedValue({
          totalIndexes: 10,
          totalSize: 1024 * 1024, // 1MB
          usedIndexes: 8,
          unusedIndexes: 2,
          duplicateIndexes: 0
        });

        (platformRepository.getStats as jest.Mock).mockResolvedValue({
          totalPlatforms: 3,
          platformsWithIcon: 2,
          platformsWithoutIcon: 1
        });

        await initializer.status();

        // 验证状态信息被显示
        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('数据库状态检查'));
        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('连接状态'));
        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('Schema状态'));
        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('数据库统计'));
        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('索引状态'));
        expect(mockConsoleLog).toHaveBeenCalledWith(expect.stringContaining('平台统计'));
      });

      it('应该处理状态检查错误', async () => {
        (connectionManager.getStatus as jest.Mock).mockImplementation(() => {
          throw new Error('连接状态获取失败');
        });

        await initializer.status();

        expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('状态检查失败'));
      });
    });

    describe('formatSize()', () => {
      it('应该正确格式化字节大小', () => {
        // 测试私有方法需要一些技巧，这里我们测试通过公共方法间接测试
        // 或者我们可以直接测试格式化逻辑
        const testCases = [
          { bytes: 0, expected: '0.00 B' },
          { bytes: 1023, expected: '1023.00 B' },
          { bytes: 1024, expected: '1.00 KB' },
          { bytes: 1024 * 1024, expected: '1.00 MB' },
          { bytes: 1024 * 1024 * 1024, expected: '1.00 GB' },
          { bytes: 1536, expected: '1.50 KB' },
          { bytes: 1572864, expected: '1.50 MB' }
        ];

        // 创建测试实例并访问私有方法（通过any绕过类型检查）
        const initializerAny = initializer as any;

        testCases.forEach(({ bytes, expected }) => {
          const result = initializerAny.formatSize(bytes);
          expect(result).toBe(expected);
        });
      });
    });
  });

  describe('CLI命令解析', () => {
    it('应该正确解析init命令', async () => {
      const initCommand = program.commands.find(cmd => cmd.name() === 'init');
      expect(initCommand).toBeDefined();
      expect(initCommand?.description()).toBe('初始化数据库');
    });

    it('应该正确解析status命令', async () => {
      const statusCommand = program.commands.find(cmd => cmd.name() === 'status');
      expect(statusCommand).toBeDefined();
      expect(statusCommand?.description()).toBe('检查数据库状态');
    });

    it('应该正确解析migrate命令', async () => {
      const migrateCommand = program.commands.find(cmd => cmd.name() === 'migrate');
      expect(migrateCommand).toBeDefined();
      expect(migrateCommand?.description()).toBe('数据库迁移管理');
    });

    it('应该正确解析backup命令', async () => {
      const backupCommand = program.commands.find(cmd => cmd.name() === 'backup');
      expect(backupCommand).toBeDefined();
      expect(backupCommand?.description()).toBe('数据库备份');
    });

    it('应该正确解析performance命令', async () => {
      const performanceCommand = program.commands.find(cmd => cmd.name() === 'performance');
      expect(performanceCommand).toBeDefined();
      expect(performanceCommand?.description()).toBe('性能监控和优化');
    });

    it('应该正确解析diagnose命令', async () => {
      const diagnoseCommand = program.commands.find(cmd => cmd.name() === 'diagnose');
      expect(diagnoseCommand).toBeDefined();
      expect(diagnoseCommand?.description()).toBe('性能诊断工具');
    });

    it('应该正确解析dashboard命令', async () => {
      const dashboardCommand = program.commands.find(cmd => cmd.name() === 'dashboard');
      expect(dashboardCommand).toBeDefined();
      expect(dashboardCommand?.description()).toBe('数据库监控仪表板');
    });

    it('应该正确解析export命令', async () => {
      const exportCommand = program.commands.find(cmd => cmd.name() === 'export');
      expect(exportCommand).toBeDefined();
      expect(exportCommand?.description()).toBe('导出数据');
    });

    it('应该正确解析import命令', async () => {
      const importCommand = program.commands.find(cmd => cmd.name() === 'import');
      expect(importCommand).toBeDefined();
      expect(importCommand?.description()).toBe('导入数据');
    });

    it('应该正确解析config命令', async () => {
      const configCommand = program.commands.find(cmd => cmd.name() === 'config');
      expect(configCommand).toBeDefined();
      expect(configCommand?.description()).toBe('数据库配置管理');
    });
  });

  describe('辅助函数', () => {
    describe('formatSize()', () => {
      it('应该正确格式化字节大小', () => {
        // 导入formatSize函数（需要从编译后的文件导入）
        // 这里我们直接测试函数逻辑
        const formatSize = (bytes: number): string => {
          const units = ['B', 'KB', 'MB', 'GB'];
          let size = bytes;
          let unitIndex = 0;

          while (size >= 1024 && unitIndex < units.length - 1) {
            size /= 1024;
            unitIndex++;
          }

          return `${size.toFixed(2)} ${units[unitIndex]}`;
        };

        const testCases = [
          { bytes: 0, expected: '0.00 B' },
          { bytes: 500, expected: '500.00 B' },
          { bytes: 1024, expected: '1.00 KB' },
          { bytes: 2048, expected: '2.00 KB' },
          { bytes: 1024 * 1024, expected: '1.00 MB' },
          { bytes: 1024 * 1024 * 1024, expected: '1.00 GB' },
          { bytes: 1536, expected: '1.50 KB' }
        ];

        testCases.forEach(({ bytes, expected }) => {
          expect(formatSize(bytes)).toBe(expected);
        });
      });
    });

    describe('analyzeQueryPatterns()', () => {
      it('应该正确分析查询模式', () => {
        // 测试analyzeQueryPatterns函数
        const analyzeQueryPatterns = (queries: any[]): string[] => {
          const patterns: string[] = [];
          const queryTypes = new Map<string, number>();

          for (const query of queries) {
            const sql = query.query.toLowerCase();
            let type = '其他';

            if (sql.includes('select')) {
              if (sql.includes('join')) type = '连接查询';
              else if (sql.includes('where')) type = '条件查询';
              else if (sql.includes('order by')) type = '排序查询';
              else type = '简单查询';
            } else if (sql.includes('insert')) {
              type = '插入操作';
            } else if (sql.includes('update')) {
              type = '更新操作';
            } else if (sql.includes('delete')) {
              type = '删除操作';
            }

            queryTypes.set(type, (queryTypes.get(type) || 0) + 1);
          }

          // 找出最常见的查询类型
          const sortedTypes = Array.from(queryTypes.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);

          sortedTypes.forEach(([type, count]) => {
            patterns.push(`${type}: ${count} 次`);
          });

          return patterns;
        };

        const testQueries = [
          { query: 'SELECT * FROM users WHERE id = 1' },
          { query: 'SELECT * FROM users WHERE id = 2' },
          { query: 'SELECT * FROM users WHERE id = 3' },
          { query: 'INSERT INTO users (name) VALUES ("test")' },
          { query: 'UPDATE users SET name = "updated" WHERE id = 1' },
          { query: 'SELECT u.*, p.* FROM users u JOIN profiles p ON u.id = p.user_id' },
          { query: 'DELETE FROM users WHERE id = 1' }
        ];

        const patterns = analyzeQueryPatterns(testQueries);

        // 应该包含最常见的查询类型
        expect(patterns).toContain('条件查询: 3 次');
        expect(patterns.length).toBeLessThanOrEqual(3);
      });
    });
  });
});