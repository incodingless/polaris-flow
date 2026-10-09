# Polaris Flow — 项目长期记忆

## 资产分发

- **命令落盘**：nested → `<ctx>/commands/psfl/<相对路径>`（命令名 `/psfl:<路径，/→:>`）；
  flat → `<ctx>/commands/psfl-<路径，/→->.md`。**文件名/路径即命令名**；frontmatter `name` 只是显示标签，
  `command_prefix`/`triggers` 无任何代码消费（纯元数据，占位符靠通用替换展开）。
  ⚠️ 命令前缀由常量 `POLARIS_COMMAND_PREFIX='psfl'`（`core/config/polaris-constants.ts`）承载，**与技能插件名
  `POLARIS_PLUGIN_NAME='polaris'` 刻意解耦**——两者曾共用同一常量，改命令前缀必须先拆分，否则技能目录会被
  连带改名。引用该前缀的位置：`install/commands.ts`（flat 前缀）、`install/layout.ts`（nested 命名空间目录）、
  `update/prune.ts`（命令归属判定，`isOwnedEntryName(name, prefix)` 接收前缀参数）。
- **技能落盘**：`<ctx>/skills/polaris/...`（nested）或 `<ctx>/skills/polaris-<族>-<技能>`（flat）。
- `{{SKN_SPR}}`（按 skillsLayout）/ `{{CMD_SPR}}`（按 commandLayout）→ nested `:`、flat `-`。
  命令正文引用技能/命令**必须**用占位符。
- 平台：claude（技能+命令皆 nested）、cursor（命令 flat）、trae/trae-cn（技能 flat）、qoder。
  `init` 默认 `en`，但 `assets/en/skills/` 为空 → 验证必须 `--lang zh`。
- `assets/en/commands/` 与 zh 脱节：仅根级 6 文件（无子目录）。

## 技能资产（`assets/zh/skills/`）

- 族：coding（build/design/normal/plan/retro/ship/specify/tasks/tweak/verify）、
  prd（discovery/draft/readiness/refine/review/ship/testability）、
  testing（acceptance/discovery/draft/refine/review/ship）、prototype（blueprint/build/review/ship）、
  debug（diagnose/patch/closeout）、constitution/、subagent-dispatch/、subagent-probe/、maintance/codereview/。
  合计 34 个 SKILL.md。
- ⚠️ 测试族固定 `testing`（不可改 `test`，与根 `test/` 冲突）；族名在 `layout.ts` 与
  `install/skills.ts` 的 `SKILL_FAMILIES` 同步注册。**写路由表前先 `ls` 核对**。
- 不安装：`assets/zh/skills/requirements-engineering/`（被 `shouldSkipSkillShortPath` 跳过）。
- 测试用例命令定名 `create-testcase`（勿改）；`acceptance`/`review-testcase` 同遵循「文件名=命令名」。

## 阶段表与产物（权威源 = `src/core/config/task-kind-layout.ts`）

- requirement：discovery→draft→refine→ship；`req_baseline.md`/`prd-draft.md`(+index+key_points)/
  `prd-final-v1.0.md`；ship→`docs/prd`。
- testcase：discovery→draft→refine→ship；全部落 `.polaris/testcases/<id>/`；`testing/review` 服务型，
  不进相位表（由 refine 派发）。
- prototype：blueprint→build→review→ship（游标不落 review）。
- debug：diagnose→patch→closeout（**无 build**；`triage` 勿再写）；`debug/patch` 写
  `phase: patch` + `runtime.patch.status`。
- `state.yaml.phase` 只写不读，进度以 `workflow.yaml` 游标为准；表外阶段被拒（退出码 3）。

## 安装注入机制（改引用前必查）

- `assets/zh/policies/*` 注入每个叶技能 `policies/`（subagent-probe/dispatch 除外）→ 策略唯一源放
  顶层 policies，技能内 `./policies/x.md` 引用照旧（源码树看不到是正常）。
- **禁跨技能相对路径**（`../x/...`）→ 只能用技能名占位符或技能内自包含路径（`./policies/`、`./templates/`）。
- 包级 `assets/zh/templates/` 只落 `skills/polaris/templates/`，不逐技能注入。
- ⚠️ **占位符只在 skills / commands 域展开**（`applySkillNamePrefix` 仅被 `install/skills.ts`、`install/commands.ts` 调用）。
  `assets/*/agents/**` 落盘只改 frontmatter 的 `tools:`/`model:` 两行、**正文原样拷贝**（`install/agents.ts`）→
  **agent 正文禁用 `{{SKN_SPR}}`/`{{CMD_SPR}}`**：只能写字面量，或并列写 nested / flat 两种形态，否则占位符会原样漏进用户项目。
