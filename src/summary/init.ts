#!/usr/bin/env node

/**
 * 总结生成模块初始化脚本
 */

import { configManager } from './config';
import { apiKeyManager } from './config/api-keys';
import fs from 'fs';
import path from 'path';

// 初始化选项
interface InitOptions {
  force?: boolean;
  verbose?: boolean;
  configOnly?: boolean;
}

/**
 * 初始化总结生成模块
 */
export async function initializeSummaryModule(options: InitOptions = {}): Promise<boolean> {
  try {
    console.log('🚀 开始初始化总结生成模块...\n');

    // 1. 检查环境变量
    if (!checkEnvironmentVariables(options)) {
      console.error('❌ 环境变量检查失败');
      return false;
    }

    // 2. 检查API密钥
    if (!checkAPIKeys(options)) {
      console.error('❌ API密钥检查失败');
      return false;
    }

    // 3. 验证配置
    const validation = configManager.validate();
    if (!validation.valid) {
      console.error('❌ 配置验证失败:');
      validation.errors.forEach(error => console.error(`  - ${error}`));
      return false;
    }

    // 4. 创建必要目录
    if (!createDirectories(options)) {
      console.error('❌ 目录创建失败');
      return false;
    }

    // 5. 初始化模板系统
    if (!options.configOnly) {
      if (!initializeTemplates(options)) {
        console.error('❌ 模板初始化失败');
        return false;
      }
    }

    // 6. 显示配置摘要
    showConfigSummary(options);

    console.log('\n✅ 总结生成模块初始化完成！');
    return true;

  } catch (error) {
    console.error('❌ 初始化过程中发生错误:', error);
    return false;
  }
}

/**
 * 检查环境变量
 */
function checkEnvironmentVariables(options: InitOptions): boolean {
  console.log('🔍 检查环境变量...');

  const requiredVars = [
    'ANTHROPIC_API_KEY',
    'DATABASE_PATH'
  ];

  const missingVars: string[] = [];

  requiredVars.forEach(varName => {
    if (!process.env[varName]) {
      missingVars.push(varName);
    }
  });

  if (missingVars.length > 0) {
    console.warn('⚠️  缺少以下环境变量:');
    missingVars.forEach(varName => console.warn(`  - ${varName}`));

    if (options.force) {
      console.log('⏭️  强制模式：继续初始化');
      return true;
    }

    console.log('💡 提示：请参考 .env.example 文件配置环境变量');
    return false;
  }

  console.log('✅ 环境变量检查通过');
  return true;
}

/**
 * 检查API密钥
 */
function checkAPIKeys(options: InitOptions): boolean {
  console.log('🔑 检查API密钥...');

  const keyInfo = apiKeyManager.getConfigInfo();

  if (keyInfo.keyCount === 0) {
    console.error('❌ 未配置任何API密钥');

    if (options.force) {
      console.log('⏭️  强制模式：继续初始化（将使用模板降级模式）');
      return true;
    }

    console.log('💡 提示：请配置至少一个LLM API密钥');
    return false;
  }

  console.log(`✅ 找到 ${keyInfo.keyCount} 个API密钥:`);
  keyInfo.providers.forEach(provider => {
    console.log(`  - ${provider}`);
  });

  if (keyInfo.preferred) {
    console.log(`🎯 首选提供商: ${keyInfo.preferred}`);
  }

  return true;
}

/**
 * 创建必要目录
 */
function createDirectories(options: InitOptions): boolean {
  console.log('📁 创建目录结构...');

  const directories = [
    './logs',
    './data',
    './config',
    './templates'
  ];

  try {
    directories.forEach(dir => {
      const fullPath = path.join(process.cwd(), dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        if (options.verbose) {
          console.log(`  ✓ 创建目录: ${dir}`);
        }
      }
    });

    console.log('✅ 目录结构创建完成');
    return true;

  } catch (error) {
    console.error(`❌ 创建目录失败: ${error}`);
    return false;
  }
}

/**
 * 初始化模板系统
 */
