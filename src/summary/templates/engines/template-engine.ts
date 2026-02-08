/**
 * 主模板引擎实现
 */

import {
  TemplateEngine,
  TemplateInstance,
  TemplateVariables,
  TemplateConfig,
  TemplateMetadata,
  TemplateGenerationResult,
  TemplateLoadOptions,
  ValidationResult,
  TemplateEngineConfig,
  TemplateFormat,
  SummaryType,
  SummaryLanguage,
  SummaryQuality,
  ValidationSeverity
} from '../types';

import {
  VariableReplacementEngine,
  VariableReplacementEngineFactory
} from './variable-replacement-engine';

import {
  TemplateValidationEngine,
  TemplateValidationEngineFactory
} from './template-validation-engine';

import {
  TemplateCacheEngine,
  TemplateCacheEngineFactory
} from './template-cache-engine';

/**
 * 默认模板引擎配置
 */
export const DEFAULT_TEMPLATE_ENGINE_CONFIG: TemplateEngineConfig = {
  cacheEnabled: true,
  cacheTTL: 3600000, // 1小时
  validationEnabled: true,
  strictMode: false,
  defaultLanguage: SummaryLanguage.ZH,
  fallbackLanguage: SummaryLanguage.EN,
  autoReload: false,
  watchChanges: false
};

/**
 * 模板加载器接口
 */
interface TemplateLoader {
  load(templateId: string, options?: TemplateLoadOptions): Promise<TemplateInstance>;
  save(template: TemplateInstance): Promise<void>;
  delete(templateId: string): Promise<void>;
  list(filter?: any): Promise<string[]>;
}

/**
 * 文件模板加载器
 */
class FileTemplateLoader implements TemplateLoader {
  constructor(private basePath: string) {}

  async load(templateId: string, options?: TemplateLoadOptions): Promise<TemplateInstance> {
    // 简化实现：从文件系统加载模板
    // TODO: 实现实际的文件加载逻辑
    throw new Error('FileTemplateLoader not implemented');
  }

  async save(template: TemplateInstance): Promise<void> {
    // TODO: 实现实际的文件保存逻辑
    throw new Error('FileTemplateLoader.save not implemented');
  }

  async delete(templateId: string): Promise<void> {
    // TODO: 实现实际的文件删除逻辑
    throw new Error('FileTemplateLoader.delete not implemented');
  }

  async list(filter?: any): Promise<string[]> {
    // TODO: 实现实际的文件列表逻辑
    return [];
  }
}

/**
 * 默认模板引擎
 */
export class DefaultTemplateEngine implements TemplateEngine {
  private config: TemplateEngineConfig;
  private variableEngine: VariableReplacementEngine;
  private validationEngine: TemplateValidationEngine;
  private cacheEngine: TemplateCacheEngine;
  private loaders: Map<string, TemplateLoader>;
  private templates: Map<string, TemplateInstance>;

  constructor(config: Partial<TemplateEngineConfig> = {}) {
    this.config = { ...DEFAULT_TEMPLATE_ENGINE_CONFIG, ...config };
    this.variableEngine = VariableReplacementEngineFactory.getDefaultInstance();
    this.validationEngine = TemplateValidationEngineFactory.getDefaultInstance();
    this.cacheEngine = TemplateCacheEngineFactory.getDefaultInstance();
    this.loaders = new Map();
    this.templates = new Map();

    // 注册默认加载器
    this.registerLoader('file', new FileTemplateLoader('./templates'));
  }

