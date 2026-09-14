# tasks.md 模板与规则（normal 常规通道）

> **重要**：
> - 本模板由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` Step 6 引用；生成前**必须** `read_file` 重读本文件。
> - **normal 没有 tasks 阶段**，不会有人再来覆写。因此本模板产出的是**终版可执行细计划**，不是 plan 那种等 tasks 覆写的粗骨架。
> - 与 tweak 任务模板的差异：顶层任务上限放宽到 **≤ 8**；跨模块任务必须写明接口依赖（Consumes / Produces，来源 = `design.md` 的模块间接口契约）；文档同步组覆盖**四件套**（非 change-brief）。
> - TDD 类型按任务性质**自动判定**（不询问用户）。

## 模板正文

```markdown
# {{CHANGE_ID}} — 实施任务计划（normal）

> **执行入口**：本计划由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` Step 8 通过 `/opsx:apply` 逐 task 执行。
> **规划入口**：本计划由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` Step 6 生成，**不经过 tasks 阶段覆写**。

**目标**：{{GOAL_ONE_SENTENCE}}

**架构**：{{ARCHITECTURE_2_3_SENTENCES}}

**技术栈**：{{TECH_STACK}}

---

## 1. {{TASK_GROUP_NAME}}

- [ ] 1.1 {{TASK_NAME}}  <!-- TDD 任务 -->

  **文件**:
  - 创建 / 修改: `{{IMPL_PATH}}`
  - 单元测试: `{{TEST_PATH}}`

  **接口**:
  - 调用方: {{PRIOR_SYMBOLS_OR_NONE}}
  - 提供方: {{EXPORTS_FOR_LATER_TASKS}}

  - [ ] 1.1.1 写失败测试：`{{TEST_PATH}}`
  - [ ] 1.1.2 验证测试失败（运行：`{{TEST_COMMAND}}`，确认失败原因是缺少功能）
  - [ ] 1.1.3 写最小实现：`{{IMPL_PATH}}`
  - [ ] 1.1.4 验证测试通过（运行：`{{TEST_COMMAND}}`，确认所有测试通过，输出干净）
  - [ ] 1.1.5 重构：移除重复 / 改善命名 / 抽提 helper（保持所有测试通过；无需重构则写「无需重构」）

- [ ] 1.2 {{TASK_NAME}}  <!-- 非 TDD 任务 -->

  **文件**:
  - 修改: `{{PATH}}`

  **接口**:
  - 调用方: {{PRIOR_SYMBOLS_OR_NONE}}
  - 提供方: {{EXPORTS_OR_N_A}}

  - [ ] 1.2.1 执行变更：`{{PATH}}`
  - [ ] 1.2.2 验证无回归（运行：`{{VERIFY_COMMAND}}`，确认输出干净）
  - [ ] 1.2.3 检查变更完整性（无遗漏文件、无未更新引用）

## 2. {{NEXT_TASK_GROUP_NAME}}

（按需追加任务组，编号连续；任务组划分建议对齐 design.md 的模块划分）

---

## N. 文档同步 (REQUIRED — 必须为最后一组)

