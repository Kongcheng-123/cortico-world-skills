## 这个 PR 做了什么

（一句话）

## 为什么

（解决的问题或者动机）

## 影响范围

- [ ] 只改文档
- [ ] 改了技能机制（`src/skill.ts`）
- [ ] 改了脚本执行（`src/runner.ts`）——**安全边界，需重点审**
- [ ] 改了配置项
- [ ] 改了常驻提示词（`src/ENV_PROMPT.md`）——**注意上下文成本**

## 自测

- [ ] `node scripts/test-skill.mjs` 通过
- [ ] `node scripts/test-runner.mjs` 通过
- [ ] 在真实 Cortico 里装过、跑过

## 上下文成本

如果改了常驻内容（环境提示、索引格式），贴一下改前改后的字符数：

```
改前：___ 字符
改后：___ 字符
```

查法：

```bash
curl -s http://127.0.0.1:17788/api/prompts/prefix | python -c "
import json,sys
d=json.load(sys.stdin)
for s in d['segments']:
    if 'skills' in s['title']: print(len(s['text']))
"
```

## 有没有破坏这三条

- [ ] 技能正文仍然只在 `skill_read` 回执里，没进环境提示
- [ ] 配置项没有用对象数组
- [ ] 没给 `script_run` 加 mode 参数
