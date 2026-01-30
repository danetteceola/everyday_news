import { ConfigManager, SystemConfig } from '../../src/system/config';

describe('ConfigManager', () => {
  let configManager: ConfigManager;

  beforeEach(() => {
    // Clear environment variables before each test
    delete process.env.NODE_ENV;
    delete process.env.LOG_LEVEL;
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    delete process.env.SMTP_USER;
    delete process.env.LLM_MODEL;
    delete process.env.LLM_TEMPERATURE;
    delete process.env.LLM_API_KEY;

    configManager = new ConfigManager();
  });

  describe('default configuration', () => {
    it('should load default configuration', () => {
      const config = configManager.getConfig();

      expect(config.environment).toBe('development');
      expect(config.logLevel).toBe('info');
      expect(config.scheduler.maxConcurrentTasks).toBe(5);
      expect(config.scheduler.tasks).toHaveLength(3);
      expect(config.notification.telegram?.enabled).toBe(false);
      expect(config.monitoring.collectionInterval).toBe(60000);
      expect(config.llm.defaultModel).toBe('claude-3-5-sonnet-20241022');
    });
  });

  describe('environment variable overrides', () => {
    it('should override environment', () => {
      process.env.NODE_ENV = 'production';
      configManager = new ConfigManager();

      const config = configManager.getConfig();
      expect(config.environment).toBe('production');
    });

    it('should override log level', () => {
      process.env.LOG_LEVEL = 'debug';
      configManager = new ConfigManager();

      const config = configManager.getConfig();
      expect(config.logLevel).toBe('debug');
      expect(config.scheduler.logLevel).toBe('debug');
    });

    it('should override telegram configuration', () => {
      process.env.TELEGRAM_BOT_TOKEN = 'test_token';
      process.env.TELEGRAM_CHAT_ID = 'test_chat_id';
      configManager = new ConfigManager();

      const config = configManager.getConfig();
      expect(config.notification.telegram?.botToken).toBe('test_token');
      expect(config.notification.telegram?.chatId).toBe('test_chat_id');
    });

    it('should override email configuration', () => {
      process.env.SMTP_HOST = 'smtp.example.com';
      process.env.SMTP_PORT = '465';
      process.env.SMTP_USER = 'user@example.com';
      configManager = new ConfigManager();

      const config = configManager.getConfig();
      expect(config.notification.email?.smtpHost).toBe('smtp.example.com');
      expect(config.notification.email?.smtpPort).toBe(465);
      expect(config.notification.email?.smtpUser).toBe('user@example.com');
    });

    it('should override LLM configuration', () => {
      process.env.LLM_MODEL = 'claude-test';
      process.env.LLM_TEMPERATURE = '0.5';
      process.env.LLM_API_KEY = 'test-key';
      configManager = new ConfigManager();

      const config = configManager.getConfig();
      expect(config.llm.defaultModel).toBe('claude-test');
      expect(config.llm.defaultTemperature).toBe(0.5);
      expect(config.llm.apiKey).toBe('test-key');
    });
  });

  describe('configuration updates', () => {
    it('should update configuration', () => {
      const updates: Partial<SystemConfig> = {
        environment: 'staging',
        logLevel: 'warn'
      };

      configManager.updateConfig(updates);
      const config = configManager.getConfig();

      expect(config.environment).toBe('staging');
      expect(config.logLevel).toBe('warn');
    });

    it('should merge updates with existing configuration', () => {
      const updates = { environment: 'production' };
      configManager.updateConfig(updates);

      const config = configManager.getConfig();
      expect(config.environment).toBe('production');
      expect(config.logLevel).toBe('info'); // Still default
    });
  });

  describe('configuration validation', () => {
    it('should validate correct configuration', () => {
      const errors = configManager.validate();
      expect(errors).toHaveLength(0);
    });

    it('should detect missing required fields in scheduler tasks', () => {
      // Create a config with invalid task
      const invalidConfig: Partial<SystemConfig> = {
        scheduler: {
          ...configManager.getConfig().scheduler,
          tasks: [
            { id: '', name: '', cronExpression: '', command: '', enabled: true }
          ]
        }
      };

      configManager.updateConfig(invalidConfig);
      const errors = configManager.validate();
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0]).toContain('missing required fields');
    });

    it('should validate Telegram configuration when enabled', () => {
      const updates: Partial<SystemConfig> = {
        notification: {
          ...configManager.getConfig().notification,
          telegram: {
            botToken: '',
            chatId: '',
            enabled: true
          }
        }
      };

      configManager.updateConfig(updates);
      const errors = configManager.validate();
      expect(errors).toContain('Telegram bot token is required');
      expect(errors).toContain('Telegram chat ID is required');
    });

    it('should validate email configuration when enabled', () => {
      const updates: Partial<SystemConfig> = {
        notification: {
          ...configManager.getConfig().notification,
          email: {
            smtpHost: '',
            smtpPort: 587,
            smtpSecure: false,
            smtpUser: '',
            smtpPass: '',
            recipient: 'test@example.com',
            enabled: true
          }
        }
      };

      configManager.updateConfig(updates);
      const errors = configManager.validate();
      expect(errors).toContain('SMTP host is required');
      expect(errors).toContain('SMTP user is required');
    });

    it('should validate LLM temperature range', () => {
      const updates: Partial<SystemConfig> = {
        llm: {
          ...configManager.getConfig().llm,
          defaultTemperature: 1.5 // Invalid
        }
      };

      configManager.updateConfig(updates);
      const errors = configManager.validate();
      expect(errors).toContain('LLM temperature must be between 0 and 1');
    });
  });

  describe('configuration sections', () => {
    it('should get scheduler configuration', () => {
      const schedulerConfig = configManager.getSchedulerConfig();
      expect(schedulerConfig.maxConcurrentTasks).toBe(5);
      expect(schedulerConfig.tasks).toHaveLength(3);
    });

    it('should get notification configuration', () => {
      const notificationConfig = configManager.getNotificationConfig();
      expect(notificationConfig.telegram).toBeDefined();
      expect(notificationConfig.email).toBeDefined();
      expect(notificationConfig.webhook).toBeDefined();
    });

    it('should get monitoring configuration', () => {
      const monitoringConfig = configManager.getMonitoringConfig();
      expect(monitoringConfig.collectionInterval).toBe(60000);
      expect(monitoringConfig.alertThresholds.collectionSuccessRate).toBe(80);
    });

    it('should get LLM configuration', () => {
      const llmConfig = configManager.getLLMConfig();
      expect(llmConfig.defaultModel).toBe('claude-3-5-sonnet-20241022');
      expect(llmConfig.defaultTemperature).toBe(0.7);
    });
  });
});