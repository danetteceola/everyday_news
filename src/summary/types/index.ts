/**
 * 总结生成模块类型定义
 */

// 总结类型
export enum SummaryType {
  DAILY = 'daily',           // 每日总结
  INVESTMENT = 'investment', // 投资焦点总结
  BRIEF = 'brief',           // 简要总结
  CUSTOM = 'custom'          // 自定义总结
}

// 总结语言
export enum SummaryLanguage {
  ZH = 'zh',  // 中文
  EN = 'en'   // 英文
}

// 总结质量等级
export enum SummaryQuality {
  HIGH = 'high',     // 高质量（AI生成）
  MEDIUM = 'medium', // 中等质量
  LOW = 'low',       // 低质量（模板降级）
  FAILED = 'failed'  // 生成失败
}

// 总结数据模型
export interface SummaryData {
  id?: string;
  type: SummaryType;
  language: SummaryLanguage;
  title: string;
  content: string;
  date: Date;
  quality: SummaryQuality;
  metadata: SummaryMetadata;
  createdAt?: Date;
  updatedAt?: Date;
}

// 总结元数据
export interface SummaryMetadata {
  sourceCount: number;           // 数据源数量
  topics: string[];              // 主题列表
  keywords: string[];            // 关键词列表
  sentiment?: 'positive' | 'negative' | 'neutral'; // 情感分析
  length: number;                // 总结长度（字符数）
  tokenUsage?: number;           // Token使用量
  model?: string;                // 使用的模型
  cost?: number;                 // 生成成本
  generationTime?: number;       // 生成时间（毫秒）
}

// LLM模型配置
export interface LLMConfig {
  provider: 'anthropic' | 'openai' | 'openrouter' | 'deepseek';
  model: string;
  apiKey: string;
  baseUrl?: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retryCount: number;
  retryDelay: number;
}

// 模板配置
export interface TemplateConfig {
  id: string;
  name: string;
  type: SummaryType;
  language: SummaryLanguage;
  content: string;
  variables: TemplateVariable[];
  version: string;
  enabled: boolean;
}

// 模板变量
export interface TemplateVariable {
  name: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
}

// 触发配置
export interface TriggerConfig {
  type: 'scheduled' | 'manual' | 'api';
  schedule?: string;  // cron表达式
  enabled: boolean;
  priority: number;
}

// 质量控制配置
export interface QualityControlConfig {
  minLength: number;
  maxLength: number;
  requiredTopics: string[];
  forbiddenKeywords: string[];
  qualityThreshold: number;
  fallbackTemplate?: string;
}

// 生成请求
export interface GenerateRequest {
  type: SummaryType;
  language: SummaryLanguage;
  data: any;  // 输入数据
  templateId?: string;
  model?: string;
  options?: GenerateOptions;
}

// 生成选项
export interface GenerateOptions {
  maxTokens?: number;
  temperature?: number;
  useCache?: boolean;
  validateQuality?: boolean;
  fallbackOnFailure?: boolean;
}

// 生成响应
export interface GenerateResponse {
  success: boolean;
  summary?: SummaryData;
  error?: string;
  warnings: string[];
  metadata: {
    tokenUsage: number;
    cost: number;
    generationTime: number;
    model: string;
    qualityScore: number;
  };
}

// Claude Skill参数
export interface ClaudeSkillParams {
  date?: string;
  type?: SummaryType;
  language?: SummaryLanguage;
  template?: string;
  forceRegenerate?: boolean;
}

// 存储配置
export interface StorageConfig {
  type: 'database' | 'file' | 'memory';
  database?: {
    table: string;
    connection: any;
  };
  file?: {
    path: string;
    format: 'json' | 'markdown' | 'html';
  };
  retentionDays: number;
  maxSummaries: number;
}

// 监控指标
export interface SummaryMetrics {
  totalGenerated: number;
  successRate: number;
  averageQuality: number;
  averageCost: number;
  averageTime: number;
  byType: Record<SummaryType, number>;
  byLanguage: Record<SummaryLanguage, number>;
  byQuality: Record<SummaryQuality, number>;
  last24Hours: {
    generated: number;
    failed: number;
    averageCost: number;
  };
}