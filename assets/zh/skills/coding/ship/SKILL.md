---
name: polaris{{SKN_SPR}}coding{{SKN_SPR}}ship
description: "verify 通过后做终验、分支收尾、worktree 产物合回与清理、OpenSpec 归档询问，并清游标。用户触发 /polaris{{SKN_SPR}}coding{{SKN_SPR}}ship，或在 verify 完成后要求交付 / 合回 / 归档 / 完结一个 change 时必须使用本 skill。不要用于：verify 未完成时强行交付、本阶段编写业务实现、或跳过用户确认直接 /opsx:archive。"
---

# Polaris 工作流 - 阶段：交付（ship）

<HARD-GATE>
本 skill **仅**负责：在 **verify 已完成** 的前提下，做终验、分支收尾、worktree 产物合回与清理、OpenSpec 归档询问，并清理 workflow 游标。

- **禁止**跳过 Step 0（ship lock）进入后续步骤（H11）
- **禁止**在 `worktree.created_by_polaris_flow=true` 时，跳过 Step 3.5 的产物合回（`polaris-sync.sh`）直接 `git worktree remove`（H9）
- **禁止**未按 `./policies/decision-point.md` 询问用户就执行 `/opsx:archive` / `openspec-cn archive`
- **禁止**因 archive 失败回滚已完成的分支合并与 worktree 合回；失败时**不做归档**（不声称 archived、不移动 openspec 目录），照常进入 Step 6.1
- **P01 快速通道**：`workflow.tweak.mode=tweak` 时**必须**执行 Step 4.5 产物补齐；**禁止**跳过补齐直接 `openspec-cn archive`，**禁止**因补齐失败阻断交付收尾
- **禁止**本阶段编写业务实现代码；终验失败 → 回 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`（必要时再回 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}build`）
- **H8**（状态行）：每个 Step 入口输出 `[polaris-flow 开发]交付 - 进入Step <N>: <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 开发]交付 - 进入阶段：使用 polaris{{SKN_SPR}}coding{{SKN_SPR}}ship 技能。`

## 遵守的 Hard Stops

H8（状态行）、H9（worktree 合回必须）、H11（ship lock 串行）、H12（写 workflow.yaml 须持 workflow.lock；本阶段清理走 `ship-cleanup.sh` / `workflow-entry.sh`）。

## 标识约定

| 项 | 路径 / 值 |
|----|-----------|
| 业务档案 | `.polaris/tasks/<task_id>/state.yaml` |
| OpenSpec 变更目录 | `openspec/changes/<task_id>/`（四件套 + intention / detailed-design / `*-design.md` / `reviews/`；归档后进 `openspec/changes/archive/`） |
| 产物快照 | `.polaris/archive/<task_id>/`（合回的 **state** 等运行态；叙事文档随 openspec archive） |
| Metrics（顶层） | `.polaris/metrics/*-metrics.json`（worktree 合回追加到主仓顶层） |
| ship lock | 主仓 `.polaris/.locks/ship.lock` |
| sync 脚本 | `$PLUGIN_ROOT/scripts/harness-sync.sh` |
| sync policy | `policies/polaris-sync.md` |
| lock policy | `policies/ship-lock.md` |
| P01 产物补齐策略 | `./policies/artifact-backfill.md`（仅快速通道触发） |
| workflow 游标 | `.polaris/workflow.yaml`（写入走 hooks） |

> **链路**：`specify → plan → (design 可选) → tasks → build → verify → **ship**`（P01 快速通道为 `tweak → **ship**`）。
> 本阶段交付与归档；不再做 Constitution / scorer（那是 verify / tweak 出口检查）。
>
> **P01 差异**：tweak 只产出 `change-brief.md` + `tasks.md`，没有 proposal / design / specs。归档前必须由本阶段按 `./policies/artifact-backfill.md` 补齐四件套（Step 4.5），否则 `openspec-cn archive` 会失败。

## 输入与入口校验

用 bash 读取工作流配置中有效变更的`task_id`：

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind coding --skill ship --repo-root "$REPO_ROOT" --phase ship)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- `RTID_EXIT == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：取其 `task_id`（及 `worktree_path`，若非空）
- **多个匹配**：按 `./policies/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 phase=ship 的 active change，请先执行 /polaris-flow-verify」

