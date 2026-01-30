/**
 * Claude Code Router Integration Module
 *
 * Provides integration with Claude Code Router for LLM calls and task scheduling.
 * Includes ccr code wrapper, prompt template management, and error handling.
 */

import { exec } from 'child_process';

export interface LLMUsageStats {
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  timestamp: Date;
  cost?: number;
}
export interface LLMRequest {
  prompt: string;
  systemPrompt?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  context?: Record<string, any>;
}

export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  timestamp: Date;
}

export interface PromptTemplate {
  id: string;
  name: string;
  systemPrompt: string;
  userPromptTemplate: string;
  variables: string[];
  description?: string;
}

export interface ClaudeIntegrationOptions {
  defaultModel?: string;
  defaultTemperature?: number;
  cacheEnabled?: boolean;
  cacheTTL?: number; // milliseconds
  maxRetries?: number;
  retryDelay?: number; // milliseconds
}

export class ClaudeIntegration {
  private options: ClaudeIntegrationOptions;
  private templates: Map<string, PromptTemplate> = new Map();
  private cache: Map<string, { response: LLMResponse; timestamp: Date }> = new Map();
  private usageStats: LLMUsageStats[] = [];

  constructor(options: ClaudeIntegrationOptions = {}) {
    this.options = {
      defaultModel: 'claude-3-5-sonnet-20241022',
      defaultTemperature: 0.7,
      cacheEnabled: true,
      cacheTTL: 3600000, // 1 hour
      maxRetries: 3,
      retryDelay: 1000, // 1 second
      ...options
    };
  }

  /**
   * Execute an LLM request using ccr code command
   */
  async execute(request: LLMRequest): Promise<LLMResponse> {
    const cacheKey = this.generateCacheKey(request);

    // Check cache
    if (this.options.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp.getTime()) < this.options.cacheTTL!) {
        console.log(`Cache hit for LLM request: ${cacheKey.substring(0, 50)}...`);
        this.recordUsage(this.createUsageStatsFromResponse(cached.response, request));
        return cached.response;
      }
    }

    let lastError: Error;

    for (let attempt = 1; attempt <= this.options.maxRetries!; attempt++) {
      try {
        const response = await this.callClaudeAPI(request);

        // Cache the response
        if (this.options.cacheEnabled) {
          this.cache.set(cacheKey, {
            response,
            timestamp: new Date()
          });
          this.cleanupCache();
        }

        this.recordUsage(this.createUsageStatsFromResponse(response, request));
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        console.error(`LLM call attempt ${attempt} failed:`, lastError.message);

        if (attempt === this.options.maxRetries) {
          throw new Error(`LLM call failed after ${this.options.maxRetries} attempts: ${lastError.message}`);
        }

        // Wait before retry
        await this.wait(this.options.retryDelay! * attempt); // Linear backoff
      }
    }

    throw lastError!;
  }

  /**
   * Execute a prompt template with variables
   */
  async executeTemplate(
    templateId: string,
    variables: Record<string, string>
  ): Promise<LLMResponse> {
    const template = this.templates.get(templateId);
    if (!template) {
      throw new Error(`Prompt template not found: ${templateId}`);
    }

    // Validate all required variables are provided
    for (const variable of template.variables) {
      if (!variables[variable]) {
        throw new Error(`Missing required variable: ${variable}`);
      }
    }

    // Replace variables in user prompt
    let userPrompt = template.userPromptTemplate;
    for (const [key, value] of Object.entries(variables)) {
      userPrompt = userPrompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
    }

    const request: LLMRequest = {
      prompt: userPrompt,
      systemPrompt: template.systemPrompt,
      model: this.options.defaultModel,
      temperature: this.options.defaultTemperature
    };

    return this.execute(request);
  }

  /**
   * Register a prompt template
   */
  registerTemplate(template: PromptTemplate): void {
    this.templates.set(template.id, template);
  }

  /**
   * Get a prompt template
   */
  getTemplate(templateId: string): PromptTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Get all prompt templates
   */
  getAllTemplates(): PromptTemplate[] {
    return Array.from(this.templates.values());
  }

  /**
   * Clear the LLM cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Record LLM usage statistics
   */
  private recordUsage(stats: LLMUsageStats): void {
    this.usageStats.push(stats);
  }

  /**
   * Get usage statistics
   */
  getUsageStats(): LLMUsageStats[] {
    return [...this.usageStats]; // Return copy
  }

  /**
   * Clear usage statistics
   */
  clearUsageStats(): void {
    this.usageStats = [];
  }

  /**
   * Generate cache key for a request
   */
  private generateCacheKey(request: LLMRequest): string {
    return JSON.stringify({
      prompt: request.prompt,
      systemPrompt: request.systemPrompt,
      model: request.model,
      temperature: request.temperature
    });
  }

  /**
   * Clean up expired cache entries
   */
  private cleanupCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp.getTime() > this.options.cacheTTL!) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Wait for specified milliseconds
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Estimate token count from text (rough approximation)
   */
  private estimateTokens(text: string): number {
    // Rough approximation: 1 token ≈ 4 characters for English
    return Math.ceil(text.length / 4);
  }

  /**
   * Create usage statistics from LLM response
   */
  private createUsageStatsFromResponse(response: LLMResponse, request: LLMRequest): LLMUsageStats {
    const model = response.model || request.model || this.options.defaultModel!;
    let promptTokens = 0;
    let completionTokens = 0;
    let totalTokens = 0;

    if (response.usage) {
      promptTokens = response.usage.promptTokens;
      completionTokens = response.usage.completionTokens;
      totalTokens = response.usage.totalTokens;
    } else {
      // Estimate tokens
      promptTokens = this.estimateTokens(request.prompt);
      completionTokens = this.estimateTokens(response.content);
      totalTokens = promptTokens + completionTokens;
    }

    // TODO: Add cost calculation based on model pricing
    const cost = undefined;

    return {
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      timestamp: response.timestamp,
      cost
    };
  }

  /**
   * Call Claude API using ccr code command
   *
   * Note: This is a placeholder implementation. In reality, you would:
   * 1. Use child_process to execute `ccr code` command
   * 2. Parse the output
   * 3. Handle errors and timeouts
   */
  private async callClaudeAPI(request: LLMRequest): Promise<LLMResponse> {
    return new Promise((resolve, reject) => {
      // Build ccr command arguments
      const args = ['code'];

      if (request.prompt) {
        args.push('--prompt', `"${request.prompt.replace(/"/g, '\\"')}"`);
      }

      if (request.systemPrompt) {
        args.push('--system-prompt', `"${request.systemPrompt.replace(/"/g, '\\"')}"`);
      }

      if (request.model) {
        args.push('--model', request.model);
      }

      if (request.temperature !== undefined) {
        args.push('--temperature', request.temperature.toString());
      }

      if (request.maxTokens) {
        args.push('--max-tokens', request.maxTokens.toString());
      }

      const command = `ccr ${args.join(' ')}`;
      console.log(`[ccr code] Executing: ${command.substring(0, 200)}...`);

      exec(command, { timeout: 300000 }, (error, stdout, stderr) => {
        if (error) {
          console.error(`[ccr code] Error: ${error.message}`);
          reject(new Error(`ccr code execution failed: ${error.message}`));
          return;
        }

        if (stderr) {
          console.warn(`[ccr code] stderr: ${stderr}`);
        }

        try {
          // Parse stdout as JSON or plain text
          let content: string;
          let usage = undefined;

          // Try to parse as JSON first
          try {
            const parsed = JSON.parse(stdout);
            if (typeof parsed === 'object' && parsed.content) {
              content = parsed.content;
              if (parsed.usage) {
                usage = parsed.usage;
              }
            } else {
              content = stdout;
            }
          } catch {
            content = stdout;
          }

          // Estimate tokens if not provided
          const promptTokens = this.estimateTokens(request.prompt);
          const completionTokens = this.estimateTokens(content);
          const totalTokens = promptTokens + completionTokens;

          const response: LLMResponse = {
            content,
            model: request.model || this.options.defaultModel!,
            timestamp: new Date()
          };

          if (usage) {
            response.usage = {
              promptTokens: usage.promptTokens || promptTokens,
              completionTokens: usage.completionTokens || completionTokens,
              totalTokens: usage.totalTokens || totalTokens
            };
          }

          resolve(response);
        } catch (parseError) {
          reject(new Error(`Failed to parse ccr code output: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`));
        }
      });
    });
  }
}

