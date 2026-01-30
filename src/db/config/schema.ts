import fs from 'fs';
import path from 'path';
import { Database } from 'sqlite';
import { connectionManager } from './connection';

/**
 * 表结构定义
 */
export interface TableSchema {
  name: string;
  columns: ColumnDefinition[];
  indexes: IndexDefinition[];
  foreignKeys: ForeignKeyDefinition[];
}

export interface ColumnDefinition {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue?: string;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  unique?: boolean;
}

export interface IndexDefinition {
  name: string;
  table: string;
  columns: string[];
  unique?: boolean;
}

export interface ForeignKeyDefinition {
  name: string;
  table: string;
  columns: string[];
  referencedTable: string;
  referencedColumns: string[];
  onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
  onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT';
}

/**
 * 数据库Schema管理器
 */
export class DatabaseSchemaManager {
  private static instance: DatabaseSchemaManager;

  private constructor() {}

  /**
   * 获取Schema管理器实例
   */
  public static getInstance(): DatabaseSchemaManager {
    if (!DatabaseSchemaManager.instance) {
      DatabaseSchemaManager.instance = new DatabaseSchemaManager();
    }
    return DatabaseSchemaManager.instance;
  }

  /**
   * 初始化数据库Schema
   */
  public async initializeSchema(): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      // 读取初始Schema SQL文件
      const schemaPath = path.join(__dirname, '..', 'migrations', '001_initial_schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf-8');

      // 执行Schema创建
      await db.exec(schemaSql);

