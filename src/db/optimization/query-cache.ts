/**
 * 查询缓存机制
 */

import { Database } from 'sqlite';
import { connectionManager } from '../config/connection';

/**
 * 缓存项
 */
interface CacheItem<T = any> {
  data: T;
  timestamp: number;
  expiration: number;
  hitCount: number;
  lastAccessed: number;
}

/**
 * 缓存配置
 */
export interface QueryCacheConfig {
  // 最大缓存项数
  maxCacheItems: number;

  // 默认缓存时间（秒）
  defaultTTL: number;

  // 是否启用缓存
  enabled: boolean;

  // 最大缓存大小（字节）
  maxCacheSize: number;

  // 缓存清理间隔（秒）
  cleanupInterval: number;
}

/**
 * 查询缓存器
 */
export class QueryCache {
  private config: QueryCacheConfig;
  private cache: Map<string, CacheItem> = new Map();
  private cacheSize: number = 0;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(config?: Partial<QueryCacheConfig>) {
    this.config = {
      maxCacheItems: parseInt(process.env.QUERY_CACHE_MAX_ITEMS || '100'),
      defaultTTL: parseInt(process.env.QUERY_CACHE_TTL || '300'),
      enabled: process.env.QUERY_CACHE_ENABLED !== 'false',
      maxCacheSize: parseInt(process.env.QUERY_CACHE_MAX_SIZE || '104857600'), // 100MB
      cleanupInterval: parseInt(process.env.QUERY_CACHE_CLEANUP_INTERVAL || '60'),
      ...config
    };

    if (this.config.enabled) {
      this.startCleanup();
    }
  }

  /**
   * 生成缓存键
   */
  private generateCacheKey(query: string, params?: any[]): string {
    const keyParts = [query];

    if (params && params.length > 0) {
      keyParts.push(JSON.stringify(params));
    }

    const crypto = require('crypto');
    return crypto.createHash('md5').update(keyParts.join('|')).digest('hex');
  }

  /**
   * 获取缓存数据
   */
  public get<T = any>(query: string, params?: any[]): T | null {
    if (!this.config.enabled) {
      return null;
    }

    const cacheKey = this.generateCacheKey(query, params);
    const item = this.cache.get(cacheKey);

    if (!item) {
      return null;
    }

    // 检查是否过期
    if (Date.now() > item.expiration) {
      this.cache.delete(cacheKey);
      this.cacheSize -= this.getItemSize(item);
      return null;
    }

    // 更新访问统计
    item.hitCount++;
    item.lastAccessed = Date.now();

    return item.data as T;
  }

  /**
   * 设置缓存数据
   */
  public set<T = any>(query: string, data: T, params?: any[], ttl?: number): void {
    if (!this.config.enabled) {
      return;
    }

    const cacheKey = this.generateCacheKey(query, params);
    const now = Date.now();
    const expiration = now + (ttl || this.config.defaultTTL) * 1000;

    // 创建缓存项
    const item: CacheItem<T> = {
      data,
      timestamp: now,
      expiration,
      hitCount: 0,
      lastAccessed: now
    };

    const itemSize = this.getItemSize(item);

    // 检查缓存大小限制
    if (itemSize > this.config.maxCacheSize) {
      console.warn('缓存项过大，跳过缓存');
      return;
    }

    // 如果超过最大大小，清理一些缓存项
    while (this.cacheSize + itemSize > this.config.maxCacheSize && this.cache.size > 0) {
      this.evictOldestItem();
    }

    // 如果超过最大项数，清理一些缓存项
    while (this.cache.size >= this.config.maxCacheItems && this.cache.size > 0) {
      this.evictOldestItem();
    }

    // 添加或更新缓存
    const existingItem = this.cache.get(cacheKey);
    if (existingItem) {
      this.cacheSize -= this.getItemSize(existingItem);
    }

    this.cache.set(cacheKey, item);
    this.cacheSize += itemSize;
  }

  /**
   * 删除缓存项
   */
  public delete(query: string, params?: any[]): boolean {
    const cacheKey = this.generateCacheKey(query, params);
    const item = this.cache.get(cacheKey);

    if (item) {
      this.cacheSize -= this.getItemSize(item);
      return this.cache.delete(cacheKey);
    }

    return false;
  }

