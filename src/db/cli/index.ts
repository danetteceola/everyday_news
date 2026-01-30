#!/usr/bin/env node

/**
 * 数据库命令行工具入口点
 */

import { program } from 'commander';
import { DatabaseInitializer } from './init';
import { schemaManager } from '../config/schema';
import { indexManager } from '../optimization';
import { connectionManager } from '../config/connection';

// 初始化命令行程序
program
  .name('db-cli')
  .description('Everyday News 数据库管理工具')
  .version('1.0.0');

// 初始化命令
program
  .command('init')
  .description('初始化数据库')
  .option('-f, --force', '强制初始化（如果数据库已存在）')
  .action(async (options) => {
    const initializer = new DatabaseInitializer();
    await initializer.initialize();
  });

// 重置命令
program
  .command('reset')
  .description('重置数据库（删除所有数据）')
  .action(async () => {
    const initializer = new DatabaseInitializer();
    await initializer.reset();
  });

// 状态命令
program
  .command('status')
  .description('检查数据库状态')
  .option('-d, --detailed', '显示详细状态信息')
  .option('-h, --health', '只显示健康状态')
  .option('-j, --json', '以JSON格式输出')
  .action(async (options) => {
    const { connectionManager } = await import('../config/connection');
    const { schemaManager } = await import('../config/schema');
    const { indexManager } = await import('../optimization');
    const { platformRepository } = await import('../repositories/platform.repository');
    const { configManager } = await import('../config');

    try {
      const status = {
        timestamp: new Date(),
        connection: await connectionManager.getStatus(),
        schema: await schemaManager.validateSchema(),
        database: await connectionManager.getDatabaseStats(),
        indexes: await indexManager.analyzeIndexUsage(),
        platforms: await platformRepository.getStats(),
        config: configManager.getConfig()
      };

      if (options.json) {
        console.log(JSON.stringify(status, null, 2));
        return;
      }

      if (options.health) {
        const isHealthy = status.connection.isConnected && status.schema.isValid;
        console.log(isHealthy ? '✅ 数据库健康' : '❌ 数据库不健康');
        process.exit(isHealthy ? 0 : 1);
      }

      console.log('📊 数据库状态检查');
      console.log(`生成时间: ${status.timestamp.toLocaleString()}`);
      console.log();

      // 连接状态
      console.log('🔗 连接状态:');
      console.log(`   状态: ${status.connection.isConnected ? '✅ 已连接' : '❌ 未连接'}`);
      console.log(`   活动连接: ${status.connection.activeConnections}`);
      console.log(`   数据库大小: ${formatSize(status.connection.databaseSize)}`);
      console.log(`   最后活动: ${status.connection.lastActivity?.toLocaleString() || '无'}`);
      if (status.connection.lastError) {
        console.log(`   最后错误: ${status.connection.lastError}`);
      }
      console.log();

      // Schema状态
      console.log('🏗️  Schema状态:');
      console.log(`   完整性: ${status.schema.isValid ? '✅ 完整' : '❌ 不完整'}`);
      console.log(`   错误数: ${status.schema.errors.length}`);
      console.log(`   警告数: ${status.schema.warnings.length}`);
      console.log();

      // 数据库统计
      console.log('📈 数据库统计:');
      console.log(`   表数量: ${status.database.tableCount}`);
      console.log(`   总行数: ${status.database.totalRows}`);
      console.log(`   数据库大小: ${formatSize(status.database.databaseSize)}`);
      console.log();

      // 索引状态
      console.log('⚡ 索引状态:');
      console.log(`   总索引数: ${status.indexes.totalIndexes}`);
      console.log(`   索引总大小: ${formatSize(status.indexes.totalSize)}`);
      console.log(`   使用中的索引: ${status.indexes.usedIndexes}`);
      console.log(`   未使用的索引: ${status.indexes.unusedIndexes}`);
      console.log(`   重复索引: ${status.indexes.duplicateIndexes}`);
      console.log();

      // 平台统计
      console.log('📱 平台统计:');
      console.log(`   总平台数: ${status.platforms.totalPlatforms}`);
      console.log(`   有图标平台: ${status.platforms.platformsWithIcon}`);
      console.log(`   无图标平台: ${status.platforms.platformsWithoutIcon}`);

      if (options.detailed) {
        console.log();
        console.log('🔍 详细配置:');
        console.log(JSON.stringify(status.config, null, 2));

        if (status.schema.errors.length > 0) {
          console.log();
          console.log('❌ Schema错误:');
          status.schema.errors.forEach(error => console.log(`   - ${error}`));
        }

        if (status.schema.warnings.length > 0) {
          console.log();
          console.log('⚠️  Schema警告:');
          status.schema.warnings.forEach(warning => console.log(`   - ${warning}`));
        }
      }

      // 总体健康状态
      const isHealthy = status.connection.isConnected && status.schema.isValid;
      console.log();
      console.log(isHealthy ? '🎉 数据库状态健康' : '⚠️  数据库状态需要关注');

    } catch (error) {
      console.error('❌ 状态检查失败:', error instanceof Error ? error.message : '未知错误');
      process.exit(1);
    }
  });

