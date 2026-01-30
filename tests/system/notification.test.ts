import {
  NotificationManager,
  NotificationTemplate,
  NotificationHistory,
  BaseNotificationAdapter,
  NotificationMessage
} from '../../src/system/notification';

describe('Notification Template', () => {
  it('should render template with variables', () => {
    const template = new NotificationTemplate('Hello {{name}}! Welcome to {{app}}.');
    template.setVariable('name', 'John');
    template.setVariable('app', 'Everyday News');

    expect(template.render()).toBe('Hello John! Welcome to Everyday News.');
  });

  it('should handle missing variables', () => {
    const template = new NotificationTemplate('Hello {{name}}!');
    // No variable set
    expect(template.render()).toBe('Hello {{name}}!');
  });

  it('should set multiple variables at once', () => {
    const template = new NotificationTemplate('{{greeting}} {{name}}');
    template.setVariables({
      greeting: 'Hello',
      name: 'World'
    });

    expect(template.render()).toBe('Hello World');
  });
});

describe('Notification History', () => {
  let history: NotificationHistory;

  beforeEach(() => {
    history = new NotificationHistory();
  });

  it('should record notification results', () => {
    const result = {
      success: true,
      channel: 'test',
      messageId: '123',
      timestamp: new Date()
    };

    history.record(result);

    const historyList = history.getHistory();
    expect(historyList).toHaveLength(1);
    expect(historyList[0]).toBe(result);
  });

  it('should get history by channel', () => {
    const result1 = { success: true, channel: 'email', timestamp: new Date() };
    const result2 = { success: false, channel: 'telegram', timestamp: new Date() };
    const result3 = { success: true, channel: 'email', timestamp: new Date() };

    history.record(result1);
    history.record(result2);
    history.record(result3);

    const emailHistory = history.getHistoryByChannel('email');
    expect(emailHistory).toHaveLength(2);
    expect(emailHistory[0].channel).toBe('email');

    const telegramHistory = history.getHistoryByChannel('telegram');
    expect(telegramHistory).toHaveLength(1);
    expect(telegramHistory[0].channel).toBe('telegram');
  });

  it('should calculate success rate', () => {
    // 2 successes, 1 failure for email
    history.record({ success: true, channel: 'email', timestamp: new Date() });
    history.record({ success: true, channel: 'email', timestamp: new Date() });
    history.record({ success: false, channel: 'email', timestamp: new Date() });

    // 1 success for telegram
    history.record({ success: true, channel: 'telegram', timestamp: new Date() });

    const emailSuccessRate = history.getSuccessRate('email');
    expect(emailSuccessRate).toBeCloseTo(66.666, 2);

    const overallSuccessRate = history.getSuccessRate();
    expect(overallSuccessRate).toBe(75); // 3 out of 4 successes

    const unknownChannelRate = history.getSuccessRate('unknown');
    expect(unknownChannelRate).toBe(100); // No results means 100%
  });

  it('should limit history results', () => {
    for (let i = 0; i < 15; i++) {
      history.record({ success: true, channel: 'test', timestamp: new Date() });
    }

    const limited = history.getHistory(5);
    expect(limited).toHaveLength(5);
  });
});

