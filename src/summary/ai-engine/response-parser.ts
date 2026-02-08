/**
 * 总结响应解析和内容提取
 */

import {
  SummaryData,
  SummaryMetadata,
  SummaryType,
  SummaryLanguage,
  SummaryQuality,
  GenerateResponse,
  AIEngineError
} from './interface';

/**
 * 解析选项
 */
export interface ParseOptions {
  validateStructure?: boolean;
  extractMetadata?: boolean;
  calculateQuality?: boolean;
  language?: SummaryLanguage;
  expectedSections?: string[];
}

/**
 * 解析结果
 */
export interface ParseResult {
  summary: SummaryData;
  metadata: SummaryMetadata;
  warnings: string[];
  isValid: boolean;
}

/**
 * 响应解析器
 */
export class ResponseParser {
  private defaultOptions: ParseOptions = {
    validateStructure: true,
    extractMetadata: true,
    calculateQuality: true,
    language: SummaryLanguage.ZH,
    expectedSections: ['国内热点', '国际热点', '投资相关热点']
  };

  /**
   * 解析AI响应
   */
  parseAIResponse(
    response: string,
    request: any,
    options?: ParseOptions
  ): ParseResult {
    const opts = { ...this.defaultOptions, ...options };
    const warnings: string[] = [];

    try {
      // 基本验证
      if (!response || response.trim().length === 0) {
        throw new Error('Empty response from AI');
      }

      // 提取内容
      const content = this.extractContent(response, opts);
      const title = this.extractTitle(content, request);

      // 验证结构
      if (opts.validateStructure) {
        const structureWarnings = this.validateStructure(content, opts);
        warnings.push(...structureWarnings);
      }

      // 提取元数据
      const metadata = opts.extractMetadata
        ? this.extractMetadata(content, response, request)
        : this.createDefaultMetadata();

      // 计算质量
      const quality = opts.calculateQuality
        ? this.calculateQuality(content, metadata, warnings)
        : SummaryQuality.HIGH;

      // 创建总结数据
      const summary: SummaryData = {
        type: request.type || SummaryType.DAILY,
        language: opts.language || SummaryLanguage.ZH,
        title,
        content,
        date: new Date(),
        quality,
        metadata
      };

      // 最终验证
      const isValid = this.finalValidation(summary, warnings);

      return {
        summary,
        metadata,
        warnings,
        isValid
      };

    } catch (error: any) {
      throw AIEngineError.parsingError(
        `Failed to parse AI response: ${error.message}`,
        error
      );
    }
  }

  /**
   * 提取内容
   */
  private extractContent(response: string, options: ParseOptions): string {
    // 清理响应
    let content = response.trim();

    // 移除可能的前缀（如"总结："）
    content = content.replace(/^(总结|总结：|Summary|Summary:)\s*/i, '');

    // 移除多余的空白
    content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

    return content;
  }

  /**
   * 提取标题
   */
  private extractTitle(content: string, request: any): string {
    // 尝试从内容中提取标题
    const firstLine = content.split('\n')[0].trim();

    // 检查是否是标题格式（通常较短且可能包含日期）
    if (firstLine.length <= 100 && !firstLine.startsWith('#')) {
      return firstLine;
    }

    // 使用默认标题
    const date = new Date().toLocaleDateString('zh-CN');
    const type = request.type || SummaryType.DAILY;

    switch (type) {
      case SummaryType.DAILY:
        return `每日新闻总结 - ${date}`;
      case SummaryType.INVESTMENT:
        return `投资焦点总结 - ${date}`;
      case SummaryType.BRIEF:
        return `简要新闻总结 - ${date}`;
      default:
        return `新闻总结 - ${date}`;
    }
  }

  /**
   * 验证结构
   */
  private validateStructure(content: string, options: ParseOptions): string[] {
    const warnings: string[] = [];

    // 检查长度
    const length = content.length;
    if (length < 300) {
      warnings.push(`总结过短: ${length} 字符（建议至少500字符）`);
    } else if (length > 5000) {
      warnings.push(`总结过长: ${length} 字符（建议不超过3000字符）`);
    }

    // 检查段落
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    if (paragraphs.length < 3) {
      warnings.push(`段落过少: ${paragraphs.length} 段（建议至少3段）`);
    }

    // 检查预期部分
    if (options.expectedSections && options.expectedSections.length > 0) {
      const missingSections = options.expectedSections.filter(section =>
        !content.includes(section)
      );

      if (missingSections.length > 0) {
        warnings.push(`缺少预期部分: ${missingSections.join(', ')}`);
      }
    }

    // 检查格式问题
    const formatIssues = this.checkFormatIssues(content);
    warnings.push(...formatIssues);

    return warnings;
  }

