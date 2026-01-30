/**
 * 数据库配置优化器
 */

import { Database } from 'sqlite';
import { connectionManager } from '../config/connection';

/**
 * 配置优化建议
 */
export interface ConfigRecommendation {
  category: string;
  setting: string;
  currentValue: any;
  recommendedValue: any;
  description: string;
  impact: 'low' | 'medium' | 'high';
  sqlToApply?: string;
}

/**
 * 性能基准结果
 */
export interface BenchmarkResult {
  testName: string;
  executionTime: number;
  score: number;
  recommendations: string[];
}

/**
 * 配置优化器
 */
export class ConfigOptimizer {
  /**
   * 分析当前配置并生成优化建议
   */
  public async analyzeConfig(): Promise<ConfigRecommendation[]> {
    const recommendations: ConfigRecommendation[] = [];
    const db = await connectionManager.getConnection();

    try {
      // 获取当前配置
      const config = await this.getCurrentConfig(db);

      // 分析各个配置项
      recommendations.push(...await this.analyzePragmaSettings(config, db));
      recommendations.push(...await this.analyzeSchemaDesign(config, db));
      recommendations.push(...await this.analyzeIndexUsage(config, db));
      recommendations.push(...await this.analyzeQueryPatterns(config, db));

      // 按影响程度排序
      recommendations.sort((a, b) => {
        const impactOrder = { high: 3, medium: 2, low: 1 };
        return impactOrder[b.impact] - impactOrder[a.impact];
      });

      return recommendations;
    } finally {
      await db.close();
    }
  }

  /**
   * 获取当前配置
   */
  private async getCurrentConfig(db: Database): Promise<Record<string, any>> {
    const config: Record<string, any> = {};

    // 获取PRAGMA设置
    const pragmas = [
      'journal_mode',
      'synchronous',
      'temp_store',
      'page_size',
      'cache_size',
      'mmap_size',
      'auto_vacuum',
      'foreign_keys',
      'locking_mode',
      'wal_autocheckpoint'
    ];

    for (const pragma of pragmas) {
      const result = await db.get(`PRAGMA ${pragma}`);
      config[pragma] = result;
    }

    // 获取数据库统计信息
    const stats = await db.all(`
      SELECT name, value FROM pragma_stats
    `);

    for (const stat of stats) {
      config[stat.name] = stat.value;
    }

    return config;
  }

  /**
   * 分析PRAGMA设置
   */
  private async analyzePragmaSettings(
    config: Record<string, any>,
    db: Database
  ): Promise<ConfigRecommendation[]> {
    const recommendations: ConfigRecommendation[] = [];

    // journal_mode建议
    if (config.journal_mode !== 'WAL') {
      recommendations.push({
        category: '事务日志',
        setting: 'journal_mode',
        currentValue: config.journal_mode,
        recommendedValue: 'WAL',
        description: 'WAL模式提供更好的并发性能和耐久性',
        impact: 'high',
        sqlToApply: 'PRAGMA journal_mode=WAL'
      });
    }

    // synchronous建议
    if (config.synchronous === 2) { // FULL
      recommendations.push({
        category: '数据安全',
        setting: 'synchronous',
        currentValue: 'FULL',
        recommendedValue: 'NORMAL',
        description: '对于大多数应用，NORMAL模式提供足够的安全性且性能更好',
        impact: 'medium',
        sqlToApply: 'PRAGMA synchronous=NORMAL'
      });
    }

    // cache_size建议（默认-2000页，约2MB）
    if (config.cache_size && Math.abs(config.cache_size) < 10000) {
      recommendations.push({
        category: '缓存',
        setting: 'cache_size',
        currentValue: config.cache_size,
        recommendedValue: -10000, // 约10MB
        description: '增加缓存大小可以提高查询性能',
        impact: 'medium',
        sqlToApply: 'PRAGMA cache_size=-10000'
      });
    }

    // mmap_size建议
    if (!config.mmap_size || config.mmap_size < 268435456) { // 256MB
      recommendations.push({
        category: '内存映射',
        setting: 'mmap_size',
        currentValue: config.mmap_size || '未设置',
        recommendedValue: 268435456,
        description: '使用内存映射可以提高大数据库的读取性能',
        impact: 'medium',
        sqlToApply: 'PRAGMA mmap_size=268435456'
      });
    }

    // temp_store建议
    if (config.temp_store === 0) { // DEFAULT
      recommendations.push({
        category: '临时存储',
        setting: 'temp_store',
        currentValue: 'DEFAULT',
        recommendedValue: 2, // MEMORY
        description: '将临时表存储在内存中可以提高复杂查询性能',
        impact: 'medium',
        sqlToApply: 'PRAGMA temp_store=MEMORY'
      });
    }

    return recommendations;
  }