读 `.polaris/tasks/<task_id>/state.yaml`（若 `worktree_path` 非空 → 从 **worktree 内**同路径读）：

| 检查 | 条件 | 失败动作 |
|------|------|----------|
| verify 已完成 | `runtime.verify.status=completed` | 阻断，提示先 `/polaris-flow-verify` |
| 未阻塞 | `runtime.verify.blocked != true`（或已合法 override） | 阻断，提示回 `/polaris-flow-verify` 处理 |
| worktree 合回分支 | `worktree.created_by_polaris_flow == true` | 触发本 skill Step 3；否则 Step 3 整段跳过 |

通过后更新：`phase: ship`。

## 流程

### Step 0：获取 ship lock（串行保护）

`read_file "./policies/ship-lock.md"`，按其规定在主仓 `.polaris/.locks/ship.lock` 上获取互斥锁；失败即阻断。

锁内容含 `task_id`、PID、启动时间；`trap EXIT INT TERM HUP` 自动释放；≥ 30min 视为 stale，须用户显式确认清理（H11）。

输出：`[polaris-flow 开发]交付 - ship lock 已获取：task_id=<task_id> pid=<PID>`

### Step 1：终验

在 verify 已通过的前提下，再跑一轮 `superpowers:verification-before-completion` 作为交付前冒烟（构建/测试等宿主检查）。

- 全部通过 → Step 2
- 任一失败 → **阻断**；提示修复后重新触发 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}verify`，通过后再回 `/polaris{{SKN_SPR}}coding{{SKN_SPR}}ship`。本阶段不写业务修复代码。

### Step 2：分支管理（核心）

调用 `superpowers:finishing-a-development-branch`，呈现 PR / merge / cleanup 等选项给用户，等待其返回后再进入 Step 3。

### Step 3：worktree 产物合回 + 清理（仅本流程创建过 worktree 时）

**条件**：`state.yaml: worktree.created_by_polaris_flow == true`。
**顺序不可调换**：3.1–3.4 判定合并状态 → 3.5 先 sync 再 remove →（或 3.6 保留）。

#### 3.1 读取 worktree 元信息

从 `worktree` 块取 `path`、`branch`、`origin_repo`。

#### 3.2 脏检查 + 合并状态

```bash
bash "$PLUGIN_ROOT/scripts/worktree-merge-status.sh" "$WORKTREE_PATH" "$ORIGIN_REPO" "$BRANCH"
case $? in
  0) ALREADY_MERGED=1 ;;       # 干净 + 已合并 → 跳到 3.5
  1) ALREADY_MERGED=0 ;;       # 干净 + 未合并 → 进 3.3
  2) exit 1 ;;                 # 脏 → stderr 已含阻断话术
  *) exit 1 ;;                 # 参数/环境异常
esac
```

#### 3.3 若未合并：询问用户

**必须**按 `./policies/decision-point.md` 询问：worktree 路径/分支，三选项：

- **A**：已通过 PR 合并 / 不需本地合并 → 仅合回产物并清理
- **B**：本地 rebase 到主干后 fast-forward 合入
- **C**：暂不处理，保留 worktree

#### 3.4 选项 B：本地 rebase + ff 合入

```bash
bash "$PLUGIN_ROOT/scripts/worktree-rebase-ff.sh" "$WORKTREE_PATH" "$ORIGIN_REPO" "$BRANCH"
# 0=成功 / 1=rebase 冲突（worktree 留中间态；用户手动 git rebase --continue 后重跑 /polaris-flow-ship）
# 2=ff merge 失败 / 3=环境异常
```

#### 3.5 产物合回 → 清理 worktree（A/B 共用；不可拆分）

**C 跳过本步**（见 3.6）。必须同一步内先 sync 再 remove：

```bash
# ━━━ 第一步：polaris-sync（合回产物到主仓 .polaris/）━━━
SYNC_RESULT=$(bash "$PLUGIN_ROOT/scripts/harness-sync.sh" "$WORKTREE_PATH" "$ORIGIN_REPO" "$task_id")
SYNC_EXIT=$?
# 0=synced / 1=partial_failure / 2=archive 目录冲突（弹三选项后带 flag 重调）/ 3=skipped_no_source

