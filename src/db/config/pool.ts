import { Database } from 'sqlite';
import { connectionManager } from './connection';

/**
 * 连接池配置
 */
export interface ConnectionPoolConfig {
  minConnections: number;
  maxConnections: number;
  idleTimeout: number; // 毫秒
  acquireTimeout: number; // 毫秒
  testOnBorrow: boolean;
}

/**
 * 连接池状态
 */
export interface PoolStatus {
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingRequests: number;
  lastActivity: Date | null;
}

/**
 * 连接池中的连接
 */
interface PooledConnection {
  connection: Database;
  lastUsed: Date;
  isIdle: boolean;
}

/**
 * 等待请求
 */
interface WaitingRequest {
  resolve: (connection: Database) => void;
  reject: (error: Error) => void;
  timeoutId: NodeJS.Timeout;
}

/**
 * 数据库连接池管理器
 */
export class ConnectionPoolManager {
  private static instance: ConnectionPoolManager;
  private pool: PooledConnection[] = [];
  private waitingRequests: WaitingRequest[] = [];
  private config: ConnectionPoolConfig;
  private status: PoolStatus = {
    totalConnections: 0,
    activeConnections: 0,
    idleConnections: 0,
    waitingRequests: 0,
    lastActivity: null
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {
    this.config = {
      minConnections: parseInt(process.env.MIN_CONNECTIONS || '2'),
      maxConnections: parseInt(process.env.MAX_CONNECTIONS || '10'),
      idleTimeout: parseInt(process.env.IDLE_TIMEOUT || '30000'), // 30秒
      acquireTimeout: parseInt(process.env.ACQUIRE_TIMEOUT || '10000'), // 10秒
      testOnBorrow: process.env.TEST_ON_BORROW === 'true'
    };

    this.startCleanupInterval();
  }

  /**
   * 获取连接池管理器实例
   */
  public static getInstance(): ConnectionPoolConfig {
    if (!ConnectionPoolManager.instance) {
      ConnectionPoolManager.instance = new ConnectionPoolManager();
    }
    return ConnectionPoolManager.instance;
  }

  /**
   * 启动清理间隔
   */
  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleConnections();
    }, 60000); // 每分钟清理一次
  }

  /**
   * 清理空闲连接
   */
  private async cleanupIdleConnections(): Promise<void> {
    const now = new Date();
    const idleConnections = this.pool.filter(conn => conn.isIdle);

    for (const conn of idleConnections) {
      const idleTime = now.getTime() - conn.lastUsed.getTime();
      if (idleTime > this.config.idleTimeout) {
        // 关闭空闲时间过长的连接
        await this.closeConnection(conn.connection);
        this.pool = this.pool.filter(p => p.connection !== conn.connection);
      }
    }

    this.updateStatus();
  }

  /**
   * 关闭连接
   */
  private async closeConnection(connection: Database): Promise<void> {
    try {
      await connection.close();
    } catch (error) {
      console.error('Error closing connection:', error);
    }
  }

  /**
   * 获取连接
   */
  public async getConnection(): Promise<Database> {
    this.updateStatus({ lastActivity: new Date() });

    // 查找空闲连接
    const idleConnection = this.pool.find(conn => conn.isIdle);
    if (idleConnection) {
      idleConnection.isIdle = false;
      idleConnection.lastUsed = new Date();

      if (this.config.testOnBorrow) {
        try {
          await this.testConnection(idleConnection.connection);
        } catch (error) {
          // 连接测试失败，从池中移除并创建新连接
          this.pool = this.pool.filter(p => p.connection !== idleConnection.connection);
          await this.closeConnection(idleConnection.connection);
          return this.createNewConnection();
        }
      }

      this.updateStatus({
        activeConnections: this.pool.filter(c => !c.isIdle).length,
        idleConnections: this.pool.filter(c => c.isIdle).length
      });

      return idleConnection.connection;
    }

    // 检查是否达到最大连接数
    if (this.pool.length < this.config.maxConnections) {
      return this.createNewConnection();
    }

    // 等待可用连接
    return new Promise<Database>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.waitingRequests = this.waitingRequests.filter(req => req.timeoutId !== timeoutId);
        reject(new Error('Connection acquisition timeout'));
      }, this.config.acquireTimeout);

      const request: WaitingRequest = {
        resolve,
        reject,
        timeoutId
      };

      this.waitingRequests.push(request);
      this.updateStatus({ waitingRequests: this.waitingRequests.length });
    });
  }

  /**
   * 创建新连接
   */
  private async createNewConnection(): Promise<Database> {
    try {
      const connection = await connectionManager.getConnection();
      const pooledConnection: PooledConnection = {
        connection,
        lastUsed: new Date(),
        isIdle: false
      };

      this.pool.push(pooledConnection);
      this.updateStatus({
        totalConnections: this.pool.length,
        activeConnections: this.pool.filter(c => !c.isIdle).length
      });

      return connection;
    } catch (error) {
      throw new Error(`Failed to create connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 测试连接
   */
  private async testConnection(connection: Database): Promise<void> {
    try {
      const result = await connection.get('SELECT 1 as test');
      if (!result || result.test !== 1) {
        throw new Error('Connection test failed');
      }
    } catch (error) {
      throw new Error(`Connection test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * 释放连接回连接池
   */
  public releaseConnection(connection: Database): void {
    const pooledConnection = this.pool.find(conn => conn.connection === connection);
    if (pooledConnection) {
      pooledConnection.isIdle = true;
      pooledConnection.lastUsed = new Date();

      // 检查是否有等待的请求
      if (this.waitingRequests.length > 0) {
        const request = this.waitingRequests.shift();
        if (request) {
          clearTimeout(request.timeoutId);
          pooledConnection.isIdle = false;
          request.resolve(connection);
        }
      }

      this.updateStatus({
        activeConnections: this.pool.filter(c => !c.isIdle).length,
        idleConnections: this.pool.filter(c => c.isIdle).length,
        waitingRequests: this.waitingRequests.length
      });
    }
  }

  /**
   * 更新状态
   */
  private updateStatus(updates: Partial<PoolStatus> = {}): void {
    this.status = {
      ...this.status,
      ...updates
    };
  }

  /**
   * 获取连接池状态
   */
  public getStatus(): PoolStatus {
    return { ...this.status };
  }

  /**
   * 获取配置
   */
  public getConfig(): ConnectionPoolConfig {
    return { ...this.config };
  }

  /**
   * 更新配置
   */
  public updateConfig(newConfig: Partial<ConnectionPoolConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 关闭连接池
   */
  public async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    // 清理等待的请求
    for (const request of this.waitingRequests) {
      clearTimeout(request.timeoutId);
      request.reject(new Error('Connection pool is closing'));
    }
    this.waitingRequests = [];

    // 关闭所有连接
    const closePromises = this.pool.map(conn => this.closeConnection(conn.connection));
    await Promise.all(closePromises);
    this.pool = [];

    this.updateStatus({
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingRequests: 0
    });
  }

  /**
   * 执行带连接池的操作
   */
  public async withConnection<T>(operation: (connection: Database) => Promise<T>): Promise<T> {
    const connection = await this.getConnection();

    try {
      const result = await operation(connection);
      return result;
    } finally {
      this.releaseConnection(connection);
    }
  }

  /**
   * 执行事务（使用连接池）
   */
  public async withTransaction<T>(operation: (connection: Database) => Promise<T>): Promise<T> {
    return this.withConnection(async (connection) => {
      try {
        await connection.run('BEGIN TRANSACTION');
        const result = await operation(connection);
        await connection.run('COMMIT');
        return result;
      } catch (error) {
        await connection.run('ROLLBACK');
        throw error;
      }
    });
  }
}

// 导出默认连接池管理器实例
export const poolManager = ConnectionPoolManager.getInstance();