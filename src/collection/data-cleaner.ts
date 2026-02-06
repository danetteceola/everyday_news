/**
 * 数据清洗器
 * 负责清洗和标准化采集的数据，包括去重、验证、标准化等
 */

import { NewsItem, PlatformType } from './types/news-item';
import { CollectionLogger, createCollectorLogger } from './utils/logger';

export interface DataCleanerConfig {
  /** 是否启用URL去重 */
  enableUrlDeduplication: boolean;
  /** 是否启用内容相似度去重 */
  enableContentDeduplication: boolean;
  /** 相似度阈值 (0-1) */
  similarityThreshold: number;
  /** 是否启用跨平台重复检测 */
  enableCrossPlatformDeduplication: boolean;
  /** 是否验证必填字段 */
  validateRequiredFields: boolean;
  /** 是否标准化日期格式 */
  normalizeDateFormats: boolean;
  /** 是否提取关键词 */
  extractKeywords: boolean;
  /** 是否执行情感分析 */
  performSentimentAnalysis: boolean;
  /** 是否填充默认值 */
  fillMissingValues: boolean;
}

export interface DeduplicationResult {
  /** 是否重复 */
  isDuplicate: boolean;
  /** 重复类型 */
  duplicateType?: 'url' | 'content' | 'cross-platform';
  /** 匹配的新闻项ID */
  matchedItemId?: string;
  /** 相似度分数 */
  similarityScore?: number;
}

export interface ValidationResult {
  /** 是否有效 */
  isValid: boolean;
  /** 验证错误 */
  errors: string[];
  /** 警告信息 */
  warnings: string[];
}

export interface CleaningResult {
  /** 清洗后的新闻项 */
  cleanedItem: NewsItem;
  /** 是否被去重 */
  wasDeduplicated: boolean;
  /** 验证结果 */
  validationResult: ValidationResult;
  /** 清洗操作记录 */
  operations: string[];
}

export class DataCleaner {
  private config: DataCleanerConfig;
  private logger: CollectionLogger;

  /** URL哈希记录（用于URL去重） */
  private urlHashes: Set<string> = new Set();

  /** 内容指纹记录（用于内容去重） */
  private contentFingerprints: Map<string, string> = new Map(); // fingerprint -> itemId

  constructor(config: Partial<DataCleanerConfig> = {}) {
    this.config = {
      enableUrlDeduplication: true,
      enableContentDeduplication: true,
      similarityThreshold: 0.8,
      enableCrossPlatformDeduplication: true,
      validateRequiredFields: true,
      normalizeDateFormats: true,
      extractKeywords: false,
      performSentimentAnalysis: false,
      fillMissingValues: true,
      ...config
    };

    this.logger = createCollectorLogger('data-cleaner');
  }

  /**
   * 清洗新闻项
   */
  async clean(newsItem: NewsItem, existingItems: NewsItem[] = []): Promise<CleaningResult> {
    const operations: string[] = [];
    let cleanedItem = { ...newsItem };
    let wasDeduplicated = false;

    this.logger.info(`开始清洗新闻项: ${newsItem.id}`);

    // 1. 去重检测
    const deduplicationResult = await this.checkDuplicates(cleanedItem, existingItems);
    if (deduplicationResult.isDuplicate) {
      this.logger.info(`新闻项重复: ${newsItem.id}`, {
        duplicateType: deduplicationResult.duplicateType,
        matchedItemId: deduplicationResult.matchedItemId
      });
      wasDeduplicated = true;
      operations.push(`detected-duplicate-${deduplicationResult.duplicateType}`);
    }

    // 2. 数据验证
    const validationResult = this.validate(cleanedItem);
    if (!validationResult.isValid) {
      this.logger.warn(`新闻项验证失败: ${newsItem.id}`, { errors: validationResult.errors });
    }
    operations.push(`validation-${validationResult.isValid ? 'passed' : 'failed'}`);

    // 3. 标准化处理
    if (this.config.normalizeDateFormats) {
      cleanedItem = this.normalizeDates(cleanedItem);
      operations.push('dates-normalized');
    }

    // 4. 编码处理
    cleanedItem = this.fixEncoding(cleanedItem);
    operations.push('encoding-fixed');

    // 5. 填充缺失值
    if (this.config.fillMissingValues) {
      cleanedItem = this.fillMissingValues(cleanedItem);
      operations.push('missing-values-filled');
    }

    // 6. 提取关键词
    if (this.config.extractKeywords) {
      cleanedItem = await this.extractKeywords(cleanedItem);
      operations.push('keywords-extracted');
    }

    // 7. 情感分析
    if (this.config.performSentimentAnalysis) {
      cleanedItem = await this.analyzeSentiment(cleanedItem);
      operations.push('sentiment-analyzed');
    }

    // 8. 计算质量评分
    cleanedItem = this.calculateQualityScore(cleanedItem, validationResult);
    operations.push('quality-score-calculated');

    this.logger.info(`新闻项清洗完成: ${newsItem.id}`, { operations });

    return {
      cleanedItem,
      wasDeduplicated,
      validationResult,
      operations
    };
  }

  /**
   * 检查重复项
   */
  private async checkDuplicates(newsItem: NewsItem, existingItems: NewsItem[]): Promise<DeduplicationResult> {
    // URL去重
    if (this.config.enableUrlDeduplication) {
      const urlDeduplicationResult = await this.checkUrlDuplicates(newsItem, existingItems);
      if (urlDeduplicationResult.isDuplicate) {
        return urlDeduplicationResult;
      }
    }

    // 内容相似度去重
    if (this.config.enableContentDeduplication && existingItems.length > 0) {
      for (const existingItem of existingItems) {
        const similarity = await this.calculateContentSimilarity(newsItem, existingItem);
        if (similarity >= this.config.similarityThreshold) {
          return {
            isDuplicate: true,
            duplicateType: 'content',
            matchedItemId: existingItem.id,
            similarityScore: similarity
          };
        }
      }
    }

    // 跨平台重复检测
    if (this.config.enableCrossPlatformDeduplication && existingItems.length > 0) {
      const crossPlatformDuplicate = await this.detectCrossPlatformDuplicate(newsItem, existingItems);
      if (crossPlatformDuplicate.isDuplicate) {
        return crossPlatformDuplicate;
      }
    }

    return { isDuplicate: false };
  }

  /**
   * 检查URL重复
   */
  private async checkUrlDuplicates(newsItem: NewsItem, existingItems: NewsItem[]): Promise<DeduplicationResult> {
    // 标准化URL
    const normalizedUrl = this.normalizeUrl(newsItem.url);
    const urlHash = this.hashString(normalizedUrl);

    // 检查内存中的URL哈希
    if (this.urlHashes.has(urlHash)) {
      return {
        isDuplicate: true,
        duplicateType: 'url'
      };
    }

    // 检查现有项目中的URL重复
    for (const existingItem of existingItems) {
      const existingNormalizedUrl = this.normalizeUrl(existingItem.url);
      if (normalizedUrl === existingNormalizedUrl) {
        return {
          isDuplicate: true,
          duplicateType: 'url',
          matchedItemId: existingItem.id
        };
      }
    }

    // 添加到URL哈希记录
    this.urlHashes.add(urlHash);

    return { isDuplicate: false };
  }

