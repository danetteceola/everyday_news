/**
 * 模板加载器系统
 */

import {
  TemplateInstance,
  TemplateMetadata,
  TemplateConfig,
  TemplateLoadOptions,
  SummaryType,
  SummaryLanguage,
  TemplateFormat
} from '../types';

/**
 * 模板加载器接口
 */
export interface TemplateLoader {
  /**
   * 加载模板
   */
  load(templateId: string, options?: TemplateLoadOptions): Promise<TemplateInstance>;

  /**
   * 保存模板
   */
  save(template: TemplateInstance): Promise<void>;

  /**
   * 删除模板
   */
  delete(templateId: string): Promise<void>;

  /**
   * 列出模板
   */
  list(filter?: any): Promise<string[]>;

  /**
   * 检查模板是否存在
   */
  exists(templateId: string): Promise<boolean>;

  /**
   * 获取加载器信息
   */
  getInfo(): TemplateLoaderInfo;
}

/**
 * 模板加载器信息
 */
export interface TemplateLoaderInfo {
  type: string;
  name: string;
  description?: string;
  capabilities: string[];
  config: any;
}

/**
 * 文件模板加载器配置
 */
export interface FileTemplateLoaderConfig {
  basePath: string;
  fileExtension: string;
  encoding: string;
  watchChanges: boolean;
  cacheFiles: boolean;
}

/**
 * 默认文件加载器配置
 */
export const DEFAULT_FILE_LOADER_CONFIG: FileTemplateLoaderConfig = {
  basePath: './templates',
  fileExtension: '.json',
  encoding: 'utf-8',
  watchChanges: false,
  cacheFiles: true
};

/**
 * 文件模板加载器
 */
export class FileTemplateLoader implements TemplateLoader {
  private config: FileTemplateLoaderConfig;
  private fileCache: Map<string, { content: string; timestamp: number }>;

  constructor(config: Partial<FileTemplateLoaderConfig> = {}) {
    this.config = { ...DEFAULT_FILE_LOADER_CONFIG, ...config };
    this.fileCache = new Map();
  }

  /**
   * 加载模板
   */
  async load(templateId: string, options?: TemplateLoadOptions): Promise<TemplateInstance> {
    const filePath = this.getTemplateFilePath(templateId);
    const cacheKey = templateId;

    // 检查缓存
    if (this.config.cacheFiles && this.fileCache.has(cacheKey)) {
      const cached = this.fileCache.get(cacheKey)!;
      const fileStats = await this.getFileStats(filePath);
      if (fileStats && fileStats.mtime.getTime() <= cached.timestamp) {
        return this.parseTemplateFile(cached.content, templateId);
      }
    }

    // 从文件系统读取
    const content = await this.readFile(filePath);
    const template = await this.parseTemplateFile(content, templateId);

    // 更新缓存
    if (this.config.cacheFiles) {
      this.fileCache.set(cacheKey, {
        content,
        timestamp: Date.now()
      });
    }

    return template;
  }

