import sqlite3 from 'sqlite3';
import { Database } from 'sqlite';
import { open } from 'sqlite';
import { configManager } from './index';
import { EnvLoader } from './env';

/**
 * 数据库连接状态
 */
export interface ConnectionStatus {
  isConnected: boolean;
  lastError: string | null;
  connectionCount: number;
  activeConnections: number;
  databaseSize: number;
  lastActivity: Date | null;
}

/**
 * 数据库连接管理器
 */
export class DatabaseConnectionManager {
  private static instance: DatabaseConnectionManager;
  private connections: Map<number, Database> = new Map();
  private nextConnectionId = 1;
  private status: ConnectionStatus = {
    isConnected: false,
    lastError: null,
    connectionCount: 0,
    activeConnections: 0,
    databaseSize: 0,
    lastActivity: null
  };

  private constructor() {
    // 初始化环境变量
    EnvLoader.initialize();
  }

  /**
   * 获取连接管理器实例
   */
  public static getInstance(): DatabaseConnectionManager {
    if (!DatabaseConnectionManager.instance) {
      DatabaseConnectionManager.instance = new DatabaseConnectionManager();
    }
    return DatabaseConnectionManager.instance;
  }

  /**
   * 获取数据库连接
   */
  public async getConnection(): Promise<Database> {
    try {
      const config = configManager.getConfig();

      const db = await open({
        filename: config.databasePath,
        driver: sqlite3.Database,
        mode: sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE
      });

      // 配置数据库参数
      await db.run('PRAGMA journal_mode = WAL');
      await db.run('PRAGMA synchronous = NORMAL');
      await db.run('PRAGMA foreign_keys = ON');
      await db.run('PRAGMA busy_timeout = 5000');

      const connectionId = this.nextConnectionId++;
      this.connections.set(connectionId, db);

      this.updateStatus({
        isConnected: true,
        connectionCount: this.connections.size,
        activeConnections: this.connections.size,
        lastActivity: new Date()
      });

      // 添加连接关闭时的清理逻辑
      const originalClose = db.close.bind(db);
      db.close = async () => {
        this.connections.delete(connectionId);
        this.updateStatus({
          activeConnections: this.connections.size
        });
        return originalClose();
      };

      return db;
    } catch (error) {
      this.updateStatus({
        isConnected: false,
        lastError: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * 获取只读连接
   */
  public async getReadOnlyConnection(): Promise<Database> {
    const config = configManager.getConfig();

    const db = await open({
      filename: config.databasePath,
      driver: sqlite3.Database,
      mode: sqlite3.OPEN_READONLY
    });

    const connectionId = this.nextConnectionId++;
    this.connections.set(connectionId, db);

    this.updateStatus({
      activeConnections: this.connections.size,
      lastActivity: new Date()
    });

    // 添加连接关闭时的清理逻辑
    const originalClose = db.close.bind(db);
    db.close = async () => {
      this.connections.delete(connectionId);
      this.updateStatus({
        activeConnections: this.connections.size
      });
      return originalClose();
    };

    return db;
  }

  /**
   * 执行事务
   */
  public async withTransaction<T>(
    operation: (db: Database) => Promise<T>
  ): Promise<T> {
    const db = await this.getConnection();

    try {
      await db.run('BEGIN TRANSACTION');
      const result = await operation(db);
      await db.run('COMMIT');
      return result;
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    } finally {
      await db.close();
    }
  }

  /**
   * 批量执行操作
   */
  public async batchOperations<T>(
    operations: Array<(db: Database) => Promise<T>>
  ): Promise<T[]> {
    const db = await this.getConnection();

    try {
      await db.run('BEGIN TRANSACTION');
      const results: T[] = [];

      for (const operation of operations) {
        const result = await operation(db);
        results.push(result);
      }

      await db.run('COMMIT');
      return results;
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    } finally {
      await db.close();
    }
  }

  /**
   * 关闭所有连接
   */
  public async closeAllConnections(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    for (const [id, db] of this.connections) {
      closePromises.push(db.close());
    }

    await Promise.all(closePromises);
    this.connections.clear();

    this.updateStatus({
      isConnected: false,
      activeConnections: 0,
      connectionCount: 0
    });
  }

  /**
   * 获取连接状态
   */
  public getStatus(): ConnectionStatus {
    return { ...this.status };
  }

  /**
   * 更新状态
   */
  private updateStatus(updates: Partial<ConnectionStatus>): void {
    this.status = { ...this.status, ...updates };

    // 更新数据库大小
    if (configManager.databaseExists()) {
      this.status.databaseSize = configManager.getDatabaseSize();
    }
  }

  /**
   * 检查数据库连接是否健康
   */
  public async healthCheck(): Promise<boolean> {
    try {
      const db = await this.getConnection();
      const result = await db.get('SELECT 1 as health_check');
      await db.close();

      this.updateStatus({
        isConnected: true,
        lastError: null,
        lastActivity: new Date()
      });

      return result?.health_check === 1;
    } catch (error) {
      this.updateStatus({
        isConnected: false,
        lastError: error instanceof Error ? error.message : 'Health check failed'
      });
      return false;
    }
  }

  /**
   * 获取数据库统计信息
   */
  public async getDatabaseStats(): Promise<{
    tableCount: number;
    totalRows: number;
    databaseSize: number;
  }> {
    const db = await this.getReadOnlyConnection();

    try {
      // 获取表数量
      const tablesResult = await db.all(`
        SELECT COUNT(*) as count
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      `);

      // 获取总行数
      const tables = await db.all(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      `);

      let totalRows = 0;
      for (const table of tables) {
        const countResult = await db.get(`SELECT COUNT(*) as count FROM ${table.name}`);
        totalRows += countResult?.count || 0;
      }

      return {
        tableCount: tablesResult[0]?.count || 0,
        totalRows,
        databaseSize: configManager.getDatabaseSize()
      };
    } finally {
      await db.close();
    }
  }
}

// 导出默认连接管理器实例
export const connectionManager = DatabaseConnectionManager.getInstance();