  /**
   * 标准化URL
   */
  private normalizeUrl(url: string): string {
    try {
      // 移除URL中的查询参数（除了必要的参数）
      const urlObj = new URL(url);

      // 保留特定的查询参数（如视频ID、文章ID等）
      const keepParams = ['v', 'id', 'video_id', 'article_id', 'tweet_id', 'status_id'];
      const params = new URLSearchParams();

      for (const param of keepParams) {
        const value = urlObj.searchParams.get(param);
        if (value) {
          params.set(param, value);
        }
      }

      // 构建标准化URL
      urlObj.search = params.toString();

      // 移除尾部斜杠，转换为小写
      let normalized = urlObj.toString().toLowerCase();
      if (normalized.endsWith('/')) {
        normalized = normalized.slice(0, -1);
      }

      return normalized;
    } catch (error) {
      // 如果URL解析失败，返回原始URL的小写形式
      return url.toLowerCase();
    }
  }

  /**
   * 计算内容相似度
   */
  private async calculateContentSimilarity(item1: NewsItem, item2: NewsItem): Promise<number> {
    // 使用多种相似度算法并取平均值

    const text1 = this.preprocessText(`${item1.title} ${item1.content}`);
    const text2 = this.preprocessText(`${item2.title} ${item2.content}`);

    // 如果文本太短，使用简单的字符串匹配
    if (text1.length < 20 || text2.length < 20) {
      return this.calculateSimpleSimilarity(text1, text2);
    }

    // 计算多种相似度
    const jaccardSimilarity = this.calculateJaccardSimilarity(text1, text2);
    const cosineSimilarity = await this.calculateCosineSimilarity(text1, text2);
    const levenshteinSimilarity = this.calculateLevenshteinSimilarity(text1, text2);

    // 返回加权平均值（余弦相似度权重更高）
    return (jaccardSimilarity * 0.3 + cosineSimilarity * 0.5 + levenshteinSimilarity * 0.2);
  }

