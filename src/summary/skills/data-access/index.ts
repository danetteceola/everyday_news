/**
 * 技能数据访问模块
 */

export * from './data-access-service';

// 导出默认实例
import { dataAccessService, DataAccessServiceFactory } from './data-access-service';

export {
  dataAccessService,
  DataAccessServiceFactory
};

// 默认导出数据访问服务
export default dataAccessService;