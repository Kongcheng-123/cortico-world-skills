/**
 * 技能与脚本（Skills）：一个 Cortico World 扩展。
 *
 * 给桌宠两样东西：按需读取的技能文档，和受权限约束的脚本执行。
 * 常驻上下文只有索引和工具说明，文档正文只在调用时进对话。
 */
import type { WorldDescribe, WorldDefinition } from 'cortico/world.ts';
import type { ToolDescribe } from 'cortico/core/types.ts';
import { SKILLS_DEFAULTS, SKILLS_ID, type SkillsConfig } from './config.ts';
import { SkillsWorld } from './world.ts';

const TOOLS: ToolDescribe[] = [
  {
    name: 'skill_list',
    description:
      '列出所有技能文档的名字和触发条件。不确定该怎么做、或者要动手做一件事之前，先看这里有没有对应技能。',
    parameters: { type: 'object', properties: {}, required: [] },
    tags: ['read'],
    summary: '列出所有可用的技能文档',
  },
  {
    name: 'skill_read',
    description:
      '读一份技能文档的全文，照着做。名字先用 skill_list 查，传文件名或技能名都行。',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: '技能名或者文件名' } },
      required: ['name'],
    },
    tags: ['read'],
    summary: '读一份技能的全文',
  },
  {
    name: 'script_list',
    description: '列出当前能跑的脚本，以及当前是什么权限模式。',
    parameters: { type: 'object', properties: {}, required: [] },
    tags: ['read'],
    summary: '列出可执行的脚本和权限模式',
  },
  {
    name: 'script_run',
    description:
      '跑一个脚本。白名单模式下传 alias；不限模式下传 command 和 args。跑之前先用 script_list 看有什么可跑。',
    parameters: {
      type: 'object',
      properties: {
        alias: { type: 'string', description: '白名单里的名字' },
        command: { type: 'string', description: '不限模式下的可执行文件' },
        args: { type: 'array', items: { type: 'string' }, description: '不限模式下的参数' },
      },
      required: [],
    },
    tags: ['act'],
    summary: '执行一个脚本',
  },
];

const DESCRIBE: WorldDescribe = {
  tools: TOOLS,
  events: [],
};

const definition: WorldDefinition<SkillsConfig> = {
  id: SKILLS_ID,
  label: '技能与脚本',
  defaults: () => ({ ...SKILLS_DEFAULTS }),
  create: (ctx) => new SkillsWorld({
    id: ctx.id,
    cfg: ctx.cfg,
    botDir: ctx.botDir,
  }),
  describe: DESCRIBE,
};

export default definition;
