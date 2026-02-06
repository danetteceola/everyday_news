/**
 * 数据采集服务
 * 作为独立服务运行数据采集任务
 */

import { collectionFramework } from './collection-framework';
import { CollectionLogger, createCollectorLogger } from './utils/logger';
import { CollectionConfigManager } from './config-manager';
import { PlatformType } from './types/news-item';
import { monitoringService } from './monitoring/monitoring-service';

// 导入所有采集器
import { TwitterCollector } from './collectors/twitter-collector';
import { YouTubeCollector } from './collectors/youtube-collector';
import { TikTokCollector } from './collectors/tiktok-collector';
import { WeiboCollector } from './collectors/weibo-collector';
import { DouyinCollector } from './collectors/douyin-collector';

const logger = createCollectorLogger('collection-service');

/**
 * 注册所有采集器
 */
async function registerAllCollectors(): Promise<void> {
  logger.info('开始注册所有采集器...');

  try {
    // 创建配置管理器
    const configManager = new CollectionConfigManager();
    await configManager.loadConfig();

    // 获取启用的平台配置
    const enabledPlatforms = configManager.getEnabledPlatformConfigs();

    // 注册启用的采集器
    for (const platformConfig of enabledPlatforms) {
      try {
        switch (platformConfig.platform as PlatformType) {
          case 'twitter':
            const twitterCollector = new TwitterCollector();
            collectionFramework.registerCollector(twitterCollector);
            logger.info(`注册Twitter采集器: ${twitterCollector.name}`);
            break;

          case 'youtube':
            const youtubeCollector = new YouTubeCollector();
            collectionFramework.registerCollector(youtubeCollector);
            logger.info(`注册YouTube采集器: ${youtubeCollector.name}`);
            break;

          case 'tiktok':
            const tiktokCollector = new TikTokCollector();
            collectionFramework.registerCollector(tiktokCollector);
            logger.info(`注册TikTok采集器: ${tiktokCollector.name}`);
            break;

          case 'weibo':
            const weiboCollector = new WeiboCollector();
            collectionFramework.registerCollector(weiboCollector);
            logger.info(`注册微博采集器: ${weiboCollector.name}`);
            break;

          case 'douyin':
            const douyinCollector = new DouyinCollector();
            collectionFramework.registerCollector(douyinCollector);
            logger.info(`注册抖音采集器: ${douyinCollector.name}`);
            break;

          default:
            logger.warn(`未知平台类型: ${platformConfig.platform}`);
        }
      } catch (error) {
        logger.error(`注册采集器失败 (平台: ${platformConfig.platform})`, error as Error);
      }
    }

    logger.info(`采集器注册完成，共注册 ${enabledPlatforms.length} 个采集器`);
  } catch (error) {
    logger.error('注册采集器过程中发生错误', error as Error);
    throw error;
  }
}

/**
 * 启动采集服务
 */
async function startCollectionService(): Promise<void> {
  logger.info('启动数据采集服务...');

  try {
    // 初始化采集框架
    await collectionFramework.initialize();
    logger.info('采集框架初始化完成');

    // 注册所有采集器
    await registerAllCollectors();

    // 获取任务管理器
    const taskManager = collectionFramework.getTaskManager();
    if (taskManager) {
      // 启动任务调度
      taskManager.startScheduler();
      logger.info('任务调度器已启动');

      // 显示任务状态
      const tasks = taskManager.getAllTasks();
      logger.info(`当前有 ${tasks.length} 个任务已配置`);

      for (const task of tasks) {
        logger.info(`任务: ${task.name} (${task.platform}), 状态: ${task.status}, 调度: ${task.schedule}`);
      }
    } else {
      logger.warn('任务管理器未启用，将使用手动采集模式');
    }

    // 启动监控服务
    try {
      await monitoringService.start();
      logger.info(`监控服务已启动，端口: ${monitoringService.getPort()}`);
      logger.info(`监控指标端点: http://localhost:${monitoringService.getPort()}/metrics`);
      logger.info(`健康检查端点: http://localhost:${monitoringService.getPort()}/health`);
      logger.info(`状态信息端点: http://localhost:${monitoringService.getPort()}/status`);
    } catch (error) {
      logger.error('启动监控服务失败', error as Error);
      // 监控服务失败不影响主服务运行
    }

    logger.info('数据采集服务启动完成，等待任务执行...');

    // 保持服务运行
    process.on('SIGINT', async () => {
      logger.info('收到停止信号，正在清理资源...');
      await cleanupServices();
      logger.info('数据采集服务已停止');
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      logger.info('收到终止信号，正在清理资源...');
      await cleanupServices();
      logger.info('数据采集服务已停止');
      process.exit(0);
    });

    // 保持进程运行
    setInterval(() => {
      // 心跳检测
      const status = collectionFramework.getStatus();
      logger.debug(`服务运行中，采集器数量: ${status.totalCollectors}, 最近采集: ${status.recentCollections.length} 次`);
    }, 60000); // 每分钟记录一次状态

  } catch (error) {
    logger.error('启动数据采集服务失败', error as Error);
    await cleanupServices();
    process.exit(1);
  }
}

