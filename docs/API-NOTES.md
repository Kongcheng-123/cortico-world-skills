# Cortico World API 备忘

摘自本机打包的 Cortico 源码：`<安装目录>/build/cortico/`。字段定义引自 `src/world.ts` 与 `src/core/types.ts`。

## 契约版本

`src/extensions/manifest.ts:23`

```typescript
EXTENSION_API_VERSIONS = { world: 6, provider: 6, bot: 7 }
```

`package.json` 里 `cortico.api` 必须等于 6，否则不加载。

## 包清单

```jsonc
{
  "name": "cortico-world-xxx",
  "type": "module",                       // 必须，CommonJS 会重复实例
  "keywords": ["cortico-world"],
  "cortico": {
    "kind": "world",
    "api": 6,
    "displayName": "显示名",
    "describe": "describe.json",
    "tags": ["..."],
    "locales": { "en": { "displayName": "..." } }
  }
}
```

## WorldDefinition

`src/world.ts:50`

```typescript
interface WorldDefinition<S extends WorldSection = WorldSection> {
  id: string;
  label: string;
  defaults(): S;                          // 每次返回新对象，enabled 默认 false
  preflight?(ctx: WorldContext<S>): void; // 抛错 = 不能激活
  configOptions?(kind: string, language: Language): Array<{ value, label }>;
  create(ctx: WorldContext<S>): World;
  describe?: WorldDescribe;               // { tools, events }，给人看的，不进提示词
}
```

## WorldContext

`src/world.ts:29`

```typescript
interface WorldContext<S> {
  readonly id: string;
  readonly cfg: S;              // worlds.<id> 的活引用，改了立即生效
  readonly timezone: string;
  readonly botName: string;
  readonly botDir: string;      // 部署目录（config.json / .env 所在）
  readonly packageDir: string;
  readonly dataDir: string;
  readonly repoRoot: string;
  secret(name: string): string;
  storeSecret(name: string, value: string): void;
  persist(patch: DeepPartial<S>): void;   // 深合并进 worlds.<id>
  restart(): Promise<void>;
}
```

## World

`src/core/types.ts:903`

```typescript
interface World {
  id: string;
  envPromptVars(): Record<string, string> | null | Promise<...>;  // null 省略该段
  tools(): ToolDef[];
  webUi?(language?: Language): WorldWebUiDecl;
  outputTap?(): OutputTap | undefined;
  start(host: WorldHost): Promise<void>;
  stop(): Promise<void>;
  onHandoffEnded?(): void;
  onTurnEnded?(): void;
  onEventsSettled?(events, outcome): void;
  onRunPhase?(phase: RunPhase): void;
  shutdownVerification?(language): readonly ShutdownExternalCheck[];
}
```

## ToolDef

`src/core/types.ts`

```typescript
interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;   // JSON Schema 对象
}

type ToolTag = 'read' | 'write' | 'speak' | 'act' | 'flow' | 'snapshot';

interface ToolDef extends ToolSchema {
  tags: readonly ToolTag[];               // 空数组会告警
  barrierAfter?: boolean;                 // 模型读到结果后才继续
  endsTurn?: boolean;                     // 完成即结束本轮唤醒
  interruptible?: boolean;                // ctx.signal 可达
  handler(args: Record<string, unknown>, ctx: ToolCallContext): Promise<string | ToolOutcome>;
}

interface ToolCallContext {
  role: string;
  log: Logger;
  signal?: AbortSignal;
  callId?: string;
  round?: number;
  queueExternalEvents?(events: EventEnvelope[]): void;
}
```

## 环境提示词

`src/core/types.ts` 的 `WorldWebUiDecl.promptDocs`

```typescript
interface PromptDocDecl {
  key: string;                    // 全局唯一，惯例 worlds.<World>.<名>
  title: string;
  description: string;
  path: string;                   // 模板文件绝对路径
  deploymentPath?: string;        // 部署侧覆盖写入路径
  role?: 'envPrompt' | 'prefix';  // envPrompt = 进系统前缀
  vars?: Array<{ name: string; description: string }>;
}
```

**实测写法**（gaming 扩展 `src/world.ts:893`）：

```typescript
const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

webUi() {
  return {
    ...
    promptDocs: [{
      key: 'worlds.gaming.envPrompt',
      title: '陪玩 · 环境提示词',
      description: '...',
      path: ENV_PROMPT_FILE,
      role: 'envPrompt',
      vars: [{ name: 'gaming.now', description: '...' }],
    }],
  };
}
```

模板里的变量由 `envPromptVars()` 提供，返回 `{ 'gaming.now': '值' }`。

## 扩展怎么 import 框架

`cortico/<路径>` 映射到 `src/<路径>`，由 `runtime.ts` 的 `module.registerHooks` 实现。

```typescript
import type { WorldDefinition, WorldContext } from 'cortico/world.ts';
import type { ToolDef, ToolCallContext } from 'cortico/core/types.ts';
```

浏览器侧只能用 `import type`，运行时值得由包自带。

## 加载流程

1. 读 `extensions/package.json` 的 dependencies
2. 从 `extensions/node_modules/<包>/` import 入口
3. 按 `kind` 校验默认导出
4. 与内建 id 冲突则不加载，两个扩展同 id 只加载第一个
5. 单扩展失败不影响其他，原因写入 `ExtensionRecord.reason`
6. 新装或卸载要**重启进程**（ESM 模块缓存不支持热换）

## 验证工具

```bash
pnpm check:extension        # 用 dry-mount.ts 在假部署中验证构造与声明
pnpm describe:extension     # 从 describe 生成 describe.json
```

`check:extension` 不调 `start()`，只验证 `create()` / `tools()` / `webUi()`。

## 安装扩展时的坑（实测踩过）

### 改 dependencies 会触发重装，运行中会撞 EPERM

Cortico 靠 `extensions/package.json` 的 `dependencies` 枚举扩展。往里加一项，包管理器会重装依赖。

**但如果 Cortico 正在运行**，它已经把各扩展的原生模块（`.node`）加载进内存了，重装时 rename 目录会失败：

```
[ERR_PNPM_EPERM] [importPackage .../node_modules/loopback-capture]
EPERM: operation not permitted, rename 'loopback-capture_tmp_10528_7' -> 'loopback-capture'
```

后果很隐蔽：目录还在、`src/` 和 `.node` 都在，**只有 `package.json` 消失**，于是 Node 认为这个模块不存在，报「找不到模块」。表现就是某个扩展功能突然坏掉（本例是抓音频失效）。

**正确顺序**：

1. 先停掉 Cortico 进程
2. 改 `extensions/package.json`
3. 跑安装
4. 再启动

### 本地开发用 file: 协议，不要写版本号

写 `"cortico-world-skills": "0.1.0"` 会让包管理器去 registry 找这个包，没发布就 404：

```
npm error 404 Not Found - GET https://registry.npmjs.org/cortico-world-skills
```

本地开发改成路径：

```json
"cortico-world-skills": "file:D:/path/to/your/cortico-world-skills"
```

装到 npm 上之后才换回版本号。

### 拆 junction 不能递归删

开发时常用 `mklink /J` 把扩展目录链进 `node_modules`。删的时候如果用 `Remove-Item -Recurse`，**可能顺着链接把真实项目删掉**。

安全写法（只删链接本身）：

```powershell
[System.IO.Directory]::Delete($link)
```

删完立刻验证目标目录还在。
