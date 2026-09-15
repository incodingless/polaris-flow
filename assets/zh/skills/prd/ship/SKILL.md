---
name: polaris{{SKN_SPR}}prd{{SKN_SPR}}ship
description: "已经定稿的产品需求文档交付至指定的文档位置、任务收尾。交付前执行研发就绪度评估（五维度加权评分与双门槛准出判定），满足条件时可免评（仍须输出 PASS（免评）结论与审计记录），判定不通过则阻断交付并回退 refine 修复。用户触发 /polaris{{SKN_SPR}}prd{{SKN_SPR}}ship，或在 refine 完成后要求交付 / 合回 / 归档 / 完结一个任务时必须使用本 skill。"
version: 0.5
---

# 编写产品需求-交付PRD终稿

通过人工评审的产品需求终稿，**先经研发就绪度评估判定准出**，再转移至指定的文档库目录，同时修改任务状态为完成。

**核心设计思路**：准出判定与文档编写分离（`refine` 保质、`ship` 准出）+ 评估对象 = 交付对象 + 人工确认有客观依据

**与 refine 的职责边界**：

| 阶段 | 判定什么 | 结论 |
|---|---|---|
| `refine` | 文档质量是否达标 | P0/T0 是否清零 |
| `ship`（本技能） | 能否交付研发进入技术设计 | PASS / CONDITIONAL / FAIL |

> **P0/T0 清零 ≠ 可交付研发**。质量达标由 refine 保证，准出由本步骤独立判定——判定者与执行者分离，且评估对象是定稿后的最终版本（`prd-final-v1.0.md`），避免「评估 A 版本、交付 A' 版本」的偏差。

### Step 0：状态检查与中断恢复

```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" get-active-changes --kind requirement --skill ship --repo-root "$REPO_ROOT" --phase ship)
EXIT_CODE=$?
```

- `EXIT_CODE != 0` → **阻断**，按 stderr 处理
- `EXIT_CODE == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：直接读取 `task_id`
- **多个匹配**：按 `./policies/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 ship 阶段的活动任务，请先执行 /polaris{{SKN_SPR}}prd{{SKN_SPR}}refine」

> 若选择的任务已是 `phase=ship`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。
> 若上次中断在 ship 中（`ship.status=in_progress` / apply paused），从中断点续跑；不得因「已是 draft」而报零匹配。

**入口校验**（已完成 → 阻断重跑）：

| 检查 | 条件 |
|------|------|
| ship 已完成 | `state.yaml` 中 `ship.status=completed` |

**中断恢复**：`ship.readiness=done` 且有 `readiness_report.md` → 跳过 Step 1 直接进 Step 2；`ship.readiness=failed` → 重新执行 Step 1。

---

## Step 1：研发就绪度评估（准出判定）

**目的**：判定终稿能否交付研发进入技术方案设计（coding 链 specify/plan），为人工确认提供客观依据与重点阅读方向——**由 AI 执行，为人工服务**，压缩人工阅读量，避免人工漫读导致评审形式化。

### 1.1 先解析交付名与评估对象

读取 `$REPO_ROOT/.polaris/tasks/$task_id/state.yaml` 的 `req_name_cn` 需求中文名、`req_prefix` 需求编号前缀；缺失时回退读取 `req_baseline.md` 元数据区同名两项；仍缺失则向用户询问补齐（中文名由 AI 建议 3 个候选，编号前缀由用户输入），确认后补写 `state.yaml`。

交付文档名固定为：`{前缀}-{中文名}-需求终稿-v1.0.md`（如 `UAP-用户权限精细化-需求终稿-v1.0.md`）。

**评估对象**：定稿终稿 `$REPO_ROOT/.polaris/tasks/$task_id/prd-final-v1.0.md`（即最终交付物本身）。

```bash
SRC="$REPO_ROOT/.polaris/tasks/$task_id/prd-final-v1.0.md"
test -f "$SRC" || { echo "终稿缺失：$SRC，请先执行 /polaris{{SKN_SPR}}prd{{SKN_SPR}}refine" >&2; exit 2; }
```

### 1.2 复用判断（先做，避免重复评估）

若 `final/readiness_report.md` 已存在，且其「评估基本信息」记录的**文档版本 == 终稿当前版本**，则**直接复用**该结论，不重跑评估，并在 Step 2 话术中标注「复用已有评估（版本 {Vx.y}）」。

版本不一致或报告不存在 → 继续 1.3。

### 1.3 免评判定（无现成结论时，先判断能否豁免评估动作）

按 `polaris{{SKN_SPR}}prd{{SKN_SPR}}readiness` 的 Step 0 执行。**判定顺序不可颠倒**：

