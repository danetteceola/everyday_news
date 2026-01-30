/**
 * 通用Repository接口和类型定义
 */

import { Platform, NewsItem, DailySummary, CrawlLog } from './index';

/**
 * 基础CRUD操作接口
 */
export interface BaseRepository<T, ID = number> {
  /**
   * 根据ID查找实体
   */
  findById(id: ID): Promise<T | null>;

  /**
   * 查找所有实体
   */
  findAll(): Promise<T[]>;

  /**
   * 创建实体
   */
  create(entity: Omit<T, 'id' | 'created_at'>): Promise<T>;

  /**
   * 更新实体
   */
  update(id: ID, updates: Partial<Omit<T, 'id' | 'created_at'>>): Promise<T | null>;

  /**
   * 删除实体
   */
  delete(id: ID): Promise<boolean>;
}

/**
 * 分页查询参数
 */
export interface PaginationParams {
  limit?: number;
  offset?: number;
  orderBy?: string;
  orderDirection?: 'ASC' | 'DESC';
}

/**
 * 分页查询结果
 */
export interface PaginatedResult<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * 查询参数接口
 */
export interface QueryParams {
  [key: string]: any;
}

/**
 * 查询构建器接口
 */
export interface QueryBuilder<T> {
  where(params: QueryParams): QueryBuilder<T>;
  orderBy(field: string, direction?: 'ASC' | 'DESC'): QueryBuilder<T>;
  limit(count: number): QueryBuilder<T>;
  offset(count: number): QueryBuilder<T>;
  execute(): Promise<PaginatedResult<T>>;
}

/**
 * 统计接口
 */
export interface StatsRepository<T> {
  /**
   * 获取统计信息
   */
  getStats(params?: QueryParams): Promise<any>;
}

/**
 * 搜索接口
 */
export interface SearchRepository<T> {
  /**
   * 搜索实体
   */
  search(query: string, params?: PaginationParams): Promise<PaginatedResult<T>>;
}

/**
 * 批量操作接口
 */
export interface BatchRepository<T> {
  /**
   * 批量创建实体
   */
  batchCreate(entities: Omit<T, 'id' | 'created_at'>[]): Promise<T[]>;

  /**
   * 批量更新实体
   */
  batchUpdate(ids: number[], updates: Partial<Omit<T, 'id' | 'created_at'>>): Promise<number>;

  /**
   * 批量删除实体
   */
  batchDelete(ids: number[]): Promise<number>;
}

/**
 * 平台Repository接口
 */
export interface PlatformRepository extends
  BaseRepository<Platform>,
  SearchRepository<Platform>,
  StatsRepository<Platform> {

  /**
   * 根据名称查找平台
   */
  findByName(name: string): Promise<Platform | null>;

  /**
   * 初始化默认平台
   */
  initializeDefaultPlatforms(): Promise<Platform[]>;
}

/**
 * 新闻查询参数
 */
export interface NewsQueryParams extends QueryParams, PaginationParams {
  platformId?: number;
  startDate?: Date;
  endDate?: Date;
  category?: string;
  isInvestmentRelated?: boolean;
  searchText?: string;
}

/**
 * 新闻Repository接口
 */
export interface NewsItemRepository extends
  BaseRepository<NewsItem>,
  SearchRepository<NewsItem>,
  StatsRepository<NewsItem>,
  BatchRepository<NewsItem> {

  /**
   * 根据平台ID和外部ID查找新闻
   */
  findByPlatformAndExternalId(platformId: number, externalId: string): Promise<NewsItem | null>;

  /**
   * 查询新闻（支持复杂查询）
   */
  query(params: NewsQueryParams): Promise<PaginatedResult<NewsItem>>;

  /**
   * 获取分类统计
   */
  getCategoryStats(): Promise<Array<{
    category: string;
    count: number;
    totalViews: number;
    avgEngagement: number;
  }>>;

  /**
   * 获取热门新闻
   */
  getTopNews(limit?: number): Promise<NewsItem[]>;

  /**
   * 获取投资相关新闻
   */
  getInvestmentNews(limit?: number): Promise<NewsItem[]>;
}

/**
 * 每日总结查询参数
 */
export interface SummaryQueryParams extends QueryParams, PaginationParams {
  startDate?: string;
  endDate?: string;
}

/**
 * 每日总结Repository接口
 */
export interface DailySummaryRepository extends
  BaseRepository<DailySummary>,
  BatchRepository<DailySummary> {

  /**
   * 根据日期查找总结
   */
  findByDate(date: string): Promise<DailySummary | null>;

  /**
   * 查询总结
   */
  query(params: SummaryQueryParams): Promise<PaginatedResult<DailySummary>>;

  /**
   * 获取最新总结
   */
  getLatest(limit?: number): Promise<DailySummary[]>;

  /**
   * 获取热点统计
   */
  getHotspotStats(startDate?: string, endDate?: string): Promise<Array<{
    date: string;
    domesticCount: number;
    internationalCount: number;
    investmentCount: number;
    totalHotspots: number;
  }>>;

  /**
   * 获取热点趋势
   */
  getHotspotTrends(days?: number): Promise<{
    dates: string[];
    domesticTrend: number[];
    internationalTrend: number[];
    investmentTrend: number[];
  }>;

  /**
   * 获取最常见的国内热点
   */
  getTopDomesticHotspots(limit?: number): Promise<Array<{ hotspot: string; count: number }>>;

  /**
   * 获取最常见的国际热点
   */
  getTopInternationalHotspots(limit?: number): Promise<Array<{ hotspot: string; count: number }>>;

  /**
   * 获取最常见的投资热点
   */
  getTopInvestmentHotspots(limit?: number): Promise<Array<{ hotspot: string; count: number }>>;
}

