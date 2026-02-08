/**
 * 模板验证引擎实现
 */

import {
  TemplateValidationEngine
} from './index';
import {
  TemplateInstance,
  ValidationResult,
  TemplateConfig,
  TemplateSection,
  ValidationRuleType,
  ValidationSeverity,
  OutputFormat,
  TemplateFormat
} from '../types';

/**
 * 模板验证引擎配置
 */
export interface TemplateValidationEngineConfig {
  validateStructure: boolean;
  validateContent: boolean;
  validateVariables: boolean;
  validateOutput: boolean;
  strictMode: boolean;
  maxSectionLength: number;
  minSectionLength: number;
  requiredSections: string[];
  allowedFormats: TemplateFormat[];
}

/**
 * 默认配置
 */
export const DEFAULT_TEMPLATE_VALIDATION_CONFIG: TemplateValidationEngineConfig = {
  validateStructure: true,
  validateContent: true,
  validateVariables: true,
  validateOutput: true,
  strictMode: false,
  maxSectionLength: 10000,
  minSectionLength: 10,
  requiredSections: ['header', 'body', 'footer'],
  allowedFormats: [TemplateFormat.MARKDOWN, TemplateFormat.PLAIN_TEXT]
};

/**
 * 模板验证引擎
 */
export class DefaultTemplateValidationEngine implements TemplateValidationEngine {
  private config: TemplateValidationEngineConfig;

  constructor(config: Partial<TemplateValidationEngineConfig> = {}) {
    this.config = { ...DEFAULT_TEMPLATE_VALIDATION_CONFIG, ...config };
  }

  /**
   * 验证模板结构
   */
  validateStructure(template: TemplateInstance): ValidationResult[] {
    const results: ValidationResult[] = [];

    if (!this.config.validateStructure) {
      return results;
    }

    // 检查元数据
    if (!template.metadata || !template.metadata.id) {
      results.push(this.createValidationResult(
        ValidationRuleType.STRUCTURE,
        'Template must have metadata with id',
        'Missing template metadata',
        ValidationSeverity.ERROR,
        false
      ));
    }

    // 检查配置
    if (!template.config) {
      results.push(this.createValidationResult(
        ValidationRuleType.STRUCTURE,
        'Template must have configuration',
        'Missing template configuration',
        ValidationSeverity.ERROR,
        false
      ));
    }

    // 检查内容
    if (!template.content || template.content.trim().length === 0) {
      results.push(this.createValidationResult(
        ValidationRuleType.STRUCTURE,
        'Template must have content',
        'Template content is empty',
        ValidationSeverity.ERROR,
        false
      ));
    }

    // 检查配置结构
    if (template.config) {
      const configResults = this.validateConfigStructure(template.config);
      results.push(...configResults);
    }

    return results;
  }

  /**
   * 验证模板内容
   */
  validateContent(template: TemplateInstance): ValidationResult[] {
    const results: ValidationResult[] = [];

    if (!this.config.validateContent) {
      return results;
    }

    // 检查内容长度
    if (template.content) {
      const length = template.content.length;
      if (length < this.config.minSectionLength) {
        results.push(this.createValidationResult(
          ValidationRuleType.LENGTH,
          `Template content must be at least ${this.config.minSectionLength} characters`,
          `Template content is too short: ${length} characters`,
          ValidationSeverity.WARNING,
          false
        ));
      }

      if (length > this.config.maxSectionLength) {
        results.push(this.createValidationResult(
          ValidationRuleType.LENGTH,
          `Template content must not exceed ${this.config.maxSectionLength} characters`,
          `Template content is too long: ${length} characters`,
          ValidationSeverity.WARNING,
          false
        ));
      }
    }

    // 检查变量引用
    if (template.content) {
      const variablePattern = /\{\{([^{}]+)\}\}/g;
      const variableMatches = template.content.match(variablePattern);

      if (variableMatches) {
        const variableCount = variableMatches.length;
        if (variableCount > 100) {
          results.push(this.createValidationResult(
            ValidationRuleType.CONTENT,
            'Template should not have too many variables',
            `Template has ${variableCount} variables, which may be excessive`,
            ValidationSeverity.WARNING,
            true
          ));
        }
      }
    }

    // 检查格式问题
    if (template.content) {
      const formatIssues = this.checkFormatIssues(template.content);
      results.push(...formatIssues);
    }

    return results;
  }

