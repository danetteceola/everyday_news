/**
 * 备份管理器
 * 负责数据采集模块的备份和恢复
 */

import { CollectionLogger, createCollectorLogger } from '../utils/logger';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createGzip, createGunzip } from 'zlib';
import tar from 'tar';

// 备份类型
export enum BackupType {
  FULL = 'full',
  INCREMENTAL = 'incremental',
  DATABASE_ONLY = 'database_only',
  CONFIG_ONLY = 'config_only'
}

// 备份状态
export enum BackupStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  VERIFIED = 'verified',
  CORRUPTED = 'corrupted'
}

// 备份信息
export interface BackupInfo {
  id: string;
  name: string;
  type: BackupType;
  status: BackupStatus;
  size: number;
  createdAt: Date;
  completedAt?: Date;
  verifiedAt?: Date;
  checksum?: string;
  encryption?: {
    algorithm: string;
    keyId: string;
  };
  compression: boolean;
  retentionDays: number;
  metadata: Record<string, any>;
}

// 备份配置
export interface BackupConfig {
  // 备份目录
  backupDir: string;

  // 数据目录
  dataDir: string;

  // 配置目录
  configDir: string;

  // 日志目录
  logDir: string;

  // 备份计划
  schedule: {
    full: string; // cron表达式
    incremental: string;
    retentionDays: number;
  };

  // 压缩配置
  compression: {
    enabled: boolean;
    level: number; // 1-9
  };

  // 加密配置
  encryption: {
    enabled: boolean;
    algorithm: 'aes-256-gcm';
    keyPath: string;
  };

  // 验证配置
  verification: {
    enabled: boolean;
    checksum: boolean;
    integrityCheck: boolean;
  };

  // 通知配置
  notification: {
    enabled: boolean;
    onSuccess: boolean;
    onFailure: boolean;
    channels: string[];
  };

  // 存储限制
  storage: {
    maxBackups: number;
    maxTotalSize: number; // MB
    cleanupOldBackups: boolean;
  };
}

// 恢复选项
export interface RestoreOptions {
  backupId: string;
  targetDir: string;
  verifyBeforeRestore: boolean;
  preserveExisting: boolean;
  components: {
    database: boolean;
    config: boolean;
    logs: boolean;
  };
}

export class BackupManager {
  private logger: CollectionLogger;
  private config: BackupConfig;
  private backups: Map<string, BackupInfo> = new Map();
  private backupHistory: BackupInfo[] = [];

  // 默认配置
  private defaultConfig: BackupConfig = {
    backupDir: './data/backups',
    dataDir: './data/collection',
    configDir: './config',
    logDir: './logs',
    schedule: {
      full: '0 2 * * *', // 每天2点
      incremental: '0 */6 * * *', // 每6小时
      retentionDays: 30
    },
    compression: {
      enabled: true,
      level: 6
    },
    encryption: {
      enabled: false,
      algorithm: 'aes-256-gcm',
      keyPath: './secrets/backup.key'
    },
    verification: {
      enabled: true,
      checksum: true,
      integrityCheck: true
    },
    notification: {
      enabled: true,
      onSuccess: false,
      onFailure: true,
      channels: ['log']
    },
    storage: {
      maxBackups: 100,
      maxTotalSize: 10240, // 10GB
      cleanupOldBackups: true
    }
  };

  constructor(config?: Partial<BackupConfig>) {
    this.logger = createCollectorLogger('backup-manager');
    this.config = { ...this.defaultConfig, ...config };

    // 确保备份目录存在
    this.ensureBackupDir().catch(error => {
      this.logger.error('初始化备份目录失败', error);
    });

    // 加载现有备份信息
    this.loadBackupInfo().catch(error => {
      this.logger.warn('加载备份信息失败', error);
    });

    this.logger.info('备份管理器初始化完成');
  }

  /**
   * 确保备份目录存在
   */
  private async ensureBackupDir(): Promise<void> {
    try {
      await fs.mkdir(this.config.backupDir, { recursive: true });
      this.logger.debug(`备份目录已创建: ${this.config.backupDir}`);
    } catch (error) {
      this.logger.error(`创建备份目录失败: ${this.config.backupDir}`, error as Error);
      throw error;
    }
  }

