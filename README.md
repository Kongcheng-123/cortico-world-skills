# cortico-world-skills

给 [Cortico](https://github.com/Pal-AI-Lab/Cortico) / Coopanion 桌宠加一套**技能库**（skill）和**受限脚本执行**。

桌宠平时只在系统提示里带一份索引（几个技能名 + 一句话触发条件），需要时才把正文读进对话。所以它能记住很多「怎么做事」，但不会因此撑爆上下文。

## 文档

| 想看什么 | 去哪 |
|---|---|
| 写一份自己的技能 | [docs/SKILL-FORMAT.md](docs/SKILL-FORMAT.md) |
| 权限模型、能拦什么拦不住什么 | [docs/SECURITY.md](docs/SECURITY.md) |
| 改这个扩展的代码 | [docs/DEVELOPING.md](docs/DEVELOPING.md) |
| 装不上、不显示、不生效 | [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) |
| Cortico World API 长什么样 | [docs/API-NOTES.md](docs/API-NOTES.md) |

## 五分钟跑起来

```bash
# 1. 装（先停掉 Cortico，运行中装会撞 EPERM 把包搞坏）
cd <cortico 数据目录>/extensions
#    在 package.json 的 dependencies 里加一行
#    "cortico-world-skills": "file:/你的/项目/路径"
npm install

# 2. 开配置
#    config.json 的 worlds 段加：
#    "skills": { "enabled": true, "allowRoot": "你的脚本目录", "slot1": "..." }

# 3. 启动 Cortico，控制台左侧应该出现「技能与脚本」
```

**验证装好了**：

```bash
curl -s http://127.0.0.1:17788/api/tool-schemas | grep -o 'skill_list\|skill_read\|script_list\|script_run'
```

四个都出来就行。

**写第一份技能**：在 `<部署目录>/workspace/skills/` 丢一个 `.md`：

```markdown
---
name: 泡茶
when: 用户说想喝茶的时候
---

先烧水，85 度左右，绿茶别用沸水。
```

跟她说「你会哪些技能」，她应该会调 `skill_list` 报出来。

## 为什么需要它

Cortico 的 World 扩展能提供工具，但每次对话都注入一整段提示词。如果你的桌宠要会十几种做法（一起看剧情、记录设定、整理笔记……），把这些全塞进系统提示，每轮都要重算，prompt cache 直接失效。

这个扩展的思路是：

```
常驻    做法索引（名字 + 一句话），一份做法约 30-40 字符
按需    正文，只在 skill_read 时作为工具回执进对话
```

实测两份做法时，整个环境段是 **236 字符**。

## 安装

```bash
cd <你的 Cortico 数据目录>/extensions
pnpm add cortico-world-skills
```

装完重启 Cortico 进程（ESM 模块缓存不支持热更）。

然后在 `config.json` 的 `worlds` 段加：

```json
"skills": {
  "enabled": true,
  "skillDir": "",
  "allowRoot": "/path/to/your/workspace",
  "mode": "whitelist",
  "timeoutMs": 60000,
  "maxOutputChars": 4000,
  "slot1": "查看状态 | scripts/status.py | status | 看服务在不在跑",
  "slot2": "",
  "slot3": "",
  "slot4": "",
  "slot5": "",
  "slot6": "",
  "slot7": "",
  "slot8": ""
}
```

- `skillDir` 留空时用 `<部署目录>/workspace/skills`
- `allowRoot` 是脚本执行的根目录，路径校验以它为界
- `slot1`..`slot8` 是白名单，格式 `别名 | 脚本路径 | 参数,参数 | 说明`

**白名单为什么要用槽位**：Cortico 的配置表单只支持 `integer` / `number` / `boolean` / `string` / 二元数组，对象数组会渲染成只读。所以用 8 个字符串槽位表达列表，在控制台里能直接改。

## 写一份做法

在做法目录里放一个 `.md`：

```markdown
---
name: 一起看剧情
when: 用户说一起看、开始听、玩剧情的时候
---

# 一起看剧情

正文写你希望它照着做的步骤。
```

`name` 和 `when` 会进索引（常驻），正文只在调用时出现。frontmatter 可以省略，那就用文件名当 name、第一行引用块当 when。

详见 [docs/SKILL-FORMAT.md](docs/SKILL-FORMAT.md)。

## 脚本权限

两档模式，**只能由你在配置文件里切换**（模型的入参里没有这个字段）：

### whitelist（默认）

只跑登记过的脚本。模型传的是 `alias`，不接受路径。

```json
"slot1": "查看状态 | scripts/status.py | status | 看服务在不在跑"
```

三道保护：

- 路径 resolve 后必须落在 `allowRoot` 之内，`../` 穿越会被拒
- 参数固定写死，模型改不了
- 输出截断到 `maxOutputChars`，超时强制结束

### open

接受任意命令，但仍然：

- 拒绝 shell 元字符（`; & | > < \` $`）
- 有超时
- 有输出截断

切到 open 等于把执行权交出去，**只在你自己盯着的时候用**。

详见 [docs/SECURITY.md](docs/SECURITY.md)。

## 四个工具

| 工具 | 作用 |
|---|---|
| `skill_list` | 列出所有做法名和触发条件 |
| `skill_read` | 读某一份的正文 |
| `script_list` | 列出能跑的脚本和当前模式 |
| `script_run` | 跑脚本 |

## 配置项

| 键 | 默认 | 说明 |
|---|---|---|
| `enabled` | `false` | 是否启用 |
| `skillDir` | `""` | 做法目录，空则用 `workspace/skills` |
| `allowRoot` | `""` | 脚本执行根目录 |
| `mode` | `"whitelist"` | `whitelist` 或 `open` |
| `slot1`..`slot8` | `""` | 白名单槽位，格式 `别名 \| 路径 \| 参数 \| 说明` |
| `timeoutMs` | `60000` | 单次执行超时 |
| `maxOutputChars` | `4000` | 输出上限 |

## 适配版本

- Cortico 扩展契约 `api: 6`
- 在 Coopanion 0.2.9 上实测通过
- Node 24（用 strip-types 直接跑 `.ts`，项目不含编译步骤）

写扩展时有个坑：Node 的 strip-only 模式**不支持** TypeScript 的 `enum`、`namespace`、参数属性（`constructor(private x)`）。用了会报 `TypeScript parameter property is not supported in strip-only mode`。

## 许可证

MIT
