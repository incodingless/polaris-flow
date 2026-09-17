---
name: polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose
description: "缺陷修复通道的「定位」阶段：确认根因（不是报错点），并产出根因分析报告（rca-report.md）供人确认。完成栈溯源、变更关联、排除反证、全现象解释校验，回填诊断档案，生成九节 RCA 报告，交人确认根因。用户要求：定位这个 bug 的根因、帮我找根本原因、分析这个报错的调用链、这个异常到底怎么引起的，或承接 debug:triage 时使用。不触发：复现/接案（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}triage）、设计修复方案（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}prescribe）、改代码（走 polaris{{SKN_SPR}}debug{{SKN_SPR}}patch）。"
---

# 定位 · 缺陷修复通道 · diagnose

<HARD-GATE>
- **禁止**在稳定复现未达成时进入（`triage` 未过门禁）
- **禁止**只定位「报错点」——必须定位到**最早引入异常**的节点
- **禁止**只解释主现象就下结论——残留现象要显式列出
- **禁止**仅凭「最近有发布」判定根因；变更关联只是线索不是结论
- **禁止**在根因未获人确认时进入下游；不得「先把代码改了再确认」
- **生产通道（channel=hotfix）专属**：影响面正在收割且已有变更清单时，**先出止血选项卡**（`./templates/containment-options.md`）再定位，不许「查完再说」；根因已明确但修复需发布窗口 → 止血与修复**并行**，禁止串行等待
- 产物契约与 RCA 九节见 `./policies/artifacts.md`；能力分档见 `./policies/capability-tiers.md`
- **H8**：进入与每个 Step 入口输出 `[polaris-flow 调试]缺陷修复 - diagnose <动作>`
</HARD-GATE>

**启动时必须先输出**：`[polaris-flow 调试]缺陷修复 - 进入定位：使用 polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose 技能。`

## 进入协议

1. 复用 `$REPO_ROOT` / `$PLUGIN_ROOT`（缺失按 H12 阻断）。
2. 找任务：`get-active-changes --kind debug --repo-root "$REPO_ROOT"`；多条则按 `./policies/decision-point.md` 选。
3. 读上游：`.polaris/tasks/<issue_id>/diagnose-brief.md`（含复现段）——缺失则提示先走 `debug:triage`。
4. `task-state-entry enter-phase --kind debug --task-id <id> --phase diagnose`。

## 流程

### 止血支路（仅生产通道 channel=hotfix，可在任意时点插入）

影响面正在收割且已有变更清单时，**先**必读 `./templates/containment-options.md` 产出止血选项卡交人执行；人回填结果到 `diagnose-brief.md`「止血」段。止血**不替代**根因定位——止血后照常走 Step 1–5。

### Step 1：栈溯源

从报错点向上追完整调用链，定位**最早引入异常**的节点；区分「直接报错点」与「根本原因」，二者分开写清。

### Step 2：变更关联

- `git log` / `git blame` 定位相关文件近期变更、配置变更、依赖升级
- 必须能说明「这次变更如何导致该现象」，否则只是线索

### Step 3：排除与反证

- 至少提出 **1 个替代假设**并给出排除依据
- 无法排除的如实写「未能排除」并说明影响
- 若在 `triage` 检索到历史同类，把其根因作为假设之一，**独立取证**，不得套用结论

### Step 4：全现象解释校验

根因必须能解释 `triage` 记录的**全部**现象；解释不了的残留现象显式列出、标注归因未知。

### Step 5：产出

1. 回填 `.polaris/tasks/<issue_id>/diagnose-brief.md`「根因」「修复方向（影响面 / 回归范围）」段
2. 必读 `./templates/rca-report-template.md`，`mkdir -p ".polaris/tasks/<issue_id>/reviews"` 后生成 `.polaris/tasks/<issue_id>/reviews/rca-report.md`（九节）

## 出口门禁

**技能自证 + 人确认**：报错点 ≠ 根因 + 解释全部现象 + ≥1 排除记录 + 报告中每项结论可在档案中找到对应证据；然后**人确认「根因正确」**（`./policies/decision-point.md`，选项：A 正确进入方案 / B 存疑回 triage 补证据 / C 场景有误改走其他通道）。

## 推进与回流

- 过门禁 → `complete-phase --phase diagnose --next-phase prescribe` + `update-active --set phase=prescribe`，提示走 `debug:prescribe`
- 假设全被排除 / 现象解释不全 → 回 `debug:triage`（`update-active --set phase=triage`，并在 `regressions[]` 留痕）
- 根因是需求有误 → 停止，转 `coding/normal` / `coding/tweak`，保留档案
