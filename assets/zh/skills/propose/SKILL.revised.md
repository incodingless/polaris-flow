<!--
  对比修订稿（非正式发布）：与同目录 SKILL.md 对照阅读。
  勿直接当作已生效 skill；确认后可替换 SKILL.md。

  相对现稿的主要修正：
  1. Step 0 筛 phase=clarify（clarify 完成后仍为 clarify），不再误筛 phase=design；
     零匹配提示改为先执行 /polaris-flow-clarify。
  2. workflow-entry 统一用 --where-change-id（删除不存在的 --where-task-id）。
  3. 全文统一 change_id；目录 `.polaris/tasks/<change_id>/`（与 clarify finalize 后的 task_id 同值）。
  4. description / 正文统一为 intention.md（删除 intent_brief.md）。
  5. intention 节名与 templates/intention-template.md 对齐（中文节名）；删除英文幽灵节名。
  6. 删除对不存在的 pre-design-validate.sh / pre-design-template.md 的调用；
     改为按 intention-template 必含节清单校验。
  7. 产物循环与出口统一为 OpenSpec 四件套：proposal + specs/ + design + tasks。
  8. worktree 字段统一 created_by_polaris_flow；品牌前缀统一 [polaris-flow]；
     下一步建议 /polaris-flow-design。
  9. 修正 worktree 推荐规则（并行/脏工作区 → 建 worktree；小改动 → 留主仓）。
  10. 询问协议改引用 .polaris/reference/decision-point.md（与 clarify.revised 一致）。
  11. 补全产物树代码块闭合；HARD-GATE 与 fallback 边界写清。

  已知外部债（本修订稿约定目标态，脚本尚未同步时需另改）：
  - hooks/worktree-create.sh 仍写 .harness/changes/ 与 created_by_easy_flow；
    目标应为拷贝/更新 .polaris/tasks/<change_id>/，并写 created_by_polaris_flow: true。
  - change-state-template.yaml 路径注释仍混有 .polaris/changes/；以 clarify 的 tasks/ 为准。
-->

---
name: polaris-flow-propose
description: "用户触发 /polaris-flow-propose、/propose，或要求基于 intention.md 生成 OpenSpec 四件套（proposal/specs/design/tasks）时必须使用本 skill。"
---

# Polaris 工作流 - 阶段：提案（propose）

<HARD-GATE>
- **禁止**未检查 `intention.md` 存在性就调用 `/opsx:propose`
  - 文件存在 → 必须读取全文后再调用
  - 文件不存在 → 必须先走 Step 2.2 fallback 声明，方可调用（不得静默跳过检查）
- **禁止**跳过 worktree 提示直接进入 propose 主流程（提示非阻断：用户可选不创建并继续，但**不能不问**）
- **禁止**主代理在调用 `/opsx:propose` / 生成 `tasks.md` 之前未 `read_file templates/tasks-template.md`
- **禁止**通过 `superpowers:using-git-worktrees` 创建 worktree——必须由本 skill Step 1.3.A 直接执行 git / hooks 完成
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入提案阶段: 使用 polaris-flow-propose 技能。`

## 标识约定

- **`change_id`**：本 skill 唯一主键。与 clarify finalize 后的目录名 / `task_id` **同值**。
- 任务目录：`.polaris/tasks/<change_id>/`
- 意图文档：`.polaris/tasks/<change_id>/intention.md`
- workflow 游标：`.polaris/workflow.yaml` → `active_changes[].change_id`（写入一律走 `hooks/workflow-entry.sh`）

## 流程（按顺序执行，每一步未完成不得进入下一步）

### Step 0：定位 change_id

读取 `.polaris/workflow.yaml: active_changes`，筛选 `phase=clarify` 的 entry：

- **唯一匹配**：直接取其 `change_id`
- **多个匹配**：按 `.polaris/reference/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 clarify 阶段的 active change，请先执行 /polaris-flow-clarify」

> 若 entry 已是 `phase=propose`（例如上次中断续跑），且同 `change_id` 下 worktree 决策与 intention 校验已完成，可从中断点续跑；不得重新筛成「零匹配」。

### Step 1：Worktree 决策（提示性，非阻断）

**1.1 前置自检**：读 `.polaris/tasks/<change_id>/state.yaml` 的 `worktree.created_by_polaris_flow`。

- 字段**已存在**（`true` 或 `false`）→ 跳过本步，输出 `[polaris-flow] worktree: 已决策（<true|false>），跳过本次询问。` 后进入 Step 2
- 字段缺失 / 空 → 继续 1.2

**1.2 询问用户**（统一文案，不按 tier 区分；按 decision-point 协议）：