// Schema命令
program
  .command('schema')
  .description('Schema管理')
  .option('-v, --validate', '验证Schema完整性')
  .option('-d, --document', '生成Schema文档')
  .option('-e, --export', '导出Schema为SQL')
  .action(async (options) => {
    if (options.validate) {
      console.log('🔍 验证Schema完整性...');
      const validation = await schemaManager.validateSchema();

      if (validation.errors.length > 0) {
        console.log('❌ 发现错误:');
        validation.errors.forEach(error => console.log(`  - ${error}`));
      }

      if (validation.warnings.length > 0) {
        console.log('⚠️  发现警告:');
        validation.warnings.forEach(warning => console.log(`  - ${warning}`));
      }

      if (validation.isValid && validation.warnings.length === 0) {
        console.log('✅ Schema验证通过');
      }
    }

    if (options.document) {
      console.log('📄 生成Schema文档...');
      const documentation = await schemaManager.generateSchemaDocumentation();
      console.log('✅ Schema文档已生成');
      // 可以保存到文件
      // require('fs').writeFileSync('schema-documentation.md', documentation);
    }

    if (options.export) {
      console.log('💾 导出Schema为SQL...');
      const sql = await schemaManager.exportSchemaToSQL();
      console.log('✅ Schema已导出为SQL');
      // 可以保存到文件
      // require('fs').writeFileSync('schema-export.sql', sql);
    }

    if (!options.validate && !options.document && !options.export) {
      console.log('请指定一个操作，使用 --help 查看选项');
    }
  });

// 索引命令
program
  .command('index')
  .description('索引管理')
  .option('-a, --analyze', '分析索引使用情况')
  .option('-o, --optimize', '优化索引')
  .option('-r, --report', '生成索引报告')
  .action(async (options) => {
    if (options.analyze) {
      console.log('📊 分析索引使用情况...');
      const stats = await indexManager.analyzeIndexUsage();

      console.log('索引统计:');
      console.log(`  总索引数: ${stats.totalIndexes}`);
      console.log(`  总大小: ${formatSize(stats.totalSize)}`);
      console.log(`  使用中的索引: ${stats.usedIndexes}`);
      console.log(`  未使用的索引: ${stats.unusedIndexes}`);
      console.log(`  重复索引: ${stats.duplicateIndexes}`);
    }

    if (options.optimize) {
      console.log('⚡ 优化索引...');
      const result = await indexManager.optimizeAllIndexes();

      console.log('优化结果:');
      console.log(`  创建索引: ${result.created}`);
      console.log(`  删除索引: ${result.dropped}`);
      console.log(`  重建索引: ${result.rebuilt}`);
    }

    if (options.report) {
      console.log('📋 生成索引报告...');
      const report = await indexManager.generateIndexReport();
      console.log('✅ 索引报告已生成');
      // 可以保存到文件
      // require('fs').writeFileSync('index-report.md', report);
    }

    if (!options.analyze && !options.optimize && !options.report) {
      console.log('请指定一个操作，使用 --help 查看选项');
    }
  });

// 备份命令
program
  .command('backup')
  .description('数据库备份')
  .option('-c, --create', '创建备份')
  .option('-l, --list', '列出备份')
  .option('-r, --restore <backup>', '恢复备份')
  .option('-v, --verify <backup>', '验证备份完整性')
  .option('-d, --delete <backup>', '删除备份')
  .action(async (options) => {
    const { backupManager } = await import('../backup/backup-manager');

    if (options.create) {
      console.log('💾 创建数据库备份...');
      try {
        const backupRecord = await backupManager.createBackup();
        console.log('✅ 备份创建成功:');
        console.log(`   备份ID: ${backupRecord.backupId}`);
        console.log(`   文件名: ${backupRecord.filename}`);
        console.log(`   大小: ${formatSize(backupRecord.size)}`);
        console.log(`   类型: ${backupRecord.type}`);
        console.log(`   创建时间: ${backupRecord.created_at.toLocaleString()}`);
      } catch (error) {
        console.error('❌ 备份创建失败:', error instanceof Error ? error.message : '未知错误');
      }
    } else if (options.list) {
      console.log('📋 列出备份...');
      try {
        const backups = await backupManager.listBackups();

        if (backups.length === 0) {
          console.log('没有找到备份');
        } else {
          console.log(`找到 ${backups.length} 个备份:`);
          backups.forEach(backup => {
            const statusIcon = backup.status === 'completed' ? '✅' :
                             backup.status === 'failed' ? '❌' :
                             backup.status === 'running' ? '🔄' : '⏳';
            console.log(`  ${statusIcon} ${backup.backupId}:`);
            console.log(`    文件名: ${backup.filename}`);
            console.log(`    大小: ${formatSize(backup.size)}`);
            console.log(`    类型: ${backup.type}`);
            console.log(`    状态: ${backup.status}`);
            console.log(`    创建时间: ${backup.created_at.toLocaleString()}`);
            if (backup.expires_at) {
              console.log(`    过期时间: ${backup.expires_at.toLocaleString()}`);
            }
            console.log();
          });
        }
      } catch (error) {
        console.error('❌ 列出备份失败:', error instanceof Error ? error.message : '未知错误');
      }
    } else if (options.restore) {
      console.log(`🔄 恢复备份: ${options.restore}`);
      try {
        await backupManager.restoreBackup({ backupId: options.restore });
        console.log('✅ 备份恢复成功');
      } catch (error) {
        console.error('❌ 备份恢复失败:', error instanceof Error ? error.message : '未知错误');
      }
    } else if (options.verify) {
      console.log(`🔍 验证备份完整性: ${options.verify}`);
      try {
        const verification = await backupManager.verifyBackup(options.verify);
        console.log('🔍 备份验证结果:');
        console.log(`   备份ID: ${verification.backupId}`);
        console.log(`   文件存在: ${verification.fileExists ? '✅' : '❌'}`);
        console.log(`   文件大小: ${formatSize(verification.fileSize)}`);
        console.log(`   校验和匹配: ${verification.checksumMatches ? '✅' : '❌'}`);
        console.log(`   数据库可读: ${verification.databaseReadable ? '✅' : '❌'}`);
        console.log(`   表结构完整: ${verification.schemaIntegrity ? '✅' : '❌'}`);
        console.log(`   数据完整性: ${verification.dataIntegrity ? '✅' : '❌'}`);

        if (verification.issues.length > 0) {
          console.log('⚠️  发现的问题:');
          verification.issues.forEach(issue => console.log(`   - ${issue}`));
        }
      } catch (error) {
        console.error('❌ 备份验证失败:', error instanceof Error ? error.message : '未知错误');
      }
    } else if (options.delete) {
      console.log(`🗑️  删除备份: ${options.delete}`);
      try {
        const deleted = await backupManager.deleteBackup(options.delete);
        if (deleted) {
          console.log('✅ 备份删除成功');
        } else {
          console.log('❌ 备份删除失败：备份不存在或无法删除');
        }
      } catch (error) {
        console.error('❌ 备份删除失败:', error instanceof Error ? error.message : '未知错误');
      }
    } else {
      console.log('请指定一个操作，使用 --help 查看选项');
      console.log('\n可用操作:');
      console.log('  --create    创建新备份');
      console.log('  --list      列出所有备份');
      console.log('  --restore   恢复指定备份');
      console.log('  --verify    验证备份完整性');
      console.log('  --delete    删除指定备份');
    }
  });

