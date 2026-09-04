# tasks.md 模板与规则（tweak 快速通道）

> **重要**：
> - 本模板由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` Step 4.4 引用；生成前**必须** `read_file` 重读本文件。
> - **tweak 没有 plan 阶段**，不会有人再来覆写。因此本模板产出的是**终版可执行细计划**，不是 propose 那种等 plan 覆写的粗骨架。
> - 与 `polaris{{SKN_SPR}}coding{{SKN_SPR}}propose` 的任务模板（`tasks-template.md`）的差异：顶层任务数有硬上限（≤ 3）、TDD 类型改为自动判定（不询问用户）、文档同步组改为同步 `change-brief.md`（无 proposal/design/specs）。

## 模板正文

```markdown
# {{CHANGE_ID}} — 实施任务计划（tweak）

> **执行入口**：本计划由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` Step 5 通过 `/opsx:apply` 在当前会话内逐 task 执行。
> **规划入口**：本计划由 `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` Step 4 生成，**不经过 plan 阶段覆写**。

**目标**：{{GOAL_ONE_SENTENCE}}

**方案**：{{APPROACH_1_2_SENTENCES}}

**影响文件**：{{FILE_LIST}}

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

## 2. 文档同步 (REQUIRED — 必须为最后一组)

- [ ] 2.1 同步 `openspec/changes/<change-id>/change-brief.md`：记录实施过程中的技术决策、与简报的偏差、关键实现细节
- [ ] 2.2 同步本 `tasks.md`：检查所有顶层任务及子任务的 checkbox 状态；将已完成但仍为 `[ ]` 的条目标记为 `[x]`（每次更新只改 `[ ]` → `[x]`，禁止修改任务描述文字）
- [ ] 2.3 Final review：确认 `change-brief.md` 与 `tasks.md` 反映实际实施结果
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

> **为什么不能全局关掉 TDD**：Constitution 的 Test-First 是 `NON-NEGOTIABLE`。把小新功能标成非 TDD 会在出口检查的 Constitution 审计上撞 Critical。
> tweak 省掉的只是「问用户选 TDD 策略」这个决策点，不是测试纪律。

### 2. 子任务顺序固定

- **TDD 任务**：写失败测试 → 验证 RED → 写最小实现 → 验证 GREEN → REFACTOR（顺序不可调换）
- **非 TDD 任务**：执行变更 → 验证无回归 → 检查完整性

### 3. 规模硬上限

- **顶层任务组 ≤ 3**（文档同步组不计入）
- 推导中发现需要 > 3 个顶层任务 → **停止生成**，回到 tweak Step 3 走升档检查
- 单个顶层任务的工作量参照「约 20 分钟量级」

### 4. 文件、接口与命令必须可执行

- 文件路径相对项目根目录（如 `src/api/auth.ts`），**禁止**使用 `<...>` 占位符
- **Interfaces**：Consumes / Produces 写清后续任务依赖的符号或路径约定
- 测试命令、验证命令必须可直接复制到终端运行
- **禁止**在 tasks.md 里贴大段实现代码（实现由 apply 完成）；必须写清行为与验证，禁止 TBD / TODO
- 路径中如出现模板变量，必须显式写成 `{{...}}` 并在生成时替换为真实值

### 5. 文档同步组

- 必须作为最后一组（编号 = 实施任务组数 + 1）
- tweak 链路**没有** `proposal.md` / `design.md` / `specs/`（由 ship 归档前补齐），因此文档同步只针对 `change-brief.md` 与本文件
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
| `polaris{{SKN_SPR}}coding{{SKN_SPR}}tweak` Step 4.5 | 可被 `tasks-lint.sh` 校验的结构化任务清单 |
| `/opsx:apply`（Step 5.3） | 按顺序逐条执行；通过 `<!-- TDD 任务 / 非 TDD 任务 -->` 决定子步骤节奏；apply 负责更新 checkbox |
| Step 6 出口检查 | 逐条核对「改动文件与 tasks 描述一致」「验收标准可追溯」 |
| `polaris{{SKN_SPR}}coding{{SKN_SPR}}ship` | 归档前按 `policies/artifact-backfill.md` 补齐四件套时，`tasks.md` 保持原样不动 |
