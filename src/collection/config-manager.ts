/**
 * 配置管理器
 * 管理采集系统的配置，包括平台配置、反爬配置、调度配置等
 */

import { CompleteCollectionConfig, ConfigManager as BaseConfigManager, PlatformConfig } from '../../config/collection.config';
import { PlatformType } from './types/news-item';
import { CollectionLogger, createCollectorLogger } from './utils/logger';

export class CollectionConfigManager {
  private configManager: BaseConfigManager;
  private logger: CollectionLogger;
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || './config/collection.config.json';
    this.configManager = new BaseConfigManager();
    this.logger = createCollectorLogger('config-manager');

    this.logger.info('初始化配置管理器');
  }

  /**
   * 加载配置
   */
  async loadConfig(): Promise<void> {
    this.logger.info(`加载配置文件: ${this.configPath}`);

    try {
      // 在实际实现中，这里会从文件系统加载配置
      // 目前使用默认配置
      this.logger.info('使用默认配置');
    } catch (error) {
      this.logger.error('加载配置文件失败，使用默认配置', error as Error);
      // 使用默认配置
    }
  }

  /**
   * 保存配置
   */
  async saveConfig(): Promise<void> {
    this.logger.info(`保存配置文件: ${this.configPath}`);

    try {
      const configJson = this.configManager.toJSON();
      // 在实际实现中，这里会保存到文件系统
      this.logger.debug('配置保存完成');
    } catch (error) {
      this.logger.error('保存配置文件失败', error as Error);
      throw error;
    }
  }

  /**
   * 获取完整配置
   */
  getConfig(): CompleteCollectionConfig {
    return this.configManager.getConfig();
  }

  /**
   * 更新配置
   */
  updateConfig(updates: Partial<CompleteCollectionConfig>): void {
    this.logger.info('更新系统配置');
    this.configManager.updateConfig(updates);
  }

  /**
   * 获取平台配置
   */
  getPlatformConfig(platform: PlatformType): PlatformConfig | undefined {
    return this.configManager.getPlatformConfig(platform);
  }

  /**
   * 获取所有平台配置
   */
  getAllPlatformConfigs(): PlatformConfig[] {
    return this.getConfig().platforms;
  }

  /**
   * 获取启用的平台配置
   */
  getEnabledPlatformConfigs(): PlatformConfig[] {
    return this.getConfig().platforms.filter(platform => platform.enabled);
  }

  /**
   * 更新平台配置
   */
  updatePlatformConfig(platform: PlatformType, updates: Partial<PlatformConfig>): boolean {
    this.logger.info(`更新平台配置: ${platform}`);
    return this.configManager.updatePlatformConfig(platform, updates);
  }

  /**
   * 启用/禁用平台
   */
  setPlatformEnabled(platform: PlatformType, enabled: boolean): boolean {
    this.logger.info(`${enabled ? '启用' : '禁用'}平台: ${platform}`);
    return this.updatePlatformConfig(platform, { enabled });
  }

  /**
   * 获取反爬配置
   */
  getAntiCrawlingConfig() {
    return this.getConfig().antiCrawling;
  }

  /**
   * 更新反爬配置
   */
  updateAntiCrawlingConfig(updates: Partial<CompleteCollectionConfig['antiCrawling']>): void {
    this.logger.info('更新反爬配置');
    this.updateConfig({
      antiCrawling: {
        ...this.getConfig().antiCrawling,
        ...updates
      }
    });
  }

  /**
   * 获取调度配置
   */
  getSchedulingConfig() {
    return this.getConfig().taskScheduling;
  }

  /**
   * 更新调度配置
   */
  updateSchedulingConfig(updates: Partial<CompleteCollectionConfig['taskScheduling']>): void {
    this.logger.info('更新调度配置');
    this.updateConfig({
      taskScheduling: {
        ...this.getConfig().taskScheduling,
        ...updates
      }
    });
  }

  /**
   * 获取数据清洗配置
   */
  getDataCleaningConfig() {
    return this.getConfig().dataCleaning;
  }

  /**
   * 更新数据清洗配置
   */
  updateDataCleaningConfig(updates: Partial<CompleteCollectionConfig['dataCleaning']>): void {
    this.logger.info('更新数据清洗配置');
    this.updateConfig({
      dataCleaning: {
        ...this.getConfig().dataCleaning,
        ...updates
      }
    });
  }

  /**
   * 获取监控配置
   */
  getMonitoringConfig() {
    return this.getConfig().monitoring;
  }

  /**
   * 更新监控配置
   */
  updateMonitoringConfig(updates: Partial<CompleteCollectionConfig['monitoring']>): void {
    this.logger.info('更新监控配置');
    this.updateConfig({
      monitoring: {
        ...this.getConfig().monitoring,
        ...updates
      }
    });
  }

  /**
   * 获取系统配置
   */
  getSystemConfig() {
    return this.getConfig().system;
  }

  /**
   * 更新系统配置
   */
  updateSystemConfig(updates: Partial<CompleteCollectionConfig['system']>): void {
    this.logger.info('更新系统配置');
    this.updateConfig({
      system: {
        ...this.getConfig().system,
        ...updates
      }
    });
  }

  /**
   * 验证配置
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    return this.configManager.validateConfig();
  }

  /**
   * 导出配置为JSON
   */
  exportConfig(): string {
    return this.configManager.toJSON();
  }

  /**
   * 导入配置
   */
  importConfig(json: string): void {
    this.logger.info('导入配置');
    const newConfigManager = BaseConfigManager.fromJSON(json);
    this.configManager = newConfigManager;
  }

  /**
   * 重置为默认配置
   */
  resetToDefault(): void {
    this.logger.info('重置为默认配置');
    this.configManager = new BaseConfigManager();
  }

  /**
   * 获取配置摘要
   */
  getConfigSummary(): {
    totalPlatforms: number;
    enabledPlatforms: number;
    antiCrawlingEnabled: boolean;
    dataCleaningEnabled: boolean;
    schedulingEnabled: boolean;
    monitoringEnabled: boolean;
  } {
    const config = this.getConfig();
    const enabledPlatforms = config.platforms.filter(p => p.enabled);

    return {
      totalPlatforms: config.platforms.length,
      enabledPlatforms: enabledPlatforms.length,
      antiCrawlingEnabled: config.antiCrawling.enabled,
      dataCleaningEnabled: config.dataCleaning.enabled,
      schedulingEnabled: config.taskScheduling.enabled,
      monitoringEnabled: config.monitoring.enabled
    };
  }

  /**
   * 应用配置到采集框架
   * 注意：这个方法需要在采集框架中实现
   */
  applyToCollectionFramework(framework: any): void {
    this.logger.info('应用配置到采集框架');

    const config = this.getConfig();

    // 这里应该将配置应用到采集框架
    // 由于框架接口可能不同，这里只是示例
    this.logger.debug('配置应用完成');
  }
}

// 默认配置管理器实例
export const configManager = new CollectionConfigManager();