// 迁移命令
program
  .command('migrate')
  .description('数据库迁移管理')
  .option('-u, --up [version]', '执行迁移到指定版本（默认最新）')
  .option('-d, --down [version]', '回滚到指定版本')
  .option('-s, --status', '查看迁移状态')
  .option('-c, --create <description>', '创建新的迁移脚本')
  .option('-v, --validate', '验证迁移状态')
  .action(async (options) => {
    const { migrationManager } = await import('../migrations/migration-manager');

    if (options.status) {
      console.log('📊 迁移状态...');
      const stats = await migrationManager.getStats();
      const records = await migrationManager.getMigrationRecords();

      console.log(`当前版本: v${stats.currentVersion}`);
      console.log(`最新版本: v${stats.latestVersion}`);
      console.log(`已完成迁移: ${stats.completedMigrations}/${stats.totalMigrations}`);
      console.log(`待处理迁移: ${stats.pendingMigrations}`);
      console.log(`失败迁移: ${stats.failedMigrations}`);

      if (records.length > 0) {
        console.log('\n迁移记录:');
        records.forEach(record => {
          const statusIcon = record.status === 'completed' ? '✅' :
                           record.status === 'failed' ? '❌' :
                           record.status === 'running' ? '🔄' : '⏳';
          console.log(`  ${statusIcon} v${record.version}: ${record.description} (${record.status})`);
        });
      }
    } else if (options.up !== undefined) {
      const targetVersion = options.up === true ? undefined : parseInt(options.up);
      console.log(`🚀 执行迁移到版本: ${targetVersion || '最新'}`);

      const result = await migrationManager.migrate(targetVersion);
      console.log(`✅ 迁移完成:`);
      console.log(`   应用迁移: ${result.applied}`);
      console.log(`   回滚迁移: ${result.rolledBack}`);
      console.log(`   错误数量: ${result.errors.length}`);

      if (result.errors.length > 0) {
        result.errors.forEach(error => console.log(`   ❌ ${error.message}`));
      }
    } else if (options.down !== undefined) {
      const targetVersion = options.down === true ? 0 : parseInt(options.down);
      console.log(`↩️  回滚迁移到版本: ${targetVersion}`);

      const result = await migrationManager.rollback(targetVersion ? [targetVersion] : undefined);
      console.log(`✅ 回滚完成:`);
      console.log(`   回滚迁移: ${result.rolledBack}`);
      console.log(`   错误数量: ${result.errors.length}`);

      if (result.errors.length > 0) {
        result.errors.forEach(error => console.log(`   ❌ ${error.message}`));
      }
    } else if (options.create) {
      console.log(`📝 创建迁移脚本: ${options.create}`);
      const filepath = await migrationManager.createMigrationTemplate(options.create);
      console.log(`✅ 迁移脚本已创建: ${filepath}`);
    } else if (options.validate) {
      console.log('🔍 验证迁移状态...');
      const validation = await migrationManager.validate();

      if (validation.isValid) {
        console.log('✅ 迁移状态验证通过');
      } else {
        console.log('❌ 迁移状态验证失败:');
        validation.issues.forEach(issue => console.log(`   - ${issue}`));
      }
    } else {
      console.log('请指定一个操作，使用 --help 查看选项');
    }
  });

