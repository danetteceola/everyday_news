/**
 * Claude Skill 类型定义
 */

/**
 * Skill 参数配置
 */
export interface SkillParamConfig {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  required: boolean;
  defaultValue?: any;
  validator?: (value: any) => boolean;
}

/**
 * Skill 定义
 */
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  parameters: SkillParamConfig[];
  examples: string[];
  requiresAuth: boolean;
  enabled: boolean;
  version: string;
}

/**
 * Skill 执行上下文
 */
export interface SkillExecutionContext {
  skillId: string;
  userId?: string;
  sessionId?: string;
  parameters: Record<string, any>;
  requestId: string;
  timestamp: Date;
}

/**
 * Skill 执行结果
 */
export interface SkillExecutionResult {
  success: boolean;
  data?: any;
  error?: {
    code: string;
    message: string;
    details?: any;
  };
  metadata: {
    executionTime: number;
    skillId: string;
    requestId: string;
    timestamp: Date;
  };
}

/**
 * Skill 注册配置
 */
export interface SkillRegistrationConfig {
  skillDir: string;
  enabledSkills?: string[];
  disabledSkills?: string[];
  skillConfig?: Record<string, any>;
}

/**
 * Skill 处理器接口
 */
export interface SkillHandler {
  (context: SkillExecutionContext): Promise<SkillExecutionResult>;
}

/**
 * Skill 注册信息
 */
export interface SkillRegistration {
  definition: SkillDefinition;
  handler: SkillHandler;
  config?: any;
}

/**
 * Skill 错误类型
 */
export enum SkillErrorCode {
  PARAM_VALIDATION_FAILED = 'PARAM_VALIDATION_FAILED',
  EXECUTION_FAILED = 'EXECUTION_FAILED',
  SKILL_NOT_FOUND = 'SKILL_NOT_FOUND',
  SKILL_DISABLED = 'SKILL_DISABLED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  TIMEOUT = 'TIMEOUT',
  INVALID_STATE = 'INVALID_STATE',
}

/**
 * Skill 工厂接口
 */
export interface SkillFactory {
  createSkill(skillId: string): Promise<SkillRegistration | null>;
  listSkills(): Promise<SkillDefinition[]>;
  getSkill(skillId: string): Promise<SkillDefinition | null>;
}