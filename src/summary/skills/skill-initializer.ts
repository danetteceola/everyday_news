/**
 * Skill 初始化器
 */

import { globalSkillRegistry } from './skill-registry';
import { DAILY_SUMMARY_SKILL_DEFINITION } from './daily-summary/skill-definition';
import { handleDailySummarySkill } from './daily-summary/skill-handler';
import { SkillRegistration } from './types';
import { configManager } from '../config';

/**
 * 初始化所有技能
 */
export async function initializeSkills(): Promise<void> {
  console.log('开始初始化技能...');

  try {
    // 获取技能配置
    const skillConfig = configManager.getSkillConfig();

    // 注册每日总结技能
    await registerDailySummarySkill(skillConfig);

    // 注册其他技能可以在这里添加
    // await registerOtherSkill();

    console.log(`技能初始化完成，共注册 ${globalSkillRegistry.size()} 个技能`);
    console.log('启用的技能:', skillConfig.enabledSkills.join(', '));

  } catch (error) {
    console.error('技能初始化失败:', error);
    throw error;
  }
}

/**
 * 注册每日总结技能
 */
async function registerDailySummarySkill(skillConfig: any): Promise<void> {
  const skillId = DAILY_SUMMARY_SKILL_DEFINITION.id;

  // 检查技能是否启用
  if (!skillConfig.enabledSkills.includes(skillId)) {
    console.log(`技能 "${skillId}" 未启用，跳过注册`);
    return;
  }

  // 检查技能是否禁用
  if (skillConfig.disabledSkills.includes(skillId)) {
    console.log(`技能 "${skillId}" 已禁用，跳过注册`);
    return;
  }

  // 创建技能注册信息
  const skillRegistration: SkillRegistration = {
    definition: {
      ...DAILY_SUMMARY_SKILL_DEFINITION,
      enabled: true // 根据配置覆盖
    },
    handler: handleDailySummarySkill,
    config: {
      timeout: skillConfig.timeout,
      maxConcurrentExecutions: skillConfig.maxConcurrentExecutions
    }
  };

  // 注册技能
  try {
    globalSkillRegistry.register(skillRegistration);
    console.log(`技能注册成功: ${DAILY_SUMMARY_SKILL_DEFINITION.name}`);
  } catch (error: any) {
    console.error(`技能注册失败: ${DAILY_SUMMARY_SKILL_DEFINITION.name}`, error.message);
    throw error;
  }
}

/**
 * 获取所有已注册技能的信息
 */
export function getRegisteredSkillsInfo(): Array<{
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  parameters: Array<{ name: string; type: string; required: boolean }>;
}> {
  const definitions = globalSkillRegistry.getAllDefinitions();

  return definitions.map(def => ({
    id: def.id,
    name: def.name,
    description: def.description,
    enabled: def.enabled,
    parameters: def.parameters.map(param => ({
      name: param.name,
      type: param.type,
      required: param.required
    }))
  }));
}

/**
 * 检查技能是否可用
 */
export function isSkillAvailable(skillId: string): boolean {
  const definition = globalSkillRegistry.getDefinition(skillId);
  return definition !== null && definition.enabled;
}

/**
 * 获取技能帮助信息
 */
export function getSkillHelp(skillId: string): {
  name: string;
  description: string;
  usage: string;
  examples: string[];
  parameters: Array<{
    name: string;
    type: string;
    description: string;
    required: boolean;
    defaultValue?: any;
  }>;
} | null {
  const definition = globalSkillRegistry.getDefinition(skillId);
  if (!definition) {
    return null;
  }

  return {
    name: definition.name,
    description: definition.description,
    usage: `使用技能: ${definition.id} --参数1 值1 --参数2 值2`,
    examples: definition.examples,
    parameters: definition.parameters.map(param => ({
      name: param.name,
      type: param.type,
      description: param.description,
      required: param.required,
      defaultValue: param.defaultValue
    }))
  };
}

/**
 * 导出技能配置
 */
export function exportSkillConfig(): {
  enabledSkills: string[];
  disabledSkills: string[];
  skillDetails: Record<string, any>;
} {
  const skillConfig = configManager.getSkillConfig();
  const skillDetails: Record<string, any> = {};

  const definitions = globalSkillRegistry.getAllDefinitions();
  for (const def of definitions) {
    skillDetails[def.id] = {
      name: def.name,
      description: def.description,
      version: def.version,
      parameters: def.parameters.map(p => p.name)
    };
  }

  return {
    enabledSkills: skillConfig.enabledSkills,
    disabledSkills: skillConfig.disabledSkills,
    skillDetails
  };
}