// Default Claude integration instance
export const claudeIntegration = new ClaudeIntegration();

/**
 * Integration with daily-summary Claude Skill
 *
 * This provides a specialized interface for generating daily summaries
 * using the daily-summary Claude Skill.
 */
export class DailySummaryIntegration {
  private claude: ClaudeIntegration;

  constructor(claudeIntegration?: ClaudeIntegration) {
    this.claude = claudeIntegration || new ClaudeIntegration();

    // Register daily summary template
    this.claude.registerTemplate({
      id: 'daily-summary',
      name: 'Daily News Summary',
      systemPrompt: 'You are a helpful assistant that generates concise daily news summaries in Chinese. Focus on key events, trends, and important developments from various news sources.',
      userPromptTemplate: '请基于以下新闻数据生成一份每日总结报告：\n\n新闻数据：\n{{news_data}}\n\n日期：{{date}}\n\n要求：\n1. 总结主要事件和趋势\n2. 突出重要新闻\n3. 提供关键洞察\n4. 保持简洁明了（不超过500字）',
      variables: ['news_data', 'date'],
      description: '生成每日新闻总结报告'
    });
  }

  /**
   * Generate daily summary from news data
   */
  async generateSummary(newsData: string, date: string = new Date().toISOString().split('T')[0]): Promise<string> {
    try {
      const response = await this.claude.executeTemplate('daily-summary', {
        news_data: newsData,
        date: date
      });

      return response.content;
    } catch (error) {
      console.error('Failed to generate daily summary:', error);
      throw new Error(`Daily summary generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

// Default daily summary integration instance
export const dailySummaryIntegration = new DailySummaryIntegration();