// 性能监控命令
program
  .command('performance')
  .description('性能监控和优化')
  .option('-m, --monitor', '启动性能监控')
  .option('-r, --report [format]', '生成性能报告 (html/json/text)')
  .option('-a, --alerts', '查看告警')
  .option('-o, --optimize', '执行自动优化')
  .option('-b, --benchmark', '运行性能基准测试')
  .action(async (options) => {
    const { performanceMonitor } = await import('../optimization/performance-monitor');
    const { alertSystem } = await import('../optimization/alert-system');
    const { configOptimizer } = await import('../optimization/config-optimizer');

    if (options.monitor) {
      console.log('📊 启动性能监控...');
      await performanceMonitor.initialize();
      alertSystem.start();
      console.log('✅ 性能监控已启动');
      console.log('按 Ctrl+C 停止监控');

      // 保持进程运行
      process.on('SIGINT', () => {
        console.log('\n🛑 停止性能监控...');
        alertSystem.stop();
        performanceMonitor.stopMonitoring();
        process.exit(0);
      });

      // 保持进程运行
      setInterval(() => {}, 1000);
    } else if (options.report !== undefined) {
      const format = options.report === true ? 'html' : options.report;
      console.log(`📋 生成性能报告 (${format})...`);

      const reportPath = await alertSystem.generatePerformanceReport({
        format: format as any,
        outputDir: './reports'
      });
      console.log(`✅ 性能报告已生成: ${reportPath}`);
    } else if (options.alerts) {
      console.log('🚨 查看告警...');
      const activeAlerts = alertSystem.getActiveAlerts();

      if (activeAlerts.length === 0) {
        console.log('✅ 没有活动告警');
      } else {
        console.log(`发现 ${activeAlerts.length} 个活动告警:`);
        activeAlerts.forEach(alert => {
          const levelIcon = alert.level === 'critical' ? '🔴' :
                          alert.level === 'warning' ? '🟡' :
                          alert.level === 'error' ? '🔴' : '🔵';
          console.log(`  ${levelIcon} [${alert.level.toUpperCase()}] ${alert.title}`);
          console.log(`     ${alert.message}`);
          console.log(`     来源: ${alert.source}, 时间: ${alert.timestamp.toLocaleString()}`);
          console.log();
        });
      }
    } else if (options.optimize) {
      console.log('⚡ 执行自动优化...');
      const result = await configOptimizer.autoTune();

      console.log(`✅ 优化完成:`);
      console.log(`   工作负载模式: ${result.workloadPattern}`);
      console.log(`   应用优化: ${result.appliedCount}`);
      console.log(`   建议数量: ${result.recommendations.length}`);

      if (result.recommendations.length > 0) {
        console.log('\n优化建议:');
        result.recommendations.forEach(rec => {
          const impactIcon = rec.impact === 'high' ? '🔴' :
                           rec.impact === 'medium' ? '🟡' : '🟢';
          console.log(`  ${impactIcon} [${rec.category}] ${rec.setting}: ${rec.description}`);
        });
      }
    } else if (options.benchmark) {
      console.log('🏃 运行性能基准测试...');
      const results = await configOptimizer.runBenchmark();

      console.log('📊 基准测试结果:');
      results.forEach(result => {
        const scoreIcon = result.score >= 80 ? '✅' :
                         result.score >= 60 ? '⚠️' : '❌';
        console.log(`  ${scoreIcon} ${result.testName}: ${result.executionTime}ms (得分: ${result.score})`);
        if (result.recommendations.length > 0) {
          result.recommendations.forEach(rec => console.log(`    💡 ${rec}`));
        }
      });

      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
      console.log(`\n📈 平均得分: ${avgScore.toFixed(1)}`);
    } else {
      console.log('请指定一个操作，使用 --help 查看选项');
    }
  });

// 数据导出导入命令
program
  .command('export')
  .description('导出数据')
  .option('-t, --table <table>', '导出指定表的数据')
  .option('-a, --all', '导出所有表的数据')
  .option('-f, --format <format>', '导出格式 (json/csv)', 'json')
  .option('-o, --output <file>', '输出文件路径')
  .option('-q, --query <query>', '自定义查询语句')
  .action(async (options) => {
    const { dataMigrator } = await import('../migrations/data-migrator');

    try {
      if (!options.table && !options.all && !options.query) {
        console.log('请指定要导出的表或使用 --all 导出所有表');
        return;
      }

      let outputPath = options.output;
      if (!outputPath) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        if (options.table) {
          outputPath = `./exports/${options.table}_${timestamp}.${options.format}`;
        } else if (options.all) {
          outputPath = `./exports/all_tables_${timestamp}.${options.format}`;
        } else {
          outputPath = `./exports/query_${timestamp}.${options.format}`;
        }
      }

      if (options.query) {
        console.log(`📤 导出查询结果到: ${outputPath}`);
        const count = await dataMigrator.exportToJson('', outputPath, options.query);
        console.log(`✅ 导出完成: ${count} 条记录`);
      } else if (options.table) {
        console.log(`📤 导出表 ${options.table} 到: ${outputPath}`);
        const count = await dataMigrator.exportToJson(options.table, outputPath);
        console.log(`✅ 导出完成: ${count} 条记录`);
      } else if (options.all) {
        console.log(`📤 导出所有表到: ${outputPath}`);
        // 获取所有表
        const { connectionManager } = await import('../config/connection');
        const db = await connectionManager.getConnection();
        const tables = await db.all(`
          SELECT name FROM sqlite_master
          WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        `);

        let totalCount = 0;
        for (const table of tables) {
          const tableOutputPath = outputPath.replace('.json', `_${table.name}.json`);
          console.log(`   导出表: ${table.name}`);
          const count = await dataMigrator.exportToJson(table.name, tableOutputPath);
          totalCount += count;
        }

        console.log(`✅ 导出完成: ${totalCount} 条记录 (${tables.length} 个表)`);
      }
    } catch (error) {
      console.error('❌ 导出失败:', error instanceof Error ? error.message : '未知错误');
    }
  });

