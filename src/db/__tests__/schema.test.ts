import { schemaManager } from '../config/schema';
import { connectionManager } from '../config/connection';
import { configManager } from '../config';

describe('数据库Schema测试', () => {
  beforeAll(async () => {
    // 确保测试数据库存在
    const config = configManager.getConfig();
    console.log(`测试数据库路径: ${config.databasePath}`);
  });

  afterAll(async () => {
    // 清理测试连接
    await connectionManager.closeAllConnections();
  });

  describe('Schema初始化', () => {
    test('应该成功初始化Schema', async () => {
      await expect(schemaManager.initializeSchema()).resolves.not.toThrow();
    });

    test('应该创建所有必需的表', async () => {
      const tableNames = await schemaManager.getAllTableNames();

      expect(tableNames).toContain('platforms');
      expect(tableNames).toContain('news_items');
      expect(tableNames).toContain('daily_summaries');
      expect(tableNames).toContain('crawl_logs');
    });
  });

  describe('表结构验证', () => {
    test('platforms表应该有正确的结构', async () => {
      const schema = await schemaManager.getTableSchema('platforms');

      expect(schema).not.toBeNull();
      expect(schema!.name).toBe('platforms');

      // 检查列
      const columnNames = schema!.columns.map(col => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('name');
      expect(columnNames).toContain('icon');
      expect(columnNames).toContain('created_at');

      // 检查主键
      const primaryKeyColumn = schema!.columns.find(col => col.primaryKey);
      expect(primaryKeyColumn?.name).toBe('id');
      expect(primaryKeyColumn?.autoIncrement).toBe(true);

      // 检查唯一约束
      const nameColumn = schema!.columns.find(col => col.name === 'name');
      expect(nameColumn?.unique).toBe(true);
    });

    test('news_items表应该有正确的结构', async () => {
      const schema = await schemaManager.getTableSchema('news_items');

      expect(schema).not.toBeNull();
      expect(schema!.name).toBe('news_items');

      // 检查必需列
      const requiredColumns = [
        'id', 'platform_id', 'external_id', 'title', 'content', 'url',
        'publish_time', 'created_at'
      ];

      const columnNames = schema!.columns.map(col => col.name);
      for (const column of requiredColumns) {
        expect(columnNames).toContain(column);
      }

      // 检查外键约束
      const foreignKeys = schema!.foreignKeys.filter(fk =>
        fk.columns.includes('platform_id') && fk.referencedTable === 'platforms'
      );
      expect(foreignKeys.length).toBeGreaterThan(0);

      // 检查唯一约束
      const uniqueIndexes = schema!.indexes.filter(idx => idx.unique);
      const hasPlatformExternalUnique = uniqueIndexes.some(idx =>
        idx.columns.includes('platform_id') && idx.columns.includes('external_id')
      );
      expect(hasPlatformExternalUnique).toBe(true);
    });

    test('daily_summaries表应该有正确的结构', async () => {
      const schema = await schemaManager.getTableSchema('daily_summaries');

      expect(schema).not.toBeNull();
      expect(schema!.name).toBe('daily_summaries');

      // 检查列
      const columnNames = schema!.columns.map(col => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('date');
      expect(columnNames).toContain('domestic_hotspots');
      expect(columnNames).toContain('international_hotspots');
      expect(columnNames).toContain('investment_hotspots');
      expect(columnNames).toContain('generated_at');

      // 检查日期唯一约束
      const dateColumn = schema!.columns.find(col => col.name === 'date');
      expect(dateColumn?.unique).toBe(true);
    });

    test('crawl_logs表应该有正确的结构', async () => {
      const schema = await schemaManager.getTableSchema('crawl_logs');

      expect(schema).not.toBeNull();
      expect(schema!.name).toBe('crawl_logs');

      // 检查列
      const columnNames = schema!.columns.map(col => col.name);
      expect(columnNames).toContain('id');
      expect(columnNames).toContain('platform_id');
      expect(columnNames).toContain('started_at');
      expect(columnNames).toContain('completed_at');
      expect(columnNames).toContain('items_collected');
      expect(columnNames).toContain('status');
      expect(columnNames).toContain('error_message');

      // 检查外键约束
      const foreignKeys = schema!.foreignKeys.filter(fk =>
        fk.columns.includes('platform_id') && fk.referencedTable === 'platforms'
      );
      expect(foreignKeys.length).toBeGreaterThan(0);

      // 检查状态约束
      const statusColumn = schema!.columns.find(col => col.name === 'status');
      expect(statusColumn?.type.toLowerCase()).toContain('text');
    });
  });

  describe('索引验证', () => {
    test('应该创建必要的索引', async () => {
      const newsItemsIndexes = await schemaManager.getTableSchema('news_items');
      const indexNames = newsItemsIndexes!.indexes.map(idx => idx.name);

      // 检查关键索引
      const expectedIndexPatterns = [
        /idx_news_items_platform_id/,
        /idx_news_items_publish_time/,
        /idx_news_items_category/,
        /idx_news_items_is_investment_related/,
        /idx_news_items_platform_date/
      ];

      for (const pattern of expectedIndexPatterns) {
        const hasIndex = indexNames.some(name => pattern.test(name));
        expect(hasIndex).toBe(true);
      }
    });

    test('索引应该包含正确的列', async () => {
      const newsItemsSchema = await schemaManager.getTableSchema('news_items');

      // 检查平台ID索引
      const platformIndex = newsItemsSchema!.indexes.find(idx =>
        idx.name.includes('platform_id')
      );
      expect(platformIndex).toBeDefined();
      expect(platformIndex!.columns).toContain('platform_id');

      // 检查发布时间索引
      const publishTimeIndex = newsItemsSchema!.indexes.find(idx =>
        idx.name.includes('publish_time')
      );
      expect(publishTimeIndex).toBeDefined();
      expect(publishTimeIndex!.columns).toContain('publish_time');
    });
  });

  describe('Schema完整性验证', () => {
    test('应该通过完整性验证', async () => {
      const validation = await schemaManager.validateSchema();

      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    test('应该生成有效的Schema文档', async () => {
      const documentation = await schemaManager.generateSchemaDocumentation();

      expect(typeof documentation).toBe('string');
      expect(documentation.length).toBeGreaterThan(0);
      expect(documentation).toContain('# 数据库Schema文档');
      expect(documentation).toContain('platforms');
      expect(documentation).toContain('news_items');
    });

    test('应该导出有效的SQL', async () => {
      const sql = await schemaManager.exportSchemaToSQL();

      expect(typeof sql).toBe('string');
      expect(sql.length).toBeGreaterThan(0);
      expect(sql).toContain('CREATE TABLE');
      expect(sql).toContain('platforms');
      expect(sql).toContain('news_items');
    });
  });

  describe('默认数据', () => {
    test('应该插入默认平台数据', async () => {
      const db = await connectionManager.getConnection();

      try {
        const platforms = await db.all('SELECT * FROM platforms ORDER BY name');

        expect(platforms.length).toBeGreaterThan(0);

        // 检查默认平台
        const platformNames = platforms.map(p => p.name);
        expect(platformNames).toContain('weibo');
        expect(platformNames).toContain('zhihu');
        expect(platformNames).toContain('toutiao');
        expect(platformNames).toContain('baidu');
        expect(platformNames).toContain('wechat');
      } finally {
        await db.close();
      }
    });
  });
});