  /**
   * 保存模板
   */
  async save(template: TemplateInstance): Promise<void> {
    const filePath = this.getTemplateFilePath(template.metadata.id);
    const content = this.serializeTemplate(template);
    await this.writeFile(filePath, content);

    // 更新缓存
    if (this.config.cacheFiles) {
      this.fileCache.set(template.metadata.id, {
        content,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 删除模板
   */
  async delete(templateId: string): Promise<void> {
    const filePath = this.getTemplateFilePath(templateId);
    await this.deleteFile(filePath);

    // 清除缓存
    this.fileCache.delete(templateId);
  }

  /**
   * 列出模板
   */
  async list(filter?: any): Promise<string[]> {
    const files = await this.listFiles(this.config.basePath);
    const templates: string[] = [];

    for (const file of files) {
      if (file.endsWith(this.config.fileExtension)) {
        const templateId = this.extractTemplateIdFromFileName(file);
        templates.push(templateId);
      }
    }

    // 应用过滤器
    if (filter) {
      return templates.filter(templateId => this.matchesFilter(templateId, filter));
    }

    return templates;
  }

  /**
   * 检查模板是否存在
   */
  async exists(templateId: string): Promise<boolean> {
    const filePath = this.getTemplateFilePath(templateId);
    return await this.fileExists(filePath);
  }

  /**
   * 获取加载器信息
   */
  getInfo(): TemplateLoaderInfo {
    return {
      type: 'file',
      name: 'File Template Loader',
      description: 'Loads templates from file system',
      capabilities: ['load', 'save', 'delete', 'list'],
      config: { ...this.config }
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<FileTemplateLoaderConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): FileTemplateLoaderConfig {
    return { ...this.config };
  }

  /**
   * 清理缓存
   */
  clearCache(): void {
    this.fileCache.clear();
  }

  /**
   * 获取模板文件路径
   */
  private getTemplateFilePath(templateId: string): string {
    // 清理模板ID，防止目录遍历攻击
    const safeTemplateId = templateId.replace(/[^a-zA-Z0-9-_]/g, '_');
    return `${this.config.basePath}/${safeTemplateId}${this.config.fileExtension}`;
  }

  /**
   * 从文件名提取模板ID
   */
  private extractTemplateIdFromFileName(fileName: string): string {
    const baseName = fileName.substring(0, fileName.length - this.config.fileExtension.length);
    return baseName;
  }

  /**
   * 解析模板文件
   */
  private async parseTemplateFile(content: string, templateId: string): Promise<TemplateInstance> {
    try {
      const data = JSON.parse(content);

      // 验证必需字段
      if (!data.metadata || !data.config || !data.content) {
        throw new Error('Invalid template file structure');
      }

      // 转换日期字段
      if (data.metadata.createdAt && typeof data.metadata.createdAt === 'string') {
        data.metadata.createdAt = new Date(data.metadata.createdAt);
      }
      if (data.metadata.updatedAt && typeof data.metadata.updatedAt === 'string') {
        data.metadata.updatedAt = new Date(data.metadata.updatedAt);
      }

      return data as TemplateInstance;
    } catch (error) {
      throw new Error(`Failed to parse template file ${templateId}: ${error.message}`);
    }
  }

  /**
   * 序列化模板
   */
  private serializeTemplate(template: TemplateInstance): string {
    const serializable = {
      ...template,
      metadata: {
        ...template.metadata,
        createdAt: template.metadata.createdAt.toISOString(),
        updatedAt: template.metadata.updatedAt.toISOString()
      }
    };
    return JSON.stringify(serializable, null, 2);
  }

  /**
   * 检查是否匹配过滤器
   */
  private matchesFilter(templateId: string, filter: any): boolean {
    // 简化实现：实际应该加载模板并检查属性
    // 这里只检查模板ID
    if (filter.idPattern && !templateId.match(filter.idPattern)) {
      return false;
    }

    if (filter.exclude && filter.exclude.includes(templateId)) {
      return false;
    }

    if (filter.include && !filter.include.includes(templateId)) {
      return false;
    }

    return true;
  }

  /**
   * 文件系统操作（简化实现）
   */
  private async readFile(filePath: string): Promise<string> {
    // 简化实现：实际应该使用fs模块
    // TODO: 实现实际的文件读取逻辑
    throw new Error('FileTemplateLoader.readFile not implemented');
  }

  private async writeFile(filePath: string, content: string): Promise<void> {
    // TODO: 实现实际的文件写入逻辑
    throw new Error('FileTemplateLoader.writeFile not implemented');
  }

  private async deleteFile(filePath: string): Promise<void> {
    // TODO: 实现实际的文件删除逻辑
    throw new Error('FileTemplateLoader.deleteFile not implemented');
  }

  private async listFiles(dirPath: string): Promise<string[]> {
    // TODO: 实现实际的文件列表逻辑
    throw new Error('FileTemplateLoader.listFiles not implemented');
  }

  private async fileExists(filePath: string): Promise<boolean> {
    // TODO: 实现实际的文件存在检查逻辑
    throw new Error('FileTemplateLoader.fileExists not implemented');
  }

  private async getFileStats(filePath: string): Promise<{ mtime: Date } | null> {
    // TODO: 实现实际的文件状态检查逻辑
    throw new Error('FileTemplateLoader.getFileStats not implemented');
  }
}

/**
 * 内存模板加载器
 */
export class MemoryTemplateLoader implements TemplateLoader {
  private templates: Map<string, TemplateInstance>;

  constructor() {
    this.templates = new Map();
  }

  async load(templateId: string, options?: TemplateLoadOptions): Promise<TemplateInstance> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Template ${templateId} not found in memory`);
    }
    return { ...template };
  }

  async save(template: TemplateInstance): Promise<void> {
    this.templates.set(template.metadata.id, { ...template });
  }

  async delete(templateId: string): Promise<void> {
    this.templates.delete(templateId);
  }

  async list(filter?: any): Promise<string[]> {
    const templates = Array.from(this.templates.keys());

    if (filter) {
      return templates.filter(templateId => {
        const template = this.templates.get(templateId);
        if (!template) return false;

        // 简单的过滤器实现
        if (filter.type && template.config.type !== filter.type) {
          return false;
        }

        if (filter.language && template.config.language !== filter.language) {
          return false;
        }

        return true;
      });
    }

    return templates;
  }

  async exists(templateId: string): Promise<boolean> {
    return this.templates.has(templateId);
  }

  getInfo(): TemplateLoaderInfo {
    return {
      type: 'memory',
      name: 'Memory Template Loader',
      description: 'Stores templates in memory',
      capabilities: ['load', 'save', 'delete', 'list'],
      config: {
        templateCount: this.templates.size
      }
    };
  }

  /**
   * 获取所有模板
   */
  getAllTemplates(): TemplateInstance[] {
    return Array.from(this.templates.values()).map(t => ({ ...t }));
  }

  /**
   * 清空所有模板
   */
  clear(): void {
    this.templates.clear();
  }
}

/**
 * 复合模板加载器
 */
export class CompositeTemplateLoader implements TemplateLoader {
  private loaders: TemplateLoader[];
  private priority: number[];

  constructor() {
    this.loaders = [];
    this.priority = [];
  }

  /**
   * 添加加载器
   */
  addLoader(loader: TemplateLoader, priority: number = 0): void {
    this.loaders.push(loader);
    this.priority.push(priority);
  }

  /**
   * 移除加载器
   */
  removeLoader(loader: TemplateLoader): boolean {
    const index = this.loaders.indexOf(loader);
    if (index !== -1) {
      this.loaders.splice(index, 1);
      this.priority.splice(index, 1);
      return true;
    }
    return false;
  }

  async load(templateId: string, options?: TemplateLoadOptions): Promise<TemplateInstance> {
    // 按照优先级排序的加载器
    const sortedLoaders = this.loaders
      .map((loader, index) => ({ loader, priority: this.priority[index] }))
      .sort((a, b) => b.priority - a.priority);

    for (const { loader } of sortedLoaders) {
      try {
        if (await loader.exists(templateId)) {
          return await loader.load(templateId, options);
        }
      } catch (error) {
        console.warn(`Loader failed to check existence of ${templateId}:`, error.message);
      }
    }

    throw new Error(`Template ${templateId} not found in any loader`);
  }

  async save(template: TemplateInstance): Promise<void> {
    // 保存到所有加载器
    const promises = this.loaders.map(loader =>
      loader.save(template).catch(error => {
        console.warn(`Loader failed to save template ${template.metadata.id}:`, error.message);
      })
    );
    await Promise.all(promises);
  }

  async delete(templateId: string): Promise<void> {
    // 从所有加载器删除
    const promises = this.loaders.map(loader =>
      loader.delete(templateId).catch(error => {
        console.warn(`Loader failed to delete template ${templateId}:`, error.message);
      })
    );
    await Promise.all(promises);
  }

  async list(filter?: any): Promise<string[]> {
    const allTemplates = new Set<string>();

    for (const loader of this.loaders) {
      try {
        const templates = await loader.list(filter);
        templates.forEach(templateId => allTemplates.add(templateId));
      } catch (error) {
        console.warn(`Loader failed to list templates:`, error.message);
      }
    }

    return Array.from(allTemplates);
  }

  async exists(templateId: string): Promise<boolean> {
    for (const loader of this.loaders) {
      try {
        if (await loader.exists(templateId)) {
          return true;
        }
      } catch (error) {
        console.warn(`Loader failed to check existence of ${templateId}:`, error.message);
      }
    }
    return false;
  }

  getInfo(): TemplateLoaderInfo {
    const loaderInfos = this.loaders.map(loader => loader.getInfo());

    return {
      type: 'composite',
      name: 'Composite Template Loader',
      description: `Combines ${this.loaders.length} loaders`,
      capabilities: Array.from(new Set(loaderInfos.flatMap(info => info.capabilities))),
      config: {
        loaders: loaderInfos,
        priorities: this.priority
      }
    };
  }
}

/**
 * 模板加载器工厂
 */
export class TemplateLoaderFactory {
  private static instances: Map<string, TemplateLoader> = new Map();

  /**
   * 获取默认实例
   */
  public static getDefaultInstance(): TemplateLoader {
    return this.getInstance('default');
  }

  /**
   * 获取实例
   */
  public static getInstance(name: string = 'default'): TemplateLoader {
    if (!this.instances.has(name)) {
      const compositeLoader = new CompositeTemplateLoader();
      compositeLoader.addLoader(new MemoryTemplateLoader(), 100);
      compositeLoader.addLoader(new FileTemplateLoader(), 50);
      this.instances.set(name, compositeLoader);
    }
    return this.instances.get(name)!;
  }

  /**
   * 创建自定义实例
   */
  public static createInstance(name: string, loader: TemplateLoader): TemplateLoader {
    this.instances.set(name, loader);
    return loader;
  }

  /**
   * 移除实例
   */
  public static removeInstance(name: string): boolean {
    return this.instances.delete(name);
  }

  /**
   * 获取所有加载器信息
   */
  public static getAllLoaderInfo(): Record<string, TemplateLoaderInfo> {
    const info: Record<string, TemplateLoaderInfo> = {};

    this.instances.forEach((loader, name) => {
      info[name] = loader.getInfo();
    });

    return info;
  }
}