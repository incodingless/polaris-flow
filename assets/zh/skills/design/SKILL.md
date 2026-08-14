---
name: {{SKILL_NAME_PREFIX}}design
description: "把 propose 的高层 design.md 深化为可实施的详细技术设计并完成评审。用户触发 /{{SKILL_NAME_PREFIX}}design，或要求把 OpenSpec 高层 design.md 深化为 detailed-design.md / 深度技术设计时必须使用本 skill。"
---

# Polaris 工作流 - 阶段：深度设计（design）

<HARD-GATE>
本 skill **仅**负责把 propose 阶段的高层 `design.md` **深化**为 `openspec/changes/<change_id>/detailed-design.md`。

- **禁止**跳过 Superpowers `brainstorming`（不可用则阻断，禁止用普通对话替代）
- **禁止**跳过专项设计补充预检（`./policies/detailed-design-precheck.md`）：`detailed-design.md` 落盘后必须基于 proposal / design / detailed-design 给出专项建议，并经 decision-point 确认
- **禁止**未按 `./policies/decision-point.md` 获得用户对设计方案的明确确认，就落盘 `detailed-design.md`
- **禁止**重写 OpenSpec `proposal.md` / 高层 `design.md` / `tasks.md` 的结构或范围（深化 ≠ 替代）
- **禁止**在 Design Doc 中再造第二份需求 spec；缺口只能以 **Spec Patch** 回写 `openspec/changes/<change_id>/specs/*/spec.md`（仅限补充验收场景、修正歧义、添加边界条件）
- **禁止**跳过 Step 4 主审：必须派发 `design-review-agent`（评审逻辑在 agent 内，禁止在本 skill 内联重写或主代理自审冒充）
- **禁止**跳过 Step 4 Outside Voice **询问**（按 `.polaris/policies/outside-voice.md`；用户可选跳过 OV，但不得由 AI 代决）
- **禁止**在本阶段创建实施计划 / 调用 `writing-plans` / 进入 `/opsx:apply`（实施计划是 `/{{SKILL_NAME_PREFIX}}plan`；写代码是 build）
- **禁止**把本 skill 当成 plan 主审：不派 `plan-review-agent`、不写 `plan-review-report.md`
- **禁止**将专项设计写成 `design.md` 或放入任何子目录；专项必须为变更根目录下的 `<slug>-design.md`
- **禁止**把设计/评审产物写回 `.polaris/tasks/`（运行态 `state.yaml` 除外）
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow] 进入阶段: design — 使用 {{SKILL_NAME_PREFIX}}design 技能。`

## 标识约定

- **`change_id`**：与 clarify finalize / propose 同值
- 任务目录（运行态）：`.polaris/tasks/<change_id>/state.yaml`
- 意图（只读）：`openspec/changes/<change_id>/intention.md`（propose 已迁入）
- 深度设计产物：`openspec/changes/<change_id>/detailed-design.md`
- 专项设计（可选，扁平）：`openspec/changes/<change_id>/<slug>-design.md`
- 设计主审报告：`openspec/changes/<change_id>/reviews/design-review-report.md`（由 Step 4 落盘）
- Outside Voice 报告（若运行）：`openspec/changes/<change_id>/reviews/openspec-review-report.md`
- 澄清检查点：`openspec/changes/<change_id>/brainstorm-summary.md`
- OpenSpec 四件套：`openspec/changes/<change_id>/`
- workflow 游标：`.polaris/workflow.yaml`（写入走 `hooks/workflow-entry.sh`）

> **职责边界**：propose 的 `design.md` = 高层方案框架；本阶段 `detailed-design.md` = 深度技术细化。深化，不替代。  
> **专项命名**：禁止叫 `design.md`；例：领域模型 → `domain-model-design.md`。不建 `design/` 子目录。

## 流程（按顺序执行；任一步未完成不得进入下一步）

### Step 0：定位 change_id + 入口校验

用 bash 读取工作流配置中有效变更的`change_id`：

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" get-active-changes --skill propose --repo-root "$REPO_ROOT" --phase clarify)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- `RTID_EXIT == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**（恰好 1 个 id）→ 直接取该 `task_id`
- **多个匹配** → 按 `./policies/decision-point.md` 列出候选让用户选择
- **零匹配** → 阻断，提示「未找到 clarify 阶段的 active change，请先执行 /{{SKILL_NAME_PREFIX}}clarify」

> 若 entry 已是 `phase=design`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。

**入口校验**（失败 → 阻断）：

| 检查 | 条件 |
| ---- | ---- |
| 四件套存在 | `openspec/changes/<change_id>/` 下 `proposal.md`、`design.md`、`tasks.md` 非空，且 `specs/` 含至少一个非空文件 |
| 提案评审 | 若存在 `reviews/propose-review-report.md` 且 Verdict=`BLOCK` / 未消化 Critical → 阻断，回 propose |
| 尚未锁定 | 若 `design.status=completed` 且 `detailed-design.md` 已存在 → 询问 A 续写修订 / B 退出（禁止静默覆盖） |

