## 首个版本

给 Cortico / Coopanion 桌宠加一套技能库和受限脚本执行。

### 技能机制

- markdown 文件即技能，`name` + `when` 进上下文（每份约 30 字），正文只在 `skill_read` 时读入
- 三份技能时环境段实测 314 字符
- 索引按目录 mtime 缓存，目录没变零读盘

### 脚本执行

- 两档权限：白名单（路径锁根目录、参数写死）/ 不限（拒绝 shell 元字符）
- 模式只能从配置切换，`script_run` 入参里没有 mode 字段
- 超时 SIGKILL、输出截断 4000 字符

### 配置页

- 技能清单和脚本清单动态显示
- 6 个可编辑项 + 8 个白名单槽位
- 槽位用字符串而非对象数组（Cortico 表单不支持）

### 四个工具

`skill_list` / `skill_read` / `script_list` / `script_run`

### 文档

README、技能格式、安全模型、开发者指南、故障排查、Cortico API 备忘

### 实测

- 4 个工具全部注册
- 路径穿越、超时、截断、元字符拦截逐项验证
- 缓存命中率正常时 99.5%

### 安装

```powershell
Set-Location "<Cortico 数据目录>\extensions"
corepack pnpm add --ignore-workspace github:Kongcheng-123/cortico-world-skills
```
