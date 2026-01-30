import { MigrationManager } from '../migrations/migration-manager';
import { connectionManager } from '../config/connection';
import path from 'path';
import fs from 'fs';

describe('迁移系统测试', () => {
  let migrationManager: MigrationManager;
  const testMigrationsDir = path.join(__dirname, '../migrations/test-scripts');

  beforeAll(async () => {
    // 创建测试迁移目录
    if (!fs.existsSync(testMigrationsDir)) {
      fs.mkdirSync(testMigrationsDir, { recursive: true });
    }

    // 创建自定义配置的迁移管理器
    migrationManager = new MigrationManager({
      migrationTableName: 'test_migrations',
      migrationsDirectory: testMigrationsDir,
      autoRollbackOnFailure: false,
      checkOnStartup: false,
      verboseLogging: false
    });

    // 初始化迁移表
    await migrationManager.initialize();
  });

  afterAll(async () => {
    // 清理测试迁移表
    const db = await connectionManager.getConnection();
    try {
      await db.run('DROP TABLE IF EXISTS test_migrations');
    } finally {
      await db.close();
    }

    // 清理测试迁移脚本
    if (fs.existsSync(testMigrationsDir)) {
      const files = fs.readdirSync(testMigrationsDir);
      for (const file of files) {
        fs.unlinkSync(path.join(testMigrationsDir, file));
      }
      fs.rmdirSync(testMigrationsDir);
    }

    await connectionManager.closeAllConnections();
  });

  beforeEach(async () => {
    // 清理迁移记录
    const db = await connectionManager.getConnection();
    try {
      await db.run('DELETE FROM test_migrations');
    } finally {
      await db.close();
    }
  });

  describe('MigrationManager', () => {
    test('应该创建迁移表', async () => {
      const db = await connectionManager.getConnection();
      try {
        const tableInfo = await db.all(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='test_migrations'"
        );
        expect(tableInfo.length).toBe(1);
      } finally {
        await db.close();
      }
    });

    test('应该加载迁移脚本', async () => {
      // 创建测试迁移脚本
      const testMigration = `
        export default {
          version: 100,
          description: '测试迁移',
          async up(db) {
            await db.run('CREATE TABLE IF NOT EXISTS test_table (id INTEGER PRIMARY KEY)');
          },
          async down(db) {
            await db.run('DROP TABLE IF EXISTS test_table');
          }
        };
      `;

      fs.writeFileSync(
        path.join(testMigrationsDir, '100_test_migration.ts'),
        testMigration,
        'utf8'
      );

      const migrations = await migrationManager.loadMigrations();
      expect(migrations.length).toBe(1);
      expect(migrations[0].version).toBe(100);
      expect(migrations[0].description).toBe('测试迁移');
    });

    test('应该验证迁移脚本', async () => {
      // 测试有效迁移脚本
      const validMigration = {
        version: 101,
        description: '有效迁移',
        async up(db: any) {},
        async down(db: any) {}
      };

      // @ts-ignore - 访问私有方法
      const isValid = migrationManager.validateMigrationScript(validMigration);
      expect(isValid).toBe(true);

      // 测试无效迁移脚本（缺少version）
      const invalidMigration1 = {
        description: '无效迁移',
        async up(db: any) {},
        async down(db: any) {}
      };

      // @ts-ignore
      const isValid1 = migrationManager.validateMigrationScript(invalidMigration1 as any);
      expect(isValid1).toBe(false);

      // 测试无效迁移脚本（缺少description）
      const invalidMigration2 = {
        version: 102,
        async up(db: any) {},
        async down(db: any) {}
      };

      // @ts-ignore
      const isValid2 = migrationManager.validateMigrationScript(invalidMigration2 as any);
      expect(isValid2).toBe(false);
    });

    test('应该获取迁移统计', async () => {
      const stats = await migrationManager.getStats();
      expect(stats).toEqual({
        totalMigrations: 0,
        completedMigrations: 0,
        pendingMigrations: 0,
        failedMigrations: 0,
        lastMigrationTime: null,
        currentVersion: 0,
        latestVersion: 0
      });
    });

    test('应该创建迁移计划', async () => {
      // 创建测试迁移脚本
      const testMigration = `
        export default {
          version: 200,
          description: '测试迁移计划',
          async up(db) {
            await db.run('CREATE TABLE IF NOT EXISTS test_plan (id INTEGER PRIMARY KEY)');
          },
          async down(db) {
            await db.run('DROP TABLE IF EXISTS test_plan');
          }
        };
      `;

      fs.writeFileSync(
        path.join(testMigrationsDir, '200_test_plan.ts'),
        testMigration,
        'utf8'
      );

      const plan = await migrationManager.createMigrationPlan();
      expect(plan.migrationsToRun.length).toBe(1);
      expect(plan.migrationsToRun[0].version).toBe(200);
      expect(plan.isExecutable).toBe(true);
    });

    test('应该执行迁移', async () => {
      // 创建测试迁移脚本
      const testMigration = `
        export default {
          version: 300,
          description: '测试执行迁移',
          async up(db) {
            await db.run('CREATE TABLE IF NOT EXISTS test_execute (id INTEGER PRIMARY KEY, name TEXT)');
          },
          async down(db) {
            await db.run('DROP TABLE IF EXISTS test_execute');
          }
        };
      `;

      fs.writeFileSync(
        path.join(testMigrationsDir, '300_test_execute.ts'),
        testMigration,
        'utf8'
      );

      const result = await migrationManager.migrate();
      expect(result.applied).toBe(1);
      expect(result.rolledBack).toBe(0);
      expect(result.errors).toHaveLength(0);

      // 验证表是否创建
      const db = await connectionManager.getConnection();
      try {
        const tableInfo = await db.all(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='test_execute'"
        );
        expect(tableInfo.length).toBe(1);
      } finally {
        await db.close();
      }

      // 验证迁移记录
      const records = await migrationManager.getMigrationRecords();
      expect(records.length).toBe(1);
      expect(records[0].version).toBe(300);
      expect(records[0].status).toBe('completed');
    });

    test('应该回滚迁移', async () => {
      // 创建测试迁移脚本
      const testMigration = `
        export default {
          version: 400,
          description: '测试回滚迁移',
          async up(db) {
            await db.run('CREATE TABLE IF NOT EXISTS test_rollback (id INTEGER PRIMARY KEY)');
          },
          async down(db) {
            await db.run('DROP TABLE IF EXISTS test_rollback');
          }
        };
      `;

      fs.writeFileSync(
        path.join(testMigrationsDir, '400_test_rollback.ts'),
        testMigration,
        'utf8'
      );

      // 执行迁移
      await migrationManager.migrate();

      // 回滚迁移
      const result = await migrationManager.rollback([400]);
      expect(result.rolledBack).toBe(1);
      expect(result.errors).toHaveLength(0);

      // 验证表是否删除
      const db = await connectionManager.getConnection();
      try {
        const tableInfo = await db.all(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='test_rollback'"
        );
        expect(tableInfo.length).toBe(0);
      } finally {
        await db.close();
      }

      // 验证迁移记录
      const records = await migrationManager.getMigrationRecords();
      const migrationRecord = records.find(r => r.version === 400);
      expect(migrationRecord?.status).toBe('rolled_back');
    });

    test('应该验证迁移状态', async () => {
      const validation = await migrationManager.validate();
      expect(validation.isValid).toBe(true);
      expect(validation.issues).toHaveLength(0);
    });

    test('应该生成迁移模板', async () => {
      const filepath = await migrationManager.createMigrationTemplate('测试模板生成');
      expect(filepath).toBeDefined();
      expect(fs.existsSync(filepath)).toBe(true);

      // 验证模板内容
      const content = fs.readFileSync(filepath, 'utf8');
      expect(content).toContain('测试模板生成');
      expect(content).toContain('version: 1');
    });

    test('应该处理迁移失败', async () => {
      // 创建会失败的迁移脚本
      const failingMigration = `
        export default {
          version: 500,
          description: '测试失败迁移',
          async up(db) {
            throw new Error('迁移失败测试');
          },
          async down(db) {
            await db.run('DROP TABLE IF EXISTS non_existent_table');
          }
        };
      `;

      fs.writeFileSync(
        path.join(testMigrationsDir, '500_test_fail.ts'),
        failingMigration,
        'utf8'
      );

      try {
        await migrationManager.migrate();
        fail('应该抛出错误');
      } catch (error) {
        expect(error).toBeDefined();
      }

      // 验证迁移记录状态为失败
      const records = await migrationManager.getMigrationRecords();
      const failedRecord = records.find(r => r.version === 500);
      expect(failedRecord?.status).toBe('failed');
      expect(failedRecord?.error_message).toContain('迁移失败测试');
    });

    test('应该处理依赖冲突', async () => {
      // 创建有依赖的迁移脚本
      const dependentMigration = `
        export default {
          version: 600,
          description: '有依赖的迁移',
          async up(db) {
            await db.run('CREATE TABLE IF NOT EXISTS test_dependent (id INTEGER PRIMARY KEY)');
          },
          async down(db) {
            await db.run('DROP TABLE IF EXISTS test_dependent');
          },
          dependencies: [999] // 不存在的依赖
        };
      `;

      fs.writeFileSync(
        path.join(testMigrationsDir, '600_test_dependent.ts'),
        dependentMigration,
        'utf8'
      );

      const plan = await migrationManager.createMigrationPlan();
      expect(plan.isExecutable).toBe(false);
      expect(plan.dependencyConflicts).toHaveLength(1);
      expect(plan.dependencyConflicts[0].migration.version).toBe(600);
      expect(plan.dependencyConflicts[0].missingDependencies).toContain(999);
    });

    test('应该重置迁移状态', async () => {
      // 创建测试迁移脚本并执行
      const testMigration = `
        export default {
          version: 700,
          description: '测试重置',
          async up(db) {
            await db.run('CREATE TABLE IF NOT EXISTS test_reset (id INTEGER PRIMARY KEY)');
          },
          async down(db) {
            await db.run('DROP TABLE IF EXISTS test_reset');
          }
        };
      `;

      fs.writeFileSync(
        path.join(testMigrationsDir, '700_test_reset.ts'),
        testMigration,
        'utf8'
      );

      await migrationManager.migrate();

      // 重置迁移状态
      await migrationManager.reset();

      // 验证迁移记录是否被清除
      const records = await migrationManager.getMigrationRecords();
      expect(records).toHaveLength(0);
    });
  });

  describe('数据迁移工具', () => {
    // 数据迁移工具测试可以在这里添加
    test('占位测试', () => {
      expect(true).toBe(true);
    });
  });
});