  /**
   * 清空缓存
   */
  public clear(): void {
    this.cache.clear();
    this.cacheSize = 0;
  }

  /**
   * 执行带缓存的查询
   */
  public async queryWithCache<T = any>(
    db: Database,
    query: string,
    params?: any[],
    ttl?: number
  ): Promise<T> {
    // 尝试从缓存获取
    const cachedData = this.get<T>(query, params);
    if (cachedData !== null) {
      return cachedData;
    }

    // 执行查询
    const startTime = Date.now();
    const result = await db.all(query, ...(params || []));
    const executionTime = Date.now() - startTime;

    // 缓存结果（仅当查询成功且数据量不大时）
    if (result && result.length > 0 && result.length < 1000) {
      this.set(query, result, params, ttl);
    }

    return result as T;
  }

  /**
   * 执行带缓存的单个查询
   */
  public async getWithCache<T = any>(
    db: Database,
    query: string,
    params?: any[],
    ttl?: number
  ): Promise<T | null> {
    // 尝试从缓存获取
    const cachedData = this.get<T>(query, params);
    if (cachedData !== null) {
      return cachedData;
    }

    // 执行查询
    const startTime = Date.now();
    const result = await db.get(query, ...(params || []));
    const executionTime = Date.now() - startTime;

    // 缓存结果
    if (result) {
      this.set(query, result, params, ttl);
    }

    return result as T;
  }

  /**
   * 使相关查询缓存失效
   */
  public invalidateTable(tableName: string): number {
    let invalidatedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      // 简单检查查询是否涉及指定表
      const query = (item.data as any).__originalQuery || '';
      if (query.toLowerCase().includes(tableName.toLowerCase())) {
        this.cache.delete(key);
        this.cacheSize -= this.getItemSize(item);
        invalidatedCount++;
      }
    }

    return invalidatedCount;
  }

  /**
   * 获取缓存统计
   */
  public getStats(): {
    totalItems: number;
    cacheSize: number;
    hitRate: number;
    totalHits: number;
    totalMisses: number;
    oldestItemAge: number;
    newestItemAge: number;
  } {
    let totalHits = 0;
    let totalAccesses = 0;
    let oldestTimestamp = Date.now();
    let newestTimestamp = 0;

    for (const item of this.cache.values()) {
      totalHits += item.hitCount;
      totalAccesses += item.hitCount + 1; // 近似值
      oldestTimestamp = Math.min(oldestTimestamp, item.timestamp);
      newestTimestamp = Math.max(newestTimestamp, item.timestamp);
    }

    const hitRate = totalAccesses > 0 ? (totalHits / totalAccesses) * 100 : 0;

    return {
      totalItems: this.cache.size,
      cacheSize: this.cacheSize,
      hitRate,
      totalHits,
      totalMisses: totalAccesses - totalHits,
      oldestItemAge: Date.now() - oldestTimestamp,
      newestItemAge: Date.now() - newestTimestamp
    };
  }

  /**
   * 获取缓存项大小（近似值）
   */
  private getItemSize(item: CacheItem): number {
    try {
      const dataStr = JSON.stringify(item.data);
      return Buffer.byteLength(dataStr, 'utf8');
    } catch (error) {
      // 如果无法序列化，返回估计大小
      return 1024; // 1KB估计值
    }
  }

  /**
   * 驱逐最旧的缓存项
   */
  private evictOldestItem(): void {
    if (this.cache.size === 0) {
      return;
    }

    let oldestKey: string | null = null;
    let oldestAccessed = Date.now();

    for (const [key, item] of this.cache.entries()) {
      if (item.lastAccessed < oldestAccessed) {
        oldestAccessed = item.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const item = this.cache.get(oldestKey)!;
      this.cache.delete(oldestKey);
      this.cacheSize -= this.getItemSize(item);
    }
  }

  /**
   * 启动缓存清理
   */
  private startCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredItems();
    }, this.config.cleanupInterval * 1000);
  }

  /**
   * 清理过期缓存项
   */
  private cleanupExpiredItems(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiration) {
        this.cache.delete(key);
        this.cacheSize -= this.getItemSize(item);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`清理了 ${cleanedCount} 个过期缓存项`);
    }
  }

  /**
   * 停止缓存清理
   */
  public stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

// 导出默认查询缓存实例
export const queryCache = new QueryCache();