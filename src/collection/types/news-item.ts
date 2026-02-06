/**
 * 统一新闻数据模型接口
 * 用于标准化不同平台采集的数据格式
 */

export interface NewsItem {
  /** 唯一标识符 */
  id: string;

  /** 平台类型 */
  platform: PlatformType;

  /** 内容标题 */
  title: string;

  /** 内容正文 */
  content: string;

  /** 原始URL */
  url: string;

  /** 发布时间 */
  publishTime: Date;

  /** 作者信息 */
  author: AuthorInfo;

  /** 互动数据 */
  engagement: EngagementData;

  /** 媒体内容 */
  media: MediaContent[];

  /** 标签/分类 */
  tags: string[];

  /** 平台特定扩展字段 */
  platformSpecific: PlatformSpecificData;

  /** 采集时间 */
  collectedAt: Date;

  /** 数据质量评分 (0-1) */
  qualityScore?: number;
}

/** 平台类型枚举 */
export enum PlatformType {
  TWITTER = 'twitter',
  YOUTUBE = 'youtube',
  TIKTOK = 'tiktok',
  WEIBO = 'weibo',
  DOUYIN = 'douyin'
}

/** 作者信息接口 */
export interface AuthorInfo {
  /** 作者ID */
  id: string;

  /** 作者名称 */
  name: string;

  /** 作者头像URL */
  avatarUrl?: string;

  /** 作者主页URL */
  profileUrl?: string;

  /** 粉丝数量 */
  followerCount?: number;

  /** 验证状态 */
  verified?: boolean;
}

/** 互动数据接口 */
export interface EngagementData {
  /** 点赞数 */
  likeCount: number;

  /** 分享/转发数 */
  shareCount: number;

  /** 评论数 */
  commentCount: number;

  /** 查看数 */
  viewCount?: number;

  /** 收藏数 */
  bookmarkCount?: number;
}

/** 媒体内容接口 */
export interface MediaContent {
  /** 媒体类型 */
  type: MediaType;

  /** 媒体URL */
  url: string;

  /** 缩略图URL */
  thumbnailUrl?: string;

  /** 媒体时长（秒） */
  duration?: number;

  /** 媒体尺寸 */
  dimensions?: {
    width: number;
    height: number;
  };
}

/** 媒体类型枚举 */
export enum MediaType {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  GIF = 'gif'
}

/** 平台特定数据接口 */
export interface PlatformSpecificData {
  /** Twitter特定字段 */
  twitter?: TwitterSpecificData;

  /** YouTube特定字段 */
  youtube?: YouTubeSpecificData;

  /** TikTok特定字段 */
  tiktok?: TikTokSpecificData;

  /** 微博特定字段 */
  weibo?: WeiboSpecificData;

  /** 抖音特定字段 */
  douyin?: DouyinSpecificData;
}

/** Twitter特定数据 */
export interface TwitterSpecificData {
  /** 推文ID */
  tweetId: string;

  /** 回复的推文ID */
  inReplyToStatusId?: string;

  /** 引用的推文ID */
  quotedStatusId?: string;

  /** 转发的推文ID */
  retweetedStatusId?: string;

  /** 推文语言 */
  language?: string;

  /** 地理位置信息 */
  geo?: {
    coordinates: [number, number];
    type: string;
  };

  /** 推文来源（客户端） */
  source?: string;
}

/** YouTube特定数据 */
export interface YouTubeSpecificData {
  /** 视频ID */
  videoId: string;

  /** 频道ID */
  channelId: string;

  /** 视频分类ID */
  categoryId?: string;

  /** 视频标签 */
  videoTags?: string[];

  /** 是否直播 */
  isLive?: boolean;

  /** 是否年龄限制 */
  ageRestricted?: boolean;

  /** 字幕可用性 */
  captionsAvailable?: boolean;
}

/** TikTok特定数据 */
export interface TikTokSpecificData {
  /** 视频ID */
  videoId: string;

  /** 作者ID */
  authorId?: string;

  /** 视频时长（秒） */
  duration?: number;

  /** 视频标签 */
  tags?: string[];

  /** 是否包含音频 */
  hasAudio?: boolean;

  /** 是否包含特效 */
  hasEffects?: boolean;

  /** 音乐信息 */
  musicInfo?: {
    title: string;
    author: string;
    album?: string;
    duration?: number;
  };

  /** 特效信息 */
  effectInfo?: {
    name: string;
    id: string;
    type?: string;
  };

  /** 音乐ID */
  musicId?: string;

  /** 特效ID */
  effectId?: string;

  /** 挑战/话题ID */
  challengeId?: string;

  /** 视频描述 */
  videoDescription?: string;

  /** 是否商业内容 */
  isCommercial?: boolean;
}

/** 微博特定数据 */
export interface WeiboSpecificData {
  /** 微博ID */
  weiboId: string;

  /** 微博MID */
  mid?: string;

  /** 微博类型 */
  weiboType?: string;

  /** 是否原创 */
  isOriginal?: boolean;

  /** 是否长微博 */
  isLongWeibo?: boolean;

  /** 阅读数 */
  readCount?: number;

  /** 话题标签 */
  topicTags?: string[];
}

/** 抖音特定数据 */
export interface DouyinSpecificData {
  /** 视频ID */
  videoId: string;

  /** 作者抖音ID */
  douyinUserId: string;

  /** 音乐ID */
  musicId?: string;

  /** 挑战/话题ID */
  challengeId?: string;

  /** 地理位置 */
  location?: string;

  /** 是否广告 */
  isAd?: boolean;
}

/** 数据采集状态 */
export interface CollectionStatus {
  /** 采集是否成功 */
  success: boolean;

  /** 错误信息（如果失败） */
  error?: string;

  /** 采集耗时（毫秒） */
  duration: number;

  /** 采集的数据项数量 */
  itemCount: number;

  /** 采集时间戳 */
  timestamp: Date;
}