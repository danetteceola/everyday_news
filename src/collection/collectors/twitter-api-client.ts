/**
 * Twitter API客户端
 * 封装Twitter API v2操作，支持趋势话题和推文采集
 */

import { CollectionLogger, createCollectorLogger } from '../utils/logger';
import { CollectionError, CollectionErrorType, CollectionErrorHandler } from '../utils/error-handler';
import { AntiCrawlingSystem } from '../anti-crawling/anti-crawling-system';
import { RequestDelayManager } from '../anti-crawling/request-delay-manager';
import { TrendingTopic, TweetData } from './twitter-collector';

export interface TwitterApiConfig {
  /** API密钥 */
  apiKey: string;
  /** API密钥密钥 */
  apiSecret: string;
  /** 访问令牌 */
  accessToken: string;
  /** 访问令牌密钥 */
  accessTokenSecret: string;
  /** Bearer令牌（用于API v2） */
  bearerToken?: string;
  /** API版本 */
  apiVersion: '2' | '1.1';
  /** API基础URL */
  baseUrl: string;
  /** 请求超时时间（毫秒） */
  timeout: number;
  /** 最大重试次数 */
  maxRetries: number;
}

export interface TwitterApiResponse<T> {
  data: T;
  meta?: {
    result_count: number;
    next_token?: string;
    previous_token?: string;
  };
  errors?: Array<{
    message: string;
    code: number;
  }>;
}

export interface TwitterTrend {
  name: string;
  url: string;
  promoted_content: boolean | null;
  query: string;
  tweet_volume: number | null;
}

export interface TwitterUser {
  id: string;
  name: string;
  username: string;
  profile_image_url?: string;
  verified: boolean;
  public_metrics?: {
    followers_count: number;
    following_count: number;
    tweet_count: number;
    listed_count: number;
  };
}

export interface TwitterTweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    impression_count?: number;
  };
  attachments?: {
    media_keys: string[];
  };
  geo?: {
    coordinates: {
      type: string;
      coordinates: [number, number];
    };
    place_id: string;
  };
  lang?: string;
  possibly_sensitive?: boolean;
  referenced_tweets?: Array<{
    type: 'retweeted' | 'quoted' | 'replied_to';
    id: string;
  }>;
}

export interface TwitterMedia {
  media_key: string;
  type: 'photo' | 'video' | 'animated_gif';
  url?: string;
  preview_image_url?: string;
  duration_ms?: number;
  height?: number;
  width?: number;
}

export class TwitterApiClient {
  private config: TwitterApiConfig;
  private logger: CollectionLogger;
  private errorHandler: CollectionErrorHandler;
  private antiCrawlingSystem: AntiCrawlingSystem;

  /** 访问令牌 */
  private accessToken: string | null = null;

  /** 令牌过期时间 */
  private tokenExpiresAt: Date | null = null;

  /** 速率限制状态 */
  private rateLimitStatus: Map<string, { remaining: number; reset: Date }> = new Map();

  /**
   * 转换配置格式
   */
  private convertToAntiCrawlingConfig(config: TwitterApiConfig): any {
    return {
      baseDelay: 1000,
      randomDelayRange: 2000,
      maxConcurrentRequests: 1,
      userAgents: ['Twitter-API-Client/1.0'],
      proxies: [],
      maxRetries: config.maxRetries || 3,
      retryBaseDelay: 1000,
      enableProxyRotation: false,
      enableUserAgentRotation: false, // API客户端使用固定用户代理
      requestTimeout: config.timeout || 30000
    };
  }

  constructor(config: TwitterApiConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl || 'https://api.twitter.com',
      timeout: config.timeout || 30000,
      maxRetries: config.maxRetries || 3
    };

    this.logger = createCollectorLogger('twitter-api-client');
    this.errorHandler = new CollectionErrorHandler();