1. **先查强制信号 F1~F5**（首次交付 / D4 子项变更 / 本轮修过 P0·T0 / 跨团队或外部接口 / 用户要求）→ 命中任一则**直接全评**，不再判断免评条件
2. **再查免评条件 E1~E3**（纯文案变更 / 有历史 PASS 或 CONDITIONAL / 不确定性未增加）→ 全部满足才免评，任一不满足则全评
3. **漂移防护**：`state.yaml` 的 `ship.readiness_waive_count >= 2` → **强制全评**

**免评时**（仍须留痕，禁止跳过输出）：

- 落 `final/readiness_report.md` 精简版：结论 `PASS（免评）` + 命中条件编号 + F1~F5 逐项确认 + 评估对象版本 + 时间 + 累计免评次数
- `state.yaml` 写 `ship.readiness: done`、`ship.readiness_verdict: PASS(waived)`、`ship.readiness_waive_count: <N+1>`
- 进入 Step 2，话术**必须**标注「本次免评（条件 E1/E2/E3），累计免评 {N} 次」

**全评时**：`ship.readiness_waive_count` 清零，继续 1.4。

**E1 的判定依据**（必须可追溯，禁止凭印象）：对比终稿「修订记录」表中**上一已评版本之后的全部修订行**——全部为文案/格式/术语类且影响章节不含第 4、5、6、7、8、9 章时判为满足；任一修订行涉及功能点、业务规则、数据模型、接口契约、状态机、并发幂等或 NFR，即判不满足。无法确定上一已评版本时，按 F1 处理（全评）。

> **豁免的是评估动作，不是准出判定。** 免评同样要有明确结论与审计记录——「没评估」与「评估通过」是两回事，下游研发不能面对状态真空。

### 1.4 执行评估

**编排方式**：与 `polaris{{SKN_SPR}}prd{{SKN_SPR}}refine` Step 3.1 相同的 `subagent-probe` → 选定 agent → `subagent-dispatch` 三段式。

- `task_type`：`doc_review`
- `materials`：
  - `prd-final-v1.0.md`（评估对象）
  - `final/full_review_report.md`（业务评审 + 可测性检查，作为 D1~D3 证据源）
  - `req_baseline.md`（作为 D2 证据源）
  - `polaris{{SKN_SPR}}prd{{SKN_SPR}}readiness` 技能 SKILL.md 路径
- `constraints`：只评估不修改；禁止重新判定已由 review / testability 覆盖的问题；缺陷必须定位到章节 + 锚点；输出语言跟随主会话语言
- 平台不支持 subagent 时 → 降级为主代理 inline 执行并在报告中标注

**判定标准**（以 `polaris{{SKN_SPR}}prd{{SKN_SPR}}readiness` 技能定义为准，此处不重复评分表）：

| 判定 | 条件 | 本技能处理 |
|---|---|---|
| **PASS** | 总分 ≥ 80 且 D1/D2/D3/D4 均 ≥ 60 且 D5 ≥ 60 | 进入 Step 2 确认交付 |
| **CONDITIONAL** | 总分 60–79 且 D1~D4 均 ≥ 60（含 D5 < 60 强制降级） | 缺陷清单随确认话术呈现；进入 Step 2 |
| **FAIL** | 总分 < 60 或 D1/D2/D3/D4 任一 < 60 | **硬阻断**：不得进入「确认交付」，只提供「暂停回 refine」 |

**输出落盘**：`final/readiness_report.md`；写 `state.yaml` 的 `ship.readiness: done` / `failed` 与 `ship.readiness_verdict: PASS|CONDITIONAL|FAIL`。

### 1.5 FAIL 时的处理

按 `./policies/decision-point.md` 输出结论与**重点阅读指引**（取自就绪度报告第四章：得分最低的 2 个维度及其必读章节锚点），然后询问：

