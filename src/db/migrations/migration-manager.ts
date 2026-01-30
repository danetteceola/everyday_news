import { Database } from 'sqlite';
import { connectionManager } from '../config/connection';
import { configManager } from '../config';
import {
  MigrationScript,
  MigrationRecord,
  MigrationStatus,
  MigrationDirection,
  MigrationConfig,
  MigrationStats,
  MigrationPlan,
  MigrationError
} from '../types/migration';
import fs from 'fs';
import path from 'path';

/**
 * 迁移管理器
 */
export class MigrationManager {
  private config: MigrationConfig;

  constructor(config?: Partial<MigrationConfig>) {
    this.config = {
      migrationTableName: process.env.MIGRATION_TABLE_NAME || 'schema_migrations',
      migrationsDirectory: process.env.MIGRATION_DIRECTORY || path.join(__dirname, 'scripts'),
      autoRollbackOnFailure: process.env.MIGRATION_AUTO_ROLLBACK === 'true',
      checkOnStartup: process.env.MIGRATION_CHECK_ON_STARTUP !== 'false',
      verboseLogging: process.env.MIGRATION_VERBOSE_LOGGING === 'true',
      ...config
    };
  }

  /**
   * 初始化迁移系统
   */
  public async initialize(): Promise<void> {
    await this.ensureMigrationTableExists();

    if (this.config.checkOnStartup) {
      const stats = await this.getStats();
      if (stats.pendingMigrations > 0) {
        console.log(`发现 ${stats.pendingMigrations} 个待处理迁移`);
      }
    }
  }

  /**
   * 确保迁移表存在
   */
  private async ensureMigrationTableExists(): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      await db.run(`
        CREATE TABLE IF NOT EXISTS ${this.config.migrationTableName} (
          version INTEGER PRIMARY KEY,
          description TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'rolled_back')),
          started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          completed_at DATETIME,
          error_message TEXT,
          execution_time INTEGER,
          direction TEXT CHECK (direction IN ('up', 'down'))
        )
      `);