  /**
   * 检查格式问题
   */
  private checkFormatIssues(content: string): string[] {
    const issues: string[] = [];

    // 检查过长段落
    const lines = content.split('\n');
    lines.forEach((line, index) => {
      if (line.length > 500) {
        issues.push(`第${index + 1}行过长: ${line.length} 字符`);
      }
    });

    // 检查重复内容
    const sentences = content.split(/[。.!?]/).filter(s => s.trim().length > 10);
    const sentenceSet = new Set();
    sentences.forEach(sentence => {
      const normalized = sentence.trim().toLowerCase();
      if (sentenceSet.has(normalized)) {
        issues.push('检测到重复句子');
      }
      sentenceSet.add(normalized);
    });

    // 检查特殊字符
    const specialChars = content.match(/[※★☆◆■▲▼●○◎◇□△▽]/g);
    if (specialChars && specialChars.length > 10) {
      issues.push('特殊字符使用过多');
    }

    return issues;
  }

  /**
   * 提取元数据
   */
  private extractMetadata(content: string, response: string, request: any): SummaryMetadata {
    // 基本元数据
    const metadata: SummaryMetadata = {
      sourceCount: request.data?.totalNewsCount || 0,
      topics: this.extractTopics(content),
      keywords: this.extractKeywords(content),
      length: content.length,
      tokenUsage: this.estimateTokens(response),
      model: request.model || 'unknown',
      generationTime: request.generationTime || 0
    };

    // 情感分析
    const sentiment = this.analyzeSentiment(content);
    if (sentiment) {
      metadata.sentiment = sentiment;
    }

    // 成本估算（如果有）
    if (request.estimatedCost) {
      metadata.cost = request.estimatedCost;
    }

    return metadata;
  }

  /**
   * 创建默认元数据
   */
  private createDefaultMetadata(): SummaryMetadata {
    return {
      sourceCount: 0,
      topics: [],
      keywords: [],
      length: 0,
      tokenUsage: 0,
      model: 'unknown',
      generationTime: 0
    };
  }

  /**
   * 提取主题
   */
  private extractTopics(content: string): string[] {
    const topics: string[] = [];

    // 从标题和开头提取
    const lines = content.split('\n').slice(0, 5);
    lines.forEach(line => {
      // 匹配可能的主題关键词
      const topicPatterns = [
        /(国内|中国|本土).*热点/,
        /(国际|全球|海外).*热点/,
        /(投资|金融|经济|股市|币圈).*热点/,
        /(科技|互联网|AI|人工智能).*动态/,
        /(政治|外交|军事).*新闻/,
        /(娱乐|体育|文化).*资讯/
      ];

      topicPatterns.forEach(pattern => {
        const match = line.match(pattern);
        if (match) {
          topics.push(match[0]);
        }
      });
    });

    // 去重
    return [...new Set(topics)];
  }

  /**
   * 提取关键词
   */
  private extractKeywords(content: string): string[] {
    // 简单关键词提取：高频名词和动词
    const words = content
      .replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, ' ') // 保留中文、英文、数字
      .split(/\s+/)
      .filter(word => word.length >= 2);

    // 词频统计
    const frequency: Record<string, number> = {};
    words.forEach(word => {
      frequency[word] = (frequency[word] || 0) + 1;
    });