// 数据导入命令
program
  .command('import')
  .description('导入数据')
  .option('-t, --table <table>', '导入到指定表')
  .option('-f, --file <file>', '要导入的文件路径')
  .option('-d, --dry-run', '干运行模式（不实际导入）')
  .option('-b, --batch-size <size>', '批量大小', '100')
  .action(async (options) => {
    const { dataMigrator } = await import('../migrations/data-migrator');

    if (!options.table || !options.file) {
      console.log('请指定要导入的表和文件路径');
      return;
    }

    try {
      console.log(`📥 导入数据到表 ${options.table}...`);
      console.log(`   文件: ${options.file}`);
      console.log(`   批量大小: ${options.batchSize}`);
      console.log(`   干运行模式: ${options.dryRun ? '是' : '否'}`);

      const result = await dataMigrator.importFromJson(
        options.table,
        options.file,
        {
          batchSize: parseInt(options.batchSize),
          dryRun: options.dryRun,
          logProgress: true
        }
      );

      console.log('✅ 导入完成:');
      console.log(`   处理记录: ${result.totalProcessed}`);
      console.log(`   成功: ${result.totalSucceeded}`);
      console.log(`   失败: ${result.totalFailed}`);
      console.log(`   执行时间: ${result.executionTime}ms`);

      if (result.errors.length > 0) {
        console.log(`   错误数: ${result.errors.length}`);
        result.errors.slice(0, 5).forEach(error => {
          console.log(`     - 记录 ${error.recordId}: ${error.error}`);
        });
        if (result.errors.length > 5) {
          console.log(`     ... 还有 ${result.errors.length - 5} 个错误`);
        }
      }
    } catch (error) {
      console.error('❌ 导入失败:', error instanceof Error ? error.message : '未知错误');
    }
  });

// 配置命令
program
  .command('config')
  .description('数据库配置管理')
  .option('-s, --show', '显示当前配置')
  .option('-a, --analyze', '分析配置优化')
  .option('-o, --optimize', '应用配置优化')
  .option('-t, --tune <pattern>', '基于工作负载调优 (read-heavy/write-heavy/mixed)')
  .action(async (options) => {
    const { configOptimizer } = await import('../optimization/config-optimizer');
    const { configManager } = await import('../config');

    if (options.show) {
      console.log('⚙️  当前数据库配置:');
      const config = configManager.getConfig();
      console.log(JSON.stringify(config, null, 2));
    } else if (options.analyze) {
      console.log('🔍 分析配置优化...');
      const recommendations = await configOptimizer.analyzeConfig();

      if (recommendations.length === 0) {
        console.log('✅ 当前配置已优化');
      } else {
        console.log(`发现 ${recommendations.length} 个优化建议:`);
        recommendations.forEach(rec => {
          const impactIcon = rec.impact === 'high' ? '🔴' :
                           rec.impact === 'medium' ? '🟡' : '🟢';
          console.log(`  ${impactIcon} [${rec.category}] ${rec.setting}:`);
          console.log(`    当前值: ${rec.currentValue}`);
          console.log(`    建议值: ${rec.recommendedValue}`);
          console.log(`    描述: ${rec.description}`);
          if (rec.sqlToApply) {
            console.log(`    SQL: ${rec.sqlToApply}`);
          }
          console.log();
        });
      }
    } else if (options.optimize) {
      console.log('⚡ 应用配置优化...');
      const recommendations = await configOptimizer.analyzeConfig();
      const appliedCount = await configOptimizer.applyOptimizations(recommendations);
      console.log(`✅ 应用了 ${appliedCount} 个优化配置`);
    } else if (options.tune) {
      const pattern = options.tune as 'read-heavy' | 'write-heavy' | 'mixed';
      console.log(`🎯 基于工作负载调优: ${pattern}`);

      const recommendations = await configOptimizer.adaptiveTuning(pattern);
      const appliedCount = await configOptimizer.applyOptimizations(recommendations);
      console.log(`✅ 应用了 ${appliedCount} 个工作负载优化配置`);
    } else {
      console.log('请指定一个操作，使用 --help 查看选项');
    }
  });