  /**
   * 加载模板
   */
  async loadTemplate(templateId: string, options?: TemplateLoadOptions): Promise<TemplateInstance> {
    const loadOptions = {
      cache: this.config.cacheEnabled,
      validate: this.config.validationEnabled,
      ...options
    };

    // 检查缓存
    if (loadOptions.cache) {
      const cached = await this.cacheEngine.get(templateId);
      if (cached) {
        return cached;
      }
    }

    // 从注册的加载器加载
    let template: TemplateInstance | null = null;

    for (const [name, loader] of this.loaders) {
      try {
        template = await loader.load(templateId, loadOptions);
        if (template) {
          break;
        }
      } catch (error) {
        console.warn(`Loader ${name} failed to load template ${templateId}:`, error.message);
      }
    }

    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // 验证模板
    if (loadOptions.validate) {
      const validationResults = this.validateTemplate(template);
      const errors = validationResults.filter(r => !r.passed && r.rule.severity === ValidationSeverity.ERROR);
      if (errors.length > 0) {
        throw new Error(`Template validation failed: ${errors.map(e => e.message).join(', ')}`);
      }
    }

    // 缓存模板
    if (loadOptions.cache) {
      await this.cacheEngine.set(templateId, template, { ttl: this.config.cacheTTL });
    }

    // 存储在内存中
    this.templates.set(templateId, template);

    return { ...template };
  }

  /**
   * 生成内容
   */
  async generate(
    templateId: string,
    variables: TemplateVariables,
    options?: any
  ): Promise<TemplateGenerationResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 加载模板
      const template = await this.loadTemplate(templateId, {
        cache: this.config.cacheEnabled,
        validate: this.config.validationEnabled
      });

      // 验证变量
      const variableValidation = this.variableEngine.validateVariables(template.content, variables);
      const variableErrors = variableValidation.filter(r => !r.passed && r.rule.severity === ValidationSeverity.ERROR);
      const variableWarnings = variableValidation.filter(r => !r.passed && r.rule.severity === ValidationSeverity.WARNING);

      if (variableErrors.length > 0) {
        errors.push(...variableErrors.map(e => e.message || 'Variable validation error'));
      }

      if (variableWarnings.length > 0) {
        warnings.push(...variableWarnings.map(w => w.message || 'Variable validation warning'));
      }

      // 检查完整性
      const completenessResults = this.validationEngine.checkCompleteness(template);
      const completenessErrors = completenessResults.filter(r => !r.passed && r.rule.severity === ValidationSeverity.ERROR);
      const completenessWarnings = completenessResults.filter(r => !r.passed && r.rule.severity === ValidationSeverity.WARNING);

      if (completenessErrors.length > 0) {
        errors.push(...completenessErrors.map(e => e.message || 'Completeness error'));
      }

      if (completenessWarnings.length > 0) {
        warnings.push(...completenessWarnings.map(w => w.message || 'Completeness warning'));
      }

      // 如果有错误，返回失败
      if (errors.length > 0 && this.config.strictMode) {
        return this.createGenerationResult(false, template, undefined, errors, warnings, [], Date.now() - startTime);
      }

      // 替换变量
      const compiledContent = this.compileTemplate(template, variables);

      // 验证输出
      const outputValidation = this.validationEngine.validateOutput(compiledContent, template);
      const outputErrors = outputValidation.filter(r => !r.passed && r.rule.severity === ValidationSeverity.ERROR);
      const outputWarnings = outputValidation.filter(r => !r.passed && r.rule.severity === ValidationSeverity.WARNING);

      if (outputErrors.length > 0) {
        errors.push(...outputErrors.map(e => e.message || 'Output validation error'));
      }

      if (outputWarnings.length > 0) {
        warnings.push(...outputWarnings.map(w => w.message || 'Output validation warning'));
      }

      // 计算质量
      const qualityScore = this.validationEngine.calculateQualityScore(template);
      const quality = this.mapQualityScoreToQuality(qualityScore);

      // 创建结果
      const result = this.createGenerationResult(
        errors.length === 0,
        template,
        compiledContent,
        errors,
        warnings,
        [...variableValidation, ...completenessResults, ...outputValidation],
        Date.now() - startTime,
        quality
      );