# ━━━ 第二步：清理 worktree（仅第一步完成后）━━━
cd "$ORIGIN_REPO"
git worktree remove "$WORKTREE_PATH"
if [ "$ALREADY_MERGED" = "1" ] || git merge-base --is-ancestor "$BRANCH" HEAD; then
  git branch -d "$BRANCH"
fi
rmdir "$(dirname "$WORKTREE_PATH")" 2>/dev/null || true
```

- `SYNC_EXIT=2` → 先按 decision-point 三选项（overwrite / suffix / skip）重调脚本，再执行第二步
- `git worktree remove` 失败 → 提示用户 `git worktree remove --force`
- **禁止**跳过第一步直接执行第二步

合回目标（脚本契约，目标态）：

- metrics → 主仓 `.polaris/metrics/`
- overrides 追加 → 主仓 `.polaris/overrides.log`
- `state.yaml` → `.polaris/archive/<task_id>/`（运行态快照）
- 叙事文档（intention / detailed-design / `*-design.md` / `reviews/*`）已在 `openspec/changes/<task_id>/`，随后续 `/opsx:archive` 一并归档；**本步不要求**再把 detailed-design 拷进 `.polaris/archive/`

#### 3.6 选项 C：保留 worktree

不执行 3.5。写入：

- `worktree.status: abandoned`
- `runtime.ship.harness_sync: skipped_worktree_retained`（字段名沿用模板；语义=产物未合回）

提醒用户：后续清理前须先手动合回 `.polaris/` 产物。

### Step 4：状态写入

更新 `.polaris/tasks/<task_id>/state.yaml`（worktree 仍在则写 worktree 内；已 remove 则写主仓；**本步不删目录**——Step 5/6 仍需 `task_id`）：

```yaml
runtime:
  ship:
    status: "delivered"
    finished_at: "<ISO>"
    merge_strategy: "<rebase-ff|pr-only|abandoned|n/a>"
    harness_sync: "<synced|partial_failure|skipped_no_source|skipped_worktree_retained|deferred_archive_conflict|n/a>"
    archive_dir: ".polaris/archive/<task_id>"   # 仅 harness_sync ∈ {synced, partial_failure} 时有值
    archive: ""            # Step 5 回填
    archive_path: ""
    archive_error: ""
worktree:
  status: "<merged|abandoned>"   # 仅 created_by_polaris_flow=true 时更新
phase: idle
```

`harness_sync = "n/a"`：本次未创建 worktree，无需合回。

> Step 4 在 archive **之前**写入 `runtime.ship.status=delivered`，确保 archive 跳过/失败时分支与合回结果不丢失。

### Step 4.5：P01 产物补齐（条件执行）

**触发条件**（满足任一即执行，否则整步跳过）：

- `state.yaml` 中 `workflow.tweak.mode == "tweak"`
- `openspec/changes/<task_id>/change-brief.md` 存在，且 `proposal.md` / `design.md` / `specs/` 任一缺失

**执行**：`read_file ./policies/artifact-backfill.md`，按 **§3 归档路径**把 `change-brief.md` 转换为四件套（`proposal.md` / `design.md` / `specs/<capability>/spec.md`）。

约束：

- **禁止**修改 `tasks.md`（执行的唯一真相）
- **禁止**删除 `change-brief.md`（补齐的源，随 openspec 一并归档）
- **禁止**新增简报中不存在的目标、模块、验收场景或设计决策——补齐只是格式转换

写状态：

```yaml
runtime:
  ship:
    backfill: "<done|skipped:no_need|failed:<reason>>"
```

输出：`[polaris-flow 开发]交付 - 产物补齐：<done | 无需补齐 | 失败：<reason>>（源：change-brief.md）`

**失败处理**：不阻断交付收尾。记录 `backfill=failed:<reason>`，照常进入 Step 5——用户可在归档询问时选择「暂不归档（B）」，事后手动补齐再跑 `openspec-cn archive <task_id>`。

### Step 5：OpenSpec 归档（强制询问，主代理执行）

#### 5.1 询问是否归档

按 decision-point 呈现 `task_id` 与 `runtime.ship.status=delivered`，三选项：

- **A**：立即归档（推荐）——将 `openspec/changes/<task_id>/` 移到 `openspec/changes/archive/YYYY-MM-DD-<task_id>/`
- **B**：暂不归档（PR 仍在 review / 稍后手动）
- **C**：跳过归档（实验性变更）

#### 5.2 用户选 A

```bash
openspec-cn archive "$task_id" --yes
```

| 结果 | 处理 |
|------|------|
| 成功（含 warnings） | `runtime.ship.archive=archived`，写入 `archive_path`；warnings 追加到 Step 6 摘要 |
| exit ≠ 0 | **不做归档**：保持 `openspec/changes/<task_id>/` 原位；`runtime.ship.archive=failed`，写入 `archive_error`；摘要注明失败原因。不阻断交付收尾 |

无论成功或失败，进入 Step 6（含 6.1）。用户若要事后补归档，可手动 `openspec-cn archive <task_id>`。

#### 5.3 用户选 B / C

- **B** → `runtime.ship.archive=deferred`；提示稍后手动 `openspec-cn archive <task_id>` 或 `/opsx:archive`
- **C** → `runtime.ship.archive=skipped`

然后进入 Step 6（含 6.1）。

### Step 6：交付摘要

```
交付完成：

  task_id     : <task_id>
  tier          : <tier>
  分支          : <feature/...>
  worktree      : <已合回并清理 / 已保留 / 未创建>
  产物合回      : <已合回主仓 .polaris/archive/<task_id>/ | 未合回（worktree 保留）| 部分失败：<失败项> | n/a>
  verify 总分   : <X>（来自 state.yaml 的 `runtime.verify.overall_score`）
  产物补齐      : <已补齐四件套（源：change-brief.md）| 无需补齐 | 补齐失败：<reason>>   # 仅 P01 显示
  archive       : <已归档于 <archive_path> | 已延迟（B）| 已跳过（C）| 未归档（失败：<archive_error>）>

后续：
---
下一个变更 /polaris{{SKN_SPR}}coding{{SKN_SPR}}specify 或 /polaris{{SKN_SPR}}coding{{SKN_SPR}}plan；
度量回顾 /polaris{{SKN_SPR}}coding{{SKN_SPR}}retro
```

#### 6.1 主仓游标重置 + 清理

**必做**（含 `runtime.ship.archive=failed`：OpenSpec 目录仍在原位，仅清 polaris 游标与 tasks 档案）。

调用 `ship-cleanup.sh`（删 `coding_tasks` 对应 entry + `rm -rf .polaris/tasks/<task_id>{,.snapshot}`）：

```bash
bash "$PLUGIN_ROOT/scripts/ship-cleanup.sh" "$task_id" "$ORIGIN_REPO" || exit 1
```

输出：`[polaris-flow 开发]交付 - workflow: entry removed, active changes: <N>`



## 退出条件

- ship lock 已获取并在流程结束时由 trap 释放
- `runtime.ship.status=delivered` 已写入
- 若 `created_by_polaris_flow`：已完成 3.5，或用户选 C 且已标注 abandoned
- Step 4.5 已处理（补齐 done / 无需补齐 / 失败已记录）
- archive 已询问；选 A 成功则为 archived，失败则为 failed（**未**移动 openspec）
- Step 6.1 已成功

## 上下文压缩恢复

重载：`task_id`、`worktree_path`、`verify.*`（status / blocked / overall_score）、`ship.*`、`worktree.*`、本 skill 停在哪一步。

- **恢复依据就是落盘产物** —— `state.yaml` 只存身份与指针、不存进度（产物即状态）
- 停在 Step 0 → 重新获取 lock（注意 stale）
- 停在 Step 3.5 中途（sync 完、remove 未完）→ **禁止**直接 remove；先确认 sync 状态再续
- 停在 Step 5 之后、6.1 之前 → 只补 6.1，勿重做分支合并；archive=failed 时勿假装已归档
- 停在 Step 4.5 补齐失败 → 不阻断；照常进入 Step 5，建议用户选 B 暂不归档
- 勿重新跑 verify 全流程，除非 Step 1 终验失败
- 「压缩上下文」与「恢复清单」的用词、提示语模板见 `./policies/auto-transition.md` 的「压缩时机与恢复清单」