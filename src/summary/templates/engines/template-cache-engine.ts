/**
 * 模板缓存引擎实现
 */

import {
  TemplateCacheEngine,
  TemplateInstance,
  TemplateMetadata
} from '../types';

/**
 * 模板缓存引擎配置
 */
export interface TemplateCacheEngineConfig {
  maxSize: number;
  defaultTTL: number; // 毫秒
  cleanupInterval: number; // 毫秒
  evictionPolicy: 'lru' | 'fifo' | 'lfu';
  persistToDisk: boolean;
  diskPath?: string;
  compress: boolean;
  encryptionKey?: string;
}

/**
 * 默认配置
 */
export const DEFAULT_TEMPLATE_CACHE_CONFIG: TemplateCacheEngineConfig = {
  maxSize: 100,
  defaultTTL: 3600000, // 1小时
  cleanupInterval: 300000, // 5分钟
  evictionPolicy: 'lru',
  persistToDisk: false,
  compress: false
};

/**
 * 缓存项
 */
interface CacheItem {
  template: TemplateInstance;
  timestamp: number;
  accessCount: number;
  expiresAt: number;
  size: number;
}

/**
 * 缓存统计
 */
export interface CacheStats {
  totalItems: number;
  totalSize: number;
  hitCount: number;
  missCount: number;
  evictionCount: number;
  averageLoadTime: number;
  memoryUsage: number;
}

/**
 * 内存模板缓存引擎
 */
export class MemoryTemplateCacheEngine implements TemplateCacheEngine {
  private config: TemplateCacheEngineConfig;
  private cache: Map<string, CacheItem>;
  private stats: CacheStats;
  private cleanupTimer?: NodeJS.Timeout;

  constructor(config: Partial<TemplateCacheEngineConfig> = {}) {
    this.config = { ...DEFAULT_TEMPLATE_CACHE_CONFIG, ...config };
    this.cache = new Map();
    this.stats = this.initializeStats();
    this.startCleanupTimer();
  }

  /**
   * 获取缓存
   */
  async get(templateId: string, options?: any): Promise<TemplateInstance | null> {
    const item = this.cache.get(templateId);

    if (!item) {
      this.stats.missCount++;
      return null;
    }

    // 检查是否过期
    if (Date.now() > item.expiresAt) {
      this.cache.delete(templateId);
      this.stats.missCount++;
      this.stats.evictionCount++;
      return null;
    }

    // 更新访问统计
    item.accessCount++;
    item.timestamp = Date.now();

    // 更新缓存顺序（LRU策略）
    if (this.config.evictionPolicy === 'lru') {
      this.cache.delete(templateId);
      this.cache.set(templateId, item);
    }

    this.stats.hitCount++;
    return { ...item.template };
  }

  /**
   * 设置缓存
   */
  async set(templateId: string, template: TemplateInstance, options?: any): Promise<void> {
    const ttl = options?.ttl || this.config.defaultTTL;
    const size = this.calculateSize(template);

    // 检查缓存大小限制
    if (this.stats.totalSize + size > this.config.maxSize * 1024 * 1024) { // maxSize in MB
      await this.evictItems(size);
    }

    const cacheItem: CacheItem = {
      template: { ...template },
      timestamp: Date.now(),
      accessCount: 0,
      expiresAt: Date.now() + ttl,
      size
    };

    this.cache.set(templateId, cacheItem);
    this.stats.totalItems++;
    this.stats.totalSize += size;

    // 持久化到磁盘（如果启用）
    if (this.config.persistToDisk && this.config.diskPath) {
      await this.persistToDisk(templateId, cacheItem);
    }
  }

  /**
   * 删除缓存
   */
  async delete(templateId: string): Promise<void> {
    const item = this.cache.get(templateId);
    if (item) {
      this.cache.delete(templateId);
      this.stats.totalItems--;
      this.stats.totalSize -= item.size;
      this.stats.evictionCount++;

      // 从磁盘删除（如果启用）
      if (this.config.persistToDisk && this.config.diskPath) {
        await this.deleteFromDisk(templateId);
      }
    }
  }

  /**
   * 清空缓存
   */
  async clear(): Promise<void> {
    this.cache.clear();
    this.stats = this.initializeStats();

    // 清空磁盘缓存（如果启用）
    if (this.config.persistToDisk && this.config.diskPath) {
      await this.clearDiskCache();
    }
  }

  /**
   * 检查缓存是否存在
   */
  async has(templateId: string): Promise<boolean> {
    const item = this.cache.get(templateId);
    if (!item) {
      return false;
    }

    if (Date.now() > item.expiresAt) {
      await this.delete(templateId);
      return false;
    }

    return true;
  }

  /**
   * 获取缓存统计
   */
  getStats(): CacheStats {
    return {
      ...this.stats,
      memoryUsage: process.memoryUsage().heapUsed
    };
  }

  /**
   * 清理过期缓存
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [templateId, item] of this.cache.entries()) {
      if (now > item.expiresAt) {
        await this.delete(templateId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`Cleaned ${cleanedCount} expired cache items`);
    }

    // 压缩缓存（如果大小超过限制）
    if (this.stats.totalSize > this.config.maxSize * 1024 * 1024 * 0.8) {
      await this.compressCache();
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TemplateCacheEngineConfig>): void {
    const oldConfig = { ...this.config };
    this.config = { ...this.config, ...config };

    // 重启清理定时器（如果间隔改变）
    if (config.cleanupInterval && config.cleanupInterval !== oldConfig.cleanupInterval) {
      this.stopCleanupTimer();
      this.startCleanupTimer();
    }

    // 如果启用了磁盘持久化但路径未设置，警告
    if (this.config.persistToDisk && !this.config.diskPath) {
      console.warn('Disk persistence enabled but no disk path configured');
    }
  }

  /**
   * 获取配置
   */
  getConfig(): TemplateCacheEngineConfig {
    return { ...this.config };
  }

