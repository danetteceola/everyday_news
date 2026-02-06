/**
 * 数据采集模块入口文件
 * 导出所有采集相关组件
 */

// 类型定义
export * from './types/news-item';

// 工具类
export * from './utils/logger';
export * from './utils/error-handler';

// 反爬系统
export * from './anti-crawling/anti-crawling-system';
export * from './anti-crawling/request-delay-manager';

// 采集器
export * from './collectors/twitter-collector';
export * from './collectors/twitter-api-client';
export * from './collectors/twitter-web-scraper';
export * from './collectors/youtube-collector';
export * from './collectors/youtube-web-scraper';
export * from './collectors/tiktok-collector';
export * from './collectors/tiktok-web-scraper';
export * from './collectors/weibo-collector';
export * from './collectors/weibo-web-scraper';
export * from './collectors/douyin-collector';
export * from './collectors/douyin-web-scraper';

// 数据清洗
export * from './data-cleaner';

// 任务管理
export * from './task-manager/collection-task-manager';

// 统一框架
export * from './collection-framework';

// 默认实例
import { collectionFramework } from './collection-framework';
export { collectionFramework };

/**
 * 初始化数据采集模块
 */
export async function initializeCollectionModule(config?: any): Promise<void> {
  console.log('初始化数据采集模块...');

  try {
    // 这里可以添加模块初始化逻辑
    // 例如：注册所有采集器到统一框架

    console.log('数据采集模块初始化完成');
  } catch (error) {
    console.error('数据采集模块初始化失败:', error);
    throw error;
  }
}

/**
 * 获取模块版本信息
 */
export function getModuleVersion(): string {
  return '1.0.0';
}

/**
 * 获取模块状态
 */
export async function getModuleStatus(): Promise<{
  version: string;
  initialized: boolean;
  components: {
    collectors: number;
    antiCrawling: boolean;
    dataCleaning: boolean;
    taskManagement: boolean;
  };
}> {
  return {
    version: getModuleVersion(),
    initialized: true,
    components: {
      collectors: 5, // 5个平台采集器
      antiCrawling: true,
      dataCleaning: true,
      taskManagement: true
    }
  };
}