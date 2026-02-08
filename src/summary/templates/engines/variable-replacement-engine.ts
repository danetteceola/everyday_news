/**
 * 变量替换引擎实现
 */

import {
  VariableReplacementEngine,
  TemplateVariables,
  ValidationResult
} from './index';
import {
  ValidationRuleType,
  ValidationSeverity
} from '../types';

/**
 * 变量替换引擎配置
 */
export interface VariableReplacementEngineConfig {
  variablePattern: RegExp;
  escapeCharacter: string;
  nestedVariableSupport: boolean;
  defaultFormatter: string;
  strictMode: boolean;
}

/**
 * 默认配置
 */
export const DEFAULT_VARIABLE_REPLACEMENT_CONFIG: VariableReplacementEngineConfig = {
  variablePattern: /\{\{([^{}]+)\}\}/g,
  escapeCharacter: '\\',
  nestedVariableSupport: true,
  defaultFormatter: 'default',
  strictMode: false
};

/**
 * 变量替换引擎
 */
export class DefaultVariableReplacementEngine implements VariableReplacementEngine {
  private config: VariableReplacementEngineConfig;

  constructor(config: Partial<VariableReplacementEngineConfig> = {}) {
    this.config = { ...DEFAULT_VARIABLE_REPLACEMENT_CONFIG, ...config };
  }

  /**
   * 替换变量
   */
  replaceVariables(template: string, variables: TemplateVariables): string {
    return template.replace(this.config.variablePattern, (match, variableExpr) => {
      try {
        const result = this.evaluateVariableExpression(variableExpr.trim(), variables);
        return this.escapeVariable(result, { inTemplate: true });
      } catch (error) {
        if (this.config.strictMode) {
          throw new Error(`Failed to replace variable ${variableExpr}: ${error.message}`);
        }
        // 在非严格模式下，保留原始变量表达式
        return match;
      }
    });
  }

  /**
   * 提取变量
   */
  extractVariables(template: string): string[] {
    const variables: string[] = [];
    const matches = template.matchAll(this.config.variablePattern);

    for (const match of matches) {
      const variableExpr = match[1].trim();
      variables.push(variableExpr);
    }

    // 去重
    return [...new Set(variables)];
  }

  /**
   * 验证变量
   */
  validateVariables(template: string, variables: TemplateVariables): ValidationResult[] {
    const results: ValidationResult[] = [];
    const extractedVariables = this.extractVariables(template);

    // 检查所有需要的变量是否都提供了
    for (const variableExpr of extractedVariables) {
      try {
        this.evaluateVariableExpression(variableExpr, variables);
      } catch (error) {
        results.push({
          rule: {
            type: ValidationRuleType.CONTENT,
            condition: `Variable ${variableExpr} is required`,
            message: `Missing variable: ${variableExpr}`,
            severity: ValidationSeverity.ERROR
          },
          passed: false,
          message: error.message,
          timestamp: new Date()
        });
      }
    }

    // 检查是否有未使用的变量
    const usedVariables = new Set(extractedVariables);
    for (const variableName of Object.keys(variables)) {
      if (!usedVariables.has(variableName)) {
        results.push({
          rule: {
            type: ValidationRuleType.CONTENT,
            condition: `Variable ${variableName} is not used`,
            message: `Unused variable: ${variableName}`,
            severity: ValidationSeverity.WARNING
          },
          passed: true,
          message: `Variable "${variableName}" is provided but not used in template`,
          timestamp: new Date()
        });
      }
    }

    return results;
  }