describe('Notification Manager', () => {
  // Mock adapter
  class MockAdapter extends BaseNotificationAdapter {
    name: string;
    private shouldSucceed: boolean;
    private isAvailableFlag: boolean;

    constructor(name: string = 'mock', shouldSucceed: boolean = true, isAvailableFlag: boolean = true) {
      super();
      this.name = name;
      this.shouldSucceed = shouldSucceed;
      this.isAvailableFlag = isAvailableFlag;
    }

    async isAvailable(): Promise<boolean> {
      return this.isAvailableFlag;
    }

    protected async doSend(message: NotificationMessage): Promise<{ messageId?: string }> {
      if (!this.shouldSucceed) {
        throw new Error('Mock send failure');
      }
      return { messageId: `${this.name}-123` };
    }
  }

  it('should send notification through available adapters', async () => {
    const adapter1 = new MockAdapter('mock', true, true);
    const adapter2 = new MockAdapter('mock', true, true);
    const manager = new NotificationManager([adapter1, adapter2]);

    const message: NotificationMessage = {
      title: 'Test',
      content: 'Test content'
    };

    const results = await manager.send(message);

    expect(results).toHaveLength(1); // First adapter succeeds, so it stops
    expect(results[0].success).toBe(true);
    expect(results[0].channel).toBe('mock');
  });

  it('should try next adapter if first fails', async () => {
    const adapter1 = new MockAdapter('mock', false, true); // Will fail
    const adapter2 = new MockAdapter('mock', true, true); // Will succeed
    const manager = new NotificationManager([adapter1, adapter2]);

    const message: NotificationMessage = {
      title: 'Test',
      content: 'Test content'
    };

    const results = await manager.send(message);

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[1].success).toBe(true);
  });

  it('should skip unavailable adapters', async () => {
    const adapter1 = new MockAdapter('mock', true, false); // Not available
    const adapter2 = new MockAdapter('mock', true, true); // Available
    const manager = new NotificationManager([adapter1, adapter2]);

    const results = await manager.send({ title: 'Test', content: 'Test' });

    expect(results).toHaveLength(2);
    expect(results[0].success).toBe(false);
    expect(results[0].error).toBe('Adapter not available');
    expect(results[1].success).toBe(true);
  });

  it('should send critical notifications through all adapters', async () => {
    const adapter1 = new MockAdapter('mock', true, true);
    const adapter2 = new MockAdapter('mock', true, true);
    const manager = new NotificationManager([adapter1, adapter2]);

    const message: NotificationMessage = {
      title: 'Critical',
      content: 'Critical content',
      priority: 'critical'
    };

    const results = await manager.sendCritical(message);

    expect(results).toHaveLength(2); // Both adapters should be used
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(true);
  });

  it('should track notification history', async () => {
    const adapter = new MockAdapter('mock', true, true);
    const manager = new NotificationManager([adapter]);

    await manager.send({ title: 'Test', content: 'Test' });
    await manager.send({ title: 'Test2', content: 'Test2' });

    const history = manager.getHistory();
    expect(history).toHaveLength(2);
    expect(history[0].success).toBe(true);
    expect(history[0].channel).toBe('mock');
    expect(history[1].success).toBe(true);
  });

  it('should get history by channel', async () => {
    const adapter1 = new MockAdapter('mock', true, true);
    const adapter2 = new MockAdapter('mock2', true, true);
    const manager = new NotificationManager([adapter1, adapter2]);

    await manager.send({ title: 'Test', content: 'Test' });
    await manager.sendCritical({ title: 'Critical', content: 'Critical' });

    const mockHistory = manager.getHistoryByChannel('mock');
    expect(mockHistory).toHaveLength(2); // Both sends go through adapter1

    const mock2History = manager.getHistoryByChannel('mock2');
    expect(mock2History).toHaveLength(1); // Only critical goes through adapter2
  });

  it('should calculate success rate', async () => {
    const adapter1 = new MockAdapter('mock', false, true); // Will fail
    const adapter2 = new MockAdapter('mock2', true, true); // Will succeed
    const manager = new NotificationManager([adapter1, adapter2]);

    await manager.send({ title: 'Test', content: 'Test' });

    const overallRate = manager.getSuccessRate();
    expect(overallRate).toBe(50); // One success, one failure

    const mock1Rate = manager.getSuccessRate('mock');
    expect(mock1Rate).toBe(0); // adapter1 failed

    const mock2Rate = manager.getSuccessRate('mock2');
    expect(mock2Rate).toBe(100); // adapter2 succeeded
  });

  it('should clear history', async () => {
    const adapter = new MockAdapter('mock', true, true);
    const manager = new NotificationManager([adapter]);

    await manager.send({ title: 'Test', content: 'Test' });
    expect(manager.getHistory()).toHaveLength(1);

    manager.clearHistory();
    expect(manager.getHistory()).toHaveLength(0);
  });
});