import { Database } from 'sqlite';
import { connectionManager } from '../config/connection';

/**
 * 索引信息
 */
export interface IndexInfo {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
  size: number;
  usageCount: number;
  lastUsed: Date | null;
}

/**
 * 索引优化建议
 */
export interface IndexOptimization {
  table: string;
  currentIndexes: IndexInfo[];
  recommendedIndexes: string[];
  unusedIndexes: string[];
  duplicateIndexes: string[];
}

/**
 * 索引管理器
 */
export class IndexManager {
  private static instance: IndexManager;

  private constructor() {}

  /**
   * 获取索引管理器实例
   */
  public static getInstance(): IndexManager {
    if (!IndexManager.instance) {
      IndexManager.instance = new IndexManager();
    }
    return IndexManager.instance;
  }

  /**
   * 获取所有索引信息
   */
  public async getAllIndexes(): Promise<IndexInfo[]> {
    const db = await connectionManager.getConnection();

    try {
      // 获取所有索引
      const indexes = await db.all(`
        SELECT
          il.name as index_name,
          il.tbl_name as table_name,
          il."unique" as is_unique,
          GROUP_CONCAT(ii.name, ', ') as column_names
        FROM sqlite_master il
        LEFT JOIN pragma_index_info(il.name) ii ON 1=1
        WHERE il.type = 'index'
          AND il.name NOT LIKE 'sqlite_autoindex_%'
        GROUP BY il.name, il.tbl_name, il."unique"
        ORDER BY il.tbl_name, il.name
      `);

      const indexInfos: IndexInfo[] = [];

      for (const index of indexes) {
        // 获取索引大小（估算）
        const sizeResult = await db.get(`
          SELECT SUM(pgsize) as total_size
          FROM dbstat
          WHERE name = ? AND aggregate = 1
        `, index.index_name);

        // 获取索引使用统计（需要SQLite编译时启用SQLITE_ENABLE_DBSTAT_VTAB）
        let usageCount = 0;
        let lastUsed: Date | null = null;

        try {
          const usageResult = await db.get(`
            SELECT * FROM sqlite_stat1 WHERE tbl = ? AND idx = ?
          `, index.table_name, index.index_name);

          if (usageResult) {
            // SQLite统计信息格式: "索引名 行数 选择性..."
            const stats = usageResult.stat?.split(' ') || [];
            if (stats.length > 1) {
              usageCount = parseInt(stats[1]) || 0;
            }
          }
        } catch (error) {
          // 统计表可能不存在，忽略错误
        }

        indexInfos.push({
          name: index.index_name,
          table: index.table_name,
          columns: index.column_names ? index.column_names.split(', ') : [],
          unique: index.is_unique === 1,
          size: sizeResult?.total_size || 0,
          usageCount,
          lastUsed
        });
      }

      return indexInfos;
    } finally {
      await db.close();
    }
  }

  /**
   * 获取表索引信息
   */
  public async getTableIndexes(tableName: string): Promise<IndexInfo[]> {
    const allIndexes = await this.getAllIndexes();
    return allIndexes.filter(index => index.table === tableName);
  }

  /**
   * 分析索引使用情况
   */
  public async analyzeIndexUsage(): Promise<{
    totalIndexes: number;
    totalSize: number;
    usedIndexes: number;
    unusedIndexes: number;
    duplicateIndexes: number;
  }> {
    const indexes = await this.getAllIndexes();

    let totalSize = 0;
    let usedIndexes = 0;
    let unusedIndexes = 0;
    const tableIndexMap = new Map<string, Set<string>>();

    for (const index of indexes) {
      totalSize += index.size;

      if (index.usageCount > 0) {
        usedIndexes++;
      } else {
        unusedIndexes++;
      }

      // 检查重复索引
      const key = `${index.table}:${index.columns.join(',')}`;
      if (!tableIndexMap.has(index.table)) {
        tableIndexMap.set(index.table, new Set());
      }
      tableIndexMap.get(index.table)!.add(key);
    }

    // 计算重复索引
    let duplicateIndexes = 0;
    for (const [table, indexSet] of tableIndexMap) {
      const tableIndexes = indexes.filter(idx => idx.table === table);
      const columnCombinations = new Set<string>();

      for (const index of tableIndexes) {
        const combination = index.columns.join(',');
        if (columnCombinations.has(combination)) {
          duplicateIndexes++;
        } else {
          columnCombinations.add(combination);
        }
      }
    }

    return {
      totalIndexes: indexes.length,
      totalSize,
      usedIndexes,
      unusedIndexes,
      duplicateIndexes
    };
  }

