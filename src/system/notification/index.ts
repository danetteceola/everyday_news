/**
 * Notification Module
 *
 * Provides multi-channel notification system supporting Telegram, Email, and Webhook.
 * Implements adapter pattern for easy extension and failure handling with degradation.
 */

export interface NotificationMessage {
  title: string;
  content: string;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, any>;
}

export interface NotificationResult {
  success: boolean;
  channel: string;
  messageId?: string;
  error?: string;
  timestamp: Date;
}

export interface NotificationAdapter {
  name: string;
  send(message: NotificationMessage): Promise<NotificationResult>;
  isAvailable(): Promise<boolean>;
}

/**
 * Notification Template System
 */
export class NotificationTemplate {
  private template: string;
  private variables: Map<string, string> = new Map();

  constructor(template: string) {
    this.template = template;
  }

  setVariable(name: string, value: string): void {
    this.variables.set(name, value);
  }

  setVariables(variables: Record<string, string>): void {
    for (const [name, value] of Object.entries(variables)) {
      this.variables.set(name, value);
    }
  }

  render(): string {
    let result = this.template;
    for (const [name, value] of this.variables.entries()) {
      const pattern = new RegExp(`\\{\\{${name}\\}\\}`, 'g');
      result = result.replace(pattern, value);
    }
    return result;
  }

  static create(template: string): NotificationTemplate {
    return new NotificationTemplate(template);
  }
}

/**
 * Notification History Tracker
 */
export class NotificationHistory {
  private history: NotificationResult[] = [];

  record(result: NotificationResult): void {
    this.history.push(result);
  }

  getHistory(limit?: number): NotificationResult[] {
    const sorted = this.history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getHistoryByChannel(channel: string, limit?: number): NotificationResult[] {
    const filtered = this.history.filter(result => result.channel === channel);
    const sorted = filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return limit ? sorted.slice(0, limit) : sorted;
  }

  getSuccessRate(channel?: string): number {
    const filtered = channel
      ? this.history.filter(result => result.channel === channel)
      : this.history;

    if (filtered.length === 0) return 100;

    const successes = filtered.filter(result => result.success).length;
    return (successes / filtered.length) * 100;
  }

  clear(): void {
    this.history = [];
  }
}

/**
 * Base notification adapter with common functionality
 */
export abstract class BaseNotificationAdapter implements NotificationAdapter {
  abstract name: string;

  async send(message: NotificationMessage): Promise<NotificationResult> {
    try {
      // Validate message
      this.validateMessage(message);

      // Send via concrete implementation
      const result = await this.doSend(message);

      return {
        success: true,
        channel: this.name,
        messageId: result.messageId,
        timestamp: new Date()
      };
    } catch (error) {
      return {
        success: false,
        channel: this.name,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date()
      };
    }
  }

  abstract isAvailable(): Promise<boolean>;

  /**
   * Concrete implementation of sending logic
   */
  protected abstract doSend(message: NotificationMessage): Promise<{ messageId?: string }>;

  /**
   * Validate notification message
   */
  protected validateMessage(message: NotificationMessage): void {
    if (!message.title || !message.content) {
      throw new Error('Notification title and content are required');
    }

    if (message.title.length > 200) {
      throw new Error('Notification title too long (max 200 characters)');
    }

    if (message.content.length > 5000) {
      throw new Error('Notification content too long (max 5000 characters)');
    }
  }
}

/**
 * Telegram Notification Adapter
 */
export class TelegramNotificationAdapter extends BaseNotificationAdapter {
  name = 'telegram';
  private botToken: string | null = null;
  private chatId: string | null = null;

  constructor(botToken?: string, chatId?: string) {
    super();
    this.botToken = botToken || process.env.TELEGRAM_BOT_TOKEN || null;
    this.chatId = chatId || process.env.TELEGRAM_CHAT_ID || null;
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.botToken && this.chatId);
  }

  protected async doSend(message: NotificationMessage): Promise<{ messageId?: string }> {
    if (!this.botToken || !this.chatId) {
      throw new Error('Telegram bot token or chat ID not configured');
    }

    // TODO: Implement actual Telegram API call using node-telegram-bot-api
    // For now, simulate sending
    console.log(`[Telegram] ${message.title}: ${message.content.substring(0, 100)}...`);

    return { messageId: `telegram_${Date.now()}` };
  }
}

/**
 * Email Notification Adapter
 */
export class EmailNotificationAdapter extends BaseNotificationAdapter {
  name = 'email';
  private smtpConfig: any = null;

