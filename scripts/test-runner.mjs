// runner.ts 的独立自测：验证白名单、路径穿越、超时、截断、元字符。
// 全部基于仓库根，换机器也能跑。
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { runWhitelisted, runOpen, insideRoot, formatResult } from '../src/runner.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const cfg = {
  enabled: true,
  skillDir: '',
  allowRoot: ROOT,
  mode: 'whitelist',
  whitelist: [
    { alias: '回显', path: 'examples/echo.py', args: ['one'] },
  ],
  timeoutMs: 30_000,
  maxOutputChars: 4000,
};

const CWD = ROOT;

console.log('=== 1. 路径校验 ===');
console.log('根内:', insideRoot(`${ROOT}/examples/echo.py`, ROOT));
console.log('根外:', insideRoot(`${ROOT}/../outside.py`, ROOT));
console.log('穿越:', insideRoot(`${ROOT}/../Windows/cmd.exe`, ROOT));

console.log('\n=== 2. 白名单没登记的 alias ===');
const r1 = await runWhitelisted(cfg, '不存在的名字', CWD);
console.log('error' in r1 ? r1.error : '不该成功');

console.log('\n=== 3. 白名单路径穿越（伪造条目）===');
const evil = { ...cfg, whitelist: [{ alias: '坏东西', path: '../Windows/system32/cmd.exe' }] };
const r2 = await runWhitelisted(evil, '坏东西', CWD);
console.log('error' in r2 ? r2.error : '不该成功');

console.log('\n=== 4. 真跑一个白名单脚本 ===');
const r3 = await runWhitelisted(cfg, '回显', CWD);
if ('error' in r3) console.log('失败:', r3.error);
else console.log(formatResult(r3, cfg.maxOutputChars).slice(0, 300));

console.log('\n=== 5. 超时（timeout 设成 1 毫秒）===');
const fast = { ...cfg, timeoutMs: 1 };
const r4 = await runWhitelisted(fast, '回显', CWD);
if ('error' in r4) console.log('失败:', r4.error);
else console.log('timedOut =', r4.timedOut);

console.log('\n=== 6. 输出截断（maxChars 设成 3）===');
const tiny = { ...cfg, maxOutputChars: 3 };
const r5 = await runWhitelisted(tiny, '回显', CWD);
if ('error' in r5) console.log('失败:', r5.error);
else console.log('truncated =', r5.truncated, '| 内容:', JSON.stringify(r5.out.slice(0, 50)));

console.log('\n=== 6b. 大量输出被截到 4000 ===');
const bulk = { ...cfg, mode: 'open', maxOutputChars: 4000 };
const rb = await runOpen(bulk, 'python', ['-c', 'print("x"*20000)'], CWD);
if ('error' in rb) console.log('失败:', rb.error);
else console.log('truncated =', rb.truncated, '| 长度', rb.out.length, '（应为 4000 出头）');

console.log('\n=== 7. 不限模式的元字符 ===');
const openCfg = { ...cfg, mode: 'open' };
console.log('a && b :', 'error' in await runOpen(openCfg, 'echo', ['a && b'], CWD) ? '被拒 ✓' : '没拦住 ✗');
console.log('管道命令:', 'error' in await runOpen(openCfg, 'cat x | rm y', [], CWD) ? '被拒 ✓' : '没拦住 ✗');

console.log('\n=== 8. 不限模式正常调用 ===');
const r6 = await runOpen(openCfg, 'python', ['--version'], CWD);
if ('error' in r6) console.log('失败:', r6.error);
else console.log(formatResult(r6, 200));
