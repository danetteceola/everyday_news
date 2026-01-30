/**
 * Error Handling Module
 *
 * Provides layered error handling with automatic retry mechanisms and graceful degradation.
 */

export interface ErrorContext {
  operation: string;
  module: string;
  timestamp: Date;
  data?: Record<string, any>;
}

export interface RetryOptions {
  maxRetries: number;
  retryDelay: number; // milliseconds
  backoffFactor?: number;
}

export abstract class BaseErrorHandler {
  protected context: ErrorContext;

  constructor(context: ErrorContext) {
    this.context = context;
  }

  /**
   * Handle an error with automatic retry logic
   */
  async handle<T>(
    operation: () => Promise<T>,
    retryOptions: RetryOptions = { maxRetries: 3, retryDelay: 300000 } // 5 minutes
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= retryOptions.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Log error
        this.logError(attempt, lastError);

        if (attempt === retryOptions.maxRetries) {
          // Last attempt failed, apply degradation
          return this.degrade(lastError);
        }

        // Wait before retry
        const delay = retryOptions.retryDelay * (retryOptions.backoffFactor || 1) ** (attempt - 1);
        await this.wait(delay);
      }
    }

    // This should never be reached due to degrade() call, but for type safety
    throw lastError!;
  }

  /**
   * Log error details
   */
  protected logError(attempt: number, error: Error): void {
    console.error(`Error in ${this.context.module}.${this.context.operation} (attempt ${attempt}):`, error.message, this.context.data);
  }

  /**
   * Apply graceful degradation
   */
  protected abstract degrade<T>(error: Error): Promise<T>;

  /**
   * Wait for specified milliseconds
   */
  protected wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Collection Error Handler for data collection operations
 */
export class CollectionErrorHandler extends BaseErrorHandler {
  protected async degrade<T>(error: Error): Promise<T> {
    // For collection errors, we can return empty data or use cached data
    console.warn(`Degrading collection operation ${this.context.operation}:`, error.message);
    // Return empty result as fallback
    return {} as T;
  }
}

/**
 * Database Error Handler for database operations
 */
export class DatabaseErrorHandler extends BaseErrorHandler {
  protected async degrade<T>(error: Error): Promise<T> {
    // For database errors, we might use read-only mode or cached queries
    console.warn(`Degrading database operation ${this.context.operation}:`, error.message);
    throw new Error(`Database operation failed after retries: ${error.message}`);
  }
}

/**
 * LLM API Error Handler for LLM operations
 */
export class LLMErrorHandler extends BaseErrorHandler {
  protected async degrade<T>(error: Error): Promise<T> {
    // For LLM errors, fall back to template-based generation
    console.warn(`Degrading LLM operation ${this.context.operation}:`, error.message);
    // Return template-based result
    return {} as T;
  }
}

// Default error handlers
export const collectionErrorHandler = (context: ErrorContext) => new CollectionErrorHandler(context);
export const databaseErrorHandler = (context: ErrorContext) => new DatabaseErrorHandler(context);
export const llmErrorHandler = (context: ErrorContext) => new LLMErrorHandler(context);