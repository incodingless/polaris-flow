# polaris-flow 项目记忆

> 只留**跨会话的长期约定与规则**；过程 / 修订史 / 实测数据进 `YYYY-MM-DD.md`（快照 `MEMORY.archive-*.md`）。

## 一、仓库约定（skills 层）

- **命名** `polaris{{SKN_SPR}}<路径各段>`，后缀=目录名；先定目录再定 name。`SKILL_FAMILIES`（唯一源 `src/core/assets/layout.ts`）= coding/debug/prd/prototype/testing，须与 `assets/<lang>/skills/` 同步；漏登记 → 降级顶层叶技能。
- 安装器**只认两层** `family/skill`；第三层被当技能内子目录 → policies 错位 + 断链。
- **技能文件**：frontmatter 只用标准 `description`（≤1024），路由信息只进它；跨技能相对路径必然断链 → 只能按技能名引用（`./policies/…`、`./templates/…` 由顶层 `zh/policies/*` 注入）。
- **`assets/` 下所有 README + `PROVENANCE.md` 不入仓**（gitignore + `ignoredFiles`）→ 改它们属**不可 diff 的本地补丁**；`ignoredFiles` 无 `/` 时按 **basename 任意层级**匹配。
- **单源判据**：*改一处是否需要记得改另一处*。**规范只写规则、不写修订史**；负向知识写正面表述。
- **停顿点三类**：决策「暂停等用户选」/ 索要信息「一次问全」/ 停止「报阻塞原因，不得伪造选项」。
- **协议↔阶段技能对接 5 位点**：① 指向协议章节 → ② 给 `state next` → ③ 出口真推游标 → ④ 恢复章节含「恢复依据＝落盘产物」+ policy pointer → ⑤ 层级 C 提示块（**技能名/括注取自 `state next`**）。终端技能只到 ④ 并声明「链路终点」；`specify`/`retro` 登记 `skill: null`。查法：`grep '--set phase='` 对齐 `skillForPhase`。
- **阶段枚举权威**＝`task-kind-layout.ts`（代码，可 diff）；守门件＝各 kind 的 `state.yaml` 模板注释 + `dashboard-api-contract.md` §6.2；`assets/zh/skills/README.md` 一览**不作裁定依据**。
- **游标语义**：`workflow.yaml` 的 `phase` =「接下来要执行的阶段」，阶段技能 Step 0 按自己的阶段名筛；**恢复章节 house style** 以 `prototype/blueprint` 为准，**引用方向单向：技能 → protocol**。
- **metrics 只认顶层 `.polaris/metrics/`（数据丢失级）**：`harness-sync` 不递归，写进 `tasks/<id>/metrics/` 的文件随 worktree 移除**永久丢失**。
**清理判据**：只找**不承担判据/指令职能**的文字（真问题形态＝「尾部死内容」）；HTML 契约注释与引用块 `>` 不可清。

## 二、族内要点

- **prototype**：blueprint → build → ship；`review` 是**服务型技能**（游标永不指向；已裁决保留同名映射，在 `task-kind-layout.ts` 加注释登记）。产物 `.polaris/tasks/<task_id>/`；**state.yaml 只记身份与指针——产物即状态**。判据唯一源 `review/references/01-quality-criteria.md`，`build` 不复制。改页面机制 / Token / 脚本判定后跑 `evals/run.mjs --selftest`。
- **debug**：`diagnose` → `patch`（含 1.5 独立验证，仅生产通道）→ `closeout`；入口在命令层 `commands/maintance/`。跨技能复制 Step 0 时**筛选口径 / 入口校验 / 阶段中文名 / 初始化 phase** 四处必须逐项改写。
- **coding/verify**：`4.0 前置验证` 由 `shared/scripts/detect-test-command.sh` 探测（`--repo-root` / `--slot`；退出码 `0` 可用 / `1` 探不到 / `2` 不可执行，**不得合并**），确认值落 config `test:` 段；该脚本＝判定表唯一可执行实现。
- **flow / 命令层**：询问选项上限 **10**（唯一源 `zh/policies/ask-question-react.md`，flow.md 有内联副本需同步）；改需求菜单要动 **6 处**（R01/R02/R03/R11/R12）；`commands/` 按类分目录，**命令文件无需登记 manifest**。

## 三、通用教训

- 核验中文用 **Grep 工具（ripgrep）**；macOS grep 双引号内不吃 `\|`，对本仓 md 常有假空。
- 沙箱禁 `ps`；git 写操作须 `dangerouslyDisableSandbox` + 先 `rm -f .git/index.lock`；批量删除用 `mv` 移走。
- **Edit 报成功 ≠ 落盘**：改前看 `git status` + mtime，写完读回。
- 技能 md 里**禁止以 `..` 开头的路径字面量**（硬阻断安装测试）。
- **范围约定**：检查 / 清理范围 = **`assets/` 下的 `.md`**；`docs/specs/`、`src/`、`.gitignore` 要动**先问**。
- bash 里 `$VAR` **紧邻中文括号**会被吞进变量名（`set -u` 下直接中止）→ 一律写 `${VAR}`。

## 四、进行中与已知问题（指针）

- **plan of record**：`docs/specs/2026-09-25-verify-test-evidence-design.md`（verify 测试证据链，**09-27 已落地**）；前身 `2026-09-10-verify-redesign-proposal.md` **部分过期**；压缩机制见 `2026-09-22-context-boundary-and-compaction-design.md`。
- **既有失败测试（勿重复归因）**：存量 **11 条**（清单见 `2026-09-24.md`），只按**同名同因**判断新增。**全量并发跑会多出约 9 条假失败**（`cli` 4 / `session-start*` 4 / `skills-install` 1），单独跑即绿 —— 先单跑复验再归因。
- **分批提交**：暂存区还留着别的改动时**不要**用裸 `git commit`（会把它一并吞掉）→ 只 `git add` 本次路径再提交。
- **待办与口径指针**：coding / prd / prototype 族未迁移「停顿点三类」（debug 已有）；`codereview` 是服务型技能（不进阶段表，verify `4.3` 按 `review_mode` 调用，inline 须标降级）；报告《AICoding Verify 最佳实践》**不宜当规范**，只作增量来源（≈46%）。