  /**
   * 分析Schema设计
   */
  private async analyzeSchemaDesign(
    config: Record<string, any>,
    db: Database
  ): Promise<ConfigRecommendation[]> {
    const recommendations: ConfigRecommendation[] = [];

    // 检查缺少主键的表
    const tablesWithoutPK = await db.all(`
      SELECT name as table_name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
        AND name NOT IN (
          SELECT tbl_name
          FROM sqlite_master
          WHERE type = 'index'
            AND sql LIKE '%PRIMARY KEY%'
        )
    `);

    for (const table of tablesWithoutPK) {
      recommendations.push({
        category: 'Schema设计',
        setting: '缺少主键',
        currentValue: `表 ${table.table_name} 缺少主键`,
        recommendedValue: '添加主键',
        description: '每个表都应该有主键以提高查询性能和确保数据完整性',
        impact: 'high',
        sqlToApply: `ALTER TABLE ${table.table_name} ADD COLUMN id INTEGER PRIMARY KEY AUTOINCREMENT`
      });
    }

    // 检查缺少索引的外键
    const foreignKeysWithoutIndex = await db.all(`
      SELECT
        m.name as table_name,
        p."from" as column_name
      FROM sqlite_master m
      JOIN pragma_foreign_key_list(m.name) p
      LEFT JOIN pragma_index_list(m.name) i ON i.name LIKE '%' || p."from" || '%'
      WHERE m.type = 'table'
        AND i.name IS NULL
    `);

    for (const fk of foreignKeysWithoutIndex) {
      recommendations.push({
        category: '索引优化',
        setting: '缺少外键索引',
        currentValue: `表 ${fk.table_name} 的外键 ${fk.column_name} 缺少索引`,
        recommendedValue: '添加索引',
        description: '外键列应该创建索引以提高连接查询性能',
        impact: 'high',
        sqlToApply: `CREATE INDEX idx_${fk.table_name}_${fk.column_name} ON ${fk.table_name}(${fk.column_name})`
      });
    }

    return recommendations;
  }

  /**
   * 分析索引使用情况
   */
  private async analyzeIndexUsage(
    config: Record<string, any>,
    db: Database
  ): Promise<ConfigRecommendation[]> {
    const recommendations: ConfigRecommendation[] = [];

    // 获取所有索引
    const indexes = await db.all(`
      SELECT
        m.tbl_name as table_name,
        il.name as index_name,
        il."unique" as is_unique,
        group_concat(ii.name, ', ') as columns
      FROM sqlite_master m
      JOIN pragma_index_list(m.tbl_name) il
      JOIN pragma_index_info(il.name) ii
      WHERE m.type = 'table'
        AND m.tbl_name NOT LIKE 'sqlite_%'
      GROUP BY m.tbl_name, il.name
    `);

    // 检查重复索引
    const indexMap = new Map<string, string[]>();
    for (const index of indexes) {
      const key = `${index.table_name}_${index.columns}`;
      if (!indexMap.has(key)) {
        indexMap.set(key, []);
      }
      indexMap.get(key)!.push(index.index_name);
    }

    for (const [key, indexNames] of indexMap.entries()) {
      if (indexNames.length > 1) {
        // 保留第一个索引，建议删除其他重复索引
        const [keepIndex, ...duplicateIndexes] = indexNames;

        for (const duplicateIndex of duplicateIndexes) {
          const [tableName] = key.split('_');

          recommendations.push({
            category: '索引优化',
            setting: '重复索引',
            currentValue: `索引 ${duplicateIndex} 与 ${keepIndex} 重复`,
            recommendedValue: '删除重复索引',
            description: '重复索引浪费存储空间并降低写入性能',
            impact: 'medium',
            sqlToApply: `DROP INDEX ${duplicateIndex}`
          });
        }
      }
    }

    // 检查可能缺少的索引（基于查询模式）
    // 这里简化处理，实际应该分析查询日志
    const frequentColumns = await db.all(`
      SELECT
        table_name,
        column_name,
        COUNT(*) as query_count
      FROM pragma_stats
      WHERE stat LIKE '%idx%'
      GROUP BY table_name, column_name
      HAVING query_count > 10
    `);

    for (const column of frequentColumns) {
      recommendations.push({
        category: '索引优化',
        setting: '可能缺少索引',
        currentValue: `列 ${column.table_name}.${column.column_name} 被频繁查询`,
        recommendedValue: '考虑添加索引',
        description: '频繁查询的列可能受益于索引',
        impact: 'medium',
        sqlToApply: `CREATE INDEX idx_${column.table_name}_${column.column_name} ON ${column.table_name}(${column.column_name})`
      });
    }

    return recommendations;
  }

