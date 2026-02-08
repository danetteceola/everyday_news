/**
 * Skill 注册表
 */

import { SkillRegistration, SkillDefinition, SkillFactory } from './types';

/**
 * Skill 注册表类
 */
export class SkillRegistry {
  private skills: Map<string, SkillRegistration> = new Map();

  /**
   * 注册技能
   */
  register(skillRegistration: SkillRegistration): void {
    const { definition } = skillRegistration;

    if (this.skills.has(definition.id)) {
      throw new Error(`Skill "${definition.id}" 已经注册`);
    }

    this.skills.set(definition.id, skillRegistration);
    console.log(`技能注册成功: ${definition.name} (${definition.id})`);
  }

  /**
   * 注销技能
   */
  unregister(skillId: string): boolean {
    return this.skills.delete(skillId);
  }

  /**
   * 获取技能注册信息
   */
  get(skillId: string): SkillRegistration | null {
    return this.skills.get(skillId) || null;
  }

  /**
   * 获取技能定义
   */
  getDefinition(skillId: string): SkillDefinition | null {
    const registration = this.skills.get(skillId);
    return registration ? registration.definition : null;
  }

  /**
   * 获取所有技能定义
   */
  getAllDefinitions(): SkillDefinition[] {
    return Array.from(this.skills.values())
      .map(registration => registration.definition)
      .filter(definition => definition.enabled);
  }

  /**
   * 获取所有启用的技能
   */
  getAllEnabledSkills(): SkillRegistration[] {
    return Array.from(this.skills.values())
      .filter(registration => registration.definition.enabled);
  }

  /**
   * 检查技能是否存在
   */
  has(skillId: string): boolean {
    return this.skills.has(skillId);
  }

  /**
   * 获取技能数量
   */
  size(): number {
    return this.skills.size;
  }

  /**
   * 清空注册表
   */
  clear(): void {
    this.skills.clear();
  }

  /**
   * 导出技能列表（用于配置）
   */
  export(): Record<string, any> {
    const result: Record<string, any> = {};

    for (const [skillId, registration] of this.skills.entries()) {
      result[skillId] = {
        definition: registration.definition,
        enabled: registration.definition.enabled
      };
    }

    return result;
  }
}

/**
 * 默认技能工厂
 */
export class DefaultSkillFactory implements SkillFactory {
  private registry: SkillRegistry;

  constructor(registry: SkillRegistry) {
    this.registry = registry;
  }

  /**
   * 创建技能实例
   */
  async createSkill(skillId: string): Promise<SkillRegistration | null> {
    return this.registry.get(skillId);
  }

  /**
   * 列出所有技能
   */
  async listSkills(): Promise<SkillDefinition[]> {
    return this.registry.getAllDefinitions();
  }

  /**
   * 获取技能定义
   */
  async getSkill(skillId: string): Promise<SkillDefinition | null> {
    return this.registry.getDefinition(skillId);
  }
}

/**
 * 全局技能注册表实例
 */
export const globalSkillRegistry = new SkillRegistry();

/**
 * 全局技能工厂实例
 */
export const globalSkillFactory = new DefaultSkillFactory(globalSkillRegistry);

// 默认导出
export default globalSkillRegistry;