/**
 * 采集日志查询参数
 */
export interface CrawlQueryParams extends QueryParams, PaginationParams {
  platformId?: number;
  status?: 'running' | 'completed' | 'failed';
  startDate?: Date;
  endDate?: Date;
}

/**
 * 采集日志Repository接口
 */
export interface CrawlLogRepository extends
  BaseRepository<CrawlLog>,
  StatsRepository<CrawlLog> {

  /**
   * 开始采集
   */
  startCrawl(platformId: number): Promise<CrawlLog>;

  /**
   * 完成采集
   */
  completeCrawl(id: number, itemsCollected: number): Promise<CrawlLog | null>;

  /**
   * 标记采集失败
   */
  failCrawl(id: number, errorMessage: string): Promise<CrawlLog | null>;

  /**
   * 查询采集日志
   */
  query(params: CrawlQueryParams): Promise<PaginatedResult<CrawlLog>>;

  /**
   * 获取运行中的采集任务
   */
  getRunningCrawls(): Promise<CrawlLog[]>;

  /**
   * 获取最近的采集日志
   */
  getRecentCrawls(limit?: number): Promise<CrawlLog[]>;

  /**
   * 获取平台最近的采集日志
   */
  getRecentCrawlsByPlatform(platformId: number, limit?: number): Promise<CrawlLog[]>;

  /**
   * 获取平台采集统计
   */
  getPlatformCrawlStats(): Promise<Array<{
    platformId: number;
    platformName?: string;
    totalCrawls: number;
    successfulCrawls: number;
    failedCrawls: number;
    totalItemsCollected: number;
    averageItemsPerCrawl: number;
    successRate: number;
    lastCrawlTime: Date | null;
  }>>;

  /**
   * 获取采集趋势
   */
  getCrawlTrends(days?: number): Promise<{
    dates: string[];
    crawlCounts: number[];
    itemCounts: number[];
    successRates: number[];
  }>;

  /**
   * 清理旧的采集日志
   */
  cleanupOldLogs(retentionDays?: number): Promise<number>;

  /**
   * 获取错误统计
   */
  getErrorStats(limit?: number): Promise<Array<{
    errorMessage: string;
    count: number;
    lastOccurred: Date;
  }>>;
}

/**
 * 事务管理器接口
 */
export interface TransactionManager {
  /**
   * 执行事务
   */
  withTransaction<T>(operation: (db: any) => Promise<T>): Promise<T>;

  /**
   * 执行批量操作
   */
  batchOperations<T>(operations: Array<(db: any) => Promise<T>>): Promise<T[]>;
}

/**
 * 错误类型
 */
export enum DatabaseErrorType {
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  QUERY_ERROR = 'QUERY_ERROR',
  CONSTRAINT_ERROR = 'CONSTRAINT_ERROR',
  TRANSACTION_ERROR = 'TRANSACTION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR'
}

/**
 * 数据库错误
 */
export class DatabaseError extends Error {
  constructor(
    public type: DatabaseErrorType,
    message: string,
    public originalError?: Error,
    public query?: string,
    public params?: any[]
  ) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/**
 * 错误处理器接口
 */
export interface ErrorHandler {
  /**
   * 处理错误
   */
  handleError(error: Error): Promise<void>;

  /**
   * 记录错误
   */
  logError(error: DatabaseError): void;

  /**
   * 获取错误统计
   */
  getErrorStats(): Promise<Array<{
    type: DatabaseErrorType;
    count: number;
    lastOccurred: Date;
  }>>;
}

/**
 * 数据映射器接口
 */
export interface DataMapper<T> {
  /**
   * 将数据库行映射为实体
   */
  mapToEntity(row: any): T;

  /**
   * 将实体映射为数据库参数
   */
  mapToParams(entity: Partial<T>): any[];

  /**
   * 验证实体数据
   */
  validate(entity: Partial<T>): Promise<boolean>;
}

/**
 * 查询构建器实现
 */
export class QueryBuilderImpl<T> implements QueryBuilder<T> {
  private conditions: string[] = [];
  private queryParams: any[] = [];
  private orderField?: string;
  private orderDirection: 'ASC' | 'DESC' = 'ASC';
  private queryLimit?: number;
  private queryOffset?: number;

  constructor(
    private tableName: string,
    private dataMapper: DataMapper<T>
  ) {}

  where(params: QueryParams): QueryBuilder<T> {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        if (Array.isArray(value)) {
          const placeholders = value.map(() => '?').join(', ');
          this.conditions.push(`${key} IN (${placeholders})`);
          this.queryParams.push(...value);
        } else {
          this.conditions.push(`${key} = ?`);
          this.queryParams.push(value);
        }
      }
    }
    return this;
  }

  orderBy(field: string, direction: 'ASC' | 'DESC' = 'ASC'): QueryBuilder<T> {
    this.orderField = field;
    this.orderDirection = direction;
    return this;
  }

  limit(count: number): QueryBuilder<T> {
    this.queryLimit = count;
    return this;
  }

  offset(count: number): QueryBuilder<T> {
    this.queryOffset = count;
    return this;
  }

  async execute(): Promise<PaginatedResult<T>> {
    // 这里需要数据库连接，实际实现会使用connectionManager
    // 这是一个简化版本，展示接口设计
    throw new Error('QueryBuilder需要具体的数据库连接实现');
  }
}