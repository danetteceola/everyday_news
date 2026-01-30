import {
  BaseErrorHandler,
  CollectionErrorHandler,
  DatabaseErrorHandler,
  LLMErrorHandler,
  ErrorContext
} from '../../src/system/error-handling';

describe('Error Handling', () => {
  const mockContext: ErrorContext = {
    operation: 'testOperation',
    module: 'testModule',
    timestamp: new Date()
  };

  describe('BaseErrorHandler', () => {
    class TestErrorHandler extends BaseErrorHandler {
      protected async degrade<T>(error: Error): Promise<T> {
        // Return a default value for testing
        return 'degraded' as T;
      }
    }

    let handler: TestErrorHandler;

    beforeEach(() => {
      handler = new TestErrorHandler(mockContext);
    });

    it('should retry on failure', async () => {
      let attempt = 0;
      const operation = jest.fn().mockImplementation(() => {
        attempt++;
        if (attempt < 3) {
          throw new Error('Temporary failure');
        }
        return 'success';
      });

      const result = await handler.handle(operation, {
        maxRetries: 3,
        retryDelay: 10 // Short delay for tests
      });

      expect(result).toBe('success');
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should degrade after max retries', async () => {
      const operation = jest.fn().mockRejectedValue(new Error('Permanent failure'));

      const result = await handler.handle(operation, {
        maxRetries: 2,
        retryDelay: 10
      });

      expect(result).toBe('degraded');
      expect(operation).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should respect backoff factor', async () => {
      const startTime = Date.now();
      const callTimes: number[] = [];

      const operation = jest.fn().mockImplementation(() => {
        callTimes.push(Date.now());
        throw new Error('Failure');
      });

      try {
        await handler.handle(operation, {
          maxRetries: 3,
          retryDelay: 100,
          backoffFactor: 2
        });
      } catch {
        // Expected to degrade
      }

      expect(callTimes).toHaveLength(4); // Initial + 3 retries
      // Check delays (approximate)
      const delay1 = callTimes[1] - callTimes[0];
      const delay2 = callTimes[2] - callTimes[1];
      const delay3 = callTimes[3] - callTimes[2];

      // Allow for some timing variance
      expect(delay1).toBeGreaterThanOrEqual(90);
      expect(delay2).toBeGreaterThanOrEqual(190); // 100 * 2
      expect(delay3).toBeGreaterThanOrEqual(390); // 200 * 2
    });
  });

  describe('CollectionErrorHandler', () => {
    let handler: CollectionErrorHandler;

    beforeEach(() => {
      handler = new CollectionErrorHandler(mockContext);
    });

    it('should degrade with empty result', async () => {
      const degraded = await handler.degrade(new Error('Collection failed'));
      expect(degraded).toEqual({});
    });
  });

  describe('DatabaseErrorHandler', () => {
    let handler: DatabaseErrorHandler;

    beforeEach(() => {
      handler = new DatabaseErrorHandler(mockContext);
    });

    it('should throw error on degradation', async () => {
      await expect(handler.degrade(new Error('DB failed')))
        .rejects
        .toThrow('Database operation failed after retries: DB failed');
    });
  });

  describe('LLMErrorHandler', () => {
    let handler: LLMErrorHandler;

    beforeEach(() => {
      handler = new LLMErrorHandler(mockContext);
    });

    it('should degrade with empty result', async () => {
      const degraded = await handler.degrade(new Error('LLM failed'));
      expect(degraded).toEqual({});
    });
  });

  describe('Default error handlers', () => {
    it('should create collection error handler', () => {
      const handler = new CollectionErrorHandler(mockContext);
      expect(handler).toBeInstanceOf(CollectionErrorHandler);
    });

    it('should create database error handler', () => {
      const handler = new DatabaseErrorHandler(mockContext);
      expect(handler).toBeInstanceOf(DatabaseErrorHandler);
    });

    it('should create LLM error handler', () => {
      const handler = new LLMErrorHandler(mockContext);
      expect(handler).toBeInstanceOf(LLMErrorHandler);
    });
  });
});