> 即将进入 propose 阶段，会生成 OpenSpec 规格文档并改动仓库。是否为本次变更建立独立的 git worktree？
>
> A. 是，创建 worktree
> B. 否，留在当前工作目录

**推荐规则**（可附在选项旁，不强制）：

- 需要并行开发，或当前分支有未提交工作 → 推荐 **A**
- 变更预计很小（例如 ≤ 3 个文件）、无并行需求 → 推荐 **B**

#### 1.3.A 用户选 A — 创建 worktree

```bash
CONFIG_FILE="$REPO_ROOT/.polaris/config.yaml"
PLUGIN_ROOT="$(cat "$CONFIG_FILE" | grep "plugin_root" | awk -F'"' '{print $2}')"

main_repo_root="$(git rev-parse --show-toplevel)"
WT_RESULT=$(bash "$PLUGIN_ROOT/hooks/worktree-create.sh" "$change_id" "$main_repo_root")
WT_EXIT=$?
```

- exit 0 → `$WT_RESULT` 含 JSON（`target_path` / `target_branch` / `snapshot_path`）；继续下方同步
- exit 1 → **阻断**，stderr 有错误信息

创建成功后，确保 `.polaris/tasks/<change_id>/state.yaml`（worktree 内路径优先）写入：

- `worktree.created_by_polaris_flow: true`
- `worktree.path` / `branch` / `origin_repo` / `status: active`
- `current_verb: propose`

同步主仓 workflow.yaml（脚本内含锁 / 写后校验，见 H12）：

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill propose \
  --where-change-id "$change_id" --set phase=propose --set worktree-path="$target_path"
```

输出 `[polaris-flow] worktree: created at <target_path> on branch <target_branch>`。

#### 1.3.B 用户选 B — 留在主仓库

不动 git。更新主仓 `.polaris/tasks/<change_id>/state.yaml`：

- `worktree.created_by_polaris_flow: false`
- `current_verb: propose`

同步 workflow.yaml（phase 切到 propose，worktree_path 仍为空）：

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill propose \
  --where-change-id "$change_id" --set phase=propose
```

输出 `[polaris-flow] worktree: not created, staying in <cwd>`。

### Step 2：定位并校验 `intention.md`

**2.1 定位**：

- worktree 模式（1.3.A）：`<target_path>/.polaris/tasks/<change_id>/intention.md`
- 主仓模式（1.3.B）：`<main_repo_root>/.polaris/tasks/<change_id>/intention.md`

**2.2 文件存在性 + 完整性**：

| 情况 | 处理 |
|---|---|
| **文件不存在** | fallback：把用户调用 `/polaris-flow-propose`（或 `/propose`）时的原始消息作为 propose 输入；输出 `[polaris-flow] 未找到 intention.md，使用用户原始 prompt 作为 propose 输入。` 后跳到 Step 3.2 |
| **文件存在** | 对照 `templates/intention-template.md` 检查下方**必含节**均存在且非空。缺节 → **阻断**，列出缺失节名，提示回到 clarify 补全 |

**必含节**（节名必须与模板一致，勿用英文别名）：

| 必含节 |
|---|
| `## Reframe 历程` |
| `## 宪法对齐` |
| `## 前提` |
| `## 目标` |
| `## 结论（架构 + 技术选型）` |
| `## 备选方案` |
| `## 任务范围（Scope）` |
| `## 验收场景及标准` |
| `## 待决问题` |

**2.3 用户最终确认**（防御性，防陈旧 intention.md）：完整路径下输出预览 + 询问 `A. 确认 / B. 暂停回到 clarify`，仅 A 进入 Step 3。

### Step 3：调用 `/opsx:propose`

**3.1 强制前置**：调用前必须 `read_file templates/tasks-template.md`，并显式输出：

`[polaris-flow propose] 已 read_file templates/tasks-template.md（version: <模板顶部第一行>）`

**3.2 组装输入**：

- 完整路径 → `intention.md` **全文整段嵌入**（不要总结）
- fallback 路径 → 用户调用时的原始消息

**`intention.md` 节 → OpenSpec 四件套映射**（仅完整路径适用）：