  /**
   * 分析查询模式
   */
  private async analyzeQueryPatterns(
    config: Record<string, any>,
    db: Database
  ): Promise<ConfigRecommendation[]> {
    const recommendations: ConfigRecommendation[] = [];

    // 获取表大小信息
    const tableSizes = await db.all(`
      SELECT
        name as table_name,
        SUM(pgsize) as size_bytes
      FROM dbstat
      WHERE name NOT LIKE 'sqlite_%'
      GROUP BY name
      ORDER BY size_bytes DESC
    `);

    // 检查大表是否需要分区
    for (const table of tableSizes) {
      const sizeMB = table.size_bytes / (1024 * 1024);

      if (sizeMB > 100) {
        recommendations.push({
          category: '数据管理',
          setting: '大表优化',
          currentValue: `表 ${table.table_name} 大小为 ${sizeMB.toFixed(2)}MB`,
          recommendedValue: '考虑分区或归档',
          description: '大表可能影响查询性能，考虑按时间或其他维度分区',
          impact: 'medium',
          sqlToApply: undefined // 需要手动设计分区策略
        });
      }
    }

    // 检查是否需要启用WAL自动检查点
    if (config.wal_autocheckpoint === 1000) {
      recommendations.push({
        category: 'WAL优化',
        setting: 'wal_autocheckpoint',
        currentValue: config.wal_autocheckpoint,
        recommendedValue: 2000,
        description: '增加WAL自动检查点间隔可以减少检查点频率，提高写入性能',
        impact: 'low',
        sqlToApply: 'PRAGMA wal_autocheckpoint=2000'
      });
    }

    return recommendations;
  }

  /**
   * 运行性能基准测试
   */
  public async runBenchmark(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    const db = await connectionManager.getConnection();

    try {
      // 基准测试1: 简单查询
      const simpleQueryTime = await this.benchmarkQuery(db, 'SELECT 1');
      results.push({
        testName: '简单查询',
        executionTime: simpleQueryTime,
        score: this.calculateScore(simpleQueryTime, 1),
        recommendations: simpleQueryTime > 10 ? ['检查数据库连接性能'] : []
      });

      // 基准测试2: 表扫描
      const tableScanTime = await this.benchmarkQuery(db, 'SELECT COUNT(*) FROM sqlite_master');
      results.push({
        testName: '元数据查询',
        executionTime: tableScanTime,
        score: this.calculateScore(tableScanTime, 5),
        recommendations: tableScanTime > 50 ? ['检查系统负载'] : []
      });

      // 基准测试3: 连接查询
      const joinQuery = `
        SELECT m.name, COUNT(*) as index_count
        FROM sqlite_master m
        LEFT JOIN pragma_index_list(m.name) il ON 1=1
        WHERE m.type = 'table'
        GROUP BY m.name
      `;
      const joinQueryTime = await this.benchmarkQuery(db, joinQuery);
      results.push({
        testName: '连接查询',
        executionTime: joinQueryTime,
        score: this.calculateScore(joinQueryTime, 10),
        recommendations: joinQueryTime > 100 ? ['检查索引和查询优化'] : []
      });

      return results;
    } finally {
      await db.close();
    }
  }

  /**
   * 执行基准查询
   */
  private async benchmarkQuery(db: Database, query: string): Promise<number> {
    const startTime = Date.now();
    await db.all(query);
    return Date.now() - startTime;
  }