// 性能诊断命令
program
  .command('diagnose')
  .description('性能诊断工具')
  .option('-q, --queries', '分析查询性能')
  .option('-i, --indexes', '分析索引性能')
  .option('-c, --config', '分析配置性能')
  .option('-s, --slow', '分析慢查询')
  .option('-a, --all', '执行完整性能诊断')
  .option('-o, --output <file>', '输出诊断报告')
  .action(async (options) => {
    const { performanceMonitor } = await import('../optimization/performance-monitor');
    const { indexManager } = await import('../optimization');
    const { configOptimizer } = await import('../optimization/config-optimizer');
    const { connectionManager } = await import('../config/connection');

    const startTime = Date.now();
    const diagnosis: any = {
      timestamp: new Date(),
      summary: {
        issues: [],
        recommendations: [],
        score: 0
      },
      sections: {}
    };

    try {
      console.log('🔍 开始性能诊断...\n');

      // 执行所有诊断或特定诊断
      const runAll = options.all || (!options.queries && !options.indexes && !options.config && !options.slow);

      // 查询性能诊断
      if (runAll || options.queries) {
        console.log('1. 📊 查询性能分析...');
        const queryStats = performanceMonitor.getQueryStats();
        const slowQueries = performanceMonitor.getSlowQueries(20);

        diagnosis.sections.queries = {
          totalQueries: queryStats.reduce((sum, stat) => sum + stat.executionCount, 0),
          uniqueQueries: queryStats.length,
          avgExecutionTime: queryStats.length > 0
            ? queryStats.reduce((sum, stat) => sum + stat.avgExecutionTime, 0) / queryStats.length
            : 0,
          slowQueryCount: slowQueries.length,
          topSlowQueries: slowQueries.slice(0, 5).map(q => ({
            query: q.query.substring(0, 100) + (q.query.length > 100 ? '...' : ''),
            executionTime: q.executionTime,
            executedAt: q.executedAt
          }))
        };

        // 分析问题
        if (diagnosis.sections.queries.avgExecutionTime > 100) {
          diagnosis.summary.issues.push('平均查询执行时间较高');
          diagnosis.summary.recommendations.push('考虑优化频繁查询或添加索引');
        }

        if (diagnosis.sections.queries.slowQueryCount > 10) {
          diagnosis.summary.issues.push('发现多个慢查询');
          diagnosis.summary.recommendations.push('分析慢查询模式并优化');
        }

        console.log(`   ✅ 完成: ${queryStats.length} 个查询分析`);
      }

      // 索引性能诊断
      if (runAll || options.indexes) {
        console.log('2. ⚡ 索引性能分析...');
        const indexStats = await indexManager.analyzeIndexUsage();
        const indexSuggestions = await indexManager.generateOptimizationSuggestions();

        diagnosis.sections.indexes = {
          totalIndexes: indexStats.totalIndexes,
          totalSize: indexStats.totalSize,
          usedIndexes: indexStats.usedIndexes,
          unusedIndexes: indexStats.unusedIndexes,
          duplicateIndexes: indexStats.duplicateIndexes,
          optimizationSuggestions: indexSuggestions.length
        };

        // 分析问题
        if (diagnosis.sections.indexes.unusedIndexes > 0) {
          diagnosis.summary.issues.push(`发现 ${diagnosis.sections.indexes.unusedIndexes} 个未使用索引`);
          diagnosis.summary.recommendations.push('考虑删除未使用索引以节省空间');
        }

        if (diagnosis.sections.indexes.duplicateIndexes > 0) {
          diagnosis.summary.issues.push(`发现 ${diagnosis.sections.indexes.duplicateIndexes} 个重复索引`);
          diagnosis.summary.recommendations.push('删除重复索引以提高写入性能');
        }

        console.log(`   ✅ 完成: ${indexStats.totalIndexes} 个索引分析`);
      }

      // 配置性能诊断
      if (runAll || options.config) {
        console.log('3. ⚙️  配置性能分析...');
        const configRecommendations = await configOptimizer.analyzeConfig();
        const benchmarkResults = await configOptimizer.runBenchmark();

        diagnosis.sections.config = {
          recommendations: configRecommendations.length,
          highImpact: configRecommendations.filter(r => r.impact === 'high').length,
          mediumImpact: configRecommendations.filter(r => r.impact === 'medium').length,
          lowImpact: configRecommendations.filter(r => r.impact === 'low').length,
          benchmarkScore: benchmarkResults.reduce((sum, r) => sum + r.score, 0) / benchmarkResults.length
        };

        // 分析问题
        if (diagnosis.sections.config.highImpact > 0) {
          diagnosis.summary.issues.push(`发现 ${diagnosis.sections.config.highImpact} 个高影响配置问题`);
          diagnosis.summary.recommendations.push('立即应用高影响配置优化');
        }

        if (diagnosis.sections.config.benchmarkScore < 70) {
          diagnosis.summary.issues.push('性能基准测试分数较低');
          diagnosis.summary.recommendations.push('优化数据库配置和查询');
        }

        console.log(`   ✅ 完成: ${configRecommendations.length} 个配置建议`);
      }

      // 慢查询诊断
      if (runAll || options.slow) {
        console.log('4. 🐌 慢查询深度分析...');
        const slowQueries = performanceMonitor.getSlowQueries(50);
        const recentSlowQueries = slowQueries.filter(q =>
          Date.now() - q.executedAt.getTime() < 24 * 60 * 60 * 1000 // 24小时内
        );

        diagnosis.sections.slowQueries = {
          total: slowQueries.length,
          recent: recentSlowQueries.length,
          patterns: analyzeQueryPatterns(slowQueries),
          worstQuery: slowQueries.length > 0 ? {
            query: slowQueries[0].query.substring(0, 150) + (slowQueries[0].query.length > 150 ? '...' : ''),
            executionTime: slowQueries[0].executionTime,
            executedAt: slowQueries[0].executedAt
          } : null
        };

        // 分析问题
        if (diagnosis.sections.slowQueries.recent > 20) {
          diagnosis.summary.issues.push('近期慢查询数量较多');
          diagnosis.summary.recommendations.push('优化查询或添加适当索引');
        }

        console.log(`   ✅ 完成: ${slowQueries.length} 个慢查询分析`);
      }

      // 数据库连接诊断
      console.log('5. 🔗 数据库连接诊断...');
      const connectionStatus = connectionManager.getStatus();
      const dbStats = await connectionManager.getDatabaseStats();

      diagnosis.sections.connection = {
        isConnected: connectionStatus.isConnected,
        activeConnections: connectionStatus.activeConnections,
        databaseSize: connectionStatus.databaseSize,
        tableCount: dbStats.tableCount,
        totalRows: dbStats.totalRows
      };

      // 分析问题
      if (!diagnosis.sections.connection.isConnected) {
        diagnosis.summary.issues.push('数据库连接异常');
        diagnosis.summary.recommendations.push('检查数据库文件和连接配置');
      }

      if (diagnosis.sections.connection.databaseSize > 1024 * 1024 * 500) { // 500MB
        diagnosis.summary.issues.push('数据库文件较大');
        diagnosis.summary.recommendations.push('考虑数据归档或分区');
      }

      console.log(`   ✅ 完成: 连接状态检查`);

      // 计算总体分数
      let score = 100;
      const issuePenalty = 10;
      score -= diagnosis.summary.issues.length * issuePenalty;

      // 根据具体问题调整分数
      if (diagnosis.sections.queries?.avgExecutionTime > 200) score -= 20;
      if (diagnosis.sections.indexes?.unusedIndexes > 5) score -= 15;
      if (diagnosis.sections.config?.highImpact > 0) score -= 25;
      if (diagnosis.sections.slowQueries?.recent > 30) score -= 20;
      if (!diagnosis.sections.connection.isConnected) score = 0;

      diagnosis.summary.score = Math.max(0, Math.min(100, score));
      diagnosis.executionTime = Date.now() - startTime;

      // 输出诊断结果
      console.log('\n📋 诊断结果:');
      console.log(`   执行时间: ${diagnosis.executionTime}ms`);
      console.log(`   总体评分: ${diagnosis.summary.score}/100`);

      if (diagnosis.summary.score >= 80) {
        console.log('   🎉 性能状态: 优秀');
      } else if (diagnosis.summary.score >= 60) {
        console.log('   ⚠️  性能状态: 一般');
      } else {
        console.log('   ❌ 性能状态: 需要优化');
      }

      if (diagnosis.summary.issues.length > 0) {
        console.log('\n🚨 发现的问题:');
        diagnosis.summary.issues.forEach(issue => console.log(`   - ${issue}`));
      }

      if (diagnosis.summary.recommendations.length > 0) {
        console.log('\n💡 优化建议:');
        diagnosis.summary.recommendations.forEach(rec => console.log(`   - ${rec}`));
      }

      // 保存诊断报告
      if (options.output) {
        const fs = await import('fs');
        const path = await import('path');
        const outputDir = path.dirname(options.output);
        if (!fs.existsSync(outputDir)) {
          fs.mkdirSync(outputDir, { recursive: true });
        }
        fs.writeFileSync(options.output, JSON.stringify(diagnosis, null, 2), 'utf8');
        console.log(`\n📄 诊断报告已保存: ${options.output}`);
      }

    } catch (error) {
      console.error('❌ 性能诊断失败:', error instanceof Error ? error.message : '未知错误');
    }
  });

