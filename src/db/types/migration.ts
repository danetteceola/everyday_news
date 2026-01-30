/**
 * 数据迁移类型定义
 */

/**
 * 迁移方向
 */
export type MigrationDirection = 'up' | 'down';

/**
 * 迁移状态
 */
export type MigrationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'rolled_back';

/**
 * 迁移脚本接口
 */
export interface MigrationScript {
  /**
   * 迁移版本号
   */
  version: number;

  /**
   * 迁移描述
   */
  description: string;

  /**
   * 升级操作
   */
  up(db: any): Promise<void>;

  /**
   * 降级操作
   */
  down(db: any): Promise<void>;

  /**
   * 迁移依赖（版本号数组）
   */
  dependencies?: number[];
}

/**
 * 迁移记录
 */
export interface MigrationRecord {
  /**
   * 迁移版本号
   */
  version: number;

  /**
   * 迁移描述
   */
  description: string;

  /**
   * 迁移状态
   */
  status: MigrationStatus;

  /**
   * 开始时间
   */
  started_at: Date;

  /**
   * 完成时间
   */
  completed_at: Date | null;

  /**
   * 错误信息
   */
  error_message: string | null;

  /**
   * 执行时间（毫秒）
   */
  execution_time: number | null;

  /**
   * 迁移方向
   */
  direction: MigrationDirection | null;
}

/**
 * 迁移配置
 */
export interface MigrationConfig {
  /**
   * 迁移表名
   */
  migrationTableName: string;

  /**
   * 迁移脚本目录
   */
  migrationsDirectory: string;

  /**
   * 是否在迁移失败时自动回滚
   */
  autoRollbackOnFailure: boolean;

  /**
   * 是否在启动时检查迁移
   */
  checkOnStartup: boolean;

  /**
   * 是否记录详细日志
   */
  verboseLogging: boolean;
}

/**
 * 迁移统计
 */
export interface MigrationStats {
  /**
   * 总迁移数
   */
  totalMigrations: number;

  /**
   * 已完成的迁移数
   */
  completedMigrations: number;

  /**
   * 待处理的迁移数
   */
  pendingMigrations: number;

  /**
   * 失败的迁移数
   */
  failedMigrations: number;

  /**
   * 最近迁移时间
   */
  lastMigrationTime: Date | null;

  /**
   * 当前数据库版本
   */
  currentVersion: number;

  /**
   * 最新可用版本
   */
  latestVersion: number;
}

/**
 * 迁移计划
 */
export interface MigrationPlan {
  /**
   * 要执行的迁移
   */
  migrationsToRun: MigrationScript[];

  /**
   * 要回滚的迁移
   */
  migrationsToRollback: MigrationScript[];

  /**
   * 目标版本
   */
  targetVersion: number;

  /**
   * 是否可执行
   */
  isExecutable: boolean;

  /**
   * 依赖冲突
   */
  dependencyConflicts: Array<{
    migration: MigrationScript;
    missingDependencies: number[];
  }>;
}

/**
 * 迁移错误
 */
export class MigrationError extends Error {
  constructor(
    public version: number,
    public direction: MigrationDirection,
    message: string,
    public originalError?: Error
  ) {
    super(`Migration ${direction} failed for version ${version}: ${message}`);
    this.name = 'MigrationError';
  }
}