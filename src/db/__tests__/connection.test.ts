import { connectionManager } from '../config/connection';
import { configManager } from '../config';

describe('数据库连接测试', () => {
  beforeAll(async () => {
    // 确保数据库已初始化
    const config = configManager.getConfig();
    console.log(`测试数据库路径: ${config.databasePath}`);
  });

  afterAll(async () => {
    // 清理所有连接
    await connectionManager.closeAllConnections();
  });

  describe('连接管理', () => {
    test('应该成功获取数据库连接', async () => {
      const db = await connectionManager.getConnection();

      expect(db).toBeDefined();
      expect(typeof db.run).toBe('function');
      expect(typeof db.get).toBe('function');
      expect(typeof db.all).toBe('function');

      await db.close();
    });

    test('应该成功获取只读连接', async () => {
      const db = await connectionManager.getReadOnlyConnection();

      expect(db).toBeDefined();

      // 测试只读连接
      const result = await db.get('SELECT 1 as test');
      expect(result?.test).toBe(1);

      await db.close();
    });

    test('应该正确管理连接状态', async () => {
      const initialStatus = connectionManager.getStatus();

      const db = await connectionManager.getConnection();
      const statusAfterConnection = connectionManager.getStatus();

      expect(statusAfterConnection.activeConnections).toBe(initialStatus.activeConnections + 1);
      expect(statusAfterConnection.lastActivity).not.toBeNull();

      await db.close();
      const statusAfterClose = connectionManager.getStatus();

      expect(statusAfterClose.activeConnections).toBe(initialStatus.activeConnections);
    });

    test('应该通过健康检查', async () => {
      const isHealthy = await connectionManager.healthCheck();

      expect(isHealthy).toBe(true);

      const status = connectionManager.getStatus();
      expect(status.isConnected).toBe(true);
      expect(status.lastError).toBeNull();
    });
  });

  describe('事务管理', () => {
    test('应该成功执行事务', async () => {
      const result = await connectionManager.withTransaction(async (db) => {
        // 在事务中插入测试数据
        const insertResult = await db.run(
          'INSERT INTO platforms (name, icon) VALUES (?, ?)',
          'test_platform',
          '🔧'
        );

        // 验证插入
        const platform = await db.get(
          'SELECT * FROM platforms WHERE id = ?',
          insertResult.lastID
        );

        return platform;
      });

      expect(result).toBeDefined();
      expect(result.name).toBe('test_platform');
      expect(result.icon).toBe('🔧');
    });

    test('应该在错误时回滚事务', async () => {
      const initialCount = await getPlatformCount();

      await expect(
        connectionManager.withTransaction(async (db) => {
          // 插入第一条记录
          await db.run(
            'INSERT INTO platforms (name, icon) VALUES (?, ?)',
            'test_platform_1',
            '🔧'
          );

          // 抛出错误，触发回滚
          throw new Error('测试事务回滚');
        })
      ).rejects.toThrow('测试事务回滚');

      const finalCount = await getPlatformCount();
      expect(finalCount).toBe(initialCount); // 应该回滚，数量不变
    });

    test('应该成功执行批量操作', async () => {
      const initialCount = await getPlatformCount();

      const results = await connectionManager.batchOperations([
        async (db) => {
          const result = await db.run(
            'INSERT INTO platforms (name, icon) VALUES (?, ?)',
            'batch_test_1',
            '🔧'
          );
          return result.lastID;
        },
        async (db) => {
          const result = await db.run(
            'INSERT INTO platforms (name, icon) VALUES (?, ?)',
            'batch_test_2',
            '🔧'
          );
          return result.lastID;
        }
      ]);

      expect(results).toHaveLength(2);
      expect(results[0]).toBeGreaterThan(0);
      expect(results[1]).toBeGreaterThan(0);

      const finalCount = await getPlatformCount();
      expect(finalCount).toBe(initialCount + 2);
    });
  });

  describe('数据库统计', () => {
    test('应该获取数据库统计信息', async () => {
      const stats = await connectionManager.getDatabaseStats();

      expect(stats).toBeDefined();
      expect(typeof stats.tableCount).toBe('number');
      expect(typeof stats.totalRows).toBe('number');
      expect(typeof stats.databaseSize).toBe('number');

      expect(stats.tableCount).toBeGreaterThan(0);
      expect(stats.databaseSize).toBeGreaterThan(0);
    });

    test('应该获取连接状态', () => {
      const status = connectionManager.getStatus();

      expect(status).toBeDefined();
      expect(typeof status.isConnected).toBe('boolean');
      expect(typeof status.activeConnections).toBe('number');
      expect(typeof status.connectionCount).toBe('number');
      expect(typeof status.databaseSize).toBe('number');
    });
  });

  describe('错误处理', () => {
    test('应该处理无效的SQL', async () => {
      const db = await connectionManager.getConnection();

      await expect(
        db.run('INVALID SQL STATEMENT')
      ).rejects.toThrow();

      await db.close();
    });

    test('应该处理连接错误', async () => {
      // 临时修改配置使用无效路径
      const originalConfig = configManager.getConfig();
      configManager.updateConfig({ databasePath: '/invalid/path/database.db' });

      await expect(
        connectionManager.getConnection()
      ).rejects.toThrow();

      // 恢复配置
      configManager.updateConfig(originalConfig);
    });
  });

  describe('连接池', () => {
    test('应该关闭所有连接', async () => {
      // 创建多个连接
      const connections = await Promise.all([
        connectionManager.getConnection(),
        connectionManager.getConnection(),
        connectionManager.getConnection()
      ]);

      const statusBeforeClose = connectionManager.getStatus();
      expect(statusBeforeClose.activeConnections).toBe(3);

      // 关闭所有连接
      await connectionManager.closeAllConnections();

      const statusAfterClose = connectionManager.getStatus();
      expect(statusAfterClose.activeConnections).toBe(0);
      expect(statusAfterClose.connectionCount).toBe(0);

      // 清理连接
      for (const db of connections) {
        try {
          await db.close();
        } catch (error) {
          // 忽略已关闭的连接
        }
      }
    });
  });
});

// 辅助函数：获取平台数量
async function getPlatformCount(): Promise<number> {
  const db = await connectionManager.getConnection();

  try {
    const result = await db.get('SELECT COUNT(*) as count FROM platforms');
    return result?.count || 0;
  } finally {
    await db.close();
  }
}