| `intention.md` 节 | 写入位置 | 要求 |
|---|---|---|
| `## Reframe 历程` | `proposal.md` 的 Why / Context | 必须包含 |
| `## 目标` | `proposal.md` 的目标相关节 | 必须包含 |
| `## 任务范围（Scope）` | `proposal.md` 范围 / 非目标；并作为 `tasks.md` 任务划分依据 | 必须包含；任务为粗粒度，单任务约 20 分钟量级 |
| `## 待决问题` | `proposal.md` 的 Open Questions / 待决 | 必须包含 |
| `## 验收场景及标准` | `specs/` 需求与场景依据 | 必须体现 |
| `## 宪法对齐` | `design.md` 的 `## Constitution Alignment`（逐条对齐 Core Principle） | 必须包含 |
| `## 前提` | `design.md` 的 `## Premises` | 必须包含 |
| `## 结论（架构 + 技术选型）` | `design.md` 的 Architecture / 选型相关节 | 必须包含架构决策与方案选型（深度技术设计留给后续 design 文档细化） |
| `## 备选方案` | `design.md` 的 `## Alternatives` | 必须包含未选方案及拒绝理由 |

`tasks.md` 严格按 `templates/tasks-template.md` 规则生成；`change_id` 来自 Step 0。

**3.3 执行**：主代理在自己会话内调用 `/opsx:propose <change_id>`，把 3.2 的输入作为命令上下文。

按 OpenSpec **四件套**循环生成（对每个 artifact：以 `openspec status` 给出的可创建顺序为准；通常为 `proposal` → `specs` → `design` → `tasks`）：

**标准产物循环**：

1. 刷新状态：`openspec status --change "<change_id>" --json`
2. 获取当前产物指令，例如：

    ```bash
    openspec instructions proposal --change "<change_id>" --json
    openspec instructions specs --change "<change_id>" --json
    openspec instructions design --change "<change_id>" --json
    openspec instructions tasks --change "<change_id>" --json
    ```

3. 对返回的 JSON 指令载荷，必须：
    - 读取 `dependencies` 中列出的每个已完成依赖产物
    - 以 `template` 作为产物结构
    - 遵循 `instruction` 的指引
    - 将 `context` 和 `rules` 作为约束条件应用，**不得复制到 artifact 内容中**
    - 写入 `resolvedOutputPath`
    - 验证输出文件存在且非空
4. 每创建一个 artifact 后，重新运行 `openspec status --change "<change_id>" --json` 确认状态，然后继续下一个 artifact

**失败处理**：如果 `openspec instructions` 失败、返回无效 JSON、报告未满足的 `dependencies`、或未提供可用的 `resolvedOutputPath`，必须立即停止 artifact 创建并报告 OpenSpec 错误。不得回退为硬编码文档结构（会绕过项目规则）。

确认以下产物已创建：

```
openspec/changes/<change_id>/
├── .openspec.yaml
├── proposal.md       # Why + What：问题、目标、范围
├── specs/            # 需求规格（目录，至少含有效 spec 文件）
├── design.md         # How（高层框架）：架构决策、方案选型
└── tasks.md          # 任务清单（勾选框）
```

### Step 4：出口校验

> fallback 模式（用户原始 prompt 作输入）下，若 propose 未生成第 2/3 项要求的节，可放宽不阻断、仅在摘要中标记 `(fallback)`。`tasks-lint.sh` 与「四件套文件存在」仍必须通过。

`/opsx:propose` 返回后校验：

1. **四件套均生成**：`openspec/changes/<change_id>/` 下含 `proposal.md` / `design.md` / `specs/` / `tasks.md`，逐个确认路径存在且非空（`specs/` 为目录且内含至少一个非空文件）。任一缺失或为空 → 不得进入 Step 5，必须回到创建步骤补充。
2. `proposal.md` 含问题背景、目标、范围、非目标
3. `design.md` 含高层架构决策、方案选型，且含：
   - `## Constitution Alignment`（逐条覆盖 Core Principle）
   - `## Alternatives`（未选方案及拒绝理由）
   - `## Premises`
4. `tasks.md` 含任务列表，每个任务有明确描述；通过合规检查（**必须跑脚本，禁止脑补核对**）：

```bash
CONFIG_FILE="$REPO_ROOT/.polaris/config.yaml"
PLUGIN_ROOT="$(cat "$CONFIG_FILE" | grep "plugin_root" | awk -F'"' '{print $2}')"
LINT_RESULT=$(bash "$PLUGIN_ROOT/hooks/tasks-lint.sh" "openspec/changes/$change_id/tasks.md")
LINT_EXIT=$?
```

   - exit 0 → 通过
   - exit 1 → **阻断**，输出 `$LINT_RESULT`（JSON violations），要求修正 `tasks.md` 后重新跑本校验
5. 本 skill 在调用前已显式输出「已 read_file `templates/tasks-template.md`」声明

### Step 5：完成 propose 阶段

校验通过 → 输出：

`[polaris-flow] propose 完成：四件套已落盘到 openspec/changes/<change_id>/（tasks.md 为粗骨架，细计划由 /polaris-flow-plan 覆写）。下一步建议 /polaris-flow-design。`

任一项不满足 → 阻断并输出失败原因。
)