function initializeTemplates(options: InitOptions): boolean {
  console.log('📝 初始化模板系统...');

  try {
    // 创建模板目录
    const templateDir = path.join(process.cwd(), 'templates', 'summary');
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }

    // 创建默认模板
    const defaultTemplates = [
      {
        name: 'daily-summary-zh.md',
        content: `# 每日新闻总结 - {{date}}

## 📊 今日热点概览

### 国内热点
{{#if domesticHotspots}}
{{domesticHotspots}}
{{else}}
今日国内热点相对平静，没有特别突出的新闻事件。
{{/if}}

### 国际热点
{{#if internationalHotspots}}
{{internationalHotspots}}
{{else}}
国际局势相对稳定，没有重大突发事件。
{{/if}}

### 投资相关热点
{{#if investmentHotspots}}
{{investmentHotspots}}
{{else}}
今日投资市场相对平稳，没有特别值得关注的投资机会。
{{/if}}

## 🔍 关键洞察
{{insights}}

## 📈 趋势分析
{{trends}}

## 🎯 明日关注
{{tomorrowFocus}}

---
*总结生成时间: {{generatedAt}}*
*数据来源: Twitter, YouTube, TikTok, Weibo, Douyin*
`
      },
      {
        name: 'investment-summary-zh.md',
        content: `# 投资焦点总结 - {{date}}

## 💰 今日投资热点

### 股票市场
{{#if stockMarket}}
{{stockMarket}}
{{else}}
今日股票市场表现平稳，没有特别突出的投资机会。
{{/if}}

### 加密货币
{{#if cryptocurrency}}
{{cryptocurrency}}
{{else}}
加密货币市场相对稳定，没有重大价格波动。
{{/if}}

### 大宗商品
{{#if commodities}}
{{commodities}}
{{else}}
大宗商品价格波动较小，投资机会有限。
{{/if}}

## 📊 投资机会分析
{{opportunities}}

## ⚠️ 风险提示
{{risks}}

## 🎯 投资建议
{{recommendations}}

---
*总结生成时间: {{generatedAt}}*
*数据来源: 社交媒体投资相关内容*
`
      }
    ];

    defaultTemplates.forEach(template => {
      const templatePath = path.join(templateDir, template.name);
      if (!fs.existsSync(templatePath) || options.force) {
        fs.writeFileSync(templatePath, template.content);
        if (options.verbose) {
          console.log(`  ✓ 创建模板: ${template.name}`);
        }
      }
    });

    console.log('✅ 模板系统初始化完成');
    return true;

  } catch (error) {
    console.error(`❌ 模板初始化失败: ${error}`);
    return false;
  }
}

/**
 * 显示配置摘要
 */
function showConfigSummary(options: InitOptions): void {
  console.log('\n📋 配置摘要:');

  const configSummary = configManager.getConfigSummary();

  console.log(`\n🤖 LLM配置:`);
  console.log(`  提供商: ${configSummary.llm.provider}`);
  console.log(`  模型: ${configSummary.llm.model}`);

  console.log(`\n⏰ 触发方式:`);
  configSummary.triggers.forEach(trigger => {
    console.log(`  - ${trigger}`);
  });

  console.log(`\n📏 质量控制:`);
  console.log(`  最小长度: ${configSummary.qualityControl.minLength} 字符`);
  console.log(`  最大长度: ${configSummary.qualityControl.maxLength} 字符`);

  console.log(`\n💾 存储配置:`);
  console.log(`  类型: ${configSummary.storage.type}`);
  console.log(`  保留天数: ${configSummary.storage.retentionDays} 天`);

  console.log(`\n⚡ 缓存: ${configSummary.cache.enabled ? '启用' : '禁用'}`);
  console.log(`📊 监控: ${configSummary.monitoring.enabled ? '启用' : '禁用'}`);
}

/**
 * 命令行接口
 */
if (require.main === module) {
  const args = process.argv.slice(2);
  const options: InitOptions = {
    force: args.includes('--force') || args.includes('-f'),
    verbose: args.includes('--verbose') || args.includes('-v'),
    configOnly: args.includes('--config-only') || args.includes('-c')
  };

  initializeSummaryModule(options)
    .then(success => {
      process.exit(success ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ 初始化失败:', error);
      process.exit(1);
    });
}

// 导出初始化函数
export default initializeSummaryModule;