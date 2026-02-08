/**
 * 总结模板系统主入口
 */

// 导出类型
export * from './types';

// 导出引擎
export * from './engines';
export * from './engines/variable-replacement-engine';
export * from './engines/template-validation-engine';
export * from './engines/template-cache-engine';
export * from './engines/template-engine';

// 导出加载器
export * from './loaders';

// 导出模板定义
export * from './template-definitions';

// 导出默认实例
import { VariableReplacementEngineFactory } from './engines/variable-replacement-engine';
import { TemplateValidationEngineFactory } from './engines/template-validation-engine';
import { TemplateCacheEngineFactory } from './engines/template-cache-engine';
import { TemplateEngineFactory } from './engines/template-engine';
import { TemplateLoaderFactory } from './loaders';

export const variableReplacementEngine = VariableReplacementEngineFactory.getDefaultInstance();
export const templateValidationEngine = TemplateValidationEngineFactory.getDefaultInstance();
export const templateCacheEngine = TemplateCacheEngineFactory.getDefaultInstance();
export const templateEngine = TemplateEngineFactory.getDefaultInstance();
export const templateLoader = TemplateLoaderFactory.getDefaultInstance();

// 导出辅助函数
import {
  createDailySummaryTemplateZh,
  createInvestmentSummaryTemplateZh,
  createBriefSummaryTemplateZh,
  createDailySummaryTemplateEn,
  createInvestmentSummaryTemplateEn,
  createBriefSummaryTemplateEn,
  TemplateRegistry
} from './template-definitions';

export const templateHelpers = {
  createDailySummaryTemplateZh,
  createInvestmentSummaryTemplateZh,
  createBriefSummaryTemplateZh,
  createDailySummaryTemplateEn,
  createInvestmentSummaryTemplateEn,
  createBriefSummaryTemplateEn,
  TemplateRegistry
};

// 默认导出模板引擎
export default templateEngine;