      return result;

    } catch (error: any) {
      return this.createGenerationResult(
        false,
        {} as TemplateInstance,
        undefined,
        [error.message],
        warnings,
        [],
        Date.now() - startTime,
        SummaryQuality.FAILED
      );
    }
  }

  /**
   * 验证模板
   */
  validateTemplate(template: TemplateInstance): ValidationResult[] {
    const results: ValidationResult[] = [];

    // 验证结构
    const structureResults = this.validationEngine.validateStructure(template);
    results.push(...structureResults);

    // 验证内容
    const contentResults = this.validationEngine.validateContent(template);
    results.push(...contentResults);

    // 验证变量
    const variableResults = this.validationEngine.validateVariables(template);
    results.push(...variableResults);

    return results;
  }

  /**
   * 编译模板
   */
  compileTemplate(template: TemplateInstance, variables: TemplateVariables): string {
    return this.variableEngine.replaceVariables(template.content, variables);
  }

  /**
   * 注册模板
   */
  async registerTemplate(template: TemplateInstance): Promise<void> {
    // 验证模板
    const validationResults = this.validateTemplate(template);
    const errors = validationResults.filter(r => !r.passed && r.rule.severity === ValidationSeverity.ERROR);

    if (errors.length > 0) {
      throw new Error(`Template validation failed: ${errors.map(e => e.message).join(', ')}`);
    }

    // 存储到内存
    this.templates.set(template.metadata.id, template);

    // 缓存
    if (this.config.cacheEnabled) {
      await this.cacheEngine.set(template.metadata.id, template, { ttl: this.config.cacheTTL });
    }

    // 保存到所有加载器
    for (const [name, loader] of this.loaders) {
      try {
        await loader.save(template);
      } catch (error) {
        console.warn(`Loader ${name} failed to save template ${template.metadata.id}:`, error.message);
      }
    }
  }

  /**
   * 注销模板
   */
  async unregisterTemplate(templateId: string): Promise<void> {
    // 从内存中移除
    this.templates.delete(templateId);

    // 从缓存中移除
    await this.cacheEngine.delete(templateId);

    // 从所有加载器中删除
    for (const [name, loader] of this.loaders) {
      try {
        await loader.delete(templateId);
      } catch (error) {
        console.warn(`Loader ${name} failed to delete template ${templateId}:`, error.message);
      }
    }
  }

  /**
   * 获取模板列表
   */
  async listTemplates(filter?: any): Promise<TemplateInstance[]> {
    const templates: TemplateInstance[] = [];

    // 从内存中获取
    for (const template of this.templates.values()) {
      if (this.matchesFilter(template, filter)) {
        templates.push({ ...template });
      }
    }

    // 如果没有匹配的，尝试从加载器获取
    if (templates.length === 0) {
      for (const [name, loader] of this.loaders) {
        try {
          const templateIds = await loader.list(filter);
          for (const templateId of templateIds) {
            try {
              const template = await this.loadTemplate(templateId);
              if (this.matchesFilter(template, filter)) {
                templates.push(template);
              }
            } catch (error) {
              console.warn(`Failed to load template ${templateId} from loader ${name}:`, error.message);
            }
          }
        } catch (error) {
          console.warn(`Loader ${name} failed to list templates:`, error.message);
        }
      }
    }

    return templates;
  }

  /**
   * 获取模板信息
   */
  async getTemplateInfo(templateId: string): Promise<TemplateMetadata> {
    const template = await this.loadTemplate(templateId, { cache: true });
    return { ...template.metadata };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TemplateEngineConfig>): void {
    this.config = { ...this.config, ...config };

    // 更新缓存引擎配置
    if (config.cacheTTL) {
      // 缓存引擎可能需要知道新的TTL
    }
  }

  /**
   * 获取引擎配置
   */
  getConfig(): TemplateEngineConfig {
    return { ...this.config };
  }

  /**
   * 注册加载器
   */
  registerLoader(name: string, loader: TemplateLoader): void {
    this.loaders.set(name, loader);
  }

  /**
   * 注销加载器
   */
  unregisterLoader(name: string): boolean {
    return this.loaders.delete(name);
  }

  /**
   * 获取变量引擎
   */
  getVariableEngine(): VariableReplacementEngine {
    return this.variableEngine;
  }

  /**
   * 获取验证引擎
   */
  getValidationEngine(): TemplateValidationEngine {
    return this.validationEngine;
  }

  /**
   * 获取缓存引擎
   */
  getCacheEngine(): TemplateCacheEngine {
    return this.cacheEngine;
  }

  /**
   * 创建生成结果
   */
  private createGenerationResult(
    success: boolean,
    template: TemplateInstance,
    output: string | undefined,
    errors: string[],
    warnings: string[],
    validationResults: ValidationResult[],
    generationTime: number,
    quality: SummaryQuality = SummaryQuality.MEDIUM
  ): TemplateGenerationResult {
    return {
      success,
      template,
      output,
      errors,
      warnings,
      validationResults,
      generationTime,
      quality
    };
  }

  /**
   * 将质量分数映射到质量等级
   */
  private mapQualityScoreToQuality(score: number): SummaryQuality {
    if (score >= 80) return SummaryQuality.HIGH;
    if (score >= 60) return SummaryQuality.MEDIUM;
    if (score >= 40) return SummaryQuality.LOW;
    return SummaryQuality.FAILED;
  }

  /**
   * 检查模板是否匹配过滤器
   */
  private matchesFilter(template: TemplateInstance, filter?: any): boolean {
    if (!filter) {
      return true;
    }

    // 检查类型
    if (filter.type && template.config.type !== filter.type) {
      return false;
    }

    // 检查语言
    if (filter.language && template.config.language !== filter.language) {
      return false;
    }

    // 检查格式
    if (filter.format && template.config.format !== filter.format) {
      return false;
    }

    // 检查标签
    if (filter.tags && filter.tags.length > 0) {
      const hasAllTags = filter.tags.every((tag: string) =>
        template.metadata.tags.includes(tag)
      );
      if (!hasAllTags) {
        return false;
      }
    }

    // 检查版本
    if (filter.version) {
      if (typeof filter.version === 'string') {
        if (template.metadata.version !== filter.version) {
          return false;
        }
      } else if (filter.version.min && template.metadata.version < filter.version.min) {
        return false;
      } else if (filter.version.max && template.metadata.version > filter.version.max) {
        return false;
      }
    }

    return true;
  }
}

