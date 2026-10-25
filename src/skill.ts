/**
 * 技能文档（skill）的扫描与索引。
 *
 * 设计要点：
 * - 索引只含名字和一句话触发条件，正文一个字节都不进
 * - 按目录 mtime 缓存，目录没变就不重扫
 * - 不依赖框架，纯 Node，可以单独跑测试
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

export interface SkillMeta {
  /** 显示名，来自 frontmatter 的 name，缺省用文件名。 */
  name: string;
  /** 一句话：什么情况下该用这个做法。 */
  when: string;
  /** 文件名，skill_read 用它定位。 */
  file: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

/** 从一个 md 文件里读元信息。正文不碰。 */
export function parseMeta(file: string, text: string): SkillMeta {
  let name = file.replace(/\.md$/i, '');
  let when = '';

  const fm = FRONTMATTER.exec(text);
  if (fm) {
    const head = fm[1];
    const nm = /^name:\s*(.+)$/m.exec(head);
    const wh = /^when:\s*(.+)$/m.exec(head);
    if (nm) name = nm[1].trim().replace(/^["']|["']$/g, '');
    if (wh) when = wh[1].trim().replace(/^["']|["']$/g, '');
  }

  // frontmatter 没写 when 时，退回到正文第一行引用块
  if (!when) {
    const body = fm ? text.slice(fm[0].length) : text;
    const quote = body.split(/\r?\n/).find((line) => line.trim().startsWith('>'));
    if (quote) when = quote.replace(/^>\s*/, '').trim();
  }

  return { name, when, file };
}

/** 扫目录，读每个 md 的元信息。 */
export async function scanSkills(dir: string): Promise<SkillMeta[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.md'));
  } catch {
    return []; // 目录不存在等于没有做法，不算错误
  }

  const out: SkillMeta[] = [];
  for (const file of files.sort()) {
    try {
      const text = await readFile(join(dir, file), 'utf8');
      out.push(parseMeta(file, text));
    } catch {
      // 单个文件读不了就跳过，不影响其他
    }
  }
  return out;
}

/** 把元信息渲染成索引文本。每个做法一行。 */
export function renderIndex(list: readonly SkillMeta[]): string {
  if (!list.length) return '（还没有任何技能文档）';
  return list
    .map((s) => (s.when ? `- ${s.name}：${s.when}` : `- ${s.name}`))
    .join('\n');
}

/** 索引文本的字符数，用来盯上下文预算。 */
export function indexSize(list: readonly SkillMeta[]): number {
  return renderIndex(list).length;
}

/**
 * 带缓存的索引持有者。
 *
 * 每轮对话都可能问一次，所以不能每次都扫盘。用目录 mtime 判断要不要重建。
 */
export class SkillIndex {
  private cached: string | null = null;
  private lastMtime = -1;

  /** 显式字段，不用参数属性：Node 的 strip-only 模式不支持后者。 */
  private readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
  }

  /** 目录的 mtime，取不到返回 -1。 */
  private async mtime(): Promise<number> {
    try {
      return (await stat(this.dir)).mtimeMs;
    } catch {
      return -1;
    }
  }

  /** 拿索引文本，必要时重扫。 */
  async text(): Promise<string> {
    const m = await this.mtime();
    if (this.cached !== null && m === this.lastMtime) return this.cached;

    const list = await scanSkills(this.dir);
    this.cached = renderIndex(list);
    this.lastMtime = m;
    return this.cached;
  }

  /** 拿完整元信息（skill_read 要用文件路径）。 */
  async list(): Promise<SkillMeta[]> {
    return scanSkills(this.dir);
  }

  /** 按名字或文件名找一项。 */
  async find(key: string): Promise<SkillMeta | null> {
    const list = await scanSkills(this.dir);
    const k = key.trim();
    return (
      list.find((s) => s.name === k) ??
      list.find((s) => s.file === k) ??
      list.find((s) => s.file.replace(/\.md$/i, '') === k) ??
      list.find((s) => s.name.includes(k)) ??
      null
    );
  }

  /** 读某个做法的正文（去掉 frontmatter）。 */
  async read(key: string): Promise<{ meta: SkillMeta; body: string } | null> {
    const meta = await this.find(key);
    if (!meta) return null;
    const raw = await readFile(join(this.dir, meta.file), 'utf8');
    const fm = FRONTMATTER.exec(raw);
    const body = fm ? raw.slice(fm[0].length).trim() : raw.trim();
    return { meta, body };
  }
}
