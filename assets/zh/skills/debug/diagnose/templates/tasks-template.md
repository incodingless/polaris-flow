# tasks 模板（diagnose 段）

> **使用范围**：仅 `polaris{{SKN_SPR}}debug{{SKN_SPR}}diagnose` 技能。tweak / normal / hotfix / design 的 tasks 模板**不适用**。
> **落盘路径**：`.polaris/tasks/<issue_id>/tasks.md`。本通道**不使用 openspec**。

## 模板骨架

```markdown
# <issue_id> — 缺陷修复任务计划

> **执行入口**：由 `polaris{{SKN_SPR}}debug{{SKN_SPR}}patch` 逐 task 执行。
> **产物落盘**：`.polaris/tasks/<issue_id>/`

**Goal**：<一句话——修掉什么现象>

**Root Cause**：<path:line> — <一句话逻辑错误描述>（引用 `reviews/rca-report.md`，不重述）

**Regression Scope**：<必须复跑的既有用例 / 场景清单>

---

## 1. 复现用例（红）

- [ ] 1.1 写覆盖故障路径的复现用例  <!-- TDD 任务 -->

  **Files**:
  - Test: `<test file path>`

  **Interfaces**:
  - Consumes: <被复现的入口符号或接口>
  - Produces: <用例名与断言点>

  - [ ] 1.1.1 写失败测试：用例名 `<describe what>`，断言 `<what should fail before fix>`
  - [ ] 1.1.2 验证测试失败（运行：`<test command>`，确认失败点就是故障现象，而非编译错误或环境问题）
  - [ ] 1.1.3 确认复现稳定性：连续运行 3 次，3 次均失败且失败原因一致
  - [ ] 1.1.4 将原始失败输出**原样**粘入 `diagnose-brief.md`「复现」段（不摘要、不剔除行）
  - [ ] 1.1.5 自检用例已最小化到单点：剥净与故障无关的输入与依赖

## 2. 修复（绿）

- [ ] 2.1 最小修复  <!-- TDD 任务 -->

  **Files**:
  - Modify: `<source file path>`

  **Interfaces**:
  - Consumes: <任务 1 的复现用例>
  - Produces: <修复后的行为约定>

  - [ ] 2.1.1 确认任务 1 的用例当前处于失败态（红）
  - [ ] 2.1.2 写最小修复：只改 <path:line>，不动与该缺陷无关的代码
  - [ ] 2.1.3 验证测试通过（运行：`<test command>`，确认任务 1 用例转绿）
  - [ ] 2.1.4 校验 diff 范围（运行：`git diff --stat`），逐文件确认全部落在改动点清单内
  - [ ] 2.1.5 自检无夹带：格式化、重命名、重构、依赖升级、注释增删

## 3. 边界与回归

- [ ] 3.1 补边界用例并跑回归  <!-- TDD 任务 -->

  **Files**:
  - Test: `<test file path>`

  **Interfaces**:
  - Consumes: <修复后的符号>
  - Produces: <边界用例集>

  - [ ] 3.1.1 生成边界用例 **≥2 条**（空值 / 极值 / 边界 / 异常时序 / 并发 / 超时 / 重复提交），取适用项并对不适用项写明理由；任务 1 的故障场景复现用例**单独计数，不抵扣**
  - [ ] 3.1.2 运行新增用例，确认全部通过
  - [ ] 3.1.3 运行 Regression Scope 列出的全部既有用例
  - [ ] 3.1.4 新增用例出现失败时回 2.1.2 处理，禁止归因为环境问题或用例本身有问题
  - [ ] 3.1.5 运行静态检查（lint / 类型检查），分别记录既有告警与本次引入的告警

---

## N. Documentation Sync (REQUIRED — 必须为最后一组)

- [ ] N.1 同步 `diagnose-brief.md`：回填根因证据链、复现原始输出、影响面、回归范围、历史同类
- [ ] N.2 同步本 `tasks.md`：把已完成但仍为 `[ ]` 的条目标记为 `[x]`（只改状态，不改任务描述文字）
- [ ] N.3 `mkdir -p` 建出 `.polaris/tasks/<issue_id>/reviews/` 后生成 `verification.md`（按 `debug:patch` 模板）
- [ ] N.4 写 `.polaris/metrics/<UTC-YYYYMMDD-HHMMSS>-metrics.json` 骨架
- [ ] N.5 Final review：逐项核对「出口门禁清单」
- [ ] N.6 提示走 `polaris{{SKN_SPR}}debug{{SKN_SPR}}closeout` 收尾归档（`docs/troubleshooting/<issue_id>/` + `INDEX.md` 追加一行）
```

## 强制规则

1. **任务数 ≤5**——超出说明修复范围过大，回 `diagnose` 复核是否应转 `coding/normal`
2. **至少 1 个 `<!-- TDD 任务 -->`**——缺陷修复必写回归测试
3. **TDD 任务排在非 TDD 任务之前**——先红后绿，顺序不可调换
4. **路径相对仓库根**，禁止绝对路径与 `<...>` 占位符
5. **任务顺序固定**：复现用例（红）→ 修复（绿）→ 边界与回归
6. **不贴大段实现代码**——只写行为、文件与验证命令，禁止 TBD / TODO
7. **第 1–5 条是 skill 自定规则，`tasks-lint` 不校验**，须自行核对；`tasks-lint` 只校验下面「tasks-lint 校验」列出的 6 项

## tasks-lint 校验

执行（`$PLUGIN_ROOT` 来自 SessionStart 注入；裸相对路径 `scripts/...` 在用户项目根下不存在，且 CLI 需要 `<file>` 位置参数）：

```bash
bash "$PLUGIN_ROOT/scripts/tasks-lint.sh" ".polaris/tasks/<issue_id>/tasks.md"
```

实际校验项为：

- 末位必须存在 `Documentation Sync` 任务组
- 每个 `<!-- TDD 任务 -->` 之后必须跟 ≥3 条 `N.M.K` 形式的子任务
- 全文不得出现 `Constitution Audit` 任务组
- `Documentation Sync` 之前的任何位置不得出现 `git commit` / `git add`
- 不得出现 `superpowers:executing-plans` / `superpowers:subagent-driven-development` 等执行入口 header
- 代码块占比不得超过全文 40%

不通过 → 在 `diagnose` 阶段修 `tasks.md`，仍不通过则阻塞，不得进入 `patch`。
