# tasks.md 模板与规则（easy-flow 工作流）

> **重要**：design 阶段调用 `/opsx:propose` **必须在每次调用前 read_file 重读本文件**。

## 任务粒度规则

tasks.md 支持两类任务：

| 类型 | 适用场景 | 子任务步数 |
|------|---------|-----------|
| **TDD 任务** | 新功能、Bug 修复、含分支逻辑的实现 | 5 步（写失败测试 → RED → 写最小实现 → GREEN → REFACTOR） |
| **非 TDD 任务** | 配置修改、重命名、文档更新、依赖升级、构建脚本、纯模板/脚手架 | 3 步（执行变更 → 验证无回归 → 检查完整性） |

**判定原则**：无法判断时**默认按 TDD 任务处理**。该判定结果以 HTML 注释形式标注在每条 task 后（`<!-- TDD 任务 -->` / `<!-- 非 TDD 任务 -->`），供 `/opsx:apply` 在 implementer subagent 内识别子步骤顺序。

---

## 模板正文（propose 须按此格式生成 tasks.md）

```markdown
# {{CHANGE_ID}} — 实施任务计划

> **执行入口**：本计划由 `/ezfl:build` 通过 `/opsx:apply` 在 implementer subagent 内逐 task 执行。


**Goal**：{{GOAL_ONE_SENTENCE}}

**Architecture**：{{ARCHITECTURE_2_3_SENTENCES}}

**Tech Stack**：{{TECH_STACK}}

---

## 1. {{TASK_GROUP_NAME}}

- [ ] 1.1 {{TASK_NAME}}  <!-- TDD 任务 -->

  **Files**:
  - Create / Modify: `{{IMPL_PATH}}`
  - Test: `{{TEST_PATH}}`

  - [ ] 1.1.1 写失败测试：`{{TEST_PATH}}`
  - [ ] 1.1.2 验证测试失败（运行：`{{TEST_COMMAND}}`，确认失败原因是缺少功能）
  - [ ] 1.1.3 写最小实现：`{{IMPL_PATH}}`
  - [ ] 1.1.4 验证测试通过（运行：`{{TEST_COMMAND}}`，确认所有测试通过，输出干净）
  - [ ] 1.1.5 重构：移除重复 / 改善命名 / 抽提 helper（保持所有测试通过）

- [ ] 1.2 {{TASK_NAME}}  <!-- 非 TDD 任务 -->

  **Files**:
  - Modify: `{{PATH}}`

  - [ ] 1.2.1 执行变更：`{{PATH}}`
  - [ ] 1.2.2 验证无回归（运行：`{{VERIFY_COMMAND}}`，确认输出干净）
  - [ ] 1.2.3 检查变更完整性（无遗漏文件、无未更新引用）

## 2. {{NEXT_TASK_GROUP_NAME}}

（按需追加任务组，编号连续）

---

## N. Documentation Sync (REQUIRED — 必须为最后一组)

- [ ] N.1 同步 `openspec/changes/<change-id>/design.md`：记录实施过程中的技术决策、与设计的偏差、关键实现细节
- [ ] N.2 同步本 `tasks.md`：检查所有顶层任务及子任务的 checkbox 状态；将已完成但仍为 `[ ]` 的条目标记为 `[x]`（每次更新只改 `[ ]` → `[x]`，禁止修改任务描述文字）
- [ ] N.3 同步 `openspec/changes/<change-id>/proposal.md`：若 scope/impact 与原 proposal 有偏差，更新对应章节
- [ ] N.4 同步 `openspec/changes/<change-id>/specs/*.md`：若 requirements 在实施中有调整，更新规约文件
- [ ] N.5 Final review：确认所有 OpenSpec 四件套（proposal/design/specs/tasks）反映实际实施结果
```

---

## tasks.md 强制规则（propose 生成时必须遵守）

### 1. 任务类型判定与标注

- 新功能 / Bug 修复 / 含分支逻辑的实现 → TDD 任务（5 步）
- 配置修改 / 重命名 / 文档更新 / 依赖升级 / 构建脚本 / 纯模板与脚手架 → 非 TDD 任务（3 步）
- 无法判断时**默认按 TDD 任务处理**
- 每条 task 必须以 HTML 注释形式标注类型：`<!-- TDD 任务 -->` 或 `<!-- 非 TDD 任务 -->`

### 2. 子任务顺序固定

- **TDD 任务**：写失败测试 → 验证 RED → 写最小实现 → 验证 GREEN → REFACTOR（顺序不可调换）
- **非 TDD 任务**：执行变更 → 验证无回归 → 检查完整性

### 3. 文件与命令必须可执行

- 文件路径相对项目根目录（如 `src/api/auth.ts`），禁止使用 `<...>` 占位符
- 测试命令、验证命令必须可直接复制到终端运行
- 路径中如出现占位符，必须明确标注用 `{{...}}`，propose 生成时替换为真实值

### 4. Documentation Sync 强制要求

- DocSync **必须**作为最后一组（编号 N，N = 实施任务组数 + 1）
- 子任务为平铺检查项，不再展开二级子任务
- DocSync 内不做 commit / PR / merge 决策——这些动作交给 `/ezfl:ship` 阶段的 `ship` skill + `superpowers:finishing-a-development-branch`

### 5. YAGNI 原则

- 只列本次 change 实际需要的任务，不做推测性规划
- 禁止为"未来可能要做"预留占位任务

### 6. 禁止条款

- 禁止在子任务里添加 `git commit` 步骤（统一在最后由 ship 阶段处理）
- 禁止在未观察到测试失败的情况下编写 TDD 任务的实现代码（N.M.2 必须在 N.M.3 之前完成）
- 禁止跳过 REFACTOR 步骤（即便代码已干净，也必须显式确认"无需重构"）

---

## 与 build / lock / audit 的契约

| 上游消费方 | 期待 tasks.md 提供什么 |
|------------|----------------------|
| `/ezfl:lock`（plan-review） | 评审 tasks.md 的粒度、依赖排序、可执行性；评审建议写到 `review-report.md`，**不直接修改 tasks.md** |
| `/ezfl:build`（implementer subagent 跑 `/opsx:apply`） | 按 task 顺序逐条执行；通过 `<!-- TDD 任务 / 非 TDD 任务 -->` 注释决定子步骤节奏；apply 自身负责更新 checkbox（`[ ]` → `[x]`） |
| `/ezfl:audit` | 实施完成后扫描产出物做 Constitution 合规与 scorer 评分；不读 tasks.md，只看代码改动与产出 |

---
