---
name: polaris-flow{{SKILL_NAME_SPLITTER}}prd-draft
description: "This skill should be used when the user wants to author product requirement documents (PRD) from user stories through a staged, resumable workflow. It supports per-requirement directory isolation, stage tracking, and breakpoint resume, with a config file defining where documents are generated and where they are archived. Trigger when the user says things like 写产品需求, 根据用户故事生成需求文档, PRD, 需求规格, 把用户故事展开成需求, or asks to clarify, draft, review, or archive a requirement. Six stages: clarify, draft, detail, review, archive."
version: 0.1
---

# 编写产品需求-探索并澄清需求

<HARD-GATE>

</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 需求工程] 进入阶段: 编写PRD初稿 — 使用 polaris-flow{{SKILL_NAME_SPLITTER}}prd-draft 技能。`

## 流程

### Step 0：定位 change_id + 入口校验
```bash
TASK_IDS=$(bash "$PLUGIN_ROOT/hooks/workflow-entry.sh" get-active-changes --skill build --repo-root "$REPO_ROOT" --phase build)
RTID_EXIT=$?
```

- `RTID_EXIT != 0` → **阻断**，按 stderr 处理
- `RTID_EXIT == 0` → `$TASK_IDS` 形如 `["id-a","id-b"]`（可能为 `[]`）

按 `$TASK_IDS` 数组长度解读：

- **唯一匹配**：直接读取 `change_id`
- **多个匹配**：按 `./reference/decision-point.md` 列出候选让用户选择
- **零匹配**：阻断，提示「未找到 plan 阶段的 active change，请先执行 /{{SKILL_NAME_PREFIX}}plan」

> 若 选择的任务已是 `phase=plan`（中断续跑），可从中断点续跑；不得重新筛成「零匹配」。
> 若上次中断在 plan 中（`plan.status=in_progress` / apply paused），从中断点续跑；不得因「已是 build」而报零匹配。

**入口校验**（失败 → 阻断）：

| 检查 | 条件 |
|------|------|
| plan 已完成 | `state.yaml` 中 `plan.status=completed`（或用户明示接受续跑且 `tasks.md` 已是可执行细计划） |
| tasks 可执行 | `openspec/changes/<change_id>/tasks.md` 非空，且含至少一个 `- [ ]` 或（续跑时）未完成项可定位 |
| 工作目录 | 若 `worktree_path` 非空 → 后续 apply / 读 tasks **以该 worktree 为仓库根**；否则用主仓 |

通过后更新 `state.yaml`：`current_verb: build`，`build.status: in_progress`。
输出：`[polaris-flow] build: change_id=<change_id> ; worktree=<path|main>`

### Step 1：前置校验 Gate（必须全部通过才允许继续）
输出落盘：`./sessions/_gate_check.md`

校验项：
1. Baseline文档是否存在；不存在直接终止，提示：`未检测到Baseline基线文档，PRD初稿生成必须依赖Baseline作为唯一需求输入源，请提供Baseline文件路径/完整内容`
2. Baseline结构完整性校验：必须包含【需求背景、业务流程、功能/能力清单、业务场景清单】
   - 缺失任意关键模块，输出缺失清单，终止流程，等待用户补齐Baseline
3. 输入源唯一性确认：声明本次生成仅使用Baseline，参考文档仅控制写作格式，**不作为需求来源**；多份冲突输入请用户指定唯一Baseline。

Gate输出报告写入 `_gate_check.md`，包含：校验时间、Baseline标识、通过/失败、失败原因。

> Gate不通过：直接结束技能，不执行任何文档生成动作

### Phase1｜输入加载、解析、重点提取（静默执行，仅重点环节交互用户）
输出落盘：
- `./sessions/_baseline_index.json` 功能架构索引
- `./sessions/_key_points.json` 人工重点清单

执行步骤：
1. 完整读取Baseline内容；
2. 解析提取实体：角色、业务场景、通用能力、业务规则，分配锚点ID：`cap‑xxx`（通用能力） / `scene‑xxx`（业务场景）；构建索引`_baseline_index.json`；
3. 扫描Baseline识别人工重点：识别加粗、【重点】标记、高亮注释片段；
4. 如果Baseline没有显式重点标记，输出**候选重点清单给用户确认**，用户确认后生成`_key_points.json`；
    - key_points每条字段：`raw_text(原文片段)、belong_module(归属模块)、keep_mode[完整保留｜保留语义｜允许改写]`
5. 加载三份reference规范文档到上下文；
6. 输出状态提示：`Baseline已加载完成，识别通用能力{N}个，业务场景{M}个，已确认重点{K}项，准备进入逐章生成阶段`。

> 禁止：AI自己主观判定哪些是业务重点；重点必须来自原文标记或者用户确认。


## Phase2｜逐章生成、自检、人工确认、即时落盘【核心人机协同】
> 执行铁则：
> 1. 一章完成（生成‑自检‑用户确认‑写入磁盘）之后，才允许进入下一章；
> 2. 不允许一次性批量生成多章节；
> 3. 用户修改意见，修改完成再次展示，必须确认后落盘；
> 4. 确认后的内容直接写入 sessions下独立md文件，不能仅放在内存。

章节顺序严格固定：
1. 01‑需求背景.md
2. 02‑业务流程与时序.md
3. 03‑需求详情‑通用能力层.md
4. 03‑需求详情‑业务场景层.md
5. 04‑版本记录.md
6. 05‑更新记录.md

### 每一章统一执行模板
1. 根据prd-template.md模板，结合Baseline + _baseline_index.json生成本章草稿；
2. 内部双重自检：
   - 自检A writing‑rules：检查是否混入技术代码、表名、接口名，有则改写为产品语言或者标记待确认；
   - 自检B key‑points‑management：取出本章关联的全部重点项，比对草稿，生成本章重点校验表格；
3. 将【章节草稿 + 本章重点校验表】一起输出给用户；
4. 等待用户反馈：
   - 用户确认OK：直接写入 `./sessions/xx‑章节名.md`；进入下一章节；
   - 用户提出修改意见：修改草稿，重新自检，再次输出，重复直到确认通过。

### 业务层特殊规则
> 先写【通用能力层】，后写【业务场景层】；
> - 通用能力：完整描述一次，分配锚点ID；
> - 业务场景层：禁止重复复制通用能力大段原文；使用锚点引用 `详见[xxx](#cap‑xxx)`；只写场景触发条件、流程、**场景独有的差异规则**。

---

### Phase3｜Baseline交叉验证 & 重点保留率校验
落盘输出：`./sessions/_cross_check_report.md`

执行动作：
1. 功能覆盖校验：遍历`_baseline_index.json`全部能力、场景条目，在已经落盘的各章节md文件检索，生成覆盖矩阵；标记✅已覆盖 / ❌缺失；
2. 锚点完整性校验：检查全部锚点引用，不存在的锚点标记异常；
3. 重点内容统计：遍历`_key_points.json`，统计：完整保留数、语义保留数、缺失/偏差项；计算**重点保留率 = (完整+语义保留)/总重点项**；
4. 阈值规则：**保留率低于95%，不允许进入交付阶段**；
5. 如果存在缺失功能/重点：输出清单，询问用户：「补充到PRD｜该条目废弃」；选择补充则回到Phase2对应章节修改落盘，之后重新完整跑一遍Phase3校验；
6. 全部校验通过，写入完整`_cross_check_report.md`，报告包含：功能覆盖矩阵、锚点检查结果、重点保留率、异常项。

> 本阶段**不评审需求业务合理性**；只做：有没有写、重点是否保留、引用是否合法。业务好坏属于人工终稿评审范畴。

---

### Phase4｜合并、质量自检、初稿交付与归档
输入：sessions目录全部已确认章节md
输出：`./prd‑draft‑shturl.` 完整PRD初稿文档

步骤：
1. 按章节顺序合并全部session文件，自动生成Markdown目录，修正全文锚点跳转；
2. 全局质量自检三件套：
   1）清理残留技术术语；
   2）检查是否存在本应锚点引用、却大段复制通用能力内容的重复描述；
   3）标题层级、表格、格式校验；
3. 生成交付说明，放在文档头部：

> 文档类型：PRD 初稿（工作稿，非终稿交付件）
> 基线来源：{Baseline 标识}
> 校验结果：见 ./sessions/_cross_check_report.md
> 重点保留率：XX%
> 说明：本文档由 Agent 生成初稿，必须经过产品人工评审修订之后才可进入后续流程。

4. 输出最终完整prd‑draft‑shturl.；
5. 归档：**完整保留整个 ./sessions 目录**，作为可追溯历史，支持中断恢复；

## 禁止清单（硬性，违反即停止生成）
1. ❌ 不允许脱离Baseline凭空新增业务需求；
2. ❌ 不允许输出数据库表、接口字段、类名、函数、技术实现方案；
3. ❌ 禁止跳过Gate校验直接写文档；
4. ❌ 禁止跳过用户确认直接生成后续章节；
5. ❌ 禁止AI主观新增重点业务，重点必须来自原文标记或者用户确认；
6. ❌ 初稿阶段不实现终稿模块：权限、数据模型、接口契约、埋点、排期。

## 中断恢复能力
> 如果对话中断，重新调用技能，检测`./sessions/_gate_check.md`存在，读取各章节落盘文件，识别已经确认完成章节，从**未确认的第一章继续执行**，不需要从头全部重写。
```