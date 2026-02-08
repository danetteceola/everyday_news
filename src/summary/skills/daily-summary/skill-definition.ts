/**
 * Daily Summary Claude Skill 定义
 */

import { SkillDefinition, SkillParamConfig } from '../types';

/**
 * Daily Summary Skill 参数定义
 */
export const DAILY_SUMMARY_SKILL_PARAMS: SkillParamConfig[] = [
  {
    name: 'date',
    type: 'string',
    description: '生成总结的日期，格式：YYYY-MM-DD，默认为今天',
    required: false,
    defaultValue: new Date().toISOString().split('T')[0],
    validator: (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value)
  },
  {
    name: 'language',
    type: 'string',
    description: '总结语言，可选值：zh（中文）、en（英文）',
    required: false,
    defaultValue: 'zh',
    validator: (value: string) => ['zh', 'en'].includes(value)
  },
  {
    name: 'summaryType',
    type: 'string',
    description: '总结类型，可选值：daily（每日总结）、investment（投资总结）、brief（简要总结）',
    required: false,
    defaultValue: 'daily',
    validator: (value: string) => ['daily', 'investment', 'brief'].includes(value)
  },
  {
    name: 'sources',
    type: 'array',
    description: '数据来源，可选值：twitter, youtube, tiktok, weibo, douyin，默认为所有来源',
    required: false,
    defaultValue: ['twitter', 'youtube', 'tiktok', 'weibo', 'douyin'],
    validator: (value: any[]) => {
      if (!Array.isArray(value)) return false;
      const allowed = ['twitter', 'youtube', 'tiktok', 'weibo', 'douyin'];
      return value.every(v => allowed.includes(v));
    }
  },
  {
    name: 'maxLength',
    type: 'number',
    description: '总结最大长度（字符数），默认值为1000',
    required: false,
    defaultValue: 1000,
    validator: (value: number) => value > 0 && value <= 5000
  },
  {
    name: 'includeTrends',
    type: 'boolean',
    description: '是否包含趋势分析，默认为true',
    required: false,
    defaultValue: true
  },
  {
    name: 'includeStatistics',
    type: 'boolean',
    description: '是否包含统计数据，默认为true',
    required: false,
    defaultValue: true
  },
  {
    name: 'outputFormat',
    type: 'string',
    description: '输出格式，可选值：markdown、html、plaintext，默认为markdown',
    required: false,
    defaultValue: 'markdown',
    validator: (value: string) => ['markdown', 'html', 'plaintext'].includes(value)
  }
];

/**
 * Daily Summary Skill 示例
 */
export const DAILY_SUMMARY_SKILL_EXAMPLES = [
  '生成今天的新闻总结',
  '生成昨天的投资总结，语言为英文',
  '生成微博和抖音的简要总结',
  '生成本周趋势总结，包含统计数据'
];

/**
 * Daily Summary Skill 定义
 */
export const DAILY_SUMMARY_SKILL_DEFINITION: SkillDefinition = {
  id: 'daily-summary',
  name: '每日新闻总结',
  description: '从多个社交媒体平台收集新闻并生成AI总结',
  category: 'news-analysis',
  parameters: DAILY_SUMMARY_SKILL_PARAMS,
  examples: DAILY_SUMMARY_SKILL_EXAMPLES,
  requiresAuth: true,
  enabled: true,
  version: '1.0.0'
};

/**
 * 参数验证器
 */
export function validateDailySummaryParams(params: Record<string, any>): {
  valid: boolean;
  errors?: string[];
  validatedParams?: Record<string, any>;
} {
  const errors: string[] = [];
  const validatedParams: Record<string, any> = {};

  for (const paramConfig of DAILY_SUMMARY_SKILL_PARAMS) {
    const paramValue = params.hasOwnProperty(paramConfig.name) ? params[paramConfig.name] : paramConfig.defaultValue;

    // 如果参数是必需的且未提供
    if (paramConfig.required && paramValue === undefined) {
      errors.push(`参数 "${paramConfig.name}" 是必需的`);
      continue;
    }

    // 验证参数类型
    if (paramValue !== undefined) {
      // 类型检查
      let typeValid = true;
      switch (paramConfig.type) {
        case 'string':
          typeValid = typeof paramValue === 'string';
          break;
        case 'number':
          typeValid = typeof paramValue === 'number';
          break;
        case 'boolean':
          typeValid = typeof paramValue === 'boolean';
          break;
        case 'array':
          typeValid = Array.isArray(paramValue);
          break;
        case 'object':
          typeValid = typeof paramValue === 'object' && paramValue !== null;
          break;
      }

      if (!typeValid) {
        errors.push(`参数 "${paramConfig.name}" 类型错误，期望 ${paramConfig.type}`);
        continue;
      }

      // 验证器检查
      if (paramConfig.validator && !paramConfig.validator(paramValue)) {
        errors.push(`参数 "${paramConfig.name}" 值无效`);
        continue;
      }
    }

    // 使用验证后的值或默认值
    validatedParams[paramConfig.name] = paramValue !== undefined ? paramValue : paramConfig.defaultValue;
  }

  // 检查未知参数
  const validParamNames = DAILY_SUMMARY_SKILL_PARAMS.map(p => p.name);
  for (const paramName of Object.keys(params)) {
    if (!validParamNames.includes(paramName)) {
      errors.push(`未知参数 "${paramName}"`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, validatedParams };
}