      if (this.config.verboseLogging) {
        console.log(`迁移表已就绪: ${this.config.migrationTableName}`);
      }
    } finally {
      await db.close();
    }
  }

  /**
   * 加载所有迁移脚本
   */
  public async loadMigrations(): Promise<MigrationScript[]> {
    const migrations: MigrationScript[] = [];

    if (!fs.existsSync(this.config.migrationsDirectory)) {
      if (this.config.verboseLogging) {
        console.log(`迁移目录不存在: ${this.config.migrationsDirectory}`);
      }
      return migrations;
    }

    // 读取目录中的文件
    const files = fs.readdirSync(this.config.migrationsDirectory)
      .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
      .sort(); // 按文件名排序

    for (const file of files) {
      try {
        const migrationPath = path.join(this.config.migrationsDirectory, file);

        // 动态导入迁移模块
        const module = await import(migrationPath);

        if (!module.default || typeof module.default !== 'object') {
          console.warn(`无效的迁移文件格式: ${file}`);
          continue;
        }

        const migration = module.default as MigrationScript;

        // 验证迁移脚本
        if (!this.validateMigrationScript(migration)) {
          console.warn(`迁移脚本验证失败: ${file}`);
          continue;
        }

        migrations.push(migration);

        if (this.config.verboseLogging) {
          console.log(`加载迁移: v${migration.version} - ${migration.description}`);
        }
      } catch (error) {
        console.error(`加载迁移文件失败: ${file}`, error);
      }
    }

    // 按版本号排序
    migrations.sort((a, b) => a.version - b.version);

    return migrations;
  }

  /**
   * 验证迁移脚本
   */
  private validateMigrationScript(migration: MigrationScript): boolean {
    if (typeof migration.version !== 'number' || migration.version <= 0) {
      return false;
    }

    if (typeof migration.description !== 'string' || migration.description.trim() === '') {
      return false;
    }

    if (typeof migration.up !== 'function') {
      return false;
    }

    if (typeof migration.down !== 'function') {
      return false;
    }

    return true;
  }

  /**
   * 获取迁移记录
   */
  public async getMigrationRecords(): Promise<MigrationRecord[]> {
    const db = await connectionManager.getConnection();

    try {
      const records = await db.all(
        `SELECT * FROM ${this.config.migrationTableName} ORDER BY version`
      );

      return records.map(record => ({
        version: record.version,
        description: record.description,
        status: record.status as MigrationStatus,
        started_at: new Date(record.started_at),
        completed_at: record.completed_at ? new Date(record.completed_at) : null,
        error_message: record.error_message,
        execution_time: record.execution_time,
        direction: record.direction as MigrationDirection | null
      }));
    } finally {
      await db.close();
    }
  }

  /**
   * 获取迁移统计
   */
  public async getStats(): Promise<MigrationStats> {
    const migrations = await this.loadMigrations();
    const records = await this.getMigrationRecords();

    const completedMigrations = records.filter(r => r.status === 'completed').length;
    const pendingMigrations = records.filter(r => r.status === 'pending').length;
    const failedMigrations = records.filter(r => r.status === 'failed').length;

    const completedVersions = records
      .filter(r => r.status === 'completed')
      .map(r => r.version);

    const currentVersion = completedVersions.length > 0
      ? Math.max(...completedVersions)
      : 0;

    const latestVersion = migrations.length > 0
      ? Math.max(...migrations.map(m => m.version))
      : 0;

    const lastMigration = records
      .filter(r => r.status === 'completed')
      .sort((a, b) => b.completed_at!.getTime() - a.completed_at!.getTime())[0];

    return {
      totalMigrations: migrations.length,
      completedMigrations,
      pendingMigrations,
      failedMigrations,
      lastMigrationTime: lastMigration?.completed_at || null,
      currentVersion,
      latestVersion
    };
  }

  /**
   * 创建迁移计划
   */
  public async createMigrationPlan(targetVersion?: number): Promise<MigrationPlan> {
    const migrations = await this.loadMigrations();
    const records = await this.getMigrationRecords();

    const completedVersions = new Set(
      records.filter(r => r.status === 'completed').map(r => r.version)
    );

    const pendingVersions = new Set(
      records.filter(r => r.status === 'pending').map(r => r.version)
    );

    const target = targetVersion !== undefined
      ? targetVersion
      : Math.max(...migrations.map(m => m.version));

    const migrationsToRun: MigrationScript[] = [];
    const migrationsToRollback: MigrationScript[] = [];
    const dependencyConflicts: Array<{
      migration: MigrationScript;
      missingDependencies: number[];
    }> = [];

    // 确定需要运行的迁移（升级）
    for (const migration of migrations) {
      if (migration.version <= target && !completedVersions.has(migration.version)) {
        // 检查依赖
        if (migration.dependencies && migration.dependencies.length > 0) {
          const missingDeps = migration.dependencies.filter(
            dep => !completedVersions.has(dep)
          );

          if (missingDeps.length > 0) {
            dependencyConflicts.push({
              migration,
              missingDependencies: missingDeps
            });
            continue;
          }
        }

        migrationsToRun.push(migration);
      }
    }

    // 确定需要回滚的迁移（降级）
    if (target < this.getCurrentVersionFromRecords(records)) {
      for (const migration of migrations.slice().reverse()) {
        if (migration.version > target && completedVersions.has(migration.version)) {
          migrationsToRollback.push(migration);
        }
      }
    }

    const isExecutable = dependencyConflicts.length === 0;

    return {
      migrationsToRun,
      migrationsToRollback,
      targetVersion: target,
      isExecutable,
      dependencyConflicts
    };
  }

  /**
   * 从记录中获取当前版本
   */
  private getCurrentVersionFromRecords(records: MigrationRecord[]): number {
    const completedVersions = records
      .filter(r => r.status === 'completed')
      .map(r => r.version);

    return completedVersions.length > 0
      ? Math.max(...completedVersions)
      : 0;
  }

  /**
   * 执行迁移
   */
  public async migrate(targetVersion?: number): Promise<{
    applied: number;
    rolledBack: number;
    errors: MigrationError[];
  }> {
    const plan = await this.createMigrationPlan(targetVersion);

    if (!plan.isExecutable) {
      throw new Error('迁移计划不可执行，存在依赖冲突');
    }

    const applied: MigrationScript[] = [];
    const rolledBack: MigrationScript[] = [];
    const errors: MigrationError[] = [];

    // 执行升级迁移
    for (const migration of plan.migrationsToRun) {
      try {
        await this.executeMigration(migration, 'up');
        applied.push(migration);
      } catch (error) {
        errors.push(new MigrationError(
          migration.version,
          'up',
          error instanceof Error ? error.message : '未知错误',
          error instanceof Error ? error : undefined
        ));

        if (this.config.autoRollbackOnFailure) {
          await this.rollback(applied.map(m => m.version));
        }

        break; // 停止执行后续迁移
      }
    }

    // 执行降级迁移
    for (const migration of plan.migrationsToRollback) {
      try {
        await this.executeMigration(migration, 'down');
        rolledBack.push(migration);
      } catch (error) {
        errors.push(new MigrationError(
          migration.version,
          'down',
          error instanceof Error ? error.message : '未知错误',
          error instanceof Error ? error : undefined
        ));

        break; // 停止执行后续回滚
      }
    }

    return {
      applied: applied.length,
      rolledBack: rolledBack.length,
      errors
    };
  }

  /**
   * 执行单个迁移
   */
  private async executeMigration(migration: MigrationScript, direction: MigrationDirection): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      // 开始迁移记录
      await this.startMigrationRecord(migration, direction);

      const startTime = Date.now();

      // 执行迁移操作
      if (direction === 'up') {
        await migration.up(db);
      } else {
        await migration.down(db);
      }

      const executionTime = Date.now() - startTime;

      // 完成迁移记录
      await this.completeMigrationRecord(migration, direction, executionTime);

      if (this.config.verboseLogging) {
        console.log(`迁移 ${direction} 完成: v${migration.version} - ${migration.description} (${executionTime}ms)`);
      }
    } catch (error) {
      // 记录失败
      await this.failMigrationRecord(
        migration,
        direction,
        error instanceof Error ? error.message : '未知错误'
      );

      throw error;
    } finally {
      await db.close();
    }
  }

  /**
   * 开始迁移记录
   */
  private async startMigrationRecord(migration: MigrationScript, direction: MigrationDirection): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      await db.run(
        `INSERT INTO ${this.config.migrationTableName}
         (version, description, status, started_at, direction)
         VALUES (?, ?, 'running', CURRENT_TIMESTAMP, ?)
         ON CONFLICT(version) DO UPDATE SET
           status = 'running',
           started_at = CURRENT_TIMESTAMP,
           direction = ?`,
        migration.version,
        migration.description,
        direction,
        direction
      );
    } finally {
      await db.close();
    }
  }

  /**
   * 完成迁移记录
   */
  private async completeMigrationRecord(
    migration: MigrationScript,
    direction: MigrationDirection,
    executionTime: number
  ): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      await db.run(
        `UPDATE ${this.config.migrationTableName}
         SET status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             execution_time = ?,
             error_message = NULL
         WHERE version = ?`,
        executionTime,
        migration.version
      );
    } finally {
      await db.close();
    }
  }

  /**
   * 失败迁移记录
   */
  private async failMigrationRecord(
    migration: MigrationScript,
    direction: MigrationDirection,
    errorMessage: string
  ): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      await db.run(
        `UPDATE ${this.config.migrationTableName}
         SET status = 'failed',
             completed_at = CURRENT_TIMESTAMP,
             error_message = ?
         WHERE version = ?`,
        errorMessage,
        migration.version
      );
    } finally {
      await db.close();
    }
  }

  /**
   * 回滚迁移
   */
  public async rollback(versions?: number[]): Promise<{
    rolledBack: number;
    errors: MigrationError[];
  }> {
    const records = await this.getMigrationRecords();
    const migrations = await this.loadMigrations();

    const versionsToRollback = versions ||
      records
        .filter(r => r.status === 'completed')
        .map(r => r.version)
        .sort((a, b) => b - a); // 从最新开始回滚

    const rolledBack: MigrationScript[] = [];
    const errors: MigrationError[] = [];

    for (const version of versionsToRollback) {
      const migration = migrations.find(m => m.version === version);
      if (!migration) {
        errors.push(new MigrationError(
          version,
          'down',
          `找不到版本 ${version} 的迁移脚本`
        ));
        continue;
      }

      try {
        await this.executeMigration(migration, 'down');
        rolledBack.push(migration);
      } catch (error) {
        errors.push(new MigrationError(
          version,
          'down',
          error instanceof Error ? error.message : '未知错误',
          error instanceof Error ? error : undefined
        ));
        break; // 停止执行后续回滚
      }
    }

    return {
      rolledBack: rolledBack.length,
      errors
    };
  }

  /**
   * 创建迁移脚本模板
   */
  public async createMigrationTemplate(description: string): Promise<string> {
    const migrations = await this.loadMigrations();
    const records = await this.getMigrationRecords();

    const completedVersions = records
      .filter(r => r.status === 'completed')
      .map(r => r.version);

    const nextVersion = completedVersions.length > 0
      ? Math.max(...completedVersions) + 1
      : 1;

    const timestamp = new Date().toISOString().replace(/[:\.]/g, '-');
    const filename = `${nextVersion.toString().padStart(4, '0')}_${description.replace(/\s+/g, '_')}.ts`;
    const filepath = path.join(this.config.migrationsDirectory, filename);

    const template = `/**
 * 迁移: ${description}
 * 版本: ${nextVersion}
 * 创建时间: ${new Date().toISOString()}
 */

import { Database } from 'sqlite';

export default {
  version: ${nextVersion},
  description: '${description}',

  /**
   * 升级操作
   */
  async up(db: Database): Promise<void> {
    // 在这里编写升级SQL
    // 例如: await db.run('CREATE TABLE ...');
  },

  /**
   * 降级操作
   */
  async down(db: Database): Promise<void> {
    // 在这里编写降级SQL
    // 例如: await db.run('DROP TABLE ...');
  },

  /**
   * 迁移依赖（可选）
   */
  dependencies: [] as number[]
};`;

    // 确保目录存在
    if (!fs.existsSync(this.config.migrationsDirectory)) {
      fs.mkdirSync(this.config.migrationsDirectory, { recursive: true });
    }

    fs.writeFileSync(filepath, template, 'utf8');

    return filepath;
  }

  /**
   * 重置迁移状态
   */
  public async reset(): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      await db.run(`DELETE FROM ${this.config.migrationTableName}`);
      console.log('迁移状态已重置');
    } finally {
      await db.close();
    }
  }

  /**
   * 验证迁移状态
   */
  public async validate(): Promise<{
    isValid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];
    const migrations = await this.loadMigrations();
    const records = await this.getMigrationRecords();

    // 检查重复版本号
    const versionSet = new Set<number>();
    const duplicateVersions = new Set<number>();

    for (const migration of migrations) {
      if (versionSet.has(migration.version)) {
        duplicateVersions.add(migration.version);
      }
      versionSet.add(migration.version);
    }

    if (duplicateVersions.size > 0) {
      issues.push(`发现重复的迁移版本号: ${Array.from(duplicateVersions).join(', ')}`);
    }

    // 检查缺失的依赖
    const completedVersions = new Set(
      records.filter(r => r.status === 'completed').map(r => r.version)
    );

    for (const migration of migrations) {
      if (migration.dependencies && migration.dependencies.length > 0) {
        const missingDeps = migration.dependencies.filter(
          dep => !completedVersions.has(dep) && !versionSet.has(dep)
        );

        if (missingDeps.length > 0) {
          issues.push(`迁移 v${migration.version} 缺少依赖: ${missingDeps.join(', ')}`);
        }
      }
    }

    // 检查迁移脚本与记录的一致性
    const migrationVersions = new Set(migrations.map(m => m.version));
    const recordVersions = new Set(records.map(r => r.version));

    const orphanedRecords = Array.from(recordVersions).filter(
      v => !migrationVersions.has(v)
    );

    if (orphanedRecords.length > 0) {
      issues.push(`存在孤立的迁移记录（无对应脚本）: ${orphanedRecords.join(', ')}`);
    }

    return {
      isValid: issues.length === 0,
      issues
    };
  }
}

// 导出默认迁移管理器实例
export const migrationManager = new MigrationManager();