  /**
   * 转义变量
   */
  escapeVariable(value: any, context?: any): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      // 根据上下文决定是否需要转义
      if (context?.inTemplate) {
        // 在模板中，转义特殊字符
        return value
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#039;');
      }
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value.toString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map(item => this.escapeVariable(item, context)).join(', ');
    }

    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[Object]';
      }
    }

    return String(value);
  }

  /**
   * 解转义变量
   */
  unescapeVariable(value: string, context?: any): any {
    if (!value) {
      return value;
    }

    if (context?.inTemplate) {
      // 反转义HTML实体
      return value
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'");
    }

    return value;
  }

  /**
   * 格式化变量
   */
  formatVariable(value: any, format?: string): string {
    const escapedValue = this.escapeVariable(value);

    if (!format || format === 'default') {
      return escapedValue;
    }

    switch (format.toLowerCase()) {
      case 'uppercase':
        return escapedValue.toUpperCase();
      case 'lowercase':
        return escapedValue.toLowerCase();
      case 'capitalize':
        return escapedValue.charAt(0).toUpperCase() + escapedValue.slice(1);
      case 'date':
        if (value instanceof Date) {
          return value.toLocaleDateString();
        }
        return escapedValue;
      case 'time':
        if (value instanceof Date) {
          return value.toLocaleTimeString();
        }
        return escapedValue;
      case 'datetime':
        if (value instanceof Date) {
          return value.toLocaleString();
        }
        return escapedValue;
      case 'number':
        if (typeof value === 'number') {
          return value.toLocaleString();
        }
        return escapedValue;
      case 'currency':
        if (typeof value === 'number') {
          return `¥${value.toFixed(2)}`;
        }
        return escapedValue;
      case 'percentage':
        if (typeof value === 'number') {
          return `${(value * 100).toFixed(2)}%`;
        }
        return escapedValue;
      default:
        // 尝试自定义格式
        if (format.startsWith('date:')) {
          const dateFormat = format.substring(5);
          if (value instanceof Date) {
            // 简化实现，实际应该使用更完整的日期格式化库
            const formats: Record<string, string> = {
              'yyyy-mm-dd': value.toISOString().split('T')[0],
              'mm/dd/yyyy': `${value.getMonth() + 1}/${value.getDate()}/${value.getFullYear()}`,
              'dd/mm/yyyy': `${value.getDate()}/${value.getMonth() + 1}/${value.getFullYear()}`
            };
            return formats[dateFormat] || value.toLocaleDateString();
          }
        }
        return escapedValue;
    }
  }

  /**
   * 评估变量表达式
   */
  private evaluateVariableExpression(expression: string, variables: TemplateVariables): any {
    // 去除空格
    const expr = expression.trim();

    // 直接变量名
    if (variables.hasOwnProperty(expr)) {
      return variables[expr];
    }

    // 带格式的变量：variable|format
    const formatMatch = expr.match(/^([^|]+)\|(.+)$/);
    if (formatMatch) {
      const [, variableName, format] = formatMatch;
      const value = this.evaluateSimpleVariable(variableName.trim(), variables);
      return this.formatVariable(value, format.trim());
    }

    // 带默认值的变量：variable|default:value
    const defaultMatch = expr.match(/^([^|]+)\|default:(.+)$/);
    if (defaultMatch) {
      const [, variableName, defaultValue] = defaultMatch;
      const value = this.evaluateSimpleVariable(variableName.trim(), variables);
      return value !== undefined ? value : defaultValue.trim();
    }

    // 嵌套变量：object.property 或 array[index]
    if (this.config.nestedVariableSupport) {
      // 尝试作为嵌套属性访问
      const parts = expr.split('.');
      let currentValue: any = variables;

      for (const part of parts) {
        // 检查数组索引
        const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
        if (arrayMatch) {
          const [, arrayName, indexStr] = arrayMatch;
          const index = parseInt(indexStr, 10);

          if (!currentValue || typeof currentValue !== 'object') {
            throw new Error(`Cannot access array ${arrayName} on non-object`);
          }

          if (!Array.isArray(currentValue[arrayName])) {
            throw new Error(`${arrayName} is not an array`);
          }

          if (index < 0 || index >= currentValue[arrayName].length) {
            throw new Error(`Index ${index} out of bounds for array ${arrayName}`);
          }

          currentValue = currentValue[arrayName][index];
        } else {
          // 对象属性访问
          if (!currentValue || typeof currentValue !== 'object') {
            throw new Error(`Cannot access property ${part} on non-object`);
          }

          if (!currentValue.hasOwnProperty(part)) {
            throw new Error(`Property ${part} not found`);
          }

          currentValue = currentValue[part];
        }
      }

      if (currentValue !== undefined) {
        return currentValue;
      }
    }

    throw new Error(`Variable "${expr}" not found`);
  }

  /**
   * 评估简单变量
   */
  private evaluateSimpleVariable(variableName: string, variables: TemplateVariables): any {
    // 检查直接变量
    if (variables.hasOwnProperty(variableName)) {
      return variables[variableName];
    }

    // 检查嵌套变量（简单形式）
    if (this.config.nestedVariableSupport) {
      const parts = variableName.split('.');
      let currentValue: any = variables;

      for (const part of parts) {
        if (!currentValue || typeof currentValue !== 'object') {
          return undefined;
        }

        if (!currentValue.hasOwnProperty(part)) {
          return undefined;
        }

        currentValue = currentValue[part];
      }

      return currentValue;
    }

    return undefined;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<VariableReplacementEngineConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): VariableReplacementEngineConfig {
    return { ...this.config };
  }
}

/**
 * 变量替换引擎工厂
 */
export class VariableReplacementEngineFactory {
  private static instances: Map<string, VariableReplacementEngine> = new Map();

  /**
   * 获取默认实例
   */
  public static getDefaultInstance(): VariableReplacementEngine {
    return this.getInstance('default');
  }

  /**
   * 获取实例
   */
  public static getInstance(name: string = 'default'): VariableReplacementEngine {
    if (!this.instances.has(name)) {
      this.instances.set(name, new DefaultVariableReplacementEngine());
    }
    return this.instances.get(name)!;
  }

  /**
   * 创建自定义实例
   */
  public static createInstance(
    name: string,
    config: Partial<VariableReplacementEngineConfig>
  ): VariableReplacementEngine {
    const instance = new DefaultVariableReplacementEngine(config);
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