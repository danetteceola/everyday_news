#!/usr/bin/env node

import { schemaManager } from '../config/schema';
import { platformRepository } from '../repositories/platform.repository';
import { connectionManager } from '../config/connection';
import { configManager } from '../config';
import { indexManager } from '../optimization';

/**
 * 数据库初始化工具
 */
class DatabaseInitializer {
  /**
   * 初始化数据库
   */
  public async initialize(): Promise<void> {
    console.log('🚀 开始初始化数据库...\n');

    try {
      // 1. 检查数据库配置
      console.log('📋 检查数据库配置...');
      const config = configManager.getConfig();
      console.log(`   数据库路径: ${config.databasePath}`);
      console.log(`   备份路径: ${config.backupPath}`);
      console.log(`   最大连接数: ${config.maxConnections}`);
      console.log(`   超时时间: ${config.timeout}ms\n`);

      // 2. 检查数据库连接
      console.log('🔗 测试数据库连接...');
      const isHealthy = await connectionManager.healthCheck();
      if (!isHealthy) {
        throw new Error('数据库连接测试失败');
      }
      console.log('   ✅ 数据库连接正常\n');

      // 3. 初始化Schema
      console.log('🏗️  初始化数据库Schema...');
      await schemaManager.initializeSchema();
      console.log('   ✅ Schema初始化完成\n');

      // 4. 初始化默认平台
      console.log('📱 初始化默认平台...');
      const platforms = await platformRepository.initializeDefaultPlatforms();
      console.log(`   ✅ 已初始化 ${platforms.length} 个平台\n`);

      // 5. 验证Schema完整性
      console.log('🔍 验证Schema完整性...');
      const validation = await schemaManager.validateSchema();

      if (validation.errors.length > 0) {
        console.log('   ⚠️  Schema验证发现错误:');
        validation.errors.forEach(error => console.log(`     - ${error}`));
      }

      if (validation.warnings.length > 0) {
        console.log('   ⚠️  Schema验证发现警告:');
        validation.warnings.forEach(warning => console.log(`     - ${warning}`));
      }

      if (validation.isValid) {
        console.log('   ✅ Schema验证通过\n');
      } else {
        console.log('   ❌ Schema验证失败\n');
      }

      // 6. 优化索引
      console.log('⚡ 优化数据库索引...');
      const optimizationResult = await indexManager.optimizeAllIndexes();
      console.log(`   ✅ 索引优化完成:`);
      console.log(`     创建索引: ${optimizationResult.created}`);
      console.log(`     删除索引: ${optimizationResult.dropped}`);
      console.log(`     重建索引: ${optimizationResult.rebuilt}\n`);

      // 7. 获取数据库统计信息
      console.log('📊 获取数据库统计信息...');
      const stats = await connectionManager.getDatabaseStats();
      console.log(`   ✅ 数据库统计:`);
      console.log(`     表数量: ${stats.tableCount}`);
      console.log(`     总行数: ${stats.totalRows}`);
      console.log(`     数据库大小: ${this.formatSize(stats.databaseSize)}\n`);

      // 8. 生成Schema文档
      console.log('📄 生成Schema文档...');
      const documentation = await schemaManager.generateSchemaDocumentation();
      // 这里可以保存文档到文件
      console.log('   ✅ Schema文档已生成\n');

      console.log('🎉 数据库初始化完成！');
      console.log('\n下一步:');
      console.log('1. 运行测试: npm test');
      console.log('2. 启动服务: npm run dev');
      console.log('3. 查看数据库状态: node dist/db/cli/status.js');

    } catch (error) {
      console.error('\n❌ 数据库初始化失败:');
      console.error(error instanceof Error ? error.message : '未知错误');
      process.exit(1);
    }
  }

