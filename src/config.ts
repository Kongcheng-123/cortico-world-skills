/**
 * 配置形状与默认值。
 *
 * 字段分三块：skill 库的位置、脚本执行的权限模式、执行时的保护参数。
 * 所有字段都在 `worlds.skills` 段下，改完立即生效（除了 mode，见 runner.ts）。
 */

/** 脚本执行的权限模式。 */
export type RunMode = 'whitelist' | 'open';

/** 白名单里的一项。 */
export interface WhitelistEntry {
  /** 模型调用时用的名字，用中文，这样她描述起来自然。 */
  alias: string;
  /** 相对 allowRoot 的脚本路径。 */
  path: string;
  /** 固定传入的参数，模型不能改。 */
  args?: string[];
  /** 给人看的一句话说明，会出现在 script_list 的结果里。 */
  note?: string;
}

export interface SkillsConfig {
  enabled: boolean;
  /** skill 文档目录，绝对路径。留空则用 <botDir>/workspace/skills。 */
  skillDir: string;
  /** 脚本执行的根目录，路径校验以它为界。 */
  allowRoot: string;
  /** 权限模式。只有人能改，模型没有切换入口。 */
  mode: RunMode;
  whitelist: WhitelistEntry[];
  /** 单次执行超时（毫秒）。 */
  timeoutMs: number;
  /** 返回给模型的输出上限（字符）。 */
  maxOutputChars: number;
}

export const SKILLS_ID = 'skills';

export const SKILLS_DEFAULTS: SkillsConfig = {
  enabled: false,
  skillDir: '',
  allowRoot: '',
  mode: 'whitelist',
  whitelist: [],
  timeoutMs: 60_000,
  maxOutputChars: 4_000,
};