/**
 * 清理所有服务
 */
async function cleanupServices(): Promise<void> {
  try {
    // 停止监控服务
    await monitoringService.stop();
    logger.info('监控服务已停止');
  } catch (error) {
    logger.warn('停止监控服务失败', error as Error);
  }

  try {
    // 清理采集框架
    await collectionFramework.cleanup();
    logger.info('采集框架已清理');
  } catch (error) {
    logger.warn('清理采集框架失败', error as Error);
  }
}

/**
 * 执行手动采集
 */
async function executeManualCollection(options?: {
  platforms?: PlatformType[];
  collectorNames?: string[];
}): Promise<void> {
  logger.info('开始执行手动采集...');

  try {
    const results = await collectionFramework.collect(options);

    logger.info(`手动采集完成，共执行 ${results.length} 个采集任务`);

    for (const result of results) {
      if (result.status === 'success') {
        logger.info(`平台 ${result.platform}: 采集到 ${result.itemsCollected} 个项，清洗后 ${result.itemsAfterCleaning} 个项`);
      } else {
        logger.warn(`平台 ${result.platform}: 采集失败 - ${result.error}`);
      }
    }

  } catch (error) {
    logger.error('手动采集执行失败', error as Error);
    throw error;
  }
}

/**
 * 显示服务状态
 */
function showServiceStatus(): void {
  const status = collectionFramework.getStatus();

  console.log('\n=== 数据采集服务状态 ===');
  console.log(`框架状态: ${status.isInitialized ? '已初始化' : '未初始化'}`);
  console.log(`采集器总数: ${status.totalCollectors}`);

  console.log('\n按平台统计:');
  for (const [platform, count] of Object.entries(status.collectorsByPlatform)) {
    console.log(`  ${platform}: ${count} 个采集器`);
  }

  console.log('\n系统状态:');
  console.log(`  反爬系统: ${status.antiCrawlingStatus.enabled ? '启用' : '禁用'} (${status.antiCrawlingStatus.isInitialized ? '已初始化' : '未初始化'})`);
  console.log(`  数据清洗: ${status.dataCleaningStatus.enabled ? '启用' : '禁用'} (${status.dataCleaningStatus.isInitialized ? '已初始化' : '未初始化'})`);
  console.log(`  任务管理: ${status.taskManagementStatus.enabled ? '启用' : '禁用'} (${status.taskManagementStatus.isInitialized ? '已初始化' : '未初始化'})`);

  if (status.recentCollections.length > 0) {
    console.log('\n最近采集记录:');
    for (const collection of status.recentCollections.slice(0, 5)) {
      console.log(`  ${collection.platform}: ${collection.itemsCollected} 个项, 状态: ${collection.status}, 时间: ${collection.timestamp.toLocaleString()}`);
    }
  }

  console.log('\n');
}

// 命令行接口
if (require.main === module) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    // 默认启动服务模式
    startCollectionService().catch(error => {
      logger.error('服务启动失败', error);
      process.exit(1);
    });
  } else {
    const command = args[0];

    switch (command) {
      case 'start':
        startCollectionService().catch(error => {
          logger.error('服务启动失败', error);
          process.exit(1);
        });
        break;

      case 'collect':
        const platforms = args[1] ? args[1].split(',') as PlatformType[] : undefined;
        executeManualCollection({ platforms }).catch(error => {
          logger.error('手动采集失败', error);
          process.exit(1);
        });
        break;

      case 'status':
        collectionFramework.initialize()
          .then(() => showServiceStatus())
          .then(() => collectionFramework.cleanup())
          .catch(error => {
            logger.error('获取状态失败', error);
            process.exit(1);
          });
        break;

      case 'help':
      default:
        console.log(`
数据采集服务使用说明:

命令:
  node collection-service.js [start]    启动采集服务（默认）
  node collection-service.js collect [platforms]  执行手动采集
  node collection-service.js status     显示服务状态
  node collection-service.js help       显示此帮助信息

参数:
  platforms: 逗号分隔的平台列表，如: twitter,youtube,weibo

示例:
  node collection-service.js                    # 启动服务
  node collection-service.js collect twitter    # 采集Twitter
  node collection-service.js status             # 显示状态
        `);
        process.exit(0);
    }
  }
}

export {
  startCollectionService,
  executeManualCollection,
  showServiceStatus
};