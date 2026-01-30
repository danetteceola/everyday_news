import { Database } from 'sqlite';
import { Platform } from '../types';
import { PlatformRepository as PlatformRepositoryInterface } from '../types/repository';
import { connectionManager } from '../config/connection';

/**
 * 平台数据访问仓库
 */
export class PlatformRepository implements PlatformRepositoryInterface {
  /**
   * 创建平台
   */
  public async create(platform: Omit<Platform, 'id' | 'created_at'>): Promise<Platform> {
    const db = await connectionManager.getConnection();

    try {
      const result = await db.run(
        `INSERT INTO platforms (name, icon) VALUES (?, ?)`,
        platform.name,
        platform.icon
      );

      const createdPlatform = await this.findById(result.lastID!);
      return createdPlatform!;
    } finally {
      await db.close();
    }
  }

  /**
   * 根据ID查找平台
   */
  public async findById(id: number): Promise<Platform | null> {
    const db = await connectionManager.getConnection();

    try {
      const platform = await db.get(
        `SELECT * FROM platforms WHERE id = ?`,
        id
      );

      if (!platform) {
        return null;
      }

      return this.mapToPlatform(platform);
    } finally {
      await db.close();
    }
  }

  /**
   * 根据名称查找平台
   */
  public async findByName(name: string): Promise<Platform | null> {
    const db = await connectionManager.getConnection();

    try {
      const platform = await db.get(
        `SELECT * FROM platforms WHERE name = ?`,
        name
      );

      if (!platform) {
        return null;
      }

      return this.mapToPlatform(platform);
    } finally {
      await db.close();
    }
  }

  /**
   * 查找所有平台
   */
  public async findAll(): Promise<Platform[]> {
    const db = await connectionManager.getConnection();

    try {
      const platforms = await db.all(`SELECT * FROM platforms ORDER BY name`);
      return platforms.map(this.mapToPlatform);
    } finally {
      await db.close();
    }
  }

  /**
   * 更新平台
   */
  public async update(id: number, updates: Partial<Omit<Platform, 'id' | 'created_at'>>): Promise<Platform | null> {
    const db = await connectionManager.getConnection();

    try {
      const existingPlatform = await this.findById(id);
      if (!existingPlatform) {
        return null;
      }

      const updatedPlatform = { ...existingPlatform, ...updates };

      await db.run(
        `UPDATE platforms SET name = ?, icon = ? WHERE id = ?`,
        updatedPlatform.name,
        updatedPlatform.icon,
        id
      );

      return this.findById(id);
    } finally {
      await db.close();
    }
  }

  /**
   * 删除平台
   */
  public async delete(id: number): Promise<boolean> {
    const db = await connectionManager.getConnection();

    try {
      const result = await db.run(`DELETE FROM platforms WHERE id = ?`, id);
      return result.changes! > 0;
    } finally {
      await db.close();
    }
  }

  /**
   * 批量创建平台
   */
  public async batchCreate(platforms: Omit<Platform, 'id' | 'created_at'>[]): Promise<Platform[]> {
    return connectionManager.withTransaction(async (db) => {
      const createdPlatforms: Platform[] = [];

      for (const platform of platforms) {
        const result = await db.run(
          `INSERT INTO platforms (name, icon) VALUES (?, ?)`,
          platform.name,
          platform.icon
        );

        const createdPlatform = await db.get(
          `SELECT * FROM platforms WHERE id = ?`,
          result.lastID
        );

        if (createdPlatform) {
          createdPlatforms.push(this.mapToPlatform(createdPlatform));
        }
      }

      return createdPlatforms;
    });
  }

  /**
   * 搜索平台
   */
  public async search(query: string): Promise<Platform[]> {
    const db = await connectionManager.getConnection();

    try {
      const platforms = await db.all(
        `SELECT * FROM platforms WHERE name LIKE ? ORDER BY name`,
        `%${query}%`
      );

      return platforms.map(this.mapToPlatform);
    } finally {
      await db.close();
    }
  }

  /**
   * 获取平台统计信息
   */
  public async getStats(): Promise<{
    totalPlatforms: number;
    platformsWithIcon: number;
    platformsWithoutIcon: number;
  }> {
    const db = await connectionManager.getConnection();

    try {
      const totalResult = await db.get(`SELECT COUNT(*) as count FROM platforms`);
      const withIconResult = await db.get(`SELECT COUNT(*) as count FROM platforms WHERE icon IS NOT NULL AND icon != ''`);
      const withoutIconResult = await db.get(`SELECT COUNT(*) as count FROM platforms WHERE icon IS NULL OR icon = ''`);

      return {
        totalPlatforms: totalResult?.count || 0,
        platformsWithIcon: withIconResult?.count || 0,
        platformsWithoutIcon: withoutIconResult?.count || 0
      };
    } finally {
      await db.close();
    }
  }

  /**
   * 初始化默认平台
   */
  public async initializeDefaultPlatforms(): Promise<Platform[]> {
    const defaultPlatforms = [
      { name: 'weibo', icon: '📱' },
      { name: 'zhihu', icon: '📚' },
      { name: 'toutiao', icon: '📰' },
      { name: 'baidu', icon: '🔍' },
      { name: 'wechat', icon: '💬' }
    ];

    const existingPlatforms = await this.findAll();
    const existingNames = new Set(existingPlatforms.map(p => p.name));

    const platformsToCreate = defaultPlatforms.filter(p => !existingNames.has(p.name));

    if (platformsToCreate.length === 0) {
      return existingPlatforms;
    }

    const createdPlatforms = await this.batchCreate(platformsToCreate);
    return [...existingPlatforms, ...createdPlatforms];
  }

  /**
   * 映射数据库行到Platform对象
   */
  private mapToPlatform(row: any): Platform {
    return {
      id: row.id,
      name: row.name,
      icon: row.icon,
      created_at: new Date(row.created_at)
    };
  }
}

// 导出默认平台仓库实例
export const platformRepository = new PlatformRepository();