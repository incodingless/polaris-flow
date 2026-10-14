# Hook Registration — 宿主中立 hook 注册

> **权威源**（本文件与它们冲突时以代码为准）：
>
> | 内容 | 唯一来源 |
> |------|----------|
> | 落盘路径、合并语义、command 改写 | `src/core/install/hooks.ts` |
> | 平台字段（`supportsHooks` / `hookFormat` / `hooksConfigFile` / `contextDir` / `globalContextDir`） | `src/core/domain/platforms.ts` |
> | 注册模板 | `assets/shared/hooks.json` |
> | hook 脚本（语言中立） | `assets/shared/hooks/` |

## 概述

polaris-flow 只向宿主注册**一个** hook：**SessionStart**。hook 脚本是**宿主中立的薄转发器** —— 真正的逻辑全在 CLI（`polaris-flow host-hook`）里。因此宿主差异**只**体现在两件事上：配置写进哪个文件、command 写成什么形态。

hook 资产是**语言中立**的：源在 `assets/shared/hooks/`（**不是** `assets/{zh,en}/hooks/`），注册模板是 `assets/shared/hooks.json`。

## Hook 清单

| Hook | matcher | 脚本 | 作用 |
| --- | --- | --- | --- |
| SessionStart | `startup` / `resume` | `hooks/session-start.sh` | ① 依赖自检（openspec / `.polaris/` / `config.yaml` / superpowers 版本 / agents 是否落盘）；② 探测平台能力与 subagent 可用性；③ 把 `$PLUGIN_ROOT` / `$REPO_ROOT` 等写入 `.polaris/.cache/runtime-env` |

> **不是 hook 的东西**：`constitution-validity.sh`、`scorers/*.sh` 等由技能在自己的流程步骤里**显式调用**（或经 CLI 子命令），不进宿主 hook 配置。

## 分发链

```
宿主 SessionStart
  └→ <hookRoot>/hooks/session-start.sh        （薄转发器，不含业务逻辑）
       ├ source ../scripts/_polaris-cli.sh
       ├ _polaris_cli_selfheal   ← CLI 缺失时打印安装指引并非 0 退出（不静默失败）
       └ exec_polaris host-hook --fallback-event SessionStart
            └→ src/commands/hooks/host-hook.ts → session-start.ts
```

`<hookRoot>` = `<contextDir>/skills/polaris`（project scope，相对路径）或 `<globalContextDir>/skills/polaris`（global scope，绝对路径）—— 由 `resolveHookScriptRoot()` 决定。

**为什么这么设计**：逻辑只在 CLI 一处 → 新增/修改检查**只动 `src/`**，hook 资产与各平台配置都不用跟着改。`--fallback-event` 兼容 stdin 缺少 `hook_event_name` 的宿主。

## 落盘位置（`resolveHooksConfigPath()`）

| 平台 | `supportsHooks` | `hookFormat` | `hooksConfigFile` | 实际落盘 | 写入形态 |
| --- | --- | --- | --- | --- | --- |
| **claude** | ✅ | `claude-code` | `settings.local.json` | project → `<contextDir>/settings.local.json`；global → `<contextDir>/settings.json` | 只替换 / 合并 `hooks` 字段，保留用户其余设置 |
| **cursor** | ✅ | `claude-code` | `settings.local.json` | 同 claude | 同 claude |
| **trae** | ✅ | `claude-code` | `hooks.json` | `<contextDir>/hooks.json` | **独立文件**（整份含 `$schema` + `hooks`） |
| **trae-cn** | ✅ | `trae` | `hooks.json` | `~/.trae-cn/hooks.json`（**用户目录**，与安装 scope 无关） | `{ version: 1, hooks }`；只合并 `hooks`，保留 `version` 与用户自己的事件 |
| **qoder** | ❌ | `claude-code` | `settings.json` | —（`supportsHooks: false` → **不注册**） | 退化为运行时检测 |

各平台的 context 目录：

| 平台 | `contextDir`（project） | `globalContextDir`（global） |
| --- | --- | --- |
| claude | `.claude` | `.claude` |
| cursor | `.cursor` | `.cursor` |
| trae | `.trae` | `.trae` |
| trae-cn | `.trae` | **`.trae-cn`** |
| qoder | `.qoder` | `.qoder` |