  constructor(smtpConfig?: any) {
    super();
    this.smtpConfig = smtpConfig || {
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    };
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.smtpConfig.host && this.smtpConfig.auth?.user);
  }

  protected async doSend(message: NotificationMessage): Promise<{ messageId?: string }> {
    if (!this.smtpConfig.host) {
      throw new Error('SMTP host not configured');
    }

    // TODO: Implement actual email sending using nodemailer
    // For now, simulate sending
    console.log(`[Email] To: ${process.env.NOTIFICATION_EMAIL || 'admin@example.com'}`);
    console.log(`[Email] Subject: ${message.title}`);
    console.log(`[Email] Body: ${message.content.substring(0, 100)}...`);

    return { messageId: `email_${Date.now()}` };
  }
}

/**
 * Webhook Notification Adapter
 */
export class WebhookNotificationAdapter extends BaseNotificationAdapter {
  name = 'webhook';
  private webhookUrl: string | null = null;

  constructor(webhookUrl?: string) {
    super();
    this.webhookUrl = webhookUrl || process.env.WEBHOOK_URL || null;
  }

  async isAvailable(): Promise<boolean> {
    return !!this.webhookUrl;
  }

  protected async doSend(message: NotificationMessage): Promise<{ messageId?: string }> {
    if (!this.webhookUrl) {
      throw new Error('Webhook URL not configured');
    }

    // TODO: Implement actual webhook call using fetch or axios
    // For now, simulate sending
    console.log(`[Webhook] POST ${this.webhookUrl}`);
    console.log(`[Webhook] Payload:`, {
      title: message.title,
      content: message.content.substring(0, 100) + '...',
      priority: message.priority,
      timestamp: new Date().toISOString()
    });

    return { messageId: `webhook_${Date.now()}` };
  }
}

/**
 * Notification Manager for multi-channel support
 */
export class NotificationManager {
  private adapters: NotificationAdapter[] = [];
  private history: NotificationHistory = new NotificationHistory();

  constructor(adapters: NotificationAdapter[] = []) {
    this.adapters = adapters;
  }

  /**
   * Add a notification adapter
   */
  addAdapter(adapter: NotificationAdapter): void {
    this.adapters.push(adapter);
  }

  /**
   * Send notification through all available adapters
   */
  async send(message: NotificationMessage): Promise<NotificationResult[]> {
    const results: NotificationResult[] = [];

    for (const adapter of this.adapters) {
      try {
        const isAvailable = await adapter.isAvailable();
        if (!isAvailable) {
          const result = {
            success: false,
            channel: adapter.name,
            error: 'Adapter not available',
            timestamp: new Date()
          };
          results.push(result);
          this.history.record(result);
          continue;
        }

        const result = await adapter.send(message);
        results.push(result);
        this.history.record(result);

        // If send was successful, we can optionally stop here
        if (result.success && message.priority !== 'critical') {
          break;
        }
      } catch (error) {
        const result = {
          success: false,
          channel: adapter.name,
          error: error instanceof Error ? error.message : 'Adapter error',
          timestamp: new Date()
        };
        results.push(result);
        this.history.record(result);
      }
    }

    return results;
  }

  /**
   * Send critical notification through all adapters (no early stopping)
   */
  async sendCritical(message: NotificationMessage): Promise<NotificationResult[]> {
    const originalPriority = message.priority;
    message.priority = 'critical';

    const results = await Promise.all(
      this.adapters.map(async adapter => {
        try {
          const isAvailable = await adapter.isAvailable();
          if (!isAvailable) {
            return {
              success: false,
              channel: adapter.name,
              error: 'Adapter not available',
              timestamp: new Date()
            };
          }

          return await adapter.send(message);
        } catch (error) {
          return {
            success: false,
            channel: adapter.name,
            error: error instanceof Error ? error.message : 'Adapter error',
            timestamp: new Date()
          };
        }
      })
    );

    message.priority = originalPriority;
    return results;
  }

  /**
   * Get available adapters
   */
  async getAvailableAdapters(): Promise<string[]> {
    const available: string[] = [];

    for (const adapter of this.adapters) {
      if (await adapter.isAvailable()) {
        available.push(adapter.name);
      }
    }

    return available;
  }

  /**
   * Get notification history
   */
  getHistory(limit?: number): NotificationResult[] {
    return this.history.getHistory(limit);
  }

  /**
   * Get notification history by channel
   */
  getHistoryByChannel(channel: string, limit?: number): NotificationResult[] {
    return this.history.getHistoryByChannel(channel, limit);
  }

  /**
   * Get notification success rate
   */
  getSuccessRate(channel?: string): number {
    return this.history.getSuccessRate(channel);
  }

  /**
   * Clear notification history
   */
  clearHistory(): void {
    this.history.clear();
  }
}

// Default notification manager with common adapters
export const notificationManager = new NotificationManager([
  new TelegramNotificationAdapter(),
  new EmailNotificationAdapter(),
  new WebhookNotificationAdapter()
]);