  /**
   * 验证变量
   */
  validateVariables(template: TemplateInstance): ValidationResult[] {
    const results: ValidationResult[] = [];

    if (!this.config.validateVariables) {
      return results;
    }

    // 检查变量定义
    if (template.config && template.config.variables) {
      for (const variableDef of template.config.variables) {
        const variableResults = this.validateVariableDefinition(variableDef);
        results.push(...variableResults);
      }
    }

    // 检查变量使用
    if (template.variables) {
      for (const [key, value] of Object.entries(template.variables)) {
        const variableResults = this.validateVariableValue(key, value);
        results.push(...variableResults);
      }
    }

    return results;
  }

  /**
   * 验证输出
   */
  validateOutput(output: string, template: TemplateInstance): ValidationResult[] {
    const results: ValidationResult[] = [];

    if (!this.config.validateOutput) {
      return results;
    }

    // 检查输出是否为空
    if (!output || output.trim().length === 0) {
      results.push(this.createValidationResult(
        ValidationRuleType.CONTENT,
        'Output must not be empty',
        'Generated output is empty',
        ValidationSeverity.ERROR,
        false
      ));
      return results;
    }

    // 检查输出长度
    const length = output.length;
    if (length < 100) {
      results.push(this.createValidationResult(
        ValidationRuleType.LENGTH,
        'Output should be at least 100 characters',
        `Output is too short: ${length} characters`,
        ValidationSeverity.WARNING,
        true
      ));
    }

    // 检查是否包含未替换的变量
    const variablePattern = /\{\{([^{}]+)\}\}/g;
    const unmatchedVariables = output.match(variablePattern);
    if (unmatchedVariables && unmatchedVariables.length > 0) {
      results.push(this.createValidationResult(
        ValidationRuleType.CONTENT,
        'Output should not contain un-replaced variables',
        `Found ${unmatchedVariables.length} un-replaced variables in output`,
        ValidationSeverity.ERROR,
        false
      ));
    }

    // 检查输出格式
    if (template.config && template.config.outputFormat) {
      const formatResults = this.validateOutputFormat(output, template.config.outputFormat);
      results.push(...formatResults);
    }

    return results;
  }

  /**
   * 检查完整性
   */
  checkCompleteness(template: TemplateInstance): ValidationResult[] {
    const results: ValidationResult[] = [];

    // 检查必需部分
    if (template.config && template.config.sections) {
      const requiredSections = this.config.requiredSections;
      const presentSections = template.config.sections.map(s => s.id);

      for (const requiredSection of requiredSections) {
        if (!presentSections.includes(requiredSection)) {
          results.push(this.createValidationResult(
            ValidationRuleType.COMPLETENESS,
            `Template must have ${requiredSection} section`,
            `Missing required section: ${requiredSection}`,
            ValidationSeverity.WARNING,
            true
          ));
        }
      }
    }

    // 检查必需变量
    if (template.config && template.config.variables) {
      const requiredVariables = template.config.variables.filter(v => v.required);

      for (const variable of requiredVariables) {
        if (!template.variables || !template.variables.hasOwnProperty(variable.name)) {
          results.push(this.createValidationResult(
            ValidationRuleType.COMPLETENESS,
            `Required variable ${variable.name} must be provided`,
            `Missing required variable: ${variable.name}`,
            ValidationSeverity.ERROR,
            false
          ));
        }
      }
    }

    return results;
  }

  /**
   * 计算质量分数
   */
  calculateQualityScore(template: TemplateInstance): number {
    let score = 100;

    // 结构完整性扣分
    const structureResults = this.validateStructure(template);
    score -= structureResults.filter(r => !r.passed && r.rule.severity === ValidationSeverity.ERROR).length * 10;

    // 内容质量扣分
    const contentResults = this.validateContent(template);
    score -= contentResults.filter(r => !r.passed).length * 5;

    // 变量完整性扣分
    const completenessResults = this.checkCompleteness(template);
    score -= completenessResults.filter(r => !r.passed).length * 15;

    // 确保分数在0-100之间
    return Math.max(0, Math.min(100, score));
  }

