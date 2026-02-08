/**
 * 模板引擎接口和基础实现
 */

import {
  TemplateInstance,
  TemplateVariables,
  TemplateConfig,
  TemplateMetadata,
  TemplateGenerationResult,
  TemplateLoadOptions,
  ValidationResult,
  TemplateEngineConfig,
  ValidationRuleType,
  ValidationSeverity
} from '../types';

// Re-export types for convenience
export type {
  TemplateInstance,
  TemplateVariables,
  TemplateConfig,
  TemplateMetadata,
  TemplateGenerationResult,
  TemplateLoadOptions,
  ValidationResult,
  TemplateEngineConfig,
  ValidationRuleType,
  ValidationSeverity
};

/**
 * 模板引擎接口
 */
export interface TemplateEngine {
  /**
   * 加载模板
   */
  loadTemplate(templateId: string, options?: TemplateLoadOptions): Promise<TemplateInstance>;

  /**
   * 生成内容
   */
  generate(
    templateId: string,
    variables: TemplateVariables,
    options?: any
  ): Promise<TemplateGenerationResult>;

  /**
   * 验证模板
   */
  validateTemplate(template: TemplateInstance): ValidationResult[];

  /**
   * 编译模板
   */
  compileTemplate(template: TemplateInstance, variables: TemplateVariables): string;

  /**
   * 注册模板
   */
  registerTemplate(template: TemplateInstance): Promise<void>;

  /**
   * 注销模板
   */
  unregisterTemplate(templateId: string): Promise<void>;

  /**
   * 获取模板列表
   */
  listTemplates(filter?: any): Promise<TemplateInstance[]>;

  /**
   * 获取模板信息
   */
  getTemplateInfo(templateId: string): Promise<TemplateMetadata>;

  /**
   * 更新模板配置
   */
  updateConfig(config: Partial<TemplateEngineConfig>): void;

  /**
   * 获取引擎配置
   */
  getConfig(): TemplateEngineConfig;
}

/**
 * 变量替换引擎接口
 */
export interface VariableReplacementEngine {
  /**
   * 替换变量
   */
  replaceVariables(template: string, variables: TemplateVariables): string;

  /**
   * 提取变量
   */
  extractVariables(template: string): string[];

  /**
   * 验证变量
   */
  validateVariables(template: string, variables: TemplateVariables): ValidationResult[];

  /**
   * 转义变量
   */
  escapeVariable(value: any, context?: any): string;

  /**
   * 解转义变量
   */
  unescapeVariable(value: string, context?: any): any;

  /**
   * 格式化变量
   */
  formatVariable(value: any, format?: string): string;
}

/**
 * 模板验证引擎接口
 */
export interface TemplateValidationEngine {
  /**
   * 验证模板结构
   */
  validateStructure(template: TemplateInstance): ValidationResult[];

  /**
   * 验证模板内容
   */
  validateContent(template: TemplateInstance): ValidationResult[];

  /**
   * 验证变量
   */
  validateVariables(template: TemplateInstance): ValidationResult[];

  /**
   * 验证输出
   */
  validateOutput(output: string, template: TemplateInstance): ValidationResult[];

  /**
   * 检查完整性
   */
  checkCompleteness(template: TemplateInstance): ValidationResult[];

  /**
   * 计算质量分数
   */
  calculateQualityScore(template: TemplateInstance): number;
}

/**
 * 模板缓存引擎接口
 */
export interface TemplateCacheEngine {
  /**
   * 获取缓存
   */
  get(templateId: string, options?: any): Promise<TemplateInstance | null>;

  /**
   * 设置缓存
   */
  set(templateId: string, template: TemplateInstance, options?: any): Promise<void>;

  /**
   * 删除缓存
   */
  delete(templateId: string): Promise<void>;

  /**
   * 清空缓存
   */
  clear(): Promise<void>;

  /**
   * 检查缓存是否存在
   */
  has(templateId: string): Promise<boolean>;

  /**
   * 获取缓存统计
   */
  getStats(): any;

  /**
   * 清理过期缓存
   */
  cleanup(): Promise<void>;
}