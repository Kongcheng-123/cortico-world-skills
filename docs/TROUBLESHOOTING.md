# 故障排查

按现象找。

## 控制台里看不到「技能与脚本」

**先确认装上了**：

```bash
ls <cortico 数据目录>/extensions/node_modules/cortico-world-skills/package.json
```

没有就是没装。

**装上了但还是不显示**，看三个地方：

1. **`extensions/package.json` 的 `dependencies` 里有没有这一项**

Cortico 靠这个列表枚举扩展，不在列表里就不会加载：

```json
"cortico-world-skills": "file:/path/to/your/cortico-world-skills"
```

2. **`cortico.api` 是不是 6**

`package.json` 里：

```json
"cortico": { "kind": "world", "api": 6, ... }
```

Cortico 版本升级后这个数字可能变，不匹配就不加载。

3. **`worlds.skills.enabled` 是不是 true**

`config.json` 里没有这一段、或者 `enabled: false`，都不会启动。

**看日志**：

```bash
grep -i "world 已启动\|skills\|constructFailed" <cortico 数据目录>/logs/core.log | tail -20
```

有 `World 已启动: skills` 就是起来了；有 `constructFailed` 就是构造时抛错了，后面会跟着原因。

## 配置页显示「现在有 0 份」，但目录里明明有 md

**技能目录接错了**。在配置页把「技能目录」填成绝对路径试一次，或者检查 `config.json`：

```json
"skillDir": ""          ← 空表示用 <部署目录>/workspace/skills
"skillDir": "D:/xxx"    ← 或者写死绝对路径
```

**填了文件却没生效**：配置页的数字只在启动时和每轮对话后刷新。改完文件，跟她随便聊一句再看。

## 她不知道有这个工具

**先确认工具真的注册了**：

```bash
curl -s http://127.0.0.1:17788/api/tool-schemas | grep -o 'skill_list\|skill_read\|script_list\|script_run'
```

四个都在 → 工具没问题，是提示词的事。

**改完提示词要重载**：

```bash
curl -X POST http://127.0.0.1:17788/api/session/reload-prefix \
  -H "Content-Type: application/json" -d '{}'
```

**她还是不调**，去看她实际调过没有：

```bash
python -c "
import json
lines = open('<数据目录>/data/session-main.jsonl', encoding='utf-8').read().strip().split(chr(10))
from collections import Counter
c = Counter()
for line in lines:
    try:
        it = json.loads(line).get('item') or {}
        if it.get('type') == 'function_call':
            c[it.get('name')] += 1
    except Exception: pass
print({k:v for k,v in c.items() if k.startswith(('skill_','script_'))})
"
```

**0 次调用的常见原因**：环境提示里没写清「什么情况下该用」。我们的经验是，只写「要动电脑时先 script_list」不够——她会被问「你会什么」，这时不认为自己要动手，就凭印象答了。所以要显式写「被问到自己的本事时，也要先查」。

## script_run 报「没有叫 XXX 的脚本」

白名单里那个 alias 没登记，或者拼写不一致。

**看当前登记了什么**：

```bash
curl -s http://127.0.0.1:17788/api/config | python -c "
import json,sys
d = json.load(sys.stdin)
for item in d.get('groups') or []:
    g = item.get('group') or {}
    if 'skills' in str(g.get('id','')):
        for k,v in g['schema']['properties'].items():
            if 'slot' in k and v.get('description'):
                pass
        print(json.dumps({k:v for k,v in g['schema']['properties'].items() if 'slot' in k}, ensure_ascii=False, indent=2)[:500])
"
```

或者直接在配置页看那 8 个槽位。**改完立即生效，不用重启**。

## script_run 报「路径越出了允许范围」

槽位里的路径，拼上「脚本执行根目录」之后，跑到了根目录外面。

```
allowRoot: D:\Hermes works
slot1: 脚本 | scripts/a.py      → D:\Hermes works\scripts\a.py  ✓
slot1: 脚本 | ../windows/x.exe  → 越界，拒绝  ✗
```

**这是设计如此**，别想着绕。真需要跑根目录外的脚本，把 `allowRoot` 改成更上层的目录。

## 执行超时

默认 60 秒。启动慢的服务（加载模型那种）会超。

去配置页把「单次执行超时」调大，或者给那个脚本单独做一个「异步启动」的包装。

**超时的进程会被 SIGKILL**，不会有残留。

## 输出被截断

默认 4000 字符。一个打印全量日志的脚本会撞上。

**这不是 bug**，是防止刷屏把上下文冲掉。真需要看完整输出，让脚本自己写文件，回执里只打摘要和文件路径。

## 安装后某个扩展的模块突然找不到了

**症状**：日志里 `Cannot find module 'xxx'`，但目录看着好好的。

**原因**：在 Cortico 运行的时候装了包。它已经把原生模块（`.node`）加载进内存，包管理器 rename 目录时撞 `EPERM`，包卡在半损坏状态——目录在、`src/` 在、**`package.json` 没了**。

**验证**：

```bash
ls <extensions>/node_modules/xxx/package.json
```

**修**：

1. 停掉 Cortico
2. 在 `extensions` 目录跑 `npm install`（或 pnpm）
3. 再启动

**以后别在运行时装包**。

## 上下文缓存命中率掉到个位数

**正常时应该在 99% 以上**。掉下去只有两个原因：

1. **重启了 Cortico** → 进程重启，模型端的缓存失效，重建一次是正常的
2. **上下文被压缩** → prompt 数量从十万级掉到几万，说明触发了压缩，之后一次 miss 也正常

**如果每次都掉**，说明前缀在变。查：

```bash
# 连续看两次，比较 skills 段是否一致
curl -s http://127.0.0.1:17788/api/prompts/prefix | python -c "
import json,sys
d=json.load(sys.stdin)
for s in d['segments']:
    if 'skills' in s['title']: print(s['text'])
"
```

**前缀每次都变的原因**：`envPromptVars()` 里返回了会变的内容（时间戳、计数器）。索引必须是稳定的文本，只有技能文件真的改了才能变。

## 怎么查到她的缓存数据

```bash
python -c "
import json
lines = open('<数据目录>/data/usage.jsonl', encoding='utf-8').read().strip().split(chr(10))
for line in lines[-20:]:
    d = json.loads(line)
    pt = d.get('promptTokens') or 0
    hit = d.get('cacheHitTokens') or 0
    if pt: print(f'{pt:>8} {hit*100//pt:>3}%')
"
```
