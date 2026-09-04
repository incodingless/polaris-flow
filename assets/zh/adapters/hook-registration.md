# Hook Registration — 宿主中立 hook 配置

## 概述

polaris-flow 使用 hook 在关键时刻执行检查（如 SessionStart 依赖版本检查、constitution 有效性判定）。不同宿主配置 hook 的方式不同。

## Hook 清单

| Hook | 脚本| 触发时机 |
|------|---------|---------|
| SessionStart | `${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh` | 新会话开始 |
| Constitution Validity | `$PLUGIN_ROOT/scripts/constitution-validity.sh` | design/lock/build/audit 入口 |
| Scorers ×5 | `$PLUGIN_ROOT/scorers/*.sh` | audit Step 2 评分 |

> **路径定位**：所有 hook/scorer 脚本驻留 plugin 内部，**不镜像到 `.harness/`**。SessionStart 把当前 plugin 绝对路径覆盖写入 `.harness/.cache/.plugin_root`，skill 通过 `PLUGIN_ROOT="$(cat .harness/.cache/.plugin_root)"` 解析后调用。skill 启动时若 `.plugin_root` 缺失，提示用户重启会话即可重新写入。

## 宿主配置

### CodeBuddy

支持 `session_start` hook 配置：

```json
// .codebuddy-plugin/plugin.json
{
  "hooks": {
    "session_start": "hooks/session-start.sh"
  }
}
```

### Claude Code

在 `CLAUDE.md` 中声明需要运行的检查：

```markdown
## Session Start

Run: `bash <plugin-path>/hooks/session-start.sh`
```

### 不支持 Hook 的宿主

**退化为运行时检测**：每个 command 入口自行调用对应检查脚本。

```
command 入口（/ezfl:*）:
  if hook 可用 → 依赖宿主执行
  else → 内联执行: bash hooks/session-start.sh
```

## 双平台脚本

每个 hook 提供两份：
- `.sh`（POSIX bash，适用 macOS/Linux）
- `.cmd`（Windows batch，适用 Windows）

运行时根据 OS 自动选择。
