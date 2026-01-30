/**
 * 数据迁移工具
 * 提供数据转换和迁移功能
 */

import { Database } from 'sqlite';
import { connectionManager } from '../config/connection';

/**
 * 数据迁移选项
 */
export interface DataMigrationOptions {
  batchSize?: number;
  logProgress?: boolean;
  dryRun?: boolean;
}

/**
 * 数据迁移结果
 */
export interface DataMigrationResult {
  totalProcessed: number;
  totalSucceeded: number;
  totalFailed: number;
  errors: Array<{
    recordId?: any;
    error: string;
  }>;
  executionTime: number;
}

/**
 * 数据迁移工具
 */
export class DataMigrator {
  private db: Database | null = null;

  /**
   * 初始化数据库连接
   */
  private async getConnection(): Promise<Database> {
    if (!this.db) {
      this.db = await connectionManager.getConnection();
    }
    return this.db;
  }

  /**
   * 关闭数据库连接
   */
  public async close(): Promise<void> {
    if (this.db) {
      await this.db.close();
      this.db = null;
    }
  }

  /**
   * 执行数据迁移
   */
  public async migrateData(
    sourceTable: string,
    targetTable: string,
    fieldMappings: Record<string, string>,
    options: DataMigrationOptions = {}
  ): Promise<DataMigrationResult> {
    const db = await this.getConnection();
    const startTime = Date.now();

    const {
      batchSize = 100,
      logProgress = true,
      dryRun = false
    } = options;

    const result: DataMigrationResult = {
      totalProcessed: 0,
      totalSucceeded: 0,
      totalFailed: 0,
      errors: [],
      executionTime: 0
    };

    try {
      // 获取源数据总数
      const countResult = await db.get(`SELECT COUNT(*) as count FROM ${sourceTable}`);
      const totalRecords = countResult?.count || 0;

      if (logProgress) {
        console.log(`开始迁移数据: ${sourceTable} -> ${targetTable}`);
        console.log(`总记录数: ${totalRecords}`);
        console.log(`批量大小: ${batchSize}`);
        console.log(`干运行模式: ${dryRun ? '是' : '否'}`);
      }

      // 构建字段映射
      const sourceFields = Object.keys(fieldMappings);
      const targetFields = Object.values(fieldMappings);

      if (sourceFields.length === 0) {
        throw new Error('字段映射不能为空');
      }

      // 分页迁移数据
      let offset = 0;
      let processed = 0;

      while (offset < totalRecords) {
        // 查询源数据
        const sourceData = await db.all(
          `SELECT * FROM ${sourceTable} LIMIT ? OFFSET ?`,
          batchSize,
          offset
        );

        if (sourceData.length === 0) {
          break;
        }

        // 处理每个记录
        for (const record of sourceData) {
          result.totalProcessed++;

          try {
            if (!dryRun) {
              // 构建插入语句
              const placeholders = targetFields.map(() => '?').join(', ');
              const values = sourceFields.map(field => record[field]);

              await db.run(
                `INSERT INTO ${targetTable} (${targetFields.join(', ')}) VALUES (${placeholders})`,
                ...values
              );
            }

            result.totalSucceeded++;
          } catch (error) {
            result.totalFailed++;
            result.errors.push({
              recordId: record.id,
              error: error instanceof Error ? error.message : '未知错误'
            });

            if (logProgress) {
              console.warn(`记录迁移失败 (ID: ${record.id}):`, error);
            }
          }
        }

        processed += sourceData.length;
        offset += batchSize;

        if (logProgress) {
          const progress = Math.round((processed / totalRecords) * 100);
          console.log(`进度: ${processed}/${totalRecords} (${progress}%)`);
        }
      }

      result.executionTime = Date.now() - startTime;

      if (logProgress) {
        console.log(`数据迁移完成`);
        console.log(`处理记录: ${result.totalProcessed}`);
        console.log(`成功: ${result.totalSucceeded}`);
        console.log(`失败: ${result.totalFailed}`);
        console.log(`执行时间: ${result.executionTime}ms`);
      }

      return result;
    } catch (error) {
      result.executionTime = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * 转换数据格式
   */
  public async transformData(
    table: string,
    transformFunction: (record: any) => Promise<any>,
    options: DataMigrationOptions = {}
  ): Promise<DataMigrationResult> {
    const db = await this.getConnection();
    const startTime = Date.now();

    const {
      batchSize = 100,
      logProgress = true,
      dryRun = false
    } = options;

    const result: DataMigrationResult = {
      totalProcessed: 0,
      totalSucceeded: 0,
      totalFailed: 0,
      errors: [],
      executionTime: 0
    };

    try {
      // 获取数据总数
      const countResult = await db.get(`SELECT COUNT(*) as count FROM ${table}`);
      const totalRecords = countResult?.count || 0;

      if (logProgress) {
        console.log(`开始转换数据: ${table}`);
        console.log(`总记录数: ${totalRecords}`);
        console.log(`批量大小: ${batchSize}`);
        console.log(`干运行模式: ${dryRun ? '是' : '否'}`);
      }

      // 分页处理数据
      let offset = 0;
      let processed = 0;

      while (offset < totalRecords) {
        // 查询数据
        const records = await db.all(
          `SELECT * FROM ${table} LIMIT ? OFFSET ?`,
          batchSize,
          offset
        );

        if (records.length === 0) {
          break;
        }

        // 处理每个记录
        for (const record of records) {
          result.totalProcessed++;

          try {
            const transformed = await transformFunction(record);

            if (!dryRun && transformed) {
              // 构建更新语句
              const updates = Object.keys(transformed)
                .filter(key => key !== 'id')
                .map(key => `${key} = ?`)
                .join(', ');

              const values = Object.keys(transformed)
                .filter(key => key !== 'id')
                .map(key => transformed[key]);

              values.push(record.id); // WHERE条件

              if (updates) {
                await db.run(
                  `UPDATE ${table} SET ${updates} WHERE id = ?`,
                  ...values
                );
              }
            }

            result.totalSucceeded++;
          } catch (error) {
            result.totalFailed++;
            result.errors.push({
              recordId: record.id,
              error: error instanceof Error ? error.message : '未知错误'
            });

            if (logProgress) {
              console.warn(`记录转换失败 (ID: ${record.id}):`, error);
            }
          }
        }

        processed += records.length;
        offset += batchSize;

        if (logProgress) {
          const progress = Math.round((processed / totalRecords) * 100);
          console.log(`进度: ${processed}/${totalRecords} (${progress}%)`);
        }
      }

      result.executionTime = Date.now() - startTime;

      if (logProgress) {
        console.log(`数据转换完成`);
        console.log(`处理记录: ${result.totalProcessed}`);
        console.log(`成功: ${result.totalSucceeded}`);
        console.log(`失败: ${result.totalFailed}`);
        console.log(`执行时间: ${result.executionTime}ms`);
      }

      return result;
    } catch (error) {
      result.executionTime = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * 清理重复数据
   */
  public async deduplicateData(
    table: string,
    uniqueFields: string[],
    options: DataMigrationOptions = {}
  ): Promise<DataMigrationResult> {
    const db = await this.getConnection();
    const startTime = Date.now();

    const {
      logProgress = true,
      dryRun = false
    } = options;

    const result: DataMigrationResult = {
      totalProcessed: 0,
      totalSucceeded: 0,
      totalFailed: 0,
      errors: [],
      executionTime: 0
    };

    try {
      if (logProgress) {
        console.log(`开始清理重复数据: ${table}`);
        console.log(`唯一字段: ${uniqueFields.join(', ')}`);
        console.log(`干运行模式: ${dryRun ? '是' : '否'}`);
      }

      // 查找重复数据
      const duplicateQuery = `
        SELECT ${uniqueFields.join(', ')}, COUNT(*) as count
        FROM ${table}
        GROUP BY ${uniqueFields.join(', ')}
        HAVING COUNT(*) > 1
      `;

      const duplicates = await db.all(duplicateQuery);

      for (const duplicate of duplicates) {
        // 构建WHERE条件
        const conditions = uniqueFields
          .map(field => `${field} = ?`)
          .join(' AND ');
        const values = uniqueFields.map(field => duplicate[field]);

        // 查找重复记录
        const duplicateRecords = await db.all(
          `SELECT * FROM ${table} WHERE ${conditions} ORDER BY id`,
          ...values
        );

        if (duplicateRecords.length > 1) {
          // 保留第一条记录，删除其他记录
          const recordsToDelete = duplicateRecords.slice(1);

          for (const record of recordsToDelete) {
            result.totalProcessed++;

            try {
              if (!dryRun) {
                await db.run(`DELETE FROM ${table} WHERE id = ?`, record.id);
              }

              result.totalSucceeded++;
            } catch (error) {
              result.totalFailed++;
              result.errors.push({
                recordId: record.id,
                error: error instanceof Error ? error.message : '未知错误'
              });

              if (logProgress) {
                console.warn(`删除重复记录失败 (ID: ${record.id}):`, error);
              }
            }
          }
        }
      }

      result.executionTime = Date.now() - startTime;

      if (logProgress) {
        console.log(`重复数据清理完成`);
        console.log(`处理记录: ${result.totalProcessed}`);
        console.log(`成功: ${result.totalSucceeded}`);
        console.log(`失败: ${result.totalFailed}`);
        console.log(`执行时间: ${result.executionTime}ms`);
      }

      return result;
    } catch (error) {
      result.executionTime = Date.now() - startTime;
      throw error;
    }
  }

  /**
   * 验证数据完整性
   */
  public async validateDataIntegrity(
    checks: Array<{
      description: string;
      query: string;
      expectedResult?: any;
    }>
  ): Promise<Array<{
    description: string;
    passed: boolean;
    actualResult?: any;
    error?: string;
  }>> {
    const db = await this.getConnection();
    const results = [];

    for (const check of checks) {
      try {
        const result = await db.get(check.query);
        const passed = check.expectedResult !== undefined
          ? result === check.expectedResult
          : true; // 如果没有预期结果，只要查询成功就认为通过

        results.push({
          description: check.description,
          passed,
          actualResult: result
        });
      } catch (error) {
        results.push({
          description: check.description,
          passed: false,
          error: error instanceof Error ? error.message : '未知错误'
        });
      }
    }

    return results;
  }

  /**
   * 导出数据到JSON文件
   */
  public async exportToJson(
    table: string,
    filePath: string,
    query?: string
  ): Promise<number> {
    const db = await this.getConnection();
    const fs = await import('fs');
    const path = await import('path');

    const data = await db.all(query || `SELECT * FROM ${table}`);

    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 写入JSON文件
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');

    return data.length;
  }

  /**
   * 从JSON文件导入数据
   */
  public async importFromJson(
    table: string,
    filePath: string,
    options: DataMigrationOptions = {}
  ): Promise<DataMigrationResult> {
    const db = await this.getConnection();
    const fs = await import('fs');
    const path = await import('path');
    const startTime = Date.now();

    const {
      batchSize = 100,
      logProgress = true,
      dryRun = false
    } = options;

    const result: DataMigrationResult = {
      totalProcessed: 0,
      totalSucceeded: 0,
      totalFailed: 0,
      errors: [],
      executionTime: 0
    };

    try {
      // 读取JSON文件
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const data = JSON.parse(fileContent);

      if (!Array.isArray(data)) {
        throw new Error('JSON文件必须包含数组数据');
      }

      if (logProgress) {
        console.log(`开始导入数据到: ${table}`);
        console.log(`记录数: ${data.length}`);
        console.log(`批量大小: ${batchSize}`);
        console.log(`干运行模式: ${dryRun ? '是' : '否'}`);
      }

      // 批量导入数据
      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);

        for (const record of batch) {
          result.totalProcessed++;

          try {
            if (!dryRun) {
              // 获取字段名和值
              const fields = Object.keys(record);
              const values = Object.values(record);

              const placeholders = fields.map(() => '?').join(', ');

              await db.run(
                `INSERT INTO ${table} (${fields.join(', ')}) VALUES (${placeholders})`,
                ...values
              );
            }

            result.totalSucceeded++;
          } catch (error) {
            result.totalFailed++;
            result.errors.push({
              recordId: record.id,
              error: error instanceof Error ? error.message : '未知错误'
            });

            if (logProgress) {
              console.warn(`记录导入失败:`, error);
            }
          }
        }

        if (logProgress) {
          const progress = Math.round((i + batch.length) / data.length * 100);
          console.log(`进度: ${i + batch.length}/${data.length} (${progress}%)`);
        }
      }

      result.executionTime = Date.now() - startTime;

      if (logProgress) {
        console.log(`数据导入完成`);
        console.log(`处理记录: ${result.totalProcessed}`);
        console.log(`成功: ${result.totalSucceeded}`);
        console.log(`失败: ${result.totalFailed}`);
        console.log(`执行时间: ${result.executionTime}ms`);
      }

      return result;
    } catch (error) {
      result.executionTime = Date.now() - startTime;
      throw error;
    }
  }
}

// 导出默认数据迁移工具实例
export const dataMigrator = new DataMigrator();