  /**
   * 加载备份信息
   */
  private async loadBackupInfo(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.backupDir);
      const backupFiles = files.filter(file => file.endsWith('.json'));

      for (const file of backupFiles) {
        const filePath = path.join(this.config.backupDir, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const backupInfo: BackupInfo = JSON.parse(content);

        this.backups.set(backupInfo.id, backupInfo);
        this.backupHistory.push(backupInfo);
      }

      // 按创建时间排序
      this.backupHistory.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      this.logger.info(`加载了 ${this.backups.size} 个备份信息`);
    } catch (error) {
      this.logger.warn('加载备份信息失败', error as Error);
    }
  }

  /**
   * 保存备份信息
   */
  private async saveBackupInfo(backupInfo: BackupInfo): Promise<void> {
    try {
      const filePath = path.join(this.config.backupDir, `${backupInfo.id}.json`);
      const content = JSON.stringify(backupInfo, null, 2);

      await fs.writeFile(filePath, content, 'utf-8');

      this.backups.set(backupInfo.id, backupInfo);
      this.backupHistory.push(backupInfo);

      // 保持历史记录排序
      this.backupHistory.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

      this.logger.debug(`备份信息已保存: ${backupInfo.id}`);
    } catch (error) {
      this.logger.error('保存备份信息失败', error as Error);
      throw error;
    }
  }

  /**
   * 生成备份ID
   */
  private generateBackupId(type: BackupType): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substr(2, 9);
    return `${type}_${timestamp}_${random}`;
  }

  /**
   * 计算文件校验和
   */
  private async calculateChecksum(filePath: string): Promise<string> {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    const fileStream = createReadStream(filePath);

    return new Promise((resolve, reject) => {
      fileStream.on('data', chunk => hash.update(chunk));
      fileStream.on('end', () => resolve(hash.digest('hex')));
      fileStream.on('error', reject);
    });
  }

  /**
   * 执行完整备份
   */
  async createFullBackup(options?: {
    name?: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<BackupInfo> {
    const backupId = this.generateBackupId(BackupType.FULL);
    const backupName = options?.name || `完整备份_${new Date().toISOString().split('T')[0]}`;

    const backupInfo: BackupInfo = {
      id: backupId,
      name: backupName,
      type: BackupType.FULL,
      status: BackupStatus.RUNNING,
      size: 0,
      createdAt: new Date(),
      compression: this.config.compression.enabled,
      retentionDays: this.config.schedule.retentionDays,
      metadata: {
        description: options?.description || '完整数据备份',
        ...options?.metadata
      }
    };

    try {
      this.logger.info(`开始完整备份: ${backupName} (${backupId})`);

      // 保存初始备份信息
      await this.saveBackupInfo(backupInfo);

      // 备份文件路径
      const backupFileName = `${backupId}.tar${this.config.compression.enabled ? '.gz' : ''}`;
      const backupFilePath = path.join(this.config.backupDir, backupFileName);

      // 确定要备份的目录
      const backupDirs = [
        this.config.dataDir,
        this.config.configDir,
        this.config.logDir
      ].filter(dir => {
        // 检查目录是否存在
        try {
          return fs.access(dir).then(() => true).catch(() => false);
        } catch {
          return false;
        }
      });

      if (backupDirs.length === 0) {
        throw new Error('没有找到可备份的目录');
      }

      // 创建tar归档
      await tar.c(
        {
          gzip: this.config.compression.enabled,
          file: backupFilePath,
          cwd: path.dirname(backupDirs[0])
        },
        backupDirs.map(dir => path.basename(dir))
      );

      // 获取备份文件大小
      const stats = await fs.stat(backupFilePath);
      backupInfo.size = stats.size;

      // 计算校验和
      if (this.config.verification.checksum) {
        backupInfo.checksum = await this.calculateChecksum(backupFilePath);
      }

      // 更新备份状态
      backupInfo.status = BackupStatus.COMPLETED;
      backupInfo.completedAt = new Date();

      // 验证备份
      if (this.config.verification.integrityCheck) {
        await this.verifyBackup(backupInfo);
        backupInfo.status = BackupStatus.VERIFIED;
        backupInfo.verifiedAt = new Date();
      }

      // 保存更新后的备份信息
      await this.saveBackupInfo(backupInfo);

      // 清理旧备份
      if (this.config.storage.cleanupOldBackups) {
        await this.cleanupOldBackups();
      }

      // 发送通知
      if (this.config.notification.enabled && this.config.notification.onSuccess) {
        await this.sendBackupNotification(backupInfo, true);
      }

      this.logger.info(`完整备份完成: ${backupName}, 大小: ${this.formatSize(backupInfo.size)}`);

      return backupInfo;

    } catch (error) {
      // 更新备份状态为失败
      backupInfo.status = BackupStatus.FAILED;
      backupInfo.completedAt = new Date();

      try {
        await this.saveBackupInfo(backupInfo);
      } catch (saveError) {
        this.logger.error('保存失败备份信息失败', saveError as Error);
      }

      // 发送失败通知
      if (this.config.notification.enabled && this.config.notification.onFailure) {
        await this.sendBackupNotification(backupInfo, false, error as Error);
      }

      this.logger.error(`完整备份失败: ${backupName}`, error as Error);
      throw error;
    }
  }

  /**
   * 执行增量备份
   */
  async createIncrementalBackup(options?: {
    name?: string;
    description?: string;
    metadata?: Record<string, any>;
  }): Promise<BackupInfo> {
    const backupId = this.generateBackupId(BackupType.INCREMENTAL);
    const backupName = options?.name || `增量备份_${new Date().toISOString()}`;

    const backupInfo: BackupInfo = {
      id: backupId,
      name: backupName,
      type: BackupType.INCREMENTAL,
      status: BackupStatus.RUNNING,
      size: 0,
      createdAt: new Date(),
      compression: this.config.compression.enabled,
      retentionDays: this.config.schedule.retentionDays,
      metadata: {
        description: options?.description || '增量数据备份',
        ...options?.metadata
      }
    };

    try {
      this.logger.info(`开始增量备份: ${backupName} (${backupId})`);

      // 保存初始备份信息
      await this.saveBackupInfo(backupInfo);

      // 查找最新的完整备份作为基准
      const latestFullBackup = this.backupHistory.find(
        backup => backup.type === BackupType.FULL && backup.status === BackupStatus.VERIFIED
      );

      if (!latestFullBackup) {
        this.logger.warn('未找到完整的基准备份，将创建完整备份');
        return await this.createFullBackup(options);
      }

      // 备份文件路径
      const backupFileName = `${backupId}.tar${this.config.compression.enabled ? '.gz' : ''}`;
      const backupFilePath = path.join(this.config.backupDir, backupFileName);

      // 这里简化实现，实际应该使用rsync或类似工具
      // 对于演示目的，我们只备份最近修改的文件
      const cutoffTime = latestFullBackup.createdAt.getTime();
      const changedFiles = await this.findChangedFiles(cutoffTime);

      if (changedFiles.length === 0) {
        this.logger.info('没有发现变更的文件，跳过增量备份');
        backupInfo.status = BackupStatus.COMPLETED;
        backupInfo.completedAt = new Date();
        backupInfo.metadata.skipped = '没有变更的文件';
        await this.saveBackupInfo(backupInfo);
        return backupInfo;
      }

      // 创建tar归档
      await tar.c(
        {
          gzip: this.config.compression.enabled,
          file: backupFilePath,
          cwd: path.dirname(this.config.dataDir)
        },
        changedFiles
      );

      // 获取备份文件大小
      const stats = await fs.stat(backupFilePath);
      backupInfo.size = stats.size;

      // 计算校验和
      if (this.config.verification.checksum) {
        backupInfo.checksum = await this.calculateChecksum(backupFilePath);
      }

      // 更新备份状态
      backupInfo.status = BackupStatus.COMPLETED;
      backupInfo.completedAt = new Date();

      // 保存基准备份信息
      backupInfo.metadata.baseBackup = latestFullBackup.id;
      backupInfo.metadata.changedFiles = changedFiles.length;

      // 验证备份
      if (this.config.verification.integrityCheck) {
        await this.verifyBackup(backupInfo);
        backupInfo.status = BackupStatus.VERIFIED;
        backupInfo.verifiedAt = new Date();
      }

      // 保存更新后的备份信息
      await this.saveBackupInfo(backupInfo);

      // 清理旧备份
      if (this.config.storage.cleanupOldBackups) {
        await this.cleanupOldBackups();
      }

      // 发送通知
      if (this.config.notification.enabled && this.config.notification.onSuccess) {
        await this.sendBackupNotification(backupInfo, true);
      }

      this.logger.info(`增量备份完成: ${backupName}, 大小: ${this.formatSize(backupInfo.size)}, 变更文件: ${changedFiles.length}`);

      return backupInfo;

    } catch (error) {
      // 更新备份状态为失败
      backupInfo.status = BackupStatus.FAILED;
      backupInfo.completedAt = new Date();

      try {
        await this.saveBackupInfo(backupInfo);
      } catch (saveError) {
        this.logger.error('保存失败备份信息失败', saveError as Error);
      }

      // 发送失败通知
      if (this.config.notification.enabled && this.config.notification.onFailure) {
        await this.sendBackupNotification(backupInfo, false, error as Error);
      }

      this.logger.error(`增量备份失败: ${backupName}`, error as Error);
      throw error;
    }
  }

  /**
   * 查找变更的文件
   */
  private async findChangedFiles(sinceTime: number): Promise<string[]> {
    const changedFiles: string[] = [];

    const scanDir = async (dir: string, baseDir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.relative(baseDir, fullPath);

          if (entry.isDirectory()) {
            await scanDir(fullPath, baseDir);
          } else if (entry.isFile()) {
            try {
              const stats = await fs.stat(fullPath);
              if (stats.mtimeMs > sinceTime) {
                changedFiles.push(relativePath);
              }
            } catch {
              // 忽略无法访问的文件
            }
          }
        }
      } catch (error) {
        this.logger.warn(`扫描目录失败: ${dir}`, error as Error);
      }
    };

    // 扫描数据目录
    await scanDir(this.config.dataDir, this.config.dataDir);

    return changedFiles;
  }

  /**
   * 验证备份
   */
  async verifyBackup(backupInfo: BackupInfo): Promise<boolean> {
    try {
      this.logger.debug(`验证备份: ${backupInfo.id}`);

      // 查找备份文件
      const backupFileName = `${backupInfo.id}.tar${backupInfo.compression ? '.gz' : ''}`;
      const backupFilePath = path.join(this.config.backupDir, backupFileName);

      // 检查文件是否存在
      try {
        await fs.access(backupFilePath);
      } catch {
        throw new Error(`备份文件不存在: ${backupFilePath}`);
      }

      // 验证文件大小
      const stats = await fs.stat(backupFilePath);
      if (stats.size !== backupInfo.size) {
        throw new Error(`备份文件大小不匹配: 期望 ${backupInfo.size}, 实际 ${stats.size}`);
      }

      // 验证校验和
      if (backupInfo.checksum && this.config.verification.checksum) {
        const actualChecksum = await this.calculateChecksum(backupFilePath);
        if (actualChecksum !== backupInfo.checksum) {
          throw new Error(`备份校验和不匹配: 期望 ${backupInfo.checksum}, 实际 ${actualChecksum}`);
        }
      }

      // 验证归档完整性
      try {
        await tar.t({
          file: backupFilePath,
          onentry: () => { /* 验证每个条目 */ }
        });
      } catch (error) {
        throw new Error(`备份归档损坏: ${(error as Error).message}`);
      }

      this.logger.debug(`备份验证通过: ${backupInfo.id}`);
      return true;

    } catch (error) {
      backupInfo.status = BackupStatus.CORRUPTED;
      await this.saveBackupInfo(backupInfo);

      this.logger.error(`备份验证失败: ${backupInfo.id}`, error as Error);
      throw error;
    }
  }

  /**
   * 恢复备份
   */
  async restoreBackup(options: RestoreOptions): Promise<void> {
    const backupInfo = this.backups.get(options.backupId);
    if (!backupInfo) {
      throw new Error(`备份不存在: ${options.backupId}`);
    }

    if (backupInfo.status !== BackupStatus.VERIFIED && backupInfo.status !== BackupStatus.COMPLETED) {
      throw new Error(`备份状态不可用: ${backupInfo.status}`);
    }

    try {
      this.logger.info(`开始恢复备份: ${backupInfo.name} (${backupInfo.id})`);

      // 验证备份
      if (options.verifyBeforeRestore) {
        await this.verifyBackup(backupInfo);
      }

      // 备份文件路径
      const backupFileName = `${backupInfo.id}.tar${backupInfo.compression ? '.gz' : ''}`;
      const backupFilePath = path.join(this.config.backupDir, backupFileName);

      // 目标目录
      const targetDir = options.targetDir || path.dirname(this.config.dataDir);

      // 备份现有文件（如果存在且需要保留）
      if (options.preserveExisting) {
        await this.backupExistingData(targetDir);
      }

      // 停止相关服务（在实际应用中）
      this.logger.info('停止相关服务...');
      // 这里应该停止数据采集服务

      try {
        // 解压备份
        await tar.x({
          file: backupFilePath,
          cwd: targetDir,
          strip: 1 // 移除归档中的顶层目录
        });

        this.logger.info(`备份恢复完成: ${backupInfo.name}`);

        // 启动相关服务（在实际应用中）
        this.logger.info('启动相关服务...');
        // 这里应该启动数据采集服务

        // 发送恢复通知
        await this.sendRestoreNotification(backupInfo, true);

      } catch (error) {
        // 恢复失败，尝试回滚
        this.logger.error('恢复失败，尝试回滚', error as Error);

        if (options.preserveExisting) {
          await this.restoreExistingData(targetDir);
        }

        // 发送失败通知
        await this.sendRestoreNotification(backupInfo, false, error as Error);

        throw error;
      }

    } catch (error) {
      this.logger.error(`恢复备份失败: ${backupInfo.name}`, error as Error);
      throw error;
    }
  }

  /**
   * 备份现有数据
   */
  private async backupExistingData(targetDir: string): Promise<void> {
    const backupId = `pre_restore_${Date.now()}`;
    const backupFilePath = path.join(this.config.backupDir, `${backupId}.tar.gz`);

    try {
      this.logger.debug(`备份现有数据: ${targetDir}`);

      await tar.c({
        gzip: true,
        file: backupFilePath,
        cwd: targetDir
      }, ['data', 'config', 'logs'].filter(dir => {
        try {
          return fs.access(path.join(targetDir, dir)).then(() => true).catch(() => false);
        } catch {
          return false;
        }
      }));

      this.logger.debug(`现有数据备份完成: ${backupFilePath}`);
    } catch (error) {
      this.logger.warn('备份现有数据失败', error as Error);
      // 继续恢复过程，即使备份失败
    }
  }

  /**
   * 恢复现有数据
   */
  private async restoreExistingData(targetDir: string): Promise<void> {
    // 查找最新的预恢复备份
    const preRestoreBackups = Array.from(this.backups.values())
      .filter(backup => backup.id.startsWith('pre_restore_'))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (preRestoreBackups.length === 0) {
      this.logger.warn('没有找到预恢复备份');
      return;
    }

    const latestBackup = preRestoreBackups[0];
    const backupFilePath = path.join(this.config.backupDir, `${latestBackup.id}.tar.gz`);

    try {
      this.logger.info(`恢复现有数据: ${latestBackup.id}`);

      await tar.x({
        file: backupFilePath,
        cwd: targetDir
      });

      this.logger.info('现有数据恢复完成');
    } catch (error) {
      this.logger.error('恢复现有数据失败', error as Error);
      throw error;
    }
  }

  /**
   * 清理旧备份
   */
  async cleanupOldBackups(): Promise<void> {
    try {
      this.logger.debug('开始清理旧备份');

      const now = Date.now();
      const backupsToDelete: BackupInfo[] = [];

      // 按保留策略筛选
      for (const backup of this.backupHistory) {
        const ageDays = (now - backup.createdAt.getTime()) / (1000 * 60 * 60 * 24);

        // 超过保留期限
        if (ageDays > backup.retentionDays) {
          backupsToDelete.push(backup);
          continue;
        }

        // 超过最大备份数量限制
        if (this.backupHistory.length > this.config.storage.maxBackups) {
          // 保留最新的N个备份
          const keepCount = Math.min(this.config.storage.maxBackups, 10);
          const oldBackups = this.backupHistory.slice(keepCount);
          if (oldBackups.includes(backup)) {
            backupsToDelete.push(backup);
          }
        }
      }

      // 检查总大小限制
      const totalSize = this.backupHistory.reduce((sum, backup) => sum + backup.size, 0);
      const maxSizeBytes = this.config.storage.maxTotalSize * 1024 * 1024;

      if (totalSize > maxSizeBytes) {
        // 按创建时间排序，删除最旧的备份
        const sortedBackups = [...this.backupHistory].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
        let currentSize = totalSize;

        for (const backup of sortedBackups) {
          if (currentSize <= maxSizeBytes) {
            break;
          }

          if (!backupsToDelete.includes(backup)) {
            backupsToDelete.push(backup);
            currentSize -= backup.size;
          }
        }
      }

      // 删除备份文件
      for (const backup of backupsToDelete) {
        await this.deleteBackup(backup.id);
      }

      if (backupsToDelete.length > 0) {
        this.logger.info(`清理了 ${backupsToDelete.length} 个旧备份`);
      }

    } catch (error) {
      this.logger.error('清理旧备份失败', error as Error);
      throw error;
    }
  }

  /**
   * 删除备份
   */
  async deleteBackup(backupId: string): Promise<void> {
    const backupInfo = this.backups.get(backupId);
    if (!backupInfo) {
      throw new Error(`备份不存在: ${backupId}`);
    }

    try {
      // 删除备份文件
      const backupFileName = `${backupId}.tar${backupInfo.compression ? '.gz' : ''}`;
      const backupFilePath = path.join(this.config.backupDir, backupFileName);

      await fs.unlink(backupFilePath);

      // 删除备份信息文件
      const infoFilePath = path.join(this.config.backupDir, `${backupId}.json`);
      await fs.unlink(infoFilePath);

      // 从内存中移除
      this.backups.delete(backupId);
      const index = this.backupHistory.findIndex(b => b.id === backupId);
      if (index !== -1) {
        this.backupHistory.splice(index, 1);
      }

      this.logger.info(`备份已删除: ${backupInfo.name} (${backupId})`);

    } catch (error) {
      this.logger.error(`删除备份失败: ${backupId}`, error as Error);
      throw error;
    }
  }

  /**
   * 列出所有备份
   */
  listBackups(options?: {
    type?: BackupType;
    status?: BackupStatus;
    limit?: number;
    offset?: number;
  }): BackupInfo[] {
    let filtered = this.backupHistory;

    if (options?.type) {
      filtered = filtered.filter(backup => backup.type === options.type);
    }

    if (options?.status) {
      filtered = filtered.filter(backup => backup.status === options.status);
    }

    if (options?.offset) {
      filtered = filtered.slice(options.offset);
    }

    if (options?.limit) {
      filtered = filtered.slice(0, options.limit);
    }

    return filtered;
  }

  /**
   * 获取备份统计信息
   */
  getBackupStats(): {
    total: number;
    byType: Record<BackupType, number>;
    byStatus: Record<BackupStatus, number>;
    totalSize: number;
    averageSize: number;
    oldestBackup?: Date;
    newestBackup?: Date;
  } {
    const stats = {
      total: this.backupHistory.length,
      byType: {
        [BackupType.FULL]: 0,
        [BackupType.INCREMENTAL]: 0,
        [BackupType.DATABASE_ONLY]: 0,
        [BackupType.CONFIG_ONLY]: 0
      },
      byStatus: {
        [BackupStatus.PENDING]: 0,
        [BackupStatus.RUNNING]: 0,
        [BackupStatus.COMPLETED]: 0,
        [BackupStatus.FAILED]: 0,
        [BackupStatus.VERIFIED]: 0,
        [BackupStatus.CORRUPTED]: 0
      },
      totalSize: 0,
      averageSize: 0,
      oldestBackup: undefined as Date | undefined,
      newestBackup: undefined as Date | undefined
    };

    if (this.backupHistory.length === 0) {
      return stats;
    }

    let minDate = this.backupHistory[0].createdAt;
    let maxDate = this.backupHistory[0].createdAt;

    for (const backup of this.backupHistory) {
      stats.byType[backup.type]++;
      stats.byStatus[backup.status]++;
      stats.totalSize += backup.size;

      if (backup.createdAt < minDate) minDate = backup.createdAt;
      if (backup.createdAt > maxDate) maxDate = backup.createdAt;
    }

    stats.averageSize = stats.totalSize / this.backupHistory.length;
    stats.oldestBackup = minDate;
    stats.newestBackup = maxDate;

    return stats;
  }

  /**
   * 发送备份通知
   */
  private async sendBackupNotification(
    backupInfo: BackupInfo,
    success: boolean,
    error?: Error
  ): Promise<void> {
    try {
      // 这里应该实现具体的通知逻辑
      // 例如：发送邮件、Slack消息、Webhook等

      const message = success
        ? `备份成功: ${backupInfo.name} (${backupInfo.id}), 大小: ${this.formatSize(backupInfo.size)}`
        : `备份失败: ${backupInfo.name} (${backupInfo.id}), 错误: ${error?.message}`;

      this.logger.info(message);

      // 实际实现中，这里会调用通知服务
      // await notificationService.send({
      //   channels: this.config.notification.channels,
      //   subject: `备份${success ? '成功' : '失败'}: ${backupInfo.name}`,
      //   message
      // });

    } catch (notificationError) {
      this.logger.warn('发送备份通知失败', notificationError as Error);
    }
  }

  /**
   * 发送恢复通知
   */
  private async sendRestoreNotification(
    backupInfo: BackupInfo,
    success: boolean,
    error?: Error
  ): Promise<void> {
    try {
      const message = success
        ? `恢复成功: ${backupInfo.name} (${backupInfo.id})`
        : `恢复失败: ${backupInfo.name} (${backupInfo.id}), 错误: ${error?.message}`;

      this.logger.info(message);

      // 实际实现中，这里会调用通知服务
      // await notificationService.send({
      //   channels: this.config.notification.channels,
      //   subject: `恢复${success ? '成功' : '失败'}: ${backupInfo.name}`,
      //   message
      // });

    } catch (notificationError) {
      this.logger.warn('发送恢复通知失败', notificationError as Error);
    }
  }

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * 导出备份配置
   */
  exportConfig(): BackupConfig {
    return { ...this.config };
  }

  /**
   * 更新备份配置
   */
  updateConfig(updates: Partial<BackupConfig>): void {
    this.config = { ...this.config, ...updates };
    this.logger.info('备份配置已更新');
  }

  /**
   * 测试备份功能
   */
  async testBackup(): Promise<BackupInfo> {
    this.logger.info('开始备份功能测试');

    // 创建测试配置备份
    const testBackup = await this.createFullBackup({
      name: '测试备份',
      description: '备份功能测试',
      metadata: {
        test: true,
        timestamp: new Date().toISOString()
      }
    });

    // 验证备份
    await this.verifyBackup(testBackup);

    // 列出备份
    const backups = this.listBackups({ type: BackupType.FULL });
    this.logger.info(`找到 ${backups.length} 个完整备份`);

    // 获取统计信息
    const stats = this.getBackupStats();
    this.logger.info(`备份统计: 总数 ${stats.total}, 总大小 ${this.formatSize(stats.totalSize)}`);

    // 清理测试备份
    await this.deleteBackup(testBackup.id);

    this.logger.info('备份功能测试完成');
    return testBackup;
  }
}

// 全局备份管理器实例
export const backupManager = new BackupManager();