/**
 * 配置形状与默认值。
 *
 * 白名单为什么用字符串槽位而不是对象数组：Cortico 的配置表单只支持
 * integer / number / boolean / string / 二元数组，对象数组渲染成只读。
 * gaming 扩展用「slot1..slotN」这种字符串槽位绕开限制，这里沿用同样的做法。
 *
 * 槽位格式：`别名 | 脚本路径 | 参数,参数 | 说明`
 * 例：`查看听声状态 | scripts/asr_ctl.py | status | 看转写服务在不在跑`
 */

/** 脚本执行的权限模式。 */
export type RunMode = 'whitelist' | 'open';

/** 解析后的白名单条目。 */
export interface WhitelistEntry {
  alias: string;
  path: string;
  args: string[];
  note: string;
}

export interface SkillsConfig {
  enabled: boolean;
  /** 技能文档目录。留空则用 <botDir>/workspace/skills。 */
  skillDir: string;
  /** 脚本执行的根目录，路径校验以它为界。 */
  allowRoot: string;
  /** 权限模式。只有人能改，模型没有切换入口。 */
  mode: RunMode;
  /** 单次执行超时（毫秒）。 */
  timeoutMs: number;
  /** 返回给模型的输出上限（字符）。 */
  maxOutputChars: number;
  /** 白名单槽位，一行一条。配置页里编辑这个。 */
  slot1: string;
  slot2: string;
  slot3: string;
  slot4: string;
  slot5: string;
  slot6: string;
  slot7: string;
  slot8: string;
}

export const SKILLS_ID = 'skills';

/** 槽位数量，改这里要同时改 interface。 */
export const SLOT_COUNT = 8;

export const SKILLS_DEFAULTS: SkillsConfig = {
  enabled: false,
  skillDir: '',
  allowRoot: '',
  mode: 'whitelist',
  timeoutMs: 60_000,
  maxOutputChars: 4_000,
  slot1: '',
  slot2: '',
  slot3: '',
  slot4: '',
  slot5: '',
  slot6: '',
  slot7: '',
  slot8: '',
};

/**
 * 把槽位字符串解析成白名单条目。
 *
 * 格式：`别名 | 路径 | 参数,参数 | 说明`
 * 只有前两段是必需的，后面可以省。
 */
export function parseSlots(cfg: SkillsConfig): WhitelistEntry[] {
  const out: WhitelistEntry[] = [];
  for (let i = 1; i <= SLOT_COUNT; i += 1) {
    const raw = String((cfg as unknown as Record<string, unknown>)[`slot${i}`] ?? '').trim();
    if (!raw) continue;

    const parts = raw.split('|').map((s) => s.trim());
    const alias = parts[0] ?? '';
    const path = parts[1] ?? '';
    if (!alias || !path) continue;

    const argsRaw = parts[2] ?? '';
    const note = parts.slice(3).join('|').trim();

    out.push({
      alias,
      path,
      args: argsRaw ? argsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [],
      note,
    });
  }
  return out;
}
