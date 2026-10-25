# 开发与维护

给以后要改这个扩展的人（包括几个月后的我自己）。

## 先看这里：改什么去哪个文件

| 想改的东西 | 去改 | 说明 |
|---|---|---|
| 技能的解析规则（frontmatter、退回逻辑） | `src/skill.ts` | `parseMeta` |
| 索引怎么渲染成一行行 | `src/skill.ts` | `renderIndex` |
| 缓存策略 | `src/skill.ts` | `SkillIndex` 类 |
| 脚本执行、超时、截断 | `src/runner.ts` | `runScript` |
| 路径校验、元字符拦截 | `src/runner.ts` | `insideRoot` / `checkEntry` |
| 工具的四个 handler | `src/world.ts` | `tools()` |
| 配置页长什么样 | `src/world.ts` | `webUi()` |
| 常驻提示词（进她上下文的 300 字） | `src/ENV_PROMPT.md` | 改完要重载前缀 |
| 配置字段和默认值 | `src/config.ts` | `SkillsConfig` |
| 白名单槽位解析 | `src/config.ts` | `parseSlots` |
| 工具的自描述（给市场看） | `describe.json` | 和 `index.ts` 的 `TOOLS` 要一致 |

## 架构

```
config.json 的 worlds.skills 段
        │
        ├─→ config.ts   定义形状、默认值、槽位解析
        │
        └─→ world.ts    实例
              ├─ envPromptVars()  → 只输出索引（常驻，约 300 字）
              ├─ tools()          → 四个工具
              │     ├─ skill_list  ─→ skill.ts 的索引
              │     ├─ skill_read  ─→ skill.ts 的正文件
              │     ├─ script_list ─→ config.ts 的槽位
              │     └─ script_run  ─→ runner.ts 的执行
              └─ webUi()          → 配置页（config + promptDocs）
```

### 上下文成本的分界线

代码里有一条硬线，改的时候别破：

**常驻的只有 `envPromptVars()` 返回的东西**（索引，约 300 字符）。
**技能正文只能通过 `skill_read` 的回执进对话**，绝不能拼进环境提示。

破线的后果：每轮对话都要重算前缀，prompt cache 全部失效。实测正常时命中率 99.5%，破了会掉到个位数。

### 缓存策略

`SkillIndex` 用一个 mtime 判断目录有没有变：

```
refreshIfStale()  目录变了才读盘，返回新列表；没变返回 null
text()            没缓存过就调 refreshIfStale，然后返回缓存
list()            同上
find() / read()   基于 list()
```

只有 `refreshIfStale()` 会真正 `readdir` + `readFile`。所有读路径都走它，所以一次变化只扫一次。

**改动时注意**：不要在这几个方法里直接调 `scanSkills`，否则每轮对话都会重复读目录。

## 加一个工具

1. `src/world.ts` 的 `tools()` 里加一项：

```typescript
{
  name: 'my_tool',
  description: '给模型看的说明，写清什么情况下用',
  parameters: { type: 'object', properties: {...}, required: [...] },
  tags: ['read'],            // read / write / speak / act / flow / snapshot
  handler: async (args, ctx) => '返回给模型的文本',
}
```

2. `src/index.ts` 的 `TOOLS` 加同名的描述（给人看的 `summary`）
3. `describe.json` 同步
4. 重启验证：`curl http://127.0.0.1:17788/api/tool-schemas | grep my_tool`

**tags 怎么选**：不改外部状态用 `read`；改了用 `act`；对用户说话用 `speak`。

## 加一个配置项

在 `src/config.ts` 的 `SkillsConfig` 加字段 + `SKILLS_DEFAULTS` 加默认值，然后在 `src/world.ts` 的 `webUi()` 里加 schema：

```typescript
'worlds.skills.新字段': {
  type: 'string',           // integer / number / boolean / string
  title: '显示名',
  'x-hot': true,            // 改完立即生效，不用重启
  description: '这段话会显示在配置项下面',
}
```

**配置表单的硬限制**（`core/config-schema.ts` 定的）：

- 支持：`integer` / `number` / `boolean` / `string`（含 `enum` 下拉）/ 二元数组
- **不支持对象数组**，会渲染成只读 → 所以白名单用 `slot1..slotN` 字符串槽位
- `x-path: { kind: 'directory' }` 给目录选择器
- `x-suffix` 加单位显示
- `x-hot: false` 表示要重启

## 改常驻提示词

改 `src/ENV_PROMPT.md`，然后：

```bash
curl -X POST http://127.0.0.1:17788/api/session/reload-prefix \
  -H "Content-Type: application/json" -d '{}'
```

验证改了多少：

```bash
curl -s http://127.0.0.1:17788/api/prompts/prefix | python -c "
import json,sys
d = json.load(sys.stdin)
for s in d['segments']:
    if 'skills' in s['title']:
        print(len(s['text']), '字符')
        print(s['text'])
"
```

**预算线 900 字符**。超了说明索引太长，该去精简各技能的 `when`。

## 自测

```bash
node scripts/test-skill.mjs     # 扫描、缓存、按名/按文件名读取
node scripts/test-runner.mjs    # 白名单、路径穿越、超时、截断、元字符
```

两个脚本都不依赖框架，基于仓库根路径，换机器能直接跑。

**改了执行器必须跑 test-runner**，那是安全边界。

## 装到本地环境调试

```bash
# 扩展目录里加依赖（先停掉 Cortico，否则会撞 EPERM 把包搞坏）
cd <cortico 数据目录>/extensions
# package.json 里加 "cortico-world-skills": "file:/绝对/路径"
npm install
# 再启动
```

⚠️ **必须停进程再装**。运行时装会撞 `EPERM`，包会半损坏（目录还在但 `package.json` 没了），表现为「找不到模块」。

⚠️ **本地开发用 `file:` 协议**，写版本号会让包管理器去 registry 找，没发布就 404。

更详细的坑见 [API-NOTES.md](API-NOTES.md) 的「安装扩展时的坑」。

## Node 的 TypeScript 限制

Cortico 直接跑 `.ts`（strip-types 模式），**只擦类型不做转换**。所以不能用：

- `enum` → 用 `const` 对象 + `as const`
- `namespace`
- 参数属性 `constructor(private x: string)` → 显式声明字段再赋值

用了会报 `TypeScript parameter property is not supported in strip-only mode` 这类错误。

## 发布

```bash
npm pack                      # 检查打进去的文件
git tag -a v0.2.0 -m "..."
git push origin main --tags
gh release create v0.2.0 --title "..." --notes-file notes.md
```

`package.json` 的 `files` 字段只放 `src`、`describe.json`、文档。`scripts/` 和 `examples/` 靠 `.npmignore` 排除（但进 git）。
