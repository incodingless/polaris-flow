# Hook Registration — 宿主中立 hook 注册

## 概述

polaris-flow 只向宿主注册**一个** hook：**SessionStart**。hook 脚本是**宿主中立的薄转发器**——真正的逻辑全在 CLI（`polaris-flow host-hook`）里。因此宿主差异**只**体现在两件事上：配置写进哪个文件、command 写成什么形态。

hook 资产是**语言中立**的：源在 `assets/shared/hooks/`（**不是** `assets/{zh,en}/hooks/`），注册模板在 `assets/shared/hooks.json`。

## Hook 清单

| Hook | 脚本 | 触发 | 作用 |
| --- | --- | --- | --- |
| SessionStart | `hooks/session-start.sh` | 新会话开始（`startup` / `resume`） | ① 依赖自检（openspec / `.polaris/` / `config.yaml` / superpowers 版本 / agents 是否落盘）；② 探测平台能力与 subagent 可用性；③ 把 `$PLUGIN_ROOT` / `$REPO_ROOT` 等写入 `.polaris/.cache/runtime-env` |

> **不是 hook 的东西**：`constitution-validity.sh`、`scorers/*.sh` 等由技能在自己的流程步骤里**显式调用**，不进宿主 hook 配置。

## 分发链

```
宿主 SessionStart
  └→ <contextDir>/skills/polaris/hooks/session-start.sh   （薄转发器，不含业务逻辑）
       ├ source ../scripts/_polaris-cli.sh
       ├ _polaris_cli_selfheal   ← CLI 缺失时打印安装指引并非 0 退出（不静默失败）
       └ exec_polaris host-hook --fallback-event SessionStart
            └→ src/commands/hooks/host-hook.ts → session-start.ts
```

**为什么这么设计**：逻辑只在 CLI 一处 → 新增/修改检查**只动 `src/`**，hook 资产与各平台配置都不用跟着改。`--fallback-event` 用于兼容 stdin 缺少 `hook_event_name` 的宿主。

## 落盘位置（按平台）

| 平台 | hooks 配置落盘 | hookFormat |
| --- | --- | --- |
| **claude** | 项目级 `<contextDir>/settings.local.json`；全局 `<contextDir>/settings.json` | `claude-code` |
| **cursor** | 同 claude | `claude-code` |
| **trae** | `<contextDir>/hooks.json` | `claude-code` |
| **trae-cn** | `~/.trae-cn/hooks.json`（**用户目录**，与安装 scope 无关） | `trae` |
| **qoder** | —（`supportsHooks: false`） | 不注册，退化为运行时检测 |

`<contextDir>`：claude `.claude`、cursor `.cursor`、trae `.trae`。
落盘路径由 `resolveHooksConfigPath()` 推导，**不写死在文档或源文件里**。

## command 的写法与改写

注册模板（`assets/shared/hooks.json`）里的 command 写成：

```json
"command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh\""
```

安装器落盘时把它**改写为项目相对路径**，**不依赖** `CLAUDE_PLUGIN_ROOT`：

| scope | 改写后的 command |
| --- | --- |
| `project` | `bash "<contextDir>/skills/polaris/hooks/session-start.sh"` |
| `global` | `bash "<globalContextDir>/skills/polaris/hooks/session-start.sh"`（绝对路径） |

即 hook 与技能**共用同一个 `skills/polaris/` 根**，hook 脚本随技能一起落盘。

**合并而非覆盖**：写入前先按 `isManagedHookCommand()` 剔除**既有的 polaris 托管 command**（含历史形态 `polaris-flow/hooks`、`${CLAUDE_PLUGIN_ROOT}/hooks/`），再合并用户原有的其他 hook。→ 重复跑 `init` / `update` **不会重复注册**，也**不会动**用户的其它 hook。

## PLUGIN_ROOT 与运行时环境

- SessionStart 把 `$PLUGIN_ROOT` / `$REPO_ROOT` 等写入 `.polaris/.cache/runtime-env`（`KEY=value`，可被 `source`）。
- 技能侧的取值顺序：① SessionStart 注入的环境变量；② 兜底 `set -a; source .polaris/.cache/runtime-env`；③ 两者皆无 → **停止并报告阻塞原因**（提示用户重启会话以触发 SessionStart），不得继续试跑。
- **不支持 hook 的宿主**（qoder）：退化为**运行时检测**，由命令 / 技能入口自行执行等价检查，平台能力由 `subagent-probe` 探测。

## 退化路径

| 宿主能力 | polaris-flow 行为 |
| --- | --- |
| 支持 hooks | SessionStart 自检 + 运行时环境注入（完整） |
| 不支持 hooks | 运行时检测；能力结论由 `subagent-probe` 探测取得 |
| 不支持 skill 加载 | polaris-flow 不可用 |

## 新增 hook 的操作清单

1. 脚本放 `assets/shared/hooks/`（**语言中立**，不要放 `assets/{zh,en}/hooks/`）；脚本保持**薄转发**——逻辑写进 `src/commands/hooks/`
2. 在 `assets/shared/hooks.json` 注册事件（含 `matcher`）
3. 现有平台的配置形态已有映射，**一般无需改安装代码**；只有新平台的配置形态不同，才动 `src/core/install/hooks.ts` 的 `resolveHooksConfigPath()`
4. 若 command 形态与既有不同，**必须**扩展 `isManagedHookCommand()` 的识别，否则重复安装会写出重复注册
5. 脚本必须跨平台兼容（macOS / Linux / Windows Git Bash）：**禁止** `sed -i`；可选 `grep` 结果加 `|| true`，避免 `pipefail` 误杀
6. hook 脚本里**不写宿主分支**——宿主差异一律交给 CLI 与平台配置承担