> 研发就绪度评估结论：**FAIL**（总分 {XX.X}；D{数字} {维度名} {XX} 分，触发一票否决）
> 该文档**不具备准出条件**，不能交付研发进入技术方案设计。
> 需重点修复：
> 1. {维度}（{得分}/5） → 必读 {章节 #锚点}
> 2. {维度}（{得分}/5） → 必读 {章节 #锚点}
> 完整缺陷清单见 `final/readiness_report.md`
>
> A. 暂停回到 refine 修复（修完后重新执行 /polaris{{SKN_SPR}}prd{{SKN_SPR}}ship）
> B. 仍要交付（须填写风险接受理由，仅用于已决策的例外场景）

**默认只推荐 A**；选 B 时必须记录「风险接受理由」到 `state.yaml` 的 `ship.risk_acceptance`，并在交付信息中标注「未通过就绪度评估，风险已接受」。

---

## Step 2：确认交付

按 `./policies/ask-question-react.md` 询问，**必须带上就绪度结论**：

**PASS 时**：

> 研发就绪度评估：**PASS**（总分 {XX.X}，无阻断级缺陷）
> 交付后文档名为：**{前缀}-{中文名}-需求终稿-v1.0.md**
> A. 确认
> B. 暂停回到 refine

**PASS（免评）时**：

> 研发就绪度评估：**PASS（免评）**——命中 E1 纯文案变更 / E2 有历史准出记录 / E3 不确定性未增加，本次变更未触及技术设计输入（累计免评 {N} 次）
> 交付后文档名为：**{前缀}-{中文名}-需求终稿-v1.0.md**
> A. 确认
> B. 改为全评（不豁免，执行五维度完整评估）
> C. 暂停回到 refine

> 人工选择 B 时清空 `ship.readiness_waive_count`，回到 1.4 执行全评。

**CONDITIONAL 时**：

> 研发就绪度评估：**CONDITIONAL**（总分 {XX.X}，{N} 项严重缺陷待补，责任人 {X}，建议补全时限 {日期}）
> 缺陷清单：
> 1. {缺陷} · {章节 #锚点} · {等级}
> …
> 交付后文档名为：**{前缀}-{中文名}-需求终稿-v1.0.md**
> A. 确认交付（研发可同步启动设计，缺陷按清单跟踪）
> B. 暂停回到 refine

仅 A 进入 Step 3。

---

## Step 3：执行交付

### 3.1 转移终稿至文档库

从 `state.yaml` 解析出两个变量：

```bash
REQ_PREFIX=$(bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" get \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --path req_prefix)
REQ_NAME_CN=$(bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" get \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --path req_name_cn)
```

再执行迁移：

```bash
PRD_DOC_DIR="${PRD_DOC_DIR:-$REPO_ROOT/docs/prd}"
mkdir -p "$PRD_DOC_DIR"
SRC="$REPO_ROOT/.polaris/tasks/$task_id/prd-final-v1.0.md"
DST="$PRD_DOC_DIR/${REQ_PREFIX}-${REQ_NAME_CN}-需求终稿-v1.0.md"
test -f "$SRC" || { echo "终稿缺失：$SRC，请先执行 /polaris{{SKN_SPR}}prd{{SKN_SPR}}refine" >&2; exit 2; }
if [ -e "$DST" ]; then echo "目标文件已存在，需人工决策是否覆盖：$DST" >&2; exit 3; fi
cp "$SRC" "$DST"
```

> `$PRD_DOC_DIR` 默认为 `$REPO_ROOT/docs/prd/`；用户可在 Step 2 确认交付时指定其它文档库位置覆盖。
> 任务内终稿固定名为 `prd-final-v1.0.md`（refine Step 4.1 产物）；带中文名与编号前缀的交付名**仅在迁移时生成**，便于从文档库文件名反查需求与编号命名空间。
> 目标文件已存在（exit 3）时**不得静默覆盖**：按 `./policies/decision-point.md` 回显冲突并询问「A. 覆盖 / B. 另存为 `-v1.1` / C. 取消交付」。

### 3.2 更新任务状态

1. 写 `$REPO_ROOT/.polaris/tasks/$task_id/state.yaml`：

```bash
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" complete-phase \
  --repo-root "$REPO_ROOT" --task-id "$task_id" --kind requirement --phase ship
bash "$PLUGIN_ROOT/scripts/task-state-entry.sh" set \
  --repo-root "$REPO_ROOT" --task-id "$task_id" \
  --set status=completed \
  --set "finished_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --set "delivered_to=<文档库目标路径>" \
  --set "delivered_name=<交付文档名>" \
  --set "ship.readiness_verdict=<最终判定>"
# 也可用 set-identity --delivered-name "<交付文档名>"
```

   - `ship.status: completed`（由 `complete-phase` 写入）
   - `status: completed` / `finished_at` / `delivered_to` / `delivered_name` / `ship.readiness_verdict`（见上）
   - 免评记 `PASS(waived)`；若走了 1.5 的 B 分支，`ship.readiness_verdict` 记 `FAIL(risk-accepted)`

2. 将任务移出活跃列表：

```bash
bash "$PLUGIN_ROOT/scripts/workflow-entry.sh" delete-active --kind requirement --skill ship --where-task-id "$task_id" --repo-root "$REPO_ROOT"
```

### 3.3 输出消息
输出：`[polaris-flow 需求工程] 交付PRD终稿 - 已经完成文档交付，当前任务成功完成。(⁎⚈᷀᷁ᴗ⚈᷀᷁⁎)`

并附上交付信息：需求中文名、需求编号前缀、交付文件名、文档库目标路径、**研发就绪度判定结论**（若为 CONDITIONAL 附遗留缺陷数；若为 risk-accepted 明确标注「未通过就绪度评估，风险已接受」）。