/**
 * 模板引擎工厂
 */
export class TemplateEngineFactory {
  private static instances: Map<string, TemplateEngine> = new Map();

  /**
   * 获取默认实例
   */
  public static getDefaultInstance(): TemplateEngine {
    return this.getInstance('default');
  }

  /**
   * 获取实例
   */
  public static getInstance(name: string = 'default'): TemplateEngine {
    if (!this.instances.has(name)) {
      this.instances.set(name, new DefaultTemplateEngine());
    }
    return this.instances.get(name)!;
  }

  /**
   * 创建自定义实例
   */
  public static createInstance(
    name: string,
    config: Partial<TemplateEngineConfig>
  ): TemplateEngine {
    const instance = new DefaultTemplateEngine(config);
    this.instances.set(name, instance);
    return instance;
  }

  /**
   * 移除实例
   */
  public static removeInstance(name: string): boolean {
    return this.instances.delete(name);
  }

  /**
   * 获取所有实例信息
   */
  public static getAllInstancesInfo(): Array<{
    name: string;
    config: TemplateEngineConfig;
    stats: any;
  }> {
    const info = [];

    for (const [name, engine] of this.instances) {
      const defaultEngine = engine as DefaultTemplateEngine;
      info.push({
        name,
        config: engine.getConfig(),
        stats: {
          templateCount: (defaultEngine as any).templates?.size || 0,
          cacheStats: defaultEngine.getCacheEngine()?.getStats()
        }
      });
    }

    return info;
  }
}