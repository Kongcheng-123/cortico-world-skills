<!-- Owner: src/index.ts, src/world.ts, src/config.ts, src/skill.ts, src/runner.ts, src/ENV_PROMPT.md -->

# Skills & Scripts

Cortico 的技能库与受限脚本执行 World 扩展。桌宠平时只在系统提示里带一份索引（每个技能一行：名字 + 一句话触发条件），真正要用时再读全文；同时提供一个受权限约束的脚本执行通道，让她能启动服务、跑维护脚本，但碰不到白名单之外的东西。

技能是一个 markdown 文件，不需要改代码、不需要重新编译。脚本权限分白名单和不限两档，**由配置文件的作者决定，模型没有切换入口**。

## 安装与配置

[![npm](https://img.shields.io/npm/v/cortico-world-skills.svg)](https://www.npmjs.com/package/cortico-world-skills)

要求 Node.js 22 或更新版本，以及 Cortico World API 6。在 Cortico 部署的 `extensions/` 目录安装：

```powershell
Set-Location "<Cortico 数据目录>\extensions"
corepack pnpm add --ignore-workspace cortico-world-skills
```

装完启动 Cortico，在控制台左侧找到「技能与脚本」。

**从 GitHub 装**（想跟最新提交，或者 npm 装不上时）：

```powershell
corepack pnpm add --ignore-workspace github:Kongcheng-123/cortico-world-skills
```

首次使用要填两个目录：

| 配置项 | 说明 |
| --- | --- |
| 技能目录 | 放 `.md` 技能文件的目录。留空时用 `<部署目录>/workspace/skills` |
| 脚本执行根目录 | 白名单里的路径都相对它，且不能越出它。留空时用部署目录 |

然后在 8 个槽位里登记可执行的脚本，格式：

```
别名 | 脚本路径 | 参数,参数 | 说明
```

例子：

```
查看服务状态 | scripts/status.py | status | 看转储服务在不在跑
停止服务 | scripts/status.py | stop | 停掉服务释放内存
```

只有前两段必需。**改完立即生效，不用重启**。

### 为什么白名单是槽位不是列表

Cortico 的配置表单只支持 `integer` / `number` / `boolean` / `string`（含 enum）和二元数组，对象数组会渲染成只读。所以用 8 个字符串槽位表达列表，你才能在控制台里直接改。

## World 兼容性

按 [Cortico World 兼容等级](https://github.com/Pal-AI-Lab/Cortico/blob/main/docs/world-compatibility.md)，本 World 的最低与完整等级均为 **L1**。

宿主须挂载工具、用 `envPromptVars()` 填充 `ENV_PROMPT.md` 并加入 system 前缀、调用 `start(host)` / `stop()`。本扩展不使用事件投递、实时输出或 `WorldHost.cognition`。挂载时须提供 `WorldContext` 的配置读取（`cfg` / `botDir`）；没有控制台时，在部署配置里手写 `worlds.skills` 段也能工作。

## 使用示例

环境提示词会指导 agent 在三种情况下调用：不确定怎么做时查技能，要动手时查脚本，被问到自己的本事时也先查一遍能力。

**列出技能**：

```json
{ "name": "skill_list", "arguments": {} }
```

返回：

```
共 3 份技能：

- 一起看剧情：用户说一起看、陪我看这段、开始听、玩剧情的时候
- 收工：用户说不玩了、不看了、停了、关了吧的时候
- 记录世界观：遇到没见过的地名、势力、术语，或者他问起某个设定的来历时

要看哪一份的全文，用 skill_read 传名字。
```

**读全文**：

```json
{ "name": "skill_read", "arguments": { "name": "一起看剧情" } }
```

**看能跑什么**：

```json
{ "name": "script_list", "arguments": {} }
```

**跑一个**（白名单模式，传别名）：

```json
{ "name": "script_run", "arguments": { "alias": "查看服务状态" } }
```

回执是脚本的真实输出，带执行的命令行，退出码非零时附在末尾。

## 写一个技能

在技能目录里放一个 `.md`：

```markdown
---
name: 泡茶
when: 用户说想喝茶、问怎么泡的时候
---

# 泡茶

先烧水，85 度左右。绿茶别用沸水。
```

`name` 和 `when` 进上下文（每份约 30 字），正文只在 `skill_read` 时进。`when` 写触发场景，不写功能描述——「用户说想喝茶」比「关于泡茶的说明」有用得多。

frontmatter 可以省略：文件名当 `name`，正文第一行引用块当 `when`。

详细格式和索引成本见 [docs/SKILL-FORMAT.md](docs/SKILL-FORMAT.md)。

## 上下文成本

这是整个扩展的设计前提。

| 内容 | 是否常驻 | 成本 |
| --- | --- | --- |
| 工具说明 | 是 | 约 300 字符 |
| 技能索引 | 是 | 每份约 30-40 字符 |
| 技能正文 | **否** | 只在 `skill_read` 的回执里 |
| 脚本输出 | **否** | 只在 `script_run` 的回执里，且截断到 4000 字符 |

三份技能时整个环境段实测 **314 字符**。二十份技能的索引约 700 字符，仍然不到一段普通提示词。

如果技能正文被拼进环境提示，prompt cache 会从 99.5% 掉到个位数——这是这套设计要避免的结果。

## 权限模型

两档，**只能由配置文件的作者切换**。`script_run` 的参数只有 `alias` / `command` / `args`，**没有 mode 字段**。

### whitelist（默认）

只跑槽位里登记过的脚本。四道保护：

1. 路径 resolve 后必须落在 `allowRoot` 之内，`../` 穿越被拒
2. `alias` 匹配配置里的条目，模型不能自己拼路径
3. 参数固定写死，模型改不了
4. 输出截断到 `maxOutputChars`，超时 `SIGKILL`

### open

接受任意命令，但仍然拒绝 shell 元字符（`; & | > < \` $`），仍然有超时和截断。

**这挡得住拼接注入，挡不住命令本身干坏事**。`rm -rf /` 里没有元字符。开 open 等于把执行权交出去，只在有人盯着的时候用。

详细边界见 [docs/SECURITY.md](docs/SECURITY.md)。

## 本地开发

扩展直接跑 `.ts`（Node 的 strip-types 模式），不需要编译。

```powershell
# 1. 先停 Cortico（运行中装包会撞 EPERM，把包搞成半损坏）
Get-Process Coopanion | Stop-Process -Force

# 2. 在 extensions/package.json 的 dependencies 里指向本地目录
#    本地开发用 file: 协议，写版本号会去 registry 找然后 404
"cortico-world-skills": "file:D:/path/to/cortico-world-skills"

# 3. 装
Set-Location "<Cortico 数据目录>\extensions"
npm install

# 4. 启动
Start-Process "C:\path\to\Coopanion.exe"
```

**自测**（不依赖框架，基于仓库根路径）：

```powershell
node scripts/test-skill.mjs      # 扫描、缓存、按名/按文件名读取
node scripts/test-runner.mjs     # 白名单、路径穿越、超时、截断、元字符
```

改了执行器必须跑 `test-runner`，那是安全边界。

**注意**：Node 的 strip-types 只擦类型不做转换，不能用 `enum`、`namespace`、参数属性（`constructor(private x: string)`）。用了会报 `TypeScript parameter property is not supported in strip-only mode`。

改代码前看 [docs/DEVELOPING.md](docs/DEVELOPING.md)，里面有「改什么去哪个文件」的对照表和架构说明。

## 文档

| 想看什么 | 去哪 |
| --- | --- |
| 写一份技能 | [docs/SKILL-FORMAT.md](docs/SKILL-FORMAT.md) |
| 权限模型 | [docs/SECURITY.md](docs/SECURITY.md) |
| 改代码 | [docs/DEVELOPING.md](docs/DEVELOPING.md) |
| 出问题了 | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| Cortico World API 备忘 | [docs/API-NOTES.md](docs/API-NOTES.md) |

## 许可证

MIT