  /**
   * 生成索引优化建议
   */
  public async generateOptimizationSuggestions(): Promise<IndexOptimization[]> {
    const db = await connectionManager.getConnection();

    try {
      const allTables = await db.all(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      `);

      const optimizations: IndexOptimization[] = [];

      for (const table of allTables) {
        const tableName = table.name;
        const currentIndexes = await this.getTableIndexes(tableName);

        // 分析查询模式（这里简化处理，实际应该分析实际查询日志）
        const recommendedIndexes = this.getRecommendedIndexes(tableName);
        const unusedIndexes = currentIndexes
          .filter(idx => idx.usageCount === 0)
          .map(idx => idx.name);

        // 检查重复索引
        const duplicateIndexes = this.findDuplicateIndexes(currentIndexes);

        optimizations.push({
          table: tableName,
          currentIndexes,
          recommendedIndexes,
          unusedIndexes,
          duplicateIndexes
        });
      }

      return optimizations;
    } finally {
      await db.close();
    }
  }

  /**
   * 获取推荐索引
   */
  private getRecommendedIndexes(tableName: string): string[] {
    const recommendations: string[] = [];

    switch (tableName) {
      case 'news_items':
        recommendations.push(
          'CREATE INDEX IF NOT EXISTS idx_news_items_platform_publish_date ON news_items(platform_id, DATE(publish_time))',
          'CREATE INDEX IF NOT EXISTS idx_news_items_category_engagement ON news_items(category, views DESC)',
          'CREATE INDEX IF NOT EXISTS idx_news_items_investment_date ON news_items(is_investment_related, publish_time DESC)',
          'CREATE INDEX IF NOT EXISTS idx_news_items_tags ON news_items(tags) WHERE tags IS NOT NULL'
        );
        break;

      case 'crawl_logs':
        recommendations.push(
          'CREATE INDEX IF NOT EXISTS idx_crawl_logs_platform_status ON crawl_logs(platform_id, status)',
          'CREATE INDEX IF NOT EXISTS idx_crawl_logs_date_status ON crawl_logs(DATE(started_at), status)'
        );
        break;

      case 'daily_summaries':
        recommendations.push(
          'CREATE INDEX IF NOT EXISTS idx_daily_summaries_year_month ON daily_summaries(SUBSTR(date, 1, 7))'
        );
        break;
    }

    return recommendations;
  }

  /**
   * 查找重复索引
   */
  private findDuplicateIndexes(indexes: IndexInfo[]): string[] {
    const duplicates: string[] = [];
    const columnMap = new Map<string, string[]>();

    // 按列组合分组索引
    for (const index of indexes) {
      const key = index.columns.join(',');
      if (!columnMap.has(key)) {
        columnMap.set(key, []);
      }
      columnMap.get(key)!.push(index.name);
    }

    // 找出有多个索引的列组合
    for (const [columns, indexNames] of columnMap) {
      if (indexNames.length > 1) {
        // 保留第一个索引，标记其他为重复
        duplicates.push(...indexNames.slice(1));
      }
    }

    return duplicates;
  }

  /**
   * 创建索引
   */
  public async createIndex(tableName: string, columns: string[], indexName?: string, unique: boolean = false): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      const name = indexName || `idx_${tableName}_${columns.join('_')}`;
      const uniqueClause = unique ? 'UNIQUE' : '';

      await db.run(`
        CREATE ${uniqueClause} INDEX IF NOT EXISTS ${name}
        ON ${tableName}(${columns.join(', ')})
      `);

      console.log(`Index created: ${name} on ${tableName}(${columns.join(', ')})`);
    } finally {
      await db.close();
    }
  }

  /**
   * 删除索引
   */
  public async dropIndex(indexName: string): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      await db.run(`DROP INDEX IF EXISTS ${indexName}`);
      console.log(`Index dropped: ${indexName}`);
    } finally {
      await db.close();
    }
  }

  /**
   * 重新构建索引
   */
  public async rebuildIndex(indexName: string): Promise<void> {
    const db = await connectionManager.getConnection();

    try {
      // 获取索引信息
      const indexInfo = await db.get(`
        SELECT * FROM sqlite_master
        WHERE type = 'index' AND name = ?
      `, indexName);

      if (!indexInfo) {
        throw new Error(`Index not found: ${indexName}`);
      }

      // 删除并重新创建索引
      await db.run(`DROP INDEX ${indexName}`);
      await db.run(indexInfo.sql);

      console.log(`Index rebuilt: ${indexName}`);
    } finally {
      await db.close();
    }
  }

  /**
   * 优化所有索引
   */
  public async optimizeAllIndexes(): Promise<{
    created: number;
    dropped: number;
    rebuilt: number;
  }> {
    const suggestions = await this.generateOptimizationSuggestions();

    let created = 0;
    let dropped = 0;
    let rebuilt = 0;

    const db = await connectionManager.getConnection();

    try {
      await db.run('BEGIN TRANSACTION');

      // 创建推荐索引
      for (const suggestion of suggestions) {
        for (const sql of suggestion.recommendedIndexes) {
          try {
            await db.run(sql);
            created++;
          } catch (error) {
            console.warn(`Failed to create index: ${sql}`, error);
          }
        }
      }

      // 删除未使用的索引
      for (const suggestion of suggestions) {
        for (const indexName of suggestion.unusedIndexes) {
          try {
            await db.run(`DROP INDEX IF EXISTS ${indexName}`);
            dropped++;
          } catch (error) {
            console.warn(`Failed to drop index: ${indexName}`, error);
          }
        }
      }

      // 删除重复索引
      for (const suggestion of suggestions) {
        for (const indexName of suggestion.duplicateIndexes) {
          try {
            await db.run(`DROP INDEX IF EXISTS ${indexName}`);
            dropped++;
          } catch (error) {
            console.warn(`Failed to drop duplicate index: ${indexName}`, error);
          }
        }
      }

      await db.run('COMMIT');

      // 重新构建剩余索引
      const remainingIndexes = await this.getAllIndexes();
      for (const index of remainingIndexes) {
        try {
          await this.rebuildIndex(index.name);
          rebuilt++;
        } catch (error) {
          console.warn(`Failed to rebuild index: ${index.name}`, error);
        }
      }

      return { created, dropped, rebuilt };
    } catch (error) {
      await db.run('ROLLBACK');
      throw error;
    } finally {
      await db.close();
    }
  }

  /**
   * 生成索引报告
   */
  public async generateIndexReport(): Promise<string> {
    const indexes = await this.getAllIndexes();
    const usageStats = await this.analyzeIndexUsage();
    const suggestions = await this.generateOptimizationSuggestions();

    let report = '# 数据库索引报告\n\n';
    report += `生成时间: ${new Date().toISOString()}\n\n`;

    // 总体统计
    report += '## 总体统计\n\n';
    report += `- 总索引数: ${usageStats.totalIndexes}\n`;
    report += `- 总大小: ${this.formatSize(usageStats.totalSize)}\n`;
    report += `- 使用中的索引: ${usageStats.usedIndexes}\n`;
    report += `- 未使用的索引: ${usageStats.unusedIndexes}\n`;
    report += `- 重复索引: ${usageStats.duplicateIndexes}\n\n`;

    // 按表统计
    report += '## 按表统计\n\n';
    const tableStats = new Map<string, { count: number; size: number }>();

    for (const index of indexes) {
      if (!tableStats.has(index.table)) {
        tableStats.set(index.table, { count: 0, size: 0 });
      }
      const stats = tableStats.get(index.table)!;
      stats.count++;
      stats.size += index.size;
    }

    for (const [table, stats] of tableStats) {
      report += `### ${table}\n`;
      report += `- 索引数: ${stats.count}\n`;
      report += `- 总大小: ${this.formatSize(stats.size)}\n\n`;

      const tableIndexes = indexes.filter(idx => idx.table === table);
      for (const index of tableIndexes) {
        report += `  - **${index.name}**: ${index.columns.join(', ')}`;
        if (index.unique) report += ' (唯一)';
        if (index.usageCount === 0) report += ' ⚠️ 未使用';
        report += `\n`;
      }
      report += '\n';
    }

    // 优化建议
    report += '## 优化建议\n\n';
    for (const suggestion of suggestions) {
      if (suggestion.recommendedIndexes.length > 0 ||
          suggestion.unusedIndexes.length > 0 ||
          suggestion.duplicateIndexes.length > 0) {
        report += `### ${suggestion.table}\n`;

        if (suggestion.recommendedIndexes.length > 0) {
          report += '**建议创建索引**:\n';
          for (const sql of suggestion.recommendedIndexes) {
            report += `- ${sql}\n`;
          }
          report += '\n';
        }

        if (suggestion.unusedIndexes.length > 0) {
          report += '**建议删除未使用索引**:\n';
          for (const indexName of suggestion.unusedIndexes) {
            report += `- ${indexName}\n`;
          }
          report += '\n';
        }

        if (suggestion.duplicateIndexes.length > 0) {
          report += '**建议删除重复索引**:\n';
          for (const indexName of suggestion.duplicateIndexes) {
            report += `- ${indexName}\n`;
          }
          report += '\n';
        }
      }
    }

    return report;
  }

  /**
   * 格式化大小
   */
  private formatSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
}

// 导出默认索引管理器实例
export const indexManager = IndexManager.getInstance();