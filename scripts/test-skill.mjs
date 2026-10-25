// skill.ts 的独立自测：不依赖框架，直接用 node 跑。
// 路径基于仓库根，换机器也能跑。
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { SkillIndex, scanSkills, renderIndex } from '../src/skill.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DIR = join(ROOT, 'examples', 'skills');

const list = await scanSkills(DIR);
console.log('=== 扫到', list.length, '个做法 ===');
for (const s of list) console.log(' ', s.name, '|', s.file, '|', s.when.slice(0, 30));

const idx = renderIndex(list);
console.log('\n=== 索引全文 ===');
console.log(idx);
console.log('\n索引字符数:', idx.length);

const store = new SkillIndex(DIR);

// 缓存测试：连调三次，看 mtime 是否复用
const t0 = Date.now();
await store.text();
await store.text();
await store.text();
console.log('三次 text() 耗时:', Date.now() - t0, 'ms（有缓存应该很快）');

// 按名字读正文
const one = await store.read('一起看剧情');
console.log('\n=== read("一起看剧情") ===');
if (one) {
  console.log('命中:', one.meta.name);
  console.log('正文字符数:', one.body.length);
  console.log('前 60 字:', one.body.slice(0, 60).replace(/\n/g, ' '));
} else {
  console.log('没找到');
}

// 按文件名读
const two = await store.read('记录世界观.md');
console.log('\n按文件名找:', two ? two.meta.name : '没找到');

// 找不存在的
const three = await store.read('压根没有这个东西');
console.log('找不存在的:', three === null ? '正确返回 null' : '有 bug');