  /**
   * 计算基准分数
   */
  private calculateScore(executionTime: number, threshold: number): number {
    if (executionTime <= threshold) {
      return 100;
    } else {
      return Math.max(0, Math.round(100 * (threshold / executionTime)));
    }
  }

  /**
   * 应用配置优化
   */
  public async applyOptimizations(recommendations: ConfigRecommendation[]): Promise<number> {
    let appliedCount = 0;
    const db = await connectionManager.getConnection();

    try {
      for (const rec of recommendations) {
        if (rec.sqlToApply) {
          try {
            await db.run(rec.sqlToApply);
            appliedCount++;
            console.log(`应用优化: ${rec.setting}`);
          } catch (error) {
            console.warn(`应用优化失败: ${rec.setting}`, error);
          }
        }
      }

      return appliedCount;
    } finally {
      await db.close();
    }
  }

  /**
   * 基于工作负载模式的智能配置调优
   */
  public async adaptiveTuning(workloadPattern: 'read-heavy' | 'write-heavy' | 'mixed'): Promise<ConfigRecommendation[]> {
    const recommendations: ConfigRecommendation[] = [];
    const db = await connectionManager.getConnection();

    try {
      const config = await this.getCurrentConfig(db);

      // 基于工作负载模式调整配置
      switch (workloadPattern) {
        case 'read-heavy':
          // 读密集型优化
          if (config.cache_size && Math.abs(config.cache_size) < 20000) {
            recommendations.push({
              category: '缓存优化',
              setting: 'cache_size',
              currentValue: config.cache_size,
              recommendedValue: -20000, // 约20MB
              description: '读密集型工作负载需要更大的缓存',
              impact: 'high',
              sqlToApply: 'PRAGMA cache_size=-20000'
            });
          }

          if (config.mmap_size < 536870912) { // 512MB
            recommendations.push({
              category: '内存映射',
              setting: 'mmap_size',
              currentValue: config.mmap_size,
              recommendedValue: 536870912,
              description: '读密集型工作负载受益于更大的内存映射',
              impact: 'medium',
              sqlToApply: 'PRAGMA mmap_size=536870912'
            });
          }

          if (config.temp_store !== 2) { // MEMORY
            recommendations.push({
              category: '临时存储',
              setting: 'temp_store',
              currentValue: config.temp_store === 0 ? 'DEFAULT' : config.temp_store === 1 ? 'FILE' : 'MEMORY',
              recommendedValue: 'MEMORY',
              description: '读密集型查询需要快速临时存储',
              impact: 'medium',
              sqlToApply: 'PRAGMA temp_store=MEMORY'
            });
          }
          break;

        case 'write-heavy':
          // 写密集型优化
          if (config.journal_mode !== 'WAL') {
            recommendations.push({
              category: '事务日志',
              setting: 'journal_mode',
              currentValue: config.journal_mode,
              recommendedValue: 'WAL',
              description: 'WAL模式提供更好的写入并发性能',
              impact: 'high',
              sqlToApply: 'PRAGMA journal_mode=WAL'
            });
          }

          if (config.synchronous === 2) { // FULL
            recommendations.push({
              category: '数据安全',
              setting: 'synchronous',
              currentValue: 'FULL',
              recommendedValue: 'NORMAL',
              description: '写密集型工作负载可以降低同步级别以提高性能',
              impact: 'medium',
              sqlToApply: 'PRAGMA synchronous=NORMAL'
            });
          }

          if (config.wal_autocheckpoint < 4000) {
            recommendations.push({
              category: 'WAL优化',
              setting: 'wal_autocheckpoint',
              currentValue: config.wal_autocheckpoint,
              recommendedValue: 4000,
              description: '增加WAL检查点间隔以减少写入停顿',
              impact: 'medium',
              sqlToApply: 'PRAGMA wal_autocheckpoint=4000'
            });
          }
          break;

        case 'mixed':
          // 混合工作负载优化
          if (config.cache_size && Math.abs(config.cache_size) < 15000) {
            recommendations.push({
              category: '缓存优化',
              setting: 'cache_size',
              currentValue: config.cache_size,
              recommendedValue: -15000, // 约15MB
              description: '混合工作负载需要平衡的缓存大小',
              impact: 'medium',
              sqlToApply: 'PRAGMA cache_size=-15000'
            });
          }

          if (config.journal_mode !== 'WAL') {
            recommendations.push({
              category: '事务日志',
              setting: 'journal_mode',
              currentValue: config.journal_mode,
              recommendedValue: 'WAL',
              description: 'WAL模式提供读写平衡的性能',
              impact: 'high',
              sqlToApply: 'PRAGMA journal_mode=WAL'
            });
          }
          break;
      }

      return recommendations;
    } finally {
      await db.close();
    }
  }