// 辅助函数：分析查询模式
function analyzeQueryPatterns(queries: any[]): string[] {
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
}

// 监控仪表板命令
program
  .command('dashboard')
  .description('数据库监控仪表板')
  .option('-w, --web', '启动Web仪表板')
  .option('-t, --text', '显示文本仪表板')
  .option('-u, --update <seconds>', '自动更新间隔（秒）', '5')
  .action(async (options) => {
    const { alertSystem } = await import('../optimization/alert-system');
    const { performanceMonitor } = await import('../optimization/performance-monitor');
    const { queryCache } = await import('../optimization/query-cache');

    if (options.web) {
      console.log('🌐 Web仪表板功能将在后续版本中实现');
      console.log('当前可以使用 --text 选项查看文本仪表板');
      return;
    }

    // 文本仪表板
    if (options.text || (!options.web && !options.text)) {
      const updateInterval = parseInt(options.update) * 1000;
      let isRunning = true;

      console.log('📊 数据库监控仪表板');
      console.log('按 Ctrl+C 退出\n');

      // 处理退出
      process.on('SIGINT', () => {
        console.log('\n🛑 停止监控仪表板...');
        isRunning = false;
        process.exit(0);
      });

      // 更新循环
      while (isRunning) {
        try {
          await updateDashboard(alertSystem, performanceMonitor, queryCache);
          await new Promise(resolve => setTimeout(resolve, updateInterval));
        } catch (error) {
          console.error('仪表板更新失败:', error);
          break;
        }
      }
    }
  });