  /**
   * 验证配置结构
   */
  private validateConfigStructure(config: TemplateConfig): ValidationResult[] {
    const results: ValidationResult[] = [];

    // 检查类型
    if (!config.type) {
      results.push(this.createValidationResult(
        ValidationRuleType.STRUCTURE,
        'Template config must have type',
        'Missing template type in configuration',
        ValidationSeverity.ERROR,
        false
      ));
    }

    // 检查语言
    if (!config.language) {
      results.push(this.createValidationResult(
        ValidationRuleType.STRUCTURE,
        'Template config must have language',
        'Missing template language in configuration',
        ValidationSeverity.ERROR,
        false
      ));
    }

    // 检查格式
    if (!config.format) {
      results.push(this.createValidationResult(
        ValidationRuleType.STRUCTURE,
        'Template config must have format',
        'Missing template format in configuration',
        ValidationSeverity.ERROR,
        false
      ));
    } else if (!this.config.allowedFormats.includes(config.format)) {
      results.push(this.createValidationResult(
        ValidationRuleType.FORMAT,
        `Template format must be one of: ${this.config.allowedFormats.join(', ')}`,
        `Unsupported template format: ${config.format}`,
        ValidationSeverity.ERROR,
        false
      ));
    }

    return results;
  }

  /**
   * 检查格式问题
   */
  private checkFormatIssues(content: string): ValidationResult[] {
    const results: ValidationResult[] = [];

    // 检查换行符一致性
    const crlfCount = (content.match(/\r\n/g) || []).length;
    const lfCount = (content.match(/\n/g) || []).length - crlfCount;

    if (crlfCount > 0 && lfCount > 0) {
      results.push(this.createValidationResult(
        ValidationRuleType.FORMAT,
        'Template should use consistent line endings',
        'Mixed line endings (CRLF and LF) found in template',
        ValidationSeverity.WARNING,
        true
      ));
    }

    // 检查尾随空格
    const trailingSpaceLines = content.split('\n').filter(line => line.trim().length > 0 && line.endsWith(' '));
    if (trailingSpaceLines.length > 0) {
      results.push(this.createValidationResult(
        ValidationRuleType.FORMAT,
        'Template should not have trailing spaces',
        `Found ${trailingSpaceLines.length} lines with trailing spaces`,
        ValidationSeverity.WARNING,
        true
      ));
    }

    // 检查制表符使用
    const tabCount = (content.match(/\t/g) || []).length;
    if (tabCount > 0) {
      results.push(this.createValidationResult(
        ValidationRuleType.FORMAT,
        'Template should use spaces instead of tabs',
        `Found ${tabCount} tab characters`,
        ValidationSeverity.WARNING,
        true
      ));
    }

    return results;
  }

  /**
   * 验证变量定义
   */
  private validateVariableDefinition(variableDef: any): ValidationResult[] {
    const results: ValidationResult[] = [];

    // 检查必要字段
    if (!variableDef.name) {
      results.push(this.createValidationResult(
        ValidationRuleType.STRUCTURE,
        'Variable definition must have name',
        'Variable definition missing name',
        ValidationSeverity.ERROR,
        false
      ));
    }

    if (!variableDef.type) {
      results.push(this.createValidationResult(
        ValidationRuleType.STRUCTURE,
        'Variable definition must have type',
        `Variable ${variableDef.name || 'unknown'} missing type`,
        ValidationSeverity.ERROR,
        false
      ));
    }

    if (variableDef.required === undefined) {
      results.push(this.createValidationResult(
        ValidationRuleType.STRUCTURE,
        'Variable definition must specify required flag',
        `Variable ${variableDef.name || 'unknown'} missing required flag`,
        ValidationSeverity.ERROR,
        false
      ));
    }

    return results;
  }