- **命令不能引用 `./policies/`**（插件根无 policies，且 `commands/**/*.md` 全被注册成命令）→ 需发问时内联精简注册表。
- `assets/**/README.md` 不入仓也不安装（gitignore_global + manifest ignoredFiles）→ 长期内容必须写进被跟踪文件。

## Hook 与平台

- 只有 1 个 hook：SessionStart；资产 `assets/shared/hooks/`（语言中立），注册模板 `assets/shared/hooks.json`，
  逻辑在 `src/commands/hooks/`。落盘配置见 `src/core/install/hooks.ts`（claude/cursor→settings*.json、
  trae→hooks.json、**trae-cn→`~/.trae-cn/hooks.json`**、qoder 不支持）。command 为项目相对路径，
  不依赖 `CLAUDE_PLUGIN_ROOT`。**不是 hook**：`constitution-validity.sh`、`scorers/*.sh`。
- 平台清单仅 claude/cursor/trae/trae-cn/qoder（**代码里无 codebuddy**）。

## 发问与命令资产约定

- **禁在 SKILL 写死 `AskUserQuestion`**（`policies/ask-question-react.md`）；按 config `platform` 查注册表；
  单次选项上限 4/5。命令资产内联注册表。
- 让用户选择须给「判定规则」表区分**明确选择**与不算选择，接受名称或编号。
- multi-turn 询问类命令：每轮各占一级标题（`## 第一步`…）；每轮给完整可复制的工具调用 payload；
  配「执行状态」小节记录已选值，缺值不下走；HARD-STOP 写死禁跳步、禁纯文本罗列。
- 路由型命令在「选完做什么」与「加载技能」间插入**上下文收集步骤**。

## 阻塞点审计（唯一源 = `zh-skills-blocking-points-review.md`）

- 34 技能 / 578 条阻塞点、四档判定、17 条核验清单、分级整改建议 → 见报告，此处只留约定。
- ⚠️ **未裁定**：`coding/verify:329` 基线口径（A「全绿才放行」 vs 记忆中「B」）；2026-10-09 用户明确
  保留自决 → **勿单方改**。
- **已落盘（勿回退）**：H10 为硬约束、无跳过分支；H12 只管 workflow.yaml 加锁/写后校验（正确引用仅
  `coding/tweak:97,234`、`debug/diagnose:181`）；H11 限 `coding:ship`；`artifact-backfill.md` 保持两份
  副本（tweak 消费 §2、ship 消费 §3）；`constitution-audit.md` 已迁共享 policy；`debug/*/references/artifacts.md`
  保持 3 份；打印标记约定已废；ezfl 全仓清零、`constitution-injection.md` 已删；`upgrade-check §3.2` 已补游标说明。
- ⚠️ **待整改**：H10 措辞未统一（`normal`/`verify`/`prd/refine`/`prd/ship` 仍有免 probe 分支；
  `subagent-dispatch` 把免 probe 写成合法设计）→ 待重新裁定（倾向放宽 H10）；
  `assets/zh/adapters/hook-registration.md` 整份陈旧 → 重写或删；`upgrade-check.md` §3.2/§3.3 仍自相矛盾。
- ⚠️ `assets/zh/adapters/hook-registration.md`、`assets/zh/skills/README.md` 有陈旧引用。

## 已知陈旧项（勿踩）

- `assets/{zh,en}/commands/hotfix.md` 是死链桩（正文仅 `Use the polaris:hotfix skill.`，技能不存在）。
- 安装类测试 timeout 债：调 `installPolarisForPlatform`/`copyPolarisSkillsForPlatform` 的用例需 11~15s，
  必须 `{ timeout: 60_000 }`；`session-start.test.ts` 有同类未修。
- `assets/zh/skills/README.md` 引用不存在的 `delivery/`、`explore-router/`、`idea-discovery/`、`hard-stops.md`。
- `polaris.example.yaml`/`config.example.yaml`/`ask-question-react.md`/`subagent-probe/references/platform-probe.md`
  残留已移除平台的枚举。
- `src/core` 有存量 prettier/eslint 未过文件，提交前别被 CI 误伤。
- `deepread` 是死功能（配置段 + 模板在，全仓无实现）→ 待裁定。

## 工具环境坑

- 本机 BSD grep **不支持 `\|` 交替**（静默返回空 / 假阴性）→ 一律用 Grep 工具；`rg` 不在 PATH。
- 大范围审计可并行 subagent 分族深读，但**必须逐条回验**。

## 流程约定

- 双语言：技能先写中文，用户确认后再同步英文；**中英文未同步前不写 Changelog**。
- `task-init` 只建目录 + `state.yaml`，**不写 workflow 游标**；`append-active` 是独立 op。
- Qoder 在 0.1.0 已刻意移除，恢复属新决策。
- 落盘：测试族一律 `$REPO_ROOT/.polaris/testcases/<task_id>/`（勿用已退役的 `openspec/changes/<id>/test/`）。