    // 初始化反爬系统
    const antiCrawlingConfig = this.convertToAntiCrawlingConfig(config);
    this.antiCrawlingSystem = new RequestDelayManager(antiCrawlingConfig, {});
  }

  /**
   * 初始化API客户端
   */
  async initialize(): Promise<void> {
    this.logger.info('初始化Twitter API客户端...');

    try {
      await this.antiCrawlingSystem.initialize();

      // 获取访问令牌
      if (this.config.bearerToken) {
        this.accessToken = this.config.bearerToken;
        this.logger.info('使用Bearer令牌认证');
      } else {
        await this.authenticate();
      }

      this.logger.info('Twitter API客户端初始化完成');
    } catch (error) {
      this.errorHandler.handleError(error, 'Twitter API客户端初始化失败');
      throw error;
    }
  }

  /**
   * 认证获取访问令牌
   */
  private async authenticate(): Promise<void> {
    this.logger.info('开始Twitter API认证...');

    try {
      // TODO: 实现OAuth 2.0认证流程
      // 对于API v2，通常使用Bearer令牌
      // 对于API v1.1，需要实现OAuth 1.0a

      this.logger.warn('Twitter API认证尚未实现，使用配置的访问令牌');
      this.accessToken = this.config.accessToken;

      // 设置令牌过期时间（假设1小时后过期）
      this.tokenExpiresAt = new Date(Date.now() + 3600000);
    } catch (error) {
      this.errorHandler.handleError(error, 'Twitter API认证失败');
      throw error;
    }
  }

  /**
   * 测试API可用性
   */
  async testAvailability(): Promise<boolean> {
    this.logger.info('测试Twitter API可用性...');

    try {
      // 尝试调用一个简单的API端点
      const response = await this.makeRequest('GET', '/2/tweets/search/recent', {
        query: 'test',
        max_results: 1
      });

      return response !== null;
    } catch (error) {
      this.logger.warn(`Twitter API可用性测试失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取可用的趋势位置
   */
  async getAvailableTrends(): Promise<Array<{ woeid: number; name: string; country: string }>> {
    this.logger.info('获取可用的趋势位置...');

    try {
      // API v1.1的端点
      const response = await this.makeRequest('GET', '/1.1/trends/available.json');

      if (response && Array.isArray(response)) {
        return response.map((item: any) => ({
          woeid: item.woeid,
          name: item.name,
          country: item.country
        }));
      }

      return [];
    } catch (error) {
      this.errorHandler.handleError(error, '获取趋势位置失败');
      throw error;
    }
  }

  /**
   * 获取指定位置的趋势话题
   */
  async getTrendingTopics(woeid: number = 1): Promise<TrendingTopic[]> {
    this.logger.info(`获取位置 ${woeid} 的趋势话题...`);

    try {
      // API v1.1的端点
      const response = await this.makeRequest('GET', `/1.1/trends/place.json?id=${woeid}`);

      if (response && Array.isArray(response) && response.length > 0) {
        const trends = response[0].trends as TwitterTrend[];

        return trends
          .filter(trend => trend.tweet_volume !== null && trend.tweet_volume > 0)
          .map(trend => ({
            name: trend.name,
            url: trend.url,
            tweetVolume: trend.tweet_volume || 0,
            description: trend.query
          }));
      }

      return [];
    } catch (error) {
      this.errorHandler.handleError(error, '获取趋势话题失败');
      throw error;
    }
  }

  /**
   * 搜索推文
   */
  async searchTweets(
    query: string,
    options: {
      maxResults?: number;
      startTime?: Date;
      endTime?: Date;
      nextToken?: string;
    } = {}
  ): Promise<{ tweets: TweetData[]; users: Map<string, TwitterUser>; nextToken?: string }> {
    this.logger.info(`搜索推文: ${query}`);

    try {
      const params: Record<string, any> = {
        query,
        max_results: options.maxResults || 10,
        'tweet.fields': 'created_at,public_metrics,author_id,geo,lang,possibly_sensitive,referenced_tweets,attachments',
        'user.fields': 'name,username,profile_image_url,verified,public_metrics',
        expansions: 'author_id,attachments.media_keys'
      };

      if (options.startTime) {
        params.start_time = options.startTime.toISOString();
      }

      if (options.endTime) {
        params.end_time = options.endTime.toISOString();
      }

      if (options.nextToken) {
        params.next_token = options.nextToken;
      }

      const response = await this.makeRequest('GET', '/2/tweets/search/recent', params);

      if (!response || !response.data) {
        return { tweets: [], users: new Map() };
      }

      const apiResponse = response as TwitterApiResponse<TwitterTweet[]>;

      // 提取用户信息
      const users = new Map<string, TwitterUser>();
      if (response.includes && response.includes.users) {
        response.includes.users.forEach((user: TwitterUser) => {
          users.set(user.id, user);
        });
      }

      // 提取媒体信息
      const media = new Map<string, TwitterMedia>();
      if (response.includes && response.includes.media) {
        response.includes.media.forEach((mediaItem: TwitterMedia) => {
          media.set(mediaItem.media_key, mediaItem);
        });
      }

      // 转换推文数据
      const tweets = apiResponse.data.map(tweet => this.convertApiTweetToTweetData(tweet, users, media));

      return {
        tweets,
        users,
        nextToken: apiResponse.meta?.next_token
      };
    } catch (error) {
      this.errorHandler.handleError(error, '搜索推文失败');
      throw error;
    }
  }

  /**
   * 获取用户信息
   */
  async getUser(userId: string): Promise<TwitterUser | null> {
    this.logger.info(`获取用户信息: ${userId}`);

    try {
      const response = await this.makeRequest('GET', `/2/users/${userId}`, {
        'user.fields': 'name,username,profile_image_url,verified,public_metrics'
      });

      if (response && response.data) {
        return response.data as TwitterUser;
      }

      return null;
    } catch (error) {
      this.errorHandler.handleError(error, '获取用户信息失败');
      throw error;
    }
  }

  /**
   * 获取推文详情
   */
  async getTweet(tweetId: string): Promise<TweetData | null> {
    this.logger.info(`获取推文详情: ${tweetId}`);

    try {
      const response = await this.makeRequest('GET', `/2/tweets/${tweetId}`, {
        'tweet.fields': 'created_at,public_metrics,author_id,geo,lang,possibly_sensitive,referenced_tweets,attachments',
        'user.fields': 'name,username,profile_image_url,verified,public_metrics',
        expansions: 'author_id,attachments.media_keys'
      });

      if (!response || !response.data) {
        return null;
      }

      const tweet = response.data as TwitterTweet;

      // 获取用户信息
      const users = new Map<string, TwitterUser>();
      if (response.includes && response.includes.users) {
        response.includes.users.forEach((user: TwitterUser) => {
          users.set(user.id, user);
        });
      }

      // 获取媒体信息
      const media = new Map<string, TwitterMedia>();
      if (response.includes && response.includes.media) {
        response.includes.media.forEach((mediaItem: TwitterMedia) => {
          media.set(mediaItem.media_key, mediaItem);
        });
      }

      return this.convertApiTweetToTweetData(tweet, users, media);
    } catch (error) {
      this.errorHandler.handleError(error, '获取推文详情失败');
      throw error;
    }
  }

  /**
   * 将API推文转换为内部推文数据格式
   */
  private convertApiTweetToTweetData(
    tweet: TwitterTweet,
    users: Map<string, TwitterUser>,
    media: Map<string, TwitterMedia>
  ): TweetData {
    const user = users.get(tweet.author_id);

    // 提取媒体内容
    const tweetMedia: TweetData['media'] = [];
    if (tweet.attachments && tweet.attachments.media_keys) {
      tweet.attachments.media_keys.forEach(mediaKey => {
        const mediaItem = media.get(mediaKey);
        if (mediaItem) {
          tweetMedia.push({
            type: this.convertMediaType(mediaItem.type),
            url: mediaItem.url || '',
            thumbnailUrl: mediaItem.preview_image_url
          });
        }
      });
    }

    return {
      id: tweet.id,
      author: {
        id: tweet.author_id,
        name: user?.name || 'Unknown',
        screenName: user?.username || 'unknown',
        avatarUrl: user?.profile_image_url,
        verified: user?.verified || false,
        followerCount: user?.public_metrics?.followers_count
      },
      content: tweet.text,
      publishTime: new Date(tweet.created_at),
      engagement: {
        likeCount: tweet.public_metrics.like_count,
        retweetCount: tweet.public_metrics.retweet_count,
        replyCount: tweet.public_metrics.reply_count,
        quoteCount: tweet.public_metrics.quote_count,
        viewCount: tweet.public_metrics.impression_count
      },
      media: tweetMedia,
      url: `https://twitter.com/${user?.username || 'twitter'}/status/${tweet.id}`,
      language: tweet.lang,
      sensitive: tweet.possibly_sensitive,
      geo: tweet.geo?.coordinates ? {
        coordinates: tweet.geo.coordinates.coordinates,
        type: tweet.geo.coordinates.type
      } : undefined
    };
  }

  /**
   * 转换媒体类型
   */
  private convertMediaType(apiType: string): 'image' | 'video' | 'gif' {
    switch (apiType) {
      case 'photo':
        return 'image';
      case 'video':
        return 'video';
      case 'animated_gif':
        return 'gif';
      default:
        return 'image';
    }
  }

  /**
   * 发送API请求
   */
  private async makeRequest(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<any> {
    // 检查速率限制
    await this.checkRateLimit(endpoint);

    // 应用反爬延迟
    await this.antiCrawlingSystem.applyDelay();

    const url = `${this.config.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'User-Agent': 'Twitter-API-Client/1.0',
      'Content-Type': 'application/json'
    };

    // 添加认证头
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      // 构建查询参数
      let requestUrl = url;
      const requestOptions: RequestInit = {
        method,
        headers,
        timeout: this.config.timeout
      };

      if (method === 'GET' && Object.keys(params).length > 0) {
        const queryParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            queryParams.append(key, String(value));
          }
        });
        requestUrl = `${url}?${queryParams.toString()}`;
      } else if (['POST', 'PUT'].includes(method)) {
        requestOptions.body = JSON.stringify(params);
      }

      this.logger.debug(`发送Twitter API请求: ${method} ${requestUrl}`);

      // 发送请求
      const response = await fetch(requestUrl, requestOptions);

      // 更新速率限制状态
      this.updateRateLimitStatus(endpoint, response.headers);

      // 检查响应状态
      if (!response.ok) {
        await this.handleApiError(response, endpoint);
      }

      // 解析响应
      const data = await response.json();

      // 检查API错误
      if (data.errors && data.errors.length > 0) {
        throw new CollectionError(
          CollectionErrorType.API_ERROR,
          `Twitter API错误: ${data.errors.map((e: any) => e.message).join(', ')}`
        );
      }

      return data;
    } catch (error) {
      if (error instanceof CollectionError) {
        throw error;
      }

      throw new CollectionError(
        CollectionErrorType.NETWORK_ERROR,
        `Twitter API请求失败: ${error.message}`
      );
    }
  }

  /**
   * 检查速率限制
   */
  private async checkRateLimit(endpoint: string): Promise<void> {
    const rateLimit = this.rateLimitStatus.get(endpoint);

    if (rateLimit && rateLimit.remaining <= 0) {
      const now = new Date();
      const waitTime = rateLimit.reset.getTime() - now.getTime();

      if (waitTime > 0) {
        this.logger.warn(`达到速率限制，等待 ${waitTime}ms 后重试`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  /**
   * 更新速率限制状态
   */
  private updateRateLimitStatus(endpoint: string, headers: Headers): void {
    const remaining = headers.get('x-rate-limit-remaining');
    const reset = headers.get('x-rate-limit-reset');

    if (remaining && reset) {
      const resetTime = new Date(parseInt(reset) * 1000);
      this.rateLimitStatus.set(endpoint, {
        remaining: parseInt(remaining),
        reset: resetTime
      });

      this.logger.debug(`速率限制状态: ${endpoint} - 剩余 ${remaining} 次，重置时间 ${resetTime}`);
    }
  }

  /**
   * 处理API错误
   */
  private async handleApiError(response: Response, endpoint: string): Promise<void> {
    const status = response.status;
    let errorMessage = `Twitter API请求失败: ${status} ${response.statusText}`;

    try {
      const errorData = await response.json();
      if (errorData.detail) {
        errorMessage = `Twitter API错误: ${errorData.detail}`;
      }
    } catch {
      // 忽略JSON解析错误
    }

    // 处理特定错误码
    switch (status) {
      case 401:
        throw new CollectionError(CollectionErrorType.AUTHENTICATION_ERROR, errorMessage);
      case 403:
        throw new CollectionError(CollectionErrorType.PERMISSION_ERROR, errorMessage);
      case 404:
        throw new CollectionError(CollectionErrorType.RESOURCE_NOT_FOUND, errorMessage);
      case 429:
        throw new CollectionError(CollectionErrorType.RATE_LIMIT_ERROR, errorMessage);
      case 500:
      case 502:
      case 503:
      case 504:
        throw new CollectionError(CollectionErrorType.SERVER_ERROR, errorMessage);
      default:
        throw new CollectionError(CollectionErrorType.API_ERROR, errorMessage);
    }
  }

  /**
   * 清理资源
   */
  async cleanup(): Promise<void> {
    this.logger.info('清理Twitter API客户端资源...');

    try {
      await this.antiCrawlingSystem.cleanup();
      this.logger.info('Twitter API客户端资源清理完成');
    } catch (error) {
      this.errorHandler.handleError(error, 'Twitter API客户端资源清理失败');
      throw error;
    }
  }
}