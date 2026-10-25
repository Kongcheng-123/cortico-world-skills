/**
 * 技能与脚本 World 的实例。
 *
 * 四个工具：
 * - skill_list  列出技能名和触发条件（索引全文）
 * - skill_read  读某一份的正文
 * - script_list 列出能跑的脚本和当前权限模式
 * - script_run  跑脚本
 *
 * 上下文纪律：索引只在 envPromptVars() 里出现一次，正文永远只在工具回执里。
 */
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { readdir } from 'node:fs/promises';
import type { World, WorldHost, ToolDef } from 'cortico/core/types.ts';
import { parseSlots, SLOT_COUNT, type SkillsConfig } from './config.ts';
import { SkillIndex, type SkillMeta } from './skill.ts';
import { formatResult, runOpen, runWhitelisted } from './runner.ts';

const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

export interface SkillsWorldOptions {
  id: string;
  cfg: SkillsConfig;
  botDir: string;
}

/** 把工具参数里的字符串取出来，类型不对就给空串。 */
function str(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v.trim() : '';
}

/** 参数里的字符串数组。 */
function strList(args: Record<string, unknown>, key: string): string[] {
  const v = args[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

export class SkillsWorld implements World {
  readonly id: string;
  private readonly cfg: SkillsConfig;
  private readonly botDir: string;
  private readonly index: SkillIndex;
  /** WebUI 每次请求都能读到的最新快照，由 envPromptVars / 工具调用顺手更新。 */
  private snapshot: SkillMeta[] = [];

  constructor(opts: SkillsWorldOptions) {
    this.id = opts.id;
    this.cfg = opts.cfg;
    this.botDir = opts.botDir;
    const dir = this.cfg.skillDir || join(this.botDir, 'workspace', 'skills');
    this.index = new SkillIndex(dir);
  }

  /** 技能目录的绝对路径。 */
  private get dir(): string {
    return this.cfg.skillDir || join(this.botDir, 'workspace', 'skills');
  }

  /** 脚本执行的工作目录。 */
  private get cwd(): string {
    return this.cfg.allowRoot || this.botDir;
  }

  /**
   * 环境段。
   *
   * 只提供索引。做法正文不进这里，否则每一轮都要重算，prompt cache 直接失效。
   */
  async envPromptVars(): Promise<Record<string, string>> {
    let text: string;
    try {
      this.snapshot = await this.index.list();
      text = await this.index.text();
    } catch {
      text = '（读取技能目录失败）';
    }
    return { 'skills.index': text };
  }

  tools(): ToolDef[] {
    return [
      {
        name: 'skill_list',
        description:
          '列出所有技能文档的名字和触发条件。不确定该怎么做、或者要动手做一件事之前，先看这里有没有对应技能。',
        parameters: { type: 'object', properties: {}, required: [] },
        tags: ['read'],
        barrierAfter: true,
        handler: async () => {
          const list = await this.index.list();
          this.snapshot = list;
          if (!list.length) {
            return `技能目录是空的（${this.dir}）。没有可用的技能文档。`;
          }
          const text = await this.index.text();
          return `共 ${list.length} 份技能：\n\n${text}\n\n要看哪一份的全文，用 skill_read 传名字。`;
        },
      },
      {
        name: 'skill_read',
        description:
          '读一份技能文档的全文，照着做。名字先用 skill_list 查，传文件名或技能名都行。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '技能名或者文件名' },
          },
          required: ['name'],
        },
        tags: ['read'],
        barrierAfter: true,
        handler: async (args) => {
          const key = str(args, 'name');
          if (!key) return '要给一个技能名。先用 skill_list 看看有哪些。';
          const found = await this.index.read(key);
          if (!found) {
            const text = await this.index.text();
            return `没有找到「${key}」这份技能。现有的是：\n\n${text}`;
          }
          return `# ${found.meta.name}\n\n${found.body}`;
        },
      },
      {
        name: 'script_list',
        description: '列出当前能跑的脚本，以及当前是什么权限模式。',
        parameters: { type: 'object', properties: {}, required: [] },
        tags: ['read'],
        handler: async () => {
          const mode = this.cfg.mode === 'open' ? '不限（可以跑任意命令）' : '白名单（只能跑登记过的）';
          const lines: string[] = [`当前模式：${mode}`, `执行目录：${this.cwd}`, ''];

          if (this.cfg.mode === 'open') {
            let files: string[] = [];
            try {
              files = (await readdir(this.cwd)).slice(0, 40);
            } catch {
              files = [];
            }
            lines.push('执行目录下能看到这些（前 40 项）：');
            lines.push(files.length ? files.map((f) => `- ${f}`).join('\n') : '（读不到目录）');
            lines.push('');
            lines.push('不限模式下直接传 command 和 args。');
            return lines.join('\n');
          }

          const list = parseSlots(this.cfg);
          if (!list.length) {
            lines.push('白名单是空的，现在什么都跑不了。');
            return lines.join('\n');
          }
          lines.push('可以跑这些（用 alias 调用）：');
          for (const w of list) {
            const note = w.note ? ` —— ${w.note}` : '';
            lines.push(`- ${w.alias}${note}（${w.path}）`);
          }
          return lines.join('\n');
        },
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
            args: {
              type: 'array',
              items: { type: 'string' },
              description: '不限模式下的参数',
            },
          },
          required: [],
        },
        tags: ['act'],
        interruptible: true,
        handler: async (args) => {
          const alias = str(args, 'alias');
          const command = str(args, 'command');
          const argv = strList(args, 'args');

          const useOpen = this.cfg.mode === 'open' && command;

          const result = useOpen
            ? await runOpen(this.cfg, command, argv, this.cwd)
            : await runWhitelisted(this.cfg, alias || command, this.cwd);

          if ('error' in result) return result.error;
          return formatResult(result, this.cfg.maxOutputChars);
        },
      },
    ];
  }

  /** 配置页：用法说明 + 可编辑项。 */
  webUi() {
    const skills = this.snapshot;
    const scripts = parseSlots(this.cfg);

    const slots: Record<string, unknown> = {};
    for (let i = 1; i <= SLOT_COUNT; i += 1) {
      slots[`worlds.skills.slot${i}`] = {
        type: 'string',
        title: `脚本 ${i}`,
        'x-hot': true,
        description:
          i === 1
            ? '格式：别名 | 脚本路径（相对执行根目录）| 参数,参数 | 说明。只有前两段必需。例：查看状态 | scripts/status.py | status | 看服务在不在跑'
            : '同上；留空就是不用这个格子。',
      };
    }

    return {
      config: [
        {
          id: 'world:skills',
          owner: `world:${this.id}`,
          schema: {
            type: 'object',
            title: '技能与脚本',
            description:
              '给桌宠两样东西：能按需查阅的技能文档，和受权限约束的脚本执行。\n\n'
              + '【技能】在「技能目录」里放 .md 文件，一个文件一份技能。文件开头写 name（名字）和 when（什么时候该用），'
              + '这两行会进她的上下文，每份约 30 字；正文平时不占地方，她用到时才读进来。\n'
              + '现在有 ' + skills.length + ' 份，具体的名字和触发词她调 skill_list 就能列出来。\n\n'
              + '【脚本】在下面 8 个槽位里登记，一行一条。登记了哪些、每行写了什么，她调 script_list 能看到。'
              + '现在登记了 ' + scripts.length + ' 条。\n\n'
              + '【权限】她只能跑登记过的，还是能跑任意命令，取决于权限模式。'
              + '这个开关只有你能改，她手里没有切换它的入口。\n\n'
              + '改技能文件、权限模式、槽位、超时都立即生效；改两个目录需要重启进程。',
            properties: {
              'worlds.skills.mode': {
                type: 'string',
                title: '脚本权限模式',
                enum: ['whitelist', 'open'],
                'x-hot': true,
                description:
                  'whitelist：只跑下面槽位里登记的脚本，路径锁在执行根目录内，模型改不了参数。'
                  + 'open：接受任意命令，只拦 shell 元字符。'
                  + '这一项只有你能改，模型没有切换入口——这正是白名单有意义的前提。',
              },
              'worlds.skills.allowRoot': {
                type: 'string',
                title: '脚本执行根目录',
                'x-path': { kind: 'directory' },
                'x-hot': false,
                description: '槽位里的路径都相对这个目录，且不能越出它。留空时用部署目录。',
              },
              'worlds.skills.skillDir': {
                type: 'string',
                title: '技能目录',
                'x-path': { kind: 'directory' },
                'x-hot': false,
                description: '放 .md 做法文件的目录。留空用 <部署目录>/workspace/skills。',
              },
              'worlds.skills.timeoutMs': {
                type: 'integer',
                title: '单次执行超时',
                minimum: 1000,
                maximum: 600000,
                'x-suffix': '毫秒',
                'x-hot': true,
                description: '超时直接强杀。启动慢的服务可以调大。',
              },
              'worlds.skills.maxOutputChars': {
                type: 'integer',
                title: '输出上限',
                minimum: 200,
                maximum: 20000,
                'x-suffix': '字符',
                'x-hot': true,
                description: '超出的部分截断，防止一个刷屏的脚本把上下文冲掉。',
              },
              ...slots,
            },
          },
        } as never,
      ],
      promptDocs: [
        {
          key: 'worlds.skills.envPrompt',
          title: '技能与脚本 · 环境提示词',
          description: '告诉她有哪些做法可查、脚本怎么调用。',
          path: ENV_PROMPT_FILE,
          role: 'envPrompt' as const,
          vars: [
            { name: 'skills.index', description: '技能索引，每个做法一行。' },
          ],
        },
      ],
    };
  }

  async start(_host: WorldHost): Promise<void> {
    // 预读一次快照，这样配置页一打开就有数据，不用等她调 skill_list
    try {
      this.snapshot = await this.index.list();
    } catch {
      this.snapshot = [];
    }
  }

  async stop(): Promise<void> {
    // 没有常驻资源要停
  }
}