  /**
   * 重置数据库（危险操作）
   */
  public async reset(): Promise<void> {
    console.log('⚠️  警告：这将删除所有数据并重置数据库！');
    console.log('请输入 "YES" 确认操作:');

    // 等待用户确认
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    return new Promise((resolve, reject) => {
      rl.question('> ', async (answer) => {
        rl.close();

        if (answer !== 'YES') {
          console.log('操作已取消');
          resolve();
          return;
        }

        try {
          const config = configManager.getConfig();

          console.log('\n🗑️  删除数据库文件...');
          const fs = require('fs');
          if (fs.existsSync(config.databasePath)) {
            fs.unlinkSync(config.databasePath);
            console.log('   ✅ 数据库文件已删除');
          }

          console.log('\n🔄 重新初始化数据库...');
          await this.initialize();

          console.log('\n✅ 数据库重置完成');
          resolve();
        } catch (error) {
          console.error('\n❌ 数据库重置失败:');
          console.error(error instanceof Error ? error.message : '未知错误');
          reject(error);
        }
      });
    });
  }

  /**
   * 检查数据库状态
   */
  public async status(): Promise<void> {
    console.log('📊 数据库状态检查...\n');

    try {
      // 检查连接
      console.log('🔗 连接状态:');
      const connectionStatus = connectionManager.getStatus();
      console.log(`   连接状态: ${connectionStatus.isConnected ? '✅ 已连接' : '❌ 未连接'}`);
      console.log(`   活动连接: ${connectionStatus.activeConnections}`);
      console.log(`   数据库大小: ${this.formatSize(connectionStatus.databaseSize)}`);
      console.log(`   最后活动: ${connectionStatus.lastActivity?.toLocaleString() || '无'}`);
      if (connectionStatus.lastError) {
        console.log(`   最后错误: ${connectionStatus.lastError}`);
      }
      console.log();

      // 检查Schema
      console.log('🏗️  Schema状态:');
      const validation = await schemaManager.validateSchema();
      console.log(`   完整性: ${validation.isValid ? '✅ 完整' : '❌ 不完整'}`);
      console.log(`   错误数: ${validation.errors.length}`);
      console.log(`   警告数: ${validation.warnings.length}`);
      console.log();

      // 数据库统计
      console.log('📈 数据库统计:');
      const stats = await connectionManager.getDatabaseStats();
      console.log(`   表数量: ${stats.tableCount}`);
      console.log(`   总行数: ${stats.totalRows}`);
      console.log(`   数据库大小: ${this.formatSize(stats.databaseSize)}`);
      console.log();

      // 索引状态
      console.log('⚡ 索引状态:');
      const indexStats = await indexManager.analyzeIndexUsage();
      console.log(`   总索引数: ${indexStats.totalIndexes}`);
      console.log(`   索引总大小: ${this.formatSize(indexStats.totalSize)}`);
      console.log(`   使用中的索引: ${indexStats.usedIndexes}`);
      console.log(`   未使用的索引: ${indexStats.unusedIndexes}`);
      console.log(`   重复索引: ${indexStats.duplicateIndexes}`);
      console.log();

      // 平台统计
      console.log('📱 平台统计:');
      const platformStats = await platformRepository.getStats();
      console.log(`   总平台数: ${platformStats.totalPlatforms}`);
      console.log(`   有图标平台: ${platformStats.platformsWithIcon}`);
      console.log(`   无图标平台: ${platformStats.platformsWithoutIcon}`);

    } catch (error) {
      console.error('\n❌ 状态检查失败:');
      console.error(error instanceof Error ? error.message : '未知错误');
    }
  }

  /**
   * 格式化大小
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// CLI入口点
async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'init';

  const initializer = new DatabaseInitializer();

  switch (command) {
    case 'init':
      await initializer.initialize();
      break;

    case 'reset':
      await initializer.reset();
      break;

    case 'status':
      await initializer.status();
      break;

    case 'help':
      console.log(`
数据库管理工具

用法:
  node dist/db/cli/init.js [command]

命令:
  init    初始化数据库（默认）
  reset   重置数据库（删除所有数据）
  status  检查数据库状态
  help    显示帮助信息

示例:
  node dist/db/cli/init.js init
  node dist/db/cli/init.js status
      `);
      break;

    default:
      console.error(`未知命令: ${command}`);
      console.error('使用 "help" 查看可用命令');
      process.exit(1);
  }
}

// 如果是直接运行此文件
if (require.main === module) {
  main().catch(error => {
    console.error('程序执行失败:', error);
    process.exit(1);
  });
}

export { DatabaseInitializer };