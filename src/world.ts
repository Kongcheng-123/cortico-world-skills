/**
 * 做法库 World 的实例。
 *
 * 四个工具：
 * - skill_list  列出做法名和触发条件（索引全文）
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
import type { SkillsConfig } from './config.ts';
import { SkillIndex } from './skill.ts';
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

  constructor(opts: SkillsWorldOptions) {
    this.id = opts.id;
    this.cfg = opts.cfg;
    this.botDir = opts.botDir;
    // skillDir 留空时落到部署目录的 workspace/skills
    const dir = this.cfg.skillDir || join(this.botDir, 'workspace', 'skills');
    this.index = new SkillIndex(dir);
  }

  /** 做法目录的绝对路径，工具回执里用来告诉用户文件在哪。 */
  private get dir(): string {
    return this.cfg.skillDir || join(this.botDir, 'workspace', 'skills');
  }

  /** 脚本执行的工作目录：有 allowRoot 用它，没有就用部署目录。 */
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
      text = await this.index.text();
    } catch {
      text = '（读取做法目录失败）';
    }
    return { 'skills.index': text };
  }

  tools(): ToolDef[] {
    return [
      {
        name: 'skill_list',
        description:
          '列出所有做法文档的名字和触发条件。不确定该怎么做、或者要动手做一件事之前，先看这里有没有对应做法。',
        parameters: { type: 'object', properties: {}, required: [] },
        tags: ['read'],
        barrierAfter: true,
        handler: async () => {
          const text = await this.index.text();
          const list = await this.index.list();
          if (!list.length) {
            return `做法目录是空的（${this.dir}）。没有可用的做法文档。`;
          }
          return `共 ${list.length} 份做法：\n\n${text}\n\n要看哪一份的全文，用 skill_read 传名字。`;
        },
      },
      {
        name: 'skill_read',
        description:
          '读一份做法文档的全文，照着做。名字先用 skill_list 查，传文件名或做法名都行。',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: '做法名或者文件名' },
          },
          required: ['name'],
        },
        tags: ['read'],
        barrierAfter: true,
        handler: async (args) => {
          const key = str(args, 'name');
          if (!key) return '要给一个做法名。先用 skill_list 看看有哪些。';
          const found = await this.index.read(key);
          if (!found) {
            const text = await this.index.text();
            return `没有找到「${key}」这份做法。现有的是：\n\n${text}`;
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

          if (!this.cfg.whitelist.length) {
            lines.push('白名单是空的，现在什么都跑不了。');
            return lines.join('\n');
          }
          lines.push('可以跑这些（用 alias 调用）：');
          for (const w of this.cfg.whitelist) {
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

  /** WebUI 里的配置项与环境提示模板。 */
  webUi() {
    return {
      promptDocs: [
        {
          key: 'worlds.skills.envPrompt',
          title: '做法库 · 环境提示词',
          description: '告诉她有哪些做法可查、脚本怎么调用。',
          path: ENV_PROMPT_FILE,
          role: 'envPrompt' as const,
          vars: [
            { name: 'skills.index', description: '做法索引，每个做法一行。' },
          ],
        },
      ],
    };
  }

  async start(_host: WorldHost): Promise<void> {
    // 没有常驻资源要起
  }

  async stop(): Promise<void> {
    // 没有常驻资源要停
  }
}