    // 获取高频词
    const sortedWords = Object.entries(frequency)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    return sortedWords;
  }

  /**
   * 估算token数量
   */
  private estimateTokens(text: string): number {
    // 简单估算：每个中文字符约1.5个token，每个英文字符约0.25个token
    const chineseChars = text.match(/[\u4e00-\u9fa5]/g)?.length || 0;
    const englishChars = text.match(/[a-zA-Z]/g)?.length || 0;
    const otherChars = text.length - chineseChars - englishChars;

    return Math.ceil(chineseChars * 1.5 + englishChars * 0.25 + otherChars * 0.5);
  }

  /**
   * 分析情感
   */
  private analyzeSentiment(content: string): 'positive' | 'negative' | 'neutral' | undefined {
    const positiveWords = ['增长', '上涨', '利好', '成功', '突破', '创新', '发展', '进步'];
    const negativeWords = ['下跌', '下滑', '利空', '失败', '问题', '风险', '挑战', '困难'];

    let positiveCount = 0;
    let negativeCount = 0;

    positiveWords.forEach(word => {
      const regex = new RegExp(word, 'g');
      const matches = content.match(regex);
      if (matches) positiveCount += matches.length;
    });

    negativeWords.forEach(word => {
      const regex = new RegExp(word, 'g');
      const matches = content.match(regex);
      if (matches) negativeCount += matches.length;
    });

    if (positiveCount > negativeCount * 2) {
      return 'positive';
    } else if (negativeCount > positiveCount * 2) {
      return 'negative';
    } else if (positiveCount > 0 || negativeCount > 0) {
      return 'neutral';
    }

    return undefined;
  }

  /**
   * 计算质量
   */
  private calculateQuality(content: string, metadata: SummaryMetadata, warnings: string[]): SummaryQuality {
    let score = 100;

    // 长度扣分
    if (content.length < 500) {
      score -= 30;
    } else if (content.length < 300) {
      score -= 50;
    }

    // 段落扣分
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
    if (paragraphs.length < 3) {
      score -= 20;
    }

    // 警告扣分
    score -= warnings.length * 5;

    // 主题覆盖扣分
    if (metadata.topics.length === 0) {
      score -= 15;
    }

    // 确定质量等级
    if (score >= 80) {
      return SummaryQuality.HIGH;
    } else if (score >= 60) {
      return SummaryQuality.MEDIUM;
    } else if (score >= 40) {
      return SummaryQuality.LOW;
    } else {
      return SummaryQuality.FAILED;
    }
  }

  /**
   * 最终验证
   */
  private finalValidation(summary: SummaryData, warnings: string[]): boolean {
    // 基本验证
    if (!summary.title || summary.title.trim().length === 0) {
      warnings.push('标题为空');
      return false;
    }

    if (!summary.content || summary.content.trim().length === 0) {
      warnings.push('内容为空');
      return false;
    }

    if (summary.content.length < 100) {
      warnings.push('内容过短');
      return false;
    }

    // 质量验证
    if (summary.quality === SummaryQuality.FAILED) {
      warnings.push('质量评分过低');
      return false;
    }

    return true;
  }

  /**
   * 格式化生成响应
   */
  formatGenerateResponse(
    parseResult: ParseResult,
    request: any,
    additionalMetadata?: any
  ): GenerateResponse {
    const response: GenerateResponse = {
      success: parseResult.isValid,
      summary: parseResult.isValid ? parseResult.summary : undefined,
      error: parseResult.isValid ? undefined : '总结解析失败',
      warnings: parseResult.warnings,
      metadata: {
        tokenUsage: parseResult.metadata.tokenUsage || 0,
        cost: parseResult.metadata.cost || 0,
        generationTime: parseResult.metadata.generationTime || 0,
        model: parseResult.metadata.model || 'unknown',
        qualityScore: this.calculateQualityScore(parseResult.summary?.quality)
      }
    };

    // 合并额外元数据
    if (additionalMetadata) {
      Object.assign(response.metadata, additionalMetadata);
    }

    return response;
  }

  /**
   * 计算质量分数
   */
  private calculateQualityScore(quality?: SummaryQuality): number {
    switch (quality) {
      case SummaryQuality.HIGH:
        return 0.9;
      case SummaryQuality.MEDIUM:
        return 0.7;
      case SummaryQuality.LOW:
        return 0.5;
      case SummaryQuality.FAILED:
        return 0.3;
      default:
        return 0.5;
    }
  }

  /**
   * 更新选项
   */
  updateOptions(options: Partial<ParseOptions>): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
  }

  /**
   * 获取当前选项
   */
  getOptions(): ParseOptions {
    return { ...this.defaultOptions };
  }
}

/**
 * 响应解析器工厂
 */
export class ResponseParserFactory {
  private static instance: ResponseParser;

  /**
   * 获取单例实例
   */
  public static getInstance(): ResponseParser {
    if (!ResponseParserFactory.instance) {
      ResponseParserFactory.instance = new ResponseParser();
    }
    return ResponseParserFactory.instance;
  }

  /**
   * 创建自定义解析器
   */
  public static createParser(options?: ParseOptions): ResponseParser {
    const parser = new ResponseParser();
    if (options) {
      parser.updateOptions(options);
    }
    return parser;
  }
}

// 导出默认解析器
export const responseParser = ResponseParserFactory.getInstance();

// 辅助函数：解析AI响应
export function parseAIResponse(
  response: string,
  request: any,
  options?: ParseOptions
): ParseResult {
  return responseParser.parseAIResponse(response, request, options);
}

// 辅助函数：格式化生成响应
export function formatGenerateResponse(
  parseResult: ParseResult,
  request: any,
  additionalMetadata?: any
): GenerateResponse {
  return responseParser.formatGenerateResponse(parseResult, request, additionalMetadata);
}