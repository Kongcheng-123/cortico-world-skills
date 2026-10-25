# cortico-world-skills

A [Cortico](https://github.com/Pal-AI-Lab/Cortico) World extension that gives your desktop companion a **skill library** and **permission-gated script execution**.

Only the index lives in the system prompt. Skill bodies are read on demand, so the companion can know many procedures without blowing up the context.

## Why

Injecting every procedure into the system prompt invalidates the prompt cache on every turn. This extension keeps a compact index resident (about 30-40 characters per skill) and pulls the body into the conversation only when `skill_read` is called.

Measured: with two skills installed, the whole environment segment is **236 characters**.

## Install

```bash
cd <cortico data dir>/extensions
pnpm add cortico-world-skills
```

Restart Cortico (ESM module cache does not support hot swap).

Add to `config.json`:

```json
"skills": {
  "enabled": true,
  "skillDir": "",
  "allowRoot": "/path/to/your/workspace",
  "mode": "whitelist",
  "whitelist": [],
  "timeoutMs": 60000,
  "maxOutputChars": 4000
}
```

## Writing a skill

Drop a `.md` file in the skill directory:

```markdown
---
name: Watch the story with me
when: user says they are playing a story game
---

# Watch the story with me

Body text. Only loaded when read.
```

`name` and `when` go into the index. The body never does.

See [docs/SKILL-FORMAT.md](docs/SKILL-FORMAT.md).

## Script permissions

Two modes, switchable **only from the config file** — the model has no parameter to change it.

- **whitelist** (default): only registered scripts, addressed by alias. Path traversal blocked, args fixed, output truncated, timeout enforced.
- **open**: any command, but shell metacharacters rejected, timeout and truncation still apply.

Read [docs/SECURITY.md](docs/SECURITY.md) before enabling open mode.

## Tools

| Tool | Purpose |
|---|---|
| `skill_list` | list skill names and triggers |
| `skill_read` | read one skill body |
| `script_list` | list runnable scripts and current mode |
| `script_run` | run a script |

## Compatibility

- Cortico extension contract `api: 6`
- Tested on Coopanion 0.2.9
- Node 24, TypeScript runs via strip-types (no build step)

Note: Node's strip-only mode does not support `enum`, `namespace`, or TypeScript parameter properties. Using them yields `TypeScript parameter property is not supported in strip-only mode`.

## License

MIT
