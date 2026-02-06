#!/usr/bin/env node

/**
 * 备份命令行工具
 * 提供备份和恢复的管理界面
 */

import { backupManager, BackupManager, BackupType, BackupStatus } from './backup-manager';
import { Command } from 'commander';
import { Table } from 'console-table-printer';
import chalk from 'chalk';

const program = new Command();

// 基本信息
program
  .name('collection-backup')
  .description('数据采集模块备份管理工具')
  .version('1.0.0');

// 备份命令
program
  .command('create')
  .description('创建备份')
  .option('-t, --type <type>', '备份类型 (full|incremental)', 'full')
  .option('-n, --name <name>', '备份名称')
  .option('-d, --description <description>', '备份描述')
  .action(async (options) => {
    try {
      console.log(chalk.blue('开始创建备份...'));

      let backup;
      if (options.type === 'full') {
        backup = await backupManager.createFullBackup({
          name: options.name,
          description: options.description
        });
      } else if (options.type === 'incremental') {
        backup = await backupManager.createIncrementalBackup({
          name: options.name,
          description: options.description
        });
      } else {
        console.error(chalk.red(`不支持的备份类型: ${options.type}`));
        process.exit(1);
      }

      console.log(chalk.green('✓ 备份创建成功'));
      printBackupDetails(backup);

    } catch (error) {
      console.error(chalk.red('✗ 备份创建失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 列出备份命令
program
  .command('list')
  .description('列出所有备份')
  .option('-t, --type <type>', '按类型过滤')
  .option('-s, --status <status>', '按状态过滤')
  .option('-l, --limit <number>', '限制数量', '10')
  .option('-o, --offset <number>', '偏移量', '0')
  .option('--json', '输出JSON格式')
  .action(async (options) => {
    try {
      const backups = backupManager.listBackups({
        type: options.type as BackupType,
        status: options.status as BackupStatus,
        limit: parseInt(options.limit),
        offset: parseInt(options.offset)
      });

      if (options.json) {
        console.log(JSON.stringify(backups, null, 2));
        return;
      }

      if (backups.length === 0) {
        console.log(chalk.yellow('没有找到备份'));
        return;
      }

      printBackupTable(backups);

      // 显示统计信息
      const stats = backupManager.getBackupStats();
      console.log(chalk.blue(`\n总计: ${stats.total} 个备份, 总大小: ${formatSize(stats.totalSize)}`));

    } catch (error) {
      console.error(chalk.red('✗ 列出备份失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 验证备份命令
program
  .command('verify <backupId>')
  .description('验证备份完整性')
  .action(async (backupId) => {
    try {
      console.log(chalk.blue(`验证备份: ${backupId}`));

      const backups = backupManager.listBackups();
      const backup = backups.find(b => b.id === backupId);

      if (!backup) {
        console.error(chalk.red(`备份不存在: ${backupId}`));
        process.exit(1);
      }

      const isValid = await backupManager.verifyBackup(backup);

      if (isValid) {
        console.log(chalk.green('✓ 备份验证通过'));
        printBackupDetails(backup);
      } else {
        console.error(chalk.red('✗ 备份验证失败'));
        process.exit(1);
      }

    } catch (error) {
      console.error(chalk.red('✗ 验证备份失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 恢复备份命令
program
  .command('restore <backupId>')
  .description('恢复备份')
  .option('-t, --target <dir>', '目标目录')
  .option('--no-verify', '恢复前不验证备份')
  .option('--no-preserve', '不保留现有数据')
  .action(async (backupId, options) => {
    try {
      console.log(chalk.blue(`恢复备份: ${backupId}`));

      const backups = backupManager.listBackups();
      const backup = backups.find(b => b.id === backupId);

      if (!backup) {
        console.error(chalk.red(`备份不存在: ${backupId}`));
        process.exit(1);
      }

      console.log(chalk.yellow('警告: 恢复操作将覆盖现有数据！'));
      console.log(chalk.yellow('请在继续前确认已停止相关服务。'));

      // 确认操作
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>(resolve => {
        readline.question('确认恢复？(yes/no): ', resolve);
      });

      readline.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log(chalk.yellow('恢复操作已取消'));
        return;
      }

      await backupManager.restoreBackup({
        backupId,
        targetDir: options.target,
        verifyBeforeRestore: options.verify,
        preserveExisting: options.preserve,
        components: {
          database: true,
          config: true,
          logs: true
        }
      });

      console.log(chalk.green('✓ 备份恢复成功'));
      console.log(chalk.blue('请重新启动相关服务。'));

    } catch (error) {
      console.error(chalk.red('✗ 恢复备份失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 删除备份命令
program
  .command('delete <backupId>')
  .description('删除备份')
  .action(async (backupId) => {
    try {
      console.log(chalk.blue(`删除备份: ${backupId}`));

      const backups = backupManager.listBackups();
      const backup = backups.find(b => b.id === backupId);

      if (!backup) {
        console.error(chalk.red(`备份不存在: ${backupId}`));
        process.exit(1);
      }

      // 确认操作
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise<string>(resolve => {
        readline.question(`确认删除备份 "${backup.name}"？(yes/no): `, resolve);
      });

      readline.close();

      if (answer.toLowerCase() !== 'yes') {
        console.log(chalk.yellow('删除操作已取消'));
        return;
      }

      await backupManager.deleteBackup(backupId);
      console.log(chalk.green('✓ 备份删除成功'));

    } catch (error) {
      console.error(chalk.red('✗ 删除备份失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 清理命令
program
  .command('cleanup')
  .description('清理旧备份')
  .action(async () => {
    try {
      console.log(chalk.blue('开始清理旧备份...'));

      const beforeStats = backupManager.getBackupStats();
      console.log(`清理前: ${beforeStats.total} 个备份, 总大小: ${formatSize(beforeStats.totalSize)}`);

      await backupManager.cleanupOldBackups();

      const afterStats = backupManager.getBackupStats();
      console.log(`清理后: ${afterStats.total} 个备份, 总大小: ${formatSize(afterStats.totalSize)}`);

      const cleanedCount = beforeStats.total - afterStats.total;
      const cleanedSize = beforeStats.totalSize - afterStats.totalSize;

      if (cleanedCount > 0) {
        console.log(chalk.green(`✓ 清理了 ${cleanedCount} 个备份, 释放空间: ${formatSize(cleanedSize)}`));
      } else {
        console.log(chalk.yellow('没有需要清理的备份'));
      }

    } catch (error) {
      console.error(chalk.red('✗ 清理备份失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 统计命令
program
  .command('stats')
  .description('显示备份统计信息')
  .option('--json', '输出JSON格式')
  .action(async (options) => {
    try {
      const stats = backupManager.getBackupStats();

      if (options.json) {
        console.log(JSON.stringify(stats, null, 2));
        return;
      }

      console.log(chalk.blue('=== 备份统计信息 ===\n'));

      // 基本统计
      console.log(chalk.bold('基本统计:'));
      console.log(`  总备份数: ${chalk.cyan(stats.total)}`);
      console.log(`  总大小: ${chalk.cyan(formatSize(stats.totalSize))}`);
      console.log(`  平均大小: ${chalk.cyan(formatSize(stats.averageSize))}`);

      if (stats.oldestBackup) {
        console.log(`  最旧备份: ${chalk.cyan(stats.oldestBackup.toLocaleString())}`);
      }

      if (stats.newestBackup) {
        console.log(`  最新备份: ${chalk.cyan(stats.newestBackup.toLocaleString())}`);
      }

      // 按类型统计
      console.log(chalk.bold('\n按类型统计:'));
      for (const [type, count] of Object.entries(stats.byType)) {
        if (count > 0) {
          console.log(`  ${type}: ${chalk.cyan(count)}`);
        }
      }

      // 按状态统计
      console.log(chalk.bold('\n按状态统计:'));
      for (const [status, count] of Object.entries(stats.byStatus)) {
        if (count > 0) {
          const statusColor = getStatusColor(status as BackupStatus);
          console.log(`  ${status}: ${chalk[statusColor](count)}`);
        }
      }

      // 列出最近的备份
      const recentBackups = backupManager.listBackups({ limit: 5 });
      if (recentBackups.length > 0) {
        console.log(chalk.bold('\n最近备份:'));
        const table = new Table({
          columns: [
            { name: 'id', title: 'ID', alignment: 'left', maxLen: 12 },
            { name: 'name', title: '名称', alignment: 'left', maxLen: 20 },
            { name: 'type', title: '类型', alignment: 'left' },
            { name: 'size', title: '大小', alignment: 'right' },
            { name: 'created', title: '创建时间', alignment: 'left', maxLen: 16 }
          ]
        });

        for (const backup of recentBackups) {
          table.addRow({
            id: backup.id.substring(0, 12) + '...',
            name: backup.name,
            type: backup.type,
            size: formatSize(backup.size),
            created: backup.createdAt.toLocaleDateString()
          }, { color: getStatusColor(backup.status) });
        }

        table.printTable();

        console.log(`\n使用 ${chalk.cyan('collection-backup list')} 查看所有备份`);
      }

    } catch (error) {
      console.error(chalk.red('✗ 获取统计信息失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 测试命令
program
  .command('test')
  .description('测试备份功能')
  .action(async () => {
    try {
      console.log(chalk.blue('开始备份功能测试...\n'));

      console.log('1. 创建测试备份...');
      const backup = await backupManager.testBackup();

      console.log(chalk.green('\n✓ 备份功能测试完成'));
      console.log(`测试备份ID: ${chalk.cyan(backup.id)}`);
      console.log(`备份大小: ${chalk.cyan(formatSize(backup.size))}`);

      // 注意：测试备份在测试过程中已被自动清理

    } catch (error) {
      console.error(chalk.red('✗ 备份功能测试失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 配置命令
program
  .command('config')
  .description('显示备份配置')
  .option('--json', '输出JSON格式')
  .action(async (options) => {
    try {
      const config = backupManager.exportConfig();

      if (options.json) {
        console.log(JSON.stringify(config, null, 2));
        return;
      }

      console.log(chalk.blue('=== 备份配置 ===\n'));

      // 目录配置
      console.log(chalk.bold('目录配置:'));
      console.log(`  备份目录: ${chalk.cyan(config.backupDir)}`);
      console.log(`  数据目录: ${chalk.cyan(config.dataDir)}`);
      console.log(`  配置目录: ${chalk.cyan(config.configDir)}`);
      console.log(`  日志目录: ${chalk.cyan(config.logDir)}`);

      // 计划配置
      console.log(chalk.bold('\n计划配置:'));
      console.log(`  完整备份: ${chalk.cyan(config.schedule.full)}`);
      console.log(`  增量备份: ${chalk.cyan(config.schedule.incremental)}`);
      console.log(`  保留天数: ${chalk.cyan(config.schedule.retentionDays)} 天`);

      // 压缩配置
      console.log(chalk.bold('\n压缩配置:'));
      console.log(`  启用压缩: ${chalk.cyan(config.compression.enabled ? '是' : '否')}`);
      if (config.compression.enabled) {
        console.log(`  压缩级别: ${chalk.cyan(config.compression.level)}`);
      }

      // 加密配置
      console.log(chalk.bold('\n加密配置:'));
      console.log(`  启用加密: ${chalk.cyan(config.encryption.enabled ? '是' : '否')}`);
      if (config.encryption.enabled) {
        console.log(`  加密算法: ${chalk.cyan(config.encryption.algorithm)}`);
        console.log(`  密钥路径: ${chalk.cyan(config.encryption.keyPath)}`);
      }

      // 验证配置
      console.log(chalk.bold('\n验证配置:'));
      console.log(`  启用验证: ${chalk.cyan(config.verification.enabled ? '是' : '否')}`);
      if (config.verification.enabled) {
        console.log(`  校验和: ${chalk.cyan(config.verification.checksum ? '是' : '否')}`);
        console.log(`  完整性检查: ${chalk.cyan(config.verification.integrityCheck ? '是' : '否')}`);
      }

      // 通知配置
      console.log(chalk.bold('\n通知配置:'));
      console.log(`  启用通知: ${chalk.cyan(config.notification.enabled ? '是' : '否')}`);
      if (config.notification.enabled) {
        console.log(`  成功时通知: ${chalk.cyan(config.notification.onSuccess ? '是' : '否')}`);
        console.log(`  失败时通知: ${chalk.cyan(config.notification.onFailure ? '是' : '否')}`);
        console.log(`  通知渠道: ${chalk.cyan(config.notification.channels.join(', '))}`);
      }

      // 存储配置
      console.log(chalk.bold('\n存储配置:'));
      console.log(`  最大备份数: ${chalk.cyan(config.storage.maxBackups)}`);
      console.log(`  最大总大小: ${chalk.cyan(formatSize(config.storage.maxTotalSize * 1024 * 1024))}`);
      console.log(`  清理旧备份: ${chalk.cyan(config.storage.cleanupOldBackups ? '是' : '否')}`);

    } catch (error) {
      console.error(chalk.red('✗ 获取配置失败:'), (error as Error).message);
      process.exit(1);
    }
  });

// 帮助命令
program
  .command('help')
  .description('显示帮助信息')
  .action(() => {
    program.help();
  });

// 辅助函数：打印备份表格
function printBackupTable(backups: any[]): void {
  const table = new Table({
    columns: [
      { name: 'id', title: 'ID', alignment: 'left', maxLen: 12 },
      { name: 'name', title: '名称', alignment: 'left', maxLen: 20 },
      { name: 'type', title: '类型', alignment: 'left' },
      { name: 'status', title: '状态', alignment: 'left' },
      { name: 'size', title: '大小', alignment: 'right' },
      { name: 'created', title: '创建时间', alignment: 'left', maxLen: 16 },
      { name: 'age', title: '年龄', alignment: 'left' }
    ]
  });

  const now = Date.now();

  for (const backup of backups) {
    const age = formatAge(now - backup.createdAt.getTime());

    table.addRow({
      id: backup.id.substring(0, 12) + '...',
      name: backup.name,
      type: backup.type,
      status: backup.status,
      size: formatSize(backup.size),
      created: backup.createdAt.toLocaleDateString(),
      age
    }, { color: getStatusColor(backup.status) });
  }

  table.printTable();
}

// 辅助函数：打印备份详情
function printBackupDetails(backup: any): void {
  console.log(chalk.blue('\n=== 备份详情 ==='));
  console.log(`ID: ${chalk.cyan(backup.id)}`);
  console.log(`名称: ${chalk.cyan(backup.name)}`);
  console.log(`类型: ${chalk.cyan(backup.type)}`);
  console.log(`状态: ${chalk[getStatusColor(backup.status)](backup.status)}`);
  console.log(`大小: ${chalk.cyan(formatSize(backup.size))}`);
  console.log(`创建时间: ${chalk.cyan(backup.createdAt.toLocaleString())}`);

  if (backup.completedAt) {
    console.log(`完成时间: ${chalk.cyan(backup.completedAt.toLocaleString())}`);
  }

  if (backup.verifiedAt) {
    console.log(`验证时间: ${chalk.cyan(backup.verifiedAt.toLocaleString())}`);
  }

  if (backup.checksum) {
    console.log(`校验和: ${chalk.cyan(backup.checksum.substring(0, 16) + '...')}`);
  }

  if (backup.retentionDays) {
    console.log(`保留天数: ${chalk.cyan(backup.retentionDays)} 天`);
  }

  if (backup.metadata && Object.keys(backup.metadata).length > 0) {
    console.log(chalk.blue('\n元数据:'));
    for (const [key, value] of Object.entries(backup.metadata)) {
      console.log(`  ${key}: ${chalk.cyan(String(value))}`);
    }
  }
}

// 辅助函数：获取状态颜色
function getStatusColor(status: BackupStatus): string {
  switch (status) {
    case BackupStatus.VERIFIED:
    case BackupStatus.COMPLETED:
      return 'green';
    case BackupStatus.RUNNING:
    case BackupStatus.PENDING:
      return 'yellow';
    case BackupStatus.FAILED:
    case BackupStatus.CORRUPTED:
      return 'red';
    default:
      return 'white';
  }
}

// 辅助函数：格式化文件大小
function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));

  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

// 辅助函数：格式化时间间隔
function formatAge(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return `${seconds}s`;
  }
}

// 解析命令行参数
if (process.argv.length <= 2) {
  program.help();
} else {
  program.parse(process.argv);
}