- [ ] N.1 同步 `openspec/changes/<change-id>/design.md`：记录实施过程中的技术决策、与设计的偏差、关键实现细节
- [ ] N.2 同步本 `tasks.md`：检查所有顶层任务及子任务的 checkbox 状态；将已完成但仍为 `[ ]` 的条目标记为 `[x]`（每次更新只改 `[ ]` → `[x]`，禁止修改任务描述文字）
- [ ] N.3 同步 `openspec/changes/<change-id>/proposal.md`：若 scope/impact 与原 proposal 有偏差，更新对应章节
- [ ] N.4 同步 `openspec/changes/<change-id>/specs/*.md`：若 requirements 在实施中有调整，更新规约文件
- [ ] N.5 Final review：确认所有 OpenSpec 四件套（proposal/design/specs/tasks）反映实际实施结果
```

---

## 强制规则

### 1. 任务类型自动判定（不询问用户）

按下列规则**逐任务**判定并标注，主代理不得自行选择、也不得询问用户：

| 任务性质 | 标注 | 子步骤数 |
|----------|------|----------|
| 新功能 / Bug 修复 / 含分支逻辑的实现 | `<!-- TDD 任务 -->` | 5 |
| 配置修改 / 重命名 / 文档更新 / 依赖升级 / 构建脚本 / 纯模板与脚手架 | `<!-- 非 TDD 任务 -->` | 3 |
| 无法判定 | `<!-- TDD 任务 -->`（**默认 TDD**） | 5 |

> **为什么不能全局关掉 TDD**：Constitution 的 Test-First 是 `NON-NEGOTIABLE`。把新功能标成非 TDD 会在出口检查的 Constitution 审计上撞 Critical。
> normal 省掉的只是「问用户选 TDD 策略」这个决策点，不是测试纪律。

### 2. 子任务顺序固定

- **TDD 任务**：写失败测试 → 验证 RED → 写最小实现 → 验证 GREEN → REFACTOR（顺序不可调换）
- **非 TDD 任务**：执行变更 → 验证无回归 → 检查完整性

### 3. 规模硬上限

- **顶层任务 ≤ 8**（文档同步组不计入）
- 推导中发现需要 > 8 个顶层任务 → **停止生成**，回到 normal Step 5 走升档门（信号 D5）
- 单个顶层任务的工作量参照「约 20 分钟量级」
- 任务组划分建议对齐 `design.md` 的模块 / 领域划分，一组聚焦一个模块

### 4. 文件、接口与命令必须可执行

- 文件路径相对项目根目录（如 `src/api/auth.ts`），**禁止**使用 `<...>` 占位符
- **Interfaces**：Consumes / Produces 写清后续任务依赖的符号或路径约定；**跨模块任务的接口依赖必须与 `design.md` 的模块间接口契约一致**
- 测试命令、验证命令必须可直接复制到终端运行
- **禁止**在 tasks.md 里贴大段实现代码（实现由 apply 完成）；必须写清行为与验证，禁止 TBD / TODO
- 路径中如出现模板变量，必须显式写成 `{{...}}` 并在生成时替换为真实值

### 5. 文档同步组

- 必须作为最后一组（编号 = 实施任务组数 + 1）
- normal 链路**有**真实四件套（区别于 tweak），文档同步覆盖 `design.md` / `tasks.md` / `proposal.md` / `specs/`
- 禁止在文档同步内做 commit / PR / merge 决策（交给 ship）

### 6. YAGNI 原则

- 只列本次 change 实际需要的任务，不做推测性规划
- 禁止为「未来可能要做」预留占位任务

### 7. 禁止条款

- 禁止在子任务里添加 `git commit` 步骤（统一由 ship 处理）
- 禁止在未观察到测试失败的情况下编写 TDD 任务的实现代码（N.M.2 必须在 N.M.3 之前完成）
- 禁止跳过 REFACTOR 步骤（即便代码已干净，也必须显式确认「无需重构」）

---

## 与上下游的契约

| 上游 / 下游 | 期待本文件提供什么 |
|-------------|-------------------|
| `polaris{{SKN_SPR}}coding{{SKN_SPR}}normal` Step 6.3 | 可被 `tasks-lint.sh` 校验的结构化任务清单 |
| Step 7.2 合并主审（plan-review-agent） | 终版细计划（与四件套 + intention 一并送审） |
| `/opsx:apply`（Step 8.3） | 按 task 顺序逐条执行；通过 `<!-- TDD 任务 / 非 TDD 任务 -->` 决定子步骤节奏；apply 负责更新 checkbox |
| Step 9 出口检查 | 逐条核对「改动文件与 tasks 描述一致」「specs 验收场景可追溯」 |
| `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` | 四件套已齐，**无需** artifact-backfill；`tasks.md` 保持原样归档 |
