import { ClaudeIntegration, LLMRequest, LLMResponse, PromptTemplate } from '../../src/system/claude-integration';

// Mock child_process exec
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

import { exec } from 'child_process';

describe('ClaudeIntegration', () => {
  let integration: ClaudeIntegration;
  const mockExec = exec as jest.MockedFunction<typeof exec>;

  beforeEach(() => {
    integration = new ClaudeIntegration();
    mockExec.mockReset();
  });

  describe('execute', () => {
    it('should execute LLM request with cache', async () => {
      const request: LLMRequest = {
        prompt: 'Test prompt',
        model: 'claude-test'
      };

      // Mock successful exec call
      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'Mock response content', '');
        }
        return {} as any;
      });

      const response = await integration.execute(request);
      expect(response.content).toBe('Mock response content');
      expect(response.model).toBe('claude-test');
      expect(response.timestamp).toBeInstanceOf(Date);

      // Second call should hit cache (if cache enabled)
      const response2 = await integration.execute(request);
      expect(response2).toBe(response); // Same object from cache
    });

    it('should retry on failure', async () => {
      const request: LLMRequest = { prompt: 'Test' };
      let callCount = 0;

      mockExec.mockImplementation((command, options, callback) => {
        callCount++;
        if (callCount < 3) {
          if (typeof callback === 'function') {
            callback(new Error('Temporary failure'), '', '');
          }
        } else {
          if (typeof callback === 'function') {
            callback(null, 'Success response', '');
          }
        }
        return {} as any;
      });

      const response = await integration.execute(request);
      expect(response.content).toBe('Success response');
      expect(callCount).toBe(3); // Initial + 2 retries
    });

    it('should degrade after max retries', async () => {
      const request: LLMRequest = { prompt: 'Test' };
      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(new Error('Permanent failure'), '', '');
        }
        return {} as any;
      });

      await expect(integration.execute(request)).rejects.toThrow('LLM call failed after');
    });
  });

  describe('prompt templates', () => {
    it('should register and execute template', async () => {
      const template: PromptTemplate = {
        id: 'test-template',
        name: 'Test Template',
        systemPrompt: 'You are a test assistant.',
        userPromptTemplate: 'Hello {{name}}!',
        variables: ['name']
      };

      integration.registerTemplate(template);

      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'Mock response', '');
        }
        return {} as any;
      });

      const response = await integration.executeTemplate('test-template', { name: 'World' });
      expect(response.content).toBe('Mock response');

      // Verify the template was used
      expect(mockExec).toHaveBeenCalled();
      const command = mockExec.mock.calls[0][0];
      expect(command).toContain('Hello World!');
    });

    it('should throw error for missing template', async () => {
      await expect(integration.executeTemplate('nonexistent', {}))
        .rejects
        .toThrow('Prompt template not found');
    });

    it('should throw error for missing variables', async () => {
      const template: PromptTemplate = {
        id: 'test',
        name: 'Test',
        systemPrompt: '',
        userPromptTemplate: 'Hello {{name}}',
        variables: ['name']
      };

      integration.registerTemplate(template);

      await expect(integration.executeTemplate('test', {}))
        .rejects
        .toThrow('Missing required variable');
    });
  });

  describe('usage tracking', () => {
    it('should record usage statistics', async () => {
      const request: LLMRequest = { prompt: 'Test' };
      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'Response', '');
        }
        return {} as any;
      });

      await integration.execute(request);

      const usageStats = integration.getUsageStats();
      expect(usageStats).toHaveLength(1);
      expect(usageStats[0].model).toBeDefined();
      expect(usageStats[0].promptTokens).toBeGreaterThan(0);
      expect(usageStats[0].completionTokens).toBeGreaterThan(0);
      expect(usageStats[0].totalTokens).toBeGreaterThan(0);
      expect(usageStats[0].timestamp).toBeInstanceOf(Date);
    });

    it('should clear usage statistics', async () => {
      const request: LLMRequest = { prompt: 'Test' };
      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'Response', '');
        }
        return {} as any;
      });

      await integration.execute(request);
      expect(integration.getUsageStats()).toHaveLength(1);

      integration.clearUsageStats();
      expect(integration.getUsageStats()).toHaveLength(0);
    });
  });

  describe('cache management', () => {
    it('should clear cache', async () => {
      const request: LLMRequest = { prompt: 'Test' };
      mockExec.mockImplementation((command, options, callback) => {
        if (typeof callback === 'function') {
          callback(null, 'Response', '');
        }
        return {} as any;
      });

      await integration.execute(request);
      // No direct cache inspection, but ensure method exists and doesn't throw
      expect(() => integration.clearCache()).not.toThrow();
    });
  });
});

describe('DailySummaryIntegration', () => {
  it('should generate daily summary', async () => {
    // This test would require mocking the underlying ClaudeIntegration
    // For now, just verify the class can be instantiated
    const { DailySummaryIntegration } = require('../../src/system/claude-integration');
    const dailySummary = new DailySummaryIntegration();
    expect(dailySummary).toBeDefined();
  });
});