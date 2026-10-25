/**
 * 脚本执行。
 *
 * 两种权限模式：
 * - whitelist：只跑配置里点过名的脚本。模型传 alias，不接受路径。
 * - open：接受任意命令，但仍拒绝 shell 元字符、仍有超时和输出截断。
 *
 * 模式只能从配置读，模型的入参里没有这个字段。这一点是安全设计的根基：
 * 权限开关握在人手里，不交给模型。
 */
import { spawn } from 'node:child_process';
import { resolve, sep } from 'node:path';
import type { SkillsConfig, WhitelistEntry } from './config.ts';

export interface RunResult {
  code: number | null;
  out: string;
  truncated: boolean;
  /** 超时被杀。 */
  timedOut: boolean;
  /** 实际执行的命令，写进回执让她知道跑的是什么。 */
  command: string;
}

/** shell 元字符。两种模式下都不接受，避免拼接注入。 */
const SHELL_METACHARS = /[;&|><`$\n\r]/;

/** 目标路径是否落在根目录之内。 */
export function insideRoot(target: string, root: string): boolean {
  if (!root) return false;
  const t = resolve(target);
  const r = resolve(root);
  return t === r || t.startsWith(r.endsWith(sep) ? r : r + sep);
}

/** 校验一个白名单项能不能跑，返回拒绝原因或 null。 */
export function checkEntry(
  entry: WhitelistEntry,
  cfg: SkillsConfig,
): string | null {
  if (SHELL_METACHARS.test(entry.path)) return `「${entry.alias}」的路径含特殊字符，拒绝执行`;
  const full = resolve(cfg.allowRoot, entry.path);
  if (!insideRoot(full, cfg.allowRoot)) {
    return `「${entry.alias}」的路径越出了允许范围（${cfg.allowRoot}），拒绝执行`;
  }
  return null;
}

/** 起一个子进程，收输出，超时强杀。 */
export function runScript(
  bin: string,
  args: string[],
  opts: { cwd: string; timeoutMs: number; maxChars: number },
): Promise<RunResult> {
  const shown = [bin, ...args].join(' ');
  return new Promise((done) => {
    let child;
    try {
      child = spawn(bin, args, { cwd: opts.cwd, windowsHide: true });
    } catch (error) {
      done({
        code: -1,
        out: String(error),
        truncated: false,
        timedOut: false,
        command: shown,
      });
      return;
    }

    let buf = '';
    let truncated = false;
    let timedOut = false;

    const collect = (chunk: Buffer) => {
      if (buf.length >= opts.maxChars) {
        truncated = true;
        return;
      }
      buf += chunk.toString('utf8');
      if (buf.length > opts.maxChars) {
        buf = `${buf.slice(0, opts.maxChars)}\n…（输出超过 ${opts.maxChars} 字符，已截断）`;
        truncated = true;
      }
    };

    child.stdout?.on('data', collect);
    child.stderr?.on('data', collect);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, opts.timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, out: buf.trim(), truncated, timedOut, command: shown });
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      done({
        code: -1,
        out: String(error),
        truncated: false,
        timedOut: false,
        command: shown,
      });
    });
  });
}

/** 白名单模式：按 alias 找项并执行。 */
export async function runWhitelisted(
  cfg: SkillsConfig,
  alias: string,
  cwd: string,
): Promise<RunResult | { error: string }> {
  const entry = cfg.whitelist.find((w) => w.alias === alias.trim());
  if (!entry) {
    const names = cfg.whitelist.map((w) => w.alias).join('、') || '（一个都没配）';
    return { error: `没有叫「${alias}」的脚本。现在能跑的是：${names}` };
  }

  const bad = checkEntry(entry, cfg);
  if (bad) return { error: bad };

  const full = resolve(cfg.allowRoot, entry.path);
  // .py 用 python 解释器，其他直接执行
  const isPython = full.toLowerCase().endsWith('.py');
  const bin = isPython ? (process.env.PYTHON ?? 'python') : full;
  const args = isPython ? [full, ...(entry.args ?? [])] : (entry.args ?? []);

  return runScript(bin, args, {
    cwd,
    timeoutMs: cfg.timeoutMs,
    maxChars: cfg.maxOutputChars,
  });
}

/** 不限模式：接受任意命令。 */
export async function runOpen(
  cfg: SkillsConfig,
  command: string,
  args: string[],
  cwd: string,
): Promise<RunResult | { error: string }> {
  if (!command.trim()) return { error: 'command 不能为空' };
  if (SHELL_METACHARS.test(command)) {
    return { error: '命令里含 shell 元字符（;&|><`$），要不要试试拆成单条命令？' };
  }
  const badArg = args.find((a) => SHELL_METACHARS.test(a));
  if (badArg) {
    return { error: `参数「${badArg}」含 shell 元字符，拒绝执行` };
  }

  return runScript(command, args, {
    cwd,
    timeoutMs: cfg.timeoutMs,
    maxChars: cfg.maxOutputChars,
  });
}

/** 把执行结果整理成给模型看的文本。 */
export function formatResult(result: RunResult, maxChars: number): string {
  const head = `> ${result.command}`;
  if (result.timedOut) {
    return `${head}\n\n执行超时，已经被强制结束。输出到一半的内容：\n${result.out || '（没有输出）'}`;
  }
  const code = result.code === null ? '未知' : String(result.code);
  const body = result.out || '（没有输出）';
  const tail = result.code === 0 ? '' : `\n\n退出码 ${code}`;
  return `${head}\n\n${body}${tail}`.slice(0, maxChars + 200);
}
