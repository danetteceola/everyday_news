/**
 * Common types for the System Architecture Module
 */

export interface Platform {
  id: string;
  name: string;
  enabled: boolean;
  collectionSchedule: string; // cron expression
}

export interface NewsItem {
  id: string;
  platform: string;
  title: string;
  content: string;
  url: string;
  publishedAt: Date;
  category?: string;
  tags?: string[];
  investmentRelevant: boolean;
}

export interface DailySummary {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
  generatedAt: Date;
  platformCounts: Record<string, number>;
  topCategories: string[];
  investmentHighlights?: string[];
}

export interface CrawlLog {
  id: string;
  platform: string;
  startTime: Date;
  endTime: Date;
  itemsCollected: number;
  success: boolean;
  error?: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';