> ⚠️ `hookFormat` 的枚举是 `'claude-code' | 'trae' | 'trae-cn'`，但**实际取值与平台 id 不同名**：`trae` 用 `claude-code`、`trae-cn` 用 `trae`。路径判定一律以 `resolveHooksConfigPath()` 为准，**不要**在文档或源文件里另写一份推导。

## command 的写法与改写

模板（`assets/shared/hooks.json`）：

```json
{
  "$schema": "https://json.schemastore.org/claude-code-hooks",
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          { "type": "command", "command": "bash \"${CLAUDE_PLUGIN_ROOT}/hooks/session-start.sh\"" }
        ]
      }
    ]
  }
}
```

安装时由 `rewriteHooksCommandsForPlatform()` 把**托管** command 改写为**不依赖 `CLAUDE_PLUGIN_ROOT`** 的路径：

| scope | scriptRoot（`resolveHookScriptRoot()`） | 改写结果 |
| --- | --- | --- |
| `project` | `<basename(contextDir)>/skills/polaris`（相对） | `bash "<contextDir>/skills/polaris/hooks/session-start.sh"` |
| `global` | `<globalContextDir>/skills/polaris`（绝对） | `bash "<绝对路径>/skills/polaris/hooks/session-start.sh"` |

即 hook 与技能**共用同一个 `skills/polaris/` 根**，hook 脚本随技能一起落盘。

**合并而非覆盖**（`mergeHooksMaps()` / `mergeHookGroups()`）：

1. 先按 `isManagedHookCommand()` 从**既有配置的全部事件**中剔除 polaris 托管 command ——
   识别 `polaris/hooks`、`polaris-flow/hooks`、`/hooks/session-start.sh`、`${CLAUDE_PLUGIN_ROOT}/hooks/`、
   `/skills/polaris(-flow)?/hooks/` 等历史形态；
2. 再写入模板条目：分组按 `matcher` 对齐，同组内按 `command` 去重。

⇒ 重复跑 `init` / `update` **不会重复注册**，也**不会动**用户的其它 hook。
`overwrite` 时：`trae` 整文件覆盖；settings 类只替换 `hooks` 字段。

> ⚠️ 第 1 步必须覆盖**全部事件**，不能只清 incoming 事件 —— 模板中被删除的事件不会进入 incoming，
> 其托管 command 会**永久残留**在宿主配置里。

## PLUGIN_ROOT 与运行时环境

- SessionStart 把 `$PLUGIN_ROOT` / `$REPO_ROOT` 等写入 `.polaris/.cache/runtime-env`（`KEY=value`，可被 `source`）。
- 技能侧的取值顺序：① SessionStart 注入的环境变量；② 兜底 `set -a; source .polaris/.cache/runtime-env`；③ 两者皆无 → **停止并报告阻塞原因**（提示用户重启会话以触发 SessionStart），不得继续试跑。
- **不支持 hook 的宿主**（qoder）：退化为**运行时检测**，由命令 / 技能入口自行执行等价检查；平台能力由 `subagent-probe` 探测。

## 退化路径

| 宿主能力 | polaris-flow 行为 |
| --- | --- |
| 支持 hooks | SessionStart 自检 + 运行时环境注入（完整） |
| 不支持 hooks（qoder） | 运行时检测；能力结论由 `subagent-probe` 探测取得 |
| 不支持 skill 加载 | polaris-flow 不可用 |

## 新增 hook 的操作清单

1. 脚本放 `assets/shared/hooks/`（**语言中立**，不要放 `assets/{zh,en}/hooks/`）；脚本保持**薄转发** —— 逻辑写进 `src/commands/hooks/`
2. 在 `assets/shared/hooks.json` 注册事件（含 `matcher`）
3. 现有平台的配置形态已有映射，**一般无需改安装代码**；只有新平台的配置形态不同，才动 `src/core/install/hooks.ts` 的 `resolveHooksConfigPath()`
4. 若 command 形态与既有不同，**必须**扩展 `isManagedHookCommand()` 的识别，否则重复安装会写出重复注册
5. 脚本必须跨平台兼容（macOS / Linux / Windows Git Bash）：**禁止** `sed -i`；可选 `grep` 结果加 `|| true`，避免 `pipefail` 误杀
6. hook 脚本里**不写宿主分支** —— 宿主差异一律交给 CLI 与平台配置承担