  /**
   * 验证变量值
   */
  private validateVariableValue(name: string, value: any): ValidationResult[] {
    const results: ValidationResult[] = [];

    // 检查值是否为空（对于必需变量）
    if (value === null || value === undefined || value === '') {
      results.push(this.createValidationResult(
        ValidationRuleType.CONTENT,
        'Variable value should not be empty',
        `Variable ${name} has empty value`,
        ValidationSeverity.WARNING,
        true
      ));
    }

    // 检查类型一致性
    if (typeof value === 'number' && isNaN(value)) {
      results.push(this.createValidationResult(
        ValidationRuleType.CONTENT,
        'Variable value should be a valid number',
        `Variable ${name} has NaN value`,
        ValidationSeverity.ERROR,
        false
      ));
    }

    return results;
  }

  /**
   * 验证输出格式
   */
  private validateOutputFormat(output: string, outputFormat: OutputFormat): ValidationResult[] {
    const results: ValidationResult[] = [];

    // 检查Markdown格式
    if (outputFormat.type === TemplateFormat.MARKDOWN) {
      // 检查是否有未闭合的Markdown标记
      const markdownIssues = this.checkMarkdownIssues(output);
      results.push(...markdownIssues);
    }

    // 检查HTML格式
    if (outputFormat.type === TemplateFormat.HTML) {
      // 检查基本的HTML结构
      if (!output.includes('<') && !output.includes('>')) {
        results.push(this.createValidationResult(
          ValidationRuleType.FORMAT,
          'HTML output should contain HTML tags',
          'Output marked as HTML but contains no HTML tags',
          ValidationSeverity.WARNING,
          true
        ));
      }
    }

    return results;
  }

  /**
   * 检查Markdown问题
   */
  private checkMarkdownIssues(content: string): ValidationResult[] {
    const results: ValidationResult[] = [];

    // 检查未闭合的代码块
    const codeBlockCount = (content.match(/```/g) || []).length;
    if (codeBlockCount % 2 !== 0) {
      results.push(this.createValidationResult(
        ValidationRuleType.FORMAT,
        'Markdown code blocks should be properly closed',
        'Unclosed code block found in Markdown',
        ValidationSeverity.WARNING,
        true
      ));
    }

    // 检查未闭合的链接或图片
    const linkPattern = /\[([^\]]+)\]\([^)]+\)/g;
    const badLinks = content.match(/\[[^\]]*\]\([^)]*$/g);
    if (badLinks && badLinks.length > 0) {
      results.push(this.createValidationResult(
        ValidationRuleType.FORMAT,
        'Markdown links should be properly formatted',
        `Found ${badLinks.length} malformed Markdown links`,
        ValidationSeverity.WARNING,
        true
      ));
    }

    return results;
  }

  /**
   * 创建验证结果
   */
  private createValidationResult(
    type: ValidationRuleType,
    condition: string,
    message: string,
    severity: ValidationSeverity,
    passed: boolean
  ): ValidationResult {
    return {
      rule: {
        type,
        condition,
        message,
        severity
      },
      passed,
      message,
      timestamp: new Date()
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<TemplateValidationEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): TemplateValidationEngineConfig {
    return { ...this.config };
  }
}

/**
 * 模板验证引擎工厂
 */
export class TemplateValidationEngineFactory {
  private static instances: Map<string, TemplateValidationEngine> = new Map();

  /**
   * 获取默认实例
   */
  public static getDefaultInstance(): TemplateValidationEngine {
    return this.getInstance('default');
  }

  /**
   * 获取实例
   */
  public static getInstance(name: string = 'default'): TemplateValidationEngine {
    if (!this.instances.has(name)) {
      this.instances.set(name, new DefaultTemplateValidationEngine());
    }
    return this.instances.get(name)!;
  }

  /**
   * 创建自定义实例
   */
  public static createInstance(
    name: string,
    config: Partial<TemplateValidationEngineConfig>
  ): TemplateValidationEngine {
    const instance = new DefaultTemplateValidationEngine(config);
    this.instances.set(name, instance);
    return instance;
  }

  /**
   * 移除实例
   */
  public static removeInstance(name: string): boolean {
    return this.instances.delete(name);
  }
}