  /**
   * 预处理文本
   */
  private preprocessText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\u4e00-\u9fa5\s]/g, ' ') // 保留中文、英文、数字和空格
      .replace(/\s+/g, ' ') // 合并多个空格
      .trim();
  }

  /**
   * 计算Jaccard相似度
   */
  private calculateJaccardSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));

    const intersection = new Set([...words1].filter(word => words2.has(word)));
    const union = new Set([...words1, ...words2]);

    return union.size === 0 ? 0 : intersection.size / union.size;
  }

  /**
   * 计算余弦相似度
   */
  private async calculateCosineSimilarity(text1: string, text2: string): Promise<number> {
    // 简单的词频向量余弦相似度
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);

    const allWords = [...new Set([...words1, ...words2])];
    const vector1 = new Array(allWords.length).fill(0);
    const vector2 = new Array(allWords.length).fill(0);

    // 构建词频向量
    const freq1: Record<string, number> = {};
    const freq2: Record<string, number> = {};

    words1.forEach(word => {
      freq1[word] = (freq1[word] || 0) + 1;
    });

    words2.forEach(word => {
      freq2[word] = (freq2[word] || 0) + 1;
    });

    // 填充向量
    allWords.forEach((word, index) => {
      vector1[index] = freq1[word] || 0;
      vector2[index] = freq2[word] || 0;
    });

    // 计算余弦相似度
    let dotProduct = 0;
    let magnitude1 = 0;
    let magnitude2 = 0;

    for (let i = 0; i < allWords.length; i++) {
      dotProduct += vector1[i] * vector2[i];
      magnitude1 += vector1[i] * vector1[i];
      magnitude2 += vector2[i] * vector2[i];
    }

    magnitude1 = Math.sqrt(magnitude1);
    magnitude2 = Math.sqrt(magnitude2);

    if (magnitude1 === 0 || magnitude2 === 0) {
      return 0;
    }

    return dotProduct / (magnitude1 * magnitude2);
  }

  /**
   * 计算Levenshtein相似度
   */
  private calculateLevenshteinSimilarity(text1: string, text2: string): number {
    // 对于长文本，使用子字符串比较
    const maxLength = Math.max(text1.length, text2.length);
    if (maxLength > 1000) {
      // 对于长文本，采样比较
      const sample1 = text1.substring(0, 1000);
      const sample2 = text2.substring(0, 1000);
      return this.calculateLevenshteinDistanceSimilarity(sample1, sample2);
    }

    return this.calculateLevenshteinDistanceSimilarity(text1, text2);
  }

  /**
   * 计算Levenshtein距离相似度
   */
  private calculateLevenshteinDistanceSimilarity(text1: string, text2: string): number {
    const distance = this.levenshteinDistance(text1, text2);
    const maxLength = Math.max(text1.length, text2.length);

    if (maxLength === 0) {
      return 1;
    }

    return 1 - distance / maxLength;
  }

  /**
   * 计算Levenshtein距离
   */
  private levenshteinDistance(text1: string, text2: string): number {
    const m = text1.length;
    const n = text2.length;
    const dp: number[][] = Array(m + 1).fill(0).map(() => Array(n + 1).fill(0));

    for (let i = 0; i <= m; i++) {
      dp[i][0] = i;
    }

    for (let j = 0; j <= n; j++) {
      dp[0][j] = j;
    }

    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = text1[i - 1] === text2[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,     // 删除
          dp[i][j - 1] + 1,     // 插入
          dp[i - 1][j - 1] + cost // 替换
        );
      }
    }

    return dp[m][n];
  }

  /**
   * 计算简单相似度（用于短文本）
   */
  private calculateSimpleSimilarity(text1: string, text2: string): number {
    if (text1 === text2) {
      return 1;
    }

    if (text1.includes(text2) || text2.includes(text1)) {
      return 0.8;
    }

    // 简单的单词重叠
    const words1 = text1.split(/\s+/);
    const words2 = text2.split(/\s+/);

    const commonWords = words1.filter(word => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;

    return totalWords === 0 ? 0 : commonWords.length / totalWords;
  }

  /**
   * 检测跨平台重复
   */
  private async detectCrossPlatformDuplicate(newsItem: NewsItem, existingItems: NewsItem[]): Promise<DeduplicationResult> {
    // 检测相同内容在不同平台上的重复
    // 例如：YouTube视频被转帖到微博或抖音

    for (const existingItem of existingItems) {
      // 检查是否是相同事件的不同平台报道
      const isSameEvent = await this.isSameEvent(newsItem, existingItem);
      const areSimilarTopics = this.areSimilarTopics(newsItem, existingItem);

      if (isSameEvent && areSimilarTopics) {
        const similarity = await this.calculateContentSimilarity(newsItem, existingItem);
        if (similarity >= this.config.similarityThreshold * 0.7) { // 跨平台检测使用更宽松的阈值
          return {
            isDuplicate: true,
            duplicateType: 'cross-platform',
            matchedItemId: existingItem.id,
            similarityScore: similarity
          };
        }
      }

      // 额外检查：相同视频/图片在不同平台
      if (this.isSameMediaContent(newsItem, existingItem)) {
        return {
          isDuplicate: true,
          duplicateType: 'cross-platform',
          matchedItemId: existingItem.id,
          similarityScore: 0.9 // 相同媒体内容高度相似
        };
      }
    }

    return { isDuplicate: false };
  }

  /**
   * 判断是否是相同事件
   */
  private async isSameEvent(item1: NewsItem, item2: NewsItem): Promise<boolean> {
    // 简单实现：检查发布时间是否相近且内容相关
    const timeDiff = Math.abs(item1.publishTime.getTime() - item2.publishTime.getTime());
    const isTimeClose = timeDiff < 24 * 60 * 60 * 1000; // 24小时内

    const topics1 = this.extractTopics(item1);
    const topics2 = this.extractTopics(item2);
    const commonTopics = topics1.filter(topic => topics2.includes(topic));

    return isTimeClose && commonTopics.length > 0;
  }

  /**
   * 提取话题
   */
  private extractTopics(newsItem: NewsItem): string[] {
    // 从标签和内容中提取话题
    const topics: string[] = [];

    // 从标签中提取
    topics.push(...newsItem.tags);

    // 从内容中提取（简单实现）
    const content = `${newsItem.title} ${newsItem.content}`;
    const hashtagMatches = content.match(/#[\w\u4e00-\u9fa5]+/g) || [];
    topics.push(...hashtagMatches.map(tag => tag.substring(1)));

    return Array.from(new Set(topics));
  }

  /**
   * 判断话题是否相似
   */
  private areSimilarTopics(item1: NewsItem, item2: NewsItem): boolean {
    const topics1 = this.extractTopics(item1);
    const topics2 = this.extractTopics(item2);
    const commonTopics = topics1.filter(topic => topics2.includes(topic));

    return commonTopics.length > 0;
  }

  /**
   * 判断是否是相同媒体内容
   */
  private isSameMediaContent(item1: NewsItem, item2: NewsItem): boolean {
    // 检查是否有相同的媒体URL
    const mediaUrls1 = item1.media.map(m => m.url).filter(url => url);
    const mediaUrls2 = item2.media.map(m => m.url).filter(url => url);

    if (mediaUrls1.length === 0 || mediaUrls2.length === 0) {
      return false;
    }

    // 检查是否有相同的媒体URL（标准化后比较）
    for (const url1 of mediaUrls1) {
      for (const url2 of mediaUrls2) {
        const normalized1 = this.normalizeMediaUrl(url1);
        const normalized2 = this.normalizeMediaUrl(url2);

        if (normalized1 === normalized2) {
          return true;
        }

        // 检查是否是相同视频的不同格式
        if (this.isSameVideoContent(url1, url2)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * 标准化媒体URL
   */
  private normalizeMediaUrl(url: string): string {
    // 移除查询参数和片段标识符
    try {
      const urlObj = new URL(url);
      urlObj.search = '';
      urlObj.hash = '';
      return urlObj.toString().toLowerCase();
    } catch (error) {
      return url.toLowerCase();
    }
  }

  /**
   * 判断是否是相同视频内容
   */
  private isSameVideoContent(url1: string, url2: string): boolean {
    // 提取视频ID进行比对
    const videoId1 = this.extractVideoId(url1);
    const videoId2 = this.extractVideoId(url2);

    if (videoId1 && videoId2 && videoId1 === videoId2) {
      return true;
    }

    return false;
  }

  /**
   * 从URL中提取视频ID
   */
  private extractVideoId(url: string): string | null {
    // 常见视频平台的视频ID提取模式
    const patterns = [
      // YouTube: youtu.be/VIDEO_ID or youtube.com/watch?v=VIDEO_ID
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      // TikTok: tiktok.com/@username/video/VIDEO_ID
      /tiktok\.com\/@[^/]+\/video\/(\d+)/,
      // Douyin: douyin.com/video/VIDEO_ID
      /douyin\.com\/video\/(\d+)/,
      // 通用视频ID模式
      /[?&]v=([^&]+)/,
      /video\/([^/]+)/,
      /id=([^&]+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * 数据验证
   */
  private validate(newsItem: NewsItem): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // 必填字段检查
    if (!newsItem.id) errors.push('ID不能为空');
    if (!newsItem.platform) errors.push('平台类型不能为空');
    if (!newsItem.title || newsItem.title.trim().length === 0) errors.push('标题不能为空');
    if (!newsItem.content || newsItem.content.trim().length === 0) warnings.push('内容为空或过短');
    if (!newsItem.url) errors.push('URL不能为空');
    if (!newsItem.publishTime) errors.push('发布时间不能为空');
    if (!newsItem.author) errors.push('作者信息不能为空');
    if (!newsItem.author.id) errors.push('作者ID不能为空');
    if (!newsItem.author.name) errors.push('作者名称不能为空');

    // 数据格式检查
    if (newsItem.title.length > 500) warnings.push('标题过长');
    if (newsItem.content.length > 10000) warnings.push('内容过长');

    try {
      new URL(newsItem.url);
    } catch {
      errors.push('URL格式无效');
    }

    // 数值范围检查
    if (newsItem.engagement.likeCount < 0) warnings.push('点赞数不能为负数');
    if (newsItem.engagement.shareCount < 0) warnings.push('分享数不能为负数');
    if (newsItem.engagement.commentCount < 0) warnings.push('评论数不能为负数');
    if (newsItem.engagement.viewCount && newsItem.engagement.viewCount < 0) {
      warnings.push('查看数不能为负数');
    }

    // 发布时间合理性检查
    const now = new Date();
    const publishTime = new Date(newsItem.publishTime);
    if (publishTime > now) warnings.push('发布时间在未来');
    if (publishTime < new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000)) {
      warnings.push('发布时间过于久远（超过一年）');
    }

    // 标签检查
    if (newsItem.tags.length === 0) warnings.push('没有标签');
    if (newsItem.tags.length > 50) warnings.push('标签数量过多');

    // 媒体内容检查
    if (newsItem.media.length === 0) warnings.push('没有媒体内容');
    for (const media of newsItem.media) {
      if (!media.url) {
        errors.push('媒体URL不能为空');
      } else {
        try {
          new URL(media.url);
        } catch {
          warnings.push(`媒体URL格式可能无效: ${media.url}`);
        }
      }
    }

    // 平台特定数据检查
    if (newsItem.platformSpecific) {
      this.validatePlatformSpecificData(newsItem, errors, warnings);
    }

    // 内容质量检查
    this.validateContentQuality(newsItem, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * 验证平台特定数据
   */
  private validatePlatformSpecificData(newsItem: NewsItem, errors: string[], warnings: string[]): void {
    const platformSpecific = newsItem.platformSpecific;

    // Twitter特定验证
    if (platformSpecific.twitter) {
      const twitterData = platformSpecific.twitter;
      if (!twitterData.tweetId) errors.push('Twitter推文ID不能为空');
      if (twitterData.retweetCount && twitterData.retweetCount < 0) {
        warnings.push('Twitter转发数不能为负数');
      }
    }

    // YouTube特定验证
    if (platformSpecific.youtube) {
      const youtubeData = platformSpecific.youtube;
      if (!youtubeData.videoId) errors.push('YouTube视频ID不能为空');
      if (youtubeData.duration && youtubeData.duration < 0) {
        warnings.push('YouTube视频时长不能为负数');
      }
    }

    // TikTok特定验证
    if (platformSpecific.tiktok) {
      const tiktokData = platformSpecific.tiktok;
      if (!tiktokData.videoId) errors.push('TikTok视频ID不能为空');
      if (tiktokData.duration && tiktokData.duration < 0) {
        warnings.push('TikTok视频时长不能为负数');
      }
    }

    // Weibo特定验证
    if (platformSpecific.weibo) {
      const weiboData = platformSpecific.weibo;
      if (!weiboData.weiboId) errors.push('微博ID不能为空');
      if (weiboData.repostCount && weiboData.repostCount < 0) {
        warnings.push('微博转发数不能为负数');
      }
    }

    // Douyin特定验证
    if (platformSpecific.douyin) {
      const douyinData = platformSpecific.douyin;
      if (!douyinData.videoId && !douyinData.topicId) {
        errors.push('抖音视频ID或话题ID不能为空');
      }
      if (douyinData.duration && douyinData.duration < 0) {
        warnings.push('抖音视频时长不能为负数');
      }
    }
  }

  /**
   * 验证内容质量
   */
  private validateContentQuality(newsItem: NewsItem, errors: string[], warnings: string[]): void {
    // 标题质量检查
    if (newsItem.title.length < 3) warnings.push('标题过短');
    if (newsItem.title.length > 200) warnings.push('标题过长');

    // 内容质量检查
    if (newsItem.content.length < 10) warnings.push('内容过短');
    if (newsItem.content.length > 5000) warnings.push('内容过长');

    // 检查重复内容
    const titleWords = newsItem.title.split(/\s+/).length;
    const contentWords = newsItem.content.split(/\s+/).length;
    if (contentWords > 0 && titleWords / contentWords > 0.5) {
      warnings.push('标题与内容比例异常');
    }

    // 检查特殊字符比例
    const specialCharRegex = /[^\w\u4e00-\u9fa5\s]/g;
    const specialChars = (newsItem.content.match(specialCharRegex) || []).length;
    const totalChars = newsItem.content.length;
    if (totalChars > 0 && specialChars / totalChars > 0.3) {
      warnings.push('特殊字符比例过高');
    }

    // 检查URL数量
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = (newsItem.content.match(urlRegex) || []).length;
    if (urls > 5) warnings.push('内容中URL数量过多');
  }

  /**
   * 标准化日期
   */
  private normalizeDates(newsItem: NewsItem): NewsItem {
    const result = { ...newsItem };

    // 标准化发布时间
    result.publishTime = this.parseAndNormalizeDate(result.publishTime);

    // 标准化采集时间
    if (!result.collectedAt) {
      result.collectedAt = new Date();
    } else {
      result.collectedAt = this.parseAndNormalizeDate(result.collectedAt);
    }

    // 确保采集时间不早于发布时间
    if (result.collectedAt < result.publishTime) {
      result.collectedAt = new Date(result.publishTime.getTime() + 1000); // 加1秒
    }

    return result;
  }

  /**
   * 解析和标准化日期
   */
  private parseAndNormalizeDate(dateInput: any): Date {
    if (!dateInput) {
      return new Date();
    }

    if (dateInput instanceof Date) {
      return dateInput;
    }

    // 尝试解析各种日期格式
    const dateString = String(dateInput);
    let parsedDate: Date | null = null;

    // 尝试标准ISO格式
    parsedDate = this.tryParseIsoDate(dateString);
    if (parsedDate) return parsedDate;

    // 尝试常见的中文日期格式
    parsedDate = this.tryParseChineseDate(dateString);
    if (parsedDate) return parsedDate;

    // 尝试Unix时间戳
    parsedDate = this.tryParseTimestamp(dateString);
    if (parsedDate) return parsedDate;

    // 尝试其他常见格式
    parsedDate = this.tryParseCommonDate(dateString);
    if (parsedDate) return parsedDate;

    // 如果所有解析都失败，返回当前日期
    return new Date();
  }

  /**
   * 尝试解析ISO日期格式
   */
  private tryParseIsoDate(dateString: string): Date | null {
    try {
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date;
      }
    } catch {
      // 忽略错误，继续尝试其他格式
    }
    return null;
  }

  /**
   * 尝试解析中文日期格式
   */
  private tryParseChineseDate(dateString: string): Date | null {
    // 常见的中文日期格式
    const patterns = [
      // "2023年12月31日 14:30:45"
      /(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/,
      // "2023年12月31日 14:30"
      /(\d{4})年(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{1,2})/,
      // "2023年12月31日"
      /(\d{4})年(\d{1,2})月(\d{1,2})日/,
      // "12月31日 14:30"
      /(\d{1,2})月(\d{1,2})日\s+(\d{1,2}):(\d{1,2})/,
      // "刚刚"、"1分钟前"、"1小时前"、"1天前"
      /刚刚|(\d+)\s*分钟前|(\d+)\s*小时前|(\d+)\s*天前/
    ];

    for (const pattern of patterns) {
      const match = dateString.match(pattern);
      if (match) {
        if (match[0] === '刚刚') {
          return new Date();
        } else if (match[1] && pattern.toString().includes('分钟前')) {
          const minutes = parseInt(match[1]);
          return new Date(Date.now() - minutes * 60 * 1000);
        } else if (match[2] && pattern.toString().includes('小时前')) {
          const hours = parseInt(match[2]);
          return new Date(Date.now() - hours * 60 * 60 * 1000);
        } else if (match[3] && pattern.toString().includes('天前')) {
          const days = parseInt(match[3]);
          return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        } else if (match[1] && match[2] && match[3] && match[4] && match[5] && match[6]) {
          // 完整日期时间
          return new Date(
            parseInt(match[1]),
            parseInt(match[2]) - 1,
            parseInt(match[3]),
            parseInt(match[4]),
            parseInt(match[5]),
            parseInt(match[6])
          );
        } else if (match[1] && match[2] && match[3] && match[4] && match[5]) {
          // 日期时间（无秒）
          return new Date(
            parseInt(match[1]),
            parseInt(match[2]) - 1,
            parseInt(match[3]),
            parseInt(match[4]),
            parseInt(match[5])
          );
        } else if (match[1] && match[2] && match[3]) {
          // 仅日期
          return new Date(
            parseInt(match[1]),
            parseInt(match[2]) - 1,
            parseInt(match[3])
          );
        } else if (match[1] && match[2] && match[3] && match[4]) {
          // 月日时分（假设当前年）
          const now = new Date();
          return new Date(
            now.getFullYear(),
            parseInt(match[1]) - 1,
            parseInt(match[2]),
            parseInt(match[3]),
            parseInt(match[4])
          );
        }
      }
    }

    return null;
  }

  /**
   * 尝试解析时间戳
   */
  private tryParseTimestamp(dateString: string): Date | null {
    // 检查是否是数字时间戳
    const timestamp = parseInt(dateString);
    if (!isNaN(timestamp)) {
      // 判断是秒还是毫秒
      if (timestamp > 10000000000) {
        // 毫秒时间戳（大于10000000000毫秒）
        return new Date(timestamp);
      } else {
        // 秒时间戳
        return new Date(timestamp * 1000);
      }
    }
    return null;
  }

  /**
   * 尝试解析常见日期格式
   */
  private tryParseCommonDate(dateString: string): Date | null {
    // 常见的英文日期格式
    const patterns = [
      // "December 31, 2023 14:30:45"
      /([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/,
      // "31 Dec 2023 14:30"
      /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})\s+(\d{1,2}):(\d{1,2})/,
      // "2023/12/31 14:30:45"
      /(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})/,
      // "2023-12-31T14:30:45Z"
      /(\d{4})-(\d{1,2})-(\d{1,2})T(\d{1,2}):(\d{1,2}):(\d{1,2})Z/
    ];

    const monthNames: Record<string, number> = {
      jan: 0, january: 0,
      feb: 1, february: 1,
      mar: 2, march: 2,
      apr: 3, april: 3,
      may: 4,
      jun: 5, june: 5,
      jul: 6, july: 6,
      aug: 7, august: 7,
      sep: 8, september: 8,
      oct: 9, october: 9,
      nov: 10, november: 10,
      dec: 11, december: 11
    };

    for (const pattern of patterns) {
      const match = dateString.match(pattern);
      if (match) {
        if (match[1] && match[2] && match[3] && match[4] && match[5] && match[6]) {
          // 完整英文日期时间
          const month = monthNames[match[1].toLowerCase()];
          if (month !== undefined) {
            return new Date(
              parseInt(match[3]),
              month,
              parseInt(match[2]),
              parseInt(match[4]),
              parseInt(match[5]),
              parseInt(match[6])
            );
          }
        } else if (match[1] && match[2] && match[3] && match[4] && match[5]) {
          // 简写英文日期时间
          const month = monthNames[match[2].toLowerCase()];
          if (month !== undefined) {
            return new Date(
              parseInt(match[3]),
              month,
              parseInt(match[1]),
              parseInt(match[4]),
              parseInt(match[5])
            );
          }
        } else if (match[1] && match[2] && match[3] && match[4] && match[5] && match[6]) {
          // ISO格式
          return new Date(
            parseInt(match[1]),
            parseInt(match[2]) - 1,
            parseInt(match[3]),
            parseInt(match[4]),
            parseInt(match[5]),
            parseInt(match[6])
          );
        }
      }
    }

    return null;
  }

  /**
   * 修复编码问题和文本标准化
   */
  private fixEncoding(newsItem: NewsItem): NewsItem {
    const result = { ...newsItem };

    // 修复常见的编码问题
    const fixText = (text: string): string => {
      if (!text) return text;

      // 替换常见的乱码字符
      let fixed = text
        .replace(/â€/g, '') // 常见的UTF-8乱码
        .replace(/Ã¡/g, 'á')
        .replace(/Ã©/g, 'é')
        .replace(/Ã³/g, 'ó')
        .replace(/Ãº/g, 'ú')
        .replace(/Ã±/g, 'ñ')
        .replace(/Ã£/g, 'ã')
        .replace(/Ã§/g, 'ç')
        .replace(/â€™/g, "'") // 智能引号
        .replace(/â€œ/g, '"') // 左双引号
        .replace(/â€/g, '"') // 右双引号
        .replace(/â€"/g, '-') // 破折号
        .replace(/â€¦/g, '...') // 省略号
        .replace(/Â°/g, '°') // 度符号
        .replace(/Â±/g, '±') // 加减号
        .replace(/Âµ/g, 'µ') // 微符号
        .replace(/Ã¼/g, 'ü')
        .replace(/Ã¶/g, 'ö')
        .replace(/Ã¤/g, 'ä')
        .replace(/ÃŸ/g, 'ß');

      // 中文编码修复
      fixed = fixed
        .replace(/Ã¥/g, 'å')
        .replace(/Ã¦/g, 'æ')
        .replace(/Ã¸/g, 'ø')
        .replace(/Ã…/g, 'Å')
        .replace(/Ã†/g, 'Æ')
        .replace(/Ã˜/g, 'Ø');

      // 移除不可打印字符（保留空格、换行等）
      fixed = fixed.replace(/[^\x20-\x7E\xA0-\xFF\u0100-\uFFFF\n\r\t]/g, '');

      // 文本标准化
      fixed = this.normalizeText(fixed);

      return fixed.trim();
    };

    result.title = fixText(result.title);
    result.content = fixText(result.content);
    if (result.author.name) {
      result.author.name = fixText(result.author.name);
    }

    // 修复标签编码
    if (result.tags && Array.isArray(result.tags)) {
      result.tags = result.tags.map(tag => this.normalizeText(tag));
    }

    return result;
  }

  /**
   * 文本标准化
   */
  private normalizeText(text: string): string {
    if (!text) return text;

    let normalized = text;

    // 标准化空格
    normalized = normalized.replace(/\s+/g, ' ');

    // 标准化引号
    normalized = normalized.replace(/[«»"＂]/g, '"');
    normalized = normalized.replace(/[『』'＇]/g, "'");

    // 标准化破折号
    normalized = normalized.replace(/[—–−]/g, '-');

    // 标准化省略号
    normalized = normalized.replace(/\.{3,}/g, '...');

    // 移除多余的空格和换行
    normalized = normalized.replace(/\n\s*\n/g, '\n\n');

    // 标准化URL中的空格
    normalized = normalized.replace(/(https?:\/\/[^\s]+)\s+/g, '$1 ');

    // 标准化中文标点
    normalized = normalized.replace(/，/g, ', ');
    normalized = normalized.replace(/。/g, '. ');
    normalized = normalized.replace(/！/g, '! ');
    normalized = normalized.replace(/？/g, '? ');
    normalized = normalized.replace(/；/g, '; ');
    normalized = normalized.replace(/：/g, ': ');

    return normalized.trim();
  }

  /**
   * 填充缺失值
   */
  private fillMissingValues(newsItem: NewsItem): NewsItem {
    const result = { ...newsItem };

    // 1. 填充采集时间
    if (!result.collectedAt) {
      result.collectedAt = new Date();
    }

    // 2. 填充互动数据默认值
    const engagement = result.engagement;
    if (engagement.likeCount === undefined || engagement.likeCount === null) engagement.likeCount = 0;
    if (engagement.shareCount === undefined || engagement.shareCount === null) engagement.shareCount = 0;
    if (engagement.commentCount === undefined || engagement.commentCount === null) engagement.commentCount = 0;
    if (engagement.viewCount === undefined || engagement.viewCount === null) {
      // 根据平台设置默认观看数
      engagement.viewCount = this.getDefaultViewCount(result.platform);
    }

    // 3. 填充作者信息
    const author = result.author;
    if (!author.avatarUrl) {
      author.avatarUrl = this.getDefaultAvatarUrl(result.platform);
    }
    if (!author.name || author.name.trim() === '') {
      author.name = this.getDefaultAuthorName(result.platform);
    }
    if (!author.id || author.id.trim() === '') {
      author.id = `unknown_${result.platform}_${Date.now()}`;
    }
    if (author.verified === undefined || author.verified === null) {
      author.verified = false;
    }

    // 4. 填充标签
    if (!result.tags || result.tags.length === 0) {
      result.tags = [this.getDefaultTag(result.platform)];
    }

    // 5. 填充媒体信息
    if (!result.media || result.media.length === 0) {
      result.media = [this.getDefaultMedia(result.platform)];
    } else {
      // 确保每个媒体项都有必要的字段
      result.media = result.media.map(media => ({
        type: media.type || 'image',
        url: media.url || '',
        thumbnailUrl: media.thumbnailUrl || media.url || '',
        width: media.width || 0,
        height: media.height || 0
      }));
    }

    // 6. 填充平台特定数据
    if (!result.platformSpecific) {
      result.platformSpecific = {};
    }

    // 7. 填充URL（如果缺失）
    if (!result.url || result.url.trim() === '') {
      result.url = this.generateDefaultUrl(result);
    }

    // 8. 填充内容（如果标题存在但内容缺失）
    if ((!result.content || result.content.trim() === '') && result.title) {
      result.content = result.title;
    }

    // 9. 填充标题（如果内容存在但标题缺失）
    if ((!result.title || result.title.trim() === '') && result.content) {
      result.title = this.generateTitleFromContent(result.content);
    }

    return result;
  }

  /**
   * 获取默认观看数
   */
  private getDefaultViewCount(platform: PlatformType): number {
    const defaultViewCounts: Record<PlatformType, number> = {
      [PlatformType.TWITTER]: 100,
      [PlatformType.YOUTUBE]: 1000,
      [PlatformType.TIKTOK]: 5000,
      [PlatformType.WEIBO]: 1000,
      [PlatformType.DOUYIN]: 5000
    };
    return defaultViewCounts[platform] || 100;
  }

  /**
   * 获取默认作者名称
   */
  private getDefaultAuthorName(platform: PlatformType): string {
    const defaultNames: Record<PlatformType, string> = {
      [PlatformType.TWITTER]: 'Twitter User',
      [PlatformType.YOUTUBE]: 'YouTube Creator',
      [PlatformType.TIKTOK]: 'TikTok Creator',
      [PlatformType.WEIBO]: '微博用户',
      [PlatformType.DOUYIN]: '抖音用户'
    };
    return defaultNames[platform] || 'Unknown User';
  }

  /**
   * 获取默认标签
   */
  private getDefaultTag(platform: PlatformType): string {
    const defaultTags: Record<PlatformType, string> = {
      [PlatformType.TWITTER]: 'twitter',
      [PlatformType.YOUTUBE]: 'youtube',
      [PlatformType.TIKTOK]: 'tiktok',
      [PlatformType.WEIBO]: 'weibo',
      [PlatformType.DOUYIN]: 'douyin'
    };
    return defaultTags[platform] || 'uncategorized';
  }

  /**
   * 获取默认媒体
   */
  private getDefaultMedia(platform: PlatformType): any {
    const defaultMedia = {
      type: 'image' as const,
      url: 'https://via.placeholder.com/300x200?text=No+Media',
      thumbnailUrl: 'https://via.placeholder.com/150x100?text=No+Media',
      width: 300,
      height: 200
    };
    return defaultMedia;
  }

  /**
   * 生成默认URL
   */
  private generateDefaultUrl(newsItem: NewsItem): string {
    const baseUrls: Record<PlatformType, string> = {
      [PlatformType.TWITTER]: 'https://twitter.com/i/web/status/',
      [PlatformType.YOUTUBE]: 'https://www.youtube.com/watch?v=',
      [PlatformType.TIKTOK]: 'https://www.tiktok.com/@user/video/',
      [PlatformType.WEIBO]: 'https://weibo.com/',
      [PlatformType.DOUYIN]: 'https://www.douyin.com/video/'
    };

    const baseUrl = baseUrls[newsItem.platform] || 'https://example.com/';
    const uniqueId = newsItem.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return `${baseUrl}${uniqueId}`;
  }

  /**
   * 从内容生成标题
   */
  private generateTitleFromContent(content: string): string {
    if (!content || content.trim() === '') {
      return 'Untitled';
    }

    // 取内容的前50个字符作为标题
    const trimmedContent = content.trim();
    if (trimmedContent.length <= 50) {
      return trimmedContent;
    }

    // 在句号或空格处截断
    const firstSentence = trimmedContent.split(/[.!?。！？]/)[0];
    if (firstSentence && firstSentence.length > 10 && firstSentence.length <= 50) {
      return firstSentence;
    }

    // 截取前50个字符并在单词边界处截断
    const truncated = trimmedContent.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 20) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * 获取默认头像URL
   */
  private getDefaultAvatarUrl(platform: PlatformType): string {
    const defaultAvatars: Record<PlatformType, string> = {
      [PlatformType.TWITTER]: 'https://abs.twimg.com/sticky/default_profile_images/default_profile_normal.png',
      [PlatformType.YOUTUBE]: 'https://www.gstatic.com/youtube/img/originals/promo/ytr-logo-for-search_160x160.png',
      [PlatformType.TIKTOK]: 'https://sf16-scmcdn-va.ibytedtos.com/goofy/tiktok/web/node/_next/static/images/logo-dark-3f6c5c4c730f0c3d78c9d4c3b8f7d5c5.png',
      [PlatformType.WEIBO]: 'https://img.t.sinajs.cn/t6/style/images/global_nav/WB_logo.png',
      [PlatformType.DOUYIN]: 'https://sf1-ttcdn-tos.pstatp.com/obj/eden-sg/ehanhshwhnulmpvs/logo/douyin.png'
    };

    return defaultAvatars[platform] || 'https://via.placeholder.com/100x100?text=Avatar';
  }

  /**
   * 提取关键词
   */
  private async extractKeywords(newsItem: NewsItem): Promise<NewsItem> {
    const result = { ...newsItem };

    // 提取关键词
    const keywords = await this.extractKeywordsFromText(`${newsItem.title} ${newsItem.content}`);

    // 提取实体
    const entities = await this.extractEntities(`${newsItem.title} ${newsItem.content}`);

    // 分类内容
    const categories = await this.classifyContent(newsItem);

    // 将关键词、实体和分类添加到标签中
    const allTags = [
      ...result.tags,
      ...keywords,
      ...entities.map(e => `entity:${e}`),
      ...categories.map(c => `category:${c}`)
    ];

    result.tags = [...new Set(allTags)];

    // 存储提取的信息到平台特定数据
    if (!result.platformSpecific) {
      result.platformSpecific = {};
    }

    result.platformSpecific.extracted = {
      keywords,
      entities,
      categories,
      extractedAt: new Date()
    };

    return result;
  }

  /**
   * 从文本中提取关键词
   */
  private async extractKeywordsFromText(text: string): Promise<string[]> {
    // 预处理文本
    const processedText = this.preprocessText(text);
    const words = processedText.split(/\s+/);

    // 扩展停用词列表
    const stopWords = new Set([
      // 中文停用词
      '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你',
      '个', '中', '为', '于', '与', '之', '而', '或', '且', '但', '却', '虽', '然', '如果', '那么', '因为', '所以', '虽然', '但是',
      // 英文停用词
      'the', 'and', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'could', 'can', 'may', 'might', 'must'
    ]);

    // 计算词频
    const wordFreq: Record<string, number> = {};
    words.forEach(word => {
      if (word.length > 1 && !stopWords.has(word)) {
        wordFreq[word] = (wordFreq[word] || 0) + 1;
      }
    });

    // 提取高频词作为关键词
    const sortedWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15) // 取前15个高频词
      .map(([word]) => word);

    // 提取短语（2-3个词的组合）
    const phrases = this.extractPhrases(processedText);

    return [...sortedWords, ...phrases].slice(0, 20); // 总共最多20个关键词
  }

  /**
   * 提取短语
   */
  private extractPhrases(text: string): string[] {
    const words = text.split(/\s+/);
    const phrases: string[] = [];

    // 提取2-gram和3-gram短语
    for (let i = 0; i < words.length - 1; i++) {
      // 2-gram
      const twoGram = `${words[i]} ${words[i + 1]}`;
      if (twoGram.length > 3) {
        phrases.push(twoGram);
      }

      // 3-gram
      if (i < words.length - 2) {
        const threeGram = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
        if (threeGram.length > 5) {
          phrases.push(threeGram);
        }
      }
    }

    return phrases.slice(0, 10); // 最多10个短语
  }

  /**
   * 提取实体
   */
  private async extractEntities(text: string): Promise<string[]> {
    // 简单实现：使用规则提取常见实体
    // 在实际实现中，这里应该使用NLP实体识别

    const entities: string[] = [];

    // 提取人名（简单规则）
    const namePatterns = [
      /([A-Z][a-z]+ [A-Z][a-z]+)/g, // 英文全名
      /([\u4e00-\u9fa5]{2,4})/g // 中文名字（2-4个字符）
    ];

    for (const pattern of namePatterns) {
      const matches = text.match(pattern) || [];
      entities.push(...matches);
    }

    // 提取组织名
    const orgPatterns = [
      /([A-Z][a-z]+ (?:Corporation|Company|Inc|Ltd|Group))/gi,
      /([\u4e00-\u9fa5]+(?:公司|集团|企业|组织))/g
    ];

    for (const pattern of orgPatterns) {
      const matches = text.match(pattern) || [];
      entities.push(...matches);
    }

    // 提取地点
    const locationPatterns = [
      /(?:in|at|from) ([A-Z][a-z]+(?:, [A-Z][a-z]+)*)/gi,
      /(?:在|来自) ([\u4e00-\u9fa5]+(?:市|省|区|县))/g
    ];

    for (const pattern of locationPatterns) {
      const matches = text.match(pattern) || [];
      entities.push(...matches.map(m => m.replace(/^(?:in|at|from|在|来自)\s+/i, '')));
    }

    // 提取产品名
    const productPatterns = [
      /([A-Z][a-z]+(?: [A-Z][a-z]+)* (?:Pro|Max|Mini|Lite|SE))/g,
      /([\u4e00-\u9fa5]+(?:手机|电脑|电视|汽车|软件))/g
    ];

    for (const pattern of productPatterns) {
      const matches = text.match(pattern) || [];
      entities.push(...matches);
    }

    return [...new Set(entities)].slice(0, 10); // 去重并限制数量
  }

  /**
   * 分类内容
   */
  private async classifyContent(newsItem: NewsItem): Promise<string[]> {
    const categories: string[] = [];
    const text = `${newsItem.title} ${newsItem.content}`.toLowerCase();

    // 内容分类关键词
    const categoryKeywords: Record<string, string[]> = {
      'politics': ['政治', '政府', '选举', '总统', '总理', '国会', '政策', '外交', '国际关系', 'politics', 'government', 'election', 'president'],
      'economy': ['经济', '金融', '股市', '投资', '银行', '货币', '通胀', 'GDP', '经济', 'economy', 'finance', 'stock', 'investment', 'bank'],
      'technology': ['科技', '技术', '互联网', '人工智能', 'AI', '软件', '硬件', '手机', '电脑', 'technology', 'tech', 'internet', 'ai', 'software'],
      'entertainment': ['娱乐', '电影', '音乐', '明星', '综艺', '电视剧', '演唱会', 'entertainment', 'movie', 'music', 'celebrity', 'show'],
      'sports': ['体育', '足球', '篮球', '比赛', '运动员', '奥运会', '世界杯', 'sports', 'football', 'basketball', 'game', 'athlete'],
      'health': ['健康', '医疗', '医生', '医院', '疾病', '疫苗', '养生', 'health', 'medical', 'doctor', 'hospital', 'disease'],
      'education': ['教育', '学校', '学生', '老师', '大学', '学习', '课程', 'education', 'school', 'student', 'teacher', 'university'],
      'travel': ['旅游', '旅行', '景点', '酒店', '机票', '攻略', '风景', 'travel', 'tourism', 'hotel', 'flight', 'scenery'],
      'food': ['美食', '餐厅', '食谱', '烹饪', '食材', '吃货', 'food', 'restaurant', 'recipe', 'cooking', 'ingredient'],
      'fashion': ['时尚', '服装', '穿搭', '美妆', '品牌', '设计', 'fashion', 'clothing', 'style', 'makeup', 'brand']
    };

    // 检查每个分类
    for (const [category, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(keyword => text.includes(keyword))) {
        categories.push(category);
      }
    }

    // 如果没有匹配到分类，使用平台信息
    if (categories.length === 0) {
      switch (newsItem.platform) {
        case PlatformType.TWITTER:
          categories.push('social-media');
          break;
        case PlatformType.YOUTUBE:
          categories.push('video');
          break;
        case PlatformType.TIKTOK:
        case PlatformType.DOUYIN:
          categories.push('short-video');
          break;
        case PlatformType.WEIBO:
          categories.push('social-media-chinese');
          break;
        default:
          categories.push('general');
      }
    }

    return categories;
  }

  /**
   * 情感分析
   */
  private async analyzeSentiment(newsItem: NewsItem): Promise<NewsItem> {
    const result = { ...newsItem };

    // 分析情感
    const sentimentResult = await this.analyzeTextSentiment(`${newsItem.title} ${newsItem.content}`);

    // 检测趋势
    const trendResult = await this.detectTrends(newsItem);

    // 添加情感标签
    result.tags = [...result.tags, `sentiment:${sentimentResult.sentiment}`];

    // 添加趋势标签
    if (trendResult.isTrending) {
      result.tags = [...result.tags, 'trending'];
      if (trendResult.trendType) {
        result.tags = [...result.tags, `trend-${trendResult.trendType}`];
      }
    }

    // 存储情感和趋势分析结果
    if (!result.platformSpecific) {
      result.platformSpecific = {};
    }

    result.platformSpecific.analysis = {
      sentiment: sentimentResult,
      trends: trendResult,
      analyzedAt: new Date()
    };

    return result;
  }

  /**
   * 分析文本情感
   */
  private async analyzeTextSentiment(text: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    confidence: number;
    positiveWords: string[];
    negativeWords: string[];
  }> {
    // 扩展的情感词典
    const positiveWords = [
      // 中文积极词
      '好', '优秀', '精彩', '喜欢', '爱', '开心', '高兴', '美丽', '漂亮', '成功',
      '完美', '强大', '优秀', '出色', '卓越', '惊喜', '满意', '幸福', '快乐', '兴奋',
      '支持', '赞同', '认可', '欣赏', '佩服', '感谢', '感激', '感动', '温暖', '温馨',
      // 英文积极词
      'good', 'great', 'excellent', 'awesome', 'amazing', 'wonderful', 'fantastic', 'perfect',
      'love', 'like', 'happy', 'joy', 'excited', 'support', 'agree', 'approve', 'thank', 'grateful'
    ];

    const negativeWords = [
      // 中文消极词
      '坏', '差', '讨厌', '恨', '伤心', '难过', '丑陋', '失败', '糟糕', '问题',
      '错误', '缺陷', '不足', '失望', '愤怒', '生气', '不满', '批评', '反对', '拒绝',
      '痛苦', '悲伤', '绝望', '恐惧', '担心', '焦虑', '压力', '困难', '挑战', '危机',
      // 英文消极词
      'bad', 'poor', 'terrible', 'awful', 'horrible', 'hate', 'dislike', 'sad', 'angry',
      'disappointed', 'criticize', 'oppose', 'reject', 'pain', 'fear', 'worry', 'anxiety', 'stress'
    ];

    const textLower = text.toLowerCase();
    const foundPositiveWords: string[] = [];
    const foundNegativeWords: string[] = [];

    // 查找积极词
    positiveWords.forEach(word => {
      if (textLower.includes(word.toLowerCase())) {
        foundPositiveWords.push(word);
      }
    });

    // 查找消极词
    negativeWords.forEach(word => {
      if (textLower.includes(word.toLowerCase())) {
        foundNegativeWords.push(word);
      }
    });

    // 计算情感分数
    const positiveCount = foundPositiveWords.length;
    const negativeCount = foundNegativeWords.length;
    const totalCount = positiveCount + negativeCount;

    let sentiment: 'positive' | 'negative' | 'neutral' = 'neutral';
    let score = 0;
    let confidence = 0;

    if (totalCount > 0) {
      score = (positiveCount - negativeCount) / totalCount;
      confidence = totalCount / (positiveWords.length + negativeWords.length) * 2; // 调整置信度计算

      if (score > 0.1) {
        sentiment = 'positive';
      } else if (score < -0.1) {
        sentiment = 'negative';
      } else {
        sentiment = 'neutral';
      }
    }

    // 考虑表情符号
    const emojiSentiment = this.analyzeEmojiSentiment(text);
    if (emojiSentiment !== 'neutral') {
      // 表情符号对情感有较强影响
      if (sentiment === 'neutral') {
        sentiment = emojiSentiment;
        score = emojiSentiment === 'positive' ? 0.5 : -0.5;
      } else if (sentiment !== emojiSentiment) {
        // 表情符号与文本情感不一致，降低置信度
        confidence *= 0.7;
      }
    }

    return {
      sentiment,
      score,
      confidence: Math.min(confidence, 1),
      positiveWords: foundPositiveWords,
      negativeWords: foundNegativeWords
    };
  }

  /**
   * 分析表情符号情感
   */
  private analyzeEmojiSentiment(text: string): 'positive' | 'negative' | 'neutral' {
    const positiveEmojis = ['😊', '😄', '😍', '👍', '❤️', '🎉', '🔥', '⭐', '🌟', '💯'];
    const negativeEmojis = ['😢', '😠', '👎', '💔', '😡', '😭', '😤', '💩', '👿', '😨'];

    let positiveCount = 0;
    let negativeCount = 0;

    positiveEmojis.forEach(emoji => {
      if (text.includes(emoji)) positiveCount++;
    });

    negativeEmojis.forEach(emoji => {
      if (text.includes(emoji)) negativeCount++;
    });

    if (positiveCount > negativeCount) {
      return 'positive';
    } else if (negativeCount > positiveCount) {
      return 'negative';
    } else {
      return 'neutral';
    }
  }

  /**
   * 检测趋势
   */
  private async detectTrends(newsItem: NewsItem): Promise<{
    isTrending: boolean;
    trendType?: 'hot' | 'rising' | 'viral' | 'controversial';
    trendScore: number;
    factors: string[];
  }> {
    const factors: string[] = [];
    let trendScore = 0;

    // 1. 互动数据趋势
    const engagementScore = this.calculateEngagementTrendScore(newsItem);
    if (engagementScore > 0.7) {
      factors.push('high-engagement');
      trendScore += 0.4;
    }

    // 2. 发布时间趋势（最近发布的内容更可能趋势）
    const timeScore = this.calculateTimeTrendScore(newsItem);
    if (timeScore > 0.8) {
      factors.push('recent');
      trendScore += 0.3;
    }

    // 3. 作者影响力趋势
    const authorScore = this.calculateAuthorTrendScore(newsItem);
    if (authorScore > 0.6) {
      factors.push('influential-author');
      trendScore += 0.2;
    }

    // 4. 内容特征趋势
    const contentScore = this.calculateContentTrendScore(newsItem);
    if (contentScore > 0.5) {
      factors.push('trendy-content');
      trendScore += 0.1;
    }

    // 确定趋势类型
    let trendType: 'hot' | 'rising' | 'viral' | 'controversial' | undefined;
    const isTrending = trendScore > 0.5;

    if (isTrending) {
      if (engagementScore > 0.8 && timeScore > 0.8) {
        trendType = 'hot';
      } else if (timeScore > 0.9 && engagementScore > 0.6) {
        trendType = 'rising';
      } else if (engagementScore > 0.9) {
        trendType = 'viral';
      } else if (newsItem.tags.some(tag => tag.includes('controversial') || tag.includes('debate'))) {
        trendType = 'controversial';
      }
    }

    return {
      isTrending,
      trendType,
      trendScore,
      factors
    };
  }

  /**
   * 计算互动数据趋势分数
   */
  private calculateEngagementTrendScore(newsItem: NewsItem): number {
    const engagement = newsItem.engagement;
    let score = 0;

    // 观看/阅读数
    if (engagement.viewCount) {
      if (engagement.viewCount > 1000000) score += 0.4;
      else if (engagement.viewCount > 100000) score += 0.3;
      else if (engagement.viewCount > 10000) score += 0.2;
      else if (engagement.viewCount > 1000) score += 0.1;
    }

    // 点赞数比例
    if (engagement.viewCount && engagement.likeCount) {
      const likeRatio = engagement.likeCount / engagement.viewCount;
      if (likeRatio > 0.1) score += 0.3;
      else if (likeRatio > 0.05) score += 0.2;
      else if (likeRatio > 0.01) score += 0.1;
    }

    // 评论数比例
    if (engagement.viewCount && engagement.commentCount) {
      const commentRatio = engagement.commentCount / engagement.viewCount;
      if (commentRatio > 0.01) score += 0.2;
      else if (commentRatio > 0.005) score += 0.1;
    }

    // 分享数比例
    if (engagement.viewCount && engagement.shareCount) {
      const shareRatio = engagement.shareCount / engagement.viewCount;
      if (shareRatio > 0.005) score += 0.1;
    }

    return Math.min(score, 1);
  }

  /**
   * 计算时间趋势分数
   */
  private calculateTimeTrendScore(newsItem: NewsItem): number {
    const now = new Date();
    const publishTime = new Date(newsItem.publishTime);
    const hoursDiff = (now.getTime() - publishTime.getTime()) / (1000 * 60 * 60);

    if (hoursDiff < 1) return 1.0;      // 1小时内
    if (hoursDiff < 3) return 0.9;      // 3小时内
    if (hoursDiff < 6) return 0.8;      // 6小时内
    if (hoursDiff < 12) return 0.7;     // 12小时内
    if (hoursDiff < 24) return 0.6;     // 24小时内
    if (hoursDiff < 48) return 0.4;     // 48小时内
    if (hoursDiff < 72) return 0.2;     // 72小时内
    return 0.1;                         // 超过72小时
  }

  /**
   * 计算作者影响力趋势分数
   */
  private calculateAuthorTrendScore(newsItem: NewsItem): number {
    let score = 0;

    // 作者验证状态
    if (newsItem.author.verified) {
      score += 0.3;
    }

    // 作者粉丝数（如果可用）
    // 在实际实现中，这里应该检查作者对象的followerCount字段

    // 作者历史表现（简单实现）
    // 在实际实现中，这里应该查询作者的历史数据

    return Math.min(score, 1);
  }

  /**
   * 计算内容特征趋势分数
   */
  private calculateContentTrendScore(newsItem: NewsItem): number {
    let score = 0;
    const text = `${newsItem.title} ${newsItem.content}`.toLowerCase();

    // 检查热门话题关键词
    const trendingKeywords = [
      'breaking', 'news', 'update', 'live', 'exclusive', 'trending', 'viral',
      '突发', '新闻', '最新', '直播', '独家', '热搜', '爆款'
    ];

    trendingKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        score += 0.1;
      }
    });

    // 检查标签数量
    if (newsItem.tags.length > 5) {
      score += 0.2;
    }

    // 检查媒体内容
    if (newsItem.media.length > 0) {
      score += 0.1;
    }

    return Math.min(score, 1);
  }

  /**
   * 计算质量评分
   */
  private calculateQualityScore(newsItem: NewsItem, validationResult: ValidationResult): NewsItem {
    const result = { ...newsItem };

    let score = 1.0; // 初始分数

    // 根据验证结果扣分
    score -= validationResult.errors.length * 0.2;
    score -= validationResult.warnings.length * 0.05;

    // 根据内容完整性加分/扣分
    if (newsItem.content && newsItem.content.length > 100) score += 0.1;
    if (newsItem.content && newsItem.content.length < 20) score -= 0.2;

    if (newsItem.media && newsItem.media.length > 0) score += 0.1;

    if (newsItem.author.verified) score += 0.1;

    // 根据互动数据调整分数
    const totalEngagement = newsItem.engagement.likeCount +
                           newsItem.engagement.shareCount +
                           newsItem.engagement.commentCount;

    if (totalEngagement > 1000) score += 0.1;
    if (totalEngagement > 10000) score += 0.1;

    // 确保分数在0-1范围内
    result.qualityScore = Math.max(0, Math.min(1, score));

    return result;
  }

  /**
   * 字符串哈希
   */
  private hashString(str: string): string {
    // 简单哈希函数
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // 转换为32位整数
    }
    return hash.toString(36);
  }

  /**
   * 重置清洗器状态
   */
  reset(): void {
    this.urlHashes.clear();
    this.contentFingerprints.clear();
    this.logger.info('数据清洗器状态已重置');
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalUrlsProcessed: number;
    totalDuplicatesDetected: number;
    urlDuplicates: number;
    contentDuplicates: number;
    crossPlatformDuplicates: number;
  } {
    return {
      totalUrlsProcessed: this.urlHashes.size,
      totalDuplicatesDetected: 0, // 需要记录重复检测统计
      urlDuplicates: 0,
      contentDuplicates: 0,
      crossPlatformDuplicates: 0
    };
  }
}