/**
 * 总结模板系统单元测试
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  createDailySummaryTemplateZh,
  createInvestmentSummaryTemplateZh,
  createBriefSummaryTemplateZh,
  createDailySummaryTemplateEn,
  createInvestmentSummaryTemplateEn,
  createBriefSummaryTemplateEn,
  TemplateRegistry
} from '../../../src/summary/templates/template-definitions';
import { DefaultVariableReplacementEngine, VariableReplacementEngineFactory } from '../../../src/summary/templates/engines/variable-replacement-engine';
import { DefaultTemplateValidationEngine, TemplateValidationEngineFactory } from '../../../src/summary/templates/engines/template-validation-engine';
import { MemoryTemplateCacheEngine, TemplateCacheEngineFactory } from '../../../src/summary/templates/engines/template-cache-engine';
import { DefaultTemplateEngine, TemplateEngineFactory } from '../../../src/summary/templates/engines/template-engine';
import { SummaryType, SummaryLanguage, SummaryQuality } from '../../../src/summary/types';

describe('总结模板系统', () => {
  describe('模板定义', () => {
    describe('每日总结模板（中文）', () => {
      it('应该正确创建每日总结模板', () => {
        const template = createDailySummaryTemplateZh();

        expect(template.metadata.id).toBe('daily-summary-zh');
        expect(template.metadata.name).toBe('每日新闻总结模板（中文）');
        expect(template.metadata.version).toBe('1.0.0');
        expect(template.metadata.tags).toContain('daily');
        expect(template.metadata.tags).toContain('zh');
      });

      it('应该包含正确的配置', () => {
        const template = createDailySummaryTemplateZh();

        expect(template.config.type).toBe(SummaryType.DAILY);
        expect(template.config.language).toBe(SummaryLanguage.ZH);
        expect(template.config.sections.length).toBeGreaterThan(0);
        expect(template.config.variables.length).toBeGreaterThan(0);
        expect(template.content).toContain('{{title}}');
        expect(template.content).toContain('{{date');
      });

      it('应该包含必需的部分', () => {
        const template = createDailySummaryTemplateZh();
        const sectionIds = template.config.sections.map(s => s.id);

        expect(sectionIds).toContain('header');
        expect(sectionIds).toContain('overview');
        expect(sectionIds).toContain('domestic');
        expect(sectionIds).toContain('international');
      });
    });

    describe('投资总结模板（中文）', () => {
      it('应该正确创建投资总结模板', () => {
        const template = createInvestmentSummaryTemplateZh();

        expect(template.metadata.id).toBe('investment-summary-zh');
        expect(template.metadata.name).toBe('投资焦点总结模板（中文）');
        expect(template.config.type).toBe(SummaryType.INVESTMENT);
      });

      it('应该包含投资相关部分', () => {
        const template = createInvestmentSummaryTemplateZh();
        const sectionIds = template.config.sections.map(s => s.id);

        expect(sectionIds).toContain('marketOverview');
        expect(sectionIds).toContain('stockMarket');
        expect(sectionIds).toContain('investmentOpportunities');
      });
    });

    describe('简要总结模板（中文）', () => {
      it('应该正确创建简要总结模板', () => {
        const template = createBriefSummaryTemplateZh();

        expect(template.metadata.id).toBe('brief-summary-zh');
        expect(template.metadata.name).toBe('简要新闻总结模板（中文）');
        expect(template.config.type).toBe(SummaryType.BRIEF);
      });

      it('应该包含简要总结特有部分', () => {
        const template = createBriefSummaryTemplateZh();
        const sectionIds = template.config.sections.map(s => s.id);

        expect(sectionIds).toContain('quickFacts');
        expect(sectionIds).toContain('topStories');
        expect(sectionIds).toContain('keyTakeaways');
      });
    });

    describe('英文模板', () => {
      it('应该正确创建英文每日总结模板', () => {
        const template = createDailySummaryTemplateEn();

        expect(template.metadata.id).toBe('daily-summary-en');
        expect(template.metadata.name).toBe('Daily News Summary Template (English)');
        expect(template.config.language).toBe(SummaryLanguage.EN);
        expect(template.content).toContain('Daily News Summary');
      });

      it('应该正确创建英文投资总结模板', () => {
        const template = createInvestmentSummaryTemplateEn();

        expect(template.metadata.id).toBe('investment-summary-en');
        expect(template.metadata.name).toBe('Investment Focus Summary Template (English)');
        expect(template.config.language).toBe(SummaryLanguage.EN);
      });

      it('应该正确创建英文简要总结模板', () => {
        const template = createBriefSummaryTemplateEn();

        expect(template.metadata.id).toBe('brief-summary-en');
        expect(template.metadata.name).toBe('Brief News Summary Template (English)');
        expect(template.config.language).toBe(SummaryLanguage.EN);
      });
    });

    describe('模板注册表', () => {
      beforeEach(() => {
        // 确保注册表是干净的
        TemplateRegistry['templates'].clear();
        // 重新注册模板
        TemplateRegistry.register('test-template-zh', createDailySummaryTemplateZh);
        TemplateRegistry.register('test-template-en', createDailySummaryTemplateEn);
      });

      afterEach(() => {
        TemplateRegistry['templates'].clear();
      });

      it('应该注册和获取模板', () => {
        const template = TemplateRegistry.get('test-template-zh');
        expect(template).not.toBeNull();
        expect(template!.metadata.id).toBe('daily-summary-zh');
      });

      it('应该返回null当模板不存在时', () => {
        const template = TemplateRegistry.get('non-existent-template');
        expect(template).toBeNull();
      });

      it('应该检查模板是否存在', () => {
        expect(TemplateRegistry.has('test-template-zh')).toBe(true);
        expect(TemplateRegistry.has('non-existent-template')).toBe(false);
      });

      it('应该获取所有模板ID', () => {
        const ids = TemplateRegistry.getAllIds();
        expect(ids).toContain('test-template-zh');
        expect(ids).toContain('test-template-en');
      });

      it('应该移除模板', () => {
        expect(TemplateRegistry.has('test-template-zh')).toBe(true);
        TemplateRegistry.remove('test-template-zh');
        expect(TemplateRegistry.has('test-template-zh')).toBe(false);
      });
    });
  });

  describe('变量替换引擎', () => {
    let engine: DefaultVariableReplacementEngine;

    beforeEach(() => {
      engine = new DefaultVariableReplacementEngine();
    });

    it('应该替换简单变量', () => {
      const template = 'Hello {{name}}!';
      const variables = { name: 'World' };
      const result = engine.replaceVariables(template, variables);
      expect(result).toBe('Hello World!');
    });

    it('应该替换多个变量', () => {
      const template = '{{greeting}}, {{name}}! Today is {{day}}.';
      const variables = { greeting: 'Hello', name: 'World', day: 'Monday' };
      const result = engine.replaceVariables(template, variables);
      expect(result).toBe('Hello, World! Today is Monday.');
    });

    it('应该处理带格式的变量', () => {
      const template = 'Value: {{value|uppercase}}';
      const variables = { value: 'test' };
      const result = engine.replaceVariables(template, variables);
      expect(result).toBe('Value: TEST');
    });

    it('应该处理带默认值的变量', () => {
      const template = 'Hello {{name|default:Guest}}!';
      const variables = {};
      const result = engine.replaceVariables(template, variables);
      expect(result).toBe('Hello Guest!');
    });

    it('应该提取模板中的变量', () => {
      const template = '{{greeting}}, {{name}}! Today is {{day|date}}.';
      const variables = engine.extractVariables(template);
      expect(variables).toContain('greeting');
      expect(variables).toContain('name');
      expect(variables).toContain('day|date');
    });

    it('应该验证变量', () => {
      const template = 'Hello {{name}}! Today is {{day}}.';
      const variables = { name: 'World' };
      const results = engine.validateVariables(template, variables);

      // 应该有一个错误，因为缺少day变量
      const errors = results.filter(r => !r.passed && r.rule.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].message).toContain('Missing variable');
    });

    it('应该转义变量值', () => {
      const value = '<script>alert("test")</script>';
      const escaped = engine.escapeVariable(value, { inTemplate: true });
      expect(escaped).not.toContain('<script>');
      expect(escaped).toContain('&lt;');
    });
  });

  describe('模板验证引擎', () => {
    let engine: DefaultTemplateValidationEngine;

    beforeEach(() => {
      engine = new DefaultTemplateValidationEngine();
    });

    it('应该验证模板结构', () => {
      const template = createDailySummaryTemplateZh();
      const results = engine.validateStructure(template);

      // 有效的模板应该通过所有验证
      const errors = results.filter(r => !r.passed && r.rule.severity === 'error');
      expect(errors.length).toBe(0);
    });

    it('应该检测无效模板结构', () => {
      const template = createDailySummaryTemplateZh();
      // 破坏模板结构
      (template as any).config = null;

      const results = engine.validateStructure(template);
      const errors = results.filter(r => !r.passed && r.rule.severity === 'error');
      expect(errors.length).toBeGreaterThan(0);
    });

    it('应该验证模板内容', () => {
      const template = createDailySummaryTemplateZh();
      const results = engine.validateContent(template);

      // 有效的模板应该通过内容验证
      const errors = results.filter(r => !r.passed);
      expect(errors.length).toBe(0);
    });

    it('应该验证模板变量', () => {
      const template = createDailySummaryTemplateZh();
      const results = engine.validateVariables(template);

      // 模板定义中的变量应该有效
      const errors = results.filter(r => !r.passed);
      expect(errors.length).toBe(0);
    });

    it('应该检查模板完整性', () => {
      const template = createDailySummaryTemplateZh();
      const results = engine.checkCompleteness(template);

      // 完整模板应该通过完整性检查
      const errors = results.filter(r => !r.passed && r.rule.severity === 'error');
      expect(errors.length).toBe(0);
    });

    it('应该计算质量分数', () => {
      const template = createDailySummaryTemplateZh();
      const score = engine.calculateQualityScore(template);

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      expect(score).toBeGreaterThan(80); // 良好模板应该得高分
    });
  });

  describe('模板缓存引擎', () => {
    let cache: MemoryTemplateCacheEngine;

    beforeEach(() => {
      cache = new MemoryTemplateCacheEngine({
        maxSize: 10,
        defaultTTL: 1000,
        cleanupInterval: 0 // 禁用自动清理
      });
    });

    afterEach(async () => {
      await cache.clear();
    });

    it('应该存储和检索模板', async () => {
      const template = createDailySummaryTemplateZh();
      await cache.set('test-template', template);

      const retrieved = await cache.get('test-template');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.metadata.id).toBe(template.metadata.id);
    });

    it('应该检查缓存是否存在', async () => {
      const template = createDailySummaryTemplateZh();
      await cache.set('test-template', template);

      expect(await cache.has('test-template')).toBe(true);
      expect(await cache.has('non-existent')).toBe(false);
    });

    it('应该删除缓存', async () => {
      const template = createDailySummaryTemplateZh();
      await cache.set('test-template', template);

      expect(await cache.has('test-template')).toBe(true);
      await cache.delete('test-template');
      expect(await cache.has('test-template')).toBe(false);
    });

    it('应该清空缓存', async () => {
      const template1 = createDailySummaryTemplateZh();
      const template2 = createInvestmentSummaryTemplateZh();

      await cache.set('template1', template1);
      await cache.set('template2', template2);

      expect(await cache.has('template1')).toBe(true);
      expect(await cache.has('template2')).toBe(true);

      await cache.clear();

      expect(await cache.has('template1')).toBe(false);
      expect(await cache.has('template2')).toBe(false);
    });

    it('应该过期缓存项', async () => {
      cache = new MemoryTemplateCacheEngine({
        maxSize: 10,
        defaultTTL: 10, // 非常短的TTL
        cleanupInterval: 0
      });

      const template = createDailySummaryTemplateZh();
      await cache.set('test-template', template, { ttl: 10 });

      // 等待过期
      await new Promise(resolve => setTimeout(resolve, 50));

      const retrieved = await cache.get('test-template');
      expect(retrieved).toBeNull();
    });
  });

  describe('模板引擎', () => {
    let engine: DefaultTemplateEngine;

    beforeEach(() => {
      engine = new DefaultTemplateEngine({
        cacheEnabled: false,
        validationEnabled: true,
        strictMode: false
      });
    });

    it('应该注册和生成模板', async () => {
      const template = createDailySummaryTemplateZh();
      await engine.registerTemplate(template);

      const variables = {
        title: '测试总结',
        date: new Date('2024-01-01'),
        totalNewsCount: 100,
        platformCounts: { twitter: 50, youtube: 30, weibo: 20 },
        overviewSummary: '测试概览内容',
        domesticNews: [],
        internationalNews: [],
        generatedAt: new Date(),
        dataSources: '测试数据源'
      };

      const result = await engine.generate(template.metadata.id, variables);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.output).toContain('测试总结');
      expect(result.output).toContain('2024-01-01');
    });

    it('应该验证模板', async () => {
      const template = createDailySummaryTemplateZh();
      const results = engine.validateTemplate(template);

      // 有效模板应该通过验证
      const errors = results.filter(r => !r.passed && r.rule.severity === 'error');
      expect(errors.length).toBe(0);
    });

    it('应该编译模板', () => {
      const template = createDailySummaryTemplateZh();
      const variables = {
        title: '测试标题',
        date: new Date('2024-01-01')
      };

      // 简化测试：只编译标题部分
      const simpleTemplate = { ...template, content: '# {{title}} - {{date|date:yyyy-mm-dd}}' };
      const result = engine.compileTemplate(simpleTemplate, variables);

      expect(result).toContain('测试标题');
      expect(result).toContain('2024-01-01');
    });

    it('应该获取模板列表', async () => {
      const template1 = createDailySummaryTemplateZh();
      const template2 = createInvestmentSummaryTemplateZh();

      await engine.registerTemplate(template1);
      await engine.registerTemplate(template2);

      const templates = await engine.listTemplates();
      expect(templates.length).toBe(2);

      const dailyTemplates = await engine.listTemplates({ type: SummaryType.DAILY });
      expect(dailyTemplates.length).toBe(1);
      expect(dailyTemplates[0].metadata.id).toBe('daily-summary-zh');
    });

    it('应该获取模板信息', async () => {
      const template = createDailySummaryTemplateZh();
      await engine.registerTemplate(template);

      const info = await engine.getTemplateInfo(template.metadata.id);
      expect(info.id).toBe('daily-summary-zh');
      expect(info.name).toBe('每日新闻总结模板（中文）');
    });
  });

  describe('工厂类', () => {
    it('应该提供变量替换引擎单例', () => {
      const engine1 = VariableReplacementEngineFactory.getDefaultInstance();
      const engine2 = VariableReplacementEngineFactory.getInstance();
      const engine3 = VariableReplacementEngineFactory.getInstance('default');

      expect(engine1).toBe(engine2);
      expect(engine2).toBe(engine3);
    });

    it('应该提供模板验证引擎单例', () => {
      const engine1 = TemplateValidationEngineFactory.getDefaultInstance();
      const engine2 = TemplateValidationEngineFactory.getInstance();

      expect(engine1).toBe(engine2);
    });

    it('应该提供模板缓存引擎单例', () => {
      const engine1 = TemplateCacheEngineFactory.getDefaultInstance();
      const engine2 = TemplateCacheEngineFactory.getInstance();

      expect(engine1).toBe(engine2);
    });

    it('应该提供模板引擎单例', () => {
      const engine1 = TemplateEngineFactory.getDefaultInstance();
      const engine2 = TemplateEngineFactory.getInstance();

      expect(engine1).toBe(engine2);
    });
  });
});