  /**
   * 分析工作负载模式
   */
  public async analyzeWorkloadPattern(): Promise<'read-heavy' | 'write-heavy' | 'mixed'> {
    const db = await connectionManager.getConnection();

    try {
      // 获取查询统计
      const queryStats = await db.all(`
        SELECT
          SUM(CASE WHEN sql LIKE '%SELECT%' THEN 1 ELSE 0 END) as select_count,
          SUM(CASE WHEN sql LIKE '%INSERT%' OR sql LIKE '%UPDATE%' OR sql LIKE '%DELETE%' THEN 1 ELSE 0 END) as write_count
        FROM sqlite_stat1
        WHERE tbl NOT LIKE 'sqlite_%'
      `);

      const selectCount = queryStats[0]?.select_count || 0;
      const writeCount = queryStats[0]?.write_count || 0;
      const totalCount = selectCount + writeCount;

      if (totalCount === 0) {
        return 'mixed'; // 默认混合模式
      }

      const readRatio = selectCount / totalCount;
      const writeRatio = writeCount / totalCount;

      if (readRatio > 0.7) {
        return 'read-heavy';
      } else if (writeRatio > 0.7) {
        return 'write-heavy';
      } else {
        return 'mixed';
      }
    } catch (error) {
      // 如果统计表不存在，返回默认值
      return 'mixed';
    } finally {
      await db.close();
    }
  }

  /**
   * 执行自动调优
   */
  public async autoTune(): Promise<{
    workloadPattern: string;
    recommendations: ConfigRecommendation[];
    appliedCount: number;
  }> {
    const workloadPattern = await this.analyzeWorkloadPattern();
    const recommendations = await this.adaptiveTuning(workloadPattern);
    const appliedCount = await this.applyOptimizations(recommendations);

    return {
      workloadPattern,
      recommendations,
      appliedCount
    };
  }

  /**
   * 监控配置性能并持续优化
   */
  public async startContinuousOptimization(intervalMinutes: number = 60): Promise<NodeJS.Timeout> {
    console.log(`启动持续优化，间隔: ${intervalMinutes}分钟`);

    const timer = setInterval(async () => {
      try {
        console.log('执行定期配置优化检查...');
        const result = await this.autoTune();

        if (result.appliedCount > 0) {
          console.log(`应用了 ${result.appliedCount} 个优化配置`);
          console.log(`工作负载模式: ${result.workloadPattern}`);
        } else {
          console.log('当前配置已优化，无需调整');
        }
      } catch (error) {
        console.error('配置优化检查失败:', error);
      }
    }, intervalMinutes * 60 * 1000);

    return timer;
  }

  /**
   * 生成优化报告
   */
  public async generateReport(): Promise<{
    timestamp: Date;
    recommendations: ConfigRecommendation[];
    benchmarkResults: BenchmarkResult[];
    summary: {
      totalRecommendations: number;
      highImpact: number;
      mediumImpact: number;
      lowImpact: number;
      averageBenchmarkScore: number;
    };
  }> {
    const recommendations = await this.analyzeConfig();
    const benchmarkResults = await this.runBenchmark();

    const highImpact = recommendations.filter(r => r.impact === 'high').length;
    const mediumImpact = recommendations.filter(r => r.impact === 'medium').length;
    const lowImpact = recommendations.filter(r => r.impact === 'low').length;

    const averageScore = benchmarkResults.length > 0
      ? benchmarkResults.reduce((sum, r) => sum + r.score, 0) / benchmarkResults.length
      : 0;

    return {
      timestamp: new Date(),
      recommendations,
      benchmarkResults,
      summary: {
        totalRecommendations: recommendations.length,
        highImpact,
        mediumImpact,
        lowImpact,
        averageBenchmarkScore: Math.round(averageScore)
      }
    };
  }
}

// 导出默认配置优化器实例
export const configOptimizer = new ConfigOptimizer();