/**
 * 模板系统类型定义
 */

import { SummaryType, SummaryLanguage, SummaryQuality } from '../../types';

/**
 * 模板变量类型
 */
export interface TemplateVariables {
  [key: string]: string | number | boolean | Date | string[] | number[] | any;
}

/**
 * 模板元数据
 */
export interface TemplateMetadata {
  id: string;
  name: string;
  description?: string;
  version: string;
  author?: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
  compatibleWith: string[];
}

/**
 * 模板配置
 */
export interface TemplateConfig {
  type: SummaryType;
  language: SummaryLanguage;
  format: TemplateFormat;
  sections: TemplateSection[];
  variables: TemplateVariableDefinition[];
  validationRules: ValidationRule[];
  outputFormat: OutputFormat;
  aiIntegration: AIIntegrationConfig;
}

/**
 * 模板格式
 */
export enum TemplateFormat {
  MARKDOWN = 'markdown',
  HTML = 'html',
  PLAIN_TEXT = 'plain_text',
  RICH_TEXT = 'rich_text'
}

/**
 * 模板部分
 */
export interface TemplateSection {
  id: string;
  name: string;
  description?: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  format?: string;
  variables: string[];
  contentExample?: string;
  aiGuidance?: string;
}

/**
 * 模板变量定义
 */
export interface TemplateVariableDefinition {
  name: string;
  type: TemplateVariableType;
  description?: string;
  required: boolean;
  defaultValue?: any;
  validation?: VariableValidation;
  source?: VariableSource;
}

/**
 * 模板变量类型
 */
export enum TemplateVariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  DATE = 'date',
  ARRAY = 'array',
  OBJECT = 'object'
}

/**
 * 变量验证
 */
export interface VariableValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  allowedValues?: any[];
  customValidator?: string;
}

/**
 * 变量来源
 */
export enum VariableSource {
  SYSTEM = 'system',      // 系统生成（日期、时间等）
  USER = 'user',          // 用户提供
  DATA = 'data',          // 数据源
  AI = 'ai',              // AI生成
  COMPUTED = 'computed'   // 计算得出
}

/**
 * 验证规则
 */
export interface ValidationRule {
  type: ValidationRuleType;
  condition: string;
  message: string;
  severity: ValidationSeverity;
}

/**
 * 验证规则类型
 */
export enum ValidationRuleType {
  STRUCTURE = 'structure',
  CONTENT = 'content',
  LENGTH = 'length',
  FORMAT = 'format',
  COMPLETENESS = 'completeness',
  QUALITY = 'quality'
}

/**
 * 验证严重性
 */
export enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info'
}

/**
 * 输出格式
 */
export interface OutputFormat {
  type: TemplateFormat;
  options: OutputFormatOptions;
}

/**
 * 输出格式选项
 */
export interface OutputFormatOptions {
  includeHeader?: boolean;
  includeFooter?: boolean;
  includeMetadata?: boolean;
  style?: OutputStyle;
  encoding?: string;
  lineEnding?: 'lf' | 'crlf';
}

/**
 * 输出样式
 */
export interface OutputStyle {
  font?: string;
  fontSize?: number;
  lineHeight?: number;
  margin?: number;
  theme?: string;
}

/**
 * AI集成配置
 */
export interface AIIntegrationConfig {
  useAsPrompt: boolean;
  promptSectionMapping: PromptSectionMapping[];
  validationRules: AIValidationRule[];
  fallbackStrategies: FallbackStrategy[];
}

/**
 * 提示部分映射
 */
export interface PromptSectionMapping {
  templateSectionId: string;
  promptVariable: string;
  transformation?: string;
}

/**
 * AI验证规则
 */
export interface AIValidationRule {
  check: string;
  message: string;
  action: AIValidationAction;
}

/**
 * AI验证动作
 */
export enum AIValidationAction {
  RETRY = 'retry',
  REGENERATE = 'regenerate',
  FALLBACK = 'fallback',
  WARN = 'warn',
  ACCEPT = 'accept'
}

/**
 * 回退策略
 */
export interface FallbackStrategy {
  condition: string;
  action: FallbackAction;
  templateId?: string;
  message?: string;
}

/**
 * 回退动作
 */
export enum FallbackAction {
  USE_SIMPLER_TEMPLATE = 'use_simpler_template',
  USE_PLAIN_FORMAT = 'use_plain_format',
  SKIP_SECTION = 'skip_section',
  MANUAL_REVIEW = 'manual_review'
}

/**
 * 模板实例
 */
export interface TemplateInstance {
  metadata: TemplateMetadata;
  config: TemplateConfig;
  content: string;
  compiledContent?: string;
  variables: TemplateVariables;
  validationResults: ValidationResult[];
}

/**
 * 验证结果
 */
export interface ValidationResult {
  rule: ValidationRule;
  passed: boolean;
  message?: string;
  details?: any;
  timestamp: Date;
}

/**
 * 模板生成结果
 */
export interface TemplateGenerationResult {
  success: boolean;
  template: TemplateInstance;
  output?: string;
  errors: string[];
  warnings: string[];
  validationResults: ValidationResult[];
  generationTime: number;
  quality: SummaryQuality;
}

/**
 * 模板加载选项
 */
export interface TemplateLoadOptions {
  cache?: boolean;
  validate?: boolean;
  version?: string;
  language?: SummaryLanguage;
  type?: SummaryType;
}

/**
 * 模板存储选项
 */
export interface TemplateStorageOptions {
  format?: 'json' | 'yaml' | 'markdown';
  compress?: boolean;
  encrypt?: boolean;
  backup?: boolean;
}

/**
 * 模板引擎配置
 */
export interface TemplateEngineConfig {
  cacheEnabled: boolean;
  cacheTTL: number;
  validationEnabled: boolean;
  strictMode: boolean;
  defaultLanguage: SummaryLanguage;
  fallbackLanguage: SummaryLanguage;
  autoReload: boolean;
  watchChanges: boolean;
}