通过后：

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill design --where-change-id "$change_id" --set phase=design
```

更新 `state.yaml`：`current_verb: design`，`design.status: in_progress`。  
输出：`[polaris-flow] design: change_id=<change_id> ; phase=design`

### Step 1：读取上游事实源

- `openspec/changes/<change_id>/proposal.md`
- `openspec/changes/<change_id>/design.md`
- `openspec/changes/<change_id>/tasks.md`
- `openspec/changes/<change_id>/specs/*/spec.md`
- 若存在：`openspec/changes/<change_id>/intention.md`（只读）

### Step 2：Brainstorming（带上下文）

#### 2.1 加载 Superpowers `brainstorming`

**立即执行：** 使用 Skill 工具加载 Superpowers `brainstorming`。禁止跳过。

```bash
LANGUAGE="$(cat "$REPO_ROOT/.polaris/config.yaml" | grep "language" | awk -F'"' '{print $2}')"
```

ARGUMENTS 必须含 `Language: $LANGUAGE`。

加载后上下文：

```text
Change: <change_id>
OpenSpec Context: openspec/changes/<change_id>/*.md

基于 OpenSpec 做深度技术设计（实现方案、技术风险、测试策略、边界条件）。
不清楚则继续提问，不得一轮问答就落盘。
不要重写 proposal / 高层 design.md；缺口仅 Spec Patch 回写 specs。
```

技能不可用 → 停止并提示安装。对话产出方案，**不**落盘 Design Doc。

#### 2.2 增量更新 `brainstorm-summary.md`

路径：`openspec/changes/<change_id>/brainstorm-summary.md`  
未确认内容标「待确认」/「候选」。非 Design Doc，不替代 2.3。

#### 2.3 用户确认设计方案（阻塞点）

按 `./reference/decision-point.md` 暂停，展示技术方案 / 取舍风险 / 测试策略 / Spec Patch（如有）。确认前禁止落盘 `detailed-design.md`。确认 → Step 3；调整 → 回 2.1。

### Step 3：落盘深度设计

#### 3.1 写入 `detailed-design.md`

路径：`openspec/changes/<change_id>/detailed-design.md`

```yaml
---
change: <change_id>
role: technical-design
canonical_spec: openspec
---
```

正文至少含：实现方案、技术风险、测试策略、边界条件、Spec Patch 清单（无则写「无」）。  
有 Spec Patch 则同时改 `specs/*/spec.md`。  
输出：`[polaris-flow] design: wrote openspec/changes/<change_id>/detailed-design.md`

#### 3.2 专项设计补充预检 + 落盘（阻塞点）

**前置**：Step 3.1 的 `detailed-design.md` 已成功落盘。

`read_file ./policies/detailed-design-precheck.md` 并按其执行：

1. 对照 proposal / 高层 `design.md` / `detailed-design.md`，判断是否需补充专项、建议哪些、各自范围内外
2. 按 policy §4 输出预检结论与建议专项清单
3. 按 policy §5 + `./policies/decision-point.md` **阻塞等待**：将推荐项的「范围内/范围外」逐条呈现给用户多选（强烈建议/建议默认勾选；可选默认不勾）；也可选「不补充」或「自定义」

- 用户确认清单为空或不补充 → 跳过专项落盘，进 3.3
- 清单非空 → 按用户勾选的文件名与范围内外写入变更**根目录**（扁平，禁止子目录），模板见 policy §3

| 专项（预检推荐名）| 生成策略 | 文件名 |
|----------------|-----------------|-------------------|
| 领域 / 领域模型 | `./policies/design-domain-model-policy.md` | `domain-model-design.md` |
| 仓储服务 | `./policies/design-repository-policy.md` | `repository-design.md` |
| 数据模型 | `./policies/design-data-model-policy.md` | `data-model-design.md` |
| Rest API | `./policies/design-restful-api-policy.md` | `restful-api-design.md` |
| 其他 | - |用户确认英文 kebab `slug` → `<slug>-design.md` |

**禁止**：文件名 `design.md`（与四件套冲突）；写入 `design/` 或任何子目录；在 3.1 完成前跑本预检；确认后再发明另一套专项菜单。

#### 3.3 主动式上下文压缩
若配置 `context-compression: on`，且在 **`detailed-design.md`、专项设计（若有）、状态证据均已成功持久化落盘后** 考虑主动式压缩。这样压缩后可从文件恢复，不会丢失尚未写入的设计判断。

- 上下文窗口确有压力且存在可调用的原生压缩机制时触发一次，并在恢复提示含 `change_id`、Step 3 完成、以及 `detailed-design.md` / `*-design.md`（若有）/ `brainstorm-summary.md` / OpenSpec 四件套。然后进入 Step 4。
- 压缩只能由用户手动触发时，给出一次非阻塞建议并继续；**不得阻塞**、不得额外制造确认点
- 不得用 shell 命令或摘要伪造上下文压缩

### Step 4：设计评审（阻塞点）

本步派发主审 subagent，再按 Outside Voice 协议询问是否交叉评审；禁止在本 skill 内联重写评审标准。

#### 4.1 主审 — `design-review-agent`

1. **`subagent-probe`**：加载 `{{SKILL_NAME_PREFIX}}subagent-probe`（传入 `platform`）。`inline` / `unsupported` → 标注跳过并 decision-point：A 接受跳过进 Step 5 / B 阻断。不得 inline 假评审。
2. **派发**：注册名 / `subagent_type` = `design-review-agent`（init 已装到 `.<platform>/agents/`）。文件缺失 → 阻断，提示先 `polaris-flow init/update`。

   **按 `subagent-delegate-policy.md` 执行派发**（D-0 工具可用性判定 → D-1 路径引用型 / D-2 内容注入型）。传入参数：

   - `stage_fields`:（无）
   - `materials`（按以下顺序构造）：
     1. `openspec/changes/<change_id>/detailed-design.md`（必审）
     2. `openspec/changes/<change_id>/*-design.md`（有则必审的专项；排除四件套 `design.md`）
     3. `openspec/changes/<change_id>/design.md`（对照只读）
     4. `openspec/changes/<change_id>/proposal.md`（对照只读）
     5. `openspec/changes/<change_id>/specs/**/*.md`（对照只读，每个非空文件）
     6. `openspec/changes/<change_id>/tasks.md`（对照只读）
     7. 若有：`openspec/changes/<change_id>/intention.md`

   D-1 下 agent 按 `design-review-agent.md`「输入」节自读上述路径；D-2 下主代理 Read 全部全文拼入 `Materials:` 段。评审标准在 agent 内（frontmatter 已载入）。

3. **落盘**：确保 `openspec/changes/<change_id>/reviews/` 存在；将完整 **Design Review Report** 写入 `openspec/changes/<change_id>/reviews/deep-design-review-report.md`。

#### 4.2 Outside Voice（询问后可选）

主审已落盘（未因无 subagent 整步跳过）后：

1. `read_file` `./policies/outside-voice.md` 并按其执行。
2. 按复杂度给出建议，decision-point：**A 启动** / **B 跳过**（AI 不得代决）。
3. 用户选 A → 填充 `./templates/outside-voice-prompt.tmpl.md`，派发 `openspec-review-agent`。

   **按 `subagent-delegate-policy.md` 执行派发**（D-0 判定 → D-1 路径引用型 / D-2 内容注入型）。传入参数：

   - `stage_fields`:
     ```text
     Stage: design
     ```
   - `materials`:
     1. `openspec/changes/<change_id>/reviews/design-review-report.md`（即 PrimaryReport，D-2 下全文拼入）
     2. `openspec/changes/<change_id>/detailed-design.md`
     3. `openspec/changes/<change_id>/*-design.md`（有则列，排除四件套 `design.md`）
     4. `openspec/changes/<change_id>/proposal.md`
     5. `openspec/changes/<change_id>/design.md`
     6. `openspec/changes/<change_id>/specs/**/*.md`（每个非空文件）
     7. `openspec/changes/<change_id>/tasks.md`

4. 通过可信度门禁后写入 `openspec/changes/<change_id>/reviews/openspec-review-report.md`；失败则标注 OV 作废并告知用户。
5. 宿主无 subagent → 按协议自动跳过 OV 并标注（主审已在 4.1 处理）。

#### 4.3 消化

1. 主审 `Verdict`：`BLOCK` / 未消化 Critical → 不得完成；`APPROVE_WITH_CONCERNS` → decision-point 确认或修订。
2. 若有 OV：与主审 tension / P0/P1 按 outside-voice 用户主权逐条决策；**禁止**自动改设计。
3. 修订 `detailed-design.md` / 专项后 → 重跑 4.1（最多 3 轮）；主审重跑后再询 OV。

### Step 5：完成 design 阶段

更新 `state.yaml`：

```yaml
design:
  status: completed
  path: openspec/changes/<change_id>/detailed-design.md
  review_report: openspec/changes/<change_id>/reviews/design-review-report.md  # 或 skipped:<reason>
  outside_voice: ran | skipped:<reason> | not_run:<reason>
  outside_voice_report: openspec/changes/<change_id>/reviews/openspec-review-report.md  # 若 ran
```

```bash
bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" update-active --skill design \
  --where-change-id "$change_id" --set phase=plan
```

输出：`[polaris-flow] design 阶段完成：openspec/changes/<change_id>/detailed-design.md 已锁定。下一步建议 /polaris-flow-plan。`

## 退出条件

- `detailed-design.md` 已落盘且 frontmatter 合法
- Step 2.3 用户已确认方案
- Step 4 主审已派发（或用户接受主审 SKIPPED）且无未消化 Critical
- Outside Voice 已询问并完成（ran / 用户跳过 / 宿主无法运行已标注）
- `phase=plan`

## 上下文压缩恢复

重载 Step 3.3 handoff + `reviews/design-review-report.md` + `reviews/openspec-review-report.md`（若有）。