      console.log('Database schema initialized successfully');
    } catch (error) {
      console.error('Failed to initialize database schema:', error);
      throw error;
    } finally {
      await db.close();
    }
  }

  /**
   * 获取表结构
   */
  public async getTableSchema(tableName: string): Promise<TableSchema | null> {
    const db = await connectionManager.getConnection();

    try {
      // 检查表是否存在
      const tableExists = await db.get(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        tableName
      );

      if (!tableExists) {
        return null;
      }

      // 获取列信息
      const columns = await db.all(`PRAGMA table_info(${tableName})`);
      const columnDefinitions: ColumnDefinition[] = columns.map(col => ({
        name: col.name,
        type: col.type,
        nullable: col.notnull === 0,
        defaultValue: col.dflt_value,
        primaryKey: col.pk === 1,
        autoIncrement: col.pk === 1 && col.type.toUpperCase().includes('INTEGER'),
        unique: false // 需要从索引信息中获取
      }));

      // 获取索引信息
      const indexes = await db.all(`PRAGMA index_list(${tableName})`);
      const indexDefinitions: IndexDefinition[] = [];

      for (const index of indexes) {
        const indexColumns = await db.all(`PRAGMA index_info(${index.name})`);
        indexDefinitions.push({
          name: index.name,
          table: tableName,
          columns: indexColumns.map(col => col.name),
          unique: index.unique === 1
        });
      }

      // 获取外键信息
      const foreignKeys = await db.all(`PRAGMA foreign_key_list(${tableName})`);
      const foreignKeyDefinitions: ForeignKeyDefinition[] = foreignKeys.map(fk => ({
        name: `fk_${tableName}_${fk.from}_${fk.table}_${fk.to}`,
        table: tableName,
        columns: [fk.from],
        referencedTable: fk.table,
        referencedColumns: [fk.to],
        onDelete: fk.on_delete as 'CASCADE' | 'SET NULL' | 'RESTRICT' | undefined,
        onUpdate: fk.on_update as 'CASCADE' | 'SET NULL' | 'RESTRICT' | undefined
      }));

      return {
        name: tableName,
        columns: columnDefinitions,
        indexes: indexDefinitions,
        foreignKeys: foreignKeyDefinitions
      };
    } finally {
      await db.close();
    }
  }

  /**
   * 获取所有表名
   */
  public async getAllTableNames(): Promise<string[]> {
    const db = await connectionManager.getConnection();

    try {
      const tables = await db.all(
        `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
      );
      return tables.map(table => table.name);
    } finally {
      await db.close();
    }
  }

  /**
   * 验证Schema完整性
   */
  public async validateSchema(): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const expectedTables = ['platforms', 'news_items', 'daily_summaries', 'crawl_logs'];
      const existingTables = await this.getAllTableNames();

      // 检查必需的表是否存在
      for (const expectedTable of expectedTables) {
        if (!existingTables.includes(expectedTable)) {
          errors.push(`Missing required table: ${expectedTable}`);
        }
      }

      // 检查每个表的结构
      for (const tableName of existingTables) {
        const schema = await this.getTableSchema(tableName);
        if (!schema) {
          warnings.push(`Could not retrieve schema for table: ${tableName}`);
          continue;
        }

        // 检查是否有主键
        const hasPrimaryKey = schema.columns.some(col => col.primaryKey);
        if (!hasPrimaryKey) {
          warnings.push(`Table ${tableName} has no primary key`);
        }

        // 检查外键约束
        for (const fk of schema.foreignKeys) {
          const referencedTableExists = existingTables.includes(fk.referencedTable);
          if (!referencedTableExists) {
            errors.push(`Foreign key ${fk.name} references non-existent table: ${fk.referencedTable}`);
          }
        }
      }

      // 检查索引
      const db = await connectionManager.getConnection();
      try {
        // 检查news_items表的索引
        const newsItemsIndexes = await db.all(`PRAGMA index_list(news_items)`);
        const requiredIndexes = [
          'idx_news_items_platform_id',
          'idx_news_items_publish_time',
          'idx_news_items_category',
          'idx_news_items_is_investment_related',
          'idx_news_items_platform_date'
        ];

        const existingIndexNames = newsItemsIndexes.map(idx => idx.name);
        for (const requiredIndex of requiredIndexes) {
          if (!existingIndexNames.includes(requiredIndex)) {
            warnings.push(`Missing recommended index: ${requiredIndex} on news_items table`);
          }
        }
      } finally {
        await db.close();
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error) {
      return {
        isValid: false,
        errors: [`Schema validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        warnings: []
      };
    }
  }

  /**
   * 生成Schema文档
   */
  public async generateSchemaDocumentation(): Promise<string> {
    const tables = await this.getAllTableNames();
    const tableSchemas: TableSchema[] = [];

    for (const tableName of tables) {
      const schema = await this.getTableSchema(tableName);
      if (schema) {
        tableSchemas.push(schema);
      }
    }

    let documentation = '# 数据库Schema文档\n\n';
    documentation += `生成时间: ${new Date().toISOString()}\n\n`;

    for (const schema of tableSchemas) {
      documentation += `## 表: ${schema.name}\n\n`;

      // 列信息
      documentation += '### 列定义\n\n';
      documentation += '| 列名 | 类型 | 可空 | 默认值 | 主键 | 自增 | 唯一 |\n';
      documentation += '|------|------|------|--------|------|------|------|\n';

      for (const column of schema.columns) {
        documentation += `| ${column.name} | ${column.type} | ${column.nullable ? '是' : '否'} | ${column.defaultValue || '-'} | ${column.primaryKey ? '是' : '否'} | ${column.autoIncrement ? '是' : '否'} | ${column.unique ? '是' : '否'} |\n`;
      }

      documentation += '\n';

      // 索引信息
      if (schema.indexes.length > 0) {
        documentation += '### 索引\n\n';
        for (const index of schema.indexes) {
          documentation += `- **${index.name}**: ${index.columns.join(', ')} ${index.unique ? '(唯一)' : ''}\n`;
        }
        documentation += '\n';
      }

      // 外键信息
      if (schema.foreignKeys.length > 0) {
        documentation += '### 外键约束\n\n';
        for (const fk of schema.foreignKeys) {
          documentation += `- **${fk.name}**: ${fk.columns.join(', ')} → ${fk.referencedTable}.${fk.referencedColumns.join(', ')}`;
          if (fk.onDelete || fk.onUpdate) {
            documentation += ` (ON DELETE ${fk.onDelete || 'NO ACTION'}, ON UPDATE ${fk.onUpdate || 'NO ACTION'})`;
          }
          documentation += '\n';
        }
        documentation += '\n';
      }
    }

    return documentation;
  }

  /**
   * 导出Schema为SQL
   */
  public async exportSchemaToSQL(): Promise<string> {
    const tables = await this.getAllTableNames();
    let sql = '-- 数据库Schema导出\n';
    sql += `-- 导出时间: ${new Date().toISOString()}\n\n`;

    const db = await connectionManager.getConnection();

    try {
      for (const tableName of tables) {
        // 获取创建表的SQL
        const createTableResult = await db.get(
          `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`,
          tableName
        );

        if (createTableResult?.sql) {
          sql += `${createTableResult.sql};\n\n`;
        }

        // 获取创建索引的SQL
        const indexes = await db.all(
          `SELECT sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL`,
          tableName
        );

        for (const index of indexes) {
          if (index.sql) {
            sql += `${index.sql};\n`;
          }
        }

        if (indexes.length > 0) {
          sql += '\n';
        }
      }
    } finally {
      await db.close();
    }

    return sql;
  }
}

// 导出默认Schema管理器实例
export const schemaManager = DatabaseSchemaManager.getInstance();