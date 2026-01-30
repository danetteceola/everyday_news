/**
 * 数据库模块类型定义
 */

export interface Platform {
  id: number;
  name: string;
  icon: string | null;
  created_at: Date;
}

export interface NewsItem {
  id: number;
  platform_id: number;
  external_id: string;
  title: string;
  content: string;
  url: string;
  author: string | null;
  publish_time: Date;
  views: number;
  likes: number;
  shares: number;
  comments: number;
  tags: string[] | null;
  category: string | null;
  is_investment_related: boolean;
  summary: string | null;
  created_at: Date;
}

export interface DailySummary {
  id: number;
  date: string; // YYYY-MM-DD格式
  domestic_hotspots: string[] | null;
  international_hotspots: string[] | null;
  investment_hotspots: string[] | null;
  generated_at: Date;
}

export interface CrawlLog {
  id: number;
  platform_id: number;
  started_at: Date;
  completed_at: Date | null;
  items_collected: number;
  status: 'running' | 'completed' | 'failed';
  error_message: string | null;
}

export interface DatabaseConfig {
  databasePath: string;
  backupPath: string;
  maxConnections?: number;
  timeout?: number;
}

export interface Migration {
  version: number;
  description: string;
  up: string;
  down: string;
  applied_at?: Date;
}

export interface BackupInfo {
  filename: string;
  path: string;
  size: number;
  created_at: Date;
  database_version: number;
}

export interface QueryStats {
  query: string;
  execution_time: number;
  rows_returned: number;
  timestamp: Date;
}