  /**
   * 销毁引擎
   */
  destroy(): void {
    this.stopCleanupTimer();
    this.cache.clear();
  }

  /**
   * 初始化统计
   */
  private initializeStats(): CacheStats {
    return {
      totalItems: 0,
      totalSize: 0,
      hitCount: 0,
      missCount: 0,
      evictionCount: 0,
      averageLoadTime: 0,
      memoryUsage: 0
    };
  }

  /**
   * 计算模板大小
   */
  private calculateSize(template: TemplateInstance): number {
    // 简单估算：JSON字符串化后的字节长度
    const jsonString = JSON.stringify(template);
    return Buffer.byteLength(jsonString, 'utf8');
  }

  /**
   * 驱逐项目以腾出空间
   */
  private async evictItems(requiredSize: number): Promise<void> {
    const itemsToEvict: string[] = [];

    switch (this.config.evictionPolicy) {
      case 'lru':
        // LRU: 驱逐最近最少使用的项目
        const lruItems = Array.from(this.cache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp);
        this.collectItemsToEvict(lruItems, requiredSize, itemsToEvict);
        break;

      case 'fifo':
        // FIFO: 驱逐最早添加的项目
        const fifoItems = Array.from(this.cache.entries())
          .sort((a, b) => a[1].timestamp - b[1].timestamp);
        this.collectItemsToEvict(fifoItems, requiredSize, itemsToEvict);
        break;

      case 'lfu':
        // LFU: 驱逐最不经常使用的项目
        const lfuItems = Array.from(this.cache.entries())
          .sort((a, b) => a[1].accessCount - b[1].accessCount);
        this.collectItemsToEvict(lfuItems, requiredSize, itemsToEvict);
        break;
    }

    // 驱逐选定的项目
    for (const templateId of itemsToEvict) {
      await this.delete(templateId);
    }
  }

  /**
   * 收集要驱逐的项目
   */
  private collectItemsToEvict(
    sortedItems: [string, CacheItem][],
    requiredSize: number,
    itemsToEvict: string[]
  ): void {
    let freedSize = 0;

    for (const [templateId, item] of sortedItems) {
      itemsToEvict.push(templateId);
      freedSize += item.size;

      if (freedSize >= requiredSize) {
        break;
      }
    }
  }

  /**
   * 压缩缓存
   */
  private async compressCache(): Promise<void> {
    // 简单实现：驱逐一半的缓存项目
    const targetSize = this.config.maxSize * 1024 * 1024 * 0.5;
    const currentSize = this.stats.totalSize;

    if (currentSize <= targetSize) {
      return;
    }

    const sizeToFree = currentSize - targetSize;
    await this.evictItems(sizeToFree);
  }

  /**
   * 启动清理定时器
   */
  private startCleanupTimer(): void {
    if (this.config.cleanupInterval > 0) {
      this.cleanupTimer = setInterval(() => {
        this.cleanup().catch(error => {
          console.error('Cache cleanup failed:', error);
        });
      }, this.config.cleanupInterval);
    }
  }

  /**
   * 停止清理定时器
   */
  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
  }

  /**
   * 持久化到磁盘
   */
  private async persistToDisk(templateId: string, item: CacheItem): Promise<void> {
    // 简化实现：实际应该使用文件系统API
    console.log(`Persisting template ${templateId} to disk`);
    // TODO: 实现实际的磁盘持久化
  }

  /**
   * 从磁盘删除
   */
  private async deleteFromDisk(templateId: string): Promise<void> {
    console.log(`Deleting template ${templateId} from disk`);
    // TODO: 实现实际的磁盘删除
  }

  /**
   * 清空磁盘缓存
   */
  private async clearDiskCache(): Promise<void> {
    console.log('Clearing disk cache');
    // TODO: 实现实际的磁盘缓存清理
  }
}

/**
 * 模板缓存引擎工厂
 */
export class TemplateCacheEngineFactory {
  private static instances: Map<string, TemplateCacheEngine> = new Map();

  /**
   * 获取默认实例
   */
  public static getDefaultInstance(): TemplateCacheEngine {
    return this.getInstance('default');
  }

  /**
   * 获取实例
   */
  public static getInstance(name: string = 'default'): TemplateCacheEngine {
    if (!this.instances.has(name)) {
      this.instances.set(name, new MemoryTemplateCacheEngine());
    }
    return this.instances.get(name)!;
  }

  /**
   * 创建自定义实例
   */
  public static createInstance(
    name: string,
    config: Partial<TemplateCacheEngineConfig>
  ): TemplateCacheEngine {
    const instance = new MemoryTemplateCacheEngine(config);
    this.instances.set(name, instance);
    return instance;
  }

  /**
   * 移除实例
   */
  public static removeInstance(name: string): boolean {
    const instance = this.instances.get(name);
    if (instance && 'destroy' in instance) {
      (instance as any).destroy();
    }
    return this.instances.delete(name);
  }

  /**
   * 获取所有实例统计
   */
  public static getAllStats(): Record<string, CacheStats> {
    const stats: Record<string, CacheStats> = {};

    this.instances.forEach((engine, name) => {
      stats[name] = engine.getStats();
    });

    return stats;
  }

  /**
   * 清理所有实例
   */
  public static async cleanupAll(): Promise<void> {
    const promises = Array.from(this.instances.values()).map(engine => engine.cleanup());
    await Promise.all(promises);
  }
}