// 更新仪表板显示
async function updateDashboard(
  alertSystem: any,
  performanceMonitor: any,
  queryCache: any
): Promise<void> {
  const timestamp = new Date();

  // 清屏（跨平台）
  process.stdout.write('\x1Bc');

  console.log('📊 数据库监控仪表板');
  console.log(`更新时间: ${timestamp.toLocaleTimeString()}`);
  console.log('='.repeat(60));

  // 1. 数据库状态
  console.log('\n🔗 数据库状态');
  console.log('─'.repeat(40));

  const { connectionManager } = await import('../config/connection');
  const connectionStatus = connectionManager.getStatus();
  const dbStats = await connectionManager.getDatabaseStats();

  console.log(`状态: ${connectionStatus.isConnected ? '✅ 运行中' : '❌ 停止'}`);
  console.log(`连接数: ${connectionStatus.activeConnections}`);
  console.log(`数据库大小: ${formatSize(connectionStatus.databaseSize)}`);
  console.log(`表数量: ${dbStats.tableCount}`);
  console.log(`总行数: ${dbStats.totalRows.toLocaleString()}`);

  // 2. 性能指标
  console.log('\n⚡ 性能指标');
  console.log('─'.repeat(40));

  const queryStats = performanceMonitor.getQueryStats();
  const totalQueries = queryStats.reduce((sum, stat) => sum + stat.executionCount, 0);
  const avgQueryTime = queryStats.length > 0
    ? queryStats.reduce((sum, stat) => sum + stat.avgExecutionTime, 0) / queryStats.length
    : 0;
  const slowQueries = performanceMonitor.getSlowQueries(1000).length;

  console.log(`查询总数: ${totalQueries.toLocaleString()}`);
  console.log(`平均查询时间: ${avgQueryTime.toFixed(2)}ms`);
  console.log(`慢查询数: ${slowQueries}`);

  // 3. 缓存状态
  console.log('\n💾 缓存状态');
  console.log('─'.repeat(40));

  const cacheStats = queryCache.getStats();
  console.log(`缓存项数: ${cacheStats.totalItems}`);
  console.log(`缓存大小: ${formatSize(cacheStats.cacheSize)}`);
  console.log(`命中率: ${cacheStats.hitRate.toFixed(2)}%`);
  console.log(`命中数: ${cacheStats.totalHits}`);
  console.log(`未命中数: ${cacheStats.totalMisses}`);

  // 4. 告警状态
  console.log('\n🚨 告警状态');
  console.log('─'.repeat(40));

  const activeAlerts = alertSystem.getActiveAlerts();
  const criticalAlerts = activeAlerts.filter((a: any) => a.level === 'critical');
  const warningAlerts = activeAlerts.filter((a: any) => a.level === 'warning');
  const infoAlerts = activeAlerts.filter((a: any) => a.level === 'info');

  console.log(`活动告警: ${activeAlerts.length}`);
  console.log(`严重: ${criticalAlerts.length} ⚠️ 警告: ${warningAlerts.length} ℹ️ 信息: ${infoAlerts.length}`);

  if (activeAlerts.length > 0) {
    console.log('\n最新告警:');
    activeAlerts.slice(0, 3).forEach((alert: any) => {
      const levelIcon = alert.level === 'critical' ? '🔴' :
                      alert.level === 'warning' ? '🟡' : '🔵';
      console.log(`  ${levelIcon} ${alert.title}`);
      console.log(`     ${alert.message.substring(0, 50)}${alert.message.length > 50 ? '...' : ''}`);
    });
  }

  // 5. 系统资源
  console.log('\n🖥️  系统资源');
  console.log('─'.repeat(40));

  const memoryUsage = process.memoryUsage();
  const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

  console.log(`内存使用: ${formatSize(memoryUsage.heapUsed)} / ${formatSize(memoryUsage.heapTotal)} (${memoryPercent.toFixed(1)}%)`);
  console.log(`运行时间: ${Math.floor(process.uptime() / 60)}分钟`);

  // 6. 建议操作
  console.log('\n💡 建议操作');
  console.log('─'.repeat(40));

  const suggestions: string[] = [];

  if (slowQueries > 10) {
    suggestions.push('运行 `db-cli diagnose --slow` 分析慢查询');
  }

  if (cacheStats.hitRate < 30) {
    suggestions.push('运行 `db-cli config --optimize` 优化配置');
  }

  if (activeAlerts.length > 5) {
    suggestions.push('运行 `db-cli performance --alerts` 查看告警详情');
  }

  if (connectionStatus.databaseSize > 1024 * 1024 * 100) { // 100MB
    suggestions.push('考虑运行 `db-cli backup --create` 创建备份');
  }

  if (suggestions.length === 0) {
    console.log('✅ 系统运行正常，无需立即操作');
  } else {
    suggestions.forEach((suggestion, index) => {
      console.log(`${index + 1}. ${suggestion}`);
    });
  }

  console.log('\n' + '='.repeat(60));
  console.log('按 Ctrl+C 退出 | 自动更新中...');
}

// 迁移命令
program
  .command('migrate')
  .description('数据库迁移')
  .option('-u, --up', '执行升级迁移')
  .option('-d, --down', '执行降级迁移')
  .option('-s, --status', '查看迁移状态')
  .action(async (options) => {
    // 迁移功能将在后续实现
    console.log('迁移功能将在后续版本中实现');
  });

// 测试命令
program
  .command('test')
  .description('测试数据库连接和功能')
  .action(async () => {
    console.log('🧪 测试数据库...\n');

    try {
      // 测试连接
      console.log('1. 测试数据库连接...');
      const isHealthy = await connectionManager.healthCheck();
      if (isHealthy) {
        console.log('   ✅ 连接测试通过');
      } else {
        console.log('   ❌ 连接测试失败');
        return;
      }

      // 测试Schema
      console.log('\n2. 测试Schema完整性...');
      const validation = await schemaManager.validateSchema();
      if (validation.isValid) {
        console.log('   ✅ Schema测试通过');
      } else {
        console.log('   ❌ Schema测试失败');
        validation.errors.forEach(error => console.log(`     - ${error}`));
        return;
      }

      // 测试统计
      console.log('\n3. 测试数据库统计...');
      const stats = await connectionManager.getDatabaseStats();
      console.log(`   ✅ 统计测试通过:`);
      console.log(`     表数量: ${stats.tableCount}`);
      console.log(`     总行数: ${stats.totalRows}`);

      console.log('\n🎉 所有测试通过！');

    } catch (error) {
      console.error('\n❌ 测试失败:');
      console.error(error instanceof Error ? error.message : '未知错误');
    }
  });

// 帮助函数：格式化大小
function formatSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// 解析命令行参数
if (require.main === module) {
  program.parse(process.argv);
}

export { program };