# Command Registration — 宿主中立命令注册

## 概述

polaris-flow 的 `/pofl:*` 命令和 `/openspec:*` 命令需要在宿主中注册才能被触发。不同宿主的注册方式不同。

## 宿主注册方式

### Trae
**手动配置**：Trae在项目中声明：
```markdown
## Commands

- `/pofl:*` commands available via easy-flow plugin
- 每条 `/pofl:<verb>` 命令独立运行，对应加载 `<verb>` skill（无统一 orchestrator）
```

### CodeBuddy

**自动注册**：CodeBuddy 通过 `plugin.json` 的 `command_prefixes` 字段自动注册。

```json
{
  "command_prefixes": ["ezfl"]
}
```

命令文件放在 `commands/` 目录下，宿主自动发现。

### Claude Code

**手动配置**：在项目 `CLAUDE.md` 或全局配置中声明：

```markdown
## Commands

- `/pofl:*` commands available via easy-flow plugin
- 每条 `/pofl:<verb>` 命令独立运行，对应加载 `<verb>` skill（无统一 orchestrator）
```

## 退化路径

| 宿主能力 | 命令前缀 | 调用方式 |
|---------|---------|---------|
| 完整 plugin 支持 | `/pofl:*` 可用 | 用户直接输入命令 |
| 仅 skill 加载 | 不可用 | `use_skill("polaris-flow:<name>")` |
| 不支持 skill | 不可用 | polaris-flow 不可用 |
