# 贡献指南

## 提 issue 之前

先看 [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)。装不上、显示 0 份、桌宠不调工具这些都有对应条目。

提 bug 请用 issue 模板，填清楚版本、现象、日志。**贴日志前把 API 密钥和私人路径删掉。**

## 改代码

### 环境

- Node.js 22 以上
- Cortico 或 Coopanion，扩展 API 6

### 跑起来

```powershell
# 先停掉 Cortico —— 运行中装包会撞 EPERM，把包搞成半损坏
Get-Process Coopanion | Stop-Process -Force

# extensions/package.json 的 dependencies 里指向你的工作副本
"cortico-world-skills": "file:D:/path/to/your/fork"

Set-Location "<Cortico 数据目录>\extensions"
npm install

Start-Process "C:\path\to\Coopanion.exe"
```

详细步骤和坑见 [docs/DEVELOPING.md](docs/DEVELOPING.md)。

### 自测

提交前跑这两个，都必须过：

```powershell
node scripts/test-skill.mjs
node scripts/test-runner.mjs
```

`test-runner` 覆盖安全边界（路径穿越、超时、截断、元字符拦截），动了 `src/runner.ts` 一定要跑。

### 三条硬约束

1. **技能正文不能拼进环境提示**，只能通过 `skill_read` 的回执进对话。破了这条，prompt cache 从 99.5% 掉到个位数
2. **配置项不能用对象数组**，Cortico 的表单只支持基础类型和二元数组
3. **Node strip-types 不支持 `enum` / `namespace` / 参数属性**

### 提交信息

```
feat: 一句话说做了什么
fix: 一句话说修了什么
docs: 文档改动
refactor: 不改行为的重构
```

正文里说清「为什么」，不要只重复标题。

## 加技能示例

`examples/skills/` 下放的是能直接用的示例技能。想加新的，照现有格式写，并且确保：

- `when` 是触发场景，不是功能描述
- 正文控制在几百字（读一次的成本要能接受）
- 不依赖特定的外部路径

## 不接受的东西

- **把技能全文拼进系统提示**的做法。这是设计上明确要避免的，PR 不会被合
- **绕过路径校验**的改动，包括「宽松模式」「信任本地路径」这类开关
- 给 `script_run` 加 `mode` 参数。权限开关必须在配置里，不能在工具入参里
