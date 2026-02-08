/**
 * 总结生成模块 Claude Skills 主入口
 */

// 导出类型
export * from './types';

// 导出核心组件
export * from './skill-registry';
export * from './skill-manager';
export * from './skill-initializer';

// 导出具体技能
export * from './daily-summary/skill-definition';
export * from './daily-summary/skill-handler';

// 导出默认实例
import { globalSkillRegistry } from './skill-registry';
import { globalSkillManager } from './skill-manager';
import { initializeSkills, getRegisteredSkillsInfo, isSkillAvailable, getSkillHelp } from './skill-initializer';

export const skillRegistry = globalSkillRegistry;
export const skillManager = globalSkillManager;
export const skillInitializer = {
  initializeSkills,
  getRegisteredSkillsInfo,
  isSkillAvailable,
  getSkillHelp
};

// 默认导出技能管理器
export default skillManager;

/**
 * 快速执行技能
 */
export async function executeSkillQuickly(
  skillId: string,
  parameters: Record<string, any>,
  userId?: string
): Promise<any> {
  const context = {
    skillId,
    userId,
    sessionId: `quick-${Date.now()}`,
    parameters,
    requestId: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date()
  };

  const result = await skillManager.executeSkill(context);

  if (!result.success) {
    throw new Error(`技能执行失败: ${result.error?.message}`);
  }

  return result.data;
}

/**
 * 获取所有可用技能的信息
 */
export function listAvailableSkills() {
  return getRegisteredSkillsInfo();
}

/**
 * 检查并初始化技能系统
 */
export async function setupSkillSystem(): Promise<void> {
  try {
    await initializeSkills();
    console.log('技能系统初始化成功');
  } catch (error) {
    console.error('技能系